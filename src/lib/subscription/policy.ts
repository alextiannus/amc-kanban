import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'

export type SubscriptionOperationsPolicy = {
  planId: string
  planName: string
  includedServices: string[]
  platformCoverage: string[]
  monthlyContentQuota: number
  publishingFreq: unknown
  storeLimit: number
  strategyNotes: unknown
}

export async function getSubscriptionOperationsPolicy(planId: string): Promise<SubscriptionOperationsPolicy | null> {
  const normalizedPlanId = planId.trim().toLowerCase()
  if (!normalizedPlanId) return null

  const configured = await prisma.subscriptionOperationsStrategy.findUnique({
    where: { planId: normalizedPlanId },
  })
  if (configured) {
    return {
      planId: configured.planId,
      planName: configured.planName,
      includedServices: asStringArray(configured.includedServices),
      platformCoverage: asStringArray(configured.platformCoverage),
      monthlyContentQuota: configured.monthlyContentQuota,
      publishingFreq: configured.publishingFreq,
      storeLimit: configured.storeLimit,
      strategyNotes: configured.strategyNotes,
    }
  }

  const catalogPlan = SUBSCRIPTION_PLANS.find((plan) => plan.id === normalizedPlanId)
  if (!catalogPlan) return null
  return {
    planId: catalogPlan.id,
    planName: catalogPlan.name,
    includedServices: catalogPlan.services,
    platformCoverage: defaultPlatforms(catalogPlan.id),
    monthlyContentQuota: catalogPlan.id === 'booster' ? 24 : 12,
    publishingFreq: null,
    storeLimit: 1,
    strategyNotes: catalogPlan.explanation,
  }
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function defaultPlatforms(planId: string) {
  if (planId === 'booster') return ['instagram', 'tiktok', 'xiaohongshu', 'google_business']
  if (planId === 'essential') return ['instagram', 'tiktok', 'google_business']
  return []
}
