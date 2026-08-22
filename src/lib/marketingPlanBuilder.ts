import { runBrandPlanAction } from '@/lib/brand-plan/service'

export async function generateAnnualMarketingPlan(input: {
  brandId: string
  body?: Record<string, unknown>
}) {
  return runBrandPlanAction({
    brandId: input.brandId,
    action: 'generate_annual_plan',
    body: input.body || {},
  })
}

export async function generateQuarterMarketingPlan(input: {
  brandId: string
  body?: Record<string, unknown>
}) {
  return runBrandPlanAction({
    brandId: input.brandId,
    action: 'generate_quarter_plan',
    body: input.body || {},
  })
}
