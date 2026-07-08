import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { postfastFetchAccounts, postfastListPosts, postfastGetAnalytics } from '@/lib/integrations/postfast'
import { syncBrandDraftStatuses } from '@/lib/syncDraftStatuses'

// Allow up to 5 minutes for the full batch across all brands
export const maxDuration = 300

export const GOOGLE_PLATFORM_ALIASES = [
  'google', 'google_business_profile', 'googlebusinessprofile',
  'google_my_business', 'googlemybusiness', 'google_maps', 'googlemaps', 'gbp', 'gmb',
]

/**
 * POST /api/cron/postfast-sync-all
 *
 * Daily Render Cron Job entry point. Syncs PostFast data for ALL active brands
 * that have a postfastApiKey configured. Results are saved to:
 *   - brand.postfastSnapshot  (accounts + operationsReport JSON)
 *   - brand.postfastSyncedAt  (sync timestamp)
 *   - SocialAccount table     (upserted per account)
 *
 * Protected by CRON_SECRET env var — set the same value in Render Cron headers.
 *
 * Render Cron setup:
 *   Schedule: 0 2 * * *  (daily at 02:00 UTC)
 *   Command:  curl -X POST https://amc-kanban.onrender.com/api/cron/postfast-sync-all
 *             -H "x-cron-secret: <CRON_SECRET>"
 */
export async function POST(req: NextRequest) {
  // Auth: require CRON_SECRET header to prevent unauthorized invocation
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret')
    if (provided !== cronSecret) {
      console.warn('[PostFast Cron] Unauthorized attempt — invalid or missing x-cron-secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startedAt = new Date()
  console.log(`[PostFast Cron] Starting batch sync at ${startedAt.toISOString()}`)

  // Fetch all active brands that have PostFast configured
  const brands = await prisma.brand.findMany({
    where: {
      status: 'ACTIVE',
      postfastApiKey: { not: null },
    },
    select: {
      id: true,
      postfastApiKey: true,
      googlePreferOAuth: true,
      googleRefreshToken: true,
      googleLocationId: true,
    },
  })

  console.log(`[PostFast Cron] Found ${brands.length} brands to sync`)

  const results: Array<{ brandId: string; ok: boolean; accountCount?: number; analyticsPostCount?: number; error?: string }> = []

  for (const brand of brands) {
    if (!brand.postfastApiKey) continue
    try {
      const { syncedAccounts, operationsReport, analyticsPosts, analyticsUpdatedAt } = await syncBrand(brand)
      const syncedAt = new Date()
      await prisma.brand.update({
        where: { id: brand.id },
        data: {
          postfastSnapshot: { accounts: syncedAccounts, operationsReport, analyticsPosts, analyticsUpdatedAt },
          postfastSyncedAt: syncedAt,
        },
      })
      results.push({ brandId: brand.id, ok: true, accountCount: syncedAccounts.length, analyticsPostCount: analyticsPosts.length })
      console.log(`[PostFast Cron] ✅ brand ${brand.id}: ${syncedAccounts.length} accounts, ${analyticsPosts.length} analytics posts synced`)

      // Phase 4: Sync scheduled→published draft statuses
      try {
        const syncResult = await syncBrandDraftStatuses(brand.id, brand.postfastApiKey!)
        if (syncResult.updated > 0) {
          console.log(`[PostFast Cron] 📬 brand ${brand.id}: synced ${syncResult.updated}/${syncResult.checked} scheduled drafts to published/failed`)
        }
      } catch (syncErr: any) {
        console.warn(`[PostFast Cron] ⚠️ brand ${brand.id}: draft status sync failed (non-fatal):`, syncErr?.message ?? syncErr)
      }
    } catch (e: any) {
      results.push({ brandId: brand.id, ok: false, error: e?.message ?? String(e) })
      console.error(`[PostFast Cron] ❌ brand ${brand.id} failed:`, e)
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`[PostFast Cron] Done — ${succeeded} succeeded, ${failed} failed in ${Date.now() - startedAt.getTime()}ms`)

  return NextResponse.json({ ok: true, startedAt, succeeded, failed, results })
}

// ── Internal sync logic for a single brand ─────────────────────────────────

export async function syncBrand(brand: {
  id: string
  postfastApiKey: string | null
  googlePreferOAuth: boolean
  googleRefreshToken: string | null
  googleLocationId: string | null
}): Promise<{ syncedAccounts: any[]; operationsReport: any; analyticsPosts: any[]; analyticsUpdatedAt: string }> {
  if (!brand.postfastApiKey) throw new Error('No PostFast API key')

  // 1. Sync accounts
  const pfResult = await postfastFetchAccounts(brand.postfastApiKey)
  if (!pfResult.success) {
    throw new Error(pfResult.error || 'Failed to fetch accounts from PostFast')
  }

  let syncedAccounts: any[] = []
  for (const acc of pfResult.accounts) {
      if (!acc.platformId || !acc.handle) continue

      if (acc.platformId === 'google') {
        const existing = await prisma.socialAccount.findFirst({
          where: { brandId: brand.id, platformId: { in: GOOGLE_PLATFORM_ALIASES } },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        })
        if (existing) {
          await prisma.socialAccount.update({
            where: { id: existing.id },
            data: { platformId: 'google', handle: acc.handle, displayName: acc.displayName ?? acc.handle, profileUrl: acc.profileUrl ?? null, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date() },
          })
          continue
        }
      }

      if (acc.profileUrl) {
        const existingByProfile = await prisma.socialAccount.findFirst({
          where: { brandId: brand.id, platformId: acc.platformId, profileUrl: acc.profileUrl },
          select: { id: true },
        })
        if (existingByProfile) {
          await prisma.socialAccount.update({
            where: { id: existingByProfile.id },
            data: { handle: acc.handle, displayName: acc.displayName ?? acc.handle, followerCount: acc.followerCount ?? null, followerDelta: acc.followerDelta ?? 0, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date() },
          })
          continue
        }
      }

      await prisma.socialAccount.upsert({
        where: { brandId_platformId_handle: { brandId: brand.id, platformId: acc.platformId, handle: acc.handle } },
        create: { brandId: brand.id, platformId: acc.platformId, handle: acc.handle, displayName: acc.displayName ?? acc.handle, profileUrl: acc.profileUrl ?? null, followerCount: acc.followerCount ?? null, followerDelta: acc.followerDelta ?? 0, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date() },
        update: { displayName: acc.displayName ?? acc.handle, profileUrl: acc.profileUrl ?? null, followerCount: acc.followerCount ?? null, followerDelta: acc.followerDelta ?? 0, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date() },
      })
    }

    // Prune stale accounts
    const postfastHandles = pfResult.accounts.map((a: any) => ({ platformId: a.platformId, handle: a.handle }))
    const dbAccounts = await prisma.socialAccount.findMany({ where: { brandId: brand.id }, select: { id: true, platformId: true, handle: true } })
    const isDirectGoogle = brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId
    const toDelete = dbAccounts.filter((db: any) => {
      if (db.platformId === 'google' && isDirectGoogle) return false
      return !postfastHandles.some((pf: any) => pf.platformId.toLowerCase() === db.platformId.toLowerCase() && pf.handle.toLowerCase() === db.handle.toLowerCase())
    })
    if (toDelete.length > 0) {
      await prisma.socialAccount.deleteMany({ where: { id: { in: toDelete.map((a: any) => a.id) } } })
    }

    syncedAccounts = await prisma.socialAccount.findMany({
      where: { brandId: brand.id },
      select: { id: true, platformId: true, handle: true, displayName: true, followerCount: true, followerDelta: true, ratingScore: true, snapshotAt: true, profileUrl: true },
    })

  // 2. Build 7-day operations report
  let operationsReport: any = null
  const pfPosts = await postfastListPosts(brand.postfastApiKey, { status: 'published', limit: 100 })
  if (pfPosts.success) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recent = pfPosts.posts.filter((post: any) => {
      const publishedAt = post.publishedAt ? new Date(post.publishedAt) : null
      return publishedAt ? publishedAt >= since : false
    })
    const engagement = recent.reduce(
      (acc: any, post: any) => {
        acc.likes += post.engagementStats?.likes ?? 0
        acc.comments += post.engagementStats?.comments ?? 0
        acc.shares += post.engagementStats?.shares ?? 0
        acc.impressions += post.engagementStats?.impressions ?? 0
        acc.reach += post.engagementStats?.reach ?? 0
        acc.interactions += (post.engagementStats?.likes ?? 0) + (post.engagementStats?.comments ?? 0) + (post.engagementStats?.shares ?? 0)
        return acc
      },
      { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0, interactions: 0 }
    )
    operationsReport = {
      windowDays: 7,
      publishedCount: recent.length,
      engagement: { ...engagement, interactionRate: engagement.impressions > 0 ? Number(((engagement.interactions / engagement.impressions) * 100).toFixed(2)) : 0 },
      topPosts: recent
        .map((post: any) => ({ id: post.id, platform: post.platformId || post.platform, caption: post.caption, postUrl: post.postUrl ?? null, publishedAt: post.publishedAt ?? null, interactions: (post.engagementStats?.likes ?? 0) + (post.engagementStats?.comments ?? 0) + (post.engagementStats?.shares ?? 0), impressions: post.engagementStats?.impressions ?? 0 }))
        .sort((a: any, b: any) => b.interactions - a.interactions)
        .slice(0, 5),
    }
  }

  // 3. Sync last 9 days of post analytics → stored in postfastSnapshot.analyticsPosts
  let analyticsPosts: any[] = []
  const analyticsFrom = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000)
  const analyticsTo = new Date()
  try {
    const analyticsResult = await postfastGetAnalytics(brand.postfastApiKey, {
      startDate: analyticsFrom.toISOString(),
      endDate: analyticsTo.toISOString(),
    })
    if (analyticsResult.success && analyticsResult.posts.length > 0) {
      analyticsPosts = analyticsResult.posts
      console.log(`[PostFast Cron] brand ${brand.id}: fetched ${analyticsPosts.length} analytics posts (last 9 days)`)
    } else if (analyticsResult.error) {
      console.warn(`[PostFast Cron] brand ${brand.id}: analytics fetch warning — ${analyticsResult.error}`)
    }
  } catch (e: any) {
    // Non-fatal: accounts + operationsReport still sync even if analytics fails
    console.error(`[PostFast Cron] brand ${brand.id}: analytics fetch failed (non-fatal):`, e?.message ?? e)
  }

  return { syncedAccounts, operationsReport, analyticsPosts, analyticsUpdatedAt: analyticsTo.toISOString() }
}
