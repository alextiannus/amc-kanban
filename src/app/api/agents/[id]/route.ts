import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    if (session.user.role !== 'ADMIN') {
      const permission = await prisma.agentPermission.findFirst({
        where: { humanId: session.user.id, agentId: id }
      })
      if (!permission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const agent = await prisma.user.findUnique({
      where: { id },
      include: {
        tasksAsAssignee: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!agent || agent.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { password, ...agentData } = agent
    return NextResponse.json(agentData)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
