import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  findGrowthIdentityEntry,
  growthIdentityDisplayValue,
  serializeGrowthIdentityValue,
  type BrandIdentityValue,
} from '@/lib/brandIdentity'
import {
  ensureGrowthMerchantForBrand,
  GrowthDataCenterError,
  publishGrowthMerchantKnowledgeRevision,
  readGrowthMerchantKnowledge,
} from '@/lib/growthDataCenter'

export const GROWTH_IDENTITY_FIELDS = {
  brandTone: 'brand.tone',
  targetAudience: 'audience.primary',
  sellingPoints: 'brand.unique_selling_points',
} as const

export type GrowthIdentityField = keyof typeof GROWTH_IDENTITY_FIELDS
export type IdentitySyncActor = {
  id?: string | null
  email?: string | null
  type?: string | null
  userRoles?: string[]
}

type SyncResult = {
  state: 'published' | 'pending_sync' | 'sync_conflict' | 'discarded'
  errorCode?: string
  publishedVersion?: number
}

export function isGrowthIdentityField(field: string): field is GrowthIdentityField {
  return Object.prototype.hasOwnProperty.call(GROWTH_IDENTITY_FIELDS, field)
}

export async function queueAndSyncGrowthIdentityChange(input: {
  brandId: string
  field: GrowthIdentityField
  value: string | string[]
  expectedVersion: number
  actor: IdentitySyncActor
  oldValue: BrandIdentityValue
}): Promise<SyncResult> {
  const existing = await prisma.brandIdentityPendingChange.findUnique({
    where: { brandId_field: { brandId: input.brandId, field: input.field } },
  })
  const pending = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.brandIdentityPendingChange.upsert({
      where: { brandId_field: { brandId: input.brandId, field: input.field } },
      update: {
        value: input.value as Prisma.InputJsonValue,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        remoteVersion: null,
        actorId: input.actor.id || null,
        actorType: input.actor.type || 'HUMAN',
        actorName: input.actor.email || null,
        actorRoles: input.actor.userRoles || [],
      },
      create: {
        brandId: input.brandId,
        field: input.field,
        value: input.value as Prisma.InputJsonValue,
        expectedVersion: input.expectedVersion,
        actorId: input.actor.id || null,
        actorType: input.actor.type || 'HUMAN',
        actorName: input.actor.email || null,
        actorRoles: input.actor.userRoles || [],
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: input.actor.id || null,
        actorType: input.actor.type || 'HUMAN',
        actorName: input.actor.email || null,
        action: 'BRAND_IDENTITY_FIELD_QUEUED',
        resourceId: `${input.brandId}:${input.field}`,
        resourceType: 'BrandIdentity',
        oldValue: jsonValue(existing?.value ?? input.oldValue),
        newValue: jsonValue(input.value),
        metadata: {
          brandId: input.brandId,
          field: input.field,
          expectedVersion: existing?.expectedVersion ?? input.expectedVersion,
          source: 'kanban_pending',
        },
      },
    })
    return row
  })
  return syncPendingIdentityChange(pending.id)
}

export async function syncPendingIdentityChange(id: string): Promise<SyncResult> {
  const pending = await prisma.brandIdentityPendingChange.findUnique({
    where: { id },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          location: true,
          address: true,
          description: true,
          growthBrandKey: true,
        },
      },
    },
  })
  if (!pending) return { state: 'published' }
  if (!isGrowthIdentityField(pending.field)) {
    await recordRetry(pending.id, pending.attempts, 'invalid_identity_field', 'Unsupported pending identity field')
    return { state: 'pending_sync', errorCode: 'invalid_identity_field' }
  }
  const field = pending.field as GrowthIdentityField
  if (pending.status === 'CONFLICT') return { state: 'sync_conflict', errorCode: pending.lastErrorCode || undefined }

  const claimTime = new Date()
  const claimed = await prisma.brandIdentityPendingChange.updateMany({
    where: {
      id: pending.id,
      status: pending.status,
      updatedAt: pending.updatedAt,
      nextAttemptAt: { lte: claimTime },
    },
    data: {
      status: 'PROCESSING',
      nextAttemptAt: new Date(claimTime.getTime() + 10 * 60_000),
      updatedAt: claimTime,
    },
  })
  if (!claimed.count) return { state: 'pending_sync' }
  pending.status = 'PROCESSING'
  pending.updatedAt = claimTime

  const value = normalizePendingValue(field, pending.value)
  try {
    const brandKey = await ensureGrowthMerchantForBrand(pending.brand)
    const growth = await readGrowthMerchantKnowledge(brandKey)
    const entries = Array.isArray(growth.items) ? growth.items : []
    const current = findGrowthIdentityEntry(entries, field)
    const currentVersion = Number(current?.version) || 0

    if (current && valuesEqual(growthIdentityDisplayValue(field, current), value)) {
      const completed = await completePendingChange(pending, currentVersion, 'already_published')
      return { state: completed ? 'published' : 'pending_sync', ...(completed ? { publishedVersion: currentVersion } : {}) }
    }
    if (currentVersion !== pending.expectedVersion) {
      const conflicted = await markConflict(pending, currentVersion, 'knowledge_revision_conflict')
      return { state: conflicted ? 'sync_conflict' : 'pending_sync', errorCode: 'knowledge_revision_conflict' }
    }

    await publishGrowthMerchantKnowledgeRevision({
      brandKey,
      knowledgeKey: GROWTH_IDENTITY_FIELDS[field],
      expectedVersion: pending.expectedVersion,
      statement: field === 'sellingPoints' ? (value as string[]).join('；') : value as string,
      structuredValue: serializeGrowthIdentityValue(field, value, current?.structured_value),
      actor: {
        id: pending.actorId || 'amc-kanban-sync',
        email: pending.actorName,
        type: pending.actorType,
        roles: pending.actorRoles,
      },
    })
    const completed = await completePendingChange(pending, pending.expectedVersion + 1, 'published')
    return {
      state: completed ? 'published' : 'pending_sync',
      ...(completed ? { publishedVersion: pending.expectedVersion + 1 } : {}),
    }
  } catch (error) {
    if (error instanceof GrowthDataCenterError && error.status === 409) {
      const conflicted = await markConflict(pending, null, error.code)
      return { state: conflicted ? 'sync_conflict' : 'pending_sync', errorCode: error.code }
    }
    const code = error instanceof GrowthDataCenterError ? error.code : 'growth_unavailable'
    const message = error instanceof Error ? error.message : 'AMC-Growth unavailable'
    await recordRetry(pending.id, pending.attempts, code, message, pending.updatedAt)
    return { state: 'pending_sync', errorCode: code }
  }
}

export async function processPendingIdentityChanges(limit = 20) {
  const rows = await prisma.brandIdentityPendingChange.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: Math.max(1, Math.min(limit, 100)),
    select: { id: true },
  })
  const results: Array<{ id: string; state: SyncResult['state']; errorCode?: string }> = []
  for (const row of rows) {
    const result = await syncPendingIdentityChange(row.id)
    results.push({ id: row.id, ...result })
  }
  return results
}

export async function resolveIdentitySyncConflict(input: {
  brandId: string
  field: GrowthIdentityField
  action: 'retry' | 'overwrite' | 'use_growth'
  actor: IdentitySyncActor
}): Promise<SyncResult> {
  const pending = await prisma.brandIdentityPendingChange.findUnique({
    where: { brandId_field: { brandId: input.brandId, field: input.field } },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          location: true,
          address: true,
          description: true,
          growthBrandKey: true,
        },
      },
    },
  })
  if (!pending) return { state: 'published' }

  if (input.action === 'use_growth') {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.brandIdentityPendingChange.delete({ where: { id: pending.id } })
      await tx.auditLog.create({
        data: auditData(pending, input.actor, 'BRAND_IDENTITY_SYNC_DISCARDED', pending.value, null, {
          resolution: 'use_growth',
        }),
      })
    })
    return { state: 'discarded' }
  }

  let expectedVersion = pending.expectedVersion
  if (input.action === 'overwrite') {
    try {
      const brandKey = await ensureGrowthMerchantForBrand(pending.brand)
      const growth = await readGrowthMerchantKnowledge(brandKey)
      const current = findGrowthIdentityEntry(Array.isArray(growth.items) ? growth.items : [], input.field)
      expectedVersion = Number(current?.version) || 0
    } catch {
      await recordRetry(pending.id, pending.attempts, 'growth_unavailable', 'Unable to read latest Growth version')
      return { state: 'pending_sync', errorCode: 'growth_unavailable' }
    }
  }

  const updated = await prisma.brandIdentityPendingChange.update({
    where: { id: pending.id },
    data: {
      expectedVersion,
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
      remoteVersion: null,
      actorId: input.actor.id || pending.actorId,
      actorType: input.actor.type || pending.actorType,
      actorName: input.actor.email || pending.actorName,
      actorRoles: input.actor.userRoles || pending.actorRoles,
    },
  })
  return syncPendingIdentityChange(updated.id)
}

export function retryDelayMs(attempts: number) {
  const schedule = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]
  return schedule[Math.min(Math.max(attempts, 0), schedule.length - 1)]
}

async function completePendingChange(
  pending: { id: string; brandId: string; field: string; value: Prisma.JsonValue; actorId: string | null; actorType: string; actorName: string | null; updatedAt: Date },
  publishedVersion: number,
  resolution: string
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const deleted = await tx.brandIdentityPendingChange.deleteMany({
      where: { id: pending.id, updatedAt: pending.updatedAt },
    })
    if (deleted.count === 1 && isGrowthIdentityField(pending.field)) {
      const field = pending.field as GrowthIdentityField
      const value = normalizePendingValue(field, pending.value)
      const data = field === 'brandTone'
        ? { brandTone: value as string }
        : field === 'targetAudience'
          ? { audienceAssumptions: value as string }
          : { productAssumptions: (value as string[]).join('\n') }
      await tx.brandKnowledge.upsert({
        where: { brandId: pending.brandId },
        update: data,
        create: { brandId: pending.brandId, negPrompts: [], ...data },
      })
    }
    await tx.auditLog.create({
      data: auditData(pending, {}, 'BRAND_IDENTITY_FIELD_SYNCED', null, pending.value, {
        publishedVersion,
        resolution,
        supersededByNewerLocalEdit: deleted.count === 0,
      }),
    })
    if (!deleted.count) {
      await tx.brandIdentityPendingChange.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: { expectedVersion: publishedVersion, nextAttemptAt: new Date() },
      })
    }
    return deleted.count === 1
  })
}

async function markConflict(
  pending: { id: string; brandId: string; field: string; value: Prisma.JsonValue; actorId: string | null; actorType: string; actorName: string | null; updatedAt: Date },
  remoteVersion: number | null,
  code: string
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.brandIdentityPendingChange.updateMany({
      where: { id: pending.id, updatedAt: pending.updatedAt },
      data: {
        status: 'CONFLICT',
        remoteVersion,
        lastErrorCode: code,
        lastErrorMessage: 'Growth 中该字段已有更新，请选择冲突处理方式',
      },
    })
    if (updated.count) {
      await tx.auditLog.create({
        data: auditData(pending, {}, 'BRAND_IDENTITY_SYNC_CONFLICT', pending.value, null, { remoteVersion, code }),
      })
    }
    return updated.count === 1
  })
}

async function recordRetry(id: string, attempts: number, code: string, message: string, expectedUpdatedAt?: Date) {
  const nextAttempts = attempts + 1
  await prisma.brandIdentityPendingChange.updateMany({
    where: { id, ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}) },
    data: {
      status: 'PENDING',
      attempts: nextAttempts,
      nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
      lastErrorCode: code,
      lastErrorMessage: message.slice(0, 500),
    },
  })
}

function normalizePendingValue(field: GrowthIdentityField, value: Prisma.JsonValue) {
  if (field === 'sellingPoints') {
    return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : []
  }
  return typeof value === 'string' ? value.trim() : ''
}

function valuesEqual(left: string | string[], right: string | string[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function auditData(
  pending: { brandId: string; field: string; actorId: string | null; actorType: string; actorName: string | null },
  actor: IdentitySyncActor,
  action: string,
  oldValue: unknown,
  newValue: unknown,
  metadata: Record<string, unknown>
) {
  return {
    actorId: actor.id || pending.actorId,
    actorType: actor.type || pending.actorType,
    actorName: actor.email || pending.actorName,
    action,
    resourceId: `${pending.brandId}:${pending.field}`,
    resourceType: 'BrandIdentity',
    oldValue: jsonValue(oldValue),
    newValue: jsonValue(newValue),
    metadata: { brandId: pending.brandId, field: pending.field, source: 'kanban_pending', ...metadata },
  }
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null))
}
