import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { authenticateRequest } from '@/lib/auth-v2'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject, canOwnBrand } from '@/lib/brandAccess'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'
import { POST as humanPost } from '../../../subscription/route'

type Params = { params: Promise<{ id: string }> }

function getAddonQuantity(selectedAddons: unknown, addonId: string) {
  if (!selectedAddons) return 0

  if (Array.isArray(selectedAddons)) {
    const addon = selectedAddons.find((item) =>
      item && typeof item === 'object' && (item as { id?: unknown }).id === addonId
    )
    const quantity = addon && typeof addon === 'object' ? (addon as { quantity?: unknown }).quantity : 0
    return typeof quantity === 'number' && Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
  }

  if (typeof selectedAddons === 'object') {
    const value = (selectedAddons as Record<string, unknown>)[addonId]
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
    if (typeof value === 'boolean') return value ? 1 : 0
    if (value && typeof value === 'object') {
      const quantity = (value as { quantity?: unknown }).quantity
      return typeof quantity === 'number' && Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
    }
  }

  return 0
}

function getStoreLimit(planId: string, selectedAddons: unknown) {
  return 1 + getAddonQuantity(selectedAddons, 'multi_store')
}

function getPlatformCoverage(planId: string) {
  if (planId === 'essential') return ['instagram', 'tiktok', 'google_business']
  if (planId === 'booster') return ['instagram', 'tiktok', 'xiaohongshu', 'google_business']
  return []
}

function getMonthlyContentQuota(planId: string) {
  if (planId === 'essential') return 12
  if (planId === 'booster') return 24
  return 0
}

async function getOperationsStrategy(planId: string, planServices: string[]) {
  const configured = await prisma.subscriptionOperationsStrategy.findUnique({ where: { planId } })
  const platformCoverage = configured ? stringList(configured.platformCoverage) : getPlatformCoverage(planId)
  const monthlyContentQuota = configured?.monthlyContentQuota ?? getMonthlyContentQuota(planId)
  return {
    platformCoverage,
    monthlyContentQuota,
    includedServices: configured ? stringList(configured.includedServices) : planServices,
    publishingFrequencyPlan: configured?.publishingFreq || (monthlyContentQuota && platformCoverage.length
      ? {
          platforms: Object.fromEntries(platformCoverage.map((platform) => [
            platform,
            { postsPerWeek: Math.max(1, Math.round((monthlyContentQuota / platformCoverage.length) * 7 / 30)) },
          ])),
        }
      : null),
    storeLimit: configured?.storeLimit ?? 1,
    strategyNotes: configured?.strategyNotes || null,
  }
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean) : []
}

export async function GET(request: Request, { params }: Params) {
  const apiKey = extractApiKey(request)
  const principal = await authenticateRequest(request)

  if (!principal && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !principal) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { id: brandId } = await params

  const userId = principal!.userId
  const userType = 'HUMAN'
  const userRole = principal!.globalRoles.includes('ADMIN') ? 'ADMIN' : 'USER'

  const ok = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const subscription = await prisma.brandSubscription.findFirst({
    where: {
      brandId,
      status: 'ACTIVE',
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!subscription) {
    return NextResponse.json({
      plan_name: 'NONE',
      included_services: [],
      monthly_content_quota: 0,
      platform_coverage: [],
      reply_sla: 'none',
      ad_management: false,
      kol_management: false,
      autopilot_eligible: false,
      status: 'EXPIRED',
      selectedAddons: {},
      store_limit: 1,
      multi_store_addon_quantity: 0,
    })
  }

  const planId = subscription.planId
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId)
  const included_services = plan?.services ?? []
  const operations_strategy = await getOperationsStrategy(planId, included_services)
  const monthly_content_quota = operations_strategy.monthlyContentQuota
  const platform_coverage = operations_strategy.platformCoverage

  return NextResponse.json({
    plan_id: planId,
    plan_name: plan?.name || subscription.planName,
    included_services,
    monthly_content_quota,
    platform_coverage,
    operations_strategy,
    reply_sla: planId === 'essential' ? 'none' : '24h',
    ad_management: false,
    kol_management: planId !== 'essential',
    autopilot_eligible: true,
    contract_start: subscription.contractStartDate?.toISOString() ?? null,
    contract_end: subscription.contractEndDate?.toISOString() ?? null,
    status: subscription.status,
    selectedAddons: subscription.selectedAddons || {},
    store_limit: getStoreLimit(planId, subscription.selectedAddons),
    multi_store_addon_quantity: getAddonQuantity(subscription.selectedAddons, 'multi_store'),
  })
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId } = await params

  if (session?.user) {
    if (!(await canOwnBrand(brandId, session.user.id))) {
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
  const { selectedAddons } = body

  if (selectedAddons === undefined) {
    return NextResponse.json({ error: 'selectedAddons is required' }, { status: 400 })
  }

  // Find active subscription
  let subscription = await prisma.brandSubscription.findFirst({
    where: {
      brandId,
      status: 'ACTIVE',
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!subscription) {
    return NextResponse.json({ error: 'No active subscription found for this brand.' }, { status: 402 })
  }

  const updatedSub = await prisma.brandSubscription.update({
    where: { id: subscription.id },
    data: {
      selectedAddons: selectedAddons as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({
    ok: true,
    brandId,
    selectedAddons: updatedSub.selectedAddons || {},
  })
}

export { humanPost as POST }
