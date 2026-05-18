import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function getAgent(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace('Bearer ', '').trim()
  if (!key) return null
  return prisma.user.findFirst({ where: { apiKey: key, type: 'AI_AGENT' } })
}

// POST /api/agent/snapshots
// Agent writes monitoring snapshots for social accounts
// Body: { updates: Array<{ accountId, followerCount, followerDelta?, ratingScore? }> }
export async function POST(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { updates } = body

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates array required' }, { status: 400 })
  }

  const results = await Promise.allSettled(
    updates.map(async (u: {
      accountId: string
      followerCount?: number
      followerDelta?: number
      ratingScore?: number
    }) => {
      return prisma.socialAccount.update({
        where: { id: u.accountId },
        data: {
          ...(u.followerCount !== undefined && { followerCount: u.followerCount }),
          ...(u.followerDelta !== undefined && { followerDelta: u.followerDelta }),
          ...(u.ratingScore !== undefined && { ratingScore: u.ratingScore }),
          snapshotAt: new Date(),
        },
      })
    })
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ succeeded, failed })
}
