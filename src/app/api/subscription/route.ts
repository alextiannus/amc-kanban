import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import {
  ALLOWED_DURATIONS,
  DEFAULT_SUBSCRIPTION_TERMS_VERSION,
  PLAN_COMPARISON_ROWS,
  SUBSCRIPTION_ADDONS,
  SUBSCRIPTION_PLANS,
  calculatePricing,
  type PlanId,
} from '@/lib/subscription/catalog'
import { SUBSCRIPTION_TERMS_FULL_TEXT, SUBSCRIPTION_TERMS_NOTICE, SUBSCRIPTION_TERMS_TITLE } from '@/lib/subscription/terms'
import {
  buildBillingActivatedResponse,
  buildBillingActivationData,
  buildOfflineInvoiceResponse,
  type SubscriptionStatus,
} from '@/lib/subscription/workflow'
import { readBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'
import { ensureBrandAgentKeyAfterSubscription } from '@/lib/subscription/service'
import Stripe from 'stripe'

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

const STORES_CONFIG_START = '<!-- AMC:BRAND_PROFILE:STORES_CONFIG:START -->'
const STORES_CONFIG_END = '<!-- AMC:BRAND_PROFILE:STORES_CONFIG:END -->'

type StoreSummary = {
  storeId: string
  name: string
  isPrimary: boolean
  timezone: string | null
  address: string | null
  location: string | null
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractStoresFromMarkdown(markdown: string): StoreSummary[] {
  const startIdx = markdown.indexOf(STORES_CONFIG_START)
  const endIdx = markdown.indexOf(STORES_CONFIG_END)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return []

  const section = markdown.slice(startIdx + STORES_CONFIG_START.length, endIdx)
  const codeMatch = section.match(/```json\s*([\s\S]*?)```/i)
  if (!codeMatch) return []

  try {
    const parsed: unknown = JSON.parse(codeMatch[1])
    if (!parsed || typeof parsed !== 'object') return []
    const storesVal = (parsed as { stores?: unknown }).stores
    if (!Array.isArray(storesVal)) return []

    return storesVal
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null
        const obj = item as Record<string, unknown>
        return {
          storeId: toStringOrNull(obj.storeId) || `store-${index + 1}`,
          name: toStringOrNull(obj.name) || `门店 ${index + 1}`,
          isPrimary: Boolean(obj.isPrimary),
          timezone: toStringOrNull(obj.timezone),
          address: toStringOrNull(obj.address),
          location: toStringOrNull(obj.location),
        }
      })
      .filter((store): store is StoreSummary => Boolean(store))
  } catch {
    return []
  }
}

function toPlanId(value: string | null | undefined): PlanId | null {
  if (value === 'starter' || value === 'essential' || value === 'advanced') {
    return value
  }
  if (value === 'premium' || value === 'advantage') return 'advanced'
  return null
}

async function findOwnerBrand(ownerId: string, brandId?: string | null) {
  const scopedBrandId = typeof brandId === 'string' && brandId.trim() ? brandId.trim() : null
  return prisma.brand.findFirst({
    where: {
      ...(scopedBrandId ? { id: scopedBrandId } : {}),
      OR: [{ ownerId }, { owners: { some: { userId: ownerId } } }],
    },
    select: {
      id: true,
      name: true,
      location: true,
      timezone: true,
      website: true,
      phone: true,
      address: true,
      accounts: {
        select: {
          platformId: true,
          handle: true,
          displayName: true,
          profileUrl: true,
        },
        orderBy: [{ platformId: 'asc' }, { handle: 'asc' }],
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const queryBrandId = url.searchParams.get('brandId')
  const scopedBrandId = typeof queryBrandId === 'string' && queryBrandId.trim() ? queryBrandId.trim() : null

  const scopedBrand = scopedBrandId
    ? await findOwnerBrand(session.user.id, scopedBrandId)
    : null

  if (scopedBrandId && !scopedBrand) {
    return NextResponse.json({ error: 'Brand not found or no access' }, { status: 404 })
  }

  const latestWhere = scopedBrandId
    ? { createdById: session.user.id, brandId: scopedBrandId }
    : { createdById: session.user.id }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true, nickname: true },
  })

  const latestAny = await prisma.brandSubscription.findFirst({
    where: latestWhere,
    orderBy: { createdAt: 'desc' },
  })
  const latestActive = await prisma.brandSubscription.findFirst({
    where: { ...latestWhere, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })

  const latest = latestActive || latestAny
  const latestPlanId = toPlanId(latest?.planId)
  const sessionUserTimezoneRaw = (session.user as { timezone?: unknown }).timezone
  const sessionUserTimezone =
    typeof sessionUserTimezoneRaw === 'string' && sessionUserTimezoneRaw.trim() ? sessionUserTimezoneRaw.trim() : null

  // Subscription belongs to the AI agent/user identity; do not derive active brand
  // from latest subscription.brandId. Brand context is resolved independently.
  const brand = scopedBrand || await findOwnerBrand(session.user.id)

  const ownedBrands = await prisma.brand.findMany({
    where: {
      OR: [{ ownerId: session.user.id }, { owners: { some: { userId: session.user.id } } }],
    },
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  })

  let resolvedAgentId: string | null = null
  let resolvedAgentKey: string | null = null

  if (latest?.status === 'ACTIVE') {
    const ensured = await ensureBrandAgentKeyAfterSubscription({
      ownerId: session.user.id,
    })
    resolvedAgentId = ensured.agentId
    resolvedAgentKey = ensured.apiKey
  }

  if (!brand) {
    const instructionContext = resolvedAgentId
      ? {
          subscription: {
            planId: latestPlanId,
            planName: latest?.planName || null,
            platforms: latestPlanId
              ? PLAN_COMPARISON_ROWS.find((row) => row.key === 'channels')?.values?.[latestPlanId] || null
              : null,
          },
          user: {
            id: user?.id || session.user.id,
            email: user?.email || session.user.email || null,
            role: user?.role || session.user.type,
            nickname: user?.nickname || null,
            timezone: sessionUserTimezone,
          },
          brand: {
            id: '',
            name: '',
            location: null,
            timezone: null,
            website: null,
            phone: null,
            address: null,
          },
          stores: [],
          socialAccounts: [],
          ownedBrands: ownedBrands.map((b) => ({ id: b.id, name: b.name, location: b.location })),
          agent: {
            id: resolvedAgentId,
            apiKey: resolvedAgentKey,
          },
        }
      : null

    return NextResponse.json({
      brand: null,
      plans: SUBSCRIPTION_PLANS,
      comparisonRows: PLAN_COMPARISON_ROWS,
      addons: SUBSCRIPTION_ADDONS,
      durations: ALLOWED_DURATIONS,
      termsVersion: DEFAULT_SUBSCRIPTION_TERMS_VERSION,
      termsTitle: SUBSCRIPTION_TERMS_TITLE,
      termsNotice: SUBSCRIPTION_TERMS_NOTICE,
      termsFullText: SUBSCRIPTION_TERMS_FULL_TEXT,
      latestSubscription: latest,
      paymentEnabled: Boolean(stripe),
      instructionContext,
      ownedBrands,
    })
  }

  const [profileMarkdown, brandAgent] = await Promise.all([
    readBrandProfileMarkdown(brand.id).catch(() => null),
    prisma.brandAgent.findFirst({
      where: { brandId: brand.id, active: true },
      include: {
        agent: {
          select: {
            id: true,
            apiKey: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  resolvedAgentId = brandAgent?.agent.id || resolvedAgentId
  resolvedAgentKey = latest?.status === 'ACTIVE' ? brandAgent?.agent.apiKey || resolvedAgentKey : null

  if (latest?.status === 'ACTIVE' && !resolvedAgentKey) {
    const ensured = await ensureBrandAgentKeyAfterSubscription({
      ownerId: session.user.id,
    })
    resolvedAgentId = ensured.agentId
    resolvedAgentKey = ensured.apiKey
  }

  const parsedStores = profileMarkdown?.markdown ? extractStoresFromMarkdown(profileMarkdown.markdown) : []
  const stores = parsedStores.length
    ? parsedStores
    : [
        {
          storeId: 'main',
          name: `${brand.name} 主门店`,
          isPrimary: true,
          timezone: brand.timezone,
          address: brand.address,
          location: brand.location,
        },
      ]

  const instructionContext = {
    subscription: {
      planId: latestPlanId,
      planName: latest?.planName || null,
      platforms: latestPlanId
        ? PLAN_COMPARISON_ROWS.find((row) => row.key === 'channels')?.values?.[latestPlanId] || null
        : null,
    },
    user: {
      id: user?.id || session.user.id,
      email: user?.email || session.user.email || null,
      role: user?.role || session.user.type,
      nickname: user?.nickname || null,
      timezone: sessionUserTimezone,
    },
    brand: {
      id: brand.id,
      name: brand.name,
      location: brand.location,
      timezone: brand.timezone,
      website: brand.website,
      phone: brand.phone,
      address: brand.address,
    },
    stores,
    socialAccounts: brand.accounts,
    ownedBrands: ownedBrands
      .filter((b) => b.id !== brand.id)
      .map((b) => ({ id: b.id, name: b.name, location: b.location })),
    agent: {
      id: resolvedAgentId,
      apiKey: resolvedAgentKey,
    },
  }

  return NextResponse.json({
    brand: { id: brand.id, name: brand.name },
    plans: SUBSCRIPTION_PLANS,
    comparisonRows: PLAN_COMPARISON_ROWS,
    addons: SUBSCRIPTION_ADDONS,
    durations: ALLOWED_DURATIONS,
    termsVersion: DEFAULT_SUBSCRIPTION_TERMS_VERSION,
    termsTitle: SUBSCRIPTION_TERMS_TITLE,
    termsNotice: SUBSCRIPTION_TERMS_NOTICE,
    termsFullText: SUBSCRIPTION_TERMS_FULL_TEXT,
    latestSubscription: latest,
    paymentEnabled: Boolean(stripe),
    instructionContext,
    ownedBrands,
  })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const url = new URL(request.url)
  const queryBrandId = url.searchParams.get('brandId')
  const rawBrandId = String(body.brandId ?? queryBrandId ?? '').trim()
  const brandId = rawBrandId || null

  if (brandId) {
    const brand = await findOwnerBrand(session.user.id, brandId)
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found or no access' }, { status: 404 })
    }
  }

  const planId = String(body.planId ?? '')
  const durationMonths = Number(body.durationMonths)
  const addonIds: string[] = Array.isArray(body.addonIds) ? body.addonIds.map((v: unknown) => String(v)) : []
  const uniqueAddonIds: string[] = Array.from(new Set(addonIds))
  const rawMode = body.paymentMode
  const paymentMode: 'ONLINE' | 'OFFLINE' | 'BILLING' =
    rawMode === 'OFFLINE' ? 'OFFLINE' : rawMode === 'BILLING' ? 'BILLING' : 'ONLINE'
  const agreedToTerms = Boolean(body.agreedToTerms)
  const termsVersion = String(body.termsVersion ?? DEFAULT_SUBSCRIPTION_TERMS_VERSION)

  if (!agreedToTerms) {
    return NextResponse.json({ error: 'You must agree to the subscription terms before checkout.' }, { status: 400 })
  }
  if (termsVersion !== DEFAULT_SUBSCRIPTION_TERMS_VERSION) {
    return NextResponse.json({ error: `Invalid termsVersion: ${termsVersion}` }, { status: 400 })
  }

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)
  if (!selectedPlan) return NextResponse.json({ error: 'Invalid planId' }, { status: 400 })

  const invalidAddonIds = uniqueAddonIds.filter((id) => !SUBSCRIPTION_ADDONS.some((a) => a.id === id))
  if (invalidAddonIds.length > 0) {
    return NextResponse.json({ error: `Invalid addonIds: ${invalidAddonIds.join(', ')}` }, { status: 400 })
  }

  const summary = calculatePricing(planId, durationMonths, uniqueAddonIds)
  const selectedAddons = SUBSCRIPTION_ADDONS.filter((a) => uniqueAddonIds.includes(a.id))

  const pending = await prisma.brandSubscription.create({
    data: {
      brandId,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      durationMonths: summary.durationMonths,
      billedMonths: summary.billedMonths,
      monthlyBaseUsd: summary.monthlyBaseUsd,
      recurringAddonsUsd: summary.recurringAddonsUsd,
      oneTimeAddonsUsd: summary.oneTimeAddonsUsd,
      totalDueUsd: summary.totalDueUsd,
      status: 'PENDING',
      paymentProvider: paymentMode === 'ONLINE' ? 'STRIPE' : paymentMode,
      selectedAddons: selectedAddons as unknown as Prisma.InputJsonValue,
      termsVersion,
      termsAcceptedAt: new Date(),
      createdById: session.user.id,
    },
  })

  if (paymentMode === 'BILLING') {
    const activationData = buildBillingActivationData(summary.durationMonths)
    await prisma.brandSubscription.update({
      where: { id: pending.id },
      data: activationData,
    })
    const activatedSubscription = await prisma.brandSubscription.findUnique({
      where: { id: pending.id },
    })
    const keyResult = await ensureBrandAgentKeyAfterSubscription({
      ownerId: session.user.id,
    })
    return NextResponse.json({
      ...buildBillingActivatedResponse({
        subscriptionId: pending.id,
        totalDueUsd: summary.totalDueUsd,
        agentId: keyResult.agentId,
      }),
      subscription: activatedSubscription,
    })
  }

  if (paymentMode === 'OFFLINE') {
    return NextResponse.json(
      buildOfflineInvoiceResponse({
        subscriptionId: pending.id,
        status: pending.status as SubscriptionStatus,
        totalDueUsd: summary.totalDueUsd,
      })
    )
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Online payment is not configured. Missing STRIPE_SECRET_KEY.' }, { status: 503 })
  }

  const origin = new URL(request.url).origin
  const baseSubscriptionUrl = brandId
    ? `${origin}/board/subscription/${encodeURIComponent(brandId)}`
    : `${origin}/board/subscription`
  const successUrl = `${baseSubscriptionUrl}?success=1&sid={CHECKOUT_SESSION_ID}&sub=${pending.id}${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}`
  const cancelUrl = `${baseSubscriptionUrl}?canceled=1&sub=${pending.id}${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}`

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: summary.totalDueUsd * 100,
        product_data: {
          name: `AMC ${selectedPlan.name} x ${summary.durationMonths} months`,
          description: `Billed months: ${summary.billedMonths}. Includes selected add-ons and one-time services.`,
        },
      },
    },
  ]

  const sessionCheckout = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: lineItems,
    metadata: {
      subscriptionId: pending.id,
      planId,
      paymentMode,
      durationMonths: String(summary.durationMonths),
      discountPercent: String(summary.discountPercent),
    },
  })

  await prisma.brandSubscription.update({
    where: { id: pending.id },
    data: {
      paymentSessionId: sessionCheckout.id,
      paymentUrl: sessionCheckout.url,
    },
  })

  return NextResponse.json({
    subscriptionId: pending.id,
    checkoutSessionId: sessionCheckout.id,
    checkoutUrl: sessionCheckout.url,
  })
}
