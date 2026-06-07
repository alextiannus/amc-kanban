import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { buildWeeklyMetrics, getNaturalWeekWindow } from '@/lib/projectExecution'

type JsonObject = Record<string, unknown>

function parseJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object') return null
  return value as JsonObject
}

async function canHumanAccessAgent(humanId: string, role: string | undefined, agentId: string) {
  if (role === 'ADMIN') return true
  const permission = await prisma.agentPermission.findFirst({
    where: { humanId, agentId },
    select: { id: true }
  })
  return Boolean(permission)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)
    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    if (!session?.user && !authenticatedAgent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const url = new URL(request.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    const weekWindow = (!start || !end)
      ? getNaturalWeekWindow(new Date())
      : { start: new Date(start), end: new Date(end) }

    if (Number.isNaN(weekWindow.start.getTime()) || Number.isNaN(weekWindow.end.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }

    if (weekWindow.start > weekWindow.end) {
      return NextResponse.json({ error: 'start must be before end' }, { status: 400 })
    }

    let authorized = false
    if (authenticatedAgent) {
      authorized = authenticatedAgent.id === id
    } else if (session?.user) {
      authorized = await canHumanAccessAgent(session.user.id, session.user.role, id)
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tasks = await prisma.workUnit.findMany({
      where: {
        assigneeId: id,
        createdAt: { lte: weekWindow.end },
      },
      select: {
        id: true,
        title: true,
        status: true,
        weight: true,
        priority: true,
        estimatedHours: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' }
    })

    const taskIds = tasks.map(t => t.id)
    const logs = taskIds.length === 0 ? [] : await prisma.auditLog.findMany({
      where: {
        resourceType: 'WorkUnit',
        resourceId: { in: taskIds },
        timestamp: {
          gte: weekWindow.start,
          lte: weekWindow.end,
        },
        action: { in: ['STATUS_CHANGED', 'TASK_UPDATED'] }
      },
      select: {
        resourceId: true,
        timestamp: true,
        action: true,
        actorType: true,
        oldValue: true,
        newValue: true,
      },
      orderBy: { timestamp: 'asc' }
    })

    const statusEvents = logs.map(log => {
      const oldObj = parseJsonObject(log.oldValue)
      const newObj = parseJsonObject(log.newValue)
      const oldRequiredInput = oldObj?.requiredInput ?? null
      const newRequiredInput = newObj?.requiredInput ?? null

      return {
        taskId: log.resourceId,
        timestamp: log.timestamp,
        oldStatus: typeof oldObj?.status === 'string' ? oldObj.status : null,
        newStatus: typeof newObj?.status === 'string' ? newObj.status : null,
        actorType: log.actorType,
        changedRequiredInput: oldRequiredInput !== newRequiredInput,
      }
    })

    const metrics = buildWeeklyMetrics(tasks, statusEvents, weekWindow.start, weekWindow.end)

    return NextResponse.json({
      agentId: id,
      range: {
        start: metrics.windowStart.toISOString(),
        end: metrics.windowEnd.toISOString(),
        timezone: 'UTC+8'
      },
      metrics: {
        executedTasksCount: metrics.executedTasksCount,
        completedTasksCount: metrics.completedTasksCount,
        completionRate: metrics.completionRate,
        averageCycleHours: metrics.averageCycleHours,
        pendingInputHours: metrics.pendingInputHours,
        supporterInterventionsCount: metrics.supporterInterventionsCount,
        weightContribution: metrics.weightContribution,
      },
      completedTasks: tasks
        .filter(task => task.status === 'done' && task.updatedAt >= weekWindow.start && task.updatedAt <= weekWindow.end)
        .map(task => ({
          id: task.id,
          title: task.title,
          weight: task.weight,
          priority: task.priority,
          estimatedHours: task.estimatedHours,
          createdAt: task.createdAt,
          completedAt: task.updatedAt,
        }))
    })
  } catch (error) {
    console.error('Agent weekly analytics GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
