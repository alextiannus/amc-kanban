import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest, requireCapability } from '@/lib/auth-v2'

async function getAgent(request: Request) {
  const principal = await authenticateRequest(request)
  return principal?.actorType === 'AMC_AGENT' ? principal : null
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

  const accountIds: string[] = (updates as Array<{ accountId?: unknown }>)
    .map((update: { accountId?: unknown }) => update.accountId)
    .filter((id: unknown): id is string => typeof id === 'string')
  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, brandId: true },
  })
  if (accounts.length !== new Set(accountIds).size) {
    return NextResponse.json({ error: 'Unknown account' }, { status: 404 })
  }
  const brandIds: string[] = accounts.map((account: { brandId: string }) => account.brandId)
  for (const brandId of new Set(brandIds)) {
    try {
      await requireCapability(agent, 'brand.update', { brandId })
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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
