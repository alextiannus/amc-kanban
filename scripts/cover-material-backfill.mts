import { readFile, writeFile, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const arg = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
if (!args.length || args.includes('--help')) {
  console.log('Preview (read only): tsx scripts/cover-material-backfill.mts --brand ID --out preview.json')
  console.log('Apply: tsx scripts/cover-material-backfill.mts --apply preview.json --digest SHA256 --actor ID --receipt receipt.json')
  console.log('Rollback: tsx scripts/cover-material-backfill.mts --rollback receipt.json --actor ID')
  process.exit(0)
}
const [{ prisma }, service, access] = await Promise.all([import('../src/lib/asset-analysis/db.ts'), import('../src/lib/asset-library/cover-history.ts'), import('../src/lib/brandAccess.ts')])
try {
  if (arg('--apply') || arg('--rollback')) {
    const actorId = arg('--actor')
    if (!actorId) throw new Error('--actor is required')
    const source = JSON.parse(await readFile((arg('--apply') || arg('--rollback'))!, 'utf8'))
    if (!source.brandId || source.version !== 1 || !await access.canSessionWriteBrandProject(source.brandId, actorId, 'HUMAN')) throw new Error('Invalid receipt or actor lacks brand write permission')
    const actor = { id: actorId, type: 'HUMAN' }
    if (arg('--rollback')) {
      if (source.state !== 'committed' || !source.receiptId) throw new Error('A committed receipt is required')
      console.log(JSON.stringify(await service.rollbackCoverBackfill(prisma, source.brandId, source.receiptId, actor)))
    } else {
      if (!arg('--digest') || digest(source) !== arg('--digest')) throw new Error('Preview digest mismatch')
      const file = arg('--receipt')
      if (!file) throw new Error('--receipt is required')
      const prepared = await open(file, 'wx')
      await prepared.writeFile(JSON.stringify({ state: 'prepared', brandId: source.brandId, digest: digest(source) }, null, 2)); await prepared.close()
      const result = await service.applyCoverBackfill(prisma, source, actor)
      await writeFile(file, JSON.stringify({ ...result, state: 'committed', digest: digest(source) }, null, 2))
      console.log(JSON.stringify(result))
    }
  } else {
    if (!arg('--brand') || !arg('--out')) throw new Error('--brand and --out are required')
    const preview = await service.previewCoverBackfill(prisma, arg('--brand')!)
    await writeFile(arg('--out')!, JSON.stringify(preview, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ brandId: preview.brandId, candidates: preview.entries.length, totalCandidates: preview.totalCandidates, digest: digest(preview) }))
  }
} finally { await prisma.$disconnect() }
