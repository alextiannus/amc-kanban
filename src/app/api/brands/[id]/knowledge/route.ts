import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

// ─── Shared field list (all BrandKnowledge fields) ───────────────────────────

const KNOWLEDGE_SELECT_FIELDS = {
  brandId: true,
  // Section 1: Brand Story
  brandTone: true,
  audienceAssumptions: true,
  productAssumptions: true,
  voiceId: true,
  negPrompts: true,
  slangDict: true,
  // Section 2: Business Info
  businessHours: true,
  reservationUrl: true,
  orderingUrl: true,
  deliveryUrls: true,
  // Section 3: Knowledge Base Config
  market: true,
  district: true,
  competitors: true,
  menuItems: true,
  // Section 4: Promotion Plan
  promoPlan: true,
  publishingFreq: true,
} as const

function serializeKnowledge(k: any) {
  return {
    brandId: k.brandId,
    // Section 1
    brandTone: k.brandTone || '',
    audienceAssumptions: k.audienceAssumptions || '',
    productAssumptions: k.productAssumptions || '',
    voiceId: k.voiceId || '',
    negPrompts: k.negPrompts || [],
    slangDict: k.slangDict || {},
    // Section 2
    businessHours: k.businessHours || null,
    reservationUrl: k.reservationUrl || '',
    orderingUrl: k.orderingUrl || '',
    deliveryUrls: k.deliveryUrls || [],
    // Section 3
    market: k.market || '',
    district: k.district || '',
    competitors: k.competitors || [],
    menuItems: k.menuItems || [],
    // Section 4
    promoPlan: k.promoPlan || null,
    publishingFreq: k.publishingFreq || null,
  }
}

const EMPTY_KNOWLEDGE = {
  brandId: '',
  brandTone: '',
  audienceAssumptions: '',
  productAssumptions: '',
  voiceId: '',
  negPrompts: [] as string[],
  slangDict: {} as Record<string, string>,
  businessHours: null,
  reservationUrl: '',
  orderingUrl: '',
  deliveryUrls: [] as any[],
  market: '',
  district: '',
  competitors: [] as string[],
  menuItems: [] as any[],
  promoPlan: null,
  publishingFreq: null,
}

export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId } = await params

  if (session?.user) {
    const ok = await canSessionAccessBrandProject(
      brandId,
      session.user.id,
      session.user.type ?? 'HUMAN',
      session.user.role
    )
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(brandId, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const knowledge = await prisma.brandKnowledge.findUnique({ where: { brandId } })
  if (!knowledge) return NextResponse.json({ ...EMPTY_KNOWLEDGE, brandId })

  return NextResponse.json(serializeKnowledge(knowledge))
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId } = await params

  if (session?.user) {
    if (!(await canOwnBrand(brandId, session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(brandId, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))

  // Validate and normalise publishingFreq before writing to DB.
  // Prevents postsPerDay: 0 / negative / Infinity from causing 1/postsPerDay = Infinity
  // in the scheduling algorithm.
  function normalizePublishingFreq(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const src = raw as Record<string, unknown>

    const clampRate = (v: unknown): number | undefined => {
      const n = typeof v === 'number' ? v : parseFloat(String(v))
      if (!isFinite(n) || n <= 0) return undefined
      return Math.min(Math.max(n, 0.5), 20) // 0.5–20 posts/day or posts/week
    }
    const clampHours = (arr: unknown): number[] | undefined => {
      if (!Array.isArray(arr)) return undefined
      const valid = arr
        .map((h) => (typeof h === 'number' ? Math.round(h) : parseInt(String(h), 10)))
        .filter((h) => isFinite(h) && h >= 0 && h <= 23)
      return valid.length > 0 ? valid : undefined
    }

    const normalized: Record<string, unknown> = {}
    const ppd = clampRate(src.postsPerDay)
    if (ppd !== undefined) normalized.postsPerDay = ppd

    if (src.platforms && typeof src.platforms === 'object' && !Array.isArray(src.platforms)) {
      const platforms: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(src.platforms as Record<string, unknown>)) {
        if (!val || typeof val !== 'object' || Array.isArray(val)) continue
        const pCfg = val as Record<string, unknown>
        const pNorm: Record<string, unknown> = {}
        const pPpd = clampRate(pCfg.postsPerDay)
        const pPpw = clampRate(pCfg.postsPerWeek)
        const pHrs = clampHours(pCfg.preferredHours)
        if (pPpd !== undefined) pNorm.postsPerDay = pPpd
        if (pPpw !== undefined) pNorm.postsPerWeek = pPpw
        if (pHrs !== undefined) pNorm.preferredHours = pHrs
        if (Object.keys(pNorm).length > 0) platforms[key] = pNorm
      }
      if (Object.keys(platforms).length > 0) normalized.platforms = platforms
    }

    return Object.keys(normalized).length > 0 ? normalized : null
  }

  const {
    // Section 1
    brandTone, slangDict, negPrompts, voiceId,
    audienceAssumptions, productAssumptions,
    // Section 2
    businessHours, reservationUrl, orderingUrl, deliveryUrls,
    // Section 3
    market, district, competitors, menuItems,
    // Section 4
    promoPlan, publishingFreq,
  } = body

  const updateData: any = {}
  if (brandTone !== undefined) updateData.brandTone = brandTone
  if (slangDict !== undefined) updateData.slangDict = slangDict
  if (negPrompts !== undefined) updateData.negPrompts = negPrompts
  if (voiceId !== undefined) updateData.voiceId = voiceId
  if (audienceAssumptions !== undefined) updateData.audienceAssumptions = audienceAssumptions
  if (productAssumptions !== undefined) updateData.productAssumptions = productAssumptions
  if (businessHours !== undefined) updateData.businessHours = businessHours
  if (reservationUrl !== undefined) updateData.reservationUrl = reservationUrl
  if (orderingUrl !== undefined) updateData.orderingUrl = orderingUrl
  if (deliveryUrls !== undefined) updateData.deliveryUrls = deliveryUrls
  if (market !== undefined) updateData.market = market
  if (district !== undefined) updateData.district = district
  if (competitors !== undefined) updateData.competitors = competitors
  if (menuItems !== undefined) updateData.menuItems = menuItems
  if (promoPlan !== undefined) updateData.promoPlan = promoPlan
  if (publishingFreq !== undefined) {
    const normalized = normalizePublishingFreq(publishingFreq)
    // Only reject if caller explicitly sent an unparseable non-null value
    if (publishingFreq !== null && normalized === null) {
      return NextResponse.json(
        { error: 'publishingFreq 格式无效：postsPerDay 必须为 0.5–20 之间的正数' },
        { status: 400 }
      )
    }
    updateData.publishingFreq = normalized
  }

  const knowledge = await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: updateData,
    create: {
      brandId,
      brandTone: brandTone || '',
      slangDict: slangDict || {},
      negPrompts: negPrompts || [],
      menuItems: menuItems || [],
      voiceId: voiceId || '',
      audienceAssumptions: audienceAssumptions || '',
      productAssumptions: productAssumptions || '',
      businessHours: businessHours || null,
      reservationUrl: reservationUrl || '',
      orderingUrl: orderingUrl || '',
      deliveryUrls: deliveryUrls || [],
      market: market || '',
      district: district || '',
      competitors: competitors || [],
      promoPlan: promoPlan || null,
      publishingFreq: 'publishingFreq' in updateData ? updateData.publishingFreq : (publishingFreq || null),
    },
  })

  return NextResponse.json({ ok: true, ...serializeKnowledge(knowledge) })
}
