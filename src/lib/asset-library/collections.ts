import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type CollectionSlotInput = { slotKey: string; title: string; requirement: string; expectedTags: string[]; order: number }
export type EnsureScriptCollectionInput = { brandId: string; creativeId: string; creativeVersion?: number; month?: string; name: string; createdById?: string; slots: CollectionSlotInput[] }
type Db = Prisma.TransactionClient | typeof prisma
const include = { slots: { orderBy: { order: 'asc' as const }, include: { items: { orderBy: { order: 'asc' as const }, include: { asset: true } } } }, items: { orderBy: { order: 'asc' as const }, include: { asset: true, slot: true } } } as const
type Loaded = Prisma.AssetCollectionGetPayload<{ include: typeof include }>
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

function slots(input: CollectionSlotInput[]) {
  const unique = new Map<string, CollectionSlotInput>()
  for (const raw of input) {
    const slotKey = clean(raw.slotKey, 100), title = clean(raw.title, 200), requirement = clean(raw.requirement, 2000)
    if (!slotKey || !title || !requirement) throw Object.assign(new Error('Invalid collection slot'), { status: 400 })
    unique.set(slotKey, { slotKey, title, requirement, expectedTags: [...new Set((raw.expectedTags || []).map(tag => clean(tag, 80)).filter(Boolean))].slice(0, 30), order: Number.isInteger(raw.order) && raw.order >= 0 ? raw.order : unique.size })
  }
  return [...unique.values()]
}
async function load(db: Db, brandId: string, id: string): Promise<Loaded> {
  const row = await db.assetCollection.findFirst({ where: { id, brandId }, include })
  if (!row) throw Object.assign(new Error('Asset collection not found'), { status: 404 })
  return row
}
function present(row: Loaded) {
  const assigned = new Set(row.slots.flatMap(slot => slot.items.map(item => item.id)))
  const presentedSlots = row.slots.map(slot => ({ ...slot, status: slot.items.length ? 'FILLED' : slot.status === 'UNASSIGNED' ? 'UNASSIGNED' : 'MISSING' }))
  return { ...row, slots: presentedSlots, missingCount: presentedSlots.filter(slot => slot.status === 'MISSING').length, filledCount: presentedSlots.filter(slot => slot.status === 'FILLED').length, unassignedItems: row.items.filter(item => !assigned.has(item.id)) }
}

export async function ensureScriptCollection(input: EnsureScriptCollectionInput) {
  const creativeId = clean(input.creativeId, 200), name = clean(input.name, 300), normalized = slots(input.slots || [])
  if (!input.brandId || !creativeId || !name) throw Object.assign(new Error('Invalid asset collection'), { status: 400 })
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const collection = await tx.assetCollection.upsert({
      where: { brandId_kind_creativeId: { brandId: input.brandId, kind: 'SCRIPT', creativeId } },
      create: { brandId: input.brandId, kind: 'SCRIPT', creativeId, creativeVersion: input.creativeVersion ?? 0, month: clean(input.month, 20) || null, name, createdById: input.createdById },
      update: { creativeVersion: input.creativeVersion ?? 0, month: clean(input.month, 20) || null, name },
    })
    const active = normalized.map(slot => slot.slotKey)
    await tx.assetCollectionSlot.updateMany({ where: { collectionId: collection.id, ...(active.length ? { slotKey: { notIn: active } } : {}) }, data: { status: 'UNASSIGNED' } })
    for (const slot of normalized) await tx.assetCollectionSlot.upsert({ where: { collectionId_slotKey: { collectionId: collection.id, slotKey: slot.slotKey } }, create: { collectionId: collection.id, ...slot }, update: { title: slot.title, requirement: slot.requirement, expectedTags: slot.expectedTags, order: slot.order } })
    return present(await load(tx, input.brandId, collection.id))
  }, { isolationLevel: 'Serializable' })
}
export async function listAssetCollections(brandId: string) { return (await prisma.assetCollection.findMany({ where: { brandId }, include, orderBy: { updatedAt: 'desc' } })).map(present) }
export async function getAssetCollection(brandId: string, id: string) { return present(await load(prisma, brandId, id)) }
export async function assertCollectionTarget(brandId: string, collectionId: string, slotId?: string) {
  if (!await prisma.assetCollection.findFirst({ where: { id: collectionId, brandId }, select: { id: true } })) throw Object.assign(new Error('Asset collection not found'), { status: 404 })
  if (slotId && !await prisma.assetCollectionSlot.findFirst({ where: { id: slotId, collectionId }, select: { id: true } })) throw Object.assign(new Error('Asset collection slot not found'), { status: 404 })
}
export async function linkAssetToCollection(input: { brandId: string; collectionId: string; assetId: string; slotId?: string; role?: string; order?: number; uploadOrigin?: 'UPLOAD' | 'LIBRARY' | 'MIGRATION' }) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const collection = await tx.assetCollection.findFirst({ where: { id: input.collectionId, brandId: input.brandId }, select: { id: true } })
    const asset = await tx.mediaAsset.findFirst({ where: { id: input.assetId, brandId: input.brandId }, select: { id: true } })
    if (!collection || !asset) throw Object.assign(new Error('Asset collection or asset not found'), { status: 404 })
    const slot = input.slotId ? await tx.assetCollectionSlot.findFirst({ where: { id: input.slotId, collectionId: collection.id }, select: { id: true } }) : null
    if (input.slotId && !slot) throw Object.assign(new Error('Asset collection slot not found'), { status: 404 })
    const previous = await tx.assetCollectionItem.findUnique({ where: { collectionId_assetId: { collectionId: collection.id, assetId: asset.id } }, select: { slotId: true } })
    const item = await tx.assetCollectionItem.upsert({ where: { collectionId_assetId: { collectionId: collection.id, assetId: asset.id } }, create: { collectionId: collection.id, assetId: asset.id, slotId: slot?.id, role: clean(input.role, 80) || null, order: input.order ?? 0, uploadOrigin: input.uploadOrigin || 'LIBRARY' }, update: { slotId: slot?.id, role: clean(input.role, 80) || null, order: input.order ?? 0, uploadOrigin: input.uploadOrigin || 'LIBRARY' } })
    if (slot) await tx.assetCollectionSlot.update({ where: { id: slot.id }, data: { status: 'FILLED' } })
    if (previous?.slotId && previous.slotId !== slot?.id) { const count = await tx.assetCollectionItem.count({ where: { slotId: previous.slotId } }); await tx.assetCollectionSlot.update({ where: { id: previous.slotId }, data: { status: count ? 'FILLED' : 'MISSING' } }) }
    return item
  }, { isolationLevel: 'Serializable' })
}
export async function unlinkAssetFromCollection(input: { brandId: string; collectionId: string; assetId: string }) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const item = await tx.assetCollectionItem.findFirst({ where: { collectionId: input.collectionId, assetId: input.assetId, collection: { brandId: input.brandId } }, select: { id: true, slotId: true } })
    if (!item) return { removed: false }
    await tx.assetCollectionItem.delete({ where: { id: item.id } })
    if (item.slotId) { const count = await tx.assetCollectionItem.count({ where: { slotId: item.slotId } }); await tx.assetCollectionSlot.update({ where: { id: item.slotId }, data: { status: count ? 'FILLED' : 'MISSING' } }) }
    return { removed: true }
  })
}
export async function deleteAssetCollection(brandId: string, id: string) { const result = await prisma.assetCollection.deleteMany({ where: { id, brandId } }); if (!result.count) throw Object.assign(new Error('Asset collection not found'), { status: 404 }); return { deleted: true } }
export async function findReusableAsset(brandId: string, contentHash: string, db: Db = prisma) { return contentHash ? db.mediaAsset.findFirst({ where: { brandId, contentHash }, orderBy: { createdAt: 'asc' } }) : null }
