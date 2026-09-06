import { prisma } from '@/lib/prisma'

const DAY_MS = 24 * 60 * 60 * 1000

type JsonRecord = Record<string, unknown>

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function arrayValue(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(objectValue).filter((item) => Object.keys(item).length > 0) : []
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function postMetric(post: JsonRecord) {
  const metric = objectValue(post.latestMetric)
  const stats = objectValue(post.engagementStats)
  return {
    likes: numberValue(metric.likes ?? stats.likes),
    comments: numberValue(metric.comments ?? stats.comments),
    shares: numberValue(metric.shares ?? stats.shares),
    impressions: numberValue(metric.impressions ?? stats.impressions),
    reach: numberValue(metric.reach ?? stats.reach),
    clicks: numberValue(metric.clicks ?? stats.clicks),
  }
}

function interactionScore(post: JsonRecord) {
  const metric = postMetric(post)
  return metric.likes + metric.comments * 2 + metric.shares * 3 + metric.clicks * 2
}

function platformLabel(platform: unknown) {
  const value = text(platform).toLowerCase()
  if (value === 'google' || value === 'google_business') return 'Google Business'
  if (value === 'xiaohongshu') return '小红书'
  if (value === 'tiktok') return 'TikTok'
  if (value === 'instagram') return 'Instagram'
  if (value === 'facebook') return 'Facebook'
  return text(platform) || 'Unknown'
}

function postTheme(post: JsonRecord) {
  const caption = text(post.caption).replace(/\s+/g, ' ')
  if (caption) return caption.slice(0, 90)
  return [platformLabel(post.platform ?? post.platformId), text(post.contentType)].filter(Boolean).join(' ')
}

export async function buildPostfastPlanningFeedback(brandId: string, windowDays = 30, snapshotOverride?: unknown) {
  const to = new Date()
  const from = new Date(to.getTime() - Math.max(1, windowDays) * DAY_MS)
  const hasSnapshotOverride = snapshotOverride !== undefined
  const snapshotBrand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { postfastSnapshot: true, postfastSyncedAt: true },
  })
  const snapshot = objectValue(snapshotOverride ?? snapshotBrand?.postfastSnapshot)
  const accountsFromSnapshot = arrayValue(snapshot.accounts)
  const analyticsPosts = arrayValue(snapshot.analyticsPosts)
  const operationsReport = objectValue(snapshot.operationsReport)

  const [accounts, drafts, inboxConversations, deliveryJobs, accountMetrics] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { brandId },
      select: {
        id: true,
        platformId: true,
        handle: true,
        displayName: true,
        followerCount: true,
        followerDelta: true,
        connectionStatus: true,
        disabledReason: true,
        inboxCapable: true,
      },
    }),
    prisma.contentDraft.findMany({
      where: {
        brandId,
        OR: [
          { updatedAt: { gte: from } },
          { publishedAt: { gte: from } },
          { scheduledAt: { gte: from } },
        ],
      },
      select: {
        id: true,
        status: true,
        caption: true,
        platformPostId: true,
        postUrl: true,
        publishedAt: true,
        scheduledAt: true,
        deliveryFailureCode: true,
        deliveryFailureAt: true,
        account: { select: { platformId: true, handle: true, displayName: true } },
      },
    }),
    prisma.postfastInboxConversation.findMany({
      where: {
        brandId,
        OR: [{ needsAttention: true }, { unreadCount: { gt: 0 } }, { status: { not: 'RESOLVED' } }],
      },
      select: {
        id: true,
        platform: true,
        unreadCount: true,
        needsAttention: true,
        participantName: true,
        lastMessageAt: true,
      },
      orderBy: [{ needsAttention: 'desc' }, { lastMessageAt: 'desc' }],
      take: 20,
    }),
    prisma.postfastDeliveryJob.findMany({
      where: { brandId, status: { in: ['FAILED', 'RESULT_UNKNOWN'] }, updatedAt: { gte: from } },
      select: { id: true, draftId: true, status: true, lastErrorCode: true, lastErrorMessage: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.socialInsightAccountMetric.findMany({
      where: { brandId, snapshotDate: { gte: from, lte: to } },
      orderBy: [{ platform: 'asc' }, { handle: 'asc' }, { snapshotDate: 'asc' }],
      select: { platform: true, handle: true, snapshotDate: true, followerCount: true },
    }),
  ])

  const topPosts = analyticsPosts
    .sort((left, right) => interactionScore(right) - interactionScore(left))
    .slice(0, 5)
    .map((post) => {
      const metric = postMetric(post)
      return {
        id: text(post.id ?? post.platformPostId),
        platform: platformLabel(post.platform ?? post.platformId),
        theme: postTheme(post),
        postUrl: text(post.postUrl ?? post.url) || null,
        publishedAt: text(post.publishedAt) || null,
        interactions: interactionScore(post),
        impressions: metric.impressions,
      }
    })

  const followerStartByAccount = new Map<string, number>()
  const followerEndByAccount = new Map<string, number>()
  accountMetrics.forEach((metric: any) => {
    const key = `${metric.platform}:${metric.handle}`
    if (metric.followerCount === null || metric.followerCount === undefined) return
    if (!followerStartByAccount.has(key)) followerStartByAccount.set(key, metric.followerCount)
    followerEndByAccount.set(key, metric.followerCount)
  })
  const followerMovement = [...followerEndByAccount.entries()].map(([key, current]) => {
    const [platform, handle] = key.split(':')
    const previous = followerStartByAccount.get(key)
    return {
      platform: platformLabel(platform),
      handle,
      followerCount: current,
      followerDelta: previous === undefined ? null : current - previous,
    }
  })

  const accountHealthIssues = accounts
    .filter((account: any) => !['CONNECTED', 'UNKNOWN'].includes(String(account.connectionStatus || 'UNKNOWN')))
    .map((account: any) => ({
      accountId: account.id,
      platform: platformLabel(account.platformId),
      handle: account.displayName || account.handle,
      status: account.connectionStatus,
      reason: account.disabledReason || null,
    }))

  const failedOrUnknownPublishes = [
    ...drafts
      .filter((draft: any) => ['failed', 'publish_failed'].includes(String(draft.status).toLowerCase()) || draft.deliveryFailureCode)
      .map((draft: any) => ({
        draftId: draft.id,
        platform: platformLabel(draft.account?.platformId),
        status: draft.status,
        reason: draft.deliveryFailureCode || null,
        updatedAt: draft.deliveryFailureAt?.toISOString() || null,
      })),
    ...deliveryJobs.map((job: any) => ({
      draftId: job.draftId,
      platform: 'PostFast',
      status: job.status,
      reason: job.lastErrorCode || job.lastErrorMessage,
      updatedAt: job.updatedAt.toISOString(),
    })),
  ].slice(0, 10)

  const monthKey = dateOnly(to).slice(0, 7)
  const monthDrafts = drafts.filter((draft: any) => {
    const relevantDate = draft.publishedAt || draft.scheduledAt
    return relevantDate ? dateOnly(relevantDate).startsWith(monthKey) : false
  })
  const thisMonthPublished = monthDrafts.filter((draft: any) => ['published', 'done'].includes(String(draft.status).toLowerCase()) || draft.publishedAt).length
  const thisMonthScheduled = monthDrafts.filter((draft: any) => String(draft.status).toLowerCase() === 'scheduled').length
  const unresolvedComments = inboxConversations.reduce((sum: number, conversation: any) => sum + Math.max(1, conversation.unreadCount || (conversation.needsAttention ? 1 : 0)), 0)
  const weakPlatforms = [
    ...new Set([
      ...failedOrUnknownPublishes.map((item) => item.platform),
      ...accounts.filter((account: any) => accountHealthIssues.some((issue: any) => issue.accountId === account.id)).map((account: any) => platformLabel(account.platformId)),
    ].filter(Boolean)),
  ]

  const dashboardItems = [
    unresolvedComments > 0 ? { type: 'unresolved_comments', label: `有 ${unresolvedComments} 条评论待回复`, count: unresolvedComments } : null,
    accountHealthIssues.length ? { type: 'account_reconnect', label: '账号需要重新连接', count: accountHealthIssues.length } : null,
    failedOrUnknownPublishes.length ? { type: 'publish_issues', label: '有发布失败或结果未知需要处理', count: failedOrUnknownPublishes.length } : null,
  ].filter(Boolean)

  return {
    generatedAt: to.toISOString(),
    windowDays,
    syncedAt: hasSnapshotOverride
      ? text(snapshot.analyticsUpdatedAt) || snapshotBrand?.postfastSyncedAt?.toISOString() || null
      : snapshotBrand?.postfastSyncedAt?.toISOString() || text(snapshot.analyticsUpdatedAt) || null,
    followerMovement,
    bestPerformingPosts: topPosts,
    failedOrUnknownPublishes,
    unresolvedComments,
    unresolvedCommentThreads: inboxConversations.map((conversation: any) => ({
      id: conversation.id,
      platform: platformLabel(conversation.platform),
      participantName: conversation.participantName,
      unreadCount: conversation.unreadCount,
      needsAttention: conversation.needsAttention,
      lastMessageAt: conversation.lastMessageAt?.toISOString() || null,
    })),
    accountHealthIssues,
    dashboard: {
      needsThisWeek: dashboardItems,
      reconnectAccountCount: accountHealthIssues.length,
      unresolvedCommentCount: unresolvedComments,
      thisMonthPublished,
      thisMonthScheduled,
    },
    contentSignals: {
      recentTopPostThemes: topPosts.map((post) => `${post.platform}: ${post.theme}`).slice(0, 4),
      weakPlatformSignals: weakPlatforms.slice(0, 5),
      promptHints: [
        topPosts.length ? `Recent top themes: ${topPosts.map((post) => post.theme).slice(0, 3).join(' | ')}` : '',
        weakPlatforms.length ? `Weak platforms needing extra care: ${weakPlatforms.join(', ')}` : '',
        unresolvedComments ? `${unresolvedComments} unresolved social comments; prefer clear reply-friendly CTAs.` : '',
      ].filter(Boolean),
    },
    operationsReport,
    accountsFromSnapshot,
  }
}
