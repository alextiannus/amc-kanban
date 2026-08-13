import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((value) => value.startsWith('--limit='))
const limit = Math.min(1000, Math.max(1, Number(limitArg?.split('=')[1]) || 100))

if (!process.env.DATABASE_URL) {
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    skipped: true,
    reason: 'DATABASE_URL is not configured',
  }, null, 2))
  process.exitCode = apply ? 1 : 0
} else {
  const prisma = new PrismaClient()
  const brands = await prisma.brand.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      name: true,
      address: true,
      timezone: true,
      googlePlaceId: true,
      latitude: true,
      longitude: true,
      growthBrandKey: true,
      knowledge: {
        select: {
          stores: true,
          businessHours: true,
          reservationUrl: true,
          orderingUrl: true,
        },
      },
      growthSyncState: { select: { status: true, mode: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  const summary = brands.map((brand) => {
    const stores = Array.isArray(brand.knowledge?.stores) ? brand.knowledge.stores : []
    return {
      id: brand.id,
      name: brand.name,
      growthBrandKey: brand.growthBrandKey,
      storeCount: stores.length,
      missingStoreIds: stores.filter((store) => !store || typeof store !== 'object' || Array.isArray(store) || !String(store.storeId || '').trim()).length,
      currentSyncStatus: brand.growthSyncState?.status || null,
    }
  })

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    active_brand_count: brands.length,
    brands: summary,
  }, null, 2))

  if (apply) {
    let queued = 0
    for (const brand of brands) {
      await prisma.$transaction(async (tx) => {
        const rawStores = Array.isArray(brand.knowledge?.stores)
          ? brand.knowledge.stores.filter((store) => store && typeof store === 'object' && !Array.isArray(store))
          : []
        const usedIds = new Set()
        const stores = rawStores.length
          ? rawStores.map((store, index) => {
              let storeId = String(store.storeId || '').trim()
              if (!storeId || usedIds.has(storeId)) storeId = index === 0 && !usedIds.has('main') ? 'main' : `store_${randomUUID()}`
              usedIds.add(storeId)
              const address = String(store.address || (storeId === 'main' ? brand.address || '' : '')).trim()
              return {
                ...store,
                storeId,
                name: String(store.name || (storeId === 'main' ? brand.name : `Store ${index + 1}`)).trim(),
                address,
                timezone: String(store.timezone || brand.timezone).trim(),
                latitude: store.latitude ?? (storeId === 'main' ? brand.latitude : null),
                longitude: store.longitude ?? (storeId === 'main' ? brand.longitude : null),
                googlePlaceId: String(store.googlePlaceId || (storeId === 'main' ? brand.googlePlaceId || '' : '')).trim(),
                businessHours: store.businessHours || (storeId === 'main' ? brand.knowledge?.businessHours || '' : ''),
                reservationUrl: store.reservationUrl || (storeId === 'main' ? brand.knowledge?.reservationUrl || '' : ''),
                orderingUrl: store.orderingUrl || (storeId === 'main' ? brand.knowledge?.orderingUrl || '' : ''),
                isPrimary: typeof store.isPrimary === 'boolean' ? store.isPrimary : index === 0,
                status: String(store.status || (address ? 'active' : 'pending_details')),
              }
            })
          : [{
              storeId: 'main',
              name: brand.name,
              address: brand.address || '',
              timezone: brand.timezone,
              latitude: brand.latitude,
              longitude: brand.longitude,
              googlePlaceId: brand.googlePlaceId || '',
              businessHours: brand.knowledge?.businessHours || '',
              reservationUrl: brand.knowledge?.reservationUrl || '',
              orderingUrl: brand.knowledge?.orderingUrl || '',
              isPrimary: true,
              status: brand.address ? 'active' : 'pending_details',
            }]

        await tx.brandKnowledge.upsert({
          where: { brandId: brand.id },
          update: { stores },
          create: { brandId: brand.id, negPrompts: [], stores },
        })
        await tx.brandGrowthSyncState.upsert({
          where: { brandId: brand.id },
          create: {
            brandId: brand.id,
            status: 'PENDING',
            mode: 'BACKFILL',
            dirtyPaths: ['*'],
            nextAttemptAt: new Date(),
          },
          update: {
            status: 'PENDING',
            mode: 'BACKFILL',
            dirtyPaths: ['*'],
            forcePaths: [],
            attempts: 0,
            nextAttemptAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        })
      })
      queued += 1
    }
    console.log(JSON.stringify({ queued, failed: 0 }, null, 2))
  }

  await prisma.$disconnect()
}
