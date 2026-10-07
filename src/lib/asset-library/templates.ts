export type StandardFolderKey = 'brand_storefront' | 'dishes_drinks' | 'store_environment' | 'people_service' | 'preparation' | 'events_atmosphere' | 'menu_pricing' | 'original_video' | 'needs_review' | 'not_recommended'
export type StandardFolder = { key: StandardFolderKey; zh: string; en: string }
export type IndustryFolderTemplate = { key: string; folders: StandardFolder[] }

type AnalysisLike = {
  contentType?: string; tags?: string[]; needsReview?: boolean
  subjects?: Array<{ type: string; name?: string; confidence?: number }>
  captureType?: string; quality?: { overall?: number }
  textDetection?: { items?: Array<{ type?: string }>; hasRiskText?: boolean }
}

const base: StandardFolder[] = [
  { key: 'brand_storefront', zh: '品牌与门头', en: 'Brand and storefront' },
  { key: 'dishes_drinks', zh: '菜品与饮品', en: 'Dishes and drinks' },
  { key: 'store_environment', zh: '门店与空间', en: 'Store and environment' },
  { key: 'people_service', zh: '人物与服务', en: 'People and service' },
  { key: 'preparation', zh: '制作过程', en: 'Preparation process' },
  { key: 'events_atmosphere', zh: '活动与氛围', en: 'Events and atmosphere' },
  { key: 'menu_pricing', zh: '菜单与价格', en: 'Menu and pricing' },
  { key: 'original_video', zh: '视频原片', en: 'Original video' },
  { key: 'needs_review', zh: '待确认', en: 'Needs review' },
  { key: 'not_recommended', zh: '不建议使用', en: 'Not recommended' },
]
const relabel = (changes: Partial<Record<StandardFolderKey, Pick<StandardFolder, 'zh' | 'en'>>> = {}) => base.map(folder => ({ ...folder, ...(changes[folder.key] || {}) }))
export const RESTAURANT_TEMPLATE: IndustryFolderTemplate = { key: 'restaurant-v1', folders: relabel() }
export const RETAIL_TEMPLATE: IndustryFolderTemplate = { key: 'retail-v1', folders: relabel({ dishes_drinks: { zh: '商品与包装', en: 'Products and packaging' }, preparation: { zh: '使用与展示', en: 'Use and demonstration' }, menu_pricing: { zh: '目录与价格', en: 'Catalog and pricing' } }) }
export const SERVICE_TEMPLATE: IndustryFolderTemplate = { key: 'service-v1', folders: relabel({ dishes_drinks: { zh: '服务与案例', en: 'Services and cases' }, preparation: { zh: '服务过程', en: 'Service process' }, menu_pricing: { zh: '项目与价格', en: 'Offerings and pricing' } }) }
export const GENERAL_TEMPLATE: IndustryFolderTemplate = { key: 'general-v1', folders: relabel({ dishes_drinks: { zh: '产品与内容', en: 'Products and content' }, preparation: { zh: '过程与演示', en: 'Process and demonstration' }, menu_pricing: { zh: '信息与价格', en: 'Information and pricing' } }) }

export function templateForIndustry(industry: unknown): IndustryFolderTemplate {
  const value = String(industry || '').trim().toLowerCase()
  if (/restaurant|food|f&b|餐饮|餐厅|饭店|cafe|咖啡/.test(value)) return RESTAURANT_TEMPLATE
  if (/retail|零售|商店|shop|fashion|服装|美容|beauty/.test(value)) return RETAIL_TEMPLATE
  if (/service|服务|consult|agency|clinic|education|培训/.test(value)) return SERVICE_TEMPLATE
  return GENERAL_TEMPLATE
}
export const folderForKey = (template: IndustryFolderTemplate, key: StandardFolderKey) => template.folders.find(folder => folder.key === key) || GENERAL_TEMPLATE.folders.find(folder => folder.key === key)!

export function canonicalFolderForAnalysis(_template: IndustryFolderTemplate, result: AnalysisLike, mimeType = 'image/jpeg'): StandardFolderKey {
  if (result.needsReview) return 'needs_review'
  if (typeof result.quality?.overall === 'number' && result.quality.overall < .35) return 'not_recommended'
  if (mimeType.startsWith('video/')) return 'original_video'
  const types = new Set((result.subjects || []).map(subject => subject.type.trim().toLowerCase()))
  const text = [result.contentType || '', ...(result.tags || []), ...(result.subjects || []).map(subject => subject.name || '')].join(' ').toLowerCase()
  if (types.has('menu') || types.has('price') || /菜单|价格|menu|price|价目/.test(text)) return 'menu_pricing'
  if (/制作|烹饪|备餐|加工|过程|cooking|preparation|making|behind.?the.?scenes/.test(text)) return 'preparation'
  if (types.has('dish') || types.has('food') || types.has('product') || /菜|餐|饮品|food|dish|meal|drink|beverage|product/.test(text)) return 'dishes_drinks'
  if (types.has('person') || /人物|顾客|员工|服务|person|people|customer|staff|service/.test(text)) return 'people_service'
  if (types.has('event') || types.has('banquet') || /活动|宴席|聚会|event|banquet|party|atmosphere/.test(text)) return 'events_atmosphere'
  if (/门头|招牌|品牌|logo|storefront|signage|facade/.test(text)) return 'brand_storefront'
  if (types.has('store') || types.has('environment') || /门店|环境|店内|空间|store|interior|exterior|environment/.test(text)) return 'store_environment'
  return 'needs_review'
}

const subjectType = (value: string) => ({ dish: 'dish', food: 'dish', '菜品': 'dish', store: 'scene', environment: 'scene', '门店环境': 'scene', person: 'person', '人物': 'person', menu: 'menu', price: 'menu', '菜单': 'menu', event: 'event', banquet: 'event', '活动': 'event' }[value.trim().toLowerCase()] || value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'subject')
export function generatedClassificationTags(result: AnalysisLike): string[] {
  const tags: string[] = []
  for (const subject of result.subjects || []) if (subject.name?.trim() && (subject.confidence ?? 0) >= .7) tags.push(`${subjectType(subject.type)}:${subject.name.trim()}`)
  if (result.captureType?.trim() && !['unknown', 'other'].includes(result.captureType.trim().toLowerCase())) tags.push(`capture:${result.captureType.trim()}`)
  for (const item of result.textDetection?.items || []) if (item.type?.trim() && item.type !== 'other') tags.push(`ocr:${item.type.trim()}`)
  return [...new Set(tags)]
}
