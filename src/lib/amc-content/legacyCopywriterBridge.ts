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

  // Build an enriched description that includes audience, product, and market context
  // so the LLM prompt carries the full 4-module brand knowledge even if BrandContext
  // doesn't have dedicated fields for them yet.
  const descParts: string[] = []
  if (brand.description) descParts.push(brand.description)
  if (knowledge?.audienceAssumptions) descParts.push(`[目标客群] ${knowledge.audienceAssumptions}`)
  if (knowledge?.productAssumptions)  descParts.push(`[核心卖点] ${knowledge.productAssumptions}`)
  if (knowledge?.market || knowledge?.district) {
    descParts.push(`[所在市场] ${[knowledge.market, knowledge.district].filter(Boolean).join(' · ')}`)
  }
  if (Array.isArray(knowledge?.competitors) && knowledge.competitors.length > 0) {
    descParts.push(`[主要竞争对手] ${knowledge.competitors.join(', ')}`)
  }
  if (knowledge?.businessHours) descParts.push(`[营业时间] ${String(knowledge.businessHours)}`)

  // Build requiredTerms from reservation / ordering links so copywriter can mention CTAs
  const requiredTerms: string[] = []
  if (knowledge?.reservationUrl) requiredTerms.push(`订座: ${knowledge.reservationUrl}`)
  if (knowledge?.orderingUrl)    requiredTerms.push(`下单: ${knowledge.orderingUrl}`)

  return {
    id: brand.id,
    name: brand.name,
    description: descParts.join('\n') || undefined,
    tone: knowledge?.brandTone ?? undefined,
    address: brand.address ?? undefined,
    location: brand.location ?? undefined,
    website: brand.website ?? undefined,
    phone: brand.phone ?? undefined,
    negativePrompts: knowledge?.negPrompts ?? undefined,
    slang: normalizeRecord(knowledge?.slangDict),
    ...(requiredTerms.length > 0 ? { requiredTerms } : {}),
  }
}

function toCopyBrief(input: LegacyCopywriterBridgeInput, industryVertical: IndustryVertical): CopyBrief {
  const knowledge = input.brand.knowledge
  const promoPlan = knowledge?.promoPlan as Record<string, any> | null | undefined

  const theme = input.userPrompt
    || input.task?.title
    || input.task?.description
    || promoPlan?.direction
    || input.brand.description
    || `${input.brand.name} local service update`

  // Assemble angle: caller's creative hooks → marketing strategy → promo plan direction/requirements
  const angleParts: string[] = []
  if (input.creativeHooks)   angleParts.push(input.creativeHooks)
  if (input.marketingStrategy) angleParts.push(input.marketingStrategy)
  if (promoPlan?.direction && !angleParts.includes(promoPlan.direction))
    angleParts.push(`[本期推广方向] ${promoPlan.direction}`)
  if (promoPlan?.copywritingRequirements)
    angleParts.push(`[文案要求] ${promoPlan.copywritingRequirements}`)
  if (promoPlan?.brandVoice)  angleParts.push(`[品牌 Voice] ${promoPlan.brandVoice}`)
  if (promoPlan?.brandImage)  angleParts.push(`[品牌形象] ${promoPlan.brandImage}`)

  // Merge mustMention: caller's list + promo plan key messages
  const mustMention: string[] = [
    ...(input.mustMention ?? []),
    ...(Array.isArray(promoPlan?.keyMessages) ? promoPlan!.keyMessages : []),
  ]

  return {
    industryVertical,
    offerType: input.offerType,
    theme,
    angle: angleParts.length > 0 ? angleParts.join(' | ') : undefined,
    customerIntent: input.customerIntent || inferCustomerIntent(theme, input.creativeHooks),
    targetEmotion: input.targetEmotion,
    formatHint: input.formatHint,
    locationFocus: input.locationFocus || input.brand.location || input.brand.address || undefined,
    localProof: input.localProof?.length ? input.localProof : inferLocalProof(input),
    mustMention: mustMention.length > 0 ? mustMention : undefined,
    mustAvoid: [
      ...(input.mustAvoid ?? []),
      ...(knowledge?.negPrompts ?? []),
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
