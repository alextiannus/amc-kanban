import { runBrandPlanAction } from '../src/lib/brand-plan/service.ts'

const CONTENT_PLANNING_LEAD_DAYS = 7

const brandId = process.env.BRAND_ID || 'cmpaz4kwn0000lv2aa67iic3o'
const requestedMonth = process.env.CALENDAR_MONTH || minimumContentPlanDateValue().slice(0, 7)

function datePartsInSingapore(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function minimumContentPlanDateValue(base = new Date()) {
  const parts = datePartsInSingapore(base)
  const minimum = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + CONTENT_PLANNING_LEAD_DAYS))
  const next = datePartsInSingapore(minimum)
  return `${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const minimumDate = minimumContentPlanDateValue()
const minimumMonth = minimumDate.slice(0, 7)
const savedMonth = requestedMonth < minimumMonth ? minimumMonth : requestedMonth

const result = await runBrandPlanAction({
  brandId,
  action: 'generate_publishing_calendar',
  body: { month: requestedMonth },
})

const items = result.marketingSolution?.publishingCalendar?.months?.[savedMonth] || []
const badItems = items.filter((item) => !item.date || item.date < minimumDate)

assert(items.length > 0, `publishing_calendar_empty:${savedMonth}`)
assert(badItems.length === 0, `calendar_lead_time_failed:${JSON.stringify(badItems.slice(0, 3))}`)

const sortedDates = items.map((item) => item.date).sort()

console.log(JSON.stringify({
  ok: true,
  brandId,
  requestedMonth,
  savedMonth,
  minimumDate,
  itemCount: items.length,
  firstDate: sortedDates[0],
  lastDate: sortedDates[sortedDates.length - 1],
}, null, 2))
