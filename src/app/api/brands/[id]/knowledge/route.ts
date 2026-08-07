import { after, NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { requestGameShareDraftPoolRefill } from '@/lib/gameShareDraftPool'

export const maxDuration = 60

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
  stores: true,
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
    stores: k.stores || [],
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
  stores: [] as any[],
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
    const ok = await canSessionAccessBrandProject(
      brandId,
      session.user.id,
      session.user.type ?? 'HUMAN',
      session.user.role,
    )
    if (!ok) {
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

  const identityKeys = [
    'brandTone',
    'audienceAssumptions',
    'productAssumptions',
    'promoPlan',
    'publishingFreq',
  ]
  const attemptedIdentityKeys = identityKeys.filter((key) => Object.prototype.hasOwnProperty.call(body, key))
  if (attemptedIdentityKeys.length) {
    return NextResponse.json(
      {
        error: '品牌定位字段请使用 /api/brands/:id/identity 逐字段保存',
        fields: attemptedIdentityKeys,
      },
      { status: 409 }
    )
  }

  const {
    // Section 1 (identity fields use /identity)
    slangDict, negPrompts, voiceId,
    // Section 2
    businessHours, reservationUrl, orderingUrl, deliveryUrls, stores,
    // Section 3
    market, district, competitors, menuItems,
  } = body

  const updateData: any = {}
  if (slangDict !== undefined) updateData.slangDict = slangDict
  if (negPrompts !== undefined) updateData.negPrompts = negPrompts
  if (voiceId !== undefined) updateData.voiceId = voiceId
  if (businessHours !== undefined) updateData.businessHours = businessHours
  if (reservationUrl !== undefined) updateData.reservationUrl = reservationUrl
  if (orderingUrl !== undefined) updateData.orderingUrl = orderingUrl
  if (deliveryUrls !== undefined) updateData.deliveryUrls = deliveryUrls
  if (stores !== undefined) updateData.stores = stores
  if (market !== undefined) updateData.market = market
  if (district !== undefined) updateData.district = district
  if (competitors !== undefined) updateData.competitors = competitors
  if (menuItems !== undefined) updateData.menuItems = menuItems

  const knowledge = await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: updateData,
    create: {
      brandId,
      slangDict: slangDict || {},
      negPrompts: negPrompts || [],
      menuItems: menuItems || [],
      voiceId: voiceId || '',
      businessHours: businessHours || null,
      reservationUrl: reservationUrl || '',
      orderingUrl: orderingUrl || '',
      deliveryUrls: deliveryUrls || [],
      stores: stores || [],
      market: market || '',
      district: district || '',
      competitors: competitors || [],
    },
  })

  if (menuItems !== undefined) {
    after(async () => {
      const gameConfig = await prisma.gameConfig.findUnique({ where: { brandId }, select: { id: true } })
      if (gameConfig) await requestGameShareDraftPoolRefill(gameConfig.id)
    })
  }

  return NextResponse.json({ ok: true, ...serializeKnowledge(knowledge) })
}
