import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)
    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    if (!session?.user && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (apiKey && !authenticatedAgent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const agentId = authenticatedAgent ? authenticatedAgent.id : session!.user.id

    const agent = await prisma.user.findUnique({
      where: { id: agentId }
    })

    if (!agent || agent.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Not an AI Agent' }, { status: 403 })
    }

    const { password, apiKey: key, ...data } = agent
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)
    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    if (!session?.user && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (apiKey && !authenticatedAgent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const agentId = authenticatedAgent ? authenticatedAgent.id : session!.user.id

    const agent = await prisma.user.findUnique({
      where: { id: agentId }
    })

    if (!agent || agent.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Not an AI Agent' }, { status: 403 })
    }

    const body = await request.json()
    const { insights, nickname, introduction, workflow, themeColor } = body

    const data: any = {}
    if (insights !== undefined) data.insights = insights
    if (nickname !== undefined) data.nickname = nickname
    if (introduction !== undefined) data.introduction = introduction
    if (workflow !== undefined) data.workflow = workflow
    if (themeColor !== undefined) data.themeColor = themeColor

    const updatedAgent = await prisma.user.update({
      where: { id: agentId },
      data
    })

    const { password, apiKey: key, ...result } = updatedAgent
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
