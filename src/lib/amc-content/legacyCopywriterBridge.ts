import {
  createPlatformContent,
  type BrandContext,
  type CopyBrief,
  type IndustryVertical,
  type MediaAssetContext,
  type PlatformType,
  type PlatformContentResult,
} from 'amc-content'
import { createAmcContentModelRouter } from './modelRouterAdapter.ts'
import { createPrismaKnowledgeRepository } from './knowledgeRepositoryAdapter.ts'
import { createPrismaContentLogger } from './loggerAdapter.ts'
import { createFilePromptTuningRepository } from './promptTuningRepositoryAdapter.ts'

type LegacyCopywriterBridgeInput = {
  brand: any
  platform?: string
  industryVertical?: IndustryVertical
  task?: { title?: string | null; description?: string | null } | null
  userPrompt?: string
  creativeHooks?: string
  marketingStrategy?: string
  offerType?: string
  customerIntent?: string
  targetEmotion?: string
  formatHint?: string
  locationFocus?: string
  localProof?: string[]
  mustMention?: string[]
  mustAvoid?: string[]
  draftId?: string | null
  mediaUrls?: string[]
  attachedAssets?: Array<{
    id?: string
    url: string
    mimeType?: string
    aiTags?: string[]
    aiCategory?: string | null
    aiCaption?: string | null
  }>
  assigneeId?: string
}

export async function tryGenerateWithAmcContent(
  input: LegacyCopywriterBridgeInput,
): Promise<PlatformContentResult | null> {
  const platform = normalizePlatform(input.platform)
  if (!platform) return null

  const vertical = input.industryVertical ?? inferVertical(input)
  const brand = toBrandContext(input.brand)
  const brief = toCopyBrief(input, vertical)
  const media = toMediaContext(input)

  return createPlatformContent({
    brand,
    brief,
    platform,
    media,
    draftId: input.draftId ?? undefined,
    adapters: {
      modelRouter: createAmcContentModelRouter(),
      knowledgeRepository: createPrismaKnowledgeRepository(),
      promptTuningRepository: createFilePromptTuningRepository(),
      logger: createPrismaContentLogger(input.assigneeId || 'copywriter@platform.amc'),
    },
  })
}

function normalizePlatform(platform?: string): PlatformType | null {
  const value = (platform || '').toLowerCase()
  if (['xiaohongshu', 'red', 'xhs', 'rednote', 'redbook'].includes(value)) return 'xiaohongshu'
  if (['instagram', 'ig', 'ins'].includes(value)) return 'instagram'
  if (['facebook', 'fb'].includes(value)) return 'facebook'
  if (['google_business', 'google', 'google_maps', 'gbp', 'gmb'].includes(value)) return 'google_business'
  if (['tiktok', 'tt'].includes(value)) return 'tiktok'
  return null
}

function toBrandContext(brand: any): BrandContext {
  const knowledge = brand.knowledge
  return {
    id: brand.id,
    name: brand.name,
    description: brand.description ?? undefined,
    tone: knowledge?.brandTone ?? undefined,
    address: brand.address ?? undefined,
    location: brand.location ?? undefined,
    website: brand.website ?? undefined,
    phone: brand.phone ?? undefined,
    negativePrompts: knowledge?.negPrompts ?? undefined,
    slang: normalizeRecord(knowledge?.slangDict),
  }
}

function toCopyBrief(input: LegacyCopywriterBridgeInput, industryVertical: IndustryVertical): CopyBrief {
  const theme = input.userPrompt
    || input.task?.title
    || input.task?.description
    || input.brand.description
    || `${input.brand.name} local service update`

  return {
    industryVertical,
    offerType: input.offerType,
    theme,
    angle: input.creativeHooks || input.marketingStrategy || undefined,
    customerIntent: input.customerIntent || inferCustomerIntent(theme, input.creativeHooks),
    targetEmotion: input.targetEmotion,
    formatHint: input.formatHint,
    locationFocus: input.locationFocus || input.brand.location || input.brand.address || undefined,
    localProof: input.localProof?.length ? input.localProof : inferLocalProof(input),
    mustMention: input.mustMention,
    mustAvoid: [
      ...(input.mustAvoid ?? []),
      ...(input.brand.knowledge?.negPrompts ?? []),
    ],
  }
}

function toMediaContext(input: LegacyCopywriterBridgeInput): MediaAssetContext[] {
  const byUrl = new Map<string, MediaAssetContext>()

  for (const asset of input.attachedAssets ?? []) {
    byUrl.set(asset.url, {
      id: asset.id,
      url: asset.url,
      mimeType: asset.mimeType,
      tags: asset.aiTags,
      category: asset.aiCategory ?? undefined,
      caption: asset.aiCaption ?? undefined,
    })
  }

  for (const url of input.mediaUrls ?? []) {
    if (!byUrl.has(url)) {
      byUrl.set(url, { url })
    }
  }

  return Array.from(byUrl.values())
}

function inferVertical(input: LegacyCopywriterBridgeInput): IndustryVertical {
  const text = [
    input.brand.name,
    input.brand.description,
    input.brand.knowledge?.brandTone,
    input.userPrompt,
    input.creativeHooks,
    input.marketingStrategy,
    input.task?.title,
    input.task?.description,
  ].filter(Boolean).join(' ').toLowerCase()

  if (matches(text, ['restaurant', 'cafe', 'coffee', 'bar', 'food', 'menu', 'dish', 'dining', 'bakery', 'wine', '美食', '餐厅', '咖啡', '菜单'])) return 'food_beverage'
  if (matches(text, ['beauty', 'salon', 'spa', 'wellness', 'facial', 'nail', 'hair', '美容', '美甲', '水疗'])) return 'beauty_wellness'
  if (matches(text, ['fitness', 'pilates', 'gym', 'yoga', 'workout', '普拉提', '健身', '瑜伽'])) return 'fitness_pilates'
  if (matches(text, ['renovation', 'interior', 'contractor', 'steel', 'home', '装修', '室内设计', '家装'])) return 'home_renovation'
  if (matches(text, ['pet', 'grooming', 'vet', 'dog', 'cat', '宠物', '猫', '狗'])) return 'pet_services'
  if (matches(text, ['tuition', 'school', 'course', 'training', 'education', 'academy', '课程', '教育', '培训'])) return 'education_training'
  if (matches(text, ['clinic', 'doctor', 'dental', 'physio', 'healthcare', '诊所', '牙医', '医疗'])) return 'healthcare_clinic'
  if (matches(text, ['retail', 'shop', 'boutique', 'store', 'fashion', 'jewelry', '零售', '精品店'])) return 'retail_specialty'
  if (matches(text, ['event', 'party', 'studio', 'karaoke', 'entertainment', '活动', '派对', '娱乐'])) return 'events_entertainment'
  if (matches(text, ['law', 'accounting', 'consulting', 'agency', 'insurance', 'service', '咨询', '会计', '律师'])) return 'professional_services'

  return 'general_local_service'
}

function inferCustomerIntent(theme?: string, angle?: string): string | undefined {
  const text = `${theme ?? ''} ${angle ?? ''}`.toLowerCase()
  if (matches(text, ['book', 'reservation', 'appointment', '预约', '预订'])) return 'booking'
  if (matches(text, ['promo', 'offer', 'discount', 'deal', '优惠', '折扣', '活动'])) return 'offer discovery'
  if (matches(text, ['visit', 'walk in', '打卡', '到店'])) return 'store visit'
  if (matches(text, ['learn', 'guide', 'tips', '教程', '攻略'])) return 'education'
  return undefined
}

function inferLocalProof(input: LegacyCopywriterBridgeInput): string[] {
  return [
    input.brand.address ? `Address: ${input.brand.address}` : '',
    input.brand.location ? `Area: ${input.brand.location}` : '',
    ...(input.attachedAssets ?? []).flatMap((asset) => asset.aiTags ?? []).slice(0, 6),
  ].filter(Boolean)
}

function normalizeRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, string>
}

function matches(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}
