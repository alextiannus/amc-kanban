import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { postfastGetAnalytics, postfastFetchAccounts } from '@/lib/integrations/postfast'

type Params = { params: Promise<{ id: string }> }

export interface AnalyticsPost {
  id: string
  source: 'postfast' | 'internal' | string  // which channel/platform provided this
  platform: string
  handle: string
  caption: string
  postUrl: string | null
  publishedAt: string       // best available date
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

// ─────────────────────────────────────────────────────────────────────────────
// Channel Adapters — extensible for future platforms
// Each adapter returns a list of AnalyticsPost from its own API.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPostfastPosts(apiKey: string, from: Date, to: Date, brandId: string): Promise<{ posts: AnalyticsPost[]; error?: string }> {
  try {
    // Use the dedicated analytics endpoint — the only correct way to get engagement metrics.
    // Metrics are returned as strings (bigint) and must be parseInt'd.
    // Supports server-side date filtering via startDate/endDate.
    const [analyticsResult, accountsResult, dbDrafts] = await Promise.all([
      postfastGetAnalytics(apiKey, {
        startDate: from.toISOString(),
        endDate: to.toISOString(),
      }),
      postfastFetchAccounts(apiKey),
      prisma.contentDraft.findMany({
        where: {
          brandId,
          platformPostId: { not: null },
        },
        include: {
          assetRefs: {
            include: {
              asset: true,
            },
          },
        },
      }),
    ])

    if (!analyticsResult.success) {
      console.error('[Analytics] PostFast /social-posts/analytics failed:', analyticsResult.error)
      return { posts: [], error: analyticsResult.error }
    }

    console.log(`[Analytics] PostFast analytics returned ${analyticsResult.posts.length} published posts`)

    // Build a map of platformPostId -> { mediaUrls, hashtags } for enrichment
    const draftMap = new Map<string, { mediaUrls: string[]; hashtags: string[] }>()
    for (const d of dbDrafts) {
      if (d.platformPostId) {
        const assetUrls = d.assetRefs.map((ref: any) => ref.asset.url).filter((url: any): url is string => Boolean(url))
        draftMap.set(d.platformPostId, {
          mediaUrls: [...d.mediaUrls, ...assetUrls].filter(Boolean),
          hashtags: d.hashtags || [],
        })
      }
    }

    // Build a map of socialMediaId → platformId for label enrichment
    const accountMap = new Map(
      (accountsResult.accounts ?? []).map((a: any) => [a.id, a])
    )

    const posts: AnalyticsPost[] = analyticsResult.posts.map((p: any) => {
      const m = p.latestMetric
      const likes       = m ? parseInt(m.likes ?? '0', 10) : 0
      const comments    = m ? parseInt(m.comments ?? '0', 10) : 0
      const shares      = m ? parseInt(m.shares ?? '0', 10) : 0
      const impressions = m ? parseInt(m.impressions ?? '0', 10) : 0
      const reach       = m ? parseInt(m.reach ?? '0', 10) : 0
      const interactions = likes + comments + shares

      const account = accountMap.get(p.socialMediaId)
      const platform = account?.platformId ?? 'unknown'
      const handle   = account?.handle ?? account?.displayName ?? ''

      const dbMatch = p.platformPostId ? draftMap.get(p.platformPostId) : null
      const mediaUrls = dbMatch?.mediaUrls ?? []
      const hashtags = dbMatch?.hashtags ?? []

      return {
        id: `pf_${p.id}`,
        source: 'postfast',
        platform,
        handle,
        caption: p.content,
        postUrl: null,
        publishedAt: p.publishedAt,
        contentType: detectContentType(p.content, mediaUrls, hashtags),
        status: 'published',
        hashtags,
        mediaUrls,
        scheduledAt: null,
        likes,
        comments,
        shares,
        impressions,
        reach,
        engRate: impressions > 0 ? Number(((interactions / impressions) * 100).toFixed(2)) : 0,
      }
    })

    return { posts }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown PostFast fetch error'
    console.error('[Analytics] PostFast fetch exception:', message)
    return { posts: [], error: message }
  }
}

// Future adapter pattern:
// async function fetchInstagramPosts(token: string, from: Date, to: Date): Promise<AnalyticsPost[]> { ... }
// async function fetchGoogleBusinessPosts(apiKey: string, from: Date, to: Date): Promise<AnalyticsPost[]> { ... }

// ─────────────────────────────────────────────────────────────────────────────
// Internal ContentDraft posts (scheduled / pending review — not yet published)
// These supplement the channel data with drafts that haven't been posted yet.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchInternalDrafts(brandId: string, from: Date, to: Date, platformFilter: string): Promise<AnalyticsPost[]> {
  const drafts = await prisma.contentDraft.findMany({
    where: {
      brandId,
      // Only include drafts not published externally (no platformPostId)
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

  return drafts.map((d: any) => {
    const bestDate = (d.scheduledAt ?? d.createdAt).toISOString()
    return {
      id: d.id,
      source: 'internal',
      platform: d.account?.platformId ?? 'unknown',
      handle: d.account?.handle ?? '',
      caption: d.caption,
      postUrl: null,
      publishedAt: bestDate,
      contentType: detectContentType(d.caption, d.mediaUrls ?? [], d.hashtags ?? []),
      status: d.status,
      hashtags: d.hashtags ?? [],
      mediaUrls: d.mediaUrls ?? [],
      scheduledAt: d.scheduledAt?.toISOString() ?? null,
      likes: 0,
      comments: 0,
      shares: 0,
      impressions: 0,
      reach: 0,
      engRate: 0,
    }
  })
}

// GET /api/brands/[id]/analytics?from=ISO&to=ISO&platform=all
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
  const toParam = url.searchParams.get('to')
  const platformFilter = url.searchParams.get('platform') || 'all'

  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
  const from = fromParam ? new Date(fromParam) : defaultFrom
  const to = toParam ? new Date(toParam) : now

  const brand = await prisma.brand.findFirst({
    where: { id },
    select: { id: true, postfastApiKey: true },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Fetch from all configured channels in parallel ────────────────────────
  const [pfResult, internalDrafts] = await Promise.all([
    brand.postfastApiKey
      ? fetchPostfastPosts(brand.postfastApiKey, from, to, id)
      : Promise.resolve({ posts: [] as AnalyticsPost[], error: 'no API key configured' }),
    fetchInternalDrafts(id, from, to, platformFilter),
    // Future: add more channel adapters here
  ])

  const postfastError = pfResult.error
  const postfastPosts = pfResult.posts

  // Platform filter for PostFast posts (applied client-side since PF API doesn't filter)
  const filteredPostfastPosts = platformFilter === 'all'
    ? postfastPosts
    : postfastPosts.filter(p => p.platform.toLowerCase() === platformFilter.toLowerCase())

  // Merge: PostFast posts take priority (real engagement data)
  // Internal drafts fill in scheduled/pending content not yet on PostFast
  const posts: AnalyticsPost[] = [...filteredPostfastPosts, ...internalDrafts]

  const hasPostfastData = postfastPosts.length > 0


  // ── KPI aggregates ─────────────────────────────────────────────────────────
  const totalPosts = posts.length
  const publishedCount = posts.filter(p => p.status === 'published' || p.status === 'done').length
  const pendingCount = posts.filter(p => p.status === 'pending_review').length
  const draftCount = posts.filter(p => p.status === 'draft').length
  const totalEngagement = posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0)
  const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0)
  const totalLikes = posts.reduce((s, p) => s + p.likes, 0)
  const avgReach = posts.length > 0
    ? Math.round(posts.reduce((s, p) => s + p.reach, 0) / posts.length)
    : 0
  const avgEngRate = totalImpressions > 0
    ? Number(((totalEngagement / totalImpressions) * 100).toFixed(2))
    : 0

  // ── Daily time-series ──────────────────────────────────────────────────────
  const dayMap = new Map<string, {
    date: string; postCount: number
    engagement: number; impressions: number; reach: number; likes: number; engRate: number
  }>()

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

  // Fill date range gaps
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0)
  const endDay = new Date(to); endDay.setHours(23, 59, 59, 999)
  while (cursor <= endDay) {
    const key = cursor.toISOString().slice(0, 10)
    if (!dayMap.has(key)) dayMap.set(key, { date: key, postCount: 0, engagement: 0, impressions: 0, reach: 0, likes: 0, engRate: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  const timeSeries = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, engRate: d.impressions > 0 ? Number(((d.engagement / d.impressions) * 100).toFixed(2)) : 0 }))

  // ── Top posts (PostFast posts with real engagement, sorted by interactions) ─
  const topPosts = [...posts]
    .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares) || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 20)

  // ── Content type breakdown ─────────────────────────────────────────────────
  const ctMap: Record<string, { count: number; engagement: number; impressions: number }> = {}
  for (const p of posts) {
    if (!ctMap[p.contentType]) ctMap[p.contentType] = { count: 0, engagement: 0, impressions: 0 }
    ctMap[p.contentType].count++
    ctMap[p.contentType].engagement += p.likes + p.comments + p.shares
    ctMap[p.contentType].impressions += p.impressions
  }
  const contentTypeBreakdown = Object.entries(ctMap).map(([type, s]) => ({
    type, count: s.count, engagement: s.engagement, impressions: s.impressions,
    avgEngRate: s.impressions > 0 ? Number(((s.engagement / s.impressions) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.count - a.count)

  // ── Platform breakdown ─────────────────────────────────────────────────────
  const platMap: Record<string, { count: number; engagement: number }> = {}
  for (const p of posts) {
    if (!platMap[p.platform]) platMap[p.platform] = { count: 0, engagement: 0 }
    platMap[p.platform].count++
    platMap[p.platform].engagement += p.likes + p.comments + p.shares
  }
  const platformBreakdown = Object.entries(platMap).map(([platform, s]) => ({ platform, count: s.count, engagement: s.engagement }))

  // ── Source breakdown (which channels contributed data) ────────────────────
  const sourceBreakdown = {
    postfast: postfastPosts.length,
    internal: internalDrafts.length,
  }

  const statusBreakdown = { totalPosts, publishedCount, pendingCount, draftCount }

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    kpis: { totalPosts, totalEngagement, totalImpressions, avgReach, totalLikes, avgEngRate },
    statusBreakdown,
    timeSeries,
    topPosts,
    allPosts: posts,
    contentTypeBreakdown,
    platformBreakdown,
    sourceBreakdown,
    hasPostfastData,
    postfastError: postfastError ?? null,
  })
}

function detectContentType(caption: string, mediaUrls: string[], hashtags: string[]): string {
  const cap = (caption ?? '').toLowerCase()
  const tags = (hashtags ?? []).map(h => h.toLowerCase())
  if (tags.some(t => t.includes('reel') || t.includes('short') || t.includes('tiktok')) || cap.includes('#reels')) return 'SHORT'
  if (tags.some(t => t.includes('story') || t.includes('stories'))) return 'STORY'
  if ((mediaUrls ?? []).some(u => u.match(/\.(mp4|mov|avi|webm)/i))) return 'VIDEO'
  if ((mediaUrls ?? []).length > 0) return 'IMAGE'
  if (cap.length > 400) return 'LONG'
  return 'SHORT'
}
