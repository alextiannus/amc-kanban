import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const TASK_PLATFORM_HINTS: Array<{ platform: string; keywords: string[] }> = [
  { platform: 'IG', keywords: ['instagram', 'ig'] },
  { platform: '小红书', keywords: ['xiaohongshu', 'xhs', 'rednote', '小红书'] },
  { platform: 'TikTok', keywords: ['tiktok', 'tt'] },
  { platform: 'Google', keywords: ['google', 'gmb', 'maps'] },
  { platform: 'Facebook', keywords: ['facebook', 'fb'] },
  { platform: 'YouTube', keywords: ['youtube', 'yt'] },
  { platform: 'X', keywords: ['twitter', 'x.com', ' x '] },
  { platform: 'Yelp', keywords: ['yelp'] },
  { platform: 'LinkedIn', keywords: ['linkedin'] },
  { platform: 'Pinterest', keywords: ['pinterest'] },
  { platform: '微博', keywords: ['weibo', '微博'] },
  { platform: '微信公众号', keywords: ['wechat', 'weixin', '公众号', '微信'] },
  { platform: 'Snapchat', keywords: ['snapchat'] },
  { platform: 'TripAdvisor', keywords: ['tripadvisor'] },
]

function inferTaskPlatform(task: { title: string; description: string | null; materials: string | null; tags: string[] }) {
  const text = [task.title, task.description ?? '', task.materials ?? '', ...(task.tags ?? [])]
    .join(' ')
    .toLowerCase()

  for (const hint of TASK_PLATFORM_HINTS) {
    if (hint.keywords.some(keyword => text.includes(keyword.toLowerCase()))) return hint.platform
  }

  return '任务'
}

async function getAccessibleBrandIds(userId: string, userType: string, role: string) {
  if (userType === 'AI_AGENT') {
    const links = await prisma.brandAgent.findMany({
      where: { agentId: userId, active: true },
      select: { brandId: true },
    })
    return links.map((link: any) => link.brandId)
  }

  if (role === 'ADMIN') {
    const brands = await prisma.brand.findMany({ select: { id: true } })
    return brands.map((brand: any) => brand.id)
  }

  const ownerLinks = await prisma.brandOwner.findMany({
    where: { userId },
    select: { brandId: true },
  })
  const ownerBrandIds = ownerLinks.map((link: any) => link.brandId)
  const legacyBrands = await prisma.brand.findMany({
    where: { ownerId: userId, id: { notIn: ownerBrandIds } },
    select: { id: true },
  })

  return [...ownerBrandIds, ...legacyBrands.map((brand: any) => brand.id)]
}

// GET /api/dashboard/calendar?month=YYYY-MM
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const month = url.searchParams.get('month')
  const requestedBrandId = url.searchParams.get('brandId')
  const monthDate = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date()
  const year = monthDate.getUTCFullYear()
  const monthIndex = monthDate.getUTCMonth()
  const rangeStart = new Date(Date.UTC(year, monthIndex, 1))
  const rangeEnd = new Date(Date.UTC(year, monthIndex + 1, 1))

  const brandIds = await getAccessibleBrandIds(session.user.id, session.user.type ?? 'HUMAN', session.user.role)
  if (brandIds.length === 0) return NextResponse.json({ events: [] })

  const scopedBrandIds = requestedBrandId
    ? (brandIds.includes(requestedBrandId) ? [requestedBrandId] : [])
    : brandIds

  if (scopedBrandIds.length === 0) return NextResponse.json({ events: [] })

  const drafts = await prisma.contentDraft.findMany({
    where: {
      brandId: { in: scopedBrandIds },
      status: { in: ['scheduled', 'publishing', 'published'] },
      OR: [
        { scheduledAt: { gte: rangeStart, lt: rangeEnd } },
        { publishedAt: { gte: rangeStart, lt: rangeEnd } },
      ],
    },
    include: {
      brand: { select: { id: true, name: true } },
      account: { select: { platformId: true, handle: true, displayName: true } },
    },
    orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'desc' }],
  })

  const brands = await prisma.brand.findMany({
    where: { id: { in: scopedBrandIds } },
    select: { id: true, name: true },
  })
  const brandNameMap = new Map(brands.map((brand: any) => [brand.id, brand.name]))


  const mediaAssets = await prisma.mediaAsset.findMany({
    where: { brandId: { in: scopedBrandIds } },
    select: { id: true, url: true }
  })
  const mediaUrlToIdMap = new Map(mediaAssets.map((asset: any) => [asset.url, asset.id]))

  const conversions = await prisma.conversionEvent.findMany({
    where: { brandId: { in: scopedBrandIds } }
  })

  // ── Phase A: Sync scheduled→published for past-due drafts ─────────────────────────────────
  // PostFast publishes scheduled posts automatically. AMC doesn't receive a webhook,
  // so we proactively check here (on calendar load) for any 'scheduled' drafts whose
  // scheduledAt has already passed and sync their status from PostFast.
  const pastDueDrafts = drafts.filter(
    (d: any) => d.status === 'scheduled' && d.platformPostId && d.scheduledAt && new Date(d.scheduledAt) < new Date()
  )
  if (pastDueDrafts.length > 0) {
    const brandIdsToSync = Array.from(new Set(pastDueDrafts.map((d: any) => d.brandId)))
    const brandsForSync = await prisma.brand.findMany({
      where: { id: { in: brandIdsToSync }, postfastApiKey: { not: null } },
      select: { id: true, postfastApiKey: true }
    })
    const { syncBrandDraftStatuses } = await import('@/lib/syncDraftStatuses')
    for (const brand of brandsForSync) {
      if (!brand.postfastApiKey) continue
      try {
        const syncResult = await syncBrandDraftStatuses(brand.id, brand.postfastApiKey)
        // Reflect status changes in the in-memory draft array so the response is fresh
        for (const update of syncResult.updates) {
          const d = (drafts as any[]).find((dr: any) => dr.id === update.draftId)
          if (d) {
            d.status = update.to
            if (update.publishedAt) d.publishedAt = new Date(update.publishedAt)
          }
        }
      } catch (e: any) {
        console.error('[calendar] syncBrandDraftStatuses error (non-fatal):', e?.message ?? e)
      }
    }
  }

  // ── Phase B: Dynamically resolve postUrl for published drafts using PostFast ──────────────
  const needsUrlResolution = drafts.some((d: any) => d.status === 'published' && d.platformPostId && !d.postUrl)
  const draftPostUrlMap = new Map<string, string>()

  if (needsUrlResolution) {
    const brandIdsWithPublished = Array.from(new Set(
      drafts
        .filter((d: any) => d.status === 'published' && d.platformPostId && !d.postUrl)
        .map((d: any) => d.brandId)
    ))

    if (brandIdsWithPublished.length > 0) {
      const brandsWithKeys = await prisma.brand.findMany({
        where: { id: { in: brandIdsWithPublished } },
        select: { id: true, postfastApiKey: true }
      })

      const { postfastListPosts } = await import('@/lib/integrations/postfast')
      for (const brand of brandsWithKeys) {
        if (brand.postfastApiKey) {
          const pfResult = await postfastListPosts(brand.postfastApiKey, { status: 'published' })
          if (pfResult.success) {
            for (const pfPost of pfResult.posts) {
              if (pfPost.postUrl) {
                draftPostUrlMap.set(pfPost.id, pfPost.postUrl)
              }
            }
          }
        }
      }

      // Inline update the DB for any draft where we resolved the URL from PostFast
      for (const d of drafts) {
        if (d.status === 'published' && d.platformPostId && !d.postUrl) {
          const resolvedUrl = draftPostUrlMap.get(d.platformPostId)
          if (resolvedUrl) {
            d.postUrl = resolvedUrl // update in-memory object so it is returned
            await prisma.contentDraft.update({
              where: { id: d.id },
              data: { postUrl: resolvedUrl }
            }).catch((err: any) => console.error('Failed to cache draft postUrl in calendar:', err))
          }
        }
      }
    }
  }


  const events = drafts.map((draft: any) => {
    const eventAt = draft.status === 'published'
      ? (draft.publishedAt ?? draft.scheduledAt ?? draft.updatedAt)
      : (draft.scheduledAt ?? draft.updatedAt)
    const platform = draft.account?.platformId || '全平台'
    const status = draft.status === 'published'
      ? 'done'
      : 'scheduled'

    const firstMediaUrl = draft.mediaUrls?.[0]
    const mediaAssetId = firstMediaUrl ? mediaUrlToIdMap.get(firstMediaUrl) : null

    const draftConversions = conversions.filter((c: any) => c.referPostId === draft.id || (draft.platformPostId && c.referPostId === draft.platformPostId))
    const clicks = draftConversions.length
    const roi = draftConversions.reduce((sum: any, c: any) => {
      const meta = c.metadata as any
      const val = meta?.revenue || meta?.value || 0
      return sum + Number(val)
    }, 0)

    return {
      id: draft.id,
      brandId: draft.brandId,
      brandName: draft.brand.name,
      platform,
      title: draft.caption,
      status,
      time: eventAt.toISOString(),
      scheduledAt: eventAt.toISOString(),
      mediaUrls: draft.mediaUrls,
      captionLang: draft.captionLang,
      mediaAssetId: mediaAssetId || null,
      clicks,
      roi,
      platformPostId: draft.platformPostId,
      postUrl: draft.postUrl || (draft.platformPostId ? draftPostUrlMap.get(draft.platformPostId) : null),
      type: 'post',
      agentNote: draft.agentNote,
      creativeHooks: draft.creativeHooks,
    }
  })

  const mergedEvents = [...events].sort((a, b) => {
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  })

  return NextResponse.json({ events: mergedEvents })
}