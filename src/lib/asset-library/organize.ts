import { Prisma, type PrismaClient } from '@prisma/client'
import { lockFolderSpace } from '../asset-analysis/folders'
import { lockMaterialAssets } from './filing'
import { isKnownAiAsset } from './material-policy'

type Snapshot = { id: string; folderId: string | null; aiCategory: string | null; materialClass: string; materialForm: string; manualOverrides: Prisma.InputJsonValue | null; updatedAt: string }
const fail = (message: string) => Object.assign(new Error(message), { status: 409 })
export async function rollbackOrganization(db: PrismaClient, brandId: string, actor: { id: string; type: string }, receiptId: string) {
  return db.$transaction(async tx => {
    await lockFolderSpace(tx, brandId)
    const log = await tx.auditLog.findFirst({ where: { id: receiptId, resourceId: brandId, actorId: actor.id, action: 'ASSET_FILING_UPDATED' } })
    const data = log?.metadata as { before?: Snapshot[]; after?: Snapshot[] } | null
    if (!data?.before?.length || !data.after?.length) throw fail('整理回执不存在')
    const before = data.before, after = data.after
    await lockMaterialAssets(tx, brandId, before.map(a => a.id))
    const assets = await tx.mediaAsset.findMany({ where: { brandId, id: { in: before.map(a => a.id) } } })
    if (assets.length !== before.length) throw fail('部分素材已删除，不能撤销')
    for (const asset of assets) {
      const previous = before.find(a => a.id === asset.id)!, applied = after.find(a => a.id === asset.id)
      if (asset.updatedAt.toISOString() !== applied?.updatedAt) throw fail('素材已被修改，不能直接撤销')
      if (isKnownAiAsset(asset) && !['AI', 'UNCONFIRMED'].includes(previous.materialClass)) throw fail('AI 来源证据已变化，不能恢复为原始或人工加工')
      const folder = previous.folderId ? await tx.brandFolder.findFirst({ where: { id: previous.folderId, brandId } }) : null
      if (previous.folderId && !folder) throw fail('原目录已删除，不能撤销')
      await tx.mediaAsset.update({ where: { id: asset.id }, data: { folderId: previous.folderId, aiCategory: folder?.name || previous.aiCategory, materialClass: previous.materialClass, materialForm: previous.materialForm, manualOverrides: previous.manualOverrides ?? Prisma.DbNull } })
    }
    await tx.auditLog.create({ data: { actorId: actor.id, actorType: actor.type, action: 'ASSET_ORGANIZATION_ROLLED_BACK', resourceType: 'MediaAsset', resourceId: brandId, metadata: { receiptId, before: after, after: before } as unknown as Prisma.InputJsonValue } })
    return { restored: before.length }
  }, { timeout: 30000 })
}
