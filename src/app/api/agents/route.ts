import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

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
        avatar: true,
        avatarData: true,
        avatarMimeType: true,
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

    // Convert avatar data to data URI
    const agentsWithDataUri = agents.map((agent: any) => {
      let avatarUrl = agent.avatar
      
      // If we have binary avatar data in DB, convert to data URI
      if (agent.avatarData && agent.avatarMimeType) {
        const base64 = agent.avatarData.toString('base64')
        avatarUrl = `data:${agent.avatarMimeType};base64,${base64}`
      }

      // Remove the raw binary data from response (too large)
      const { avatarData, avatarMimeType, ...rest } = agent
      return {
        ...rest,
        avatar: avatarUrl
      }
    })

    const formattedAgents = agents.map(agent => ({
      ...agent,
      isOnline: agent.tasksAsAssignee.length > 0,
      tasksAsAssignee: undefined // don't expose tasks array
    }))

    return NextResponse.json(formattedAgents)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
