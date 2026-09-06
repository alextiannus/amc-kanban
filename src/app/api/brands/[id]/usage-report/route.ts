import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { buildPostfastPlanningFeedback } from '@/lib/postfastPlanningFeedback'

type Params = { params: Promise<{ id: string }> }

const DAY_MS = 24 * 60 * 60 * 1000

function emptyPostfastFeedback(windowDays: number) {
  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    syncedAt: null,
    followerMovement: [],
    bestPerformingPosts: [],
    failedOrUnknownPublishes: [],
    unresolvedComments: 0,
    unresolvedCommentThreads: [],
    accountHealthIssues: [],
    dashboard: {
      needsThisWeek: [],
      reconnectAccountCount: 0,
      unresolvedCommentCount: 0,
      thisMonthPublished: 0,
      thisMonthScheduled: 0,
    },
    contentSignals: {
      recentTopPostThemes: [],
      weakPlatformSignals: [],
      promptHints: [],
    },
    operationsReport: {},
    accountsFromSnapshot: [],
  }
}

function parseDateParam(value: string | null, fallback: Date, endOfDay = false) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  if (endOfDay) date.setHours(23, 59, 59, 999)
  return date
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '-'
  return d.toISOString().slice(0, 10)
}

function truncate(text: string | null | undefined, length = 120) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return '-'
  return clean.length > length ? `${clean.slice(0, length - 3)}...` : clean
}

function csvList(value: string[] | null | undefined) {
  return value && value.length > 0 ? value.join(', ') : '-'
}

function escapeCell(value: unknown, separator = ',') {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim()
  if (text.includes(separator) || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function buildDelimited(report: any, separator: ',' | '\t') {
  const rows: unknown[][] = [
    ['section', 'field', 'value'],
    ['solution', 'name', report.solution.name],
    ['solution', 'vendor', report.solution.vendor],
    ['customer', 'brand_id', report.customer.brandId],
    ['customer', 'brand_name', report.customer.brandName],
    ['customer', 'location', report.customer.location || ''],
    ['period', 'from', formatDate(report.period.from)],
    ['period', 'to', formatDate(report.period.to)],
    ['deployment', 'plan_name', report.deployment.planName || ''],
    ['deployment', 'subscription_status', report.deployment.subscriptionStatus || ''],
    ['deployment', 'connected_accounts', report.deployment.connectedAccounts],
    ['metrics', 'content_drafts_created', report.metrics.contentDraftsCreated],
    ['metrics', 'content_approved_or_scheduled', report.metrics.contentApprovedOrScheduled],
    ['metrics', 'posts_published', report.metrics.postsPublished],
    ['metrics', 'media_assets_uploaded', report.metrics.mediaAssetsUploaded],
    ['metrics', 'media_assets_reused_in_drafts', report.metrics.mediaAssetsReusedInDrafts],
    ['metrics', 'action_items_completed', report.metrics.actionItemsCompleted],
    ['metrics', 'workflow_tasks_completed', report.metrics.workflowTasksCompleted],
    ['metrics', 'activity_log_entries', report.metrics.activityLogEntries],
    [],
    ['content_activity', 'date', 'platform', 'status', 'summary', 'hashtags'],
    ...report.contentActivity.map((item: any) => ['content_activity', item.date, item.platform, item.status, item.summary, item.hashtags]),
    [],
    ['activity_log', 'date', 'actor', 'activity', 'resource'],
    ...report.activityLog.map((item: any) => ['activity_log', item.date, item.actor, item.action, item.resource]),
  ]
  return rows.map((row) => row.map((cell) => escapeCell(cell, separator)).join(separator)).join('\n')
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildXml(report: any) {
  const contentItems = report.contentActivity.map((item: any) => (
    `    <contentActivity date="${escapeXml(item.date)}" platform="${escapeXml(item.platform)}" status="${escapeXml(item.status)}">` +
    `<summary>${escapeXml(item.summary)}</summary><hashtags>${escapeXml(item.hashtags)}</hashtags></contentActivity>`
  )).join('\n')
  const activityItems = report.activityLog.map((item: any) => (
    `    <activityLog date="${escapeXml(item.date)}" actor="${escapeXml(item.actor)}" resource="${escapeXml(item.resource)}">` +
    `<action>${escapeXml(item.action)}</action></activityLog>`
  )).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<amcUsageReport generatedAt="${escapeXml(report.generatedAt)}">
  <solution name="${escapeXml(report.solution.name)}" vendor="${escapeXml(report.solution.vendor)}" />
  <customer brandId="${escapeXml(report.customer.brandId)}" brandName="${escapeXml(report.customer.brandName)}" location="${escapeXml(report.customer.location || '')}" />
  <period from="${escapeXml(report.period.from)}" to="${escapeXml(report.period.to)}" />
  <deployment planName="${escapeXml(report.deployment.planName || '')}" subscriptionStatus="${escapeXml(report.deployment.subscriptionStatus || '')}" connectedAccounts="${escapeXml(report.deployment.connectedAccounts)}" />
  <metrics>
    <contentDraftsCreated>${escapeXml(report.metrics.contentDraftsCreated)}</contentDraftsCreated>
    <contentApprovedOrScheduled>${escapeXml(report.metrics.contentApprovedOrScheduled)}</contentApprovedOrScheduled>
    <postsPublished>${escapeXml(report.metrics.postsPublished)}</postsPublished>
    <mediaAssetsUploaded>${escapeXml(report.metrics.mediaAssetsUploaded)}</mediaAssetsUploaded>
    <mediaAssetsReusedInDrafts>${escapeXml(report.metrics.mediaAssetsReusedInDrafts)}</mediaAssetsReusedInDrafts>
    <actionItemsCompleted>${escapeXml(report.metrics.actionItemsCompleted)}</actionItemsCompleted>
    <workflowTasksCompleted>${escapeXml(report.metrics.workflowTasksCompleted)}</workflowTasksCompleted>
    <activityLogEntries>${escapeXml(report.metrics.activityLogEntries)}</activityLogEntries>
  </metrics>
  <contentActivities>
${contentItems}
  </contentActivities>
  <activityLogs>
${activityItems}
  </activityLogs>
</amcUsageReport>
`
}

function buildMarkdown(report: any) {
  const lines: string[] = []

  lines.push(`# AMC Usage Report`)
  lines.push('')
  lines.push(`Prepared for BGP claims verification.`)
  lines.push('')
  lines.push(`| Field | Details |`)
  lines.push(`| --- | --- |`)
  lines.push(`| Solution | ${report.solution.name} |`)
  lines.push(`| Vendor | ${report.solution.vendor} |`)
  lines.push(`| Customer / Brand | ${report.customer.brandName} |`)
  lines.push(`| Brand Location | ${report.customer.location || '-'} |`)
  lines.push(`| Report Period | ${formatDate(report.period.from)} to ${formatDate(report.period.to)} |`)
  lines.push(`| Generated At | ${report.generatedAt} |`)
  lines.push('')
  lines.push(`## Deployment Summary`)
  lines.push('')
  lines.push(`| Item | Value |`)
  lines.push(`| --- | --- |`)
  lines.push(`| Active Plan | ${report.deployment.planName || '-'} |`)
  lines.push(`| Subscription Status | ${report.deployment.subscriptionStatus || '-'} |`)
  lines.push(`| Contract Period | ${report.deployment.contractStartDate || '-'} to ${report.deployment.contractEndDate || '-'} |`)
  lines.push(`| Connected Social Accounts | ${report.deployment.connectedAccounts} |`)
  lines.push('')
  lines.push(`## Usage Summary`)
  lines.push('')
  lines.push(`| Metric | Count |`)
  lines.push(`| --- | ---: |`)
  lines.push(`| Content drafts created | ${report.metrics.contentDraftsCreated} |`)
  lines.push(`| Content approved / scheduled | ${report.metrics.contentApprovedOrScheduled} |`)
  lines.push(`| Posts published | ${report.metrics.postsPublished} |`)
  lines.push(`| Media assets uploaded | ${report.metrics.mediaAssetsUploaded} |`)
  lines.push(`| Media assets reused in content | ${report.metrics.mediaAssetsReusedInDrafts} |`)
  lines.push(`| Customer / operation action items completed | ${report.metrics.actionItemsCompleted} |`)
  lines.push(`| Workflow tasks completed | ${report.metrics.workflowTasksCompleted} |`)
  lines.push(`| User / AI activity log entries | ${report.metrics.activityLogEntries} |`)
  lines.push('')
  lines.push(`## PostFast Feedback`)
  lines.push('')
  lines.push(`| Item | Value |`)
  lines.push(`| --- | --- |`)
  lines.push(`| Unresolved comments | ${report.postfastFeedback.unresolvedComments} |`)
  lines.push(`| Account health issues | ${report.postfastFeedback.accountHealthIssues.length} |`)
  lines.push(`| Failed / unknown publishes | ${report.postfastFeedback.failedOrUnknownPublishes.length} |`)
  lines.push(`| This month published / scheduled | ${report.postfastFeedback.dashboard.thisMonthPublished} / ${report.postfastFeedback.dashboard.thisMonthScheduled} |`)
  lines.push('')
  lines.push(`### Follower Movement`)
  lines.push('')
  lines.push(`| Platform | Handle | Followers | Delta |`)
  lines.push(`| --- | --- | ---: | ---: |`)
  for (const item of report.postfastFeedback.followerMovement) {
    lines.push(`| ${item.platform} | ${item.handle || '-'} | ${item.followerCount ?? '-'} | ${item.followerDelta ?? '-'} |`)
  }
  if (report.postfastFeedback.followerMovement.length === 0) {
    lines.push(`| - | - | - | - |`)
  }
  lines.push('')
  lines.push(`### Best Performing Posts`)
  lines.push('')
  lines.push(`| Platform | Theme | Interactions | Impressions | Link |`)
  lines.push(`| --- | --- | ---: | ---: | --- |`)
  for (const item of report.postfastFeedback.bestPerformingPosts) {
    lines.push(`| ${item.platform} | ${String(item.theme || '-').replace(/\|/g, '/')} | ${item.interactions ?? 0} | ${item.impressions ?? 0} | ${item.postUrl || '-'} |`)
  }
  if (report.postfastFeedback.bestPerformingPosts.length === 0) {
    lines.push(`| - | - | - | - | - |`)
  }
  lines.push('')
  lines.push(`## Content Activity Log`)
  lines.push('')
  lines.push(`| Date | Platform | Status | Content Summary | Hashtags |`)
  lines.push(`| --- | --- | --- | --- | --- |`)
  for (const item of report.contentActivity) {
    lines.push(`| ${item.date} | ${item.platform} | ${item.status} | ${item.summary.replace(/\|/g, '/')} | ${item.hashtags.replace(/\|/g, '/')} |`)
  }
  if (report.contentActivity.length === 0) {
    lines.push(`| - | - | - | No content activity recorded in this period. | - |`)
  }
  lines.push('')
  lines.push(`## User / System Activity Log`)
  lines.push('')
  lines.push(`| Date | Actor | Activity | Resource |`)
  lines.push(`| --- | --- | --- | --- |`)
  for (const item of report.activityLog) {
    lines.push(`| ${item.date} | ${item.actor} | ${item.action.replace(/\|/g, '/')} | ${item.resource} |`)
  }
  if (report.activityLog.length === 0) {
    lines.push(`| - | - | No activity log entries recorded in this period. | - |`)
  }
  lines.push('')
  lines.push(`## Verification Notes`)
  lines.push('')
  lines.push(`This report is generated from AMC operational records including content drafts, social publishing records, media assets, action items, workflow tasks, and audit logs. It evidences actual solution usage by the SME user during the report period for BGP claims verification.`)

  return lines.join('\n')
}

export async function GET(req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId } = await params
  const ok = await canSessionAccessBrandProject(
    brandId,
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role
  )
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(req.url)
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 29 * DAY_MS)
  defaultFrom.setHours(0, 0, 0, 0)
  const from = parseDateParam(url.searchParams.get('from'), defaultFrom)
  const to = parseDateParam(url.searchParams.get('to'), now, true)

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      accounts: {
        select: { id: true, platformId: true, handle: true, displayName: true },
      },
      subscriptions: {
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    },
  })

  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const dateWindow = { gte: from, lte: to }

  const [
    drafts,
    mediaAssets,
    actionItemsCompleted,
    completedWorkUnits,
  ] = await Promise.all([
    prisma.contentDraft.findMany({
      where: {
        brandId,
        OR: [
          { createdAt: dateWindow },
          { updatedAt: dateWindow },
          { scheduledAt: dateWindow },
          { publishedAt: dateWindow },
        ],
      },
      include: {
        account: { select: { platformId: true, handle: true } },
        assetRefs: { select: { assetId: true } },
      },
      orderBy: [{ publishedAt: 'desc' }, { scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.mediaAsset.findMany({
      where: { brandId, createdAt: dateWindow },
      select: { id: true },
    }),
    prisma.actionItem.count({
      where: {
        brandId,
        status: { in: ['resolved', 'done', 'completed'] },
        OR: [{ resolvedAt: dateWindow }, { updatedAt: dateWindow }],
      },
    }),
    prisma.workUnit.findMany({
      where: {
        brandId,
        status: { in: ['done', 'completed'] },
        updatedAt: dateWindow,
      },
      select: { id: true },
    }),
  ])

  const draftIds = drafts.map((draft: any) => draft.id)
  const mediaAssetIds = mediaAssets.map((asset: any) => asset.id)
  const workUnitIds = completedWorkUnits.map((workUnit: any) => workUnit.id)
  const assetRefCount = drafts.reduce((sum: number, draft: any) => sum + draft.assetRefs.length, 0)

  const auditResourceFilters = [
    draftIds.length > 0 ? { resourceType: 'ContentDraft', resourceId: { in: draftIds } } : null,
    workUnitIds.length > 0 ? { resourceType: 'WorkUnit', resourceId: { in: workUnitIds } } : null,
    mediaAssetIds.length > 0 ? { resourceType: 'MediaAsset', resourceId: { in: mediaAssetIds } } : null,
  ].filter(Boolean) as Array<{ resourceType: string; resourceId: { in: string[] } }>

  const auditLogs = auditResourceFilters.length > 0
    ? await prisma.auditLog.findMany({
        where: {
          OR: auditResourceFilters,
          timestamp: dateWindow,
        },
        orderBy: { timestamp: 'desc' },
        take: 100,
      })
    : []

  const subscription = brand.subscriptions[0]
  const feedbackWindowDays = Math.max(7, Math.ceil((to.getTime() - from.getTime()) / DAY_MS))
  const postfastFeedback = await buildPostfastPlanningFeedback(brandId, feedbackWindowDays).catch((error) => {
    console.warn('[usage-report] PostFast feedback unavailable:', error instanceof Error ? error.message : error)
    return emptyPostfastFeedback(feedbackWindowDays)
  })
  const contentApprovedOrScheduled = drafts.filter((draft: any) =>
    ['approved', 'scheduled', 'publishing', 'published', 'done'].includes(String(draft.status).toLowerCase())
  ).length
  const postsPublished = drafts.filter((draft: any) =>
    ['published', 'done'].includes(String(draft.status).toLowerCase()) || draft.publishedAt || draft.platformPostId
  ).length

  const contentActivity = drafts.slice(0, 30).map((draft: any) => ({
    id: draft.id,
    date: formatDate(draft.publishedAt ?? draft.scheduledAt ?? draft.createdAt),
    platform: draft.account?.platformId || 'AMC',
    handle: draft.account?.handle || '',
    status: draft.status,
    summary: truncate(draft.caption, 140),
    hashtags: csvList(draft.hashtags),
    postUrl: draft.postUrl || null,
  }))

  const activityLog = auditLogs.slice(0, 30).map((log: any) => ({
    id: log.id,
    date: formatDate(log.timestamp),
    actor: log.actorName || log.actorType || 'AMC System',
    action: log.action,
    resource: `${log.resourceType}:${log.resourceId}`,
  }))

  const report = {
    solution: {
      name: 'AI Marketing Crew Marketing and Sales Content Generation Platform',
      vendor: 'DeliveryChinatown Pte. Ltd. / AMC',
    },
    customer: {
      brandId: brand.id,
      brandName: brand.name,
      location: brand.location,
      website: brand.website,
    },
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    generatedAt: now.toISOString(),
    deployment: {
      planId: subscription?.planId ?? null,
      planName: subscription?.planName ?? null,
      subscriptionStatus: subscription?.status ?? null,
      contractStartDate: formatDate(subscription?.contractStartDate),
      contractEndDate: formatDate(subscription?.contractEndDate),
      connectedAccounts: brand.accounts.length,
      connectedAccountLabels: brand.accounts.map((account: any) => `${account.platformId}:${account.handle || account.displayName || '-'}`),
    },
    metrics: {
      contentDraftsCreated: drafts.filter((draft: any) => draft.createdAt >= from && draft.createdAt <= to).length,
      contentApprovedOrScheduled,
      postsPublished,
      mediaAssetsUploaded: mediaAssets.length,
      mediaAssetsReusedInDrafts: assetRefCount,
      actionItemsCompleted,
      workflowTasksCompleted: completedWorkUnits.length,
      activityLogEntries: auditLogs.length,
    },
    postfastFeedback,
    contentActivity,
    activityLog,
  }

  const format = (url.searchParams.get('format') || 'json').toLowerCase()
  if (['markdown', 'csv', 'tsv', 'xml'].includes(format)) {
    const body =
      format === 'markdown' ? buildMarkdown(report) :
      format === 'csv' ? buildDelimited(report, ',') :
      format === 'tsv' ? buildDelimited(report, '\t') :
      buildXml(report)
    const contentType =
      format === 'markdown' ? 'text/markdown; charset=utf-8' :
      format === 'csv' ? 'text/csv; charset=utf-8' :
      format === 'tsv' ? 'text/tab-separated-values; charset=utf-8' :
      'application/xml; charset=utf-8'
    const ext = format === 'markdown' ? 'md' : format
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorType: session.user.type ?? 'HUMAN',
        actorName: session.user.nickname || session.user.email || 'AMC user',
        action: 'USAGE_REPORT_EXPORTED',
        resourceId: brandId,
        resourceType: 'Brand',
        metadata: {
          from: from.toISOString(),
          to: to.toISOString(),
          format,
        },
      },
    })
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="amc-usage-report-${brandId}-${formatDate(from)}-${formatDate(to)}.${ext}"`,
      },
    })
  }

  return NextResponse.json(report)
}
