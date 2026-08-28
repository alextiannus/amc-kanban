import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calendarCreativeErrorMessage } from '../src/lib/brand-plan/errorMessages.ts'

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
