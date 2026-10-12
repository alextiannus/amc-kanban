import { ensureScriptCollection, type CollectionSlotInput } from '@/lib/asset-library/collections'

function text(value: unknown, max = 2_000) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : []
}

function expectedTags(requirement: string) {
  const tags: string[] = []
  if (/门头|招牌|外观|storefront|signage/i.test(requirement)) tags.push('scene:storefront')
  if (/菜|餐|饮品|food|dish|drink/i.test(requirement)) tags.push('subject:dish')
  if (/顾客|员工|人物|person|customer|staff/i.test(requirement)) tags.push('subject:person')
  if (/环境|店内|空间|environment|interior/i.test(requirement)) tags.push('scene:environment')
  if (/特写|近景|close.?up/i.test(requirement)) tags.push('capture:close_up')
  if (/全景|广角|wide/i.test(requirement)) tags.push('capture:wide')
  return tags
}

export function collectionSlotsFromCreative(creative: any): CollectionSlotInput[] {
  const rows: Array<{ prefix: string; value: string }> = [
    ...stringList(creative?.materialRequirements).map(value => ({ prefix: 'material', value })),
    ...stringList(creative?.videoScript?.shots).map(value => ({ prefix: 'shot', value })),
  ]
  const seen = new Set<string>()
  const counters = new Map<string, number>()
  const slots: CollectionSlotInput[] = []
  for (const row of rows) {
    const normalized = row.value.toLocaleLowerCase('zh-CN')
    if (seen.has(normalized)) continue
    seen.add(normalized)
    const index = (counters.get(row.prefix) || 0) + 1
    counters.set(row.prefix, index)
    slots.push({
      slotKey: `${row.prefix}-${index}`,
      title: row.prefix === 'shot' ? `镜头 ${index}` : `素材 ${index}`,
      requirement: row.value,
      expectedTags: expectedTags(row.value),
      order: slots.length,
    })
  }
  return slots
}

export function creativeWaitsForAssets(creative: any) {
  return ['已确认', 'confirmed', 'waiting_for_assets'].includes(text(creative?.status, 50).toLowerCase())
}

export async function syncConfirmedCreativeCollection(input: {
  brandId: string
  creativeId: string
  creativeVersion: number
  month: string
  creative: any
  createdById?: string
}) {
  if (!creativeWaitsForAssets(input.creative)) return null
  const name = text(input.creative?.title, 300) || `创意 ${input.creativeId}`
  return ensureScriptCollection({
    brandId: input.brandId,
    creativeId: input.creativeId,
    creativeVersion: input.creativeVersion,
    month: input.month,
    name,
    createdById: input.createdById,
    slots: collectionSlotsFromCreative(input.creative),
  })
}
