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
import { createBrandForActivatedSubscription } from '@/lib/subscription/service'
import { computeEffectiveUserRoles } from '@/lib/userRoles'
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

async function canOwnerAccessBrand(ownerId: string, brandId: string) {
  const owned = await prisma.brand.findFirst({
    where: {
      id: brandId,
      OR: [{ ownerId }, { owners: { some: { userId: ownerId } } }],
    },
    select: { id: true },
  })
  return Boolean(owned)
}

async function findBrandForSubscription(brandId: string) {
  return prisma.brand.findUnique({
    where: { id: brandId },
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
  })
}

async function canUserManageSubscription(userId: string, systemRole: string | null | undefined, brandId: string): Promise<boolean> {
  if (systemRole === 'ADMIN') return true

  const [explicitRoles, principalCount] = await Promise.all([
    prisma.userBusinessRole.findMany({ where: { userId }, select: { role: true } }),
    prisma.agentPermission.count({ where: { humanId: userId } }),
  ])
  const userRoles = computeEffectiveUserRoles({
    userType: 'HUMAN',
    systemRole,
    explicitRoles: explicitRoles.map((r: any) => r.role),
    principalCount,
  })
  if (userRoles.includes('AMC_PRINCIPAL')) return true

  const isOwner = await canOwnerAccessBrand(userId, brandId)
  if (isOwner) return true

  return false
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const queryBrandId = url.searchParams.get('brandId')
  const scopedBrandId = typeof queryBrandId === 'string' && queryBrandId.trim() ? queryBrandId.trim() : null

  const scopedBrand = scopedBrandId
    ? await findBrandForSubscription(scopedBrandId)
    : null

  if (scopedBrandId && !scopedBrand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (scopedBrandId) {
    const hasAccess = await canUserManageSubscription(session.user.id, session.user.role, scopedBrandId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: you do not have permission to manage subscription for this brand' }, { status: 403 })
    }
  }

  const latestWhere = scopedBrandId
    ? { brandId: scopedBrandId }
    : { createdById: session.user.id }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true, nickname: true },
  })

  const latestAny = await prisma.brandSubscription.findFirst({
    where: latestWhere,
    orderBy: { createdAt: 'desc' },
  })
  let latestActive = await prisma.brandSubscription.findFirst({
    where: {
      ...latestWhere,
      status: 'ACTIVE',
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  // Fallback: If no direct subscription found for this user, check if any of their owned/legacy-owned brands has an active subscription
  if (!latestActive && !scopedBrandId) {
    const ownedBrandIds = await prisma.brand.findMany({
      where: {
        OR: [{ ownerId: session.user.id }, { owners: { some: { userId: session.user.id } } }],
      },
      select: { id: true }
    }).then((list: Array<{ id: string }>) => list.map((b: { id: string }) => b.id))

    if (ownedBrandIds.length > 0) {
      latestActive = await prisma.brandSubscription.findFirst({
        where: {
          brandId: { in: ownedBrandIds },
          status: 'ACTIVE',
          OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      })
    }
  }

  const latest = latestActive || latestAny
  const hasEffectiveActiveSubscription = Boolean(latestActive)
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
          ownedBrands: ownedBrands.map((b: any) => ({ id: b.id, name: b.name, location: b.location })),
          agent: {
            id: resolvedAgentId,
            apiKey: null,
          },
        }
      : null

    return NextResponse.json({
      brand: null,
      plans: SUBSCRIPTION_PLANS.filter((p) => p.visible !== false),
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
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  resolvedAgentId = brandAgent?.agent.id || resolvedAgentId

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
      .filter((b: any) => b.id !== brand.id)
      .map((b: any) => ({ id: b.id, name: b.name, location: b.location })),
    agent: {
      id: resolvedAgentId,
      apiKey: null,
    },
  }

  return NextResponse.json({
    brand: { id: brand.id, name: brand.name },
    plans: SUBSCRIPTION_PLANS.filter((p) => p.visible !== false),
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

  const body = await request.json()
  const url = new URL(request.url)
  const queryBrandId = url.searchParams.get('brandId')
  const rawBrandId = String(body.brandId ?? queryBrandId ?? '').trim()
  const brandId = rawBrandId || null
  const pendingBrandName = String(body.pendingBrandName ?? '').trim()
  const pendingBrandLocation = String(body.pendingBrandLocation ?? '').trim()
  const pendingBrandAddress = String(body.pendingBrandAddress ?? '').trim()
  const pendingBrandOwnerEmail = String(body.pendingBrandOwnerEmail ?? '').trim().toLowerCase()
  const pendingBrandTimezone = String(body.timezone ?? '').trim() || 'Asia/Singapore'
  const pendingBrandDescription = String(body.pendingBrandDescription ?? '').trim()

  if (brandId && pendingBrandName) {
    return NextResponse.json({ error: 'brandId and pendingBrandName cannot be used together' }, { status: 400 })
  }

  if (brandId) {
    const exists = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    const hasAccess = await canUserManageSubscription(session.user.id, session.user.role, brandId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: you do not have permission to manage subscription for this brand' }, { status: 403 })
    }
  }

  const planId = String(body.planId ?? '')
  const durationMonths = Number(body.durationMonths)
  const promoCode = body.promoCode ? String(body.promoCode).trim().toUpperCase() : undefined
  const addonIds: string[] = Array.isArray(body.addonIds) ? body.addonIds.map((v: unknown) => String(v)) : []
  const uniqueAddonIds: string[] = Array.from(new Set(addonIds))
  const rawMode = body.paymentMode ?? body.paymentMethod
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

  const addonQuantities: Record<string, number> = {}
  if (body.addonQuantities && typeof body.addonQuantities === 'object') {
    for (const [key, val] of Object.entries(body.addonQuantities)) {
      const num = Number(val)
      if (!isNaN(num) && num >= 0) {
        addonQuantities[key] = num
      }
    }
  }

  const summary = calculatePricing(planId, durationMonths, uniqueAddonIds, addonQuantities)
  const selectedAddons = SUBSCRIPTION_ADDONS.filter((a: any) => uniqueAddonIds.includes(a.id)).map((addon: any) => ({
    ...addon,
    quantity: addon.id === 'multi_store' ? (addonQuantities['multi_store'] ?? 0) : 1,
  }))

  // Resolve promo code / invite code
  let finalReferredById: string | null = null
  let campaignId: string | null = null
  let promoDiscountAmount = 0
  let promoCodeType: string | null = null

  if (promoCode) {
    // 1. Try campaign promo code
    const campaign = await prisma.campaignPromoCode.findUnique({
      where: { code: promoCode }
    })
    if (campaign && campaign.isActive && (!campaign.expiresAt || new Date(campaign.expiresAt) > new Date()) && (campaign.maxUses === null || campaign.usedCount < campaign.maxUses)) {
      campaignId = campaign.id
      finalReferredById = campaign.ownerId
      promoCodeType = 'CAMPAIGN_PROMO'
      if (campaign.discountType === 'PERCENT') {
        promoDiscountAmount = summary.totalDueUsd * (campaign.discountValue / 100)
      } else {
        promoDiscountAmount = campaign.discountValue * durationMonths
      }
    } else {
      // 2. Try user inviteCode
      const userReferrer = await prisma.user.findUnique({
        where: { inviteCode: promoCode }
      })
      if (userReferrer && userReferrer.id !== session.user.id) {
        finalReferredById = userReferrer.id
        promoCodeType = 'USER_INVITE'
        if (userReferrer.email === 'alextiannus@gmail.com' && planId === 'starter') {
          // Special discount for alextiannus@gmail.com: Essential plan @ $400/month (discount = $200/month)
          promoDiscountAmount = 200 * durationMonths
        } else {
          promoDiscountAmount = summary.totalDueUsd * 0.10
        }
      }
    }
  }

  const finalTotalDue = Math.max(0, Math.round(summary.totalDueUsd - promoDiscountAmount))

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
      totalDueUsd: finalTotalDue,
      status: 'PENDING',
      paymentProvider: paymentMode === 'ONLINE' ? 'STRIPE' : paymentMode,
      selectedAddons: selectedAddons as unknown as Prisma.InputJsonValue,
      termsVersion,
      termsAcceptedAt: new Date(),
      createdById: session.user.id,
    },
  })

  if (campaignId) {
    await prisma.campaignPromoCode.update({
      where: { id: campaignId },
      data: { usedCount: { increment: 1 } }
    })
  }

  // Resolve target merchant owner user ID to bind referredById
  let targetUserId: string | null = null
  if (brandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { ownerId: true }
    })
    targetUserId = brand?.ownerId || null
  } else {
    // If brand is not created yet, target user is the one creating it (or the one bound later)
    targetUserId = session.user.id
  }

  if (finalReferredById && targetUserId) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { referredById: true }
    })
    if (targetUser && !targetUser.referredById) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { referredById: finalReferredById }
      })
    }
  }

  if (promoCodeType) {
    await prisma.promoCodeUsage.create({
      data: {
        userId: targetUserId || session.user.id,
        codeUsed: promoCode,
        codeType: promoCodeType,
        referredById: promoCodeType === 'USER_INVITE' ? finalReferredById : null,
        campaignCodeId: promoCodeType === 'CAMPAIGN_PROMO' ? campaignId : null,
        subscriptionId: pending.id,
        discountAmount: Math.round(promoDiscountAmount)
      }
    })
  }

  if (paymentMode === 'BILLING') {
    const activationData = buildBillingActivationData(summary.durationMonths)
    await prisma.brandSubscription.update({
      where: { id: pending.id },
      data: activationData,
    })
    const createdBrand = pendingBrandName
      ? await createBrandForActivatedSubscription({
          subscriptionId: pending.id,
          ownerId: session.user.id,
          name: pendingBrandName,
          description: pendingBrandDescription || null,
          location: pendingBrandLocation || null,
          ownerEmail: pendingBrandOwnerEmail || '',
          timezone: pendingBrandTimezone,
          address: pendingBrandAddress || null,
        })
      : null
    if (pendingBrandName && !createdBrand?.ok) {
      return NextResponse.json(
        { error: '订阅已激活，但品牌创建失败，请联系管理员处理。', reason: createdBrand?.reason || 'unknown' },
        { status: 500 }
      )
    }
    const activatedSubscription = await prisma.brandSubscription.findUnique({
      where: { id: pending.id },
    })
    const keyResult = { agentId: createdBrand?.ok ? createdBrand.agentId || null : null }
    return NextResponse.json({
      ...buildBillingActivatedResponse({
        subscriptionId: pending.id,
        totalDueUsd: summary.totalDueUsd,
        agentId: keyResult.agentId,
      }),
      subscription: activatedSubscription,
      brand: createdBrand?.ok ? createdBrand.brand : null,
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

  const isMm = body.clientType === 'mm' || request.headers.get('x-client-type') === 'mm'
  const origin = request.headers.get('x-forwarded-host')
    ? `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('x-forwarded-host')}`
    : new URL(request.url).origin
  const baseSubscriptionUrl = isMm
    ? `${origin}/dashboard`
    : `${origin}/admin`
  const returnTo = typeof body.returnTo === 'string' && body.returnTo.startsWith('/') ? body.returnTo : ''
  const pendingBrandParams = new URLSearchParams()
  if (pendingBrandName) pendingBrandParams.set('newBrandName', pendingBrandName)
  if (pendingBrandLocation) pendingBrandParams.set('newBrandLocation', pendingBrandLocation)
  if (pendingBrandAddress) pendingBrandParams.set('newBrandAddress', pendingBrandAddress)
  if (pendingBrandOwnerEmail) pendingBrandParams.set('newBrandOwnerEmail', pendingBrandOwnerEmail)
  if (returnTo) pendingBrandParams.set('returnTo', returnTo)
  const pendingBrandQuery = pendingBrandParams.toString() ? `&${pendingBrandParams.toString()}` : ''
  const successUrl = `${baseSubscriptionUrl}?success=1&sid={CHECKOUT_SESSION_ID}&sub=${pending.id}${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}${pendingBrandQuery}`
  const cancelUrl = `${baseSubscriptionUrl}?canceled=1&sub=${pending.id}${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}${pendingBrandQuery}`

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: 'sgd',
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
      pendingBrandName,
      pendingBrandLocation,
      pendingBrandDescription,
      pendingBrandOwnerEmail,
      pendingBrandTimezone,
      pendingBrandAddress,
      multiStoreQty: String(addonQuantities['multi_store'] ?? 0),
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
