import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type CollectionSlotInput = {
  slotKey: string
  title: string
  requirement: string
  expectedTags: string[]
  order: number
}

export type EnsureScriptCollectionInput = {
  brandId: string
  creativeId: string
  creativeVersion?: number
  month?: string
  name: string
  createdById?: string
  slots: CollectionSlotInput[]
}

export type LinkAssetInput = {
  brandId: string
  collectionId: string
  assetId: string
  slotId?: string
  role?: string
  order?: number
  uploadOrigin?: 'UPLOAD' | 'LIBRARY' | 'MIGRATION'
}

type Db = Prisma.TransactionClient | typeof prisma

const collectionInclude = {
  slots: { orderBy: { order: 'asc' as const }, include: { items: { orderBy: { order: 'asc' as const }, include: { asset: true } } } },
  items: { orderBy: { order: 'asc' as const }, include: { asset: true, slot: true } },
} as const

type LoadedCollection = Prisma.AssetCollectionGetPayload<{ include: typeof collectionInclude }>

export type AssetCollectionView = ReturnType<typeof presentCollection>

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizedSlots(slots: CollectionSlotInput[]) {
  const unique = new Map<string, CollectionSlotInput>()
  for (const slot of slots) {
    const slotKey = clean(slot.slotKey, 100)
    const title = clean(slot.title, 200)
    const requirement = clean(slot.requirement, 2_000)
    if (!slotKey || !title || !requirement) throw Object.assign(new Error('Invalid collection slot'), { status: 400 })
    unique.set(slotKey, {
      slotKey,
      title,
      requirement,
      expectedTags: [...new Set((slot.expectedTags || []).map(tag => clean(tag, 80)).filter(Boolean))].slice(0, 30),
      order: Number.isInteger(slot.order) && slot.order >= 0 ? slot.order : unique.size,
    })
  }
  return [...unique.values()]
}

async function loadCollection(db: Db, brandId: string, collectionId: string): Promise<LoadedCollection> {
  const row = await db.assetCollection.findFirst({ where: { id: collectionId, brandId }, include: collectionInclude })
  if (!row) throw Object.assign(new Error('Asset collection not found'), { status: 404 })
  return row
}

function presentCollection(row: LoadedCollection) {
  const assigned = new Set(row.slots.flatMap(slot => slot.items.map(item => item.id)))
  const slots = row.slots.map(slot => ({
    id: slot.id,
    slotKey: slot.slotKey,
    title: slot.title,
    requirement: slot.requirement,
    expectedTags: slot.expectedTags,
    order: slot.order,
    status: slot.items.length ? 'FILLED' : slot.status === 'UNASSIGNED' ? 'UNASSIGNED' : 'MISSING',
    items: slot.items.map(item => ({ id: item.id, assetId: item.assetId, role: item.role, order: item.order, uploadOrigin: item.uploadOrigin, asset: item.asset })),
  }))
  return {
    id: row.id,
    brandId: row.brandId,
    kind: row.kind,
    creativeId: row.creativeId,
    creativeVersion: row.creativeVersion,
    month: row.month,
    name: row.name,
    status: row.status,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    missingCount: slots.filter(slot => slot.status === 'MISSING').length,
    filledCount: slots.filter(slot => slot.status === 'FILLED').length,
    slots,
    unassignedItems: row.items.filter(item => !assigned.has(item.id)).map(item => ({ id: item.id, assetId: item.assetId, role: item.role, order: item.order, uploadOrigin: item.uploadOrigin, asset: item.asset })),
  }
}

export async function ensureScriptCollection(input: EnsureScriptCollectionInput, db: typeof prisma = prisma) {
  const creativeId = clean(input.creativeId, 200)
  const name = clean(input.name, 300)
  const month = clean(input.month, 20) || null
  if (!input.brandId || !creativeId || !name) throw Object.assign(new Error('Invalid asset collection'), { status: 400 })
  const slots = normalizedSlots(input.slots || [])
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const collection = await tx.assetCollection.upsert({
      where: { brandId_kind_creativeId: { brandId: input.brandId, kind: 'SCRIPT', creativeId } },
      create: { brandId: input.brandId, kind: 'SCRIPT', creativeId, creativeVersion: input.creativeVersion ?? 0, month, name, createdById: input.createdById },
      update: { creativeVersion: input.creativeVersion ?? 0, month, name },
    })
    const activeKeys = slots.map(slot => slot.slotKey)
    await tx.assetCollectionSlot.updateMany({
      where: { collectionId: collection.id, ...(activeKeys.length ? { slotKey: { notIn: activeKeys } } : {}) },
      data: { status: 'UNASSIGNED' },
    })
    for (const slot of slots) {
      await tx.assetCollectionSlot.upsert({
        where: { collectionId_slotKey: { collectionId: collection.id, slotKey: slot.slotKey } },
        create: { collectionId: collection.id, ...slot },
        update: { title: slot.title, requirement: slot.requirement, expectedTags: slot.expectedTags, order: slot.order },
      })
    }
    return presentCollection(await loadCollection(tx, input.brandId, collection.id))
  }, { isolationLevel: 'Serializable' })
}

export async function listAssetCollections(brandId: string) {
  const rows = await prisma.assetCollection.findMany({ where: { brandId }, include: collectionInclude, orderBy: { updatedAt: 'desc' } })
  return rows.map(presentCollection)
}

export async function getAssetCollection(brandId: string, collectionId: string) {
  return presentCollection(await loadCollection(prisma, brandId, collectionId))
}

export async function assertCollectionTarget(brandId: string, collectionId: string, slotId?: string) {
  const collection = await prisma.assetCollection.findFirst({ where: { id: collectionId, brandId }, select: { id: true } })
  if (!collection) throw Object.assign(new Error('Asset collection not found'), { status: 404 })
  if (slotId) {
    const slot = await prisma.assetCollectionSlot.findFirst({ where: { id: slotId, collectionId }, select: { id: true } })
    if (!slot) throw Object.assign(new Error('Asset collection slot not found'), { status: 404 })
  }
  return { collectionId, slotId }
}

export async function linkAssetToCollection(input: LinkAssetInput, db: typeof prisma = prisma) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const collection = await tx.assetCollection.findFirst({ where: { id: input.collectionId, brandId: input.brandId }, select: { id: true } })
    const asset = await tx.mediaAsset.findFirst({ where: { id: input.assetId, brandId: input.brandId }, select: { id: true } })
    if (!collection || !asset) throw Object.assign(new Error('Asset collection or asset not found'), { status: 404 })
    const slot = input.slotId ? await tx.assetCollectionSlot.findFirst({ where: { id: input.slotId, collectionId: collection.id }, select: { id: true } }) : null
    if (input.slotId && !slot) throw Object.assign(new Error('Asset collection slot not found'), { status: 404 })
    const previous = await tx.assetCollectionItem.findUnique({ where: { collectionId_assetId: { collectionId: collection.id, assetId: asset.id } }, select: { slotId: true } })
    const item = await tx.assetCollectionItem.upsert({
      where: { collectionId_assetId: { collectionId: collection.id, assetId: asset.id } },
      create: { collectionId: collection.id, assetId: asset.id, slotId: slot?.id, role: clean(input.role, 80) || null, order: input.order ?? 0, uploadOrigin: input.uploadOrigin || 'LIBRARY' },
      update: { slotId: slot?.id, role: clean(input.role, 80) || null, order: input.order ?? 0, uploadOrigin: input.uploadOrigin || 'LIBRARY' },
    })
    if (slot) await tx.assetCollectionSlot.update({ where: { id: slot.id }, data: { status: 'FILLED' } })
    if (previous?.slotId && previous.slotId !== slot?.id) {
      const remaining = await tx.assetCollectionItem.count({ where: { slotId: previous.slotId } })
      await tx.assetCollectionSlot.update({ where: { id: previous.slotId }, data: { status: remaining ? 'FILLED' : 'MISSING' } })
    }
    return item
  }, { isolationLevel: 'Serializable' })
}

export async function unlinkAssetFromCollection(input: { brandId: string; collectionId: string; assetId: string }, db: typeof prisma = prisma) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const item = await tx.assetCollectionItem.findFirst({
      where: { collectionId: input.collectionId, assetId: input.assetId, collection: { brandId: input.brandId } },
      select: { id: true, slotId: true },
    })
    if (!item) return { removed: false }
    await tx.assetCollectionItem.delete({ where: { id: item.id } })
    if (item.slotId) {
      const remaining = await tx.assetCollectionItem.count({ where: { slotId: item.slotId } })
      await tx.assetCollectionSlot.update({ where: { id: item.slotId }, data: { status: remaining ? 'FILLED' : 'MISSING' } })
    }
    return { removed: true }
  }, { isolationLevel: 'Serializable' })
}

export async function deleteAssetCollection(brandId: string, collectionId: string) {
  const deleted = await prisma.assetCollection.deleteMany({ where: { id: collectionId, brandId } })
  if (!deleted.count) throw Object.assign(new Error('Asset collection not found'), { status: 404 })
  return { deleted: true }
}

export async function findReusableAsset(brandId: string, contentHash: string, db: Db = prisma) {
  if (!brandId || !contentHash) return null
  return db.mediaAsset.findFirst({ where: { brandId, contentHash }, orderBy: { createdAt: 'asc' } })
}
