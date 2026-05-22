import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { postfastListPosts } from '@/lib/integrations/postfast'

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

async function fetchPostfastPosts(apiKey: string, from: Date, to: Date): Promise<{ posts: AnalyticsPost[]; error?: string }> {
  try {
    // Only fetch published posts — PostFast doesn't reliably support 'scheduled' as a status filter.
    // Fetch all (no server-side date filter; PostFast API doesn't support it) then filter locally.
    const result = await postfastListPosts(apiKey, { status: 'published', limit: 500 })

    if (!result.success) {
      console.error('[Analytics] PostFast listPosts failed:', result.error)
      return { posts: [], error: result.error }
    }

    console.log(`[Analytics] PostFast returned ${result.posts.length} published posts`)

    const filtered = result.posts.filter(p => {
      // Include posts that have any date within range, or if no dates available, include all
      const dateStr = p.publishedAt ?? p.scheduledAt
      if (!dateStr) return true  // include undated posts
      const date = new Date(dateStr)
      return date >= from && date <= to
    })

    console.log(`[Analytics] After date filter (${from.toISOString().slice(0,10)} → ${to.toISOString().slice(0,10)}): ${filtered.length} posts`)

    const posts = filtered.map(p => {
      const interactions = (p.engagementStats?.likes ?? 0) + (p.engagementStats?.comments ?? 0) + (p.engagementStats?.shares ?? 0)
      const impressions = p.engagementStats?.impressions ?? 0
      const bestDate = (p.publishedAt ?? p.scheduledAt ?? new Date().toISOString())
      return {
        id: `pf_${p.id}`,
        source: 'postfast',
        platform: p.platformId ?? p.platform?.toLowerCase() ?? 'unknown',
        handle: p.platform ?? '',
        caption: p.caption ?? '',
        postUrl: p.postUrl ?? null,
        publishedAt: bestDate,
        contentType: detectContentType(p.caption ?? '', p.mediaUrls ?? [], p.hashtags ?? []),
        status: p.status,
        hashtags: p.hashtags ?? [],
        mediaUrls: p.mediaUrls ?? [],
        scheduledAt: p.scheduledAt ?? null,
        likes: p.engagementStats?.likes ?? 0,
        comments: p.engagementStats?.comments ?? 0,
        shares: p.engagementStats?.shares ?? 0,
        impressions,
        reach: p.engagementStats?.reach ?? 0,
        engRate: impressions > 0 ? Number(((interactions / impressions) * 100).toFixed(2)) : 0,
      }
    })
    return { posts }
  } catch (e: any) {
    console.error('[Analytics] PostFast fetch exception:', e?.message)
    return { posts: [], error: e?.message }
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

  return drafts.map(d => {
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
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ok = await canSessionAccessBrandProject(
    id, session.user.id, session.user.type ?? 'HUMAN', session.user.role
  )
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
      ? fetchPostfastPosts(brand.postfastApiKey, from, to)
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
