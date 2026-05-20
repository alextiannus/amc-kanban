import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { postfastFetchAccounts } from '@/lib/integrations/postfast'

type Params = { params: Promise<{ id: string }> }

// GET /api/brands/[id] — brand detail with accounts, pending counts, conversion summary, recent drafts
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const ok = await canSessionAccessBrandProject(
    id,
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role
  )
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Keep dashboard accounts fresh: sync PostFast-bound accounts into SocialAccount
  // before returning brand detail. Non-fatal if PostFast is temporarily unavailable.
  const syncBrand = await prisma.brand.findUnique({
    where: { id },
    select: { id: true, postfastApiKey: true },
  })
  if (!syncBrand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let postfastSync: { ok: boolean; error?: string } | undefined

  if (syncBrand.postfastApiKey) {
    try {
      const pfResult = await postfastFetchAccounts(syncBrand.postfastApiKey)
      if (pfResult.success) {
        postfastSync = { ok: true }
        for (const acc of pfResult.accounts) {
          if (!acc.platformId || !acc.handle) continue
          await prisma.socialAccount.upsert({
            where: {
              brandId_platformId_handle: {
                brandId: id,
                platformId: acc.platformId,
                handle: acc.handle,
              },
            },
            create: {
              brandId: id,
              platformId: acc.platformId,
              handle: acc.handle,
              displayName: acc.displayName ?? acc.handle,
              profileUrl: acc.profileUrl ?? null,
              followerCount: acc.followerCount ?? null,
              followerDelta: acc.followerDelta ?? 0,
              ratingScore: acc.ratingScore ?? null,
              snapshotAt: new Date(),
            },
            update: {
              displayName: acc.displayName ?? acc.handle,
              profileUrl: acc.profileUrl ?? null,
              followerCount: acc.followerCount ?? null,
              followerDelta: acc.followerDelta ?? 0,
              ratingScore: acc.ratingScore ?? null,
              snapshotAt: new Date(),
            },
          })
        }
      } else {
        postfastSync = { ok: false, error: pfResult.error }
      }
    } catch (e) {
      console.warn('[GET /api/brands/:id] PostFast account sync failed (non-fatal):', e)
      postfastSync = { ok: false, error: 'PostFast sync failed' }
    }
  }

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

  return NextResponse.json({ ...brand, weekConversions: conversions, recentDrafts, postfastSync })
}

// PATCH /api/brands/[id] — update name, location, autoPilot
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // PATCH allows HUMAN users with delegated AI permission access.
  if (session.user.type === 'AI_AGENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!(await canHumanAccessBrandProject(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
