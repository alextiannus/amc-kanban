import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { resolveAssignment } from '@/lib/assignmentPool'

async function reconcileBrandSubscriptionBindings(userId: string) {
  const [brandsWithoutSubscription, availableSlots] = await Promise.all([
    prisma.brand.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        OR: [{ ownerId: userId }, { owners: { some: { userId } } }],
        subscriptions: { none: { status: 'ACTIVE' } },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.brandSubscription.findMany({
      where: {
        createdById: userId,
        status: 'ACTIVE',
        brandId: null,
      },
      select: { id: true },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  const bindCount = Math.min(brandsWithoutSubscription.length, availableSlots.length)
  if (bindCount <= 0) return

  await prisma.$transaction(
    Array.from({ length: bindCount }).map((_, idx) =>
      prisma.brandSubscription.update({
        where: { id: availableSlots[idx].id },
        data: { brandId: brandsWithoutSubscription[idx].id },
      })
    )
  )
}

async function getAvailableBrandPackageSlots(userId: string) {
  const availableBrandPackageSlots = await prisma.brandSubscription.count({
    where: {
      createdById: userId,
      status: 'ACTIVE',
      brandId: null,
    },
  })

  return {
    ok: availableBrandPackageSlots > 0,
    availableBrandPackageSlots,
  }
}

const subscriptionSummarySelect = {
  orderBy: { createdAt: 'desc' as const },
  take: 1,
  select: {
    id: true,
    planId: true,
    planName: true,
    status: true,
    contractEndDate: true,
  },
}

// GET /api/brands — list brands for the logged-in user
// Only return brands that have at least one active AI Agent assigned.
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.type !== 'AI_AGENT') {
    await reconcileBrandSubscriptionBindings(session.user.id)
  }

  const accountsSelect = {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true, platformId: true, handle: true, displayName: true,
      autoPilot: true, followerCount: true, followerDelta: true,
      ratingScore: true, snapshotAt: true,
    },
  }
  const countsSelect = {
    select: {
      actionItems: { where: { status: 'pending' } },
      contents: { where: { status: 'pending_review' } },
    },
  }

  try {
    const activeBrandFilter = {
      status: { not: 'ARCHIVED' as const },
      brandAgents: {
        some: {
          active: true,
        },
      },
    }

    // AI Agent — return brands linked via BrandAgent join table
    if (session.user.type === 'AI_AGENT') {
      const agentLinks = await prisma.brandAgent.findMany({
        where: { agentId: session.user.id, active: true },
        include: {
          brand: { include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect } },
        },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(agentLinks.map(l => l.brand))
    }

    // ADMIN human — see ALL brands across the system
    // (Agents may create brands with themselves as ownerId; admins need full visibility)
    if (isAmcOperator(session.user)) {
      const allBrands = await prisma.brand.findMany({
        where: activeBrandFilter,
        include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(allBrands)
    }

    // Regular human user — brands via BrandOwner join table
    const [ownerLinks, legacyOwnedBrands, delegatedAgentPermissions] = await Promise.all([
      prisma.brandOwner.findMany({
        where: { userId: session.user.id, brand: activeBrandFilter },
        include: {
          brand: { include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.brand.findMany({
        where: { ownerId: session.user.id, ...activeBrandFilter },
        include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.agentPermission.findMany({
        where: { humanId: session.user.id },
        select: { agentId: true },
      }),
    ])

    const ownedBrandIds = new Set([
      ...ownerLinks.map((link) => link.brandId),
      ...legacyOwnedBrands.map((brand) => brand.id),
    ])

    const permittedAgentIds = delegatedAgentPermissions.map((perm) => perm.agentId)
    const delegatedBrandLinks = permittedAgentIds.length
      ? await prisma.brandAgent.findMany({
          where: {
            agentId: { in: permittedAgentIds },
            active: true,
            brandId: { notIn: [...ownedBrandIds] },
          },
          select: { brandId: true },
        })
      : []

    const delegatedBrandIds = Array.from(new Set(delegatedBrandLinks.map((link) => link.brandId)))
    const delegatedBrands = delegatedBrandIds.length
      ? await prisma.brand.findMany({
          where: { id: { in: delegatedBrandIds }, ...activeBrandFilter },
          include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
          orderBy: { createdAt: 'asc' },
        })
      : []

    return NextResponse.json([
      ...ownerLinks.map((link) => link.brand),
      ...legacyOwnedBrands,
      ...delegatedBrands,
    ])
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    console.error('[GET /api/brands]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/brands — create a new brand (human session required)
export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, location, timezone, industry, region, referenceCode } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const entitlement = await getAvailableBrandPackageSlots(session.user.id)
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: '每个品牌都需要独立订阅配套。当前无可用配套额度，请先购买新的品牌配套后再创建品牌。',
        code: 'SUBSCRIPTION_REQUIRED_PER_BRAND',
        redirectTo: '/board/subscription',
        summary: {
          availableBrandPackageSlots: entitlement.availableBrandPackageSlots,
        },
      },
      { status: 402 }
    )
  }

  const creation = await prisma.$transaction(async (tx) => {
    const subscriptionToBind = await tx.brandSubscription.findFirst({
      where: {
        createdById: session.user.id,
        status: 'ACTIVE',
        brandId: null,
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, planId: true, planName: true, status: true },
    })

    if (!subscriptionToBind) return null

    const brand = await tx.brand.create({
      data: {
        ownerId: session.user.id,
        name: name.trim(),
        location: location?.trim() || null,
        timezone: timezone || 'America/New_York',
      },
    })

    await tx.brandOwner.upsert({
      where: { brandId_userId: { brandId: brand.id, userId: session.user.id } },
      create: { brandId: brand.id, userId: session.user.id },
      update: {},
    })

    await tx.brandSubscription.update({
      where: { id: subscriptionToBind.id },
      data: { brandId: brand.id },
    })

    return { brand, boundSubscription: subscriptionToBind }
  })

  if (!creation) {
    return NextResponse.json(
      {
        error: '每个品牌都需要独立订阅配套。当前无可用配套额度，请先购买新的品牌配套后再创建品牌。',
        code: 'SUBSCRIPTION_REQUIRED_PER_BRAND',
        redirectTo: '/board/subscription',
      },
      { status: 402 }
    )
  }

  const { brand, boundSubscription } = creation

  let assignment: { selectedAgentId: string | null; matchedBy: string | null; decisionId: string | null } | null = null
  try {
    const result = await resolveAssignment({
      subjectType: 'brand_create',
      subjectId: brand.id,
      industry: typeof industry === 'string' ? industry : null,
      region: typeof region === 'string' ? region : (typeof location === 'string' ? location : null),
      referenceCode: typeof referenceCode === 'string' ? referenceCode : null,
      createdBy: 'system',
    })
    assignment = {
      selectedAgentId: result.selectedAgentId,
      matchedBy: result.matchedBy,
      decisionId: result.decisionId,
    }
  } catch (assignmentError) {
    console.error('[POST /api/brands] assignment failed:', assignmentError)
  }

  return NextResponse.json({
    ...brand,
    assignment,
    subscription: {
      id: boundSubscription.id,
      planId: boundSubscription.planId,
      planName: boundSubscription.planName,
      status: boundSubscription.status,
    },
  }, { status: 201 })
}
