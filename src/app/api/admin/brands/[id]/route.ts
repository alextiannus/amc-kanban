import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { calculatePricing, SUBSCRIPTION_PLANS, type PlanId } from '@/lib/subscription/catalog'

type Params = { params: Promise<{ id: string }> }

const BRAND_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const
const SUBSCRIPTION_STATUSES = ['PENDING', 'ACTIVE', 'FAILED', 'CANCELLED'] as const
const DURATIONS = [3, 6, 12] as const

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined
}

function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && SUBSCRIPTION_PLANS.some((plan) => plan.id === value)
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const existing = await prisma.brand.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const name = normalizeString(body.name)
  const location = normalizeString(body.location)
  const timezone = normalizeString(body.timezone)
  const status = normalizeString(body.status)
  const ownerUserId = normalizeString(body.ownerUserId)
  const ownerEmail = normalizeString(body.ownerEmail)?.toLowerCase()
  const rawAgentIds: unknown[] | undefined = Array.isArray(body.agentIds) ? body.agentIds : undefined
  const planId = body.planId
  const subscriptionStatus = normalizeString(body.subscriptionStatus)
  const durationMonths = Number(body.durationMonths || 12)

  if (name !== undefined && !name) return NextResponse.json({ error: 'Brand name is required' }, { status: 400 })
  if (status !== undefined && !BRAND_STATUSES.includes(status as (typeof BRAND_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid brand status' }, { status: 400 })
  }
  if (subscriptionStatus !== undefined && !SUBSCRIPTION_STATUSES.includes(subscriptionStatus as (typeof SUBSCRIPTION_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid subscription status' }, { status: 400 })
  }
  if (planId !== undefined && !isPlanId(planId)) {
    return NextResponse.json({ error: 'Invalid planId' }, { status: 400 })
  }
  if (!DURATIONS.includes(durationMonths as (typeof DURATIONS)[number])) {
    return NextResponse.json({ error: 'Invalid durationMonths' }, { status: 400 })
  }

  let resolvedOwnerId: string | undefined
  if (ownerUserId || ownerEmail) {
    const owner = await prisma.user.findFirst({
      where: ownerUserId ? { id: ownerUserId, type: 'HUMAN' } : { email: ownerEmail, type: 'HUMAN' },
      select: { id: true },
    })
    if (!owner) return NextResponse.json({ error: 'Brand owner user not found' }, { status: 404 })
    resolvedOwnerId = owner.id
  }

  let nextAgentIds: string[] | undefined
  if (rawAgentIds) {
    nextAgentIds = Array.from(new Set(rawAgentIds.filter((value): value is string => typeof value === 'string' && value.trim() !== '')))
    if (nextAgentIds.length > 0) {
      const userCount = await prisma.user.count({ where: { id: { in: nextAgentIds } } })
      if (userCount !== nextAgentIds.length) {
        return NextResponse.json({ error: 'One or more agentIds are invalid' }, { status: 400 })
      }
    }
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const brand = await tx.brand.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(location !== undefined ? { location: location || null } : {}),
        ...(timezone !== undefined ? { timezone: timezone || 'America/New_York' } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(typeof body.autoPilot === 'boolean' ? { autoPilot: body.autoPilot } : {}),
        ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}),
      },
      select: { id: true },
    })

    if (resolvedOwnerId) {
      await tx.brandOwner.deleteMany({ where: { brandId: id, role: 'owner', userId: { not: resolvedOwnerId } } })
      await tx.brandOwner.upsert({
        where: { brandId_userId: { brandId: id, userId: resolvedOwnerId } },
        create: { brandId: id, userId: resolvedOwnerId, role: 'owner' },
        update: { role: 'owner' },
      })
      await tx.userBusinessRole.upsert({
        where: { userId_role: { userId: resolvedOwnerId, role: 'BRAND_OWNER' } },
        create: { userId: resolvedOwnerId, role: 'BRAND_OWNER' },
        update: {},
      })

      // 同步更新 MarketingCrew & CrewMember
      let crew = await tx.marketingCrew.findUnique({ where: { brandId: id } })
      if (!crew) {
        crew = await tx.marketingCrew.create({ data: { brandId: id } })
      }
      await tx.crewMember.upsert({
        where: {
          crewId_userId: {
            crewId: crew.id,
            userId: resolvedOwnerId
          }
        },
        create: {
          crewId: crew.id,
          userId: resolvedOwnerId
        },
        update: {}
      })
    }

    if (nextAgentIds) {
      await tx.brandAgent.updateMany({ where: { brandId: id, agentId: { notIn: nextAgentIds }, active: true }, data: { active: false } })
      for (const agentId of nextAgentIds) {
        await tx.brandAgent.upsert({
          where: { brandId_agentId: { brandId: id, agentId } },
          create: { brandId: id, agentId, role: 'worker', active: true },
          update: { active: true },
        })
      }

      // 同步更新 MarketingCrew & CrewMember 关联
      let crew = await tx.marketingCrew.findUnique({ where: { brandId: id } })
      if (!crew) {
        crew = await tx.marketingCrew.create({ data: { brandId: id } })
      }

      const currentBrand = await tx.brand.findUnique({ where: { id }, select: { ownerId: true } })
      const ownerId = currentBrand?.ownerId

      const keepUserIds = [...nextAgentIds]
      if (ownerId) keepUserIds.push(ownerId)

      // 移除不在保留列表中的旧成员
      await tx.crewMember.deleteMany({
        where: {
          crewId: crew.id,
          userId: { notIn: keepUserIds }
        }
      })

      // 将最新勾选的团队成员（人类与 AI）全部加入 CrewMember
      for (const agentId of nextAgentIds) {
        await tx.crewMember.upsert({
          where: {
            crewId_userId: {
              crewId: crew.id,
              userId: agentId
            }
          },
          create: {
            crewId: crew.id,
            userId: agentId
          },
          update: {}
        })
      }
    }

    if (planId !== undefined || subscriptionStatus !== undefined || body.durationMonths !== undefined) {
      const effectivePlanId = isPlanId(planId) ? planId : 'essential'
      const plan = SUBSCRIPTION_PLANS.find((item) => item.id === effectivePlanId)!
      const pricing = calculatePricing(effectivePlanId, durationMonths, [])
      const startDate = body.contractStartDate ? new Date(String(body.contractStartDate)) : new Date()
      const endDate = body.contractEndDate ? new Date(String(body.contractEndDate)) : new Date(startDate)
      if (!body.contractEndDate) endDate.setMonth(endDate.getMonth() + durationMonths)

      const latest = await tx.brandSubscription.findFirst({ where: { brandId: id }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
      const data = {
        planId: effectivePlanId,
        planName: plan.name,
        durationMonths: pricing.durationMonths,
        billedMonths: pricing.billedMonths,
        monthlyBaseUsd: pricing.monthlyBaseUsd,
        recurringAddonsUsd: pricing.recurringAddonsUsd,
        oneTimeAddonsUsd: pricing.oneTimeAddonsUsd,
        totalDueUsd: pricing.totalDueUsd,
        currency: 'USD',
        status: (subscriptionStatus || 'ACTIVE'),
        contractStartDate: startDate,
        contractEndDate: endDate,
        paidAt: subscriptionStatus === 'ACTIVE' || subscriptionStatus === undefined ? startDate : null,
        selectedAddons: [],
        brandId: id,
      }
      if (latest) {
        await tx.brandSubscription.update({ where: { id: latest.id }, data })
      } else {
        await tx.brandSubscription.create({ data })
      }
    }

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'ADMIN_BRAND_UPDATED',
        resourceId: id,
        resourceType: 'Brand',
        newValue: body,
      },
    })

    return brand
  })

  return NextResponse.json({ ok: true, brand: updated })
}

export async function DELETE(
  request: Request,
  { params }: Params
) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Check latest subscription status
    const latestSubscription = brand.subscriptions[0]
    if (latestSubscription) {
      const subStatus = latestSubscription.status
      if (subStatus !== 'CANCELLED' && subStatus !== 'EXPIRED') {
        return NextResponse.json(
          { error: `无法删除处于“${subStatus === 'ACTIVE' ? '正常履约中' : subStatus}”的品牌。为了数据安全，只能删除已取消订阅 (CANCELLED) 或已过期的品牌。` },
          { status: 400 }
        )
      }
    }

    // Soft delete (update status to ARCHIVED)
    await prisma.$transaction(async (tx) => {
      await tx.brand.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      })

      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          actorType: 'HUMAN',
          actorName: session.user.email || null,
          action: 'ADMIN_BRAND_SOFT_DELETED',
          resourceId: id,
          resourceType: 'Brand',
          newValue: { status: 'ARCHIVED' },
        },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    console.error('[DELETE /api/admin/brands/[id]]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}