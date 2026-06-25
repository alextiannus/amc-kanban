import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

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

function translateStatus(status: string) {
  const map: Record<string, string> = {
    todo: '待办',
    in_progress: '执行中',
    pending: '待审核',
    done: '已完成',
    void: '已作废',
  }
  return map[status.toLowerCase()] ?? status
}

// GET /api/logs/agent?agentId=...&startDate=...&endDate=...
export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const agentId = url.searchParams.get('agentId')
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')

  const brandIds = await getAccessibleBrandIds(session.user.id, session.user.type ?? 'HUMAN', session.user.role)
  if (brandIds.length === 0) {
    return NextResponse.json({ logs: [], agents: [] })
  }

  // 1. Fetch AI Agents assigned to these brands
  const brandAgents = await prisma.brandAgent.findMany({
    where: { brandId: { in: brandIds }, active: true },
    select: {
      agent: {
        select: {
          id: true,
          email: true,
          nickname: true,
        }
      }
    }
  })

  const uniqueAgentsMap = new Map<string, { id: string; email: string; nickname: string | null }>()
  for (const link of brandAgents) {
    if (link.agent) {
      uniqueAgentsMap.set(link.agent.id, link.agent)
    }
  }
  const agentsList = Array.from(uniqueAgentsMap.values())

  // 2. Fetch accessible resource titles/metadata for audit logs
  const workUnits = await prisma.workUnit.findMany({
    where: { brandId: { in: brandIds } },
    select: { id: true, title: true }
  })
  const workUnitIds = workUnits.map(w => w.id)
  const workUnitTitleMap = new Map(workUnits.map(w => [w.id, w.title]))

  const drafts = await prisma.contentDraft.findMany({
    where: { brandId: { in: brandIds } },
    select: { id: true, caption: true }
  })
  const draftIds = drafts.map(d => d.id)
  const draftCaptionMap = new Map(drafts.map(d => [d.id, d.caption]))

  // 3. Build AuditLog query
  const whereClause: Prisma.AuditLogWhereInput = {
    actorType: 'AI_AGENT',
    OR: [
      { resourceType: 'WorkUnit', resourceId: { in: workUnitIds } },
      { resourceType: 'ContentDraft', resourceId: { in: draftIds } }
    ]
  }

  if (agentId && agentId !== 'all') {
    whereClause.actorId = agentId
  }

  if (startDate) {
    const start = new Date(startDate)
    start.setUTCHours(0, 0, 0, 0)
    whereClause.timestamp = {
      ...((whereClause.timestamp as object) || {}),
      gte: start
    }
  }

  if (endDate) {
    const end = new Date(endDate)
    end.setUTCHours(23, 59, 59, 999)
    whereClause.timestamp = {
      ...((whereClause.timestamp as object) || {}),
      lte: end
    }
  }

  const rawLogs = await prisma.auditLog.findMany({
    where: whereClause,
    orderBy: { timestamp: 'desc' },
    take: 200
  })

  // 4. Map raw logs into user-facing action logs (only what they did, no internal thinking)
  const formattedLogs = rawLogs.map(log => {
    let description = '执行了操作'
    let detail = ''

    const taskTitle = workUnitTitleMap.get(log.resourceId) || '未知任务'
    const draftCaption = draftCaptionMap.get(log.resourceId) || '未知草稿'

    switch (log.action) {
      case 'TASK_CREATED':
        description = `创建了任务「${taskTitle}」`
        detail = log.newValue && typeof log.newValue === 'object' ? (log.newValue as any).description || '' : ''
        break
      case 'STATUS_CHANGED': {
        const oldVal = log.oldValue as any
        const newVal = log.newValue as any
        const oldStatus = typeof oldVal === 'object' ? oldVal?.status || '' : (typeof log.oldValue === 'string' ? log.oldValue : '')
        const newStatus = typeof newVal === 'object' ? newVal?.status || '' : (typeof log.newValue === 'string' ? log.newValue : '')
        description = `将任务「${taskTitle}」的状态从「${translateStatus(oldStatus)}」更新为「${translateStatus(newStatus)}」`
        break
      }
      case 'TASK_COMMENT_ADDED': {
        const newVal = log.newValue as any
        const content = typeof newVal === 'object' ? newVal?.content || '' : ''
        description = `在任务「${taskTitle}」下发表了工作备注`
        detail = content
        break
      }
      case 'DRAFT_CREATED':
        description = `根据排期和策略生成了新的发布文案草稿`
        detail = draftCaption !== '未知草稿' ? draftCaption : (log.newValue && typeof log.newValue === 'object' ? (log.newValue as any).caption || '' : '')
        break
      case 'DRAFT_PUBLISHED': {
        const meta = log.metadata as any
        const postId = meta?.postId || ''
        description = `将发布内容成功推送至目标平台`
        detail = `生成平台帖子 ID: ${postId}`
        break
      }
      case 'DRAFT_UPDATED':
        description = `更新了发布文案内容`
        detail = draftCaption
        break
      default:
        description = log.action || '执行了后台任务'
        break
    }

    return {
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      actorId: log.actorId,
      actorName: log.actorName || 'AI 员工',
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      description,
      detail: detail.length > 200 ? detail.substring(0, 200) + '...' : detail
    }
  })

  return NextResponse.json({
    logs: formattedLogs,
    agents: agentsList
  })
}
