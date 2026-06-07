import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')

    let permittedAgentIds: string[] = []

    if (session.user.role === 'ADMIN') {
      const allAgents = await prisma.user.findMany({
        where: { type: 'AI_AGENT' }
      })
      permittedAgentIds = allAgents.map(a => a.id)
    } else {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id }
      })
      permittedAgentIds = permissions.map(p => p.agentId)
    }

    if (brandId) {
      const brandLinks = await prisma.brandAgent.findMany({
        where: { brandId, active: true },
        select: { agentId: true },
      })
      const brandAgentIds = brandLinks.map(l => l.agentId)
      permittedAgentIds = permittedAgentIds.filter(id => brandAgentIds.includes(id))
    }

    if (permittedAgentIds.length === 0) {
      return NextResponse.json({
        collaborativeAgentsCount: 0,
        runningAgentsCount: 0,
        notRunningAgentsCount: 0,
        pendingTasksCount: 0,
        completedTasksCount: 0
      })
    }

    // Calculate Online / Offline agents
    // An agent is considered online if they have tasks in 'todo', 'in_progress', or 'pending' state
    const activeTasksCountByAgent = await prisma.workUnit.groupBy({
      by: ['assigneeId'],
      where: {
        assigneeId: { in: permittedAgentIds },
        status: { in: ['todo', 'in_progress', 'pending'] }
      },
      _count: {
        id: true
      }
    })

    const runningAgentIds = activeTasksCountByAgent.map(item => item.assigneeId)
    const collaborativeAgentsCount = permittedAgentIds.length
    const runningAgentsCount = runningAgentIds.length
    const notRunningAgentsCount = permittedAgentIds.length - runningAgentsCount

    // 3. How many tasks pending for input
    const pendingTasksCount = await prisma.workUnit.count({
      where: {
        assigneeId: { in: permittedAgentIds },
        status: 'pending'
      }
    })

    // 4. How many tasks completed
    const completedTasksCount = await prisma.workUnit.count({
      where: {
        assigneeId: { in: permittedAgentIds },
        status: 'done'
      }
    })

    return NextResponse.json({
      collaborativeAgentsCount,
      runningAgentsCount,
      notRunningAgentsCount,
      pendingTasksCount,
      completedTasksCount
    })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
