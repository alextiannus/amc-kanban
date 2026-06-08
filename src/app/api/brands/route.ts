import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { resolveAssignment } from '@/lib/assignmentPool'
import { ensureBrandWorkspace } from '@/lib/brandWorkspace'

// GET /api/brands — list brands for the logged-in user
// Only return brands that have at least one active AI Agent assigned.
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    const activeSubscriptionWhere = {
      status: 'ACTIVE' as const,
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
    }
    const subscriptionSummarySelect = {
      where: activeSubscriptionWhere,
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
    const activeBrandFilter = {
      status: { not: 'ARCHIVED' as const },
      subscriptions: {
        some: activeSubscriptionWhere,
      },
      brandAgents: {
        some: {
          active: true,
        },
      },
    }

    // AI Agent — return brands linked via BrandAgent join table
    if (session.user.type === 'AI_AGENT') {
      const agentLinks = await prisma.brandAgent.findMany({
        where: { agentId: session.user.id, active: true, brand: activeBrandFilter },
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
    const [ownerLinks, legacyOwnedBrands, delegatedAgentPermissions, organizationMemberships] = await Promise.all([
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
      prisma.organizationMember.findMany({
        where: { memberId: session.user.id },
        select: { ownerId: true },
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
    const organizationOwnerIds = Array.from(new Set(organizationMemberships.map((m) => m.ownerId)))
    const delegatedBrands = delegatedBrandIds.length
      ? await prisma.brand.findMany({
          where: { id: { in: delegatedBrandIds }, ...activeBrandFilter },
          include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
          orderBy: { createdAt: 'asc' },
        })
      : []

    const excludedBrandIds = Array.from(new Set([
      ...ownedBrandIds,
      ...delegatedBrandIds,
    ]))

    const organizationBrands = organizationOwnerIds.length
      ? await prisma.brand.findMany({
          where: {
            ...activeBrandFilter,
            id: { notIn: excludedBrandIds },
            OR: [
              { ownerId: { in: organizationOwnerIds } },
              {
                owners: {
                  some: {
                    role: 'owner',
                    userId: { in: organizationOwnerIds },
                  },
                },
              },
            ],
          },
          include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
          orderBy: { createdAt: 'asc' },
        })
      : []

    return NextResponse.json([
      ...ownerLinks.map((link) => link.brand),
      ...legacyOwnedBrands,
      ...delegatedBrands,
      ...organizationBrands,
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

  const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : ''
  if (!subscriptionId) {
    return NextResponse.json(
      {
        error: '新增品牌需要先完成该品牌的订阅购买。',
        code: 'SUBSCRIPTION_REQUIRED_BEFORE_BRAND_CREATE',
        redirectTo: '/board/subscription',
      },
      { status: 402 }
    )
  }

  const creation = await prisma.$transaction(async (tx) => {
    const subscriptionToBind = await tx.brandSubscription.findFirst({
      where: {
        id: subscriptionId,
        createdById: session.user.id,
        status: 'ACTIVE',
        brandId: null,
        OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
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
        error: '订阅未支付成功或已经绑定其他品牌，无法创建品牌。',
        code: 'SUBSCRIPTION_NOT_AVAILABLE_FOR_BRAND_CREATE',
        redirectTo: '/board/subscription',
      },
      { status: 402 }
    )
  }

  const { brand, boundSubscription } = creation

  let assignment: { selectedAgentId: string | null; matchedBy: string | null; decisionId: string | null } | null = null
  try {
    await ensureBrandWorkspace(brand.id)
  } catch (workspaceError) {
    console.error('[POST /api/brands] workspace init failed:', workspaceError)
  }

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
