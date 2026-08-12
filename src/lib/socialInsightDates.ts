const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function datePartsInZone(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

export function assertSocialInsightTimeZone(timeZone: string): string {
  const normalized = timeZone.trim() || 'Asia/Singapore'
  try {
    new Intl.DateTimeFormat('en', { timeZone: normalized }).format(new Date())
    return normalized
  } catch {
    return 'Asia/Singapore'
  }
}

function zonedDateTimeToUtc(
  dateOnly: string,
  timeZone: string,
  endOfDay: boolean,
): Date {
  if (!DATE_ONLY_RE.test(dateOnly)) throw new Error('Invalid date format')
  const [year, month, day] = dateOnly.split('-').map(Number)
  const testDate = new Date(Date.UTC(year, month - 1, day))
  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) throw new Error('Invalid date')

  const hour = endOfDay ? 23 : 0
  const minute = endOfDay ? 59 : 0
  const second = endOfDay ? 59 : 0
  const millisecond = endOfDay ? 999 : 0
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  let candidate = new Date(localAsUtc)

  for (let attempt = 0; attempt < 3; attempt++) {
    const shown = datePartsInZone(candidate, timeZone)
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second, millisecond)
    const correction = localAsUtc - shownAsUtc
    if (correction === 0) break
    candidate = new Date(candidate.getTime() + correction)
  }
  return candidate
}

export function dateOnlyInTimeZone(date: Date, timeZone: string): string {
  const parts = datePartsInZone(date, timeZone)
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`
}

export function shiftDateOnly(dateOnly: string, days: number): string {
  if (!DATE_ONLY_RE.test(dateOnly)) throw new Error('Invalid date format')
  const [year, month, day] = dateOnly.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

function parseBoundary(value: string | null, timeZone: string, endOfDay: boolean): Date | null {
  if (!value) return null
  if (DATE_ONLY_RE.test(value)) return zonedDateTimeToUtc(value, timeZone, endOfDay)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${endOfDay ? 'to' : 'from'} date`)
  return parsed
}

export type SocialInsightRange = {
  from: Date
  to: Date
  fromDate: string
  toDate: string
  previousFrom: Date
  previousTo: Date
  days: number
  timeZone: string
}

export function parseSocialInsightRange(
  fromParam: string | null,
  toParam: string | null,
  requestedTimeZone: string,
  now = new Date(),
): SocialInsightRange {
  const timeZone = assertSocialInsightTimeZone(requestedTimeZone)
  const today = dateOnlyInTimeZone(now, timeZone)
  const defaultFromDate = shiftDateOnly(today, -29)
  const from = parseBoundary(fromParam, timeZone, false) ?? zonedDateTimeToUtc(defaultFromDate, timeZone, false)
  const to = parseBoundary(toParam, timeZone, true) ?? zonedDateTimeToUtc(today, timeZone, true)
  if (from.getTime() > to.getTime()) throw new Error('from date must be before to date')

  const todayEnd = zonedDateTimeToUtc(today, timeZone, true)
  if (to.getTime() > todayEnd.getTime()) throw new Error('to date cannot be in the future')

  const fromDate = DATE_ONLY_RE.test(fromParam ?? '') ? fromParam! : dateOnlyInTimeZone(from, timeZone)
  const toDate = DATE_ONLY_RE.test(toParam ?? '') ? toParam! : dateOnlyInTimeZone(to, timeZone)
  const days = Math.max(1, Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000) + 1)
  const previousToDate = shiftDateOnly(fromDate, -1)
  const previousFromDate = shiftDateOnly(fromDate, -days)
  const previousFrom = zonedDateTimeToUtc(previousFromDate, timeZone, false)
  const previousTo = zonedDateTimeToUtc(previousToDate, timeZone, true)

  return { from, to, fromDate, toDate, previousFrom, previousTo, days, timeZone }
}
