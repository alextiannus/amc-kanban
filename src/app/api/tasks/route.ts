import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'
import { actorFromContext, writeAuditLog } from '@/lib/audit'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'

function normalizeTaskWeight(input: unknown): number {
  const parsed = Number(input)
  if ([1, 3, 5].includes(parsed)) return parsed
  return 3
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

    let whereClause: any = {}
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
      const brandLinks = await prisma.brandAgent.findMany({
        where: { brandId, active: true },
        select: { agentId: true },
      })
      const brandAgentIds = brandLinks.map(l => l.agentId)

      if (brandAgentIds.length === 0) return NextResponse.json([])

      // Intersect with any existing assigneeId filter
      if (whereClause.assigneeId) {
        const existing = Array.isArray(whereClause.assigneeId.in)
          ? whereClause.assigneeId.in
          : [whereClause.assigneeId]
        whereClause.assigneeId = { in: existing.filter((id: string) => brandAgentIds.includes(id)) }
      } else {
        whereClause.assigneeId = { in: brandAgentIds }
      }
    }

    const queryOptions: any = {
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
      }
    }

    if (limit) {
      queryOptions.take = limit
      queryOptions.skip = (page - 1) * limit
    }

    const tasks = await prisma.workUnit.findMany(queryOptions)
    const tasksWithAvatar = tasks.map((t: any) => ({
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
  } catch (error) {
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

    const body = await request.json()
    let { title, description, materials, status, assigneeId, priority, estimatedHours, deadline, tags, weight, blockerTaskIds } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // If authenticated as Agent via API key, check if assigneeId is set and matches
    if (authenticatedAgent) {
      if (assigneeId !== undefined && assigneeId !== authenticatedAgent.id) {
        return NextResponse.json({ error: 'Forbidden: Agents can only assign tasks to themselves' }, { status: 403 })
      }
      assigneeId = authenticatedAgent.id
    } else if (!assigneeId) {
      return NextResponse.json({ error: 'assigneeId is required' }, { status: 400 })
    }

    // Check permissions: Human users can only create tasks for permitted agents
    if (session?.user && session.user.role !== 'ADMIN') {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id, agentId: assigneeId }
      })
      if (permissions.length === 0) {
        return NextResponse.json({ error: 'Forbidden: You do not have permission to assign tasks to this agent' }, { status: 403 })
      }
    }

    // Verify assignee exists and is an AI_AGENT
    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, type: true }
    })

    if (!assignee || assignee.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Invalid assigneeId: must be an AI_AGENT' }, { status: 400 })
    }

    const validBlockerTaskIds = Array.isArray(blockerTaskIds)
      ? blockerTaskIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      : []

    const newTask = await prisma.workUnit.create({
      data: {
        title,
        description,
        materials,
        status: status || 'todo',
        weight: normalizeTaskWeight(weight),
        assigneeId,
        priority: priority || 'medium',
        estimatedHours: estimatedHours !== undefined && estimatedHours !== null && estimatedHours !== '' ? Number(estimatedHours) : null,
        deadline: deadline ? new Date(deadline) : null,
        tags: Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [],
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

    eventEmitter.emit('board_update')

    return NextResponse.json(newTask)
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
