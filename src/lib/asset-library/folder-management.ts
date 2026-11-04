import type { PrismaClient, Prisma } from '@prisma/client'
import { folderPath, subtreeIds, validateFolderMove, materialClass } from './material-policy.ts'
import { lockFolderSpace } from '../asset-analysis/folders'
import { folderName } from '../asset-analysis/policy'

type Actor = { id: string; type: string }
type FolderInput = { name?: unknown; folderId?: unknown; parentId?: unknown; revision?: unknown; materialClass?: unknown }
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status })
function validatedName(value: unknown, standard = false) {
  try { return folderName(value, standard) } catch (e) { throw fail((e as Error).message, 400) }
}
function revision(body: { revision?: unknown }, current: number) {
  if (!Number.isInteger(body.revision) || body.revision !== current) throw fail('目录已发生变化，请刷新后重试')
}
async function audit(tx: Prisma.TransactionClient, brandId: string, actor: Actor, action: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { actorId: actor.id, actorType: actor.type, action, resourceType: 'BrandFolder', resourceId: brandId, metadata: JSON.parse(JSON.stringify({ brandId, before, after })) } })
}
export async function presentFolders(db: PrismaClient, brandId: string, canWrite: boolean) {
  const folders = await db.brandFolder.findMany({ where: { brandId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const counts = await db.mediaAsset.groupBy({ by: ['folderId', 'aiCategory'], where: { brandId }, _count: { _all: true } })
  const count = (id: string, name: string) => counts.filter(c => c.folderId === id || (!c.folderId && c.aiCategory === name)).reduce((s, c) => s + c._count._all, 0)
  return folders.map(folder => {
    const path = folderPath(folder, folders); const ids = subtreeIds(folder.id, folders)
    const assetCount = count(folder.id, folder.name)
    const hasChildren = folders.some(f => f.parentId === folder.id)
    return { ...folder, depth: path.length, path: path.map(f => f.name).join(' / '), section: path[0].folderKind === 'STANDARD' ? 'STANDARD' : 'CUSTOM', assetCount,
      subtreeAssetCount: folders.filter(f => ids.includes(f.id)).reduce((s, f) => s + count(f.id, f.name), 0),
      canCreateChild: canWrite && path.length < 3 && folder.materialClass !== 'UNCONFIRMED', canRename: canWrite,
      canMove: canWrite && folder.folderKind !== 'STANDARD' && folder.materialClass !== 'UNCONFIRMED', canDelete: canWrite && folder.folderKind !== 'STANDARD' && !assetCount && !hasChildren }
  })
}
export async function createFolder(db: PrismaClient, brandId: string, actor: Actor, body: FolderInput) {
  return db.$transaction(async tx => {
    await lockFolderSpace(tx, brandId)
    const name = validatedName(body.name); const folders = await tx.brandFolder.findMany({ where: { brandId } })
    const parent = body.parentId ? folders.find(f => f.id === body.parentId) : null
    if (body.parentId && !parent) throw fail('父目录不存在', 404)
    if (parent && folderPath(parent, folders).length >= 3) throw fail('目录最多三级')
    const category = parent ? materialClass(parent.materialClass) : materialClass(body.materialClass ?? 'MANUAL')
    if (!parent && !['MANUAL', 'AI'].includes(category)) throw fail('请选择人工加工或 AI 制作', 400)
    if (category === 'UNCONFIRMED') throw fail('请先整理父目录类别')
    const folder = await tx.brandFolder.create({ data: { brandId, parentId: parent?.id, name, materialClass: category, folderKind: 'CUSTOM' } })
    if (parent) await tx.brandFolder.update({ where: { id: parent.id }, data: { revision: { increment: 1 } } })
    await audit(tx, brandId, actor, 'ASSET_FOLDER_CREATED', null, folder); return folder
  })
}
export async function editFolder(db: PrismaClient, brandId: string, actor: Actor, body: FolderInput) {
  return db.$transaction(async tx => {
    await lockFolderSpace(tx, brandId)
    const folders = await tx.brandFolder.findMany({ where: { brandId } }); const existing = folders.find(f => f.id === body.folderId)
    if (!existing) throw fail('目录不存在', 404)
    revision(body, existing.revision)
    const data: Prisma.BrandFolderUpdateInput = { revision: { increment: 1 } }
    if (body.name !== undefined) data.name = validatedName(body.name, existing.folderKind === 'STANDARD')
    if (Object.hasOwn(body, 'parentId') && body.parentId !== existing.parentId) {
      if (body.parentId !== null && typeof body.parentId !== 'string') throw fail('父目录无效', 400)
      validateFolderMove(existing, body.parentId, folders)
      data.parent = body.parentId ? { connect: { id: body.parentId } } : { disconnect: true }
    }
    const updated = await tx.brandFolder.update({ where: { id: existing.id }, data })
    if (updated.name !== existing.name) await tx.mediaAsset.updateMany({ where: { brandId, OR: [{ folderId: existing.id }, { folderId: null, aiCategory: existing.name }] }, data: { folderId: existing.id, aiCategory: updated.name } })
    for (const id of new Set([existing.parentId, updated.parentId].filter((id): id is string => !!id))) {
      if (existing.parentId !== updated.parentId) await tx.brandFolder.update({ where: { id }, data: { revision: { increment: 1 } } })
    }
    await audit(tx, brandId, actor, 'ASSET_FOLDER_UPDATED', existing, updated); return updated
  })
}
export async function removeFolder(db: PrismaClient, brandId: string, actor: Actor, body: FolderInput) {
  return db.$transaction(async tx => {
    await lockFolderSpace(tx, brandId)
    const existing = await tx.brandFolder.findFirst({ where: { brandId, ...(typeof body.folderId === 'string' ? { id: body.folderId } : { name: typeof body.name === 'string' ? body.name : '' }) } })
    if (!existing) throw fail('目录不存在', 404)
    revision(body, existing.revision)
    if (existing.folderKind === 'STANDARD') throw fail('标准一级目录不可删除')
    const assets = await tx.mediaAsset.count({ where: { brandId, OR: [{ folderId: existing.id }, { folderId: null, aiCategory: existing.name }] } })
    const children = await tx.brandFolder.count({ where: { brandId, parentId: existing.id } })
    if (assets || children) throw fail('目录非空，请先移动素材和子目录')
    await tx.brandFolder.delete({ where: { id: existing.id } })
    if (existing.parentId) await tx.brandFolder.update({ where: { id: existing.parentId }, data: { revision: { increment: 1 } } })
    await audit(tx, brandId, actor, 'ASSET_FOLDER_DELETED', existing, null)
  })
}
