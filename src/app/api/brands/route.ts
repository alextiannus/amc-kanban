import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { resolveAssignment } from '@/lib/assignmentPool'
import { ensureBrandWorkspace } from '@/lib/brandWorkspace'
import { findOrCreateBrandOwnerAccount } from '@/lib/brandOwnerAccount'
import { sendBrandOnboardingWelcomeEmail } from '@/lib/email'
import { generateInvitationLink } from '@/lib/invitation'
import { computeEffectiveUserRoles } from '@/lib/userRoles'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { createMarketingCrew, addCrewMember } from '@/lib/user-management/crew'

// GET /api/brands — list brands for the logged-in user
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const assignedOnly = searchParams.get('assignedOnly') === 'true'

  const context = await resolveSessionOrApiKey(request)
  if (!context?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = context.user

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
    }

    // 1. ADMIN human — see ALL brands across the system
    if (isAmcOperator(sessionUser)) {
      const allBrands = await prisma.brand.findMany({
        where: activeBrandFilter,
        include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(allBrands)
    }

    // 2. Resolve organization ownership cascade (human only)
    const orgMemberships = sessionUser.type === 'HUMAN' 
      ? await prisma.organizationMember.findMany({
          where: { memberId: sessionUser.id },
          select: { ownerId: true }
        })
      : []
    const orgOwnerIds = orgMemberships.map((m: any) => m.ownerId)

    const queryOr: any[] = [
      // Direct membership in the Brand's Crew
      {
        crew: {
          members: {
            some: { userId: sessionUser.id }
          }
        }
      }
    ]

    // If not restricted to assignedOnly, check organization access
    if (!assignedOnly && orgOwnerIds.length > 0) {
      queryOr.push({
        crew: {
          members: {
            some: { userId: { in: orgOwnerIds } }
          }
        }
      })
    }

    // Build the query filter for brands where user or their organization owner is a crew member
    const brands = await prisma.brand.findMany({
      where: {
        ...activeBrandFilter,
        OR: queryOr
      },
      include: { accounts: accountsSelect, _count: countsSelect, subscriptions: subscriptionSummarySelect },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(brands)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    console.error('[GET /api/brands]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/brands — create a new brand (human session required)
export async function POST(request: Request) {
  const context = await resolveSessionOrApiKey(request)
  if (!context?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = context.user

  const body = await request.json()
  const { name, location, timezone, industry, region, referenceCode, googlePlaceId, address, lat, lng, promoCode } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const adminCreate = isAmcOperator(sessionUser)
  if (adminCreate) {
    const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : ''
    const ownerResult = ownerEmail ? await findOrCreateBrandOwnerAccount(ownerEmail) : null

    if (ownerResult && !ownerResult.ok) {
      return NextResponse.json({ error: ownerResult.reason === 'invalid_email' ? 'Brand owner email is invalid' : 'Brand owner email belongs to a non-human account' }, { status: 400 })
    }

    const owner = ownerResult?.ok ? ownerResult.user : { id: sessionUser.id, email: sessionUser.email || null }

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

    // 1. Write to new Crew models
    const crew = await createMarketingCrew(brand.id)
    await addCrewMember(crew.id, owner.id)

    // 2. Write to legacy tables for backwards compatibility
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
    where: { userId: sessionUser.id },
    select: { role: true },
  })
  const roleNames = dbRoles.map((r: { role: string }) => r.role)
  const isAdminUser = sessionUser.role === 'ADMIN'
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

      // 1. Write to new Crew models inside transaction
      const crew = await createMarketingCrew(brand.id, tx)
      await addCrewMember(crew.id, owner.id, tx)
      if (sessionUser.id !== owner.id) {
        await addCrewMember(crew.id, sessionUser.id, tx)
      }

      // 2. Write to legacy tables for backwards compatibility
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
          createdById: sessionUser.id,
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

    // Send welcome email with amc-mm invite link
    try {
      const mmHost = process.env.NEXT_PUBLIC_MM_HOST || 'https://amc-mm.immedi.ai'
      let mmInviteLink = mmHost
      let finalTempPassword = '(您之前已设置过密码，请使用已有密码登录)'

      if (ownerCreated && tempPassword) {
        const { link } = generateInvitationLink(
          owner.email,
          tempPassword,
          ownerEmail.split('@')[0],
          mmHost,
          { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }
        )
        mmInviteLink = link
        finalTempPassword = tempPassword
      }

      await sendBrandOnboardingWelcomeEmail({
        to: owner.email,
        nickname: ownerEmail.split('@')[0],
        brandName: name.trim(),
        temporaryPassword: finalTempPassword,
        mmInviteLink,
        planName,
      })
    } catch (emailErr) {
      console.error('[POST /api/brands] wizard welcome email failed:', emailErr)
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
        createdById: sessionUser.id,
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
        ownerId: sessionUser.id,
        name: name.trim(),
        location: location?.trim() || null,
        timezone: timezone || 'America/New_York',
        ...(address ? { address: address.trim() } : {}),
        ...(googlePlaceId ? { googlePlaceId } : {}),
      },
    })

    // 1. Write to new Crew models inside transaction
    const crew = await createMarketingCrew(brand.id, tx)
    await addCrewMember(crew.id, sessionUser.id, tx)

    // 2. Write to legacy tables for backwards compatibility
    await tx.brandOwner.upsert({
      where: { brandId_userId: { brandId: brand.id, userId: sessionUser.id } },
      create: { brandId: brand.id, userId: sessionUser.id },
      update: {},
    })

    await tx.userBusinessRole.upsert({
      where: { userId_role: { userId: sessionUser.id, role: 'BRAND_OWNER' } },
      create: { userId: sessionUser.id, role: 'BRAND_OWNER' },
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
