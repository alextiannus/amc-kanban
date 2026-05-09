import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import crypto from 'crypto'

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
    
    const body = await request.json()
    const { agentId, nickname, introduction, workflow, themeColor, avatar, insights } = body

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required to identify the agent' }, { status: 400 })
    }

    const email = `${agentId}@agent.amc.local`

    const authenticatedAgent = await getAgentFromApiKey(apiKey)
    const targetAgent = await prisma.user.findUnique({
      where: { email },
      select: { id: true, type: true }
    })

    if (targetAgent) {
      if (!authenticatedAgent || authenticatedAgent.id !== targetAgent.id) {
        return NextResponse.json({ error: 'Forbidden: API key does not match target agent' }, { status: 403 })
      }
      if (targetAgent.type !== 'AI_AGENT') {
        return NextResponse.json({ error: 'Invalid target account type' }, { status: 400 })
      }
    } else if (authenticatedAgent) {
      return NextResponse.json({ error: 'Forbidden: API key already bound to another agent' }, { status: 403 })
    }

    let plaintextApiKey: string | undefined;

    if (!targetAgent && !authenticatedAgent) {
      plaintextApiKey = generateApiKey()
    }

    // Upsert the agent identity
    const upsertData: any = {
      nickname,
      introduction,
      workflow,
      themeColor,
      avatar,
      insights,
    }

    let createData: any = {
      email,
      password: 'ai-agent-no-login',
      type: 'AI_AGENT',
      role: 'USER',
      nickname,
      introduction,
      workflow,
      themeColor,
      avatar,
      insights,
    }

    if (plaintextApiKey) {
      createData.apiKey = crypto.createHash('sha256').update(plaintextApiKey).digest('hex')
    }

    const upsertedAgent = await prisma.user.upsert({
      where: { email },
      update: upsertData,
      create: createData
    })

    let finalAgent = upsertedAgent
    if (!upsertedAgent.apiKey) {
      plaintextApiKey = generateApiKey()
      finalAgent = await prisma.user.update({
        where: { id: upsertedAgent.id },
        data: { apiKey: crypto.createHash('sha256').update(plaintextApiKey).digest('hex') }
      })
    }

    return NextResponse.json({ 
      success: true, 
      agent: { 
        id: finalAgent.id, 
        agentId: agentId, 
        nickname: finalAgent.nickname, 
        introduction: finalAgent.introduction, 
        workflow: finalAgent.workflow, 
        themeColor: finalAgent.themeColor, 
        avatar: finalAgent.avatar, 
        insights: finalAgent.insights, 
        ...(plaintextApiKey && { apiKey: plaintextApiKey }) // Only return plaintext key if newly generated
      } 
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
