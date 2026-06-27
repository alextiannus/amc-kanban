import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

/**
 * Unified Smart Scheduling Recommendation API
 *
 * Algorithm:
 *   Layer 1 — Query the last published/scheduled post time per platform
 *   Layer 2 — Compute the earliest allowed publish time (lastPost + 2 days)
 *   Layer 3 — Snap to the nearest preferred time slot (11:30, 14:00, 18:30, 20:00)
 *
 * Default rule: minimum 2 days between posts (no subscription plan enforcement yet).
 * All platforms in a multi-platform request receive the SAME recommended time.
 */

const PREFERRED_HOURS: { hour: number; minute: number }[] = [
  { hour: 11, minute: 30 },
  { hour: 14, minute: 0 },
  { hour: 18, minute: 30 },
  { hour: 20, minute: 0 },
]

const MIN_GAP_DAYS = 2

/** Find the next preferred slot at or after `earliest` */
function nextPreferredSlot(earliest: Date): Date {
  // Try slots within the next 5 days
  for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
    const base = new Date(earliest)
    base.setDate(base.getDate() + dayOffset)

    for (const { hour, minute } of PREFERRED_HOURS) {
      const candidate = new Date(base)
      candidate.setHours(hour, minute, 0, 0)

      if (candidate >= earliest) {
        return candidate
      }
    }
  }

  // Fallback: earliest + 1 hour rounded to nearest 30 min
  const fallback = new Date(earliest.getTime() + 60 * 60 * 1000)
  fallback.setMinutes(fallback.getMinutes() < 30 ? 30 : 0)
  if (fallback.getMinutes() === 0) fallback.setHours(fallback.getHours() + 1)
  return fallback
}

/** Generate the 2 alternative slots after the recommended one */
function alternativeSlots(recommended: Date): string[] {
  const alts: Date[] = []
  let cursor = recommended

  while (alts.length < 2) {
    const next = nextPreferredSlot(new Date(cursor.getTime() + 60 * 1000))
    alts.push(next)
    cursor = next
  }

  return alts.map((d) => d.toISOString())
}

/** Human-readable reason string */
function buildReason(lastPublishedAt: Date | null, gapDays: number | null): string {
  if (!lastPublishedAt) {
    return '尚无发布记录，建议在今天最近的最佳时段发布'
  }
  if (gapDays !== null && gapDays < MIN_GAP_DAYS) {
    return `距离上次发布仅 ${gapDays.toFixed(1)} 天，建议再等 ${(MIN_GAP_DAYS - gapDays).toFixed(1)} 天后发布`
  }
  return `距离上次发布已 ${gapDays?.toFixed(1)} 天，建议在最近的最佳时段发布`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId } = await params

  // Verify brand access
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    platform,      // string | null — null = aggregate across all platforms
    numberOfPosts = 1,
    urgency = 'normal',
  } = body as {
    platform?: string | null
    numberOfPosts?: number
    urgency?: 'normal' | 'urgent'
  }

  const now = new Date()

  // Determine which platforms to recommend for
  const platforms: (string | null)[] = platform ? [platform] : [null]

  const recommendations = await Promise.all(
    platforms.map(async (plat) => {
      // Layer 1 — Last published or scheduled draft
      const lastDraft = await prisma.contentDraft.findFirst({
        where: {
          brandId,
          status: { in: ['published', 'scheduled'] },
          ...(plat
            ? { account: { platform: plat } }
            : {}),
        },
        orderBy: [
          { publishedAt: 'desc' },
          { scheduledAt: 'desc' },
        ],
        select: {
          publishedAt: true,
          scheduledAt: true,
        },
      })

      const lastTime = lastDraft?.publishedAt ?? lastDraft?.scheduledAt ?? null
      const gapMs = lastTime ? now.getTime() - lastTime.getTime() : null
      const gapDays = gapMs !== null ? gapMs / (1000 * 60 * 60 * 24) : null

      // Layer 2 — Earliest allowed time
      let earliest: Date
      if (urgency === 'urgent') {
        earliest = now
      } else if (lastTime) {
        const minAllowed = new Date(lastTime.getTime() + MIN_GAP_DAYS * 24 * 60 * 60 * 1000)
        earliest = minAllowed > now ? minAllowed : now
      } else {
        earliest = now
      }

      // Layer 3 — Snap to preferred slot
      const recommendedAt = nextPreferredSlot(earliest)
      const alts = alternativeSlots(recommendedAt)

      return {
        platform: plat,
        recommendedAt: recommendedAt.toISOString(),
        reason: buildReason(lastTime, gapDays),
        alternativeSlots: alts,
        lastPublishedAt: lastTime?.toISOString() ?? null,
        gapDays: gapDays !== null ? Math.round(gapDays * 10) / 10 : null,
      }
    })
  )

  return NextResponse.json({ recommendations })
}
