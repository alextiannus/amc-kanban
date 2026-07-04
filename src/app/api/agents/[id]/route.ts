import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'
import type { Prisma } from '@prisma/client'
import crypto from 'crypto'

const DISMISSED_AGENT_TYPE = 'DISMISSED_AGENT'

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

      const hasPermission = permissions.some((permission: any) => permission.agentId === id)
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const agent = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        nickname: true,
        email: true,
        insights: true,
        introduction: true,
        workflow: true,
        themeColor: true,
        ...avatarSelect,
        tasksAsAssignee: {
          orderBy: { createdAt: 'desc' }
        }
      },
    })

    if (!agent || agent.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json(withResolvedAvatar(agent))
  } catch {
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

      const hasPermission = permissions.some((permission: any) => permission.agentId === id)
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
    
    const updateData: Prisma.UserUpdateInput = {}
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

      try {
        // Store directly in database as binary data
        updateData.avatarData = buffer
        updateData.avatarMimeType = file.type
        avatarUpdated = true
        
        console.log(`[AVATAR] Avatar will be stored in database: ${file.type}, ${buffer.length} bytes`)
      } catch (bufferError: unknown) {
        const message = bufferError instanceof Error ? bufferError.message : 'Unknown buffer processing error'
        console.error(`[AVATAR] Failed to process buffer: ${message}`)
        return NextResponse.json({ error: `Buffer processing failed: ${message}` }, { status: 500 })
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
      
      // Build data URI from stored binary data for response
      const updatedAgent = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          ...avatarSelect,
        },
      })
      const avatarUrl = updatedAgent ? withResolvedAvatar(updatedAgent).avatar : null
      console.log(`[AVATAR] Agent updated successfully. Avatar updated: ${avatarUpdated}`)
      return NextResponse.json({ success: true, agent: { id: agent.id, avatar: avatarUrl } })
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : 'Unknown database error'
      console.error(`[AVATAR] Database update failed: ${message}`)
      return NextResponse.json({ error: `Database error: ${message}` }, { status: 500 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[AVATAR] Unexpected error: ${message}`, error)
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 })
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

    const agent = await prisma.user.findUnique({
      where: { id },
      select: { id: true, type: true, email: true, nickname: true }
    })
    if (!agent || agent.type !== 'AI_AGENT') {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

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

    const dismissedAt = new Date()
    const dismissedEmail = `dismissed-${id}-${crypto.randomUUID()}@agent.amc.local`
    const dismissedPassword = `dismissed-${crypto.randomUUID()}`

    const result = await prisma.$transaction(async (tx: any) => {
      const [permissions, brandAgents, assignmentPoolMembers, openTasks, fallbackConfigs, drafts, actionItems] = await Promise.all([
        tx.agentPermission.deleteMany({ where: { agentId: id } }),
        tx.brandAgent.updateMany({ where: { agentId: id, active: true }, data: { active: false } }),
        tx.assignmentPoolMember.deleteMany({ where: { agentId: id } }),
        tx.workUnit.updateMany({
          where: {
            assigneeId: id,
            status: { in: ['todo', 'in_progress', 'pending'] },
          },
          data: { assigneeId: null },
        }),
        tx.assignmentPoolConfig.updateMany({
          where: { fallbackAgentId: id },
          data: { fallbackAgentId: null },
        }),
        tx.contentDraft.updateMany({ where: { agentId: id }, data: { agentId: null } }),
        tx.actionItem.updateMany({ where: { agentId: id }, data: { agentId: null } }),
      ])

      await tx.user.update({
        where: { id },
        data: {
          type: DISMISSED_AGENT_TYPE,
          email: dismissedEmail,
          password: dismissedPassword,
          apiKey: null,
          nickname: agent.nickname ? `${agent.nickname}（已遣散）` : '已遣散 Agent',
        },
      })

      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          actorType: 'HUMAN',
          actorName: session.user.email || null,
          action: 'AGENT_DISMISSED',
          resourceId: id,
          resourceType: 'User',
          oldValue: {
            id: agent.id,
            email: agent.email,
            nickname: agent.nickname,
            type: agent.type,
          },
          newValue: {
            type: DISMISSED_AGENT_TYPE,
            dismissedAt: dismissedAt.toISOString(),
          },
          metadata: {
            permissionsRemoved: permissions.count,
            brandAgentsDeactivated: brandAgents.count,
            assignmentPoolMembersRemoved: assignmentPoolMembers.count,
            openTasksUnassigned: openTasks.count,
            fallbackConfigsCleared: fallbackConfigs.count,
            draftsDetached: drafts.count,
            actionItemsDetached: actionItems.count,
          },
        },
      })

      return {
        permissionsRemoved: permissions.count,
        brandAgentsDeactivated: brandAgents.count,
        assignmentPoolMembersRemoved: assignmentPoolMembers.count,
        openTasksUnassigned: openTasks.count,
        fallbackConfigsCleared: fallbackConfigs.count,
        draftsDetached: drafts.count,
        actionItemsDetached: actionItems.count,
      }
    })

    return NextResponse.json({ success: true, dismissed: true, cleanup: result })
  } catch (error) {
    console.error('[DELETE /api/agents/:id] Failed to dismiss agent:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
