import type { Prisma, PrismaClient, MediaAsset } from '@prisma/client'
import { COVER_MIMES, assertCoverMedia } from './cover-policy'

export async function verifyCoverAsset(asset: Pick<MediaAsset, 'url' | 'mimeType' | 'technicalMetadata' | 'filename' | 'sourceType' | 'sizeBytes'>) {
  if (!COVER_MIMES.includes(asset.mimeType.toLowerCase())) assertCoverMedia(asset.mimeType, null)
  let metadata = asset.technicalMetadata as { kind?: string; mimeType?: string; sizeBytes?: number } | null
  if (!metadata?.kind || !metadata.mimeType || !metadata.sizeBytes) {
    const { inspectStoredMedia } = await import('../publishMediaValidation')
    try { metadata = await inspectStoredMedia(asset) }
    catch { throw Object.assign(new Error('无法核实原图片格式，请检查原文件后重试'), { status: 422 }) }
  }
  assertCoverMedia(asset.mimeType, metadata)
}
export async function prepareCoverAssets(db: PrismaClient, brandId: string, ids: string[]) {
  const assets = await db.mediaAsset.findMany({ where: { brandId, id: { in: ids } } })
  if (assets.length !== ids.length) throw Object.assign(new Error('素材不存在或不属于当前品牌'), { status: 404 })
  // Inspect legacy sources outside the transaction, then check their versions
  // again under row locks before marking or committing a draft.
  for (let i = 0; i < assets.length; i += 4) await Promise.all(assets.slice(i, i + 4).map(verifyCoverAsset))
  return assets
}
export async function markDraftCover(tx: Prisma.TransactionClient, brandId: string, actor: { id: string; type: string }, proof: MediaAsset, draftId: string) {
  await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE "brandId" = ${brandId} AND id = ${proof.id} FOR UPDATE`
  const asset = await tx.mediaAsset.findFirst({ where: { brandId, id: proof.id } })
  if (!asset || asset.url !== proof.url || asset.mimeType !== proof.mimeType || asset.sizeBytes !== proof.sizeBytes) throw Object.assign(new Error('封面图片已变化，请刷新草稿后重试'), { status: 409 })
  if (JSON.stringify(asset.technicalMetadata) !== JSON.stringify(proof.technicalMetadata)) assertCoverMedia(asset.mimeType, asset.technicalMetadata)
  if (asset.isCoverMaterial) return
  const purposeOverride = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).isCoverMaterial : undefined
  // Publishing may update usage counters before this hook. Only a competing
  // purpose decision (or changed source above) invalidates this independent mark.
  if (asset.updatedAt.toISOString() !== proof.updatedAt.toISOString() && (asset.isCoverMaterial !== proof.isCoverMaterial || purposeOverride(asset.manualOverrides) !== purposeOverride(proof.manualOverrides))) throw Object.assign(new Error('封面图片已变化，请刷新草稿后重试'), { status: 409 })
  await tx.mediaAsset.update({ where: { id: asset.id }, data: { isCoverMaterial: true, manualOverrides: { ...(asset.manualOverrides && typeof asset.manualOverrides === 'object' && !Array.isArray(asset.manualOverrides) ? asset.manualOverrides : {}), isCoverMaterial: true } } })
  await tx.auditLog.create({ data: { actorId: actor.id, actorType: actor.type, action: 'ASSET_COVER_PURPOSE_UPDATED', resourceType: 'MediaAsset', resourceId: asset.id, metadata: { brandId, draftId, before: false, after: true } } })
}
