import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'

function buildAgentProfileResponse(agent: {
  id: string
  nickname: string | null
  introduction: string | null
  workflow: string | null
  themeColor: string | null
  avatar: string | null
  insights: string | null
  avatarData?: Buffer | Uint8Array | null
  avatarMimeType?: string | null
}) {
  const resolvedAgent = withResolvedAvatar(agent)

  return {
    success: true,
    agent: {
      id: resolvedAgent.id,
      agentId: resolvedAgent.id,
      nickname: resolvedAgent.nickname,
      introduction: resolvedAgent.introduction,
      workflow: resolvedAgent.workflow,
      themeColor: resolvedAgent.themeColor,
      avatar: resolvedAgent.avatar,
      insights: resolvedAgent.insights,
    },
  }
}

export async function GET(request: Request) {
  const apiKey = extractApiKey(request)
  if (!apiKey) {
    return NextResponse.json({ error: 'Unauthorized: Bearer token required' }, { status: 401 })
  }

  const authenticatedAgent = await getAgentFromApiKey(apiKey)
  if (!authenticatedAgent) {
    return NextResponse.json(
      { error: 'Invalid API key. Please use a valid key generated from the AI Marketing Crew dashboard.' },
      { status: 401 }
    )
  }

  const agent = await prisma.user.findUnique({
    where: { id: authenticatedAgent.id },
    select: {
      id: true,
      nickname: true,
      introduction: true,
      workflow: true,
      themeColor: true,
      insights: true,
      ...avatarSelect,
    },
  })

  if (!agent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(buildAgentProfileResponse(agent))
}

export async function POST(request: Request) {
  try {
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized: Bearer token required' }, { status: 401 })
    }
    
    const authenticatedAgent = await getAgentFromApiKey(apiKey)
    if (!authenticatedAgent) {
      return NextResponse.json({ error: 'Invalid API key. Please use a valid key generated from the AI Marketing Crew dashboard.' }, { status: 401 })
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

    let finalAvatar = avatar

    if (avatar) {
      if (avatar.startsWith('data:image/')) {
        const matches = avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
        if (matches && matches.length === 3) {
          const type = matches[1]
          const buffer = Buffer.from(matches[2], 'base64')
          const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
          const fileName = `${authenticatedAgent.id}-avatar-${Date.now()}.${extension}`
          const uploadDir = path.join(process.cwd(), 'public/uploads')
          
          try {
            await fs.access(uploadDir)
          } catch {
            await fs.mkdir(uploadDir, { recursive: true })
          }
          
          const filePath = path.join(uploadDir, fileName)
          await fs.writeFile(filePath, buffer)
          finalAvatar = `/uploads/${fileName}`
        }
      } else if (avatar.startsWith('http') && !avatar.includes('amc-kanban.immedi.ai')) {
        try {
          const res = await fetch(avatar)
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            
            const contentType = res.headers.get('content-type') || 'image/png'
            const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png'
            
            const fileName = `${authenticatedAgent.id}-avatar-${Date.now()}.${extension}`
            const uploadDir = path.join(process.cwd(), 'public/uploads')
            
            try {
              await fs.access(uploadDir)
            } catch {
              await fs.mkdir(uploadDir, { recursive: true })
            }
            
            const filePath = path.join(uploadDir, fileName)
            await fs.writeFile(filePath, buffer)
            finalAvatar = `/uploads/${fileName}`
          }
        } catch (fetchError) {
          console.error('Failed to download avatar from URL:', fetchError)
        }
      }
    }

    // Update the pre-provisioned agent with its new identity
    await prisma.user.update({
      where: { id: authenticatedAgent.id },
      data: {
        email,
        nickname,
        introduction,
        workflow,
        themeColor,
        avatar: finalAvatar,
        insights,
      }
    })

    const refreshedAgent = await prisma.user.findUnique({
      where: { id: authenticatedAgent.id },
      select: {
        id: true,
        nickname: true,
        introduction: true,
        workflow: true,
        themeColor: true,
        insights: true,
        ...avatarSelect,
      },
    })

    if (!refreshedAgent) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(buildAgentProfileResponse(refreshedAgent))
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

