import { prisma } from './prisma.ts'

const PREFERRED_HOURS = [
  { hour: 11, minute: 30 },
  { hour: 14, minute: 0 },
  { hour: 18, minute: 30 },
  { hour: 20, minute: 0 },
] as const
const MIN_GAP_DAYS = 2

function nextPreferredSlot(earliest: Date): Date {
  for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
    const base = new Date(earliest)
    base.setDate(base.getDate() + dayOffset)
    for (const { hour, minute } of PREFERRED_HOURS) {
      const candidate = new Date(base)
      candidate.setHours(hour, minute, 0, 0)
      if (candidate >= earliest) return candidate
    }
  }
  const fallback = new Date(earliest.getTime() + 60 * 60 * 1000)
  fallback.setMinutes(fallback.getMinutes() < 30 ? 30 : 0)
  if (fallback.getMinutes() === 0) fallback.setHours(fallback.getHours() + 1)
  return fallback
}

function alternativeSlots(recommended: Date): string[] {
  const alternatives: Date[] = []
  let cursor = recommended
  while (alternatives.length < 2) {
    const next = nextPreferredSlot(new Date(cursor.getTime() + 60 * 1000))
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
      const recommendedAt = nextPreferredSlot(earliest)
      return {
        platform,
        recommendedAt: recommendedAt.toISOString(),
        reason: buildReason(lastTime, gapDays),
        alternativeSlots: alternativeSlots(recommendedAt),
        lastPublishedAt: lastTime?.toISOString() ?? null,
        gapDays: gapDays !== null ? Math.round(gapDays * 10) / 10 : null,
      }
    }),
  )
  return { recommendations }
}
