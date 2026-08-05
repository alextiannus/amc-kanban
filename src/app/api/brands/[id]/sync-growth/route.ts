import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import {
  ensureGrowthMerchantForBrand,
  readGrowthMerchantData,
} from '@/lib/growthDataCenter'

type Params = { params: Promise<{ id: string }> }

/**
 * Compatibility endpoint for existing dashboard buttons.
 *
 * Verifies/creates the stable Growth link, reads canonical Growth knowledge,
 * then copies confirmed merchant facts back into Kanban's Brand/BrandKnowledge
 * record. This keeps the customer-facing AMC knowledge base usable without
 * scraping Google Maps or inventing missing facts.
 */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const { id } = await params

  if (session?.user) {
    if (!(await canOwnBrand(id, session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await canSessionAccessBrandProject(id, agent.id, 'AI_AGENT'))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const brand = await prisma.brand.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      description: true,
      growthBrandKey: true,
    },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  try {
    const growthBrandKey = await ensureGrowthMerchantForBrand(brand)
    const data = await readGrowthMerchantData(growthBrandKey)
    const copied = await copyGrowthFactsToKanban(id, data)
    return NextResponse.json({
      ok: true,
      source: 'growth',
      copiedToKanban: true,
      copied,
      merchantId: growthBrandKey,
      merchantName: data.profile?.canonical_name || data.profile?.name || brand.name,
      growthBrandKey,
      ...data,
    })
  } catch (error) {
    console.error('[sync-growth] canonical Growth read failed:', error)
    return NextResponse.json({
      error: 'Growth data center is temporarily unavailable',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 502 })
  }
}

async function copyGrowthFactsToKanban(brandId: string, data: any) {
  const value = (key: string) => knowledgeValue(data?.knowledge, key)
  const profile = data?.profile || {}
  const story = data?.brandStory || {}
  const plan = data?.growthPlan || {}
  const briefs = data?.contentBriefs || {}

  const brandName = firstText([
    profile.canonical_name,
    profile.name,
    value('brand.name'),
  ])
  const market = firstText([
    profile.market,
    value('market.country'),
    value('market.name'),
  ])
  const district = firstText([
    profile.area,
    value('location.district'),
    value('location.area'),
  ])
  const category = firstText([
    profile.category,
    value('brand.category'),
  ])
  const location = firstText([
    profile.area,
    value('location.area'),
    value('location.district'),
    value('market.name'),
  ])

  const description = firstText([
    story.story,
    story.positioning,
    plan.summary,
    profile.diagnosis,
    value('brand.story'),
    value('brand.positioning'),
  ])
  const brandTone = firstText([
    value('brand.tone'),
    firstBriefField(briefs, '语气'),
    firstBriefField(briefs, 'tone'),
  ])
  const audienceAssumptions = firstText([
    profile.audience_assumptions,
    value('audience.primary'),
    value('audience.assumptions'),
  ])
  const productAssumptions = firstText([
    profile.product_assumptions,
    story.positioning,
    value('brand.unique_selling_points'),
    value('product.assumptions'),
  ])

  const address = firstText([
    value('location.address'),
    firstActiveLocation(profile)?.address,
    firstStoreField(story.stores_info, 'address'),
  ])
  const phone = firstText([
    value('contact.phone'),
    firstActiveLocation(profile)?.phone,
  ])
  const website = firstText([
    value('contact.website'),
    value('brand.website'),
  ])
  const businessHours = firstText([
    value('operations.opening_hours'),
    firstStoreField(story.stores_info, 'businessHours'),
  ])
  const reservationUrl = firstText([
    value('operations.reservation'),
    value('contact.reservation_url'),
  ])
  const orderingUrl = firstText([
    value('operations.ordering'),
    value('contact.ordering_url'),
  ])
  const deliveryUrls = firstArray([
    value('operations.delivery'),
    value('contact.delivery_urls'),
  ])
  const explicitStores = firstArray([
    value('operations.store_details'),
    story.stores,
    story.stores_info,
    profile.locations,
  ])
  const stores = buildStores(explicitStores, {
    name: brandName,
    address,
    phone,
    businessHours,
    reservationUrl,
    orderingUrl,
  })
  const menuItems = firstArray([
    value('menu.items'),
    value('product.menu_items'),
    story.signature_dishes,
    profile.product_assumptions,
  ])
  const slangDict = firstRecord([
    value('brand.slang'),
    value('local.terminology'),
    value('slang.dict'),
  ])
  const negPrompts = firstStringArray([
    value('brand.negative_prompts'),
    value('copywriting.negative_prompts'),
    value('brand.forbidden_terms'),
  ])
  const competitors = firstStringArray([
    value('market.competitors'),
    value('competitors'),
  ])
  const promoPlan = normalizePromoPlan(firstRecord([
    value('promotion.plan'),
    value('campaign.plan'),
  ]), {
    direction: firstText([plan.summary, plan.implementation_scope]),
    copywritingRequirements: firstText([plan.content_needs]),
    brandVoice: brandTone,
    brandImage: firstText([story.positioning, profile.diagnosis]),
    keyMessages: stringArrayFromText(firstText([story.dining_guide])),
    campaigns: normalizeCampaigns(plan.phases),
  })
  const publishingFreq = normalizePublishingFreq(firstRecord([
    value('publishing.frequency'),
    value('content.publishing_frequency'),
    value('operations.publishing_frequency'),
  ]))
  const growthSyncHash = createHash('sha256')
    .update(JSON.stringify({ profile, story, plan, briefs }))
    .digest('hex')

  const brandUpdate: any = {}
  if (brandName) brandUpdate.name = brandName
  if (location) brandUpdate.location = location
  if (description) brandUpdate.description = description
  if (address) brandUpdate.address = address
  if (phone) brandUpdate.phone = phone
  if (website) brandUpdate.website = website

  const knowledgeUpdate: any = { growthSyncHash }
  if (menuItems.length > 0) knowledgeUpdate.menuItems = menuItems
  if (Object.keys(slangDict).length > 0) knowledgeUpdate.slangDict = slangDict
  if (brandTone) knowledgeUpdate.brandTone = brandTone
  if (negPrompts.length > 0) knowledgeUpdate.negPrompts = negPrompts
  if (audienceAssumptions) knowledgeUpdate.audienceAssumptions = audienceAssumptions
  if (productAssumptions) knowledgeUpdate.productAssumptions = productAssumptions
  if (businessHours) knowledgeUpdate.businessHours = businessHours
  if (reservationUrl) knowledgeUpdate.reservationUrl = reservationUrl
  if (orderingUrl) knowledgeUpdate.orderingUrl = orderingUrl
  if (deliveryUrls.length > 0) knowledgeUpdate.deliveryUrls = deliveryUrls as any
  if (stores.length > 0) knowledgeUpdate.stores = stores as any
  if (market) knowledgeUpdate.market = market
  if (district) knowledgeUpdate.district = district
  if (competitors.length > 0) knowledgeUpdate.competitors = competitors
  if (promoPlan) knowledgeUpdate.promoPlan = promoPlan
  if (publishingFreq) knowledgeUpdate.publishingFreq = publishingFreq

  await prisma.$transaction([
    ...(Object.keys(brandUpdate).length > 0
      ? [prisma.brand.update({ where: { id: brandId }, data: brandUpdate })]
      : []),
    prisma.brandKnowledge.upsert({
      where: { brandId },
      update: knowledgeUpdate,
      create: {
        brandId,
        brandTone: brandTone || '',
        slangDict: {},
        negPrompts,
        menuItems: menuItems as any,
        audienceAssumptions: audienceAssumptions || '',
        productAssumptions: productAssumptions || '',
        growthSyncHash,
        businessHours: businessHours || null,
        reservationUrl: reservationUrl || '',
        orderingUrl: orderingUrl || '',
        deliveryUrls: deliveryUrls as any,
        stores: stores as any,
        market,
        district,
        competitors,
        promoPlan,
        publishingFreq,
      },
    }),
  ])

  return {
    brandFields: Object.keys(brandUpdate),
    knowledgeFields: Object.keys(knowledgeUpdate),
    sourceResources: {
      profile: true,
      brandStory: Boolean(data?.brandStory),
      growthPlan: Boolean(data?.growthPlan),
      contentBriefs: Boolean(data?.contentBriefs),
      resourceStatus: data?.resourceStatus || null,
    },
    category,
  }
}

function knowledgeValue(knowledge: any, key: string) {
  const items = Array.isArray(knowledge?.items)
    ? knowledge.items
    : Array.isArray(knowledge)
      ? knowledge
      : []
  const item = items.find((entry: any) => entry?.knowledge_key === key)
  return item?.structured_value ?? item?.statement
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join('\n')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).trim()
}

function firstText(values: unknown[]): string {
  for (const value of values) {
    const text = textValue(value)
    if (text) return text
  }
  return ''
}

function arrayValue(value: unknown): any[] {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (!value) return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return stringArrayFromText(trimmed)
    }
  }
  if (typeof value === 'object') return [value]
  return []
}

function firstArray(values: unknown[]): any[] {
  for (const value of values) {
    const array = arrayValue(value)
    if (array.length > 0) return normalizeListItems(array)
  }
  return []
}

function stringArrayFromText(value: unknown): string[] {
  const text = textValue(value)
  if (!text) return []
  return text
    .split(/\n|；|;|。/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function firstStringArray(values: unknown[]): string[] {
  for (const value of values) {
    const array = Array.isArray(value) ? value.map(textValue).filter(Boolean) : stringArrayFromText(value)
    if (array.length > 0) return array
  }
  return []
}

function firstRecord(values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch {
        // Ignore non-JSON strings; free text is handled by explicit fields.
      }
    }
  }
  return {}
}

function normalizeListItems(items: any[]) {
  return items
    .flatMap((item) => {
      if (typeof item === 'string') return stringArrayFromText(item)
      return item
    })
    .map((item) => {
      if (typeof item !== 'string') return item
      return { name: item }
    })
    .filter(Boolean)
}

function firstActiveLocation(profile: any) {
  if (!Array.isArray(profile?.locations)) return null
  return profile.locations.find((item: any) => item?.status === 'active') || profile.locations[0] || null
}

function buildStores(explicitStores: any[], primary: Record<string, unknown>) {
  if (explicitStores.length > 0) {
    return explicitStores.map((store) => {
      if (typeof store !== 'string') {
        const name = textValue(store?.name)
        if (name && !store?.address) return parseStoreText(name, store)
        return store
      }
      return parseStoreText(store)
    })
  }
  const store = Object.fromEntries(
    Object.entries(primary)
      .map(([key, value]) => [key, textValue(value)])
      .filter(([, value]) => Boolean(value)),
  )
  return Object.keys(store).some((key) => ['name', 'address', 'phone', 'businessHours'].includes(key))
    ? [store]
    : []
}

function parseStoreText(input: string, base: Record<string, unknown> = {}) {
  const cleaned = input.replace(/\*\*/g, '').trim()
  const [namePart, ...rest] = cleaned.split(/[:：]/)
  const addressPart = rest.join('：')
  const addressMatch = cleaned.match(/\d+[A-Za-z]?\s+[A-Za-z][^。；;\n]*(?:Singapore|S(?:G)?\s*)\s*\d{6}/i)
  return {
    ...base,
    ...(namePart ? { name: namePart.replace(/^[-*]\s*/, '').trim() } : {}),
    address: (addressMatch?.[0] || addressPart || cleaned).replace(/[。；;]$/, '').trim(),
  }
}

function firstStoreField(storesInfo: unknown, field: 'address' | 'businessHours') {
  const text = textValue(storesInfo)
  if (!text) return ''
  if (field === 'businessHours') {
    const match = text.match(/营业(?:时间|时段)?(?:至|到)?[^，。,.\n]*(?:凌晨\s*\d+\s*点|\d{1,2}[:：]\d{2}\s*[-–]\s*\d{1,2}[:：]\d{2})/)
    return match?.[0]?.trim() || ''
  }
  const match = text.match(/\d+[A-Za-z]?\s+[A-Za-z][^。；;\n]*(?:Singapore|S(?:G)?\s*)\s*\d{6}/i)
  return match?.[0]?.replace(/[。；;]$/, '').trim() || ''
}

function firstBriefField(briefs: any, label: string) {
  const list = Array.isArray(briefs?.briefs) ? briefs.briefs : []
  for (const brief of list) {
    const content = textValue(brief?.content)
    const pattern = new RegExp(`${label}[：:]\\s*([^\\n]+)`, 'i')
    const match = content.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function normalizePromoPlan(record: Record<string, unknown>, defaults: Record<string, unknown>) {
  const plan = { ...record }
  for (const [key, value] of Object.entries(defaults)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'string' && !value.trim()) continue
    if (!(key in plan)) plan[key] = value
  }
  return Object.keys(plan).length > 0 ? plan : null
}

function normalizeCampaigns(phases: unknown) {
  if (!Array.isArray(phases)) return []
  return phases.map((phase: any) => ({
    name: textValue(phase?.name || phase?.key),
    dates: textValue(phase?.key),
    desc: textValue(phase?.content),
  })).filter((item) => item.name || item.desc)
}

function normalizePublishingFreq(record: Record<string, unknown>) {
  if (Object.keys(record).length === 0) return null
  const postsPerDay = Number(record.postsPerDay ?? record.posts_per_day)
  const normalized: Record<string, unknown> = { ...record }
  if (Number.isFinite(postsPerDay) && postsPerDay > 0) normalized.postsPerDay = postsPerDay
  if (!normalized.platforms || typeof normalized.platforms !== 'object') normalized.platforms = {}
  return normalized
}
