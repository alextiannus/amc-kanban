import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessType = await getBrandAccessType(brandId, session.user.id, (session.user as any).userType || 'HUMAN')
  if (!accessType) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)

  const [pendingActions, todayDrafts, recentPublished] = await Promise.all([
    // Pending action items (awaiting brand owner attention)
    prisma.actionItem.count({
      where: { brandId, status: { in: ['PENDING', 'AWAITING_APPROVAL'] } },
    }),

    // Drafts scheduled for today
    prisma.contentDraft.findMany({
      where: {
        brandId,
        scheduledAt: { gte: startOfToday, lt: endOfToday },
        status: { in: ['scheduled', 'approved'] },
      },
      select: { id: true, platform: true, scheduledAt: true, status: true },
    }),

    // Most recently published draft per platform
    prisma.contentDraft.findMany({
      where: { brandId, status: 'done' },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { platform: true, updatedAt: true },
    }),
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
    todayDrafts: todayDrafts.map((d) => ({
      id: d.id,
      platform: d.platform,
      scheduledAt: d.scheduledAt?.toISOString(),
      status: d.status,
    })),
    lastPublishedByPlatform,
  })
}
