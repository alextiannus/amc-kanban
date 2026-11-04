import { Prisma, type PrismaClient } from '@prisma/client'
import { COVER_MIMES } from './cover-policy'
import { subtreeIds } from './material-policy'
import { lockMaterialAssets, updateAssetFiling } from './filing'
import { lockFolderSpace } from '../asset-analysis/folders'

export type CoverPreview = { version: 1; brandId: string; totalCandidates?: number; entries: Array<{ id: string; filename: string | null; folderId: string | null; aiCategory: string | null; materialClass: string; isCoverMaterial: boolean; updatedAt: string; evidence: string[] }> }
const fail = (message: string) => Object.assign(new Error(message), { status: 409 })
export async function previewCoverBackfill(db: PrismaClient, brandId: string): Promise<CoverPreview> {
  if (!await db.brand.findFirst({ where: { id: brandId }, select: { id: true } })) throw fail('品牌不存在')
  const [folders, drafts, assets] = await Promise.all([
    db.brandFolder.findMany({ where: { brandId } }),
    db.contentDraft.findMany({ where: { brandId, coverAssetId: { not: null } }, select: { id: true, coverAssetId: true } }),
    db.mediaAsset.findMany({ where: { brandId, mimeType: { in: COVER_MIMES, mode: 'insensitive' } }, select: { id: true, filename: true, folderId: true, aiCategory: true, materialClass: true, isCoverMaterial: true, manualOverrides: true, updatedAt: true } }),
  ])
  const legacy = folders.filter(f => ['封面图', '封面素材'].includes(f.name))
  const ids = new Set(legacy.flatMap(f => subtreeIds(f.id, folders)))
  const candidates = assets.flatMap(a => {
    const evidence = [...(a.folderId && ids.has(a.folderId) || !a.folderId && ['封面图', '封面素材'].includes(a.aiCategory || '') ? ['旧封面目录'] : []), ...drafts.filter(d => d.coverAssetId === a.id).map(d => `草稿封面:${d.id}`)]
    return !a.isCoverMaterial && !(a.manualOverrides as Record<string, unknown> | null)?.isCoverMaterial && evidence.length ? [{ ...a, updatedAt: a.updatedAt.toISOString(), evidence }] : []
  })
  return { version: 1, brandId, totalCandidates: candidates.length, entries: candidates.slice(0, 500) }
}
export async function applyCoverBackfill(db: PrismaClient, preview: CoverPreview, actor: { id: string; type: string }) {
  if (preview.version !== 1 || !preview.brandId || !Array.isArray(preview.entries) || !preview.entries.length || preview.entries.some(a => a.isCoverMaterial !== false || !a.evidence?.length)) throw fail('回填预览无效或没有待更新素材')
  const receipt: { id?: string } = {}
  const assets = await updateAssetFiling(db, preview.brandId, actor, preview.entries.map(a => a.id), { isCoverMaterial: true, revisions: Object.fromEntries(preview.entries.map(a => [a.id, a.updatedAt])) }, receipt)
  return { version: 1, brandId: preview.brandId, receiptId: receipt.id!, updated: assets.length }
}
export async function rollbackCoverBackfill(db: PrismaClient, brandId: string, receiptId: string, actor: { id: string; type: string }) {
  return db.$transaction(async tx => {
    await lockFolderSpace(tx, brandId)
    const audit = await tx.auditLog.findFirst({ where: { id: receiptId, actorId: actor.id, resourceId: brandId, action: 'ASSET_COVER_PURPOSE_UPDATED' } })
    const data = audit?.metadata as { before?: Array<{ id: string; isCoverMaterial: boolean; manualOverrides?: Prisma.InputJsonValue | null }>; after?: Array<{ id: string; isCoverMaterial: boolean; updatedAt: string }> } | null
    if (!data?.before?.length || !data.after || data.before.length !== data.after.length) throw fail('有效回填回执不存在')
    await lockMaterialAssets(tx, brandId, data.before.map(a => a.id))
    const assets = await tx.mediaAsset.findMany({ where: { brandId, id: { in: data.before.map(a => a.id) } } })
    if (assets.length !== data.before.length) throw fail('部分素材已删除，不能回滚')
    for (const asset of assets) {
      const before = data.before.find(a => a.id === asset.id)!, after = data.after.find(a => a.id === asset.id)
      if (!after || asset.isCoverMaterial !== after.isCoverMaterial || asset.updatedAt.toISOString() !== after.updatedAt) throw fail('素材已被修改，不能直接回滚')
      await tx.mediaAsset.update({ where: { id: asset.id }, data: { isCoverMaterial: before.isCoverMaterial, manualOverrides: before.manualOverrides ?? Prisma.DbNull } })
    }
    await tx.auditLog.create({ data: { actorId: actor.id, actorType: actor.type, action: 'ASSET_COVER_BACKFILL_ROLLED_BACK', resourceType: 'MediaAsset', resourceId: brandId, metadata: { receiptId } } })
    return { restored: assets.length }
  }, { timeout: 30000 })
}
