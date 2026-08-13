import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  GrowthDataCenterError,
  publishGrowthMerchantSnapshot,
  type GrowthMerchantSnapshotConflict,
  type GrowthMerchantSnapshotResponse,
} from '@/lib/growthDataCenter'
import {
  adoptedGrowthLegacyGooglePatch,
  adoptedGrowthStoreGooglePlace,
} from '@/lib/growthGooglePlaces'

export const BRAND_GROWTH_ALL_PATHS = ['*'] as const
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]

export type BrandGrowthSyncActor = {
  id?: string | null
  email?: string | null
  type?: string | null
  roles?: string[]
}

type StoreRecord = {
  storeId: string
  name?: string
  address?: string
  timezone?: string
  latitude?: number | null
  longitude?: number | null
  googlePlaceId?: string
  phone?: string
  businessHours?: string | Record<string, unknown>
  reservationUrl?: string
  orderingUrl?: string
  status?: string
  isPrimary?: boolean
  googleBusiness?: { placeId?: string }
  [key: string]: unknown
}

export async function queueBrandGrowthSync(input: {
  brandId: string
  dirtyPaths?: string[]
  forcePaths?: string[]
  mode?: 'INCREMENTAL' | 'BACKFILL'
  actor?: BrandGrowthSyncActor
  tx?: Prisma.TransactionClient
}) {
  const database = input.tx || prisma
  await ensureStableBrandStores(input.brandId, database)
  const existing = await database.brandGrowthSyncState.findUnique({ where: { brandId: input.brandId } })
  const requestedDirty = cleanPaths(input.dirtyPaths === undefined ? BRAND_GROWTH_ALL_PATHS : input.dirtyPaths)
  const requestedForce = cleanPaths(input.forcePaths || [])
  const requestedMode = input.mode || 'INCREMENTAL'
  const mode = existing?.mode === 'BACKFILL' ? 'BACKFILL' : requestedMode
  const dirtyPaths = mergePaths(existing?.dirtyPaths || [], requestedDirty)
  const forcePaths = mergePaths(existing?.forcePaths || [], requestedForce)
  const actor = input.actor || {}
  return database.brandGrowthSyncState.upsert({
    where: { brandId: input.brandId },
    create: {
      brandId: input.brandId,
      status: 'PENDING',
      mode,
      dirtyPaths,
      forcePaths,
      attempts: 0,
      nextAttemptAt: new Date(),
      actorId: actor.id || null,
      actorType: actor.type || 'SYSTEM',
      actorName: actor.email || null,
      actorRoles: actor.roles || [],
    },
    update: {
      status: 'PENDING',
      mode,
      dirtyPaths,
      forcePaths,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
      actorId: actor.id || existing?.actorId || null,
      actorType: actor.type || existing?.actorType || 'SYSTEM',
      actorName: actor.email || existing?.actorName || null,
      actorRoles: actor.roles || existing?.actorRoles || [],
    },
  })
}

export async function queueAndSyncBrandGrowth(input: Parameters<typeof queueBrandGrowthSync>[0]) {
  await queueBrandGrowthSync(input)
  return syncBrandGrowthState(input.brandId)
}

export function growthPathsForBrandPatch(input: Record<string, unknown>) {
  const mapping: Record<string, string> = {
    name: 'merchant.name',
    location: 'merchant.market',
    industry: 'merchant.industry',
    description: 'merchant.story',
    logoUrl: 'merchant.logoUrl',
    website: 'merchant.website',
    phone: 'merchant.brandPhone',
    address: 'stores.main.address',
    timezone: 'stores.main.timezone',
    latitude: 'stores.main.latitude',
    longitude: 'stores.main.longitude',
    googlePlaceId: 'stores.main.googlePlaceId',
  }
  return Object.entries(mapping)
    .filter(([field]) => Object.prototype.hasOwnProperty.call(input, field))
    .map(([, path]) => path)
}

export function growthPathsForKnowledgePatch(input: Record<string, unknown>) {
  const paths: string[] = []
  if (Object.prototype.hasOwnProperty.call(input, 'market')) paths.push('merchant.market')
  if (Object.prototype.hasOwnProperty.call(input, 'deliveryUrls')) paths.push('merchant.deliveryUrls')
  if (Object.prototype.hasOwnProperty.call(input, 'businessHours')) paths.push('stores.main.businessHours')
  if (Object.prototype.hasOwnProperty.call(input, 'reservationUrl')) paths.push('stores.main.reservationUrl')
  if (Object.prototype.hasOwnProperty.call(input, 'orderingUrl')) paths.push('stores.main.orderingUrl')
  if (Object.prototype.hasOwnProperty.call(input, 'stores')) {
    const storeFields = [
      'name', 'address', 'timezone', 'latitude', 'longitude', 'googlePlaceId',
      'phone', 'businessHours', 'reservationUrl', 'orderingUrl', 'status', 'isPrimary',
    ]
    const stores = Array.isArray(input.stores) ? input.stores.filter(isRecord) : []
    for (const store of stores) {
      const storeId = text(store.storeId)
      if (!storeId) {
        paths.push('stores.*')
        continue
      }
      for (const field of storeFields) {
        if (Object.prototype.hasOwnProperty.call(store, field)) paths.push(`stores.${storeId}.${field}`)
      }
    }
  }
  return paths
}

export async function seedInitialBrandStores(
  brandId: string,
  value: unknown,
  database: Prisma.TransactionClient | typeof prisma = prisma
) {
  const stores = Array.isArray(value)
    ? value.filter(isRecord).filter(store =>
        text(store.name) || text(store.address) || text(store.googlePlaceId)
        || text(store.phone) || numberOrNull(store.latitude) !== null || numberOrNull(store.longitude) !== null
      )
    : []
  if (!stores.length) return false
  await database.brandKnowledge.upsert({
    where: { brandId },
    update: { stores: jsonValue(stores) },
    create: { brandId, negPrompts: [], stores: jsonValue(stores) },
  })
  return true
}

export async function ensureStableBrandStores(
  brandId: string,
  database: Prisma.TransactionClient | typeof prisma = prisma
) {
  const brand = await database.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      address: true,
      timezone: true,
      googlePlaceId: true,
      latitude: true,
      longitude: true,
      knowledge: {
        select: {
          stores: true,
          businessHours: true,
          reservationUrl: true,
          orderingUrl: true,
        },
      },
    },
  })
  if (!brand) throw new Error('brand_not_found')

  const source: Record<string, unknown>[] = Array.isArray(brand.knowledge?.stores)
    ? brand.knowledge.stores.flatMap((item: unknown) => isRecord(item) ? [{ ...item }] : [])
    : []
  const stores: StoreRecord[] = []
  const usedIds = new Set<string>()
  const assignId = (candidate: unknown, index: number) => {
    const requested = text(candidate)
    if (requested && !usedIds.has(requested)) return requested
    if (index === 0 && !usedIds.has('main')) return 'main'
    let generated = `store_${randomUUID()}`
    while (usedIds.has(generated)) generated = `store_${randomUUID()}`
    return generated
  }

  if (source.length === 0) {
    stores.push({
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
    })
  } else {
    source.forEach((raw: Record<string, unknown>, index: number) => {
      const storeId = assignId(raw.storeId, index)
      usedIds.add(storeId)
      const address = text(raw.address) || (storeId === 'main' ? brand.address || '' : '')
      stores.push({
        ...raw,
        storeId,
        name: text(raw.name) || (storeId === 'main' ? brand.name : `Store ${index + 1}`),
        address,
        timezone: text(raw.timezone) || brand.timezone,
        latitude: numberOrNull(raw.latitude ?? (storeId === 'main' ? brand.latitude : null)),
        longitude: numberOrNull(raw.longitude ?? (storeId === 'main' ? brand.longitude : null)),
        googlePlaceId: text(raw.googlePlaceId) || text(record(raw.googleBusiness).placeId)
          || (storeId === 'main' ? brand.googlePlaceId || '' : ''),
        businessHours: raw.businessHours || (storeId === 'main' ? brand.knowledge?.businessHours || '' : ''),
        reservationUrl: text(raw.reservationUrl) || (storeId === 'main' ? brand.knowledge?.reservationUrl || '' : ''),
        orderingUrl: text(raw.orderingUrl) || (storeId === 'main' ? brand.knowledge?.orderingUrl || '' : ''),
        isPrimary: typeof raw.isPrimary === 'boolean' ? raw.isPrimary : index === 0,
        status: text(raw.status) || (address ? 'active' : 'pending_details'),
      })
    })
  }

  const normalized = jsonValue(stores)
  if (stableJson(normalized) !== stableJson(brand.knowledge?.stores ?? null)) {
    await database.brandKnowledge.upsert({
      where: { brandId },
      update: { stores: normalized as Prisma.InputJsonValue },
      create: { brandId, negPrompts: [], stores: normalized as Prisma.InputJsonValue },
    })
  }
  return stores
}

export async function buildBrandGrowthSnapshot(brandId: string, state?: {
  dirtyPaths: string[]
  forcePaths: string[]
  mode: string
}) {
  const stores = await ensureStableBrandStores(brandId)
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      growthBrandKey: true,
      name: true,
      location: true,
      industry: true,
      description: true,
      logoUrl: true,
      website: true,
      phone: true,
      knowledge: {
        select: {
          market: true,
          deliveryUrls: true,
          brandTone: true,
          audienceAssumptions: true,
          productAssumptions: true,
        },
      },
      identityPendingChanges: {
        where: { status: { in: ['PENDING', 'PROCESSING', 'CONFLICT'] } },
        select: { field: true, value: true },
      },
    },
  })
  if (!brand) throw new Error('brand_not_found')
  const pending = new Map<string, unknown>(brand.identityPendingChanges.map((item: { field: string; value: unknown }) => [item.field, item.value]))
  const brandTone = pending.has('brandTone') ? pending.get('brandTone') : brand.knowledge?.brandTone
  const targetAudience = pending.has('targetAudience') ? pending.get('targetAudience') : brand.knowledge?.audienceAssumptions
  const sellingPoints = pending.has('sellingPoints') ? pending.get('sellingPoints') : legacyList(brand.knowledge?.productAssumptions)

  return {
    brand_key: brand.growthBrandKey,
    mode: state?.mode === 'BACKFILL' ? 'backfill' : 'incremental',
    dirty_paths: state?.dirtyPaths || ['*'],
    force_paths: state?.forcePaths || [],
    merchant: {
      name: brand.name,
      market: brand.knowledge?.market || brand.location || null,
      industry: brand.industry || null,
      story: brand.description || null,
      logoUrl: brand.logoUrl || null,
      website: brand.website || null,
      brandPhone: brand.phone || null,
      deliveryUrls: normalizeDeliveryUrls(brand.knowledge?.deliveryUrls),
    },
    identity: identitySnapshotPayload(state, { brandTone, targetAudience, sellingPoints }),
    locations: stores.map(store => ({
      storeId: store.storeId,
      name: text(store.name),
      address: text(store.address),
      timezone: text(store.timezone),
      latitude: numberOrNull(store.latitude),
      longitude: numberOrNull(store.longitude),
      googlePlaceId: text(store.googlePlaceId) || text(record(store.googleBusiness).placeId),
      phone: text(store.phone),
      businessHours: store.businessHours || null,
      reservationUrl: text(store.reservationUrl),
      orderingUrl: text(store.orderingUrl),
      status: text(store.status) || (text(store.address) ? 'active' : 'pending_details'),
      isPrimary: Boolean(store.isPrimary),
    })),
  }
}

export async function syncBrandGrowthState(brandId: string) {
  const claimed = await prisma.brandGrowthSyncState.updateMany({
    where: {
      brandId,
      status: 'PENDING',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    data: { status: 'PROCESSING' },
  })
  if (!claimed.count) return getBrandGrowthSyncStatus(brandId)
  const state = await prisma.brandGrowthSyncState.findUnique({ where: { brandId } })
  if (!state) return null

  try {
    const payload = await buildBrandGrowthSnapshot(brandId, state)
    const payloadHash = createHash('sha256').update(stableJson(payload)).digest('hex')
    const response = await publishGrowthMerchantSnapshot({
      brandId,
      payload: payload as Record<string, unknown>,
      actor: {
        id: state.actorId,
        email: state.actorName,
        type: state.actorType,
        roles: state.actorRoles,
      },
    })
    await applySuccessfulSnapshot(state, response, payloadHash)
    return getBrandGrowthSyncStatus(brandId)
  } catch (error) {
    const classified = classifyGrowthSyncError(error)
    const attempts = state.attempts + 1
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]
    await prisma.brandGrowthSyncState.updateMany({
      where: { brandId, status: 'PROCESSING', updatedAt: state.updatedAt },
      data: {
        status: 'PENDING',
        attempts,
        nextAttemptAt: new Date(Date.now() + delay),
        lastErrorCode: classified.code,
        lastErrorMessage: classified.message,
      },
    })
    return getBrandGrowthSyncStatus(brandId)
  }
}

async function applySuccessfulSnapshot(
  state: { brandId: string; actorId: string | null; actorType: string; actorName: string | null; updatedAt: Date },
  response: GrowthMerchantSnapshotResponse,
  payloadHash: string
) {
  const conflicts = Array.isArray(response.conflicts) ? response.conflicts : []
  const conflictPaths = conflicts.map(item => item.path)
  const resolvedIdentityFields = new Set<string>()
  for (const path of [...response.applied_paths, ...response.unchanged_paths]) {
    const field = identityFieldForPath(path)
    if (field && !conflictPaths.includes(path)) resolvedIdentityFields.add(field)
  }
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const finalized = await tx.brandGrowthSyncState.updateMany({
      where: { brandId: state.brandId, status: 'PROCESSING', updatedAt: state.updatedAt },
      data: {
        status: conflicts.length ? 'CONFLICT' : 'SYNCED',
        mode: 'INCREMENTAL',
        dirtyPaths: conflictPaths,
        forcePaths: [],
        attempts: 0,
        nextAttemptAt: null,
        lastErrorCode: conflicts.length ? 'growth_version_conflict' : null,
        lastErrorMessage: conflicts.length ? '版本冲突，等待人工处理' : null,
        conflicts: conflicts.length ? jsonValue(conflicts) : Prisma.DbNull,
        lastPayloadHash: payloadHash,
        lastSyncedAt: new Date(),
      },
    })
    await tx.brand.update({
      where: { id: state.brandId },
      data: { growthBrandKey: response.brand_key },
    })
    if (finalized.count > 0 && resolvedIdentityFields.size) {
      await tx.brandIdentityPendingChange.deleteMany({
        where: { brandId: state.brandId, field: { in: [...resolvedIdentityFields] } },
      })
    }
    await tx.auditLog.create({
      data: {
        actorId: state.actorId,
        actorType: state.actorType,
        actorName: state.actorName,
        action: finalized.count === 0
          ? 'BRAND_GROWTH_SYNC_SUPERSEDED'
          : conflicts.length ? 'BRAND_GROWTH_SYNC_PARTIAL' : 'BRAND_GROWTH_SYNCED',
        resourceId: state.brandId,
        resourceType: 'BrandGrowthSync',
        newValue: jsonValue({
          brandKey: response.brand_key,
          sourceVersion: response.source_version,
          appliedPaths: response.applied_paths,
          conflicts,
          supersededByNewerLocalEdit: finalized.count === 0,
        }),
      },
    })
  })
}

export async function processPendingBrandGrowthSync(limit = 20) {
  const now = new Date()
  await prisma.brandGrowthSyncState.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
    data: { status: 'PENDING', nextAttemptAt: now },
  })
  await enqueueMissingBrandGrowthStates(Math.max(5, Math.min(limit, 50)))
  const pending = await prisma.brandGrowthSyncState.findMany({
    where: {
      status: 'PENDING',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { updatedAt: 'asc' }],
    take: Math.max(1, Math.min(limit, 100)),
    select: { brandId: true },
  })
  const results = []
  for (const item of pending) results.push(await syncBrandGrowthState(item.brandId))
  return {
    processed: results.length,
    synced: results.filter(item => item?.status === 'SYNCED').length,
    conflicts: results.filter(item => item?.status === 'CONFLICT').length,
    pending: results.filter(item => item?.status === 'PENDING').length,
  }
}

export async function enqueueMissingBrandGrowthStates(limit = 20) {
  const brands = await prisma.brand.findMany({
    where: { status: { not: 'ARCHIVED' }, growthSyncState: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  })
  for (const brand of brands) {
    await queueBrandGrowthSync({ brandId: brand.id, dirtyPaths: ['*'], mode: 'BACKFILL' })
  }
  return brands.length
}

export async function getBrandGrowthSyncStatus(brandId: string) {
  const state = await prisma.brandGrowthSyncState.findUnique({ where: { brandId } })
  if (!state) return null
  return {
    brandId,
    status: state.status,
    pendingPaths: state.dirtyPaths,
    attempts: state.attempts,
    nextRetryAt: state.nextAttemptAt?.toISOString() || null,
    errorCode: state.lastErrorCode,
    errorMessage: state.lastErrorMessage,
    conflicts: Array.isArray(state.conflicts) ? state.conflicts : [],
    lastSyncedAt: state.lastSyncedAt?.toISOString() || null,
    updatedAt: state.updatedAt.toISOString(),
  }
}

export async function resolveBrandGrowthConflicts(input: {
  brandId: string
  paths: string[]
  action: 'overwrite_growth' | 'use_growth'
  actor: BrandGrowthSyncActor
}) {
  const paths = cleanPaths(input.paths)
  if (!paths.length) throw new Error('growth_conflict_paths_required')
  const state = await prisma.brandGrowthSyncState.findUnique({ where: { brandId: input.brandId } })
  if (!state) throw new Error('growth_sync_state_not_found')
  const conflicts = (Array.isArray(state.conflicts) ? state.conflicts : []) as unknown as GrowthMerchantSnapshotConflict[]
  const selected = conflicts.filter(item => paths.includes(item.path))
  if (selected.length !== paths.length) throw new Error('growth_conflict_not_found')

  if (input.action === 'use_growth') {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const conflict of selected) await adoptGrowthValue(tx, input.brandId, conflict)
      await updateConflictState(tx, state, selected, input.actor, input.action)
    })
  } else {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await updateConflictState(tx, state, selected, input.actor, input.action)
    })
  }
  return syncBrandGrowthState(input.brandId)
}

async function updateConflictState(
  tx: Prisma.TransactionClient,
  state: { brandId: string; dirtyPaths: string[]; forcePaths: string[]; conflicts: Prisma.JsonValue | null },
  selected: GrowthMerchantSnapshotConflict[],
  actor: BrandGrowthSyncActor,
  action: 'overwrite_growth' | 'use_growth'
) {
  const paths = selected.map(item => item.path)
  const allConflicts = (Array.isArray(state.conflicts) ? state.conflicts : []) as unknown as GrowthMerchantSnapshotConflict[]
  const remaining = allConflicts.filter(item => !paths.includes(item.path))
  await tx.brandGrowthSyncState.update({
    where: { brandId: state.brandId },
    data: {
      status: 'PENDING',
      dirtyPaths: mergePaths(state.dirtyPaths, paths),
      forcePaths: action === 'overwrite_growth' ? mergePaths(state.forcePaths, paths) : state.forcePaths,
      conflicts: remaining.length ? jsonValue(remaining) : Prisma.DbNull,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
      actorId: actor.id || null,
      actorType: actor.type || 'HUMAN',
      actorName: actor.email || null,
      actorRoles: actor.roles || [],
    },
  })
  await tx.auditLog.create({
    data: {
      actorId: actor.id || null,
      actorType: actor.type || 'HUMAN',
      actorName: actor.email || null,
      action: action === 'overwrite_growth' ? 'BRAND_GROWTH_CONFLICT_OVERWRITE' : 'BRAND_GROWTH_CONFLICT_ADOPT',
      resourceId: state.brandId,
      resourceType: 'BrandGrowthSync',
      oldValue: jsonValue(selected),
      newValue: jsonValue({ paths, action }),
    },
  })
}

async function adoptGrowthValue(tx: Prisma.TransactionClient, brandId: string, conflict: GrowthMerchantSnapshotConflict) {
  const value = conflict.growth_value
  const brandField: Record<string, string> = {
    'merchant.name': 'name',
    'merchant.market': 'location',
    'merchant.industry': 'industry',
    'merchant.story': 'description',
    'merchant.logoUrl': 'logoUrl',
    'merchant.website': 'website',
    'merchant.brandPhone': 'phone',
  }
  if (brandField[conflict.path]) {
    await tx.brand.update({ where: { id: brandId }, data: { [brandField[conflict.path]]: text(value) || null } })
    return
  }
  if (conflict.path === 'merchant.deliveryUrls') {
    await tx.brandKnowledge.upsert({
      where: { brandId },
      update: { deliveryUrls: jsonValue(Array.isArray(value) ? value : []) },
      create: { brandId, negPrompts: [], deliveryUrls: jsonValue(Array.isArray(value) ? value : []) },
    })
    return
  }
  const identityField = identityFieldForPath(conflict.path)
  if (identityField) {
    const data = identityField === 'brandTone'
      ? { brandTone: identityText(value, 'description') || null }
      : identityField === 'targetAudience'
        ? { audienceAssumptions: identityText(value, 'summary') || null }
        : { productAssumptions: identityList(value).join('\n') || null }
    await tx.brandKnowledge.upsert({
      where: { brandId },
      update: data,
      create: { brandId, negPrompts: [], ...data },
    })
    await tx.brandIdentityPendingChange.deleteMany({ where: { brandId, field: identityField } })
    return
  }
  const match = conflict.path.match(/^stores\.([^.]+)\.([^.]+)$/)
  if (!match) return
  const [, storeId, field] = match
  const knowledge = await tx.brandKnowledge.findUnique({ where: { brandId }, select: { stores: true } })
  const stores: Record<string, unknown>[] = Array.isArray(knowledge?.stores)
    ? knowledge.stores.flatMap((item: unknown) => isRecord(item) ? [{ ...item }] : [])
    : []
  const storeIndex = stores.findIndex(item => text(item.storeId) === storeId)
  if (storeIndex < 0) throw new Error('growth_conflict_store_not_found')
  if (field === 'googlePlaceId') {
    stores[storeIndex] = adoptedGrowthStoreGooglePlace(stores[storeIndex], value)
    if (storeId === 'main') {
      const legacyPatch = adoptedGrowthLegacyGooglePatch(value)
      await tx.brand.update({
        where: { id: brandId },
        data: { ...legacyPatch, googleLinksMeta: Prisma.DbNull },
      })
    }
  } else {
    stores[storeIndex][field] = field === 'businessHours' && isRecord(value) && typeof value.text === 'string' ? value.text : value
  }
  await tx.brandKnowledge.update({ where: { brandId }, data: { stores: jsonValue(stores) } })
}

function classifyGrowthSyncError(error: unknown) {
  if (error instanceof GrowthDataCenterError) {
    if ([401, 403].includes(error.status)) return { code: 'growth_auth_error', message: 'Growth 鉴权异常' }
    if (error.status === 404) return { code: 'growth_link_rebuilding', message: '商家关联失效，正在重建' }
    if (error.status === 409) return { code: 'growth_version_conflict', message: '版本冲突，等待人工处理' }
    if (error.status >= 500) return { code: 'growth_unavailable', message: 'Growth 服务暂不可用' }
    return { code: 'growth_request_rejected', message: 'Growth 暂时无法接受本次同步' }
  }
  if (error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/i.test(error.message))) {
    return { code: 'growth_timeout', message: 'Growth 请求超时，将自动重试' }
  }
  return { code: 'growth_unavailable', message: 'Growth 服务暂不可用' }
}

function identityFieldForPath(path: string) {
  if (path === 'identity.brandTone') return 'brandTone'
  if (path === 'identity.targetAudience') return 'targetAudience'
  if (path === 'identity.sellingPoints') return 'sellingPoints'
  return null
}

function identitySnapshotPayload(
  state: { dirtyPaths: string[]; mode: string } | undefined,
  values: { brandTone: unknown; targetAudience: unknown; sellingPoints: unknown }
) {
  const payload: Record<string, unknown> = {}
  const include = (path: string) => state?.mode === 'BACKFILL'
    || state?.dirtyPaths.includes('*')
    || state?.dirtyPaths.includes(path)
  if (include('identity.brandTone')) payload.brandTone = structuredIdentityValue('brandTone', values.brandTone)
  if (include('identity.targetAudience')) payload.targetAudience = structuredIdentityValue('targetAudience', values.targetAudience)
  if (include('identity.sellingPoints')) payload.sellingPoints = structuredIdentityValue('sellingPoints', values.sellingPoints)
  return payload
}

function structuredIdentityValue(field: 'brandTone' | 'targetAudience' | 'sellingPoints', value: unknown) {
  if (field === 'sellingPoints') return identityList(value)
  if (isRecord(value)) return value
  const normalized = text(value)
  if (!normalized) return null
  return field === 'brandTone' ? { description: normalized } : { summary: normalized }
}

function identityText(value: unknown, key: string) {
  return isRecord(value) ? text(value[key]) : text(value)
}

function identityList(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean)
  return legacyList(value)
}

function normalizeDeliveryUrls(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord).map(item => ({ ...item })) : []
}

function legacyList(value: unknown) {
  return text(value).split(/\r?\n|;/).map(item => item.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
}

function mergePaths(current: string[], incoming: readonly string[]) {
  return cleanPaths([...current, ...incoming])
}

function cleanPaths(paths: readonly string[]) {
  return [...new Set(paths.map(text).filter(Boolean))]
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
