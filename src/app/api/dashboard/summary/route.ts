import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const singleAgentMode = process.env.AI_SINGLE_AGENT_MODE === 'true'
    const canonicalAgentId = process.env.AI_SINGLE_AGENT_ID || 'amc-main'

    let permittedAgentIds: string[] = []

    if (session.user.role === 'ADMIN') {
      const allAgents = await prisma.user.findMany({
        where: singleAgentMode
          ? { type: 'AI_AGENT', email: `${canonicalAgentId}@agent.amc.local` }
          : { type: 'AI_AGENT' }
      })
      permittedAgentIds = allAgents.map(a => a.id)
    } else {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id }
      })
      permittedAgentIds = permissions.map(p => p.agentId)

      if (permittedAgentIds.length === 0) {
        const allAgents = await prisma.user.findMany({
          where: singleAgentMode
            ? { type: 'AI_AGENT', email: `${canonicalAgentId}@agent.amc.local` }
            : { type: 'AI_AGENT' },
          select: { id: true }
        })
        permittedAgentIds = allAgents.map(a => a.id)
      }
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
      runningAgentsCount,
      notRunningAgentsCount,
      pendingTasksCount,
      completedTasksCount
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
