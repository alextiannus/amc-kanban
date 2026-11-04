import type { Prisma, PrismaClient } from '@prisma/client'
import { materialClass, materialForm, assertClassChange, isAiSource, isKnownAiAsset, requestedFolderTarget } from './material-policy.ts'
import { ensureFoldersInTransaction } from '../asset-analysis/folders'

type Db = PrismaClient
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status })
// Brand locking serializes tree changes; asset row locks also coordinate with
// publishers and other writers that do not take the folder namespace lock.
export async function lockMaterialAssets(tx: Prisma.TransactionClient, brandId: string, assetIds: string[]) {
  if (assetIds.length) await tx.$queryRaw`SELECT id FROM "MediaAsset" WHERE "brandId" = ${brandId} AND id = ANY(${assetIds}::text[]) ORDER BY id FOR UPDATE`
}
export async function resolveMaterialFolder(tx: Prisma.TransactionClient, brandId: string, body: Record<string, unknown>, category: string) {
  const requested = requestedFolderTarget(body)
  const folder = requested ? await tx.brandFolder.findFirst({ where: { brandId, ...requested } }) : null
  if (requested && !folder) throw fail('目录不存在', 404)
  if (folder && folder.materialClass === category) return folder
  if (folder && body.materialClass !== undefined) throw fail('目录与素材类别不一致，请重新选择目录')
  const systemKey = category === 'ORIGINAL' ? 'needs_review' : category === 'MANUAL' ? 'processed_manual' : category === 'AI' ? 'processed_ai' : null
  if (!systemKey) return null
  const defaultFolder = await tx.brandFolder.findUnique({ where: { brandId_systemKey: { brandId, systemKey } } })
  if (defaultFolder) return defaultFolder
  // A user may delete an empty processed default. New assets still need a valid home.
  const replacement = await tx.brandFolder.findFirst({ where: { brandId, materialClass: category, parentId: null } })
  if (replacement) return replacement
  const name = category === 'AI' ? 'AI 制作' : '人工剪辑'
  const collision = await tx.brandFolder.findUnique({ where: { brandId_name: { brandId, name } } })
  return tx.brandFolder.create({ data: { brandId, name: collision ? `${name} (${systemKey})` : name, systemKey, materialClass: category } })
}
export async function createClassifiedAsset(db: Db, brandId: string, body: Record<string, unknown>, data: Prisma.MediaAssetUncheckedCreateInput, options: { knownAiGenerated?: boolean } = {}) {
  return db.$transaction(async tx => {
    await ensureFoldersInTransaction(tx, brandId)
    if (data.id) {
      const existing = await tx.mediaAsset.findUnique({ where: { id: data.id } })
      if (existing) {
        if (existing.brandId !== brandId || existing.url !== data.url) throw fail('素材标识已被其他文件使用')
        return existing
      }
    }
    const generated = options.knownAiGenerated === true || isAiSource(data.sourceType)
    const category = generated ? 'AI' : materialClass(body.materialClass ?? 'UNCONFIRMED')
    const folder = await resolveMaterialFolder(tx, brandId, body, category)
    const priorMetadata = data.technicalMetadata && typeof data.technicalMetadata === 'object' && !Array.isArray(data.technicalMetadata) ? data.technicalMetadata as Prisma.InputJsonObject : {}
    return tx.mediaAsset.create({ data: { ...data, ...(generated ? { technicalMetadata: { ...priorMetadata, materialProvenance: { origin: 'AI_GENERATION' } } } : {}), brandId, materialClass: category, materialForm: materialForm(body.materialForm ?? 'UNKNOWN'), folderId: folder?.id || null, aiCategory: folder?.name || '素材库' } })
  }, { timeout: 30_000 })
}
export async function updateAssetFiling(db: Db, brandId: string, actor: { id: string; type: string }, assetIds: string[], body: Record<string, unknown>, receipt?: { id?: string }) {
  if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > 500 || assetIds.some(id => typeof id !== 'string') || new Set(assetIds).size !== assetIds.length) throw fail('请选择有效素材', 400)
  return db.$transaction(async tx => {
    await ensureFoldersInTransaction(tx, brandId)
    await lockMaterialAssets(tx, brandId, assetIds)
    const assets = await tx.mediaAsset.findMany({ where: { brandId, id: { in: assetIds } } })
    if (assets.length !== assetIds.length) throw fail('素材不存在或不属于当前品牌', 404)
    const requested = body.folderId !== undefined || body.folder !== undefined || body.aiCategory !== undefined
    const wantsFiling = requested || body.materialClass !== undefined
    const updates = []
    for (const asset of assets) {
      if (body.revisions !== undefined) {
        if (!body.revisions || typeof body.revisions !== 'object' || Array.isArray(body.revisions) || (body.revisions as Record<string, unknown>)[asset.id] !== asset.updatedAt.toISOString()) throw fail('素材已被修改，请刷新预览后重试')
      }
      if (body.revision !== undefined && body.revision !== asset.updatedAt.toISOString()) throw fail('素材已被修改，请刷新后重试')
      let category = body.materialClass !== undefined ? materialClass(body.materialClass) : asset.materialClass
      let folder = null
      let movesFolder = false
      if (wantsFiling) {
        if (requested && body.materialClass === undefined) {
          const targetFilter = requestedFolderTarget(body)
          const target = targetFilter ? await tx.brandFolder.findFirst({ where: { brandId, ...targetFilter } }) : null
          if (target) category = target.materialClass
        }
        assertClassChange(asset.materialClass, category, body.confirmMaterialClassChange, asset.sourceType, isKnownAiAsset(asset))
        movesFolder = requested || category !== asset.materialClass
        if (movesFolder) folder = await resolveMaterialFolder(tx, brandId, { ...body, materialClass: category }, category)
      }
      const priorAnalysis = asset.imageAnalysis && typeof asset.imageAnalysis === 'object' && !Array.isArray(asset.imageAnalysis) ? asset.imageAnalysis : {}
      const priorOverrides = asset.manualOverrides && typeof asset.manualOverrides === 'object' && !Array.isArray(asset.manualOverrides) ? asset.manualOverrides : {}
      const tags = Array.isArray(body.appendTags) ? [...new Set([...asset.aiTags, ...body.appendTags.filter((t: unknown) => typeof t === 'string')])]
        : Array.isArray(body.aiTags) ? body.aiTags.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean) : undefined
      const updated = await tx.mediaAsset.update({ where: { id: asset.id }, data: {
        ...(wantsFiling ? { materialClass: category, ...(movesFolder ? { folderId: folder?.id || null, aiCategory: folder?.name || '素材库' } : {}), manualOverrides: { ...priorOverrides, ...(movesFolder ? { folder: true } : {}), materialClass: true } } : {}),
        ...(body.materialForm !== undefined ? { materialForm: materialForm(body.materialForm) } : {}),
        ...(typeof body.filename === 'string' ? { filename: body.filename.trim() || null } : {}),
        ...(typeof body.aiCaption === 'string' ? { aiCaption: body.aiCaption.trim() || null } : {}),
        ...(tags ? { aiTags: tags } : {}), ...(typeof body.aiReady === 'boolean' ? { aiReady: body.aiReady } : {}),
        ...(typeof body.creativeId === 'string' ? { creativeId: body.creativeId.trim() || null } : {}),
        ...(tags || typeof body.aiCaption === 'string' ? { imageAnalysis: { ...priorAnalysis, ...(tags ? { tagsEdited: true, generatedTags: [] } : {}), ...(typeof body.aiCaption === 'string' ? { captionEdited: true } : {}) } } : {}),
      } })
      updates.push(updated)
    }
    if (wantsFiling || body.materialForm !== undefined) { const log = await tx.auditLog.create({ data: { actorId: actor.id, actorType: actor.type, action: 'ASSET_FILING_UPDATED', resourceType: 'MediaAsset', resourceId: brandId, metadata: {
      brandId, before: assets.map(a => ({ id: a.id, folderId: a.folderId, aiCategory: a.aiCategory, materialClass: a.materialClass, materialForm: a.materialForm, manualOverrides: a.manualOverrides, updatedAt: a.updatedAt.toISOString() })),
      after: updates.map(a => ({ id: a.id, folderId: a.folderId, aiCategory: a.aiCategory, materialClass: a.materialClass, materialForm: a.materialForm, updatedAt: a.updatedAt.toISOString() })),
    } } }); if (receipt) receipt.id = log.id }
    return updates
  }, { timeout: 30_000 })
}
export function filingError(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string }
  return { body: { error: e.message || '素材更新失败', code: e.code }, status: e.status || (e.code === 'P2034' ? 409 : 500) }
}
