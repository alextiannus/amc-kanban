import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { postfastFetchAccounts, postfastGetFollowerHistory, postfastListPosts, postfastGetAnalytics } from '@/lib/integrations/postfast'
import { syncBrandDraftStatuses } from '@/lib/syncDraftStatuses'
import { recordRemoteCopyScriptOutcome } from '@/lib/amc-content/remoteContentService'
import { processPostfastDeliveryQueue } from '@/lib/postfastDelivery'
import { syncPostfastInbox } from '@/lib/postfastInbox'
import {
  persistInternalPublishedPosts,
  persistSocialAccountMetrics,
  persistSocialPosts,
  postfastHistoryInputs,
} from '@/lib/socialInsightHistory'

// Allow up to 5 minutes for the full batch across all brands
export const maxDuration = 300

export const GOOGLE_PLATFORM_ALIASES = [
  'google', 'google_business_profile', 'googlebusinessprofile',
  'google_my_business', 'googlemybusiness', 'google_maps', 'googlemaps', 'gbp', 'gmb',
]

/**
 * POST /api/cron/postfast-sync-all
 *
 * Render Cron Job entry point. Processes durable PostFast delivery jobs first,
 * then performs the heavier account/post/analytics sync at most once per day.
 * Results are saved to:
 *   - brand.postfastSnapshot  (accounts + operationsReport JSON)
 *   - brand.postfastSyncedAt  (sync timestamp)
 *   - SocialAccount table     (upserted per account)
 *
 * Protected by CRON_SECRET env var — set the same value in Render Cron headers.
 *
 * Render Cron setup:
 *   Schedule: every 5 minutes (minute field uses step value 5)
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

  const deliveryQueue = await processPostfastDeliveryQueue({ maxRuntimeMs: 230_000 })
  const queueElapsedMs = Date.now() - startedAt.getTime()
  const fullSyncDeferred = deliveryQueue.processed > 0 && queueElapsedMs >= 45_000

  if (fullSyncDeferred) {
    console.log(`[PostFast Cron] Delivery queue used ${queueElapsedMs}ms; deferring daily full sync to a later run`)
    return NextResponse.json({
      ok: true,
      startedAt,
      deliveryQueue,
      fullSyncDeferred: true,
      succeeded: 0,
      failed: 0,
      results: [],
    })
  }

  // Draft status reconciliation stays lightweight and continues on the 5-minute cadence.
  const configuredBrands = await prisma.brand.findMany({
    where: { status: 'ACTIVE', postfastApiKey: { not: null } },
    select: {
      id: true,
      postfastApiKey: true,
      postfastSyncedAt: true,
      googlePreferOAuth: true,
      googleRefreshToken: true,
      googleLocationId: true,
    },
  }) as Array<{
    id: string
    postfastApiKey: string | null
    postfastSyncedAt: Date | null
    googlePreferOAuth: boolean
    googleRefreshToken: string | null
    googleLocationId: string | null
  }>
  const draftStatusResults: Array<{ brandId: string; checked?: number; updated?: number; error?: string }> = []
  const inboxSyncResults: Array<{ brandId: string; conversations?: number; items?: number; actionItems?: number; error?: string }> = []
  for (const brand of configuredBrands) {
    if (!brand.postfastApiKey || Date.now() - startedAt.getTime() >= 270_000) break
    try {
      const syncResult = await syncBrandDraftStatuses(brand.id, brand.postfastApiKey)
      draftStatusResults.push({ brandId: brand.id, checked: syncResult.checked, updated: syncResult.updated })
    } catch (error: unknown) {
      draftStatusResults.push({ brandId: brand.id, error: error instanceof Error ? error.message : String(error) })
    }
    try {
      const inbox = await syncPostfastInbox(brand.id, brand.postfastApiKey)
      inboxSyncResults.push({ brandId: brand.id, ...inbox })
    } catch (error: unknown) {
      inboxSyncResults.push({ brandId: brand.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // Heavy account/post/analytics sync is due at most once every 24 hours.
  const dailySyncCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const brands = configuredBrands.filter((brand) => !brand.postfastSyncedAt || brand.postfastSyncedAt <= dailySyncCutoff)

  console.log(`[PostFast Cron] Found ${brands.length} brands to sync`)

  const results: Array<{
    brandId: string
    ok: boolean
    accountCount?: number
    analyticsPostCount?: number
    experimentOutcomes?: number
    draftSync?: {
      checked: number
      updated: number
      published: number
      failed: number
      waiting: number
      unresolved: number
      skipped: number
      providerErrors: number
    }
    error?: string
  }> = []

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
      const brandResult: (typeof results)[number] = {
        brandId: brand.id,
        ok: true,
        accountCount: syncedAccounts.length,
        analyticsPostCount: analyticsPosts.length,
      }
      results.push(brandResult)
      console.log(`[PostFast Cron] ✅ brand ${brand.id}: ${syncedAccounts.length} accounts, ${analyticsPosts.length} analytics posts synced`)

      try {
        brandResult.experimentOutcomes = await syncViralCopyExperimentOutcomes(brand.id, analyticsPosts)
      } catch (outcomeError: any) {
        console.warn(`[PostFast Cron] ⚠️ brand ${brand.id}: experiment outcome sync failed (non-fatal):`, outcomeError?.message ?? outcomeError)
      }

    } catch (e: any) {
      results.push({ brandId: brand.id, ok: false, error: e?.message ?? String(e) })
      console.error(`[PostFast Cron] ❌ brand ${brand.id} failed:`, e)
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`[PostFast Cron] Done — ${succeeded} succeeded, ${failed} failed in ${Date.now() - startedAt.getTime()}ms`)

  return NextResponse.json({ ok: true, startedAt, deliveryQueue, draftStatusResults, inboxSyncResults, fullSyncDeferred: false, succeeded, failed, results })
}

export async function syncViralCopyExperimentOutcomes(brandId: string, analyticsPosts: any[]) {
  if (!analyticsPosts.length) return 0
  const drafts = await prisma.contentDraft.findMany({
    where: { brandId, viralCopyExperimentAssignmentId: { not: null }, platformPostId: { not: null } },
    select: {
      id: true, platformPostId: true, publishedAt: true,
      viralCopyExperimentAssignmentId: true,
    },
  })
  const analyticsById = new Map<string, any>()
  for (const post of analyticsPosts) {
    if (post?.id) analyticsById.set(String(post.id), post)
    if (post?.platformPostId) analyticsById.set(String(post.platformPostId), post)
  }
  let synced = 0
  for (const draft of drafts) {
    const post = analyticsById.get(String(draft.platformPostId || ''))
    if (!post?.latestMetric || !draft.viralCopyExperimentAssignmentId) continue
    const metric = post.latestMetric
    const extras = metric.extras && typeof metric.extras === 'object' ? metric.extras : {}
    const observedAt = metric.fetchedAt || new Date().toISOString()
    const numeric = (value: unknown) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
    }
    try {
      await recordRemoteCopyScriptOutcome({
        assignmentId: draft.viralCopyExperimentAssignmentId,
        draftId: draft.id,
        platformPostId: String(post.platformPostId || draft.platformPostId || ''),
        source: 'postfast',
        observedAt,
        publishedAt: post.publishedAt || draft.publishedAt?.toISOString(),
        metrics: {
          views: numeric(extras.views ?? extras.viewCount ?? extras.videoViews),
          impressions: numeric(metric.impressions),
          reach: numeric(metric.reach),
          likes: numeric(metric.likes),
          comments: numeric(metric.comments),
          shares: numeric(metric.shares),
          saves: numeric(extras.saves ?? extras.saved ?? extras.bookmarks),
          clicks: numeric(metric.clicks),
        },
        platformMetrics: { ...metric, extras },
        idempotencyKey: `${draft.viralCopyExperimentAssignmentId}:postfast:${observedAt}`,
      })
      synced += 1
    } catch (error) {
      console.warn(`[PostFast Cron] draft ${draft.id}: viral script outcome rejected (non-fatal):`, error instanceof Error ? error.message : error)
    }
  }
  return synced
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
            data: { platformId: 'google', postfastAccountId: acc.id, handle: acc.handle, displayName: acc.displayName ?? acc.handle, profileUrl: acc.profileUrl ?? null, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date(), connectionStatus: acc.connectionStatus, disabledReason: acc.disabledReason ?? null, inboxCapable: acc.inboxCapable, followerCountUpdatedAt: acc.followerCountUpdatedAt ? new Date(acc.followerCountUpdatedAt) : null },
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
            data: { postfastAccountId: acc.id, handle: acc.handle, displayName: acc.displayName ?? acc.handle, followerCount: acc.followerCount ?? null, followerDelta: acc.followerDelta ?? 0, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date(), connectionStatus: acc.connectionStatus, disabledReason: acc.disabledReason ?? null, inboxCapable: acc.inboxCapable, followerCountUpdatedAt: acc.followerCountUpdatedAt ? new Date(acc.followerCountUpdatedAt) : null },
          })
          continue
        }
      }

      await prisma.socialAccount.upsert({
        where: { brandId_platformId_handle: { brandId: brand.id, platformId: acc.platformId, handle: acc.handle } },
        create: { brandId: brand.id, platformId: acc.platformId, postfastAccountId: acc.id, handle: acc.handle, displayName: acc.displayName ?? acc.handle, profileUrl: acc.profileUrl ?? null, followerCount: acc.followerCount ?? null, followerDelta: acc.followerDelta ?? 0, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date(), connectionStatus: acc.connectionStatus, disabledReason: acc.disabledReason ?? null, inboxCapable: acc.inboxCapable, followerCountUpdatedAt: acc.followerCountUpdatedAt ? new Date(acc.followerCountUpdatedAt) : null },
        update: { postfastAccountId: acc.id, displayName: acc.displayName ?? acc.handle, profileUrl: acc.profileUrl ?? null, followerCount: acc.followerCount ?? null, followerDelta: acc.followerDelta ?? 0, ratingScore: acc.ratingScore ?? null, snapshotAt: new Date(), connectionStatus: acc.connectionStatus, disabledReason: acc.disabledReason ?? null, inboxCapable: acc.inboxCapable, followerCountUpdatedAt: acc.followerCountUpdatedAt ? new Date(acc.followerCountUpdatedAt) : null },
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
      select: { id: true, platformId: true, postfastAccountId: true, handle: true, displayName: true, followerCount: true, followerDelta: true, ratingScore: true, snapshotAt: true, profileUrl: true, connectionStatus: true, disabledReason: true, inboxCapable: true, followerCountUpdatedAt: true },
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

  // 3. Sync the full dashboard window of post analytics → stored in postfastSnapshot.analyticsPosts
  let analyticsPosts: any[] = []
  const analyticsWindowDays = 180
  const analyticsFrom = new Date(Date.now() - analyticsWindowDays * 24 * 60 * 60 * 1000)
  const analyticsTo = new Date()
  try {
    const analyticsResult = await postfastGetAnalytics(brand.postfastApiKey, {
      startDate: analyticsFrom.toISOString(),
      endDate: analyticsTo.toISOString(),
    })
    if (analyticsResult.success && analyticsResult.posts.length > 0) {
      const accountMap = new Map(pfResult.accounts.map((account: any) => [account.id, account]))
      analyticsPosts = analyticsResult.posts.map((post: any) => {
        const account = post.socialMediaId ? accountMap.get(post.socialMediaId) as any : null
        return {
          ...post,
          platform: post.platform ?? post.platformId ?? account?.platformId ?? 'unknown',
          handle: post.handle ?? account?.handle ?? account?.displayName ?? '',
          postUrl: post.postUrl ?? post.url ?? null,
        }
      })
      console.log(`[PostFast Cron] brand ${brand.id}: fetched ${analyticsPosts.length} analytics posts (last ${analyticsWindowDays} days)`)
    } else if (analyticsResult.error) {
      console.warn(`[PostFast Cron] brand ${brand.id}: analytics fetch warning — ${analyticsResult.error}`)
    }
  } catch (e: any) {
    // Non-fatal: accounts + operationsReport still sync even if analytics fails
    console.error(`[PostFast Cron] brand ${brand.id}: analytics fetch failed (non-fatal):`, e?.message ?? e)
  }

  await Promise.all([
    persistSocialPosts(brand.id, postfastHistoryInputs(analyticsPosts), analyticsTo),
    persistSocialAccountMetrics(brand.id, syncedAccounts.map((account: any) => ({
      platform: account.platformId,
      handle: account.handle,
      followerCount: account.followerCount,
      ratingScore: account.ratingScore,
      raw: account,
    })), analyticsTo),
    persistInternalPublishedPosts(brand.id, analyticsTo),
    Promise.all(pfResult.accounts.map(async (account) => {
      const history = await postfastGetFollowerHistory(brand.postfastApiKey!, account.id)
      if (!history.success) return
      await Promise.all(history.history.map((point) => persistSocialAccountMetrics(brand.id, [{
        platform: account.platformId,
        handle: account.handle,
        followerCount: point.followerCount,
        raw: point,
      }], new Date(point.capturedAt))))
    })),
  ])

  return { syncedAccounts, operationsReport, analyticsPosts, analyticsUpdatedAt: analyticsTo.toISOString() }
}
