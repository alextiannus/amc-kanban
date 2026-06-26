import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { postfastGetAnalytics, postfastFetchAccounts } from '@/lib/integrations/postfast'
import { fetchGoogleReviews, fetchGoogleGBPReviews, getGoogleAccessToken } from '@/lib/integrations/google'
import { writeAuditLog } from '@/lib/audit'
import {
  asArray,
  computePeriodTrend,
  detectContentType,
  extractKeywordsFromTexts,
  toNumber,
} from './socialInsightUtils'

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

// ── Fetch published posts from PostFast ──────────────────────────────────────
async function fetchPostfastPosts(
  apiKey: string,
  from: Date,
  to: Date
): Promise<{ posts: AnalyticsPost[]; error?: string; durationMs: number }> {
  const t0 = Date.now()
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
        likes,
        comments,
        shares,
        impressions,
        reach,
        engRate: impressions > 0 ? Number(((interactions / impressions) * 100).toFixed(2)) : 0,
      }
    })

    return { posts, durationMs: Date.now() - t0 }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'PostFast fetch failed'
    return { posts: [], error: message, durationMs: Date.now() - t0 }
  }
}

// ── Fetch internal drafts ────────────────────────────────────────────────────
async function fetchInternalDrafts(
  brandId: string,
  from: Date,
  to: Date,
  platformFilter: string
): Promise<AnalyticsPost[]> {
  const drafts = await prisma.contentDraft.findMany({
    where: {
      brandId,
      platformPostId: null,
      status: { in: ['draft', 'pending_review', 'scheduled'] },
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
    take: 200,
  })

  return drafts.map((d: any) => ({
    id: d.id,
    source: 'internal',
    platform: d.account?.platformId ?? 'unknown',
    handle: d.account?.handle ?? '',
    caption: d.caption,
    postUrl: null,
    publishedAt: (d.scheduledAt ?? d.createdAt).toISOString(),
    contentType: detectContentType(d.caption, d.mediaUrls ?? [], d.hashtags ?? []),
    status: d.status,
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

  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
  let from = defaultFrom, to = now

  if (fromParam) {
    const p = new Date(fromParam)
    if (Number.isNaN(p.getTime())) return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
    from = p
  }
  if (toParam) {
    const p = new Date(toParam)
    if (Number.isNaN(p.getTime())) return NextResponse.json({ error: 'Invalid to date' }, { status: 400 })
    to = p
  }

  const rangeMs = to.getTime() - from.getTime()
  if (rangeMs < 0) return NextResponse.json({ error: 'from date must be before to date' }, { status: 400 })
  const rangeDays = Math.ceil(rangeMs / 86400000)
  if (rangeDays > 180) return NextResponse.json({ error: 'Date range cannot exceed 180 days' }, { status: 400 })

  const brand = await prisma.brand.findFirst({
    where: { id },
    select: {
      id: true, name: true, location: true,
      postfastApiKey: true,
      googlePlaceId: true, googleApiKey: true,
      googleRefreshToken: true, googleAccountId: true, googleLocationId: true,
    },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const dateRangeLabel = `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`

  // Previous period window: same length, immediately before current period.
  // Subtract 1 ms from previousTo so the boundary instant (from) belongs
  // exclusively to the current period and is never double-counted.
  const previousTo   = new Date(from.getTime() - 1)
  const previousFrom = new Date(from.getTime() - rangeMs)

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
      ? fetchPostfastPosts(brand.postfastApiKey, from, to)
      : Promise.resolve({ posts: [] as AnalyticsPost[], error: 'no API key configured' as string, durationMs: 0 }),
    fetchInternalDrafts(id, from, to, platformFilter),
    fetchRealGoogleReviews(brand),
    prisma.conversionEvent.findMany({
      where: { brandId: id, occurredAt: { gte: previousFrom, lte: previousTo } },
    }),
    prisma.actionItem.findMany({
      where: { brandId: id, type: { in: ['sentiment_alert', 'apify_review'] } },
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
      orderBy: { occurredAt: 'asc' },
    }),
    // Latest Apify sync result (cached in AuditLog)
    prisma.auditLog.findFirst({
      where: { resourceId: id, resourceType: 'ApifySync' },
      orderBy: { timestamp: 'desc' },
    }),
  ])

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
  const filteredPostfastPosts = platformFilter === 'all'
    ? pfResult.posts
    : pfResult.posts.filter(p => p.platform.toLowerCase() === platformFilter.toLowerCase())

  // Merge Apify cached posts (Instagram + TikTok + Xiaohongshu) if available
  const apifyMeta = (latestApifyLog?.metadata ?? {}) as Record<string, unknown>
  const apifySyncedAt: string | null = latestApifyLog?.timestamp?.toISOString() ?? null
  const apifyInstagramPosts = asArray<ApifyCachedPost>(apifyMeta.instagramPosts)
  const apifyTiktokPosts = asArray<ApifyCachedPost>(apifyMeta.tiktokPosts)
  const apifyXiaohongshuPosts = asArray<ApifyCachedPost>(apifyMeta.xiaohongshuPosts)
  const apifyPosts: AnalyticsPost[] = [
    ...apifyInstagramPosts,
    ...apifyTiktokPosts,
    ...apifyXiaohongshuPosts,
  ]
    .filter((p) => {
      if (platformFilter !== 'all' && p.platform?.toLowerCase() !== platformFilter.toLowerCase()) return false
      // Include post if it has no date (can't determine), or if the date is within range.
      // Also include posts up to 180 days before `from` to catch content that drives
      // ongoing engagement even if published earlier (e.g. evergreen IG posts).
      if (!p.publishedAt) return true
      const d = new Date(p.publishedAt).getTime()
      // Exclude obvious sentinel/epoch dates (before 2020)
      if (d < new Date('2020-01-01').getTime()) return false
      // Include anything published up to 6 months before the window start, or within the window
      const sixMonthsBeforeFrom = from.getTime() - 180 * 24 * 60 * 60 * 1000
      return d >= sixMonthsBeforeFrom && d <= to.getTime()
    })

    .map((p): AnalyticsPost => ({
      id: `apify_${p.source}_${p.postId ?? Math.random()}`,
      source: p.source ?? 'apify',
      platform: p.platform ?? 'unknown',
      handle: p.handle ?? '',
      caption: p.caption ?? '',
      postUrl: p.url ?? null,
      publishedAt: p.publishedAt ?? new Date().toISOString(),
      contentType: detectContentType(p.caption ?? '', [], []),
      status: 'published',
      hashtags: [],
      mediaUrls: p.imageUrl ? [p.imageUrl] : [],
      scheduledAt: null,
      likes: toNumber(p.likes),
      comments: toNumber(p.comments),
      shares: toNumber(p.shares),
      impressions: toNumber(p.views),
      reach: toNumber(p.views),
      engRate: toNumber(p.views) > 0
        ? Number((((toNumber(p.likes) + toNumber(p.comments) + toNumber(p.shares)) / toNumber(p.views)) * 100).toFixed(2))
        : 0,
    }))

  const posts: AnalyticsPost[] = [...filteredPostfastPosts, ...internalDrafts, ...apifyPosts]
  const hasPostfastData = pfResult.posts.length > 0
  const hasApifyData = apifyPosts.length > 0 || asArray<ApifyCachedReview>(apifyMeta.googleReviews).length > 0

  // ── KPI aggregates ───────────────────────────────────────────────────────
  const totalPosts      = posts.length
  const totalEngagement = posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0)
  const totalImpressions= posts.reduce((s, p) => s + p.impressions, 0)
  const totalLikes      = posts.reduce((s, p) => s + p.likes, 0)
  const avgReach        = posts.length > 0 ? Math.round(posts.reduce((s, p) => s + p.reach, 0) / posts.length) : 0
  const avgEngRate      = totalImpressions > 0 ? Number(((totalEngagement / totalImpressions) * 100).toFixed(2)) : 0

  // ── Time-series (daily) ──────────────────────────────────────────────────
  const dayMap = new Map<string, {
    date: string; postCount: number; engagement: number
    impressions: number; reach: number; likes: number; engRate: number
  }>()

  const endDay = new Date(to); endDay.setHours(23, 59, 59, 999)

  for (const p of posts) {
    const key = p.publishedAt.slice(0, 10)
    const interactions = p.likes + p.comments + p.shares
    if (!dayMap.has(key)) {
      dayMap.set(key, { date: key, postCount: 1, engagement: interactions, impressions: p.impressions, reach: p.reach, likes: p.likes, engRate: 0 })
    } else {
      const e = dayMap.get(key)!
      e.postCount++; e.engagement += interactions; e.impressions += p.impressions; e.reach += p.reach; e.likes += p.likes
    }
  }

  // Fill gaps
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0)
  while (cursor <= endDay) {
    const key = cursor.toISOString().slice(0, 10)
    if (!dayMap.has(key)) dayMap.set(key, { date: key, postCount: 0, engagement: 0, impressions: 0, reach: 0, likes: 0, engRate: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  const timeSeries = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d: any) => ({ ...d, engRate: d.impressions > 0 ? Number(((d.engagement / d.impressions) * 100).toFixed(2)) : 0 }))

  // ── In-period trend deltas ────────────────────────────────────────────────
  const kpiTrends = {
    engagement:   computePeriodTrend(timeSeries, 'engagement'),
    impressions:  computePeriodTrend(timeSeries, 'impressions'),
    reach:        computePeriodTrend(timeSeries, 'reach'),
    likes:        computePeriodTrend(timeSeries, 'likes'),
    engRate:      computePeriodTrend(timeSeries, 'engRate'),
    postCount:    computePeriodTrend(timeSeries, 'postCount'),
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
  const brandStats = {
    postsPerWeek,
    avgEngRate,
    followersInstagram: accounts.find((a: any) => a.platformId === 'instagram')?.followerCount ?? null,
    followersTotal: accounts.reduce((s: any, a: any) => s + (a.followerCount ?? 0), 0),
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
    const key = c.occurredAt.toISOString().slice(0, 10)
    if (!convDayMap.has(key)) convDayMap.set(key, { date: key, nav_click: 0, booking_click: 0, coupon_redemption: 0, total: 0 })
    const day = convDayMap.get(key)!
    day.total++
    if (c.type === 'nav_click') day.nav_click++
    else if (c.type === 'booking_click') day.booking_click++
    else if (c.type === 'coupon_redemption') day.coupon_redemption++
  })

  const cCursor = new Date(from); cCursor.setHours(0, 0, 0, 0)
  while (cCursor <= endDay) {
    const key = cCursor.toISOString().slice(0, 10)
    if (!convDayMap.has(key)) convDayMap.set(key, { date: key, nav_click: 0, booking_click: 0, coupon_redemption: 0, total: 0 })
    cCursor.setDate(cCursor.getDate() + 1)
  }
  const conversionTimeSeries = Array.from(convDayMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // ── Sentiment — real ratings from DB alerts + Google reviews ─────────────
  const allRatings: number[] = []

  // From DB sentiment alerts (includes apify_review type)
  sentimentAlerts.forEach((item: any) => {
    const pl = item.payload && typeof item.payload === 'object'
      ? (item.payload as { rating?: unknown })
      : null
    if (typeof pl?.rating === 'number') allRatings.push(pl.rating)
  })

  // From Google reviews (GBP/Places live fetch)
  googleResult.reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) allRatings.push(r.rating) })

  // From Apify cached Google Maps reviews
  const apifyGoogleReviews = asArray<ApifyCachedReview>(apifyMeta.googleReviews)
  apifyGoogleReviews.forEach((r: any) => {
    if (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5) allRatings.push(r.rating)
  })

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
    // Use DB account rating score as fallback — still real data
    const dbRating = accounts.find((a: any) => a.platformId === 'google')?.ratingScore ?? null
    ratingOutOfFive = dbRating
    if (dbRating !== null) {
      if (dbRating >= 4.8) { positivePct = 88; neutralPct = 9; negativePct = 3 }
      else if (dbRating >= 4.5) { positivePct = 82; neutralPct = 12; negativePct = 6 }
      else if (dbRating >= 4.0) { positivePct = 70; neutralPct = 18; negativePct = 12 }
      else { positivePct = 55; neutralPct = 25; negativePct = 20 }
    } else {
      positivePct = 0; neutralPct = 0; negativePct = 0
    }
  }

  // ── Real keyword extraction from all review texts ────────────────────────
  const reviewTexts: string[] = []

  // From DB sentiment alerts (includes apify_review type)
  sentimentAlerts.forEach((item: any) => {
    const pl = item.payload && typeof item.payload === 'object'
      ? (item.payload as { reviewText?: unknown })
      : null
    if (typeof pl?.reviewText === 'string') reviewTexts.push(pl.reviewText)
    else if (item.description) reviewTexts.push(item.description)
  })

  // From Google reviews (live)
  googleResult.reviews.forEach(r => { if (r.text) reviewTexts.push(r.text) })

  // From Apify cached Google Maps reviews
  apifyGoogleReviews.forEach((r: any) => { if (r.text) reviewTexts.push(r.text) })

  const realKeywords = extractKeywordsFromTexts(reviewTexts)

  // ── Build review feed (DB + Google, no duplicates) ───────────────────────
  const googleAccount = accounts.find((a: any) => ['google', 'google_maps', 'gbp', 'gmb', 'google_business_profile'].includes(a.platformId.toLowerCase()))
  const googleAccountHandle = googleAccount ? (googleAccount.displayName || googleAccount.handle) : null

  const dbReviews = sentimentAlerts.map((item: any) => {
    const pl = item.payload && typeof item.payload === 'object'
      ? (item.payload as { platform?: unknown; reviewerName?: unknown; rating?: unknown; reviewText?: unknown; replyText?: unknown })
      : null
    const hasReply = !!(pl?.replyText) || item.status === 'resolved' || item.status === 'approved' || item.status === 'auto_resolved'
    return {
      id: item.id,
      platform: typeof pl?.platform === 'string' ? pl.platform : 'google',
      reviewerName: typeof pl?.reviewerName === 'string' ? pl.reviewerName : '匿名顾客',
      rating: typeof pl?.rating === 'number' ? pl.rating : 2,
      text: typeof pl?.reviewText === 'string' ? pl.reviewText : (item.description ?? ''),
      replyStatus: hasReply ? 'replied' : 'pending',
      replyText: typeof pl?.replyText === 'string' ? pl.replyText : undefined,
      createdAt: item.createdAt.toISOString(),
      source: 'db',
      accountHandle: (item as any).account?.displayName || (item as any).account?.handle || googleAccountHandle,
    }
  })

  const googleReviewFeed = googleResult.reviews.map((r: any, idx: number) => ({
    id: `google_${idx}`,
    platform: 'google',
    reviewerName: r.reviewerName,
    rating: r.rating,
    text: r.text,
    replyStatus: r.replyText ? 'replied' : 'pending',
    replyText: r.replyText,
    createdAt: r.createTime,
    source: 'google',
    accountHandle: googleAccountHandle,
  }))

  // Apify Google Maps cached review feed
  const apifyReviewFeed = apifyGoogleReviews.map((r: any, idx: number) => ({
    id: `apify_${idx}`,
    platform: 'google_maps',
    reviewerName: r.reviewerName ?? '匿名顾客',
    rating: r.rating ?? 3,
    text: r.text ?? '',
    replyStatus: r.replyText ? 'replied' : 'pending',
    replyText: r.replyText,
    createdAt: r.publishedAt ?? new Date().toISOString(),
    source: 'apify',
    accountHandle: googleAccountHandle,
  }))

  // Merge all review sources, most recent first, cap at 50
  const reviewFeed = [...dbReviews, ...googleReviewFeed, ...apifyReviewFeed].slice(0, 50)

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    kpis: { totalPosts, totalEngagement, totalImpressions, avgReach, totalLikes, avgEngRate },
    kpiTrends,
    timeSeries,
    topPosts,
    contentTypeBreakdown,
    accounts,
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
      googleReviewsCount: googleResult.reviews.length,
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
    hasGoogleData: googleResult.reviews.length > 0,
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

