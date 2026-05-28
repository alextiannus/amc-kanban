import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

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
    const updatedAgent = await prisma.user.update({
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

