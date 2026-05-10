import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    if (session.user.role !== 'ADMIN') {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id },
        select: { agentId: true }
      })

      const hasPermission = permissions.some(permission => permission.agentId === id)
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const agent = await prisma.user.findUnique({
      where: { id },
      include: {
        tasksAsAssignee: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!agent || agent.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { password, apiKey, ...agentData } = agent
    return NextResponse.json(agentData)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    if (session.user.role !== 'ADMIN') {
      const permissions = await prisma.agentPermission.findMany({
        where: { humanId: session.user.id },
        select: { agentId: true }
      })

      const hasPermission = permissions.some(permission => permission.agentId === id)
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const formData = await request.formData()
    
    // Extract text fields
    const nickname = formData.get('nickname') as string | null
    const introduction = formData.get('introduction') as string | null
    const workflow = formData.get('workflow') as string | null
    const insights = formData.get('insights') as string | null
    const themeColor = formData.get('themeColor') as string | null
    
    const updateData: any = {}
    if (nickname !== null) updateData.nickname = nickname
    if (introduction !== null) updateData.introduction = introduction
    if (workflow !== null) updateData.workflow = workflow
    if (insights !== null) updateData.insights = insights
    if (themeColor !== null) updateData.themeColor = themeColor

    const file = formData.get('avatar') as File | null

    if (file && file.size > 0) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Avatar must be an image file' }, { status: 400 })
      }

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      
      // Enforce 5MB file size limit
      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File too large. Maximum size is 5MB' }, { status: 413 })
      }
      const uploadDir = path.join(process.cwd(), 'public/uploads')

      try {
        await fs.access(uploadDir)
      } catch {
        await fs.mkdir(uploadDir, { recursive: true })
      }

      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const fileName = `${id}-avatar-${Date.now()}.${extension}`
      const filePath = path.join(uploadDir, fileName)

      await fs.writeFile(filePath, buffer)
      updateData.avatar = `/uploads/${fileName}`
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 })
    }

    const agent = await prisma.user.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({ success: true, agent: { id: agent.id, avatar: agent.avatar } })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    if (session.user.role !== 'ADMIN') {
      const permission = await prisma.agentPermission.findFirst({
        where: { 
          humanId: session.user.id,
          agentId: id
        }
      })
      if (!permission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Delete permissions first to satisfy constraints if any
    await prisma.agentPermission.deleteMany({
      where: { agentId: id }
    })

    await prisma.user.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
