import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

const DAY_MS = 24 * 60 * 60 * 1000

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
      name: 'AMC AI Marketing Crew',
      vendor: 'Immedi AI / AMC',
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
    contentActivity,
    activityLog,
  }

  if (url.searchParams.get('format') === 'markdown') {
    const markdown = buildMarkdown(report)
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
          format: 'markdown',
        },
      },
    })
    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="amc-usage-report-${brandId}-${formatDate(from)}-${formatDate(to)}.md"`,
      },
    })
  }

  return NextResponse.json(report)
}
