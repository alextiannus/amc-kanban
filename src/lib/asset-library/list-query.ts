import type { Prisma } from '@prisma/client'
import { materialClass, materialForm, subtreeIds, type FolderNode } from './material-policy'

const invalid = () => { throw Object.assign(new Error('素材筛选参数无效'), { status: 400 }) }
export function assetListQuery(params: URLSearchParams, brandIds: string[], folders: FolderNode[], now = new Date()) {
  const paginated = params.has('page')
  const page = Number(params.get('page') || 1), pageSize = Number(params.get('pageSize') || 24)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) invalid()
  const where: Prisma.MediaAssetWhereInput = { brandId: { in: brandIds } }
  const and: Prisma.MediaAssetWhereInput[] = []
  const category = params.get('materialClass') || params.get('root')
  if (category) where.materialClass = materialClass(category)
  const id = params.get('folderId')
  if (id) {
    const folder = folders.find(f => f.id === id)
    if (!folder) throw Object.assign(new Error('目录不存在'), { status: 404 })
    const ids = params.get('includeDescendants') === 'false' ? [id] : subtreeIds(id, folders)
    and.push({ OR: [{ folderId: { in: ids } }, { folderId: null, aiCategory: { in: folders.filter(f => ids.includes(f.id)).map(f => f.name) } }] })
  }
  const q = params.get('q')?.trim()
  if (q) and.push({ OR: [{ filename: { contains: q, mode: 'insensitive' } }, { originalFilename: { contains: q, mode: 'insensitive' } }, { aiCaption: { contains: q, mode: 'insensitive' } }, { aiTags: { has: q } }, { uploadedBy: { contains: q, mode: 'insensitive' } }, { videoProjectId: { contains: q, mode: 'insensitive' } }, { shootBatch: { is: { name: { contains: q, mode: 'insensitive' } } } }] })
  const kind = params.get('assetType') || 'all'
  if (!['all', 'image', 'video'].includes(kind)) invalid()
  if (kind !== 'all') where.mimeType = { startsWith: `${kind}/` }
  const usage = params.get('usage') || 'all'
  if (!['all', 'unused', 'used'].includes(usage)) invalid()
  if (usage !== 'all') where.usedCount = usage === 'unused' ? 0 : { gt: 0 }
  const since = params.get('since') || 'all'
  if (!['all', '7', '30'].includes(since)) invalid()
  if (since !== 'all') where.createdAt = { gte: new Date(now.getTime() - Number(since) * 86400000) }
  if (params.get('materialForm')) where.materialForm = materialForm(params.get('materialForm'))
  if (and.length) where.AND = and
  return { where, page, pageSize, paginated }
}
