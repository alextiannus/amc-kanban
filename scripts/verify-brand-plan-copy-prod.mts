import { runBrandPlanAction } from '../src/lib/brand-plan/service.ts'

const brandId = process.env.BRAND_ID || 'cmpaz4kwn0000lv2aa67iic3o'
const month = process.env.CALENDAR_MONTH || '2026-09'

const bannedPattern = /Bao Specialty|SAVE THIS|DAILY|breakfast|Afternoon Tea|bakery|\.mp4|#武冈|破酥包|查看原视频链接|查看参考视频|参考内容/i

const result = await runBrandPlanAction({
  brandId,
  action: 'generate_publishing_calendar',
  body: { month },
})

const items = result.marketingSolution?.publishingCalendar?.months?.[month] || []
const badItems = items.filter((item) => bannedPattern.test([
  item.title,
  item.planning,
  item.sampleHit,
].join(' ')))
const badSampleHits = items.filter((item) => String(item.sampleHit || '').trim())

if (!items.length) throw new Error(`calendar_empty:${month}`)
if (badItems.length) {
  throw new Error(`off_brand_copy:${JSON.stringify(badItems.slice(0, 3).map((item) => ({
    title: item.title,
    planning: item.planning,
    sampleHit: item.sampleHit,
  })))}`)
}
if (badSampleHits.length) {
  throw new Error(`sample_hit_should_be_empty:${JSON.stringify(badSampleHits.slice(0, 3).map((item) => ({
    title: item.title,
    sampleHit: item.sampleHit,
  })))}`)
}

console.log(JSON.stringify({
  ok: true,
  brandId,
  month,
  count: items.length,
  samples: items.slice(0, 6).map((item) => ({
    date: item.date,
    platform: item.platform,
    title: item.title,
    product: item.product,
    hook: `${item.planning.split('。')[0]}。`,
  })),
}, null, 2))
