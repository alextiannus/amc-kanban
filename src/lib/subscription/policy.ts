import { prisma } from '@/lib/prisma'
import { getPlanMonthlyContentQuota, getPlanPlatformCoverage, getPlanPublishingFreq, SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'

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
    const defaultFreq = getPlanPublishingFreq(normalizedPlanId)
    const defaultQuota = getPlanMonthlyContentQuota(normalizedPlanId)
    const defaultCoverage = getPlanPlatformCoverage(normalizedPlanId)
    return {
      planId: configured.planId,
      planName: configured.planName,
      includedServices: asStringArray(configured.includedServices),
      platformCoverage: defaultCoverage.length ? defaultCoverage : asStringArray(configured.platformCoverage),
      monthlyContentQuota: defaultQuota || configured.monthlyContentQuota,
      publishingFreq: defaultFreq || configured.publishingFreq,
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
    platformCoverage: getPlanPlatformCoverage(catalogPlan.id),
    monthlyContentQuota: getPlanMonthlyContentQuota(catalogPlan.id),
    publishingFreq: getPlanPublishingFreq(catalogPlan.id),
    storeLimit: 1,
    strategyNotes: catalogPlan.explanation,
  }
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
