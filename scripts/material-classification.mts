import { readFile, writeFile, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isKnownAiAsset, materialClass, materialForm } from '../src/lib/asset-library/material-policy.ts'

// No database writes on the preview path. Labels are an explicit human-reviewed
// JSON array of { id, materialClass, materialForm? }, not filename heuristics.
const args = process.argv.slice(2)
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
if (args.includes('--help') || !args.length) {
  console.log('Preview: tsx scripts/material-classification.mts --brand ID --out preview.json [--labels labels.json]')
  console.log('Apply: tsx scripts/material-classification.mts --apply preview.json --digest SHA256 --actor ID --receipt receipt.json')
  console.log('Rollback: tsx scripts/material-classification.mts --rollback receipt.json --actor ID')
  process.exit(0)
}
const [{prisma}, {ensureFoldersInTransaction}, {canSessionWriteBrandProject}, {lockMaterialAssets, resolveMaterialFolder}] = await Promise.all([
  import('../src/lib/asset-analysis/db.ts'), import('../src/lib/asset-analysis/folders.ts'), import('../src/lib/brandAccess.ts'),
  import('../src/lib/asset-library/filing.ts'),
])
type State = { materialClass: string; materialForm: string; folderId: string | null; aiCategory: string | null }
type Entry = { id: string; sourceType: string; updatedAt: string; before: State; after: { materialClass: string; materialForm: string }; evidence: string }
type Preview = { version: 1; brandId: string; entries: Entry[] }
function restoredState(value: unknown): State {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved state')
  const state = value as Record<string, unknown>
  if (!(state.folderId === null || typeof state.folderId === 'string') || !(state.aiCategory === null || typeof state.aiCategory === 'string')) throw new Error('Invalid saved folder state')
  return { materialClass: materialClass(state.materialClass), materialForm: materialForm(state.materialForm), folderId: state.folderId, aiCategory: state.aiCategory }
}
try {
  if (args.includes('--help') || !args.length) {
    console.log('Preview: tsx scripts/material-classification.mts --brand ID --out preview.json [--labels labels.json]')
    console.log('Apply:   tsx scripts/material-classification.mts --apply preview.json --digest SHA256 --actor ID --receipt receipt.json')
    console.log('Rollback: tsx scripts/material-classification.mts --rollback receipt.json --actor ID')
  } else if (option('--apply') || option('--rollback')) {
    const rollback = !!option('--rollback')
    const source = JSON.parse(await readFile((option('--rollback') || option('--apply'))!, 'utf8'))
    if (source.version !== 1 || typeof source.brandId !== 'string' || !Array.isArray(source.entries) || source.entries.some((entry: Entry) => !entry || typeof entry.id !== 'string') || new Set(source.entries.map((entry: Entry) => entry.id)).size !== source.entries.length) throw new Error('Invalid classification report')
    if (!rollback && digest(source) !== option('--digest')) throw new Error('Preview digest does not match')
    const actorId = option('--actor')
    if (!actorId || !await canSessionWriteBrandProject(source.brandId, actorId, 'HUMAN')) throw new Error('A current brand writer is required')
    if (!rollback && !option('--receipt')) throw new Error('--receipt is required before applying')
    if (!rollback) { const handle = await open(option('--receipt')!, 'wx'); await handle.writeFile(JSON.stringify({ status: 'prepared; consult MATERIAL_CLASSIFICATION_APPLY audit if interrupted', brandId: source.brandId })); await handle.close() }
    const receipt = await prisma.$transaction(async tx => {
      await ensureFoldersInTransaction(tx, source.brandId)
      await lockMaterialAssets(tx, source.brandId, source.entries.map((entry: Entry) => entry.id))
      const applied = []
      for (const entry of source.entries) {
        const current = await tx.mediaAsset.findFirst({ where: { id: entry.id, brandId: source.brandId } })
        const expectedDate = rollback ? entry.appliedAt : entry.updatedAt
        if (!current || current.updatedAt.toISOString() !== expectedDate) throw new Error(`Asset changed: ${entry.id}; no updates committed`)
        if (rollback) {
          const before = restoredState(entry.before)
          if (isKnownAiAsset(current) && !['AI', 'UNCONFIRMED'].includes(before.materialClass)) throw new Error('Cannot restore a known AI asset as original or human edited')
          if (before.folderId && !await tx.brandFolder.findFirst({ where: { id: before.folderId, brandId: source.brandId } })) throw new Error(`Original folder is missing: ${entry.id}`)
          await tx.mediaAsset.update({ where: { id: entry.id }, data: before })
        } else {
          if (isKnownAiAsset(current) && entry.after.materialClass !== 'AI') throw new Error('Known AI assets must remain AI')
          const category = materialClass(entry.after.materialClass)
          const existingFolder = current.folderId ? await tx.brandFolder.findFirst({ where: { id: current.folderId, brandId: source.brandId, materialClass: category } }) : null
          const folder = existingFolder || await resolveMaterialFolder(tx, source.brandId, {}, category)
          const updated = await tx.mediaAsset.update({ where: { id: entry.id }, data: { materialClass: category, materialForm: materialForm(entry.after.materialForm), folderId: folder?.id || null, aiCategory: folder?.name || '素材库' } })
          applied.push({ ...entry, appliedAt: updated.updatedAt.toISOString(), actualAfter: { materialClass: updated.materialClass, materialForm: updated.materialForm, folderId: updated.folderId, aiCategory: updated.aiCategory } })
        }
      }
      const receipt = { version: 1, brandId: source.brandId, previewDigest: digest(source), entries: applied }
      await tx.auditLog.create({ data: { actorId, actorType: 'HUMAN', action: rollback ? 'MATERIAL_CLASSIFICATION_ROLLBACK' : 'MATERIAL_CLASSIFICATION_APPLY', resourceType: 'MediaAsset', resourceId: source.brandId, metadata: JSON.parse(JSON.stringify(rollback ? { receiptDigest: digest(source), restored: source.entries.length } : receipt)) } })
      return receipt
    }, { timeout: 60_000 })
    if (!rollback) await writeFile(option('--receipt')!, JSON.stringify(receipt, null, 2))
    console.log(JSON.stringify({ action: rollback ? 'rollback' : 'apply', count: source.entries.length, brandId: source.brandId }))
  } else {
    const brandId = option('--brand'), output = option('--out')
    if (!brandId || !output) throw new Error('--brand and --out are required')
    const labels: Array<{ id: string; materialClass: string; materialForm?: string }> = option('--labels') ? JSON.parse(await readFile(option('--labels')!, 'utf8')) : []
    if (!Array.isArray(labels) || new Set(labels.map(l => l.id)).size !== labels.length) throw new Error('Labels must contain unique asset IDs')
    const assets = await prisma.mediaAsset.findMany({ where: { brandId }, orderBy: { id: 'asc' } })
    if (labels.some(label => !assets.some(a => a.id === label.id))) throw new Error('Labels contain an asset outside this brand')
    const folders = await prisma.brandFolder.findMany({ where: { brandId } })
    const preview: Preview = { version: 1, brandId, entries: [] }
    for (const asset of assets) {
      const label = labels.find(l => l.id === asset.id)
      const category = isKnownAiAsset(asset) ? 'AI' : label ? materialClass(label.materialClass) : asset.materialClass
      const form = label?.materialForm ? materialForm(label.materialForm) : ['generated_video', 'ai_video_final'].includes(asset.sourceType) ? 'FINISHED' : asset.materialForm
      const currentFolder = folders.find(f => f.id === asset.folderId || (!asset.folderId && f.name === asset.aiCategory))
      const expectedClass = currentFolder?.folderKind === 'STANDARD' ? 'ORIGINAL' : currentFolder?.materialClass
      const inconsistentFolder = !!currentFolder && expectedClass !== category
      if (category === asset.materialClass && form === asset.materialForm && !inconsistentFolder) continue
      preview.entries.push({ id: asset.id, sourceType: asset.sourceType, updatedAt: asset.updatedAt.toISOString(), before: { materialClass: asset.materialClass, materialForm: asset.materialForm, folderId: asset.folderId, aiCategory: asset.aiCategory }, after: { materialClass: category, materialForm: form }, evidence: isKnownAiAsset(asset) ? 'known_generation_entry' : label ? 'human_reviewed_label' : 'inconsistent_folder_requires_review' })
    }
    await writeFile(output, JSON.stringify(preview, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ action: 'preview', brandId, total: assets.length, changes: preview.entries.length, unconfirmed: assets.filter(a => a.materialClass === 'UNCONFIRMED' && !preview.entries.some(e => e.id === a.id)).length, digest: digest(preview) }))
  }
} finally { await prisma.$disconnect() }
