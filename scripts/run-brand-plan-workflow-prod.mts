import { runBrandPlanAction } from '../src/lib/brand-plan/service.ts'

const brandId = process.env.BRAND_ID || 'cmpaz4kwn0000lv2aa67iic3o'
const month = process.env.CALENDAR_MONTH || '2026-08'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const annual = await runBrandPlanAction({
  brandId,
  action: 'generate_annual_plan',
  body: {},
})

const annualPlan = annual.marketingSolution?.annualPlan
assert(annualPlan, 'annual_plan_missing')
assert(annualPlan.generationMode === 'LLM', `annual_plan_not_llm:${annualPlan.generationMode || 'unknown'}`)
assert(!annualPlan.llmError, `annual_plan_llm_error:${annualPlan.llmError}`)

const calendar = await runBrandPlanAction({
  brandId,
  action: 'generate_publishing_calendar',
  body: { month },
})

const items = calendar.marketingSolution?.publishingCalendar?.months?.[month] || []
assert(items.length > 0, `publishing_calendar_empty:${month}`)

console.log(JSON.stringify({
  ok: true,
  brandId,
  generationMode: annualPlan.generationMode,
  llmProvider: annualPlan.llmProvider || null,
  llmModel: annualPlan.llmModel || null,
  periodStart: annualPlan.periodStart || null,
  periodEnd: annualPlan.periodEnd || null,
  calendarMonth: month,
  calendarItemCount: items.length,
}, null, 2))
