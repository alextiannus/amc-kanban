import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBrandAccessType } from '@/lib/brandAccess'

/**
 * GET /api/brands/[id]/companion/context
 *
 * Returns a snapshot of the brand's current state to power the AI companion's
 * proactive greeting. Includes pending actions, today's schedule, and recent
 * publish activity per platform.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params

  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const accessType = await getBrandAccessType(brandId, session.user.id, session.user.type || 'HUMAN')
    if (!accessType) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)

    const [pendingActions, todayDrafts, recentPublished] = await Promise.all([
      // Pending action items (awaiting brand owner attention)
      prisma.actionItem.count({
        where: { brandId, status: { in: ['pending', 'awaiting_approval', 'PENDING', 'AWAITING_APPROVAL'] } },
      }).catch(() => 0),

      // Drafts scheduled for today
      prisma.contentDraft.findMany({
        where: {
          brandId,
          scheduledAt: { gte: startOfToday, lt: endOfToday },
          status: { in: ['scheduled', 'approved'] },
        },
        select: { id: true, platform: true, scheduledAt: true, status: true },
      }).catch(() => []),

      // Most recently published draft per platform
      prisma.contentDraft.findMany({
        where: { brandId, status: 'done' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { platform: true, updatedAt: true },
      }).catch(() => []),
    ])

    // Build lastPublishedByPlatform map
    const lastPublishedByPlatform: Record<string, string | null> = {}
    for (const draft of recentPublished) {
      if (!lastPublishedByPlatform[draft.platform]) {
        lastPublishedByPlatform[draft.platform] = draft.updatedAt.toISOString()
      }
    }

    return NextResponse.json({
      pendingActions,
      todayScheduled: todayDrafts.length,
      todayDrafts: todayDrafts.map((d: { id: string; platform: string; scheduledAt: Date | null; status: string }) => ({
        id: d.id,
        platform: d.platform,
        scheduledAt: d.scheduledAt?.toISOString(),
        status: d.status,
      })),
      lastPublishedByPlatform,
    })
  } catch (err) {
    console.error('[companion/context] Error:', err)
    // Return empty context so the greeting degrades gracefully instead of 500
    return NextResponse.json({
      pendingActions: 0,
      todayScheduled: 0,
      todayDrafts: [],
      lastPublishedByPlatform: {},
      _error: 'context unavailable',
    })
  }
}
