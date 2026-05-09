import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  
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

    let whereClause: any = status ? { status } : {}

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
      }
    }

    const tasks = await prisma.workUnit.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { assignee: true }
    })
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
    const { title, description, materials, status, assigneeId } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (!assigneeId) {
      return NextResponse.json({ error: 'assigneeId is required' }, { status: 400 })
    }

    if (authenticatedAgent && assigneeId !== authenticatedAgent.id) {
      return NextResponse.json({ error: 'Forbidden: API key can only create tasks for its own agent' }, { status: 403 })
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
        assigneeId
      }
    })

    return NextResponse.json(newTask)
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
