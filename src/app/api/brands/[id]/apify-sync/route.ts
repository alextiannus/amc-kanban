/**
 * POST /api/brands/[id]/apify-sync
 *   Triggers Apify scrapers for this brand based on configured accounts & settings.
 *   Returns immediately with a job manifest; results are stored in AuditLog.
 *
 * GET /api/brands/[id]/apify-sync
 *   Returns the most recent sync result stored in AuditLog for this brand.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { writeAuditLog } from '@/lib/audit'
import type { Prisma } from '@prisma/client'
import {
  scrapeGoogleMapsReviews,
  scrapeInstagram,
  scrapeTikTok,
  scrapeXiaohongshu,
  type ApifyReview,
  type ApifyPost,
  type ApifyProfile,
} from '@/lib/integrations/apify'

type Params = { params: Promise<{ id: string }> }

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

// ── GET — return latest sync result ──────────────────────────────────────────
export async function GET(req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ok = await canSessionAccessBrandProject(
    id, session.user.id, session.user.type ?? 'HUMAN', session.user.role
  )
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const latest = await prisma.auditLog.findFirst({
    where: { resourceId: id, resourceType: 'ApifySync' },
    orderBy: { timestamp: 'desc' },
  })

  if (!latest) {
    return NextResponse.json({ hasSyncData: false, syncedAt: null, data: null })
  }

  const meta = (latest.metadata ?? {}) as Record<string, unknown>
  return NextResponse.json({
    hasSyncData: true,
    syncedAt: latest.timestamp,
    runId: latest.reason,
    data: meta,
  })
}

// ── POST — trigger new sync ───────────────────────────────────────────────────
export async function POST(req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ok = await canSessionAccessBrandProject(
    id, session.user.id, session.user.type ?? 'HUMAN', session.user.role
  )
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json({ error: 'APIFY_API_TOKEN is not configured on the server' }, { status: 503 })
  }

  // Load brand with accounts
  const brand = await prisma.brand.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      googlePlaceId: true,
      accounts: {
        select: { id: true, platformId: true, handle: true, displayName: true },
      },
    },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Determine what to scrape
  const instagramHandles = brand.accounts
    .filter(a => a.platformId.toLowerCase() === 'instagram' && a.handle)
    .map(a => a.handle)

  const tiktokHandles = brand.accounts
    .filter(a => a.platformId.toLowerCase() === 'tiktok' && a.handle)
    .map(a => a.handle)

  const xiaohongshuHandles = brand.accounts
    .filter(a => ['xiaohongshu', 'rednote', 'red'].includes(a.platformId.toLowerCase()) && a.handle)
    .map(a => a.handle)

  const googlePlaceId = brand.googlePlaceId
  const googleSearchQuery = !googlePlaceId && brand.name
    ? `${brand.name} ${brand.location ?? brand.address ?? ''}`.trim()
    : undefined

  const hasGoogleTarget  = !!(googlePlaceId || googleSearchQuery)
  const hasInstagram     = instagramHandles.length > 0
  const hasTikTok        = tiktokHandles.length > 0
  const hasXiaohongshu   = xiaohongshuHandles.length > 0
  const hasBrandKeywords = !!(brand.name)

  if (!hasGoogleTarget && !hasInstagram && !hasTikTok && !hasXiaohongshu) {
    return NextResponse.json({
      error: 'No scrapeable targets configured. Add a Google Place ID or social accounts to proceed.',
    }, { status: 422 })
  }

  const t0 = Date.now()
  const jobResults: Record<string, unknown> = {}
  const errors: string[] = []

  // ── Run all scrapers in parallel ─────────────────────────────────────────
  const [googleResult, instagramResult, tiktokResult, xiaohongshuResult] = await Promise.all([
    hasGoogleTarget
      ? scrapeGoogleMapsReviews({
          placeId: googlePlaceId ?? undefined,
          searchQuery: googleSearchQuery,
          maxReviews: 80,
          language: 'en',
        })
      : Promise.resolve({ reviews: [] as ApifyReview[], runId: '', durationMs: 0, error: 'No target' }),

    hasInstagram
      ? scrapeInstagram({ handles: instagramHandles, maxPosts: 30 })
      : Promise.resolve({ posts: [] as ApifyPost[], profiles: [] as ApifyProfile[], runId: '', durationMs: 0, error: 'No handles' }),

    hasTikTok
      ? scrapeTikTok({ handles: tiktokHandles, maxPosts: 30 })
      : Promise.resolve({ posts: [] as ApifyPost[], profiles: [] as ApifyProfile[], runId: '', durationMs: 0, error: 'No handles' }),

    hasXiaohongshu
      ? scrapeXiaohongshu({ handles: xiaohongshuHandles, maxPosts: 20 })
      : (hasBrandKeywords
          ? scrapeXiaohongshu({ keywords: [brand.name, brand.location ?? ''].filter(Boolean), maxPosts: 20 })
          : Promise.resolve({ posts: [] as ApifyPost[], profiles: [] as ApifyProfile[], runId: '', durationMs: 0, error: 'No target' })),
  ])

  const totalDurationMs = Date.now() - t0

  // ── Load previous sync to preserve data for platforms that failed this run ──
  // If TikTok / Google / etc. scraper is blocked and returns 0 items, we keep
  // the last successful dataset for that platform rather than wiping it.
  const previousLog = await prisma.auditLog.findFirst({
    where: { resourceId: id, resourceType: 'ApifySync' },
    orderBy: { timestamp: 'desc' },
  })
  const prevMeta = (previousLog?.metadata ?? {}) as Record<string, unknown>

  // ── Collect results ───────────────────────────────────────────────────────
  if (googleResult.error) errors.push(`Google Business: ${googleResult.error}`)
  if (instagramResult.error) errors.push(`Instagram: ${instagramResult.error}`)
  if (tiktokResult.error) errors.push(`TikTok: ${tiktokResult.error}`)
  if (xiaohongshuResult.error) errors.push(`Xiaohongshu: ${xiaohongshuResult.error}`)

  // Smart merge: use fresh data if we got any, otherwise fall back to previous
  const googleReviews = googleResult.reviews.length > 0
    ? googleResult.reviews
    : asArray<ApifyReview>(prevMeta.googleReviews)

  const instagramPosts = instagramResult.posts.length > 0
    ? instagramResult.posts
    : asArray<ApifyPost>(prevMeta.instagramPosts)

  const instagramProfiles = instagramResult.profiles.length > 0
    ? instagramResult.profiles
    : asArray<ApifyProfile>(prevMeta.instagramProfiles)

  const tiktokPosts = tiktokResult.posts.length > 0
    ? tiktokResult.posts
    : asArray<ApifyPost>(prevMeta.tiktokPosts)

  const tiktokProfiles = tiktokResult.profiles.length > 0
    ? tiktokResult.profiles
    : asArray<ApifyProfile>(prevMeta.tiktokProfiles)

  const xiaohongshuPosts = xiaohongshuResult.posts.length > 0
    ? xiaohongshuResult.posts
    : asArray<ApifyPost>(prevMeta.xiaohongshuPosts)

  jobResults.googleReviews     = googleReviews
  jobResults.instagramPosts    = instagramPosts
  jobResults.instagramProfiles = instagramProfiles
  jobResults.tiktokPosts       = tiktokPosts
  jobResults.tiktokProfiles    = tiktokProfiles
  jobResults.xiaohongshuPosts  = xiaohongshuPosts

  jobResults.summary = {
    googleReviewCount:    googleReviews.length,
    instagramPostCount:   instagramPosts.length,
    tiktokPostCount:      tiktokPosts.length,
    xiaohongshuPostCount: xiaohongshuPosts.length,
    // Track which platforms used fresh vs cached data
    freshSources: {
      google:      googleResult.reviews.length > 0,
      instagram:   instagramResult.posts.length > 0,
      tiktok:      tiktokResult.posts.length > 0,
        xiaohongshu: xiaohongshuResult.posts.length > 0,
    },
    totalDurationMs,
    scrapedAt: new Date().toISOString(),
    brandId: id,
    brandName: brand.name,
    errors: errors.length > 0 ? errors : undefined,
  }

  // ── Persist to AuditLog (as ApifySync) ───────────────────────────────────
  const logEntry = await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorName: 'Apify Scraper',
      actorId: session.user.id,
      action: 'APIFY_SYNC',
      resourceId: id,
      resourceType: 'ApifySync',
      reason: `Sync: ${googleReviews.length} reviews (${googleResult.reviews.length} fresh), ${instagramPosts.length} IG (${instagramResult.posts.length} fresh), ${tiktokPosts.length} TT (${tiktokResult.posts.length} fresh)`,
      metadata: jobResults as Prisma.InputJsonValue,
    },
  })


  // ── Also persist scraped reviews as ActionItems (feeds sentiment dashboard) ──
  if (googleResult.reviews.length > 0) {
    // Only save reviews not already in DB (deduplicate by reviewer+text hash)
    const existingItems = await prisma.actionItem.findMany({
      where: { brandId: id, type: 'apify_review' },
      select: { payload: true },
      take: 200,
    })
    const existingHashes = new Set(
      existingItems.map((i) => {
        const payload = i.payload && typeof i.payload === 'object'
          ? (i.payload as { reviewerName?: unknown; reviewText?: unknown })
          : null
        const reviewerName = typeof payload?.reviewerName === 'string' ? payload.reviewerName : ''
        const reviewText = typeof payload?.reviewText === 'string' ? payload.reviewText : ''
        return `${reviewerName}:${reviewText.slice(0, 40)}`
      })
    )

    const googleAccount = brand.accounts.find(
      a => ['google', 'google_maps', 'gbp', 'gmb', 'google_business_profile'].includes(a.platformId.toLowerCase())
    )

    const newReviews = googleResult.reviews.filter(r => {
      const hash = `${r.reviewerName}:${r.text.slice(0, 40)}`
      return !existingHashes.has(hash)
    })

    if (newReviews.length > 0) {
      await prisma.actionItem.createMany({
        data: newReviews.map(r => ({
          brandId: id,
          accountId: googleAccount?.id || null,
          type: 'apify_review',
          priority: r.rating <= 2 ? 'high' : 'normal',
          title: `Apify: ${r.rating}★ 评论 — ${r.reviewerName}`,
          description: r.text.slice(0, 500),
          status: 'pending',
          payload: {
            platform: 'google_maps',
            reviewerName: r.reviewerName,
            rating: r.rating,
            reviewText: r.text,
            replyText: r.replyText,
            reviewUrl: r.url,
            publishedAt: r.publishedAt,
            source: 'apify',
          },
        })),
        skipDuplicates: true,
      })
    }
  }

  // ── Update SocialAccount follower counts from Apify profiles ─────────────
  const allProfiles: ApifyProfile[] = [
    ...instagramResult.profiles,
    ...tiktokResult.profiles,
  ]
  for (const profile of allProfiles) {
    if (profile.followerCount > 0) {
      await prisma.socialAccount.updateMany({
        where: {
          brandId: id,
          platformId: { equals: profile.platform, mode: 'insensitive' },
          handle: profile.handle,
        },
        data: {
          followerCount: profile.followerCount,
          displayName: profile.displayName ?? undefined,
          snapshotAt: new Date(),
        },
      })
    }
  }

  // ── Write sync audit log ──────────────────────────────────────────────────
  writeAuditLog({
    actor: { type: 'SYSTEM', name: 'Apify Integration' },
    action: 'DATA_FETCH',
    resourceId: id,
    resourceType: 'SocialDataFetch',
    reason: `Apify 全平台采集完成 — ${googleResult.reviews.length} 条 Google 评论, ${instagramResult.posts.length} 条 IG 帖子, ${tiktokResult.posts.length} 条 TikTok 帖子`,
    metadata: {
      source: 'apify',
      logId: logEntry.id,
      totalDurationMs,
      errors: errors.length > 0 ? errors : null,
      summary: jobResults.summary,
    },
  })

  return NextResponse.json({
    success: true,
    syncedAt: logEntry.timestamp,
    logId: logEntry.id,
    summary: jobResults.summary,
    errors: errors.length > 0 ? errors : undefined,
  })
}
