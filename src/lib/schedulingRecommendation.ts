import { prisma } from './prisma.ts'

const PREFERRED_HOURS = [
  { hour: 11, minute: 30 },
  { hour: 14, minute: 0 },
  { hour: 18, minute: 30 },
  { hour: 20, minute: 0 },
] as const
const MIN_GAP_DAYS = 2

// Timezone conversion helpers using Intl.DateTimeFormat
function getLocalDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hourCycle: 'h23'
  })
  const parts = formatter.formatToParts(date)
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day)
  }
}

function targetTimeToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const guessUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hourCycle: 'h23'
  })
  
  const parts = formatter.formatToParts(guessUTC)
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]))
  
  const guessLocalInUTC = Date.UTC(
    Number(partMap.year),
    Number(partMap.month) - 1,
    Number(partMap.day),
    Number(partMap.hour),
    Number(partMap.minute),
    0
  )
  
  const diff = guessLocalInUTC - guessUTC.getTime()
  return new Date(guessUTC.getTime() - diff)
}

function nextPreferredSlot(earliest: Date, timezone: string): Date {
  for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
    const earliestParts = getLocalDateParts(earliest, timezone)
    
    // Construct the base date in UTC and format it to get the calendar day incremented by dayOffset
    const baseDateInTargetTimezone = new Date(Date.UTC(
      earliestParts.year,
      earliestParts.month - 1,
      earliestParts.day + dayOffset
    ))
    
    // Now get the correct year, month, and day for this baseDateInTargetTimezone (it takes care of month/year overflows)
    const baseDateParts = getLocalDateParts(baseDateInTargetTimezone, 'UTC')
    
    for (const { hour, minute } of PREFERRED_HOURS) {
      const candidate = targetTimeToUTC(
        baseDateParts.year,
        baseDateParts.month,
        baseDateParts.day,
        hour,
        minute,
        timezone
      )
      if (candidate >= earliest) {
        return candidate
      }
    }
  }
  
  // Fallback (e.g. if we get past 5 days): add 1 hour to earliest in target timezone
  // Align to next half-hour or top of hour
  const earliestParts = getLocalDateParts(earliest, timezone)
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric', minute: 'numeric',
    hourCycle: 'h23'
  })
  const parts = formatter.formatToParts(earliest)
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]))
  
  let targetHour = Number(partMap.hour)
  let targetMinute = Number(partMap.minute)
  
  // add 1 hour
  targetHour += 1
  if (targetMinute < 30) {
    targetMinute = 30
  } else {
    targetMinute = 0
    targetHour += 1
  }
  
  return targetTimeToUTC(
    earliestParts.year,
    earliestParts.month,
    earliestParts.day,
    targetHour % 24,
    targetMinute,
    timezone
  )
}

function alternativeSlots(recommended: Date, timezone: string): string[] {
  const alternatives: Date[] = []
  let cursor = recommended
  while (alternatives.length < 2) {
    const next = nextPreferredSlot(new Date(cursor.getTime() + 60 * 1000), timezone)
    alternatives.push(next)
    cursor = next
  }
  return alternatives.map((date) => date.toISOString())
}

function buildReason(lastPublishedAt: Date | null, gapDays: number | null): string {
  if (!lastPublishedAt) return '尚无发布记录，建议在今天最近的最佳时段发布'
  if (gapDays !== null && gapDays < MIN_GAP_DAYS) {
    return `距离上次发布仅 ${gapDays.toFixed(1)} 天，建议再等 ${(MIN_GAP_DAYS - gapDays).toFixed(1)} 天后发布`
  }
  return `距离上次发布已 ${gapDays?.toFixed(1)} 天，建议在最近的最佳时段发布`
}

export async function getSchedulingRecommendations(input: {
  brandId: string
  platform?: string | null
  urgency?: 'normal' | 'urgent'
}) {
  const now = new Date()
  
  // Fetch brand timezone from database
  const brand = await prisma.brand.findUnique({
    where: { id: input.brandId },
    select: { timezone: true }
  })
  const timezone = brand?.timezone || 'Asia/Singapore'
  
  const platforms: Array<string | null> = input.platform ? [input.platform] : [null]
  const recommendations = await Promise.all(
    platforms.map(async (platform) => {
      const lastDraft = await prisma.contentDraft.findFirst({
        where: {
          brandId: input.brandId,
          status: { in: ['published', 'scheduled'] },
          ...(platform ? { account: { platform } } : {}),
        },
        orderBy: [{ publishedAt: 'desc' }, { scheduledAt: 'desc' }],
        select: { publishedAt: true, scheduledAt: true },
      })
      const lastTime = lastDraft?.publishedAt ?? lastDraft?.scheduledAt ?? null
      const gapDays = lastTime
        ? (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60 * 24)
        : null
      const earliest =
        input.urgency === 'urgent'
          ? now
          : lastTime
            ? new Date(
                Math.max(
                  now.getTime(),
                  lastTime.getTime() + MIN_GAP_DAYS * 24 * 60 * 60 * 1000,
                ),
              )
            : now
      const recommendedAt = nextPreferredSlot(earliest, timezone)
      return {
        platform,
        recommendedAt: recommendedAt.toISOString(),
        reason: buildReason(lastTime, gapDays),
        alternativeSlots: alternativeSlots(recommendedAt, timezone),
        lastPublishedAt: lastTime?.toISOString() ?? null,
        gapDays: gapDays !== null ? Math.round(gapDays * 10) / 10 : null,
      }
    }),
  )
  return { recommendations }
}
