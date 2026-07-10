import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

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

    if (!agent || agent.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'User profile not available' }, { status: 403 })
    }

    return NextResponse.json({
      id: agent.id,
      email: agent.email,
      type: agent.type,
      role: agent.role,
      nickname: agent.nickname,
      insights: agent.insights,
      introduction: agent.introduction,
      workflow: agent.workflow,
      themeColor: agent.themeColor,
      avatar: agent.avatar,
      avatarData: agent.avatarData,
      avatarMimeType: agent.avatarMimeType,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      driveFolder: agent.driveFolder,
      chatLink: agent.chatLink,
    })
  } catch {
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

    if (!agent || agent.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'User profile not available' }, { status: 403 })
    }

    const body = await request.json()
    const { insights, nickname, introduction, workflow, themeColor } = body

    const data: Prisma.UserUpdateInput = {}
    if (insights !== undefined) data.insights = insights
    if (nickname !== undefined) data.nickname = nickname
    if (introduction !== undefined) data.introduction = introduction
    if (workflow !== undefined) data.workflow = workflow
    if (themeColor !== undefined) data.themeColor = themeColor

    const updatedAgent = await prisma.user.update({
      where: { id: agentId },
      data
    })

    return NextResponse.json({
      id: updatedAgent.id,
      email: updatedAgent.email,
      type: updatedAgent.type,
      role: updatedAgent.role,
      nickname: updatedAgent.nickname,
      insights: updatedAgent.insights,
      introduction: updatedAgent.introduction,
      workflow: updatedAgent.workflow,
      themeColor: updatedAgent.themeColor,
      avatar: updatedAgent.avatar,
      avatarData: updatedAgent.avatarData,
      avatarMimeType: updatedAgent.avatarMimeType,
      createdAt: updatedAgent.createdAt,
      updatedAt: updatedAgent.updatedAt,
      driveFolder: updatedAgent.driveFolder,
      chatLink: updatedAgent.chatLink,
    })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
