import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { postfastGetAnalytics, postfastFetchAccounts } from '@/lib/integrations/postfast'
import { fetchGoogleReviews, fetchGoogleGBPReviews, getGoogleAccessToken } from '@/lib/integrations/google'
import { writeAuditLog } from '@/lib/audit'
import {
  asArray,
  detectContentType,
  extractKeywordsFromTexts,
} from './socialInsightUtils'
import { dateOnlyInTimeZone, parseSocialInsightRange, shiftDateOnly } from '@/lib/socialInsightDates'
import {
  apifyPostHistoryInputs,
  loadAccountMetricHistory,
  loadPersistedPosts,
  loadPersistedReviews,
  persistSocialAccountMetrics,
  persistSocialPosts,
  persistSocialReviews,
  reviewHistoryInputs,
  socialHistoryAvailability,
  type SocialHistoryPostInput,
  type SocialHistoryReviewInput,
} from '@/lib/socialInsightHistory'

type Params = { params: Promise<{ id: string }> }

type JsonObject = Record<string, unknown>

type PostfastAccount = {
  id: string
  platformId?: string
  handle?: string
  displayName?: string
}

type PostfastMetric = {
  likes?: string
  comments?: string
  shares?: string
  impressions?: string
  reach?: string
}

type PostfastAnalyticsItem = {
  id: string
  socialMediaId?: string
  content: string
  publishedAt: string
  latestMetric?: PostfastMetric | null
}

type ApifyCachedPost = {
  source?: string
  postId?: string
  platform?: string
  handle?: string
  caption?: string
  url?: string
  publishedAt?: string
  imageUrl?: string
  likes?: number
  comments?: number
  shares?: number
  views?: number
}

const METRIC_SOURCE_PRIORITY: Record<string, number> = {
  postfast: 3,
  instagram: 2,
  tiktok: 2,
  xiaohongshu: 2,
  facebook: 2,
  apify: 2,
  internal: 1,
}

type ApifyCachedReview = {
  reviewerName?: string
  rating?: number
  text?: string
  replyText?: string
  publishedAt?: string
}



export interface AnalyticsPost {
  id: string
  source: 'postfast' | 'internal' | string
  platform: string
  handle: string
  caption: string
  postUrl: string | null
  publishedAt: string
  contentType: string
  status: string
  hashtags: string[]
  mediaUrls: string[]
  scheduledAt: string | null
  likes: number
  comments: number
  shares: number
  impressions: number
  reach: number
  engRate: number
}

function normalizePostUrl(value?: string | null): string {
  if (!value || !value.startsWith('http')) return ''
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return value.toLowerCase().split('?')[0].replace(/\/+$/, '')
  }
}

function normalizePostCaption(value?: string | null): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_-]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function postIdentityKeys(post: AnalyticsPost): string[] {
  const keys: string[] = []
  const rawId = post.id.replace(/^pf_/, '').replace(/^apify_[^_]+_/, '')
  const normalizedUrl = normalizePostUrl(post.postUrl)
  const publishedDay = post.publishedAt.slice(0, 10)
  const captionKey = normalizePostCaption(post.caption)

  if (post.source === 'postfast' && rawId) keys.push(`postfast:${rawId}`)
  if (post.source === 'internal' && post.postUrl && !post.postUrl.startsWith('http')) keys.push(`postfast:${post.postUrl}`)
  if (normalizedUrl) keys.push(`url:${normalizedUrl}`)
  if (captionKey) keys.push(`content:${post.platform.toLowerCase()}:${publishedDay}:${captionKey}`)

  return keys
}

function metricWeight(post: AnalyticsPost): number {
  const interactions = post.likes + post.comments + post.shares
  const hasRealMetrics = post.impressions > 0 || post.reach > 0 || interactions > 0
  return (hasRealMetrics ? 100 : 0) + (METRIC_SOURCE_PRIORITY[post.source] ?? 0)
}

function dedupeAnalyticsPosts(posts: AnalyticsPost[]): AnalyticsPost[] {
  const selected: AnalyticsPost[] = []
  const keyToIndex = new Map<string, number>()

  for (const post of [...posts].sort((a, b) => metricWeight(b) - metricWeight(a))) {
    const keys = postIdentityKeys(post)
    const existingIndex = keys.map((key) => keyToIndex.get(key)).find((idx) => idx !== undefined)

    if (existingIndex === undefined) {
      const index = selected.push(post) - 1
      keys.forEach((key) => keyToIndex.set(key, index))
      continue
    }

    const existing = selected[existingIndex]
    if (metricWeight(post) > metricWeight(existing)) {
      selected[existingIndex] = post
      keys.forEach((key) => keyToIndex.set(key, existingIndex))
    }
  }

  return selected.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

// ── Fetch published posts from PostFast (DB-first, live fallback) ─────────────
// Reads from brand.postfastSnapshot.analyticsPosts when available and fresh
// (synced within last 25 hours by the daily cron). Falls back to live API
// only when cache is missing or stale, to avoid 504s on every page load.
async function fetchPostfastPosts(
  apiKey: string,
  from: Date,
  to: Date,
  cachedPosts?: any[] | null,
  cacheUpdatedAt?: string | null
): Promise<{ posts: AnalyticsPost[]; error?: string; durationMs: number; fromCache?: boolean }> {
  const t0 = Date.now()

  // ── Try DB cache first ───────────────────────────────────────────────────
  const CACHE_TTL_MS = 25 * 60 * 60 * 1000 // 25 hours (daily cron + buffer)
  const cacheAge = cacheUpdatedAt ? Date.now() - new Date(cacheUpdatedAt).getTime() : Infinity
  if (cachedPosts && cachedPosts.length > 0 && cacheAge < CACHE_TTL_MS) {
    // Filter cached posts to the requested date range
    const filtered = cachedPosts.filter((p: any) => {
      if (!p.publishedAt) return true
      const d = new Date(p.publishedAt).getTime()
      return d >= from.getTime() && d <= to.getTime()
    })
    const posts: AnalyticsPost[] = filtered.map((p: any) => {
      const m = p.latestMetric
      const likes       = m ? parseInt(m.likes ?? '0', 10) : 0
      const comments    = m ? parseInt(m.comments ?? '0', 10) : 0
      const shares      = m ? parseInt(m.shares ?? '0', 10) : 0
      const impressions = m ? parseInt(m.impressions ?? '0', 10) : 0
      const reach       = m ? parseInt(m.reach ?? '0', 10) : 0
      const interactions = likes + comments + shares
      return {
        id: `pf_${p.id}`,
        source: 'postfast',
        platform: (p as any).platform ?? 'unknown',
        handle: (p as any).handle ?? '',
        caption: p.content,
        postUrl: null,
        publishedAt: p.publishedAt,
        contentType: detectContentType(p.content, [], []),
        status: 'published',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: null,
        likes, comments, shares, impressions, reach,
        engRate: impressions > 0 ? Number(((interactions / impressions) * 100).toFixed(2)) : 0,
      }
    })
    console.log(`[SocialInsight] Using DB-cached Postfast data: ${posts.length} posts (cache age: ${Math.round(cacheAge / 3600000)}h)`)
    return { posts, durationMs: Date.now() - t0, fromCache: true }
  }

  // ── Fallback: live API call ───────────────────────────────────────────────
  console.log(`[SocialInsight] Cache miss or stale (age: ${Math.round(cacheAge / 3600000)}h), fetching from Postfast API`)
  try {
    const [analyticsResult, accountsResult] = await Promise.all([
      postfastGetAnalytics(apiKey, { startDate: from.toISOString(), endDate: to.toISOString() }),
      postfastFetchAccounts(apiKey),
    ])

    if (!analyticsResult.success) {
      return { posts: [], error: analyticsResult.error, durationMs: Date.now() - t0 }
    }

    const accountMap = new Map(
      asArray<PostfastAccount>(accountsResult.accounts).map((a: any) => [a.id, a])
    )

    const posts: AnalyticsPost[] = asArray<PostfastAnalyticsItem>(analyticsResult.posts).map((p: any) => {
      const m = p.latestMetric
      const likes       = m ? parseInt(m.likes ?? '0', 10) : 0
      const comments    = m ? parseInt(m.comments ?? '0', 10) : 0
      const shares      = m ? parseInt(m.shares ?? '0', 10) : 0
      const impressions = m ? parseInt(m.impressions ?? '0', 10) : 0
      const reach       = m ? parseInt(m.reach ?? '0', 10) : 0
      const interactions = likes + comments + shares
      const account = p.socialMediaId ? accountMap.get(p.socialMediaId) : undefined

      return {
        id: `pf_${p.id}`,
        source: 'postfast',
        platform: account?.platformId ?? 'unknown',
        handle: account?.handle ?? account?.displayName ?? '',
        caption: p.content,
        postUrl: null,
        publishedAt: p.publishedAt,
        contentType: detectContentType(p.content, [], []),
        status: 'published',
        hashtags: [],
        mediaUrls: [],
        scheduledAt: null,
        likes, comments, shares, impressions, reach,
        engRate: impressions > 0 ? Number(((interactions / impressions) * 100).toFixed(2)) : 0,
      }
    })

    return { posts, durationMs: Date.now() - t0, fromCache: false }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'PostFast fetch failed'
    return { posts: [], error: message, durationMs: Date.now() - t0 }
  }
}

// ── Fetch published internal posts (have been posted to a platform) ──────────
// Only includes posts with a real platformPostId — no drafts, pending, or scheduled.
async function fetchInternalDrafts(
  brandId: string,
  from: Date,
  to: Date,
  platformFilter: string
): Promise<AnalyticsPost[]> {
  const published = await prisma.contentDraft.findMany({
    where: {
      brandId,
      // Must have a platform post ID confirming it was actually published
      platformPostId: { not: null },
      status: 'published',
      OR: [
        { createdAt: { gte: from, lte: to } },
        { scheduledAt: { gte: from, lte: to } },
      ],
      ...(platformFilter !== 'all'
        ? { account: { platformId: { equals: platformFilter, mode: 'insensitive' } } }
        : {}),
    },
    include: { account: { select: { platformId: true, handle: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  return published.map((d: any) => ({
    id: d.id,
    source: 'internal',
    platform: d.account?.platformId ?? 'unknown',
    handle: d.account?.handle ?? '',
    caption: d.caption,
    postUrl: d.platformPostId ?? null,
    publishedAt: (d.scheduledAt ?? d.createdAt).toISOString(),
    contentType: detectContentType(d.caption, d.mediaUrls ?? [], d.hashtags ?? []),
    status: 'published',
    hashtags: d.hashtags ?? [],
    mediaUrls: d.mediaUrls ?? [],
    scheduledAt: d.scheduledAt?.toISOString() ?? null,
    likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0, engRate: 0,
  }))
}

// ── Fetch real Google reviews (GBP OAuth first, Places fallback) ─────────────
interface NormalizedReview {
  reviewerName: string
  rating: number        // 1–5
  text: string
  createTime: string    // ISO string
  replyText?: string
  source: 'gbp' | 'places' | 'db'
}

const STAR_RATING_MAP: Record<string, number> = {
  FIVE: 5, FOUR: 4, THREE: 3, TWO: 2, ONE: 1,
}

async function fetchRealGoogleReviews(brand: {
  googleRefreshToken?: string | null
  googleAccountId?: string | null
  googleLocationId?: string | null
  googlePlaceId?: string | null
  googleApiKey?: string | null
}): Promise<{ reviews: NormalizedReview[]; overallRating: number | null; durationMs: number; error?: string }> {
  const t0 = Date.now()

  // ① Try GBP OAuth (richer, includes all reviews)
  if (brand.googleRefreshToken && brand.googleAccountId && brand.googleLocationId) {
    try {
      const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
      const result = await fetchGoogleGBPReviews(brand.googleAccountId, brand.googleLocationId, accessToken)
      if (!result.error && result.reviews && result.reviews.length > 0) {
        const reviews: NormalizedReview[] = asArray<JsonObject>(result.reviews).map((r: any) => ({
          reviewerName:
            typeof r.reviewer === 'string'
              ? r.reviewer
              : ((r.reviewer as { displayName?: string } | null | undefined)?.displayName ?? '匿名顾客'),
          rating:
            typeof r.rating === 'number'
              ? r.rating
              : (STAR_RATING_MAP[String(r.rating ?? '')] ?? STAR_RATING_MAP[String(r.starRating ?? '')] ?? 3),
          text: typeof r.comment === 'string' ? r.comment : '',
          createTime: typeof r.createTime === 'string' ? r.createTime : new Date().toISOString(),
          replyText: typeof r.replyText === 'string' ? r.replyText : undefined,
          source: 'gbp' as const,
        }))
        return { reviews, overallRating: null, durationMs: Date.now() - t0 }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'GBP reviews fetch failed'
      console.error('[SocialInsight] GBP reviews error:', message)
    }
  }

  // ② Fallback to Places API (up to 5 reviews)
  if (brand.googlePlaceId && brand.googleApiKey) {
    try {
      const result = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)
      if (!result.error && result.reviews && result.reviews.length > 0) {
        const reviews: NormalizedReview[] = asArray<JsonObject>(result.reviews).map((r: any) => ({
          reviewerName:
            typeof r.reviewer === 'string'
              ? r.reviewer
              : ((r.reviewer as { displayName?: string } | null | undefined)?.displayName ?? '匿名顾客'),
          rating:
            typeof r.rating === 'number'
              ? r.rating
              : (STAR_RATING_MAP[String(r.rating ?? '')] ?? 3),
          text: typeof r.comment === 'string' ? r.comment : (typeof r.text === 'string' ? r.text : ''),
          createTime: typeof r.createTime === 'string'
            ? r.createTime
            : (typeof r.time === 'number' ? new Date(r.time * 1000).toISOString() : new Date().toISOString()),
          source: 'places' as const,
        }))
        return { reviews, overallRating: null, durationMs: Date.now() - t0 }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Places reviews fetch failed'
      console.error('[SocialInsight] Places reviews error:', message)
    }
  }

  return { reviews: [], overallRating: null, durationMs: Date.now() - t0 }
}

// ── Main GET handler ─────────────────────────────────────────────────────────
export async function GET(req: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(req)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { id } = await params

  let userId: string
  let userType: string
  let userRole: string

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type ?? 'HUMAN'
    userRole = session.user.role
  } else {
    userId = authenticatedAgent!.id
    userType = 'AI_AGENT'
    userRole = 'USER'
  }

  const ok = await canSessionAccessBrandProject(id, userId, userType, userRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')
  const platformFilter = url.searchParams.get('platform') || 'all'

  const brand = await prisma.brand.findFirst({
    where: { id },
    select: {
      id: true, name: true, location: true,
      timezone: true,
      postfastApiKey: true,
      postfastSnapshot: true,
      postfastSyncedAt: true,
      googlePlaceId: true, googleApiKey: true,
      googleRefreshToken: true, googleAccountId: true, googleLocationId: true,
      subscriptions: {
        where: {
          status: 'ACTIVE',
          OR: [
            { contractEndDate: null },
            { contractEndDate: { gt: new Date() } }
          ]
        },
        take: 1
      }
    },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!brand.subscriptions || brand.subscriptions.length === 0) {
    return NextResponse.json({ error: '此品牌的订阅服务已到期或未激活，请前往“服务协议与订阅”进行激活后重试。' }, { status: 402 })
  }

  let range: ReturnType<typeof parseSocialInsightRange>
  try {
    range = parseSocialInsightRange(fromParam, toParam, brand.timezone)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid date range' }, { status: 400 })
  }
  const { from, to, previousFrom, previousTo, days: rangeDays } = range

  const dateRangeLabel = `${range.fromDate} → ${range.toDate} (${range.timeZone})`

  // ── Parallel data fetch ──────────────────────────────────────────────────
  const [
    pfResult,
    internalDrafts,
    googleResult,
    prevConversions,
    sentimentAlerts,
    accounts,
    conversions,
    latestApifyLog,
  ] = await Promise.all([
    brand.postfastApiKey
      ? fetchPostfastPosts(
          brand.postfastApiKey,
          from,
          to,
          (brand.postfastSnapshot as any)?.analyticsPosts ?? null,
          (brand.postfastSnapshot as any)?.analyticsUpdatedAt ?? null
        )
      : Promise.resolve({ posts: [] as AnalyticsPost[], error: 'no API key configured' as string, durationMs: 0 }),
    fetchInternalDrafts(id, from, to, platformFilter),
    fetchRealGoogleReviews(brand),
    prisma.conversionEvent.findMany({
      where: { brandId: id, occurredAt: { gte: previousFrom, lte: previousTo } },
      select: { id: true, type: true, occurredAt: true, source: true, metadata: true },
    }),
    prisma.actionItem.findMany({
      where: {
        brandId: id,
        type: { in: ['sentiment_alert', 'apify_review'] },
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        title: true,
        description: true,
        payload: true,
        createdAt: true,
        status: true,
        type: true,
        account: { select: { handle: true, displayName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.socialAccount.findMany({
      where: { brandId: id },
      select: {
        id: true, platformId: true, handle: true, displayName: true,
        followerCount: true, followerDelta: true, ratingScore: true,
        snapshotAt: true, autoPilot: true,
      },
    }),
    prisma.conversionEvent.findMany({
      where: { brandId: id, occurredAt: { gte: from, lte: to } },
      select: { id: true, type: true, occurredAt: true, source: true, metadata: true },
      orderBy: { occurredAt: 'asc' },
    }),
    // Latest Apify sync result (cached in AuditLog)
    prisma.auditLog.findFirst({
      where: { resourceId: id, resourceType: 'ApifySync' },
      orderBy: { timestamp: 'desc' },
      select: { id: true, timestamp: true, metadata: true, action: true },
    }),
  ])

  const apifyMeta = (latestApifyLog?.metadata ?? {}) as Record<string, unknown>
  const apifySyncedAt: string | null = latestApifyLog?.timestamp?.toISOString() ?? null
  const apifyInstagramPosts = asArray<ApifyCachedPost>(apifyMeta.instagramPosts)
  const apifyTiktokPosts = asArray<ApifyCachedPost>(apifyMeta.tiktokPosts)
  const apifyXiaohongshuPosts = asArray<ApifyCachedPost>(apifyMeta.xiaohongshuPosts)
  const apifyFacebookPosts = asArray<ApifyCachedPost>(apifyMeta.facebookPosts)
  const apifyGoogleReviews = asArray<ApifyCachedReview>(apifyMeta.googleReviews)
  const capturedAt = new Date()

  const analyticsHistoryInputs = (items: AnalyticsPost[]): SocialHistoryPostInput[] => items.map((post) => ({
    source: post.source,
    externalId: post.id.replace(/^pf_/, ''),
    platform: post.platform,
    handle: post.handle,
    caption: post.caption,
    postUrl: post.postUrl,
    publishedAt: post.publishedAt,
    contentType: post.contentType,
    status: post.status,
    mediaUrls: post.mediaUrls,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    impressions: post.impressions,
    reach: post.reach,
  }))
  const dbReviewHistoryInputs: SocialHistoryReviewInput[] = sentimentAlerts.map((item: any) => {
    const payload = item.payload && typeof item.payload === 'object' ? item.payload as Record<string, unknown> : {}
    return {
      source: String(payload.source ?? 'database'),
      externalId: item.id,
      platform: String(payload.platform ?? 'google'),
      reviewerName: typeof payload.reviewerName === 'string' ? payload.reviewerName : null,
      rating: payload.rating,
      text: typeof payload.reviewText === 'string' ? payload.reviewText : item.description,
      replyText: typeof payload.replyText === 'string' ? payload.replyText : null,
      reviewUrl: typeof payload.reviewUrl === 'string' ? payload.reviewUrl : null,
      publishedAt: typeof payload.publishedAt === 'string' ? payload.publishedAt : item.createdAt,
      raw: { actionItemId: item.id },
    }
  })
  const googleHistoryInputs: SocialHistoryReviewInput[] = googleResult.reviews.map((review) => ({
    source: review.source,
    platform: 'google',
    reviewerName: review.reviewerName,
    rating: review.rating,
    text: review.text,
    replyText: review.replyText,
    publishedAt: review.createTime,
    raw: { ...review, placeId: brand.googlePlaceId },
  }))
  const profileMetrics = [
    ...asArray<Record<string, unknown>>(apifyMeta.instagramProfiles),
    ...asArray<Record<string, unknown>>(apifyMeta.tiktokProfiles),
    ...asArray<Record<string, unknown>>(apifyMeta.facebookProfiles),
  ].map((profile) => ({
    platform: String(profile.platform ?? 'unknown'),
    handle: String(profile.handle ?? ''),
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    postCount: profile.postCount,
    ratingScore: profile.ratingScore,
    raw: profile,
  }))

  await Promise.all([
    persistSocialPosts(id, [
      ...analyticsHistoryInputs(pfResult.posts),
      ...analyticsHistoryInputs(internalDrafts),
      ...apifyPostHistoryInputs([
        ...apifyInstagramPosts,
        ...apifyTiktokPosts,
        ...apifyXiaohongshuPosts,
        ...apifyFacebookPosts,
      ] as unknown as Record<string, unknown>[]),
    ], capturedAt),
    persistSocialReviews(id, [
      ...dbReviewHistoryInputs,
      ...googleHistoryInputs,
      ...reviewHistoryInputs(apifyGoogleReviews as unknown as Record<string, unknown>[], 'apify'),
    ], capturedAt),
    persistSocialAccountMetrics(id, [
      ...accounts.map((account: any) => ({
        platform: account.platformId,
        handle: account.handle,
        followerCount: account.followerCount,
        ratingScore: account.ratingScore,
        raw: { source: 'social_account' },
      })),
      ...profileMetrics,
    ], capturedAt),
  ])

  const [persistedPosts, previousPosts, persistedReviews, accountMetricHistory, availability] = await Promise.all([
    loadPersistedPosts(id, from, to, platformFilter),
    loadPersistedPosts(id, previousFrom, previousTo, platformFilter),
    loadPersistedReviews(id, from, to),
    loadAccountMetricHistory(id, from, to),
    socialHistoryAvailability(id),
  ])
  const normalizedReviews = persistedReviews as Array<{
    id: string
    source: string
    platform: string
    reviewerName: string | null
    rating: number
    text: string
    replyText: string | null
    publishedAt: Date
  }>

  // Log data fetch operations (fire & forget)
  writeAuditLog({
    actor: { type: 'SYSTEM', name: 'SocialInsight API' },
    action: 'DATA_FETCH',
    resourceId: id,
    resourceType: 'SocialDataFetch',
    reason: brand.postfastApiKey
      ? `PostFast: ${pfResult.posts.length} 条帖子 (${dateRangeLabel})`
      : 'PostFast: 未配置 API Key',
    metadata: {
      source: 'postfast',
      configured: !!brand.postfastApiKey,
      success: !pfResult.error,
      postCount: pfResult.posts.length,
      error: pfResult.error ?? null,
      durationMs: pfResult.durationMs,
      dateRange: dateRangeLabel,
    },
  })

  writeAuditLog({
    actor: { type: 'SYSTEM', name: 'SocialInsight API' },
    action: 'DATA_FETCH',
    resourceId: id,
    resourceType: 'SocialDataFetch',
    reason: googleResult.reviews.length > 0
      ? `Google 评论: ${googleResult.reviews.length} 条`
      : '未配置 Google 评论数据源（需 GBP OAuth 或 Place ID）',
    metadata: {
      source: 'google_reviews',
      configured: !!(brand.googleRefreshToken || brand.googlePlaceId),
      reviewCount: googleResult.reviews.length,
      durationMs: googleResult.durationMs,
      error: googleResult.error ?? null,
    },
  })

  writeAuditLog({
    actor: { type: 'SYSTEM', name: 'SocialInsight API' },
    action: 'DATA_FETCH',
    resourceId: id,
    resourceType: 'SocialDataFetch',
    reason: `数据库: ${accounts.length} 个账户, ${conversions.length} 条转化, ${sentimentAlerts.length} 条评论预警`,
    metadata: {
      source: 'database',
      accounts: accounts.length,
      conversions: conversions.length,
      sentimentAlerts: sentimentAlerts.length,
      internalDrafts: internalDrafts.length,
      dateRange: dateRangeLabel,
    },
  })

  // ── Build posts dataset ──────────────────────────────────────────────────
  const posts: AnalyticsPost[] = dedupeAnalyticsPosts(persistedPosts as AnalyticsPost[])
  const hasPostfastData = posts.some((post) => post.source === 'postfast')
  const hasApifyData = posts.some((post) => !['postfast', 'internal'].includes(post.source)) || normalizedReviews.some((review) => review.source === 'apify')

  // ── KPI aggregates ───────────────────────────────────────────────────────
  // Only count posts that were actually published (have real engagement data or status=published)
  const publishedOnly   = posts.filter(p => p.status === 'published')
  const totalPosts      = publishedOnly.length
  // Engagement KPIs computed over all posts (PostFast/Apify have real metrics)
  const totalEngagement = posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0)
  const totalImpressions= posts.reduce((s, p) => s + p.impressions, 0)
  const totalLikes      = posts.reduce((s, p) => s + p.likes, 0)
  const avgReach        = posts.length > 0 ? Math.round(posts.reduce((s, p) => s + p.reach, 0) / posts.length) : 0
  const avgEngRate      = totalImpressions > 0 ? Number(((totalEngagement / totalImpressions) * 100).toFixed(2)) : 0

  // ── Time-series (daily) ──────────────────────────────────────────────────
  const platformIds = Array.from(new Set(posts.map(p => p.platform.toLowerCase())))

  function createEmptyDay(dateStr: string) {
    const item: any = { date: dateStr, postCount: 0, engagement: 0, impressions: 0, reach: 0, likes: 0, engRate: 0 }
    for (const pf of platformIds) {
      item[`${pf}_postCount`] = 0
      item[`${pf}_engagement`] = 0
      item[`${pf}_impressions`] = 0
      item[`${pf}_reach`] = 0
      item[`${pf}_likes`] = 0
      item[`${pf}_engRate`] = 0
    }
    return item
  }

  const dayMap = new Map<string, any>()
  for (const p of posts) {
    const key = dateOnlyInTimeZone(new Date(p.publishedAt), range.timeZone)
    const platform = p.platform.toLowerCase()
    const interactions = p.likes + p.comments + p.shares
    if (!dayMap.has(key)) {
      dayMap.set(key, createEmptyDay(key))
    }
    const e = dayMap.get(key)!
    e.postCount++
    e.engagement += interactions
    e.impressions += p.impressions
    e.reach += p.reach
    e.likes += p.likes

    e[`${platform}_postCount`] = (e[`${platform}_postCount`] ?? 0) + 1
    e[`${platform}_engagement`] = (e[`${platform}_engagement`] ?? 0) + interactions
    e[`${platform}_impressions`] = (e[`${platform}_impressions`] ?? 0) + p.impressions
    e[`${platform}_reach`] = (e[`${platform}_reach`] ?? 0) + p.reach
    e[`${platform}_likes`] = (e[`${platform}_likes`] ?? 0) + p.likes
  }

  // Fill gaps
  for (let dayOffset = 0; dayOffset < range.days; dayOffset++) {
    const key = shiftDateOnly(range.fromDate, dayOffset)
    if (!dayMap.has(key)) dayMap.set(key, createEmptyDay(key))
  }

  const timeSeries = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d: any) => {
      d.engRate = d.impressions > 0 ? Number(((d.engagement / d.impressions) * 100).toFixed(2)) : 0
      for (const pf of platformIds) {
        const pfImpr = d[`${pf}_impressions`] ?? 0
        const pfEng = d[`${pf}_engagement`] ?? 0
        d[`${pf}_engRate`] = pfImpr > 0 ? Number(((pfEng / pfImpr) * 100).toFixed(2)) : 0
      }
      return d
    })

  // Compare with the immediately preceding period of equal length.
  const previousAnalyticsPosts = previousPosts as AnalyticsPost[]
  const previousEngagement = previousAnalyticsPosts.reduce((sum, post) => sum + post.likes + post.comments + post.shares, 0)
  const previousImpressions = previousAnalyticsPosts.reduce((sum, post) => sum + post.impressions, 0)
  const previousLikes = previousAnalyticsPosts.reduce((sum, post) => sum + post.likes, 0)
  const previousReach = previousAnalyticsPosts.length > 0
    ? Math.round(previousAnalyticsPosts.reduce((sum, post) => sum + post.reach, 0) / previousAnalyticsPosts.length)
    : 0
  const previousEngRate = previousImpressions > 0 ? (previousEngagement / previousImpressions) * 100 : 0
  const periodTrend = (current: number, previous: number): number | null => {
    if (previous === 0) return current > 0 ? 100 : null
    return Number((((current - previous) / previous) * 100).toFixed(1))
  }
  const kpiTrends = {
    engagement: periodTrend(totalEngagement, previousEngagement),
    impressions: periodTrend(totalImpressions, previousImpressions),
    reach: periodTrend(avgReach, previousReach),
    likes: periodTrend(totalLikes, previousLikes),
    engRate: periodTrend(avgEngRate, previousEngRate),
    postCount: periodTrend(totalPosts, previousAnalyticsPosts.length),
  }

  // ── Top Posts ────────────────────────────────────────────────────────────
  const topPosts = [...posts]
    .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares) || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 15)

  // ── Content Type Breakdown ───────────────────────────────────────────────
  const ctMap: Record<string, { count: number; engagement: number; impressions: number }> = {}
  for (const p of posts) {
    if (!ctMap[p.contentType]) ctMap[p.contentType] = { count: 0, engagement: 0, impressions: 0 }
    ctMap[p.contentType].count++
    ctMap[p.contentType].engagement += p.likes + p.comments + p.shares
    ctMap[p.contentType].impressions += p.impressions
  }
  const contentTypeBreakdown = Object.entries(ctMap).map((entry: any) => {
    const [type, s] = entry;
    return {
      type, count: s.count, engagement: s.engagement, impressions: s.impressions,
      avgEngRate: s.impressions > 0 ? Number(((s.engagement / s.impressions) * 100).toFixed(2)) : 0,
    }
  }).sort((a: any, b: any) => b.count - a.count)

  // ── Brand Stats (real, for competitor tab) ───────────────────────────────
  const publishedPosts = posts.filter((p: any) => p.status === 'published')
  const postsPerWeek   = rangeDays > 0 ? Math.round((publishedPosts.length / rangeDays) * 7 * 10) / 10 : 0
  const accountsForRange = accounts.map((account: any) => {
    const key = `${String(account.platformId).toLowerCase()}:${String(account.handle).toLowerCase()}`
    const atEnd = accountMetricHistory.atEnd.get(key)
    const beforeStart = accountMetricHistory.beforeStart.get(key)
    const followerCount = atEnd?.followerCount ?? null
    const followerDelta = followerCount !== null && beforeStart?.followerCount !== null && beforeStart?.followerCount !== undefined
      ? followerCount - beforeStart.followerCount
      : null
    return {
      ...account,
      followerCount,
      followerDelta,
      ratingScore: atEnd?.ratingScore ?? account.ratingScore,
      snapshotAt: atEnd?.capturedAt ?? null,
    }
  })
  const brandStats = {
    postsPerWeek,
    avgEngRate,
    followersInstagram: accountsForRange.find((a: any) => a.platformId === 'instagram')?.followerCount ?? null,
    followersTotal: accountsForRange.reduce((sum: number, account: any) => sum + (account.followerCount ?? 0), 0),
  }

  // ── Conversion events ────────────────────────────────────────────────────
  const totalConversions    = conversions.length
  const navClickCount       = conversions.filter((c: any) => c.type === 'nav_click').length
  const bookingClickCount   = conversions.filter((c: any) => c.type === 'booking_click').length
  const couponRedeemCount   = conversions.filter((c: any) => c.type === 'coupon_redemption').length

  // Previous period conversion aggregates (for real deltas)
  const prevConvTotal       = prevConversions.length
  const prevNavClick        = prevConversions.filter((c: any) => c.type === 'nav_click').length
  const prevBookingClick    = prevConversions.filter((c: any) => c.type === 'booking_click').length
  const prevCouponRedeem    = prevConversions.filter((c: any) => c.type === 'coupon_redemption').length

  const convDayMap = new Map<string, { date: string; nav_click: number; booking_click: number; coupon_redemption: number; total: number }>()
  conversions.forEach((c: any) => {
    const key = dateOnlyInTimeZone(c.occurredAt, range.timeZone)
    if (!convDayMap.has(key)) convDayMap.set(key, { date: key, nav_click: 0, booking_click: 0, coupon_redemption: 0, total: 0 })
    const day = convDayMap.get(key)!
    day.total++
    if (c.type === 'nav_click') day.nav_click++
    else if (c.type === 'booking_click') day.booking_click++
    else if (c.type === 'coupon_redemption') day.coupon_redemption++
  })

  for (let dayOffset = 0; dayOffset < range.days; dayOffset++) {
    const key = shiftDateOnly(range.fromDate, dayOffset)
    if (!convDayMap.has(key)) convDayMap.set(key, { date: key, nav_click: 0, booking_click: 0, coupon_redemption: 0, total: 0 })
  }
  const conversionTimeSeries = Array.from(convDayMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // ── Sentiment — normalized reviews strictly inside the selected range ────
  const allRatings = normalizedReviews.map((review) => review.rating).filter((rating) => rating >= 1 && rating <= 5)

  // Compute sentiment percentages from real data
  let positivePct: number, neutralPct: number, negativePct: number, ratingOutOfFive: number | null

  if (allRatings.length >= 3) {
    const pos = allRatings.filter(r => r >= 4).length
    const neu = allRatings.filter(r => r === 3).length
    const total = allRatings.length
    positivePct = Math.round((pos / total) * 100)
    neutralPct  = Math.round((neu / total) * 100)
    negativePct = 100 - positivePct - neutralPct
    ratingOutOfFive = Number((allRatings.reduce((s, r) => s + r, 0) / total).toFixed(1))
  } else {
    // No real review data — return nulls, do NOT fabricate percentages
    const dbRating = accountsForRange.find((a: any) => a.platformId === 'google')?.ratingScore ?? null
    ratingOutOfFive = dbRating
    positivePct = 0; neutralPct = 0; negativePct = 0
  }

  // ── Real keyword extraction from all review texts ────────────────────────
  const reviewTexts = normalizedReviews.map((review) => review.text).filter(Boolean)
  const realKeywords = extractKeywordsFromTexts(reviewTexts)

  // ── Build normalized review feed ─────────────────────────────────────────
  const googleAccount = accountsForRange.find((a: any) => ['google', 'google_maps', 'gbp', 'gmb', 'google_business_profile'].includes(a.platformId.toLowerCase()))
  const googleAccountHandle = googleAccount ? (googleAccount.displayName || googleAccount.handle) : null
  const reviewFeed = normalizedReviews.slice(0, 50).map((review) => ({
    id: review.id,
    platform: review.platform,
    reviewerName: review.reviewerName ?? '匿名顾客',
    rating: review.rating,
    text: review.text,
    replyStatus: review.replyText ? 'replied' : 'pending',
    replyText: review.replyText ?? undefined,
    createdAt: review.publishedAt.toISOString(),
    source: review.source,
    accountHandle: googleAccountHandle,
  }))

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    range: {
      from: range.fromDate,
      to: range.toDate,
      days: range.days,
      timezone: range.timeZone,
      previousFrom: previousFrom.toISOString(),
      previousTo: previousTo.toISOString(),
      availableFrom: availability.availableFrom ? dateOnlyInTimeZone(availability.availableFrom, range.timeZone) : null,
      availableTo: availability.availableTo ? dateOnlyInTimeZone(availability.availableTo, range.timeZone) : null,
    },
    dataCompleteness: {
      normalizedHistory: true,
      historicalMetricsUseAsOfSnapshots: true,
      earliestRecoverableDate: availability.availableFrom?.toISOString() ?? null,
      note: availability.availableFrom && from < availability.availableFrom
        ? 'Selected range begins before the earliest recoverable stored record.'
        : null,
    },
    kpis: { totalPosts, totalEngagement, totalImpressions, avgReach, totalLikes, avgEngRate },
    kpiTrends,
    timeSeries,
    topPosts,
    contentTypeBreakdown,
    accounts: accountsForRange,
    conversions: {
      total: totalConversions,
      nav_click: navClickCount,
      booking_click: bookingClickCount,
      coupon_redemption: couponRedeemCount,
      timeSeries: conversionTimeSeries,
    },
    previousConversions: {
      total: prevConvTotal,
      nav_click: prevNavClick,
      booking_click: prevBookingClick,
      coupon_redemption: prevCouponRedeem,
    },
    sentiment: {
      averageRating: ratingOutOfFive,
      totalReviewsAnalyzed: allRatings.length,
      googleReviewsCount: normalizedReviews.filter((review) => review.platform.includes('google')).length,
      positivePct,
      neutralPct,
      negativePct,
      keywords: realKeywords,
      reviews: reviewFeed,
      sentimentFromRealData: allRatings.length >= 3,
      keywordsFromRealData: realKeywords.length >= 3,
    },
    brandStats,
    competitors: [],               // No synthetic competitor data
    competitorDataAvailable: false,
    hasPostfastData,
    postfastError: pfResult.error ?? null,
    hasGoogleData: normalizedReviews.some((review) => review.platform.includes('google')),
    apifySync: {
      hasSyncData: hasApifyData,
      syncedAt: apifySyncedAt,
      googleReviewCount: apifyGoogleReviews.length,
      instagramPostCount: apifyInstagramPosts.length,
      tiktokPostCount: apifyTiktokPosts.length,
      xiaohongshuPostCount: apifyXiaohongshuPosts.length,
    },
  })
}
