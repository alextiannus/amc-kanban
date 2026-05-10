import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized: Bearer token required' }, { status: 401 })
    }
    
    const authenticatedAgent = await getAgentFromApiKey(apiKey)
    if (!authenticatedAgent) {
      return NextResponse.json({ error: 'Invalid API key. Please use a valid key generated from the AMC Kanban dashboard.' }, { status: 401 })
    }

    const body = await request.json()
    const { agentId, nickname, introduction, workflow, themeColor, avatar, insights } = body

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required to identify the agent' }, { status: 400 })
    }

    const email = `${agentId}@agent.amc.local`

    // Check if the requested agentId is already taken by another agent
    const existingAgent = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    })

    if (existingAgent && existingAgent.id !== authenticatedAgent.id) {
      return NextResponse.json({ error: 'Conflict: The requested agentId is already taken by another agent. Please choose a different agentId.' }, { status: 409 })
    }

    // Update the pre-provisioned agent with its new identity
    const updatedAgent = await prisma.user.update({
      where: { id: authenticatedAgent.id },
      data: {
        email,
        nickname,
        introduction,
        workflow,
        themeColor,
        avatar,
        insights,
      }
    })

    return NextResponse.json({ 
      success: true, 
      agent: { 
        id: updatedAgent.id, 
        agentId: agentId, 
        nickname: updatedAgent.nickname, 
        introduction: updatedAgent.introduction, 
        workflow: updatedAgent.workflow, 
        themeColor: updatedAgent.themeColor, 
        avatar: updatedAgent.avatar, 
        insights: updatedAgent.insights
      } 
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

