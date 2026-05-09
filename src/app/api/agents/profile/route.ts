import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyApiKey } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const isApiKeyValid = verifyApiKey(request)

    if (!isApiKeyValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { agentId, nickname, introduction, workflow, themeColor, avatar, insights } = body

    const singleAgentMode = process.env.AI_SINGLE_AGENT_MODE !== 'false'
    const canonicalAgentId = process.env.AI_SINGLE_AGENT_ID || 'amc-main'

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required to identify the agent' }, { status: 400 })
    }

    const resolvedAgentId = singleAgentMode ? canonicalAgentId : agentId
    const email = `${resolvedAgentId}@agent.amc.local`

    // Upsert the agent identity. In single-agent mode we always reuse the same account.
    const agent = await prisma.user.upsert({
      where: { email },
      update: {
        nickname,
        introduction,
        workflow,
        themeColor,
        avatar,
        insights,
      },
      create: {
        email,
        password: 'ai-agent-no-login', // Dummy password
        type: 'AI_AGENT',
        role: 'USER',
        nickname,
        introduction,
        workflow,
        themeColor,
        avatar,
        insights,
      }
    })

    if (singleAgentMode) {
      const duplicateAgents = await prisma.user.findMany({
        where: {
          type: 'AI_AGENT',
          id: { not: agent.id }
        },
        select: { id: true }
      })

      const duplicateIds = duplicateAgents.map(item => item.id)

      if (duplicateIds.length > 0) {
        const duplicatePermissions = await prisma.agentPermission.findMany({
          where: { agentId: { in: duplicateIds } },
          select: { humanId: true }
        })

        const uniqueHumanIds = Array.from(new Set(duplicatePermissions.map(item => item.humanId)))

        await prisma.$transaction(async (tx) => {
          if (uniqueHumanIds.length > 0) {
            await tx.agentPermission.createMany({
              data: uniqueHumanIds.map(humanId => ({ humanId, agentId: agent.id })),
              skipDuplicates: true
            })
          }

          await tx.workUnit.updateMany({
            where: { assigneeId: { in: duplicateIds } },
            data: { assigneeId: agent.id }
          })

          await tx.agentPermission.deleteMany({
            where: { agentId: { in: duplicateIds } }
          })

          await tx.user.deleteMany({
            where: { id: { in: duplicateIds } }
          })
        })
      }
    }

    return NextResponse.json({ success: true, agent: { id: agent.id, agentId: resolvedAgentId, nickname: agent.nickname, introduction: agent.introduction, workflow: agent.workflow, themeColor: agent.themeColor, avatar: agent.avatar, insights: agent.insights } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
