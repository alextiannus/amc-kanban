import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calendarCreativeErrorMessage, marketingPlanOutputLimitMessage } from '../src/lib/brand-plan/errorMessages.ts'
import { marketingPlanLLMFailureCode } from '../src/lib/brand-plan/marketingPlanLLMPolicy.ts'

const limit = 'Text provider output token limit reached'
assert.equal(marketingPlanLLMFailureCode(limit), 'marketing_plan_output_limit')
assert.equal(marketingPlanLLMFailureCode('invalid_json', { error: limit }), 'marketing_plan_output_limit')
assert.equal(marketingPlanLLMFailureCode('Text provider HTTP 429'), 'marketing_plan_llm_failed')
assert.equal(marketingPlanLLMFailureCode('invalid_json', { error: 'timeout' }), 'marketing_plan_llm_failed')
for (const payload of ['marketing_plan_output_limit', { error: 'marketing_plan_output_limit' }, { code: 'marketing_plan_output_limit', error: 'upstream message' }]) {
  assert.equal(marketingPlanOutputLimitMessage(payload), '模型输出达到长度上限，未生成完整计划，请重试')
}
assert.equal(marketingPlanOutputLimitMessage({ error: 'marketing_plan_llm_failed' }), undefined)

const friendly = calendarCreativeErrorMessage({
  error: 'calendar_content_creative_missing',
  code: 'calendar_content_creative_missing',
  details: {
    month: '2026-10',
    missingPromotionPoints: [{
      id: 'bp_202610_3',
      name: '消费场景预约引导',
      platforms: ['google_business', 'xiaohongshu', 'instagram'],
    }],
    gapReasons: ['no_persisted_creatives_available'],
  },
})

assert.match(friendly || '', /内容计划暂未生成/)
assert.match(friendly || '', /消费场景预约引导/)
assert.match(friendly || '', /Google Business、小红书、Instagram/)
assert.match(friendly || '', /请人工确认/)
assert.match(friendly || '', /没有写入任何日历卡片/)
assert.equal(friendly?.includes('calendar_content_creative_missing'), false)

const legacy = calendarCreativeErrorMessage('calendar_content_creative_missing:{"missingPromotionPointIds":["bp_202610_3"],"gapReasons":["no_persisted_creatives_available"]}')
assert.match(legacy || '', /2026 年 10 月第 3 个推广点/)

assert.equal(calendarCreativeErrorMessage({ error: 'quarter_plan_required' }), undefined)

const [routeSource, profileSource] = await Promise.all([
  readFile(new URL('../src/app/api/brands/[id]/brand-plan/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/dashboard/BrandProfileView.tsx', import.meta.url), 'utf8'),
])
assert(routeSource.includes('code: error.code'))
assert(routeSource.includes('details: error.details'))
assert(profileSource.includes('brandPlanErrorMessage(data)'))
assert(profileSource.includes("type === 'error' ? 12000 : 3000"))
assert(profileSource.includes('whitespace-pre-line'))

console.log('Brand plan friendly error message tests passed.')
