import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'
import { actorFromContext, writeAuditLog } from '@/lib/audit'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import type { Prisma } from '@prisma/client'

function normalizeTaskWeight(input: unknown): number {
  const parsed = Number(input)
  if ([1, 3, 5].includes(parsed)) return parsed
  return 3
}

type TaskCreateBody = {
  title?: string
  description?: string | null
  materials?: string | null
  status?: string | null
  assigneeId?: string | null
  priority?: string | null
  estimatedHours?: number | string | null
  deadline?: string | null
  tags?: string[] | string | null
  weight?: number | string | null
  blockerTaskIds?: unknown
  brandId?: string | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const active = searchParams.get('active')
  const archive = searchParams.get('archive')
  const brandId = searchParams.get('brandId')          // filter by brand-linked agents
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
  const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1
  
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)
    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    if (!session?.user && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (apiKey && !authenticatedAgent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    let whereClause: Prisma.WorkUnitWhereInput = {}
    if (status) {
      whereClause.status = status
    } else if (active === 'true') {
      whereClause.OR = [
        { status: { in: ['todo', 'in_progress', 'pending'] } },
        { 
          status: { in: ['done', 'void'] },
          updatedAt: { gte: twentyFourHoursAgo }
        }
      ]
    } else if (archive === 'true') {
      whereClause.status = { in: ['done', 'void'] }
      whereClause.updatedAt = { lt: twentyFourHoursAgo }
    }

    if (authenticatedAgent) {
      whereClause = { ...whereClause, assigneeId: authenticatedAgent.id }
    } else if (session!.user.role !== 'ADMIN') {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session!.user.id }
      })
      const permittedAgentIds = permissions.map(p => p.agentId)

      if (permittedAgentIds.length > 0) {
        whereClause = { ...whereClause, assigneeId: { in: permittedAgentIds } }
      } else {
        return NextResponse.json([])
      }
    }

    // Further narrow to a specific brand's agents when brandId is provided
    if (brandId) {
      if (authenticatedAgent) {
        const ok = await canSessionAccessBrandProject(brandId, authenticatedAgent.id, 'AI_AGENT', 'USER')
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      } else if (session?.user) {
        const ok = await canSessionAccessBrandProject(
          brandId,
          session.user.id,
          session.user.type ?? 'HUMAN',
          session.user.role
        )
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const brandLinks = await prisma.brandAgent.findMany({
        where: { brandId, active: true },
        select: { agentId: true },
      })
      const brandAgentIds = brandLinks.map(l => l.agentId)

      if (brandAgentIds.length === 0) return NextResponse.json([])
      whereClause.brandId = brandId

      // Intersect with any existing assigneeId filter
      if (whereClause.assigneeId) {
        const current = whereClause.assigneeId
        let existing: string[] = []

        if (typeof current === 'string') {
          existing = [current]
        } else if (current && typeof current === 'object') {
          const maybeIn = (current as { in?: unknown }).in
          if (Array.isArray(maybeIn)) {
            existing = maybeIn.filter((id): id is string => typeof id === 'string')
          } else if (typeof maybeIn === 'string') {
            existing = [maybeIn]
          }
        }

        whereClause.assigneeId = { in: existing.filter((id) => brandAgentIds.includes(id)) }
      } else {
        whereClause.assigneeId = { in: brandAgentIds }
      }
    }

    const tasks = await prisma.workUnit.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
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
        }
      },
      ...(limit ? { take: limit, skip: (page - 1) * limit } : {}),
    })
    const tasksWithAvatar = tasks.map((t) => ({
      ...t,
      assignee: t.assignee ? withResolvedAvatar(t.assignee) : null
    }))

    if (limit && page) {
      const totalCount = await prisma.workUnit.count({ where: whereClause })
      return NextResponse.json({
        tasks: tasksWithAvatar,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        }
      })
    }

    return NextResponse.json(tasksWithAvatar)
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)
    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    if (!session?.user && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (apiKey && !authenticatedAgent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const rawBody = await request.json()
    const isArrayBody = Array.isArray(rawBody)
    const isTasksArray = rawBody && Array.isArray(rawBody.tasks)
    
    const tasksInput = isArrayBody ? rawBody : (isTasksArray ? rawBody.tasks : [rawBody])
    const batchBrandId = (!isArrayBody && rawBody && typeof rawBody.brandId === 'string') ? rawBody.brandId.trim() : null

    const createdTasks = []

    for (const taskItem of tasksInput) {
      const { title, description, materials, status, priority, estimatedHours, deadline, tags, weight, blockerTaskIds, type, requiredInput, attachments } = taskItem
      const brandId = taskItem.brandId ? String(taskItem.brandId).trim() : batchBrandId
      let assigneeId = taskItem.assigneeId

      if (!title) {
        return NextResponse.json({ error: 'Title is required for all tasks' }, { status: 400 })
      }

      if (authenticatedAgent) {
        if (assigneeId !== undefined && assigneeId !== authenticatedAgent.id) {
          return NextResponse.json({ error: 'Forbidden: Agents can only assign tasks to themselves' }, { status: 403 })
        }
        assigneeId = authenticatedAgent.id
      } else if (!assigneeId) {
        return NextResponse.json({ error: 'assigneeId is required' }, { status: 400 })
      }

      if (authenticatedAgent && !brandId) {
        const linkedBrandCount = await prisma.brandAgent.count({ where: { agentId: authenticatedAgent.id, active: true } })
        if (linkedBrandCount > 1) {
          return NextResponse.json({ error: 'brandId is required when this agent manages multiple brands' }, { status: 400 })
        }
      }

      if (brandId) {
        const actor = authenticatedAgent
          ? { id: authenticatedAgent.id, type: 'AI_AGENT', role: 'USER' }
          : session?.user
            ? { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
            : null
        if (!actor || !(await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role))) {
          return NextResponse.json({ error: 'Forbidden: You do not have access to this brand' }, { status: 403 })
        }
      }

      if (session?.user && session.user.role !== 'ADMIN') {
        const permissions = await prisma.agentPermission.findMany({
          where: { humanId: session.user.id, agentId: assigneeId }
        })
        if (permissions.length === 0) {
          return NextResponse.json({ error: 'Forbidden: You do not have permission to assign tasks to this agent' }, { status: 403 })
        }
      }

      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, type: true }
      })

      if (!assignee || assignee.type !== 'AI_AGENT') {
        return NextResponse.json({ error: 'Invalid assigneeId: must be an AI_AGENT' }, { status: 400 })
      }

      if (brandId) {
        const link = await prisma.brandAgent.findFirst({
          where: { brandId, agentId: assigneeId, active: true },
          select: { id: true },
        })
        if (!link) {
          return NextResponse.json({ error: 'assigneeId is not linked to this brand' }, { status: 400 })
        }
      }

      let statusVal = status || 'todo'
      let reqInputVal = requiredInput || null
      let tagsList = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : []

      if (type === 'require_input' || rawBody?.type === 'require_input') {
        statusVal = 'pending'
        reqInputVal = description || title || ''
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
          reqInputVal += `\n\nAttachments:\n` + attachments.join('\n')
        }
        if (!tagsList.includes('require_input')) {
          tagsList.push('require_input')
        }
      }

      const validBlockerTaskIds = Array.isArray(blockerTaskIds)
        ? blockerTaskIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        : []

      const newTask = await prisma.workUnit.create({
        data: {
          title,
          description,
          materials,
          status: statusVal,
          weight: normalizeTaskWeight(weight),
          assigneeId,
          priority: priority || 'medium',
          estimatedHours: estimatedHours !== undefined && estimatedHours !== null && estimatedHours !== '' ? Number(estimatedHours) : null,
          deadline: deadline ? new Date(deadline) : null,
          tags: tagsList,
          brandId,
          requiredInput: reqInputVal,
          dependencies: validBlockerTaskIds.length > 0 ? {
            create: validBlockerTaskIds.map((blockerId: string) => ({
              blockerTaskId: blockerId
            }))
          } : undefined
        },
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
        action: 'TASK_CREATED',
        resourceId: newTask.id,
        newValue: newTask,
        metadata: { source: apiKey ? 'api' : 'web' }
      })

      createdTasks.push(newTask)
    }

    eventEmitter.emit('board_update')

    return NextResponse.json(isArrayBody || isTasksArray ? createdTasks : createdTasks[0])
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
