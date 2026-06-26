import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { getNaturalWeekWindow } from '@/lib/projectExecution'

type EventBehavior = 'created' | 'started' | 'pending' | 'input_added' | 'completed' | 'reworked' | 'reopened' | 'updated'

type JsonObject = Record<string, unknown>

function parseJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object') return null
  return value as JsonObject
}

function getTimeWindow(searchParams: URLSearchParams) {
  const preset = searchParams.get('preset') || 'week'
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (start && end) {
    return { start: new Date(start), end: new Date(end), preset: 'custom' }
  }

  const now = new Date()
  if (preset === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { start, end, preset }
  }

  if (preset === 'yesterday') {
    const start = new Date(now)
    start.setDate(start.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setDate(end.getDate() - 1)
    end.setHours(23, 59, 59, 999)
    return { start, end, preset }
  }

  if (preset === '7d' || preset === '30d') {
    const days = preset === '7d' ? 7 : 30
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return { start, end: now, preset }
  }

  const week = getNaturalWeekWindow(now)
  return { start: week.start, end: week.end, preset: 'week' }
}

function mapBehavior(action: string, oldObj: JsonObject | null, newObj: JsonObject | null, actorType: string | null): EventBehavior {
  if (action === 'TASK_CREATED') return 'created'

  const oldStatus = typeof oldObj?.status === 'string' ? oldObj.status : null
  const newStatus = typeof newObj?.status === 'string' ? newObj.status : null
  const oldRequiredInput = oldObj?.requiredInput ?? null
  const newRequiredInput = newObj?.requiredInput ?? null

  if (oldRequiredInput !== newRequiredInput && actorType === 'HUMAN') return 'input_added'
  if (newStatus === 'pending') return 'pending'
  if (newStatus === 'done') return 'completed'
  if (oldStatus === 'done' && newStatus && newStatus !== 'done') return 'reworked'
  if (oldStatus === 'pending' && newStatus === 'in_progress') return 'started'
  if (oldStatus === 'todo' && newStatus === 'in_progress') return 'started'
  if (oldStatus === 'void' && newStatus && newStatus !== 'void') return 'reopened'

  return 'updated'
}

export async function GET(request: Request) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)
    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    if (!session?.user && !authenticatedAgent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const filterAgentId = searchParams.get('agentId')
    const filterActorId = searchParams.get('actorId')
    const filterBehavior = searchParams.get('behavior')
    const filterResult = searchParams.get('result')
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000)

    const { start, end, preset } = getTimeWindow(searchParams)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: 'Invalid time window' }, { status: 400 })
    }

    let permittedAgentIds: string[] = []
    if (authenticatedAgent) {
      permittedAgentIds = [authenticatedAgent.id]
    } else if (session?.user.role === 'ADMIN') {
      const agents = await prisma.user.findMany({ where: { type: 'AI_AGENT' }, select: { id: true } })
      permittedAgentIds = agents.map((a: any) => a.id)
    } else {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session!.user.id },
        select: { agentId: true }
      })
      permittedAgentIds = permissions.map((p: any) => p.agentId)
    }

    if (filterAgentId) {
      permittedAgentIds = permittedAgentIds.filter((id: any) => id === filterAgentId)
    }

    if (permittedAgentIds.length === 0) {
      return NextResponse.json({
        range: { start, end, preset },
        total: 0,
        items: []
      })
    }

    const tasks = await prisma.workUnit.findMany({
      where: {
        assigneeId: { in: permittedAgentIds },
        createdAt: { lte: end },
      },
      select: {
        id: true,
        title: true,
        status: true,
        assigneeId: true,
      }
    })

    const taskMap = new Map(tasks.map((t: any) => [t.id, t]))
    const taskIds = tasks.map((t: any) => t.id)
    if (taskIds.length === 0) {
      return NextResponse.json({
        range: { start, end, preset },
        total: 0,
        items: []
      })
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'WorkUnit',
        resourceId: { in: taskIds },
        timestamp: { gte: start, lte: end },
        action: { in: ['TASK_CREATED', 'TASK_UPDATED', 'STATUS_CHANGED'] },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        actorId: true,
        actorType: true,
        actorName: true,
        resourceId: true,
        timestamp: true,
        oldValue: true,
        newValue: true,
        metadata: true,
      }
    })

    const projected = logs
      .map((log: any) => {
        const task = taskMap.get(log.resourceId) as any
        if (!task) return null

        const oldObj = parseJsonObject(log.oldValue)
        const newObj = parseJsonObject(log.newValue)
        const behavior = mapBehavior(log.action, oldObj, newObj, log.actorType)
        const result = typeof newObj?.status === 'string' ? newObj.status : task.status

        return {
          id: log.id,
          timestamp: log.timestamp,
          behavior,
          result,
          action: log.action,
          actor: {
            id: log.actorId,
            type: log.actorType,
            name: log.actorName,
          },
          task: {
            id: task.id,
            title: task.title,
            assigneeId: task.assigneeId,
          },
          metadata: log.metadata,
        }
      })
      .filter(Boolean)
      .filter((item: any) => !filterActorId || item.actor.id === filterActorId)
      .filter((item: any) => !filterBehavior || item.behavior === filterBehavior)
      .filter((item: any) => !filterResult || item.result === filterResult)

    return NextResponse.json({
      range: { start, end, preset },
      total: projected.length,
      items: projected,
    })
  } catch (error) {
    console.error('Activity analytics GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
