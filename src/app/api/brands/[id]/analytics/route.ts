import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { postfastListPosts } from '@/lib/integrations/postfast'

type Params = { params: Promise<{ id: string }> }

export interface AnalyticsPost {
  id: string
  platform: string
  handle: string
  caption: string
  postUrl: string | null
  publishedAt: string       // best available date for sorting/display
  contentType: string       // SHORT | IMAGE | VIDEO | LONG | STORY
  status: string            // draft | pending_review | published | done
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

  // ── 1. All ContentDrafts in date range (any status) ───────────────────────
  const allDrafts = await prisma.contentDraft.findMany({
    where: {
      brandId: id,
      OR: [
        { createdAt: { gte: from, lte: to } },
        { publishedAt: { gte: from, lte: to } },
        { scheduledAt: { gte: from, lte: to } },
      ],
      ...(platformFilter !== 'all'
        ? { account: { platformId: { equals: platformFilter, mode: 'insensitive' } } }
        : {}),
    },
    include: { account: { select: { platformId: true, handle: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  // ── 2. Build PostFast engagement overlay (keyed by platformPostId) ────────
  const pfEngMap = new Map<string, { likes: number; comments: number; shares: number; impressions: number; reach: number; postUrl: string | null }>()
  let hasPostfastData = false

  if (brand.postfastApiKey) {
    try {
      const pfResult = await postfastListPosts(brand.postfastApiKey, { status: 'published', limit: 500 })
      if (pfResult.success && pfResult.posts.length > 0) {
        hasPostfastData = true
        for (const p of pfResult.posts) {
          const key = p.id
          if (!key) continue
          pfEngMap.set(key, {
            likes: p.engagementStats?.likes ?? 0,
            comments: p.engagementStats?.comments ?? 0,
            shares: p.engagementStats?.shares ?? 0,
            impressions: p.engagementStats?.impressions ?? 0,
            reach: p.engagementStats?.reach ?? 0,
            postUrl: p.postUrl ?? null,
          })
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── 3. Merge drafts + PostFast engagement ────────────────────────────────
  const posts: AnalyticsPost[] = allDrafts.map(d => {
    const pfKey = d.platformPostId ?? ''
    const eng = pfEngMap.get(pfKey) ?? { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0, postUrl: null }
    const interactions = eng.likes + eng.comments + eng.shares
    const bestDate = (d.publishedAt ?? d.scheduledAt ?? d.createdAt).toISOString()
    return {
      id: d.id,
      platform: d.account?.platformId ?? 'unknown',
      handle: d.account?.handle ?? '',
      caption: d.caption,
      postUrl: eng.postUrl,
      publishedAt: bestDate,
      contentType: detectContentType(d.caption, d.mediaUrls ?? [], d.hashtags ?? []),
      status: d.status,
      hashtags: d.hashtags ?? [],
      mediaUrls: d.mediaUrls ?? [],
      scheduledAt: d.scheduledAt?.toISOString() ?? null,
      likes: eng.likes,
      comments: eng.comments,
      shares: eng.shares,
      impressions: eng.impressions,
      reach: eng.reach,
      engRate: eng.impressions > 0 ? Number(((interactions / eng.impressions) * 100).toFixed(2)) : 0,
    }
  })

  // ── 4. KPI aggregates ─────────────────────────────────────────────────────
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

  // ── 5. Daily time-series (postCount + engagement metrics) ─────────────────
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

  // Fill gaps in date range
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

  // ── 6. Top posts (all posts, sorted by interaction) ───────────────────────
  const topPosts = [...posts]
    .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares) || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 20)

  // ── 7. Content type breakdown ─────────────────────────────────────────────
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

  // ── 8. Platform breakdown ─────────────────────────────────────────────────
  const platMap: Record<string, number> = {}
  for (const p of posts) platMap[p.platform] = (platMap[p.platform] ?? 0) + 1
  const platformBreakdown = Object.entries(platMap).map(([platform, count]) => ({ platform, count }))

  // ── 9. Status breakdown ───────────────────────────────────────────────────
  const statusBreakdown = { totalPosts, publishedCount, pendingCount, draftCount }

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    kpis: { totalPosts, totalEngagement, totalImpressions, avgReach, totalLikes, avgEngRate },
    statusBreakdown,
    timeSeries,
    topPosts,       // full post list (up to 20)
    allPosts: posts, // all posts for client-side filtering
    contentTypeBreakdown,
    platformBreakdown,
    hasPostfastData,
  })
}

function detectContentType(caption: string, mediaUrls: string[], hashtags: string[]): string {
  const cap = caption.toLowerCase()
  const tags = hashtags.map(h => h.toLowerCase())
  if (tags.some(t => t.includes('reel') || t.includes('short') || t.includes('tiktok')) || cap.includes('#reels')) return 'SHORT'
  if (tags.some(t => t.includes('story') || t.includes('stories'))) return 'STORY'
  if (mediaUrls.some(u => u.match(/\.(mp4|mov|avi|webm)/i))) return 'VIDEO'
  if (mediaUrls.length > 0) return 'IMAGE'
  if (caption.length > 400) return 'LONG'
  return 'SHORT'
}
