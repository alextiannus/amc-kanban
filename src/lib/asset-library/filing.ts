import type { Prisma, PrismaClient } from '@prisma/client'
import { materialClass, materialForm, assertClassChange, isAiSource } from './material-policy.ts'
import { ensureFoldersInTransaction } from '../asset-analysis/folders'

type Db = PrismaClient
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status })
export async function resolveMaterialFolder(tx: Prisma.TransactionClient, brandId: string, body: Record<string, unknown>, category: string) {
  const requested = typeof body.folderId === 'string' && body.folderId ? { id: body.folderId } : typeof body.folder === 'string' && body.folder && body.folder !== '素材库' ? { name: body.folder } : typeof body.aiCategory === 'string' && body.aiCategory && body.aiCategory !== '素材库' ? { name: body.aiCategory } : null
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
export async function createClassifiedAsset(db: Db, brandId: string, body: Record<string, unknown>, data: Prisma.MediaAssetUncheckedCreateInput) {
  return db.$transaction(async tx => {
    await ensureFoldersInTransaction(tx, brandId)
    if (data.id) {
      const existing = await tx.mediaAsset.findUnique({ where: { id: data.id } })
      if (existing) {
        if (existing.brandId !== brandId || existing.url !== data.url) throw fail('素材标识已被其他文件使用')
        return existing
      }
    }
    const category = isAiSource(data.sourceType) ? 'AI' : materialClass(body.materialClass ?? 'UNCONFIRMED')
    const folder = await resolveMaterialFolder(tx, brandId, body, category)
    return tx.mediaAsset.create({ data: { ...data, brandId, materialClass: category, materialForm: materialForm(body.materialForm ?? 'UNKNOWN'), folderId: folder?.id || null, aiCategory: folder?.name || '素材库' } })
  }, { timeout: 30_000 })
}
export async function updateAssetFiling(db: Db, brandId: string, actor: { id: string; type: string }, assetIds: string[], body: Record<string, unknown>) {
  if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > 500 || assetIds.some(id => typeof id !== 'string') || new Set(assetIds).size !== assetIds.length) throw fail('请选择有效素材', 400)
  return db.$transaction(async tx => {
    await ensureFoldersInTransaction(tx, brandId)
    const assets = await tx.mediaAsset.findMany({ where: { brandId, id: { in: assetIds } } })
    if (assets.length !== assetIds.length) throw fail('素材不存在或不属于当前品牌', 404)
    const requested = body.folderId !== undefined || body.folder !== undefined || body.aiCategory !== undefined
    const wantsFiling = requested || body.materialClass !== undefined
    const updates = []
    for (const asset of assets) {
      if (body.revision !== undefined && body.revision !== asset.updatedAt.toISOString()) throw fail('素材已被修改，请刷新后重试')
      let category = body.materialClass !== undefined ? materialClass(body.materialClass) : asset.materialClass
      let folder = null
      if (wantsFiling) {
        if (requested && body.materialClass === undefined) {
          const target = await tx.brandFolder.findFirst({ where: { brandId, ...(typeof body.folderId === 'string' ? { id: body.folderId } : { name: typeof body.folder === 'string' ? body.folder : typeof body.aiCategory === 'string' ? body.aiCategory : '' }) } })
          if (target) category = target.materialClass
        }
        assertClassChange(asset.materialClass, category, body.confirmMaterialClassChange, asset.sourceType)
        folder = await resolveMaterialFolder(tx, brandId, { ...body, materialClass: category }, category)
      }
      const priorAnalysis = asset.imageAnalysis && typeof asset.imageAnalysis === 'object' && !Array.isArray(asset.imageAnalysis) ? asset.imageAnalysis : {}
      const priorOverrides = asset.manualOverrides && typeof asset.manualOverrides === 'object' && !Array.isArray(asset.manualOverrides) ? asset.manualOverrides : {}
      const tags = Array.isArray(body.appendTags) ? [...new Set([...asset.aiTags, ...body.appendTags.filter((t: unknown) => typeof t === 'string')])]
        : Array.isArray(body.aiTags) ? body.aiTags.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean) : undefined
      const updated = await tx.mediaAsset.update({ where: { id: asset.id }, data: {
        ...(wantsFiling ? { materialClass: category, folderId: folder?.id || null, aiCategory: folder?.name || '素材库', manualOverrides: { ...priorOverrides, folder: true, materialClass: true } } : {}),
        ...(body.materialForm !== undefined ? { materialForm: materialForm(body.materialForm) } : {}),
        ...(typeof body.filename === 'string' ? { filename: body.filename.trim() || null } : {}),
        ...(typeof body.aiCaption === 'string' ? { aiCaption: body.aiCaption.trim() || null } : {}),
        ...(tags ? { aiTags: tags } : {}), ...(typeof body.aiReady === 'boolean' ? { aiReady: body.aiReady } : {}),
        ...(typeof body.creativeId === 'string' ? { creativeId: body.creativeId.trim() || null } : {}),
        ...(tags || typeof body.aiCaption === 'string' ? { imageAnalysis: { ...priorAnalysis, ...(tags ? { tagsEdited: true, generatedTags: [] } : {}), ...(typeof body.aiCaption === 'string' ? { captionEdited: true } : {}) } } : {}),
      } })
      updates.push(updated)
    }
    if (wantsFiling || body.materialForm !== undefined) await tx.auditLog.create({ data: { actorId: actor.id, actorType: actor.type, action: 'ASSET_FILING_UPDATED', resourceType: 'MediaAsset', resourceId: brandId, metadata: {
      brandId, before: assets.map(a => ({ id: a.id, folderId: a.folderId, aiCategory: a.aiCategory, materialClass: a.materialClass, materialForm: a.materialForm })),
      after: updates.map(a => ({ id: a.id, folderId: a.folderId, aiCategory: a.aiCategory, materialClass: a.materialClass, materialForm: a.materialForm })),
    } } })
    return updates
  }, { timeout: 30_000 })
}
export function filingError(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string }
  return { body: { error: e.message || '素材更新失败', code: e.code }, status: e.status || (e.code === 'P2034' ? 409 : 500) }
}
