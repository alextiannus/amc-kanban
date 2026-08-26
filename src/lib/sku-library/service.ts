export type SkuItemType = 'single' | 'bundle' | 'service'

export type SkuLibraryItem = {
  id?: string
  type?: SkuItemType
  name: string
  price?: string
  currency?: string
  description?: string
  imageUrl?: string
  serves?: string
  bundleItems?: string | string[]
  tags?: string[]
  isHotSeller?: boolean
  isHighRepeat?: boolean
  isMerchantPick?: boolean
  isSignature?: boolean
}

export type SkuLibraryResponse = {
  items: SkuLibraryItem[]
  highlights: SkuLibraryItem[]
  summary: {
    total: number
    singles: number
    bundles: number
    services: number
    priced: number
    priorityItems: number
  }
}

export function createSkuId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `sku_${crypto.randomUUID()}`
  }
  return `sku_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(item => stringValue(item)).filter(Boolean)
    : []
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeType(value: unknown, tags: string[]): SkuItemType {
  const text = stringValue(value)
  if (text === 'bundle' || tags.includes('套餐')) return 'bundle'
  if (text === 'service' || tags.includes('服务')) return 'service'
  return 'single'
}

export function normalizeSkuLibraryItem(item: unknown): SkuLibraryItem {
  if (typeof item === 'string') return { id: createSkuId(), type: 'single', name: item }
  const raw = rawObject(item)
  const tags = stringArray(raw.tags)
  return {
    id: stringValue(raw.id) || createSkuId(),
    type: normalizeType(raw.type, tags),
    name: stringValue(raw.name || raw.title),
    price: stringValue(raw.price),
    currency: stringValue(raw.currency) || 'S$',
    description: stringValue(raw.description),
    imageUrl: stringValue(raw.imageUrl || raw.image),
    serves: stringValue(raw.serves),
    bundleItems: Array.isArray(raw.bundleItems)
      ? stringArray(raw.bundleItems).join(' / ')
      : stringValue(raw.bundleItems),
    tags,
    isHotSeller: Boolean(raw.isHotSeller || tags.includes('热销品') || tags.includes('热销') || tags.includes('hot_seller')),
    isHighRepeat: Boolean(raw.isHighRepeat || tags.includes('高复购品') || tags.includes('高复购') || tags.includes('high_repeat')),
    isMerchantPick: Boolean(raw.isMerchantPick || tags.includes('商家主推') || tags.includes('主推品') || tags.includes('主推') || tags.includes('merchant_pick')),
    isSignature: Boolean(raw.isSignature || tags.includes('招牌') || tags.includes('signature')),
  }
}

export function normalizeSkuLibrary(items: unknown): SkuLibraryItem[] {
  return (Array.isArray(items) ? items : [])
    .map(normalizeSkuLibraryItem)
    .filter(item => item.name)
}

export function serializeSkuLibraryItem(item: SkuLibraryItem): SkuLibraryItem {
  const tags = new Set(item.tags || [])
  if (item.isHotSeller) tags.add('热销品')
  if (item.isHighRepeat) tags.add('高复购品')
  if (item.isMerchantPick) tags.add('商家主推')
  if (item.isSignature) tags.add('招牌')
  if (item.type === 'bundle') tags.add('套餐')
  if (item.type === 'service') tags.add('服务')
  return {
    id: item.id || createSkuId(),
    type: item.type || 'single',
    name: item.name.trim(),
    price: item.price?.trim() || '',
    currency: item.currency?.trim() || 'S$',
    description: item.description?.trim() || '',
    imageUrl: item.imageUrl?.trim() || '',
    serves: item.serves?.trim() || '',
    bundleItems: Array.isArray(item.bundleItems)
      ? item.bundleItems.map(value => String(value).trim()).filter(Boolean).join(' / ')
      : item.bundleItems?.trim() || '',
    tags: Array.from(tags),
    isHotSeller: Boolean(item.isHotSeller),
    isHighRepeat: Boolean(item.isHighRepeat),
    isMerchantPick: Boolean(item.isMerchantPick),
    isSignature: Boolean(item.isSignature),
  }
}

export function serializeSkuLibrary(items: unknown) {
  return normalizeSkuLibrary(items)
    .map(serializeSkuLibraryItem)
    .filter(item => item.name)
}

export function skuPriorityScore(item: SkuLibraryItem) {
  return Number(Boolean(item.isMerchantPick))
    + Number(Boolean(item.isSignature))
    + Number(Boolean(item.type === 'bundle'))
    + Number(Boolean(item.isHotSeller))
    + Number(Boolean(item.isHighRepeat))
}

export function sortSkuLibrary(items: SkuLibraryItem[]) {
  return [...items].sort((left, right) => skuPriorityScore(right) - skuPriorityScore(left))
}

export function skuBadges(item: SkuLibraryItem) {
  return [
    item.isHotSeller ? '热销' : '',
    item.isHighRepeat ? '高复购' : '',
    item.isMerchantPick ? '主推' : '',
    item.isSignature ? '招牌' : '',
    item.type === 'bundle' ? '套餐' : item.type === 'service' ? '服务' : '',
  ].filter(Boolean)
}

export function formatSkuPrice(item: SkuLibraryItem) {
  if (!item.price) return ''
  if (/^\$|^S\$|^RM|^¥|^￥/.test(item.price)) return item.price
  return `${item.currency || 'S$'}${item.price}`
}

export function skuLibrarySummary(items: SkuLibraryItem[]) {
  return {
    total: items.length,
    singles: items.filter(item => item.type === 'single').length,
    bundles: items.filter(item => item.type === 'bundle').length,
    services: items.filter(item => item.type === 'service').length,
    priced: items.filter(item => item.price).length,
    priorityItems: items.filter(item => skuPriorityScore(item) > 0).length,
  }
}

export function buildSkuLibraryResponse(items: unknown): SkuLibraryResponse {
  const normalized = normalizeSkuLibrary(items)
  return {
    items: normalized,
    highlights: sortSkuLibrary(normalized).slice(0, 8),
    summary: skuLibrarySummary(normalized),
  }
}

export function skuLibraryForLLM(items: unknown, limit = 24) {
  return sortSkuLibrary(normalizeSkuLibrary(items))
    .slice(0, limit)
    .map(item => ({
      id: item.id,
      type: item.type || 'single',
      name: item.name,
      price: item.price,
      currency: item.currency || 'S$',
      description: item.description,
      imageUrl: item.imageUrl,
      serves: item.serves,
      bundleItems: Array.isArray(item.bundleItems)
        ? item.bundleItems
        : stringValue(item.bundleItems).split(/[、,，/]/).map(value => value.trim()).filter(Boolean),
      tags: item.tags || [],
      priorityLabels: [
        item.isHotSeller ? '热销品' : '',
        item.isHighRepeat ? '高复购品' : '',
        item.isMerchantPick ? '商家当下主推/主理人判断有潜力' : '',
        item.isSignature ? '招牌' : '',
        item.type === 'bundle' ? '套餐' : '',
        item.type === 'service' ? '服务' : '',
      ].filter(Boolean),
      priorityScore: skuPriorityScore(item),
      useRule: '价格、套餐内容、适合人数和分类标签可用于内容创意；没有明确价格时不要编价格。',
    }))
}

export function skuContextLines(items: unknown, limit = 15) {
  return sortSkuLibrary(normalizeSkuLibrary(items))
    .slice(0, limit)
    .map(item => {
      const tags = item.tags?.filter(Boolean).join(', ') || ''
      const price = formatSkuPrice(item)
      const serves = item.serves ? ` serves ${item.serves}` : ''
      const bundle = item.bundleItems ? ` bundle: ${Array.isArray(item.bundleItems) ? item.bundleItems.join(' / ') : item.bundleItems}` : ''
      const labels = [
        item.type === 'bundle' ? 'bundle' : item.type === 'service' ? 'service' : '',
        item.isHotSeller ? 'hot seller' : '',
        item.isHighRepeat ? 'high repeat' : '',
        item.isMerchantPick ? 'merchant pick' : '',
        item.isSignature ? 'signature' : '',
        tags,
      ].filter(Boolean).join(', ')
      return `  - ${item.name}${price ? ` (${price})` : ''}${labels ? ` [${labels}]` : ''}${serves}${bundle}${item.description ? `: ${item.description}` : ''}`
    })
}
