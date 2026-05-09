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
    const { agentId, introduction, workflow, themeColor, avatar, insights } = body

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required to identify the agent' }, { status: 400 })
    }

    const email = `${agentId}@agent.amc.local`

    // Upsert the agent
    const agent = await prisma.user.upsert({
      where: { email },
      update: {
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
        introduction,
        workflow,
        themeColor,
        avatar,
        insights,
      }
    })

    return NextResponse.json({ success: true, agent: { id: agent.id, email: agent.email, introduction: agent.introduction, workflow: agent.workflow, themeColor: agent.themeColor, avatar: agent.avatar, insights: agent.insights } })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
