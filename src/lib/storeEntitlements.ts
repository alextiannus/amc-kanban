import { prisma } from '@/lib/prisma'
import { assertStoreCount, effectiveStoreLimit, multiStoreQuantity, normalizeStoreRecords } from './storeEntitlementPolicy'

export async function getStoreEntitlements(brandId: string, database: any = prisma) {
  const [brand, subscription, knowledge] = await Promise.all([
    database.brand.findUnique({ where: { id: brandId }, select: { manualStoreLimit: true } }),
    database.brandSubscription.findFirst({
      where: { brandId, status: 'ACTIVE', OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' }, select: { selectedAddons: true },
    }),
    database.brandKnowledge.findUnique({ where: { brandId }, select: { stores: true } }),
  ])
  const quantity = multiStoreQuantity(subscription?.selectedAddons)
  const stores = Array.isArray(knowledge?.stores) ? knowledge.stores : []
  return {
    store_limit: effectiveStoreLimit(1 + quantity, brand?.manualStoreLimit ?? null),
    subscription_store_limit: 1 + quantity,
    manual_store_limit: brand?.manualStoreLimit ?? null,
    multi_store_addon_quantity: quantity,
    configured_store_count: Math.max(1, stores.length),
  }
}

// Call inside the same transaction as the write. The Brand row serializes quota
// updates and store edits, including the first BrandKnowledge insert.
export async function prepareStoreWrite(database: any, brandId: string, value: unknown) {
  await database.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${brandId} FOR UPDATE`
  const entitlements = await getStoreEntitlements(brandId, database)
  const existing = await database.brandKnowledge.findUnique({ where: { brandId }, select: { stores: true } })
  const stores = normalizeStoreRecords(value, existing?.stores)
  assertStoreCount(stores.length, entitlements.configured_store_count, entitlements.store_limit)
  return stores
}
