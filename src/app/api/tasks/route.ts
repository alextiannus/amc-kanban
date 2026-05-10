import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'
import { actorFromContext, writeAuditLog } from '@/lib/audit'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const active = searchParams.get('active')
  const archive = searchParams.get('archive')
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
      whereClause = {
        ...whereClause,
        assigneeId: authenticatedAgent.id
      }
    } else if (session!.user.role !== 'ADMIN') {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id }
      })
      const permittedAgentIds = permissions.map(p => p.agentId)

      if (permittedAgentIds.length > 0) {
        whereClause = {
          ...whereClause,
          assigneeId: { in: permittedAgentIds }
        }
      } else {
        return NextResponse.json([])
      }
    }

    const queryOptions: any = {
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { assignee: true }
    }

    if (limit) {
      queryOptions.take = limit
      queryOptions.skip = (page - 1) * limit
    }

    const tasks = await prisma.workUnit.findMany(queryOptions)

    if (limit && page) {
      const totalCount = await prisma.workUnit.count({ where: whereClause })
      return NextResponse.json({
        tasks,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        }
      })
    }

    return NextResponse.json(tasks)
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
    const { title, description, materials, status, assigneeId, priority, estimatedHours, deadline, tags } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (!assigneeId) {
      return NextResponse.json({ error: 'assigneeId is required' }, { status: 400 })
    }

    if (authenticatedAgent && assigneeId !== authenticatedAgent.id) {
      return NextResponse.json({ error: 'Forbidden: API key can only create tasks for its own agent' }, { status: 403 })
    } else if (session?.user && session.user.role !== 'ADMIN') {
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

    const newTask = await prisma.workUnit.create({
      data: {
        title,
        description,
        materials,
        status: status || 'todo',
        assigneeId,
        priority: priority || 'medium',
        estimatedHours: estimatedHours !== undefined && estimatedHours !== null && estimatedHours !== '' ? Number(estimatedHours) : null,
        deadline: deadline ? new Date(deadline) : null,
        tags: Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : []
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
