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
    return links.map(link => link.brandId)
  }

  if (role === 'ADMIN') {
    const brands = await prisma.brand.findMany({ select: { id: true } })
    return brands.map(brand => brand.id)
  }

  const ownerLinks = await prisma.brandOwner.findMany({
    where: { userId },
    select: { brandId: true },
  })
  const ownerBrandIds = ownerLinks.map(link => link.brandId)
  const legacyBrands = await prisma.brand.findMany({
    where: { ownerId: userId, id: { notIn: ownerBrandIds } },
    select: { id: true },
  })

  return [...ownerBrandIds, ...legacyBrands.map(brand => brand.id)]
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
  const brandNameMap = new Map(brands.map(brand => [brand.id, brand.name]))

  const brandAgentLinks = await prisma.brandAgent.findMany({
    where: { brandId: { in: scopedBrandIds }, active: true },
    select: { agentId: true },
  })
  const brandAgentIds = Array.from(new Set(brandAgentLinks.map(link => link.agentId)))

  const tasks = brandAgentIds.length > 0
    ? await prisma.workUnit.findMany({
        where: {
          assigneeId: { in: brandAgentIds },
          brandId: { in: scopedBrandIds },
          OR: [
            // Planned work: tasks scheduled by deadline in the viewed month.
            { deadline: { gte: rangeStart, lt: rangeEnd } },
            // Past happened: completed/cancelled in the viewed month.
            { status: 'done', updatedAt: { gte: rangeStart, lt: rangeEnd } },
            // Planned without deadline: newly created active tasks in the viewed month.
            { status: { in: ['todo', 'in_progress', 'pending'] }, deadline: null, createdAt: { gte: rangeStart, lt: rangeEnd } },
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          materials: true,
          tags: true,
          status: true,
          deadline: true,
          createdAt: true,
          updatedAt: true,
          brandId: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      })
    : []

  const mediaAssets = await prisma.mediaAsset.findMany({
    where: { brandId: { in: scopedBrandIds } },
    select: { id: true, url: true }
  })
  const mediaUrlToIdMap = new Map(mediaAssets.map(asset => [asset.url, asset.id]))

  const conversions = await prisma.conversionEvent.findMany({
    where: { brandId: { in: scopedBrandIds } }
  })

  const events = drafts.map(draft => {
    const eventAt = draft.status === 'published'
      ? (draft.publishedAt ?? draft.scheduledAt ?? draft.updatedAt)
      : (draft.scheduledAt ?? draft.updatedAt)
    const platform = draft.account?.platformId || '全平台'
    const status = draft.status === 'published'
      ? 'done'
      : draft.status === 'publishing'
        ? 'scheduled'
        : draft.status === 'pending_review'
          ? 'pending'
          : 'scheduled'

    const firstMediaUrl = draft.mediaUrls?.[0]
    const mediaAssetId = firstMediaUrl ? mediaUrlToIdMap.get(firstMediaUrl) : null

    const draftConversions = conversions.filter(c => c.referPostId === draft.id || (draft.platformPostId && c.referPostId === draft.platformPostId))
    const clicks = draftConversions.length
    const roi = draftConversions.reduce((sum, c) => {
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
      roi
    }
  })

  const taskEvents = tasks
    .filter(task => task.status !== 'void' && Boolean(task.deadline))
    .map(task => {
      const eventTime = task.status === 'done' ? task.updatedAt : (task.deadline ?? task.createdAt)
      const status = task.status === 'done'
        ? 'done'
        : task.status === 'pending'
          ? 'pending'
          : 'scheduled'
      const title = task.status === 'done' ? `[已完成] ${task.title}` : task.title

      return {
        id: `task_${task.id}`,
        brandId: task.brandId ?? requestedBrandId ?? '',
        brandName: task.brandId ? (brandNameMap.get(task.brandId) ?? '当前品牌') : (requestedBrandId ? (brandNameMap.get(requestedBrandId) ?? '当前品牌') : '任务'),
        platform: inferTaskPlatform(task),
        title,
        status,
        time: eventTime.toISOString(),
        scheduledAt: eventTime.toISOString(),
      }
    })

  const mergedEvents = [...events, ...taskEvents].sort((a, b) => {
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  })

  return NextResponse.json({ events: mergedEvents })
}