import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { postfastFetchAccounts, postfastListPosts } from '@/lib/integrations/postfast'
import { refreshBrandProfileMarkdown } from '@/lib/brandProfileMarkdown'

type Params = { params: Promise<{ id: string }> }

const GOOGLE_PLATFORM_ALIASES = [
  'google',
  'google_business_profile',
  'googlebusinessprofile',
  'google_my_business',
  'googlemybusiness',
  'google_maps',
  'googlemaps',
  'gbp',
  'gmb',
]

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

          // For Google Business Profile, treat legacy aliases as the same platform
          // and keep a single canonical "google" row to avoid stale duplicates.
          if (acc.platformId === 'google') {
            const existing = await prisma.socialAccount.findFirst({
              where: { brandId: id, platformId: { in: GOOGLE_PLATFORM_ALIASES } },
              orderBy: { updatedAt: 'desc' },
              select: { id: true },
            })
            if (existing) {
              await prisma.socialAccount.update({
                where: { id: existing.id },
                data: {
                  platformId: 'google',
                  handle: acc.handle,
                  displayName: acc.displayName ?? acc.handle,
                  profileUrl: acc.profileUrl ?? null,
                  ratingScore: acc.ratingScore ?? null,
                  snapshotAt: new Date(),
                },
              })
              continue
            }
          }

            // Handle rename cases: same platform + same profile URL should be
            // considered the same account even if handle changed in PostFast.
            if (acc.profileUrl) {
              const existingByProfile = await prisma.socialAccount.findFirst({
                where: { brandId: id, platformId: acc.platformId, profileUrl: acc.profileUrl },
                select: { id: true },
              })
              if (existingByProfile) {
                await prisma.socialAccount.update({
                  where: { id: existingByProfile.id },
                  data: {
                    handle: acc.handle,
                    displayName: acc.displayName ?? acc.handle,
                    followerCount: acc.followerCount ?? null,
                    followerDelta: acc.followerDelta ?? 0,
                    ratingScore: acc.ratingScore ?? null,
                    snapshotAt: new Date(),
                  },
                })
                continue
              }
            }

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
        orderBy: { updatedAt: 'desc' },
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

  let operationsReport:
    | {
        windowDays: number
        publishedCount: number
        engagement: {
          likes: number
          comments: number
          shares: number
          impressions: number
          reach: number
          interactions: number
          interactionRate: number
        }
        topPosts: Array<{
          id: string
          platform: string
          caption: string
          postUrl: string | null
          publishedAt: string | null
          interactions: number
          impressions: number
        }>
      }
    | undefined

  if (syncBrand.postfastApiKey) {
    try {
      const pfPosts = await postfastListPosts(syncBrand.postfastApiKey, {
        status: 'published',
        limit: 100,
      })
      if (pfPosts.success) {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const recent = pfPosts.posts.filter((post) => {
          const publishedAt = post.publishedAt ? new Date(post.publishedAt) : null
          return publishedAt ? publishedAt >= since : false
        })

        const engagement = recent.reduce(
          (acc, post) => {
            const likes = post.engagementStats?.likes ?? 0
            const comments = post.engagementStats?.comments ?? 0
            const shares = post.engagementStats?.shares ?? 0
            const impressions = post.engagementStats?.impressions ?? 0
            const reach = post.engagementStats?.reach ?? 0
            acc.likes += likes
            acc.comments += comments
            acc.shares += shares
            acc.impressions += impressions
            acc.reach += reach
            acc.interactions += likes + comments + shares
            return acc
          },
          {
            likes: 0,
            comments: 0,
            shares: 0,
            impressions: 0,
            reach: 0,
            interactions: 0,
          }
        )

        operationsReport = {
          windowDays: 7,
          publishedCount: recent.length,
          engagement: {
            ...engagement,
            interactionRate: engagement.impressions > 0
              ? Number(((engagement.interactions / engagement.impressions) * 100).toFixed(2))
              : 0,
          },
          topPosts: recent
            .map((post) => {
              const likes = post.engagementStats?.likes ?? 0
              const comments = post.engagementStats?.comments ?? 0
              const shares = post.engagementStats?.shares ?? 0
              const impressions = post.engagementStats?.impressions ?? 0
              return {
                id: post.id,
                platform: post.platformId || post.platform,
                caption: post.caption,
                postUrl: post.postUrl ?? null,
                publishedAt: post.publishedAt ?? null,
                interactions: likes + comments + shares,
                impressions,
              }
            })
            .sort((a, b) => b.interactions - a.interactions)
            .slice(0, 5),
        }
      }
    } catch (e) {
      console.warn('[GET /api/brands/:id] PostFast analytics sync failed (non-fatal):', e)
    }
  }

  return NextResponse.json({ ...brand, weekConversions: conversions, recentDrafts, postfastSync, operationsReport })
}

// PATCH /api/brands/[id] — update name, location, autoPilot
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
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

  if (autoPilot !== undefined) {
    await prisma.socialAccount.updateMany({
      where: { brandId: id },
      data: { autoPilot },
    })
  }

  try {
    await refreshBrandProfileMarkdown(id)
  } catch {
    // non-fatal — brand update should not fail due to profile markdown refresh
  }

  return NextResponse.json(updated)
}

// DELETE /api/brands/[id] — soft-delete by archiving brand
export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (session.user.type === 'AI_AGENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!(await canHumanAccessBrandProject(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const existing = await prisma.brand.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.status === 'ARCHIVED') {
    return NextResponse.json({ ok: true, alreadyArchived: true })
  }

  const archived = await prisma.$transaction(async (tx) => {
    const updatedBrand = await tx.brand.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    })

    await tx.brandAgent.updateMany({
      where: { brandId: id, active: true },
      data: { active: false },
    })

    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: 'HUMAN',
        actorName: session.user.email || null,
        action: 'BRAND_ARCHIVED',
        resourceId: updatedBrand.id,
        resourceType: 'Brand',
        oldValue: { status: existing.status },
        newValue: { status: updatedBrand.status },
      },
    })

    return updatedBrand
  })

  return NextResponse.json(archived)
}
