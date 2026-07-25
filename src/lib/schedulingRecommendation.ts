import { prisma } from './prisma.ts'
import type { PublishingFreq } from './brandContextBuilder.ts'

// ── Global defaults (used when brand has no custom frequency plan) ────────────
const GLOBAL_PREFERRED_HOURS = [
  { hour: 11, minute: 30 },
  { hour: 14, minute: 0 },
  { hour: 18, minute: 30 },
  { hour: 20, minute: 0 },
] as const
const GLOBAL_MIN_GAP_DAYS = 2

// Derive preferred hours and min-gap from a brand's publishingFreq plan
function resolveFreqParams(
  publishingFreq: PublishingFreq | null,
  platform: string | null
): { preferredHours: Array<{ hour: number; minute: number }>; minGapDays: number } {
  if (!publishingFreq) return { preferredHours: [...GLOBAL_PREFERRED_HOURS], minGapDays: GLOBAL_MIN_GAP_DAYS }

  // Try platform-specific, then fall back to global postsPerDay
  const platformKey = platform?.toLowerCase() ?? null
  const platformCfg = platformKey && publishingFreq.platforms?.[platformKey]
    ? publishingFreq.platforms[platformKey]
    : null

  // Determine posts-per-day for gap calculation
  // Clamp defensively: postsPerDay=0/negative/Infinity → use default 0.5 to avoid 1/0 = Infinity
  const rawPpd = platformCfg?.postsPerDay
    ?? publishingFreq.postsPerDay
    ?? (platformCfg?.postsPerWeek ? platformCfg.postsPerWeek / 7 : undefined)
    ?? 0.5
  const postsPerDay = (isFinite(rawPpd) && rawPpd > 0)
    ? Math.min(Math.max(rawPpd, 0.5), 20)
    : 0.5  // safe default: 1 post every 2 days
  const minGapDays = Math.max(0.25, 1 / postsPerDay) // minimum 6 hours gap

  // Preferred hours: from platform config, else spread evenly across day
  if (platformCfg?.preferredHours && platformCfg.preferredHours.length > 0) {
    const preferredHours = platformCfg.preferredHours.map(h => ({ hour: h, minute: 0 }))
    return { preferredHours, minGapDays }
  }

  // Generate evenly-spaced slots for the given postsPerDay
  if (postsPerDay >= 1) {
    const count = Math.round(postsPerDay)
    const startHour = 10
    const endHour = 21
    const step = Math.floor((endHour - startHour) / count)
    const preferredHours = Array.from({ length: count }, (_, i) => ({
      hour: startHour + i * step,
      minute: i % 2 === 0 ? 0 : 30,
    }))
    return { preferredHours, minGapDays }
  }

  return { preferredHours: [...GLOBAL_PREFERRED_HOURS], minGapDays }
}

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

function nextPreferredSlot(
  earliest: Date,
  timezone: string,
  preferredHours: Array<{ hour: number; minute: number }> = [...GLOBAL_PREFERRED_HOURS]
): Date {
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
    
    for (const { hour, minute } of preferredHours) {
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

function alternativeSlots(
  recommended: Date,
  timezone: string,
  preferredHours: Array<{ hour: number; minute: number }> = [...GLOBAL_PREFERRED_HOURS]
): string[] {
  const alternatives: Date[] = []
  let cursor = recommended
  while (alternatives.length < 2) {
    const next = nextPreferredSlot(new Date(cursor.getTime() + 60 * 1000), timezone, preferredHours)
    alternatives.push(next)
    cursor = next
  }
  return alternatives.map((date) => date.toISOString())
}

function buildReason(lastPublishedAt: Date | null, gapDays: number | null, minGapDays: number): string {
  if (!lastPublishedAt) return '尚无发布记录，建议在今天最近的最佳时段发布'
  if (gapDays !== null && gapDays < minGapDays) {
    return `距离上次发布仅 ${gapDays.toFixed(1)} 天，建议再等 ${(minGapDays - gapDays).toFixed(1)} 天后发布`
  }
  return `距离上次发布已 ${gapDays?.toFixed(1)} 天，建议在最近的最佳时段发布`
}

export async function getSchedulingRecommendations(input: {
  brandId: string
  platform?: string | null
  urgency?: 'normal' | 'urgent'
  count?: number  // How many staggered slots to return (for batch creation)
}) {
  const now = new Date()
  const slotCount = Math.max(1, Math.min(input.count ?? 1, 20)) // cap at 20
  
  // Fetch brand timezone and publishing frequency from database
  const brand = await prisma.brand.findUnique({
    where: { id: input.brandId },
    select: { timezone: true },
  })
  const knowledge = await prisma.brandKnowledge.findUnique({
    where: { brandId: input.brandId },
    select: { publishingFreq: true },
  })
  const timezone = brand?.timezone || 'Asia/Singapore'
  const publishingFreq = (knowledge?.publishingFreq as PublishingFreq | null) ?? null
  
  const platforms: Array<string | null> = input.platform ? [input.platform] : [null]
  
  // For each platform, compute the first slot from existing schedule,
  // then stagger additional slots by advancing from the previous one.
  const recommendations = await Promise.all(
    platforms.map(async (platform) => {
      const lastDraft = await prisma.contentDraft.findFirst({
        where: {
          brandId: input.brandId,
          status: { in: ['published', 'scheduled'] },
          ...(platform ? { account: { platformId: { equals: platform, mode: 'insensitive' as const } } } : {}),
        },
        orderBy: [{ publishedAt: 'desc' }, { scheduledAt: 'desc' }],
        select: { publishedAt: true, scheduledAt: true },
      })
      const lastTime = lastDraft?.publishedAt ?? lastDraft?.scheduledAt ?? null
      const gapDays = lastTime
        ? (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60 * 24)
        : null
      // Resolve brand-specific frequency params for this platform
      const { preferredHours, minGapDays } = resolveFreqParams(publishingFreq, platform)

      const earliest =
        input.urgency === 'urgent'
          ? now
          : lastTime
            ? (() => {
                // minGapDays < 1 means postsPerDay ≥ 1 (high frequency)
                // For high freq: only skip 15 min past the last post so nextPreferredSlot
                // can pick up the next same-day preferred hour.
                // (e.g. postsPerDay=3 → 10:00 done → earliest=10:15 → picks 13:00, then 16:00)
                if (minGapDays < 1) {
                  const justAfterLast = new Date(lastTime.getTime() + 15 * 60 * 1000)
                  return new Date(Math.max(now.getTime(), justAfterLast.getTime()))
                } else {
                  // Sparse: enforce full day gap so posts are spaced across days
                  return new Date(Math.max(now.getTime(), lastTime.getTime() + minGapDays * 24 * 60 * 60 * 1000))
                }
              })()
            : now
      
      // Generate slotCount staggered slots, correctly honouring postsPerDay.
      //
      // Strategy depends on posting frequency:
      //   • postsPerDay ≥ 1 → resolveFreqParams already built exactly ⌊postsPerDay⌋ preferred
      //     hours spread through the day (e.g. postsPerDay=3 → [10:00, 13:00, 16:00]).
      //     Advance by just 1 minute after each slot so nextPreferredSlot naturally moves to
      //     the next preferred hour in the same day, then rolls to day+1 once exhausted.
      //   • postsPerDay < 1 (e.g. 0.5 = every 2 days) → advance by the full minGapDays
      //     interval so posts are properly spaced across days.
      const postsPerDay = publishingFreq
        ? ((() => {
            const pKey = platform?.toLowerCase() ?? null
            const pCfg = pKey && publishingFreq.platforms?.[pKey] ? publishingFreq.platforms[pKey] : null
            const raw = pCfg?.postsPerDay ?? publishingFreq.postsPerDay ?? 0.5
            // Same defensive clamp as resolveFreqParams — prevents Infinity from 1/0
            return (isFinite(raw) && raw > 0) ? Math.min(Math.max(raw, 0.5), 20) : 0.5
          })())
        : 0.5
      const interSlotGapMs = postsPerDay >= 1
        ? 60 * 1000                                // 1 min: cycle preferred hours within same day
        : minGapDays * 24 * 60 * 60 * 1000        // full gap: enforce sparse day spacing
      const slots: string[] = []
      let cursor = earliest
      for (let i = 0; i < slotCount; i++) {
        const slot = nextPreferredSlot(cursor, timezone, preferredHours)
        slots.push(slot.toISOString())
        cursor = new Date(slot.getTime() + interSlotGapMs)
      }
      
      const recommendedAt = slots[0]
      return {
        platform,
        recommendedAt,
        slots,
        reason: buildReason(lastTime, gapDays, minGapDays),
        alternativeSlots: alternativeSlots(new Date(recommendedAt), timezone, preferredHours),
        lastPublishedAt: lastTime?.toISOString() ?? null,
        gapDays: gapDays !== null ? Math.round(gapDays * 10) / 10 : null,
      }
    }),
  )
  
  // Flatten: if platform=null and count>1, expand the single platform entry into N recommendations
  const flatRecommendations = recommendations.flatMap((rec) => {
    if ((rec as any).slots && (rec as any).slots.length > 1) {
      return (rec as any).slots.map((slot: string, idx: number) => ({
        ...rec,
        recommendedAt: slot,
        slots: undefined,
        reason: idx === 0 ? rec.reason : `第 ${idx + 1} 篇，建议间隔发布`,
      }))
    }
    return [rec]
  })
  
  return { recommendations: flatRecommendations }
}
