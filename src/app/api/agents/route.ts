import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let whereClause: any = { type: 'AI_AGENT' }

    if (session.user.role !== 'ADMIN') {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id }
      })
      const permittedAgentIds = permissions.map(p => p.agentId)

      if (permittedAgentIds.length > 0) {
        whereClause = {
          ...whereClause,
          id: { in: permittedAgentIds }
        }
      } else {
        return NextResponse.json([])
      }
    }

    const agents = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        nickname: true,
        email: true,
        apiKey: true,
        insights: true,
        introduction: true,
        workflow: true,
        themeColor: true,
        ...avatarSelect,
        createdAt: true,
        tasksAsAssignee: {
          where: {
            status: { in: ['todo', 'in_progress', 'pending'] }
          },
          select: { id: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Convert avatar data to data URI and format response
    const formattedAgents = agents.map((agent: any) => {
      const { tasksAsAssignee, ...rest } = agent
      return {
        ...withResolvedAvatar(rest),
        isOnline: tasksAsAssignee.length > 0,
      }
    })

    return NextResponse.json(formattedAgents)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
