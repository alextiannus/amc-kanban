import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'

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
          select: { id: true, email: true, type: true }
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

    return NextResponse.json(task)
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
    const { title, description, materials, assigneeId } = body

    if (authenticatedAgent && assigneeId !== undefined && assigneeId !== authenticatedAgent.id) {
      return NextResponse.json({ error: 'Forbidden: API key cannot reassign task to another agent' }, { status: 403 })
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

    const data: any = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (materials !== undefined) data.materials = materials
    if (assigneeId !== undefined) data.assigneeId = assigneeId

    const updatedTask = await prisma.workUnit.update({
      where: { id },
      data
    })

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error('Task detail PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
