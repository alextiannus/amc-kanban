import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

/** Returns true if the session user may read this brand */
async function canReadBrand(brandId: string, userId: string, userType: string): Promise<boolean> {
  if (userType === 'AI_AGENT') {
    const link = await prisma.brandAgent.findFirst({ where: { brandId, agentId: userId, active: true } })
    return !!link
  }
  const brand = await prisma.brand.findFirst({ where: { id: brandId, ownerId: userId } })
  return !!brand
}

// GET /api/brands/[id] — brand detail with accounts, pending counts, conversion summary, recent drafts
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const ok = await canReadBrand(id, session.user.id, session.user.type ?? 'HUMAN')
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findFirst({
    where: { id },
    include: {
      accounts: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, platformId: true, handle: true, displayName: true,
          autoPilot: true, followerCount: true, followerDelta: true,
          ratingScore: true, snapshotAt: true,
          profileUrl: true,   // public URL — safe to expose
          // loginUsername / loginPassword intentionally excluded (admin-only via /api/admin/brand-credentials)
        },
      },
      actionItems: {
        where: { status: 'pending' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        include: {
          account: { select: { platformId: true, handle: true } },
          draft: { select: { id: true, caption: true, scheduledAt: true, mediaUrls: true } },
        },
      },
      _count: {
        select: {
          actionItems: { where: { status: 'pending' } },
          contents: { where: { status: 'pending_review' } },
          assets: true,
        },
      },
    },
  })

  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Week conversion summary
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const conversions = await prisma.conversionEvent.groupBy({
    by: ['type', 'source'],
    where: { brandId: id, occurredAt: { gte: weekAgo } },
    _count: { id: true },
  })

  // Recent drafts (last 10) for activity feed — ordered by most recent update
  const recentDrafts = await prisma.contentDraft.findMany({
    where: { brandId: id },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    include: {
      account: { select: { platformId: true, handle: true } },
    },
  })

  return NextResponse.json({ ...brand, weekConversions: conversions, recentDrafts })
}

// PATCH /api/brands/[id] — update name, location, autoPilot
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // PATCH is owner-only — AI Agents may not modify brand metadata
  const brand = await prisma.brand.findFirst({ where: { id, ownerId: session.user.id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { name, location, timezone, autoPilot } = body

  const updated = await prisma.brand.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(location !== undefined && { location: location?.trim() || null }),
      ...(timezone !== undefined && { timezone }),
      ...(autoPilot !== undefined && { autoPilot }),
    },
  })

  return NextResponse.json(updated)
}
