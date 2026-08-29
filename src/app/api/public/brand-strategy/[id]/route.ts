import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBrandPlan } from '@/lib/brand-plan/service'
import { formatSkuPrice, normalizeSkuLibrary, skuBadges, sortSkuLibrary } from '@/lib/sku-library/service'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean)
  if (typeof value === 'string') return value.split(/\r?\n|[；;]+/).map(text).filter(Boolean)
  return []
}

function safeUrl(value: unknown): string {
  const raw = text(value)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function publicStores(brand: Record<string, any>) {
  const knowledge = isRecord(brand.knowledge) ? brand.knowledge : {}
  const stores = Array.isArray(knowledge.stores) ? knowledge.stores : []
  const normalized = stores
    .filter(isRecord)
    .map((store, index) => ({
      name: text(store.name) || (index === 0 ? text(brand.name) : `Store ${index + 1}`),
      address: text(store.address),
      phone: text(store.phone),
      businessHours: text(store.businessHours),
      reservationUrl: safeUrl(store.reservationUrl),
      orderingUrl: safeUrl(store.orderingUrl),
    }))
    .filter(store => store.name || store.address || store.phone || store.businessHours)

  if (normalized.length) return normalized
  return [{
    name: text(brand.name),
    address: text(brand.address) || text(brand.location),
    phone: text(brand.phone),
    businessHours: text(knowledge.businessHours),
    reservationUrl: safeUrl(knowledge.reservationUrl),
    orderingUrl: safeUrl(knowledge.orderingUrl),
  }].filter(store => store.name || store.address || store.phone || store.businessHours)
}

function publicCrew(brand: Record<string, any>) {
  const members = Array.isArray(brand.crew?.members) ? brand.crew.members : []
  return members
    .filter((member: any) => member?.active !== false)
    .map((member: any) => {
      const user = member?.user || {}
      const email = text(user.email)
      const name = text(user.nickname) || (email ? email.split('@')[0] : 'AMC Crew')
      return {
        name,
        role: text(member.role) || (user.type === 'AI_AGENT' ? 'AI_CREW' : 'VIEWER'),
        type: text(user.type) || 'HUMAN',
        introduction: text(user.introduction),
        workflow: text(user.workflow),
        themeColor: text(user.themeColor),
      }
    })
}

function publicCoreSkus(value: unknown) {
  return sortSkuLibrary(normalizeSkuLibrary(value))
    .slice(0, 8)
    .map((item) => ({
      id: item.id || '',
      type: item.type || 'single',
      name: item.name,
      price: formatSkuPrice(item),
      description: item.description || '',
      serves: item.serves || '',
      bundleItems: Array.isArray(item.bundleItems) ? item.bundleItems.join(' / ') : item.bundleItems || '',
      badges: skuBadges(item),
    }))
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const [brand, planData] = await Promise.all([
    prisma.brand.findFirst({
      where: { id, status: { not: 'ARCHIVED' } },
      include: {
        knowledge: true,
        accounts: {
          select: {
            platformId: true,
            handle: true,
            displayName: true,
            profileUrl: true,
            followerCount: true,
            ratingScore: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
        subscriptions: {
          select: {
            planId: true,
            planName: true,
            status: true,
            contractStartDate: true,
            contractEndDate: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        crew: {
          include: {
            members: {
              where: { active: true },
              include: {
                user: {
                  select: {
                    email: true,
                    type: true,
                    nickname: true,
                    introduction: true,
                    workflow: true,
                    themeColor: true,
                  },
                },
              },
              orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
            },
          },
        },
      },
    }),
    getBrandPlan(id),
  ])

  if (!brand || !planData) {
    return NextResponse.json({ error: 'brand_strategy_not_found' }, { status: 404 })
  }

  const knowledge = brand.knowledge
  const workspace = planData.marketingSolution || planData.brandPlan || {}
  const annualPlan = workspace.annualPlan || null
  const researchReport = workspace.researchReport || null
  const activeSubscription = brand.subscriptions[0] || null
  const shareUrl = `https://amc-mm.immedi.ai/brand-strategy/${encodeURIComponent(id)}`

  return NextResponse.json({
    ok: true,
    shareUrl,
    generatedAt: new Date().toISOString(),
    brand: {
      id: brand.id,
      name: brand.name,
      description: brand.description || '',
      industry: brand.industry || '',
      location: brand.location || '',
      address: brand.address || '',
      phone: brand.phone || '',
      website: safeUrl(brand.website),
      logoUrl: safeUrl(brand.logoUrl),
      market: knowledge?.market || '',
      district: knowledge?.district || '',
      brandTone: knowledge?.brandTone || '',
      targetAudience: knowledge?.audienceAssumptions || '',
      sellingPoints: list(knowledge?.productAssumptions),
      brandVoice: knowledge?.brandVoice || '',
      brandImage: knowledge?.brandImage || '',
      promotionFocus: knowledge?.promotionFocus || '',
    },
    stores: publicStores(brand),
    coreSkus: publicCoreSkus(knowledge?.menuItems),
    socialAccounts: brand.accounts.map((account: {
      platformId: string
      handle: string
      displayName: string | null
      profileUrl: string | null
      followerCount: number | null
      ratingScore: number | null
    }) => ({
      platformId: account.platformId,
      handle: account.handle,
      displayName: account.displayName,
      profileUrl: safeUrl(account.profileUrl),
      followerCount: account.followerCount,
      ratingScore: account.ratingScore,
    })),
    researchReport,
    annualPlan,
    publishingCalendar: workspace.publishingCalendar || null,
    subscription: activeSubscription,
    team: publicCrew(brand),
  })
}
