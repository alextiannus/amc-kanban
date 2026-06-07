import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'
import { actorFromContext, writeAuditLog } from '@/lib/audit'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'

async function canHumanAccessTask(humanId: string, assigneeId: string | null) {
  const permissions = await prisma.agentPermission.findMany({
    where: { humanId },
    select: { agentId: true }
  })

  if (permissions.length === 0) {
    return false
  }

  if (!assigneeId) {
    return false
  }

  return permissions.some(permission => permission.agentId === assigneeId)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)

    if (!session?.user && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const task = await prisma.workUnit.findUnique({
      where: { id },
      include: {
        assignee: {
          select: {
            id: true,
            email: true,
            type: true,
            nickname: true,
            insights: true,
            introduction: true,
            workflow: true,
            themeColor: true,
            ...avatarSelect,
          }
        },
        dependencies: {
          include: {
            blockerTask: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          }
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                nickname: true,
                type: true,
                themeColor: true,
                ...avatarSelect,
              }
            }
          }
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    let isAuthorized = false
    if (session?.user.role === 'ADMIN') {
      isAuthorized = true
    } else if (apiKey) {
      const authenticatedAgent = await getAgentFromApiKey(apiKey)
      isAuthorized = Boolean(authenticatedAgent && authenticatedAgent.id === task.assigneeId)
    } else if (session?.user.id) {
      isAuthorized = await canHumanAccessTask(session.user.id, task.assigneeId ?? null)
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const taskWithAvatar = {
      ...task,
      assignee: task.assignee ? withResolvedAvatar(task.assignee) : null,
      comments: task.comments?.map((comment) => ({
        ...comment,
        author: comment.author ? withResolvedAvatar(comment.author) : null
      }))
    }
    return NextResponse.json(taskWithAvatar)
  } catch (error) {
    console.error('Task detail GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)

    if (!session?.user && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existingTask = await prisma.workUnit.findUnique({ where: { id } })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    let isAuthorized = false
    if (session?.user.role === 'ADMIN') {
      isAuthorized = true
    } else if (authenticatedAgent) {
      isAuthorized = authenticatedAgent.id === existingTask.assigneeId
    } else if (session?.user.id) {
      isAuthorized = await canHumanAccessTask(session.user.id, existingTask.assigneeId ?? null)
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { title, description, materials, assigneeId, priority, estimatedHours, deadline, tags, weight, status, blockerTaskIds } = body

    if (weight !== undefined) {
      return NextResponse.json({ error: 'Forbidden: task weight is immutable after creation' }, { status: 400 })
    }

    if (authenticatedAgent && assigneeId !== undefined && assigneeId !== authenticatedAgent.id) {
      return NextResponse.json({ error: 'Forbidden: API key cannot reassign task to another agent' }, { status: 403 })
    }

    if (session?.user && session.user.role !== 'ADMIN' && assigneeId !== undefined && assigneeId !== null) {
      const canAssignToAgent = await prisma.agentPermission.findFirst({
        where: {
          humanId: session.user.id,
          agentId: assigneeId,
        },
        select: { id: true }
      })

      if (!canAssignToAgent) {
        return NextResponse.json({ error: 'Forbidden: You do not have permission to assign tasks to this agent' }, { status: 403 })
      }
    }

    if (assigneeId !== undefined && assigneeId !== null) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, type: true }
      })

      if (!assignee || assignee.type !== 'AI_AGENT') {
        return NextResponse.json({ error: 'Invalid assigneeId: must be an AI_AGENT' }, { status: 400 })
      }
    }

    if (status === 'in_progress' && apiKey) {
      const blockers = await prisma.taskDependency.findMany({
        where: { blockedTaskId: id },
        include: {
          blockerTask: {
            select: {
              status: true
            }
          }
        }
      })
      const activeBlockers = blockers.filter(dep => !['done', 'void'].includes(dep.blockerTask.status))
      if (activeBlockers.length > 0) {
        return NextResponse.json({ error: 'Forbidden: Task is blocked by unfinished blocker tasks.' }, { status: 400 })
      }
    }

    if (blockerTaskIds !== undefined && Array.isArray(blockerTaskIds)) {
      const validBlockerTaskIds = blockerTaskIds.filter((bid): bid is string => typeof bid === 'string' && bid.trim() !== '' && bid !== id)

      await prisma.$transaction([
        prisma.taskDependency.deleteMany({
          where: { blockedTaskId: id }
        }),
        ...(validBlockerTaskIds.length > 0 ? [
          prisma.taskDependency.createMany({
            data: validBlockerTaskIds.map(bid => ({
              blockedTaskId: id,
              blockerTaskId: bid
            }))
          })
        ] : [])
      ])
    }

    const data: Prisma.WorkUnitUpdateInput = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (materials !== undefined) data.materials = materials
    if (assigneeId !== undefined) {
      data.assignee = assigneeId ? { connect: { id: assigneeId } } : { disconnect: true }
    }
    if (status !== undefined) data.status = status
    if (priority !== undefined) data.priority = priority || 'medium'
    if (estimatedHours !== undefined) data.estimatedHours = estimatedHours !== null && estimatedHours !== '' ? Number(estimatedHours) : null
    if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null
    if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : []

    const updatedTask = await prisma.workUnit.update({
      where: { id },
      data,
      include: {
        dependencies: {
          include: {
            blockerTask: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          }
        }
      }
    })

    await writeAuditLog({
      actor: actorFromContext(session?.user, authenticatedAgent),
      action: 'TASK_UPDATED',
      resourceId: updatedTask.id,
      oldValue: existingTask,
      newValue: updatedTask,
      metadata: { changedFields: Object.keys(data), source: apiKey ? 'api' : 'web' }
    })

    eventEmitter.emit('board_update')

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error('Task detail PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
