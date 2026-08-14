import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from '@/lib/brandAccess'
import {
  BRAND_IDENTITY_FIELDS,
  normalizePublishingFrequency,
  resolveBrandIdentity,
  type BrandIdentityFieldKey,
} from '@/lib/brandIdentity'
import {
  isGrowthIdentityField,
  queueAndSyncGrowthIdentityChange,
  type GrowthIdentityField,
} from '@/lib/brandIdentitySync'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const canRead = await canSessionAccessBrandProject(id, auth.user.id, auth.user.type, auth.user.role)
  if (!canRead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const canEdit = await canSessionWriteBrandProject(id, auth.user.id, auth.user.type)
  const identity = await resolveBrandIdentity(id, { canEdit })
  return identity
    ? NextResponse.json(identity)
    : NextResponse.json({ error: 'Brand not found' }, { status: 404 })
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const canEdit = await canSessionWriteBrandProject(id, auth.user.id, auth.user.type)
  if (!canEdit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const field = body?.field as BrandIdentityFieldKey
  if (!BRAND_IDENTITY_FIELDS.includes(field)) {
    return NextResponse.json({ error: 'Invalid identity field' }, { status: 400 })
  }

  try {
    let syncStatus: 'published' | 'pending_sync' | 'sync_conflict' | 'local' = 'local'
    let savedGrowthValue: string | string[] | undefined
    let publishedVersion: number | undefined
    if (isGrowthIdentityField(field)) {
      const result = await saveGrowthField(id, field, body, auth.user)
      syncStatus = result.state === 'discarded' ? 'published' : result.state
      savedGrowthValue = result.value
      publishedVersion = result.publishedVersion
    } else {
      await saveKanbanField(id, field, body?.value, auth.user)
    }
    const identity = await resolveBrandIdentity(id, { canEdit: true, skipGrowth: !isGrowthIdentityField(field) })
    if (!identity) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    const resolvedField = identity.fields[field]
    const responseField = isGrowthIdentityField(field) && syncStatus === 'published' && resolvedField.status !== 'published'
      ? {
          key: field,
          value: savedGrowthValue ?? resolvedField.value,
          source: 'growth' as const,
          status: 'published' as const,
          editable: true,
          version: publishedVersion ?? resolvedField.version,
        }
      : resolvedField
    return NextResponse.json(
      { ok: true, syncStatus, growthAvailable: identity.growthAvailable, field: responseField },
      { status: syncStatus === 'pending_sync' || syncStatus === 'sync_conflict' ? 202 : 200 }
    )
  } catch (error) {
    if (error instanceof IdentityValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[brand-identity] save failed:', error)
    return NextResponse.json({ error: 'Failed to save brand identity' }, { status: 500 })
  }
}

async function saveGrowthField(
  brandId: string,
  field: GrowthIdentityField,
  body: Record<string, unknown>,
  actor: { id: string; email?: string; type: string; userRoles?: string[] }
) {
  const expectedVersion = Number(body?.expectedVersion)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new IdentityValidationError('expectedVersion 必须是非负整数')
  }
  const value = field === 'sellingPoints' ? stringList(body?.value) : requiredText(body?.value)
  if (field === 'sellingPoints' && !value.length) throw new IdentityValidationError('核心卖点至少需要一项')

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      knowledge: { select: { brandTone: true, audienceAssumptions: true, productAssumptions: true } },
    },
  })
  if (!brand) throw new IdentityValidationError('品牌不存在')
  const oldValue = field === 'brandTone'
    ? optionalText(brand.knowledge?.brandTone)
    : field === 'targetAudience'
      ? optionalText(brand.knowledge?.audienceAssumptions)
      : legacyStringList(brand.knowledge?.productAssumptions)
  const result = await queueAndSyncGrowthIdentityChange({
    brandId,
    field,
    value,
    expectedVersion,
    actor,
    oldValue,
  })
  return { ...result, value }
}

async function saveKanbanField(
  brandId: string,
  field: Exclude<BrandIdentityFieldKey, GrowthIdentityField>,
  rawValue: unknown,
  actor: { id: string; email?: string; type: string }
) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const brand = await tx.brand.findUnique({
      where: { id: brandId },
      select: { location: true, knowledge: { select: { brandVoice: true, brandImage: true, promotionFocus: true, publishingFreq: true } } },
    })
    if (!brand) throw new IdentityValidationError('品牌不存在')
    let oldValue: unknown
    let nextValue: unknown

    if (field === 'operatingRegion') {
      oldValue = brand.location || ''
      nextValue = optionalText(rawValue)
      await tx.brand.update({ where: { id: brandId }, data: { location: nextValue || null } })
    } else if (field === 'publishingFrequency') {
      oldValue = normalizePublishingFrequency(brand.knowledge?.publishingFreq)
      const normalizedFrequency = mergePublishingFrequency(brand.knowledge?.publishingFreq, rawValue)
      nextValue = normalizedFrequency
      await tx.brandKnowledge.upsert({
        where: { brandId },
        update: { publishingFreq: normalizedFrequency as Prisma.InputJsonValue },
        create: { brandId, negPrompts: [], publishingFreq: normalizedFrequency as Prisma.InputJsonValue },
      })
    } else {
      const localKey = field === 'brandVoice' ? 'brandVoice' : field === 'brandImage' ? 'brandImage' : 'promotionFocus'
      oldValue = optionalText(brand.knowledge?.[localKey])
      nextValue = optionalText(rawValue)
      await tx.brandKnowledge.upsert({
        where: { brandId },
        update: { [localKey]: nextValue || null },
        create: { brandId, negPrompts: [], [localKey]: nextValue || null },
      })
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorType: actor.type || 'HUMAN',
        actorName: actor.email || null,
        action: 'BRAND_IDENTITY_FIELD_UPDATED',
        resourceId: `${brandId}:${field}`,
        resourceType: 'BrandIdentity',
        oldValue: jsonValue(oldValue),
        newValue: jsonValue(nextValue),
        metadata: { brandId, field, source: 'kanban' },
      },
    })
  })
}

function mergePublishingFrequency(currentValue: unknown, patchValue: unknown) {
  const current = normalizePublishingFrequency(currentValue)
  const patch = objectValue(patchValue)
  const postsPerDay = Object.prototype.hasOwnProperty.call(patch, 'postsPerDay')
    ? rate(patch.postsPerDay, '默认发布频次')
    : current.postsPerDay
  const platforms: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(current.platforms).map(([platform, config]) => [platform, { ...config }])
  )
  for (const [platform, configValue] of Object.entries(objectValue(patch.platforms))) {
    const config = objectValue(configValue)
    const next: Record<string, unknown> = { ...platforms[platform] }
    if (Object.prototype.hasOwnProperty.call(config, 'postsPerDay')) {
      if (config.postsPerDay === undefined || config.postsPerDay === '') delete next.postsPerDay
      else next.postsPerDay = rate(config.postsPerDay, `${platform} 每日频次`)
    }
    if (Object.prototype.hasOwnProperty.call(config, 'postsPerWeek')) {
      if (config.postsPerWeek === undefined || config.postsPerWeek === '') delete next.postsPerWeek
      else next.postsPerWeek = rate(config.postsPerWeek, `${platform} 每周频次`)
    }
    if (Object.prototype.hasOwnProperty.call(config, 'preferredHours')) {
      if (!Array.isArray(config.preferredHours)) {
        throw new IdentityValidationError(`${platform} 首选时段必须是数组`)
      }
      const hours = [...new Set(config.preferredHours.map(Number))]
      if (hours.some((hour) => !Number.isInteger(hour) || hour < 0 || hour > 23)) {
        throw new IdentityValidationError(`${platform} 首选时段必须在 0–23 之间`)
      }
      if (hours.length) next.preferredHours = hours
      else delete next.preferredHours
    }
    if (Object.keys(next).length) platforms[platform] = next
    else delete platforms[platform]
  }
  return { postsPerDay, platforms }
}

function rate(value: unknown, label: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0.5 || number > 20) {
    throw new IdentityValidationError(`${label}必须在 0.5–20 之间`)
  }
  return number
}

function requiredText(value: unknown) {
  const result = optionalText(value)
  if (!result) throw new IdentityValidationError('该字段不能为空')
  return result
}

function optionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(optionalText).filter(Boolean) : []
}

function legacyStringList(value: unknown) {
  return typeof value === 'string'
    ? value.split(/\r?\n/).map(item => item.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
    : []
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null))
}

class IdentityValidationError extends Error {}
