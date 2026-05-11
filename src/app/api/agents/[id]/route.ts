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
    let avatarUpdated = false

    if (file && file.size > 0) {
      console.log(`[AVATAR] Processing avatar upload for agent ${id}:`, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      })

      if (!file.type.startsWith('image/')) {
        console.error(`[AVATAR] Invalid file type: ${file.type}`)
        return NextResponse.json({ error: 'Avatar must be an image file' }, { status: 400 })
      }

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      
      // Enforce 5MB file size limit
      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
      if (buffer.length > MAX_FILE_SIZE) {
        console.error(`[AVATAR] File too large: ${buffer.length} bytes`)
        return NextResponse.json({ error: 'File too large. Maximum size is 5MB' }, { status: 413 })
      }
      
      const uploadDir = path.join(process.cwd(), 'public/uploads')
      console.log(`[AVATAR] Upload directory path: ${uploadDir}`)

      // Try to access and create if needed
      try {
        await fs.access(uploadDir)
        console.log(`[AVATAR] Upload directory exists and is accessible`)
      } catch {
        try {
          console.log(`[AVATAR] Creating upload directory...`)
          await fs.mkdir(uploadDir, { recursive: true })
          console.log(`[AVATAR] Upload directory created successfully`)
          // Verify it was created
          await fs.access(uploadDir)
          console.log(`[AVATAR] Upload directory verified as accessible`)
        } catch (mkdirError: any) {
          console.error(`[AVATAR] Failed to create upload directory: ${mkdirError.message}`)
          console.error(`[AVATAR] Error details:`, mkdirError)
          return NextResponse.json({ 
            error: `Cannot create upload directory: ${mkdirError.message}` 
          }, { status: 500 })
        }
      }

      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const fileName = `${id}-avatar-${Date.now()}.${extension}`
      const filePath = path.join(uploadDir, fileName)

      console.log(`[AVATAR] Attempting to write file: ${filePath}`)
      console.log(`[AVATAR] File size: ${buffer.length} bytes`)

      try {
        // Write the file
        await fs.writeFile(filePath, buffer)
        console.log(`[AVATAR] File written successfully`)

        // Verify the file was written
        try {
          const stat = await fs.stat(filePath)
          console.log(`[AVATAR] File verified: ${stat.size} bytes, readable: ${stat.isFile()}`)
        } catch (statError: any) {
          console.error(`[AVATAR] File written but cannot be verified: ${statError.message}`)
        }

        updateData.avatar = `/uploads/${fileName}`
        avatarUpdated = true
        console.log(`[AVATAR] Avatar URL set to: ${updateData.avatar}`)
      } catch (writeError: any) {
        console.error(`[AVATAR] Failed to write file: ${writeError.message}`)
        console.error(`[AVATAR] Error code: ${writeError.code}`)
        console.error(`[AVATAR] Error details:`, writeError)
        
        // Provide more helpful error message
        let userMessage = `File write failed: ${writeError.message}`
        if (writeError.code === 'EACCES') {
          userMessage = 'Permission denied: Cannot write to upload directory'
        } else if (writeError.code === 'ENOSPC') {
          userMessage = 'No space left on device'
        }
        
        return NextResponse.json({ error: userMessage }, { status: 500 })
      }
    }

    if (Object.keys(updateData).length === 0) {
      console.warn(`[AVATAR] No data provided to update for agent ${id}`)
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 })
    }

    console.log(`[AVATAR] Updating agent ${id} with data:`, Object.keys(updateData))
    
    try {
      const agent = await prisma.user.update({
        where: { id },
        data: updateData
      })
      
      console.log(`[AVATAR] Agent updated successfully. Avatar updated: ${avatarUpdated}, new value: ${agent.avatar}`)
      return NextResponse.json({ success: true, agent: { id: agent.id, avatar: agent.avatar } })
    } catch (dbError: any) {
      console.error(`[AVATAR] Database update failed: ${dbError.message}`)
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 })
    }
  } catch (error: any) {
    console.error(`[AVATAR] Unexpected error: ${error.message}`, error)
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 })
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
