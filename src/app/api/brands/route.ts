import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { resolveAssignment } from '@/lib/assignmentPool'
import { ensureBrandWorkspace } from '@/lib/brandWorkspace'
import { findOrCreateBrandOwnerAccount } from '@/lib/brandOwnerAccount'
import { sendBrandOnboardingWelcomeEmail } from '@/lib/email'
import { generateInvitationLink } from '@/lib/invitation'
import { computeEffectiveUserRoles } from '@/lib/userRoles'

// GET /api/brands — list brands for the logged-in user
// Only return brands that have at least one active AI Agent assigned.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const assignedOnly = searchParams.get('assignedOnly') === 'true'

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
    const activeBrandFilterForAgent = {
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

    const activeBrandFilter = {
      status: { not: 'ARCHIVED' as const },
    }

    // AI Agent — return brands linked via BrandAgent join table
    if (session.user.type === 'AI_AGENT') {
      const agentLinks = await prisma.brandAgent.findMany({
        where: { agentId: session.user.id, active: true, brand: activeBrandFilterForAgent },
        include: {
          brand: { include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect } },
        },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(agentLinks.map((l: any) => l.brand))
    }

    // If assignedOnly=true, return only brands that the human user is directly responsible for.
    // A user is responsible for a brand if they own it (direct/legacy) or have permission to
    // manage the AI agent assigned to it. Organization memberships are not automatically assigned.
    if (assignedOnly) {
      // 1. Delegated agent permissions -> Brand Agent links
      const delegatedAgentPermissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id },
        select: { agentId: true },
      })
      const permittedAgentIds = delegatedAgentPermissions.map((perm: any) => perm.agentId)
      const delegatedBrandLinks = permittedAgentIds.length
        ? await prisma.brandAgent.findMany({
            where: {
              agentId: { in: permittedAgentIds },
              active: true,
            },
            select: { brandId: true },
          })
        : []
      const delegatedBrandIds = delegatedBrandLinks.map((link: any) => link.brandId)

      // 2. Owned brands (via BrandOwner join table)
      const ownerLinks = await prisma.brandOwner.findMany({
        where: { userId: session.user.id },
        select: { brandId: true },
      })
      const ownedBrandIds = ownerLinks.map((link: any) => link.brandId)

      // 3. Legacy owned brands (via ownerId field)
      const legacyOwnedBrands = await prisma.brand.findMany({
        where: { ownerId: session.user.id },
        select: { id: true },
      })
      const legacyOwnedBrandIds = legacyOwnedBrands.map((b: any) => b.id)

      // Combine direct candidate brands (excluding organization-wide unassigned brands)
      const candidateBrandIds = Array.from(
        new Set([
          ...delegatedBrandIds,
          ...ownedBrandIds,
          ...legacyOwnedBrandIds,
        ])
      )

      // Build OR conditions for query
      const orConditions: any[] = []
      if (candidateBrandIds.length > 0) {
        orConditions.push({ id: { in: candidateBrandIds } })
      }

      // If no responsible conditions, return empty list
      if (orConditions.length === 0) {
        return NextResponse.json([])
      }

      const brands = await prisma.brand.findMany({
        where: {
          ...activeBrandFilter,
          OR: orConditions,
        },
        include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
        orderBy: { createdAt: 'asc' },
      })

      return NextResponse.json(brands)
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
      ...ownerLinks.map((link: any) => link.brandId),
      ...legacyOwnedBrands.map((brand: any) => brand.id),
    ])

    const permittedAgentIds = delegatedAgentPermissions.map((perm: any) => perm.agentId)
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

    const delegatedBrandIds = Array.from(new Set(delegatedBrandLinks.map((link: any) => link.brandId)))
    const organizationOwnerIds = Array.from(new Set(organizationMemberships.map((m: any) => m.ownerId)))
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
      ...ownerLinks.map((link: any) => link.brand),
      ...legacyOwnedBrands,
      ...delegatedBrands,
      ...organizationBrands,
    ].filter(Boolean))
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
  const { name, location, timezone, industry, region, referenceCode, googlePlaceId, address, lat, lng, promoCode } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const adminCreate = isAmcOperator(session.user)
  if (adminCreate) {
    const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : ''
    const ownerResult = ownerEmail ? await findOrCreateBrandOwnerAccount(ownerEmail) : null

    if (ownerResult && !ownerResult.ok) {
      return NextResponse.json({ error: ownerResult.reason === 'invalid_email' ? 'Brand owner email is invalid' : 'Brand owner email belongs to a non-human account' }, { status: 400 })
    }

    const owner = ownerResult?.ok ? ownerResult.user : { id: session.user.id, email: session.user.email || null }

    const brand = await prisma.brand.create({
      data: {
        ownerId: owner.id,
        name: name.trim(),
        location: location?.trim() || null,
        timezone: timezone || 'America/New_York',
        ...(address ? { address: address.trim() } : {}),
        ...(googlePlaceId ? { googlePlaceId } : {}),
      },
    })

    await prisma.brandOwner.upsert({
      where: { brandId_userId: { brandId: brand.id, userId: owner.id } },
      create: { brandId: brand.id, userId: owner.id, role: 'owner' },
      update: { role: 'owner' },
    })

    await prisma.userBusinessRole.upsert({
      where: { userId_role: { userId: owner.id, role: 'BRAND_OWNER' } },
      create: { userId: owner.id, role: 'BRAND_OWNER' },
      update: {},
    })

    try {
      await ensureBrandWorkspace(brand.id)
    } catch (workspaceError) {
      console.error('[POST /api/brands] admin workspace init failed:', workspaceError)
    }

    let assignment: { selectedAgentId: string | null; matchedBy: string | null; decisionId: string | null } | null = null
    try {
      const result = await resolveAssignment({
        subjectType: 'brand_create',
        subjectId: brand.id,
        industry: typeof industry === 'string' ? industry : null,
        region: typeof region === 'string' ? region : (typeof location === 'string' ? location : null),
        referenceCode: typeof referenceCode === 'string' ? referenceCode : null,
        createdBy: 'admin',
      })
      assignment = {
        selectedAgentId: result.selectedAgentId,
        matchedBy: result.matchedBy,
        decisionId: result.decisionId,
      }
    } catch (assignmentError) {
      console.error('[POST /api/brands] admin assignment failed:', assignmentError)
    }

    return NextResponse.json({ ...brand, assignment, subscription: null }, { status: 201 })
  }

  // ── Wizard path: AMC_PRINCIPAL or BD creates a brand on behalf of a merchant ──
  const dbRoles = await prisma.userBusinessRole.findMany({
    where: { userId: session.user.id },
    select: { role: true },
  })
  const roleNames = dbRoles.map((r: { role: string }) => r.role)
  const isAdminUser = session.user.role === 'ADMIN'
  const canWizardCreate = isAdminUser || roleNames.includes('AMC_PRINCIPAL') || roleNames.includes('BD')

  if (canWizardCreate) {
    const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : ''
    if (!ownerEmail) {
      return NextResponse.json({ error: '请填写品牌主邮箱' }, { status: 400 })
    }

    const ownerResult = await findOrCreateBrandOwnerAccount(ownerEmail)
    if (!ownerResult.ok) {
      return NextResponse.json(
        { error: ownerResult.reason === 'invalid_email' ? '品牌主邮箱格式无效' : '该邮箱已被非普通用户账号使用' },
        { status: 400 }
      )
    }

    const { user: owner, created: ownerCreated } = ownerResult
    const tempPassword = typeof body._tempPassword === 'string' ? body._tempPassword : ''

    // Parse plan info from body (wizard supplies planId, planName, durationMonths etc.)
    const planId   = typeof body.planId   === 'string' ? body.planId.trim()   : 'starter'
    const planName = typeof body.planName === 'string' ? body.planName.trim() : 'Starter'
    const durationMonths    = typeof body.durationMonths    === 'number' ? body.durationMonths    : 1
    const monthlyBaseUsd    = typeof body.monthlyBaseUsd    === 'number' ? body.monthlyBaseUsd    : 0
    const recurringAddonsUsd = typeof body.recurringAddonsUsd === 'number' ? body.recurringAddonsUsd : 0
    const oneTimeAddonsUsd   = typeof body.oneTimeAddonsUsd   === 'number' ? body.oneTimeAddonsUsd   : 0
    const totalDueUsd        = typeof body.totalDueUsd        === 'number' ? body.totalDueUsd        : 0

    // Validate and resolve promoCode/inviteCode attributes
    let finalReferredById: string | null = null
    let campaignId: string | null = null
    let promoDiscountAmount = 0
    let promoCodeType: string | null = null

    if (promoCode && typeof promoCode === 'string' && promoCode.trim()) {
      const normalizedCode = promoCode.trim().toUpperCase()
      
      // 1. Try campaign promo code
      const campaign = await prisma.campaignPromoCode.findUnique({
        where: { code: normalizedCode }
      })
      if (campaign && campaign.isActive && (!campaign.expiresAt || new Date(campaign.expiresAt) > new Date()) && (campaign.maxUses === null || campaign.usedCount < campaign.maxUses)) {
        campaignId = campaign.id
        finalReferredById = campaign.ownerId
        promoCodeType = 'CAMPAIGN_PROMO'
        if (campaign.discountType === 'PERCENT') {
          promoDiscountAmount = totalDueUsd * (campaign.discountValue / 100)
        } else {
          promoDiscountAmount = campaign.discountValue * durationMonths
        }
      } else {
        // 2. Try user inviteCode
        const userReferrer = await prisma.user.findUnique({
          where: { inviteCode: normalizedCode }
        })
        if (userReferrer && userReferrer.id !== owner.id) {
          finalReferredById = userReferrer.id
          promoCodeType = 'USER_INVITE'
          promoDiscountAmount = totalDueUsd * 0.10
        }
      }
    }

    const wizardResult = await prisma.$transaction(async (tx: any) => {
      const brand = await tx.brand.create({
        data: {
          ownerId: owner.id,
          name: name.trim(),
          location: location?.trim() || null,
          timezone: timezone || 'America/New_York',
          ...(address ? { address: address.trim() } : {}),
          ...(googlePlaceId ? { googlePlaceId } : {}),
        },
      })

      await tx.brandOwner.upsert({
        where: { brandId_userId: { brandId: brand.id, userId: owner.id } },
        create: { brandId: brand.id, userId: owner.id, role: 'owner' },
        update: { role: 'owner' },
      })

      await tx.userBusinessRole.upsert({
        where: { userId_role: { userId: owner.id, role: 'BRAND_OWNER' } },
        create: { userId: owner.id, role: 'BRAND_OWNER' },
        update: {},
      })

      // Create PENDING subscription — Admin activates after offline payment
      const subscription = await tx.brandSubscription.create({
        data: {
          brandId: brand.id,
          createdById: session.user.id,
          planId,
          planName,
          durationMonths,
          billedMonths: durationMonths,
          monthlyBaseUsd,
          recurringAddonsUsd,
          oneTimeAddonsUsd,
          totalDueUsd: Math.max(0, Math.round(totalDueUsd - promoDiscountAmount)),
          status: 'PENDING',
        },
      })

      if (campaignId) {
        await tx.campaignPromoCode.update({
          where: { id: campaignId },
          data: { usedCount: { increment: 1 } }
        })
      }

      if (finalReferredById) {
        const u = await tx.user.findUnique({
          where: { id: owner.id },
          select: { referredById: true }
        })
        if (u && !u.referredById) {
          await tx.user.update({
            where: { id: owner.id },
            data: { referredById: finalReferredById }
          })
        }
      }

      if (promoCodeType) {
        await tx.promoCodeUsage.create({
          data: {
            userId: owner.id,
            codeUsed: promoCode.trim().toUpperCase(),
            codeType: promoCodeType,
            referredById: promoCodeType === 'USER_INVITE' ? finalReferredById : null,
            campaignCodeId: promoCodeType === 'CAMPAIGN_PROMO' ? campaignId : null,
            subscriptionId: subscription.id,
            discountAmount: Math.round(promoDiscountAmount)
          }
        })
      }

      return { brand, subscription }
    })

    try { await ensureBrandWorkspace(wizardResult.brand.id) } catch {/* non-fatal */}

    let assignment = null
    try {
      const result = await resolveAssignment({
        subjectType: 'brand_create',
        subjectId: wizardResult.brand.id,
        industry: typeof industry === 'string' ? industry : null,
        region: typeof region === 'string' ? region : (typeof location === 'string' ? location : null),
        referenceCode: typeof referenceCode === 'string' ? referenceCode : null,
        createdBy: 'admin',
      })
      assignment = { selectedAgentId: result.selectedAgentId, matchedBy: result.matchedBy, decisionId: result.decisionId }
    } catch {/* non-fatal */}

    // Send welcome email with amc-mm invite link (only for newly created accounts)
    if (ownerCreated && tempPassword) {
      try {
        const mmHost = process.env.NEXT_PUBLIC_MM_HOST || 'https://amc-mm.immedi.ai'
        const { link: mmInviteLink } = generateInvitationLink(
          owner.email,
          tempPassword,
          ownerEmail.split('@')[0],
          mmHost,
          { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }
        )
        await sendBrandOnboardingWelcomeEmail({
          to: owner.email,
          nickname: ownerEmail.split('@')[0],
          brandName: name.trim(),
          temporaryPassword: tempPassword,
          mmInviteLink,
          planName,
        })
      } catch (emailErr) {
        console.error('[POST /api/brands] wizard welcome email failed:', emailErr)
      }
    }

    return NextResponse.json({
      ...wizardResult.brand,
      assignment,
      subscription: {
        id: wizardResult.subscription.id,
        planId: wizardResult.subscription.planId,
        planName: wizardResult.subscription.planName,
        status: wizardResult.subscription.status,
      },
      ownerCreated,
    }, { status: 201 })
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

  const creation = await prisma.$transaction(async (tx: any) => {
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
        ...(address ? { address: address.trim() } : {}),
        ...(googlePlaceId ? { googlePlaceId } : {}),
      },
    })

    await tx.brandOwner.upsert({
      where: { brandId_userId: { brandId: brand.id, userId: session.user.id } },
      create: { brandId: brand.id, userId: session.user.id },
      update: {},
    })

    await tx.userBusinessRole.upsert({
      where: { userId_role: { userId: session.user.id, role: 'BRAND_OWNER' } },
      create: { userId: session.user.id, role: 'BRAND_OWNER' },
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
