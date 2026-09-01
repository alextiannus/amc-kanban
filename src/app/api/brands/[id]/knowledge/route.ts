import { after, NextResponse } from 'next/server'
import type { BrandKnowledge, Prisma } from '@prisma/client'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { requestGameShareDraftPoolRefill } from '@/lib/gameShareDraftPool'
import { growthPathsForKnowledgePatch, queueBrandGrowthSync, syncBrandGrowthState } from '@/lib/brandGrowthSync'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

function serializeKnowledge(k: BrandKnowledge) {
  const record = k as BrandKnowledge & Record<string, any>
  return {
    brandId: k.brandId,
    // Section 1
    brandTone: k.brandTone || '',
    audienceAssumptions: k.audienceAssumptions || '',
    productAssumptions: k.productAssumptions || '',
    voiceId: k.voiceId || '',
    companionVoiceId: record.companionVoiceId || k.voiceId || '',
    brandVoiceProfiles: record.brandVoiceProfiles || [],
    defaultBrandVoiceProfileId: record.defaultBrandVoiceProfileId || '',
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
    brandVoice: k.brandVoice || '',
    brandImage: k.brandImage || '',
    promotionFocus: k.promotionFocus || '',
    publishingFreq: k.publishingFreq || null,
    brandClaim: k.brandClaim || null,
    researchReport: k.researchReport || null,
    marketingSolution: k.marketingSolution || k.brandPlan || null,
    brandPlan: k.brandPlan || null,
  }
}

const EMPTY_KNOWLEDGE = {
  brandId: '',
  brandTone: '',
  audienceAssumptions: '',
  productAssumptions: '',
  voiceId: '',
  companionVoiceId: '',
  brandVoiceProfiles: [] as unknown[],
  defaultBrandVoiceProfileId: '',
  negPrompts: [] as string[],
  slangDict: {} as Record<string, string>,
  businessHours: null,
  reservationUrl: '',
  orderingUrl: '',
  deliveryUrls: [] as unknown[],
  stores: [] as unknown[],
  market: '',
  district: '',
  competitors: [] as string[],
  menuItems: [] as unknown[],
  brandVoice: '',
  brandImage: '',
  promotionFocus: '',
  publishingFreq: null,
  brandClaim: null,
  researchReport: null,
  marketingSolution: null,
  brandPlan: null,
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
  let syncActor: { id: string; email?: string | null; type: string; roles: string[] }

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
    syncActor = {
      id: session.user.id,
      email: session.user.email,
      type: session.user.type || 'HUMAN',
      roles: session.user.role ? [session.user.role] : [],
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(brandId, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    syncActor = { id: agent.id, type: 'AI_AGENT', roles: ['AI_AGENT'] }
  }

  const body = await request.json().catch(() => ({}))

  const identityKeys = [
    'brandTone',
    'audienceAssumptions',
    'productAssumptions',
    'promoPlan',
    'brandVoice',
    'brandImage',
    'promotionFocus',
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
    slangDict, negPrompts, voiceId, companionVoiceId, brandVoiceProfiles, defaultBrandVoiceProfileId,
    // Section 2
    businessHours, reservationUrl, orderingUrl, deliveryUrls, stores,
    // Section 3
    market, district, competitors, menuItems,
  } = body

  const updateData: Record<string, unknown> = {}
  if (slangDict !== undefined) updateData.slangDict = slangDict
  if (negPrompts !== undefined) updateData.negPrompts = negPrompts
  if (voiceId !== undefined) updateData.voiceId = voiceId
  if (companionVoiceId !== undefined) {
    updateData.companionVoiceId = companionVoiceId
    updateData.voiceId = companionVoiceId
  }
  if (brandVoiceProfiles !== undefined) updateData.brandVoiceProfiles = brandVoiceProfiles
  if (defaultBrandVoiceProfileId !== undefined) updateData.defaultBrandVoiceProfileId = defaultBrandVoiceProfileId
  if (businessHours !== undefined) updateData.businessHours = businessHours
  if (reservationUrl !== undefined) updateData.reservationUrl = reservationUrl
  if (orderingUrl !== undefined) updateData.orderingUrl = orderingUrl
  if (deliveryUrls !== undefined) updateData.deliveryUrls = deliveryUrls
  if (stores !== undefined) updateData.stores = stores
  if (market !== undefined) updateData.market = market
  if (district !== undefined) updateData.district = district
  if (competitors !== undefined) updateData.competitors = competitors
  if (menuItems !== undefined) updateData.menuItems = menuItems

  const growthDirtyPaths = growthPathsForKnowledgePatch(body)
  const hasGrowthChanges = growthDirtyPaths.length > 0
  const knowledge = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const saved = await tx.brandKnowledge.upsert({
      where: { brandId },
      update: updateData as Prisma.BrandKnowledgeUncheckedUpdateInput,
      create: {
        brandId,
        slangDict: slangDict || {},
        negPrompts: negPrompts || [],
        menuItems: menuItems || [],
        voiceId: companionVoiceId || voiceId || '',
        companionVoiceId: companionVoiceId || voiceId || '',
        brandVoiceProfiles: brandVoiceProfiles || [],
        defaultBrandVoiceProfileId: defaultBrandVoiceProfileId || '',
        businessHours: businessHours || null,
        reservationUrl: reservationUrl || '',
        orderingUrl: orderingUrl || '',
        deliveryUrls: deliveryUrls || [],
        stores: stores || [],
        market: market || '',
        district: district || '',
        competitors: competitors || [],
      } as Prisma.BrandKnowledgeUncheckedCreateInput,
    })
    if (hasGrowthChanges) {
      await queueBrandGrowthSync({ brandId, dirtyPaths: growthDirtyPaths, actor: syncActor, tx })
    }
    return saved
  })

  if (menuItems !== undefined) {
    after(async () => {
      const gameConfig = await prisma.gameConfig.findUnique({ where: { brandId }, select: { id: true } })
      if (gameConfig) await requestGameShareDraftPoolRefill(gameConfig.id)
    })
  }
  if (hasGrowthChanges) {
    after(() => syncBrandGrowthState(brandId).then(() => undefined))
  }

  return NextResponse.json({ ok: true, ...serializeKnowledge(knowledge) })
}
