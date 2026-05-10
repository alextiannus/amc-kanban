import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'

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
    const { status, requiredInput } = await request.json()

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 })
    }

    // Check authorization
    const task = await prisma.workUnit.findUnique({ where: { id } })
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    let isAuthorized = false
    if (session?.user.role === 'ADMIN') {
      isAuthorized = true
    } else if (apiKey) {
      const agent = await getAgentFromApiKey(apiKey)
      isAuthorized = Boolean(agent && agent.id === task.assigneeId)
    } else if (session?.user.id) {
      isAuthorized = session.user.role === 'ADMIN'
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: Only task assignee or admin can update status' }, { status: 403 })
    }

    const data: any = { status }
    
    // Specifically handle requiredInput, allowing null to clear it
    if (requiredInput !== undefined) {
      data.requiredInput = requiredInput
    }

    const updatedTask = await prisma.workUnit.update({
      where: { id },
      data
    })

    eventEmitter.emit('board_update')

    return NextResponse.json(updatedTask)
  } catch (error) {
    console.error('Task status PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
