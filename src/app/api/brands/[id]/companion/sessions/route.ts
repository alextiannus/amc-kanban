import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/brands/[id]/companion/sessions
 *
 * Admin-only: Returns paginated conversation sessions for a brand.
 * Each session includes message count, time range, and last message preview.
 *
 * Query params: ?page=1&limit=20
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

  // Admin-only access
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10))

  const [sessions, total] = await Promise.all([
    prisma.companionSession.findMany({
      where: { brandId },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        startedAt: true,
        lastActiveAt: true,
        messageCount: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            role: true,
            content: true,
            inputType: true,
          },
        },
      },
    }),
    prisma.companionSession.count({ where: { brandId } }),
  ])

  // Shape the response: attach last message preview and voice count
  const result = sessions.map((s: typeof sessions[number]) => ({
    id:           s.id,
    userId:       s.userId,
    startedAt:    s.startedAt,
    lastActiveAt: s.lastActiveAt,
    messageCount: s.messageCount,
    lastMessage:  s.messages[0] ?? null,
  }))

  return NextResponse.json({ sessions: result, total, page, limit })
}
