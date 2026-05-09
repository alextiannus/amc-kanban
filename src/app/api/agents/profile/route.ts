import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'

// Generate a unique API key for the agent
function generateApiKey(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 15)
  return `agent_key_${timestamp}_${random}`
}

export async function POST(request: Request) {
  try {
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized: Bearer token required' }, { status: 401 })
    }
    
    // For first-time registration: accept any bearer token
    // For updates: verify API key belongs to existing agent
    const existingAgent = await getAgentFromApiKey(apiKey)
    
    const body = await request.json()
    const { agentId, nickname, introduction, workflow, themeColor, avatar, insights } = body

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required to identify the agent' }, { status: 400 })
    }

    const singleAgentMode = process.env.AI_SINGLE_AGENT_MODE === 'true'
    const canonicalAgentId = process.env.AI_SINGLE_AGENT_ID || 'amc-main'
    const resolvedAgentId = singleAgentMode ? canonicalAgentId : agentId
    const email = `${resolvedAgentId}@agent.amc.local`

    // Upsert the agent identity. In single-agent mode we always reuse the same account.
    const upsertedAgent = await prisma.user.upsert({
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
        apiKey: generateApiKey(), // Generate unique API key for new agent
      }
    })

    // If agent didn't have an API key, generate one now
    let finalAgent = upsertedAgent
    if (!upsertedAgent.apiKey) {
      finalAgent = await prisma.user.update({
        where: { id: upsertedAgent.id },
        data: { apiKey: generateApiKey() }
      })
    }

    if (singleAgentMode) {
      const duplicateAgents = await prisma.user.findMany({
        where: {
          type: 'AI_AGENT',
          id: { not: finalAgent.id }
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
              data: uniqueHumanIds.map(humanId => ({ humanId, agentId: finalAgent.id })),
              skipDuplicates: true
            })
          }

          await tx.workUnit.updateMany({
            where: { assigneeId: { in: duplicateIds } },
            data: { assigneeId: finalAgent.id }
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

    return NextResponse.json({ success: true, agent: { id: finalAgent.id, agentId: resolvedAgentId, nickname: finalAgent.nickname, introduction: finalAgent.introduction, workflow: finalAgent.workflow, themeColor: finalAgent.themeColor, avatar: finalAgent.avatar, insights: finalAgent.insights, apiKey: finalAgent.apiKey } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
