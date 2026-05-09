import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, verifyApiKey } from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  
  try {
    const session = await getSession()
    const isApiKeyValid = verifyApiKey(request)

    if (!session?.user && !isApiKeyValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let whereClause: any = status ? { status } : {}

    if (!isApiKeyValid && session!.user.role !== 'ADMIN') {
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
    const isApiKeyValid = verifyApiKey(request)

    if (!session?.user && !isApiKeyValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, materials, status, assigneeId } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
