import { prisma } from '@/lib/prisma'
import { readGrowthMerchantKnowledge } from '@/lib/growthDataCenter'

export const BRAND_IDENTITY_FIELDS = [
  'brandTone',
  'targetAudience',
  'sellingPoints',
  'operatingRegion',
  'brandVoice',
  'brandImage',
  'promotionFocus',
  'publishingFrequency',
] as const

export type BrandIdentityFieldKey = typeof BRAND_IDENTITY_FIELDS[number]
export type BrandIdentitySource = 'growth' | 'kanban' | 'legacy'
export type BrandIdentityStatus = 'published' | 'local' | 'legacy' | 'missing' | 'unavailable' | 'unlinked'

export type PublishingFrequencyValue = {
  postsPerDay: number
  platforms: Record<string, {
    postsPerDay?: number
    postsPerWeek?: number
    preferredHours?: number[]
  }>
}

export type BrandIdentityValue = string | string[] | PublishingFrequencyValue

export type BrandIdentityField = {
  key: BrandIdentityFieldKey
  value: BrandIdentityValue
  source: BrandIdentitySource
  status: BrandIdentityStatus
  editable: boolean
  version?: number
  knowledgeId?: string
  updatedAt?: string
  warning?: string
}

export type BrandIdentitySnapshot = {
  brandId: string
  growthBrandKey: string | null
  growthAvailable: boolean
  fields: Record<BrandIdentityFieldKey, BrandIdentityField>
}

type GrowthKnowledgeEntry = {
  knowledge_id?: string
  knowledge_key?: string
  statement?: string
  structured_value?: unknown
  version?: number
  updated_at?: string
}

const GROWTH_FIELD_KEYS: Record<'brandTone' | 'targetAudience' | 'sellingPoints', string> = {
  brandTone: 'brand.tone',
  targetAudience: 'audience.primary',
  sellingPoints: 'brand.unique_selling_points',
}

export async function resolveBrandIdentity(
  brandId: string,
  options: { canEdit?: boolean; skipGrowth?: boolean } = {}
): Promise<BrandIdentitySnapshot | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      location: true,
      growthBrandKey: true,
      knowledge: {
        select: {
          brandTone: true,
          audienceAssumptions: true,
          productAssumptions: true,
          promoPlan: true,
          publishingFreq: true,
        },
      },
    },
  })
  if (!brand) return null

  let growthAvailable = true
  let growthEntries: GrowthKnowledgeEntry[] = []
  if (brand.growthBrandKey && !options.skipGrowth) {
    try {
      const data = await readGrowthMerchantKnowledge(brand.growthBrandKey)
      growthEntries = Array.isArray(data.items)
        ? data.items
        : []
    } catch {
      growthAvailable = false
    }
  }
  if (brand.growthBrandKey && options.skipGrowth) growthAvailable = false

  const legacyValues = {
    brandTone: text(brand.knowledge?.brandTone),
    targetAudience: text(brand.knowledge?.audienceAssumptions),
    sellingPoints: legacyList(brand.knowledge?.productAssumptions),
  }
  const promoPlan = objectValue(brand.knowledge?.promoPlan)
  const canEdit = Boolean(options.canEdit)

  const fields = {
    brandTone: growthField('brandTone', growthEntries, legacyValues.brandTone, brand.growthBrandKey, growthAvailable, canEdit),
    targetAudience: growthField('targetAudience', growthEntries, legacyValues.targetAudience, brand.growthBrandKey, growthAvailable, canEdit),
    sellingPoints: growthField('sellingPoints', growthEntries, legacyValues.sellingPoints, brand.growthBrandKey, growthAvailable, canEdit),
    operatingRegion: localField('operatingRegion', text(brand.location), canEdit),
    brandVoice: localField('brandVoice', text(promoPlan.brandVoice), canEdit),
    brandImage: localField('brandImage', text(promoPlan.brandImage), canEdit),
    promotionFocus: localField('promotionFocus', text(promoPlan.direction), canEdit),
    publishingFrequency: localField('publishingFrequency', normalizePublishingFrequency(brand.knowledge?.publishingFreq), canEdit),
  } satisfies Record<BrandIdentityFieldKey, BrandIdentityField>

  return {
    brandId,
    growthBrandKey: brand.growthBrandKey,
    growthAvailable,
    fields,
  }
}

export function findGrowthIdentityEntry(
  entries: GrowthKnowledgeEntry[],
  field: 'brandTone' | 'targetAudience' | 'sellingPoints'
) {
  return entries.find((entry) => entry.knowledge_key === GROWTH_FIELD_KEYS[field])
}

export function serializeGrowthIdentityValue(
  field: 'brandTone' | 'targetAudience' | 'sellingPoints',
  value: string | string[],
  currentStructuredValue?: unknown
) {
  if (field === 'sellingPoints') return stringList(value)
  const current = objectValue(currentStructuredValue)
  return field === 'brandTone'
    ? { ...current, description: text(value) }
    : { ...current, summary: text(value) }
}

export function normalizePublishingFrequency(value: unknown): PublishingFrequencyValue {
  const raw = objectValue(value)
  const rawPlatforms = objectValue(raw.platforms)
  const platforms: PublishingFrequencyValue['platforms'] = {}
  for (const [platform, config] of Object.entries(rawPlatforms)) {
    const source = objectValue(config)
    const normalized: PublishingFrequencyValue['platforms'][string] = {}
    const postsPerDay = positiveRate(source.postsPerDay)
    const postsPerWeek = positiveRate(source.postsPerWeek)
    const preferredHours = Array.isArray(source.preferredHours)
      ? source.preferredHours.map(Number).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
      : []
    if (postsPerDay !== undefined) normalized.postsPerDay = postsPerDay
    if (postsPerWeek !== undefined) normalized.postsPerWeek = postsPerWeek
    if (preferredHours.length) normalized.preferredHours = [...new Set(preferredHours)]
    if (Object.keys(normalized).length) platforms[platform] = normalized
  }
  return {
    postsPerDay: positiveRate(raw.postsPerDay) ?? 1,
    platforms,
  }
}

function growthField(
  field: 'brandTone' | 'targetAudience' | 'sellingPoints',
  entries: GrowthKnowledgeEntry[],
  legacyValue: string | string[],
  growthBrandKey: string | null,
  growthAvailable: boolean,
  canEdit: boolean
): BrandIdentityField {
  const entry = findGrowthIdentityEntry(entries, field)
  if (entry) {
    return {
      key: field,
      value: growthDisplayValue(field, entry),
      source: 'growth',
      status: 'published',
      editable: canEdit && growthAvailable,
      version: Number(entry.version) || 0,
      knowledgeId: entry.knowledge_id,
      updatedAt: entry.updated_at,
    }
  }
  const hasLegacy = Array.isArray(legacyValue) ? legacyValue.length > 0 : Boolean(legacyValue)
  const status: BrandIdentityStatus = !growthBrandKey
    ? 'unlinked'
    : growthAvailable
      ? (hasLegacy ? 'legacy' : 'missing')
      : 'unavailable'
  return {
    key: field,
    value: legacyValue,
    source: hasLegacy ? 'legacy' : 'growth',
    status,
    editable: canEdit && (growthAvailable || !growthBrandKey),
    version: 0,
    warning: status === 'unavailable' ? 'AMC-Growth 暂时不可用，当前显示兼容数据。' : undefined,
  }
}

function localField(key: BrandIdentityFieldKey, value: BrandIdentityValue, editable: boolean): BrandIdentityField {
  return { key, value, source: 'kanban', status: 'local', editable }
}

function growthDisplayValue(field: 'brandTone' | 'targetAudience' | 'sellingPoints', entry: GrowthKnowledgeEntry) {
  if (field === 'sellingPoints') {
    const list = stringList(entry.structured_value)
    return list.length ? list : legacyList(entry.statement)
  }
  const structured = objectValue(entry.structured_value)
  const preferred = field === 'brandTone'
    ? structured.description ?? structured.tone ?? structured.summary
    : structured.summary ?? structured.description ?? structured.audience
  return text(preferred) || text(entry.statement)
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean)
  if (typeof value === 'string') return value.split(/\r?\n/).map((item) => item.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
  return []
}

function legacyList(value: unknown): string[] {
  const list = stringList(value)
  return list.length ? list : (text(value) ? [text(value)] : [])
}

function positiveRate(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0.5 && number <= 20 ? number : undefined
}
