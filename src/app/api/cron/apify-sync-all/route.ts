/**
 * POST /api/cron/apify-sync-all
 *
 * Daily batch Apify scrape for ALL active brands.
 * Runs sequentially (not parallel) to avoid exhausting Apify concurrency limits.
 *
 * Protected by CRON_SECRET header.
 *
 * Render Cron setup:
 *   Schedule: 0 3 * * *  (daily at 03:00 UTC, after postfast-sync-all at 02:00)
 *   Command:  curl -X POST https://amc-kanban.onrender.com/api/cron/apify-sync-all
 *             -H "x-cron-secret: <CRON_SECRET>"
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import type { Prisma } from '@prisma/client'
import {
  scrapeGoogleMapsReviews,
  scrapeInstagram,
  scrapeTikTok,
  scrapeXiaohongshu,
  scrapeFacebook,
  type ApifyReview,
  type ApifyPost,
  type ApifyProfile,
} from '@/lib/integrations/apify'

export const maxDuration = 300

// Scraping limits per platform
const MAX_POSTS   = 50   // Instagram / TikTok / Facebook
const MAX_XHS     = 50   // Xiaohongshu (paid — confirmed OK)
const MAX_REVIEWS = 100  // Google Maps reviews

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret')
    if (provided !== cronSecret) {
      console.warn('[Apify Cron] Unauthorized attempt — invalid or missing x-cron-secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json({ error: 'APIFY_API_TOKEN not configured' }, { status: 503 })
  }

  const startedAt = new Date()
  console.log(`[Apify Cron] Starting batch sync at ${startedAt.toISOString()}`)

  const brands = await prisma.brand.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      location: true,
      address: true,
      googlePlaceId: true,
      accounts: {
        select: { id: true, platformId: true, handle: true, displayName: true, profileUrl: true },
      },
    },
  })

  console.log(`[Apify Cron] Found ${brands.length} active brands`)

  const results: Array<{
    brandId: string
    ok: boolean
    summary?: Record<string, number>
    error?: string
    durationMs?: number
  }> = []

  for (const brand of brands) {
    const t0 = Date.now()
    try {
      const summary = await syncBrand(brand)
      results.push({ brandId: brand.id, ok: true, summary, durationMs: Date.now() - t0 })
      console.log(`[Apify Cron] ✅ ${brand.name}: ${JSON.stringify(summary)} in ${Date.now() - t0}ms`)
    } catch (e: any) {
      results.push({ brandId: brand.id, ok: false, error: e?.message ?? String(e), durationMs: Date.now() - t0 })
      console.error(`[Apify Cron] ❌ ${brand.name} failed:`, e?.message ?? e)
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed    = results.filter(r => !r.ok).length
  const totalMs   = Date.now() - startedAt.getTime()
  console.log(`[Apify Cron] Done — ${succeeded} ok, ${failed} failed in ${totalMs}ms`)

  return NextResponse.json({ ok: true, startedAt, succeeded, failed, totalMs, results })
}

async function syncBrand(brand: {
  id: string
  name: string
  location: string | null
  address: unknown
  googlePlaceId: string | null
  accounts: Array<{ id: string; platformId: string; handle: string; displayName: string | null; profileUrl: string | null }>
}): Promise<Record<string, number>> {
  const instagramHandles = brand.accounts
    .filter(a => a.platformId.toLowerCase() === 'instagram' && a.handle)
    .map(a => a.handle)

  const tiktokHandles = brand.accounts
    .filter(a => a.platformId.toLowerCase() === 'tiktok' && a.handle)
    .map(a => a.handle)

  const xhsHandles = brand.accounts
    .filter(a => ['xiaohongshu', 'rednote', 'red'].includes(a.platformId.toLowerCase()) && a.handle)
    .map(a => a.handle)

  const facebookPageUrls = brand.accounts
    .filter(a => ['facebook', 'fb'].includes(a.platformId.toLowerCase()) && (a.profileUrl || a.handle))
    .map(a => a.profileUrl || `https://www.facebook.com/${a.handle}`)

  const googlePlaceId = brand.googlePlaceId
  const googleSearchQuery = !googlePlaceId && brand.name
    ? `${brand.name} ${brand.location ?? (brand.address as any)?.formatted ?? ''}`.trim()
    : undefined
  // Only scrape platforms where the brand has a configured SocialAccount in DB.
  // Exception: Google reviews use placeId or search query (it's a review scraper, not account-based).
  const hasGoogle    = !!(googlePlaceId || googleSearchQuery)
  const hasInstagram = instagramHandles.length > 0
  const hasTikTok    = tiktokHandles.length > 0
  const hasXhs       = xhsHandles.length > 0          // NO keyword fallback in cron
  const hasFacebook  = facebookPageUrls.length > 0

  if (!hasGoogle && !hasInstagram && !hasTikTok && !hasXhs && !hasFacebook) {
    return { skipped: 1 }
  }

  const previousLog = await prisma.auditLog.findFirst({
    where: { resourceId: brand.id, resourceType: 'ApifySync' },
    orderBy: { timestamp: 'desc' },
  })
  const prevMeta = (previousLog?.metadata ?? {}) as Record<string, unknown>

  const [googleResult, instagramResult, tiktokResult, xhsResult, facebookResult] = await Promise.all([
    hasGoogle
      ? scrapeGoogleMapsReviews({ placeId: googlePlaceId ?? undefined, searchQuery: googleSearchQuery, maxReviews: MAX_REVIEWS, language: 'en' })
      : Promise.resolve({ reviews: [] as ApifyReview[], runId: '', durationMs: 0 }),

    hasInstagram
      ? scrapeInstagram({ handles: instagramHandles, maxPosts: MAX_POSTS })
      : Promise.resolve({ posts: [] as ApifyPost[], profiles: [] as ApifyProfile[], runId: '', durationMs: 0 }),

    hasTikTok
      ? scrapeTikTok({ handles: tiktokHandles, maxPosts: MAX_POSTS })
      : Promise.resolve({ posts: [] as ApifyPost[], profiles: [] as ApifyProfile[], runId: '', durationMs: 0 }),

    hasXhs
      ? scrapeXiaohongshu({ handles: xhsHandles, maxPosts: MAX_XHS })
      : Promise.resolve({ posts: [] as ApifyPost[], profiles: [] as ApifyProfile[], runId: '', durationMs: 0 }),

    hasFacebook
      ? scrapeFacebook({ pageUrls: facebookPageUrls, maxPosts: MAX_POSTS })
      : Promise.resolve({ posts: [] as ApifyPost[], profiles: [] as ApifyProfile[], runId: '', durationMs: 0 }),
  ])

  const googleReviews     = googleResult.reviews.length    > 0 ? googleResult.reviews    : asArray<ApifyReview>(prevMeta.googleReviews)
  const instagramPosts    = instagramResult.posts.length   > 0 ? instagramResult.posts   : asArray<ApifyPost>(prevMeta.instagramPosts)
  const instagramProfiles = instagramResult.profiles.length> 0 ? instagramResult.profiles: asArray<ApifyProfile>(prevMeta.instagramProfiles)
  const tiktokPosts       = tiktokResult.posts.length      > 0 ? tiktokResult.posts      : asArray<ApifyPost>(prevMeta.tiktokPosts)
  const tiktokProfiles    = tiktokResult.profiles.length   > 0 ? tiktokResult.profiles   : asArray<ApifyProfile>(prevMeta.tiktokProfiles)
  const xhsPosts          = xhsResult.posts.length         > 0 ? xhsResult.posts         : asArray<ApifyPost>(prevMeta.xiaohongshuPosts)
  const facebookPosts     = facebookResult.posts.length    > 0 ? facebookResult.posts    : asArray<ApifyPost>(prevMeta.facebookPosts)
  const facebookProfiles  = facebookResult.profiles.length > 0 ? facebookResult.profiles : asArray<ApifyProfile>(prevMeta.facebookProfiles)

  const jobResults = {
    googleReviews,
    instagramPosts,
    instagramProfiles,
    tiktokPosts,
    tiktokProfiles,
    xiaohongshuPosts: xhsPosts,
    facebookPosts,
    facebookProfiles,
    summary: {
      googleReviewCount:    googleReviews.length,
      instagramPostCount:   instagramPosts.length,
      tiktokPostCount:      tiktokPosts.length,
      xiaohongshuPostCount: xhsPosts.length,
      facebookPostCount:    facebookPosts.length,
      freshSources: {
        google:      googleResult.reviews.length > 0,
        instagram:   instagramResult.posts.length > 0,
        tiktok:      tiktokResult.posts.length > 0,
        xiaohongshu: xhsResult.posts.length > 0,
        facebook:    facebookResult.posts.length > 0,
      },
      scrapedAt: new Date().toISOString(),
    },
  }

  const logEntry = await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorName: 'Apify Cron',
      actorId:   brand.id,
      action:    'APIFY_SYNC',
      resourceId:   brand.id,
      resourceType: 'ApifySync',
      reason: `Cron: ${googleReviews.length}G/${instagramPosts.length}IG/${tiktokPosts.length}TT/${xhsPosts.length}XHS/${facebookPosts.length}FB`,
      metadata: jobResults as unknown as Prisma.InputJsonValue,
    },
  })

  // Save new Google reviews as ActionItems
  if (googleResult.reviews.length > 0) {
    const existingItems = await prisma.actionItem.findMany({
      where: { brandId: brand.id, type: 'apify_review' },
      select: { payload: true },
      take: 200,
    })
    const existingHashes = new Set(
      existingItems.map((i: any) => {
        const p = i.payload && typeof i.payload === 'object' ? (i.payload as any) : null
        return `${p?.reviewerName ?? ''}:${(p?.reviewText ?? '').slice(0, 40)}`
      })
    )
    const googleAccount = brand.accounts.find(
      a => ['google', 'google_maps', 'gbp', 'gmb', 'google_business_profile'].includes(a.platformId.toLowerCase())
    )
    const newReviews = googleResult.reviews.filter(
      r => !existingHashes.has(`${r.reviewerName}:${r.text.slice(0, 40)}`)
    )
    if (newReviews.length > 0) {
      await prisma.actionItem.createMany({
        data: newReviews.map(r => ({
          brandId:     brand.id,
          accountId:   googleAccount?.id ?? null,
          type:        'apify_review',
          priority:    r.rating <= 2 ? 'high' : 'normal',
          title:       `Apify: ${r.rating}★ 评论 — ${r.reviewerName}`,
          description: r.text.slice(0, 500),
          status:      'pending',
          payload: {
            platform: 'google_maps', reviewerName: r.reviewerName,
            rating: r.rating, reviewText: r.text, replyText: r.replyText,
            reviewUrl: r.url, publishedAt: r.publishedAt, source: 'apify',
          },
        })),
        skipDuplicates: true,
      })
    }
  }

  // Update follower counts from scraped profiles
  const allProfiles: ApifyProfile[] = [
    ...instagramResult.profiles,
    ...tiktokResult.profiles,
    ...facebookResult.profiles,
  ]
  for (const profile of allProfiles) {
    if (profile.followerCount > 0) {
      await prisma.socialAccount.updateMany({
        where: { brandId: brand.id, platformId: { equals: profile.platform, mode: 'insensitive' }, handle: profile.handle },
        data: { followerCount: profile.followerCount, displayName: profile.displayName ?? undefined, snapshotAt: new Date() },
      })
    }
  }

  writeAuditLog({
    actor: { type: 'SYSTEM', name: 'Apify Cron' },
    action: 'DATA_FETCH',
    resourceId: brand.id, resourceType: 'SocialDataFetch',
    reason: `Cron 完成 — ${googleResult.reviews.length}G/${instagramResult.posts.length}IG/${tiktokResult.posts.length}TT/${xhsResult.posts.length}XHS/${facebookResult.posts.length}FB`,
    metadata: { source: 'apify_cron', logId: logEntry.id },
  })

  return {
    google: googleReviews.length, instagram: instagramPosts.length,
    tiktok: tiktokPosts.length, xiaohongshu: xhsPosts.length, facebook: facebookPosts.length,
  }
}
