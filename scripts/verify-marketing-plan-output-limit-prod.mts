// Explicit production acceptance: regenerates only this brand's marketing plan.
import assert from 'node:assert/strict'
import { prisma } from '../src/lib/prisma.ts'
import { getBrandPlan, runBrandPlanAction } from '../src/lib/brand-plan/service.ts'

assert(process.env.RENDER && process.argv.includes('--production-acceptance'), 'Run on Render with --production-acceptance')
const brandId = 'cmr1sictu003eio2auldwt26m'
const expectedCommit = process.env.EXPECTED_COMMIT
assert(expectedCommit && process.env.RENDER_GIT_COMMIT === expectedCommit, 'Deployed commit must equal EXPECTED_COMMIT')
try {
  const before = await getBrandPlan(brandId)
  assert(before, 'Brand workspace missing')
  const planningStartMonth = before.marketingSolution?.annualPlan?.planningStartMonth
  assert(planningStartMonth, 'Existing planning start month required')
  const body = { planningStartMonth }
  const strategy = await runBrandPlanAction({ brandId, action: 'generate_annual_strategy', body })
  assert(strategy.marketingSolution?.annualPlan?.generationMode === 'LLM', 'Strategy must be model-generated')
  console.log(JSON.stringify({ step: 'annual_strategy', status: 'saved', commit: expectedCommit }))
  for (let index = 0; index < 4; index++) {
    const result = await runBrandPlanAction({ brandId, action: 'generate_next_quarter_plan', body })
    assert(result.marketingSolution?.annualPlan?.quarterlyPlans?.length === index + 1, 'Quarter was not saved')
    console.log(JSON.stringify({ step: 'quarter', count: index + 1, status: 'saved' }))
  }
  const saved = await getBrandPlan(brandId)
  const plan = saved?.marketingSolution?.annualPlan
  assert(plan?.generationMode === 'LLM' && !plan.llmError, 'Readback must show successful model generation')
  assert(plan.goal?.trim() && plan.theme?.trim(), 'Strategy must have nonempty goal/theme')
  assert(plan.quarterlyPlans?.length === 4, 'Four quarters required')
  for (const quarter of plan.quarterlyPlans) {
    assert(quarter.strategy?.trim() && quarter.monthlyFocus?.length, 'Quarter must have strategy and monthly focus')
  }
  console.log(JSON.stringify({ ok: true, brandId, planningStartMonth, quarterlyPlans: 4, model: plan.llmModel, commit: expectedCommit }))
} finally {
  await prisma.$disconnect()
}
