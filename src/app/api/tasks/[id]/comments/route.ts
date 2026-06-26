import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { eventEmitter } from '@/lib/events'
import { actorFromContext, writeAuditLog } from '@/lib/audit'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

async function canHumanAccessTask(humanId: string, assigneeId: string | null) {
  const permissions = await prisma.agentPermission.findMany({
    where: { humanId },
    select: { agentId: true }
  })

  if (permissions.length === 0) {
    return false
  }

  if (!assigneeId) {
    return false
  }

  return permissions.some((permission: any) => permission.agentId === assigneeId)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    const apiKey = extractApiKey(request)

    if (!session?.user && !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const task = await prisma.workUnit.findUnique({
      where: { id },
      select: { assigneeId: true, brandId: true }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    let isAuthorized = false
    if (session?.user.role === 'ADMIN') {
      isAuthorized = true
    } else if (apiKey) {
      const authenticatedAgent = await getAgentFromApiKey(apiKey)
      isAuthorized = Boolean(authenticatedAgent && authenticatedAgent.id === task.assigneeId)
    } else if (session?.user.id) {
      isAuthorized = await canHumanAccessTask(session.user.id, task.assigneeId ?? null)
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (task.brandId) {
      if (apiKey) {
        const authenticatedAgent = await getAgentFromApiKey(apiKey)
        const ok = authenticatedAgent
          ? await canSessionAccessBrandProject(task.brandId, authenticatedAgent.id, 'AI_AGENT', 'USER')
          : false
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      } else if (session?.user) {
        const ok = await canSessionAccessBrandProject(
          task.brandId,
          session.user.id,
          session.user.type ?? 'HUMAN',
          session.user.role
        )
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            nickname: true,
            type: true,
            themeColor: true,
            ...avatarSelect
          }
        }
      }
    })

    const commentsWithAvatars = comments.map((c: any) => ({
      ...c,
      author: c.author ? withResolvedAvatar(c.author) : null
    }))

    return NextResponse.json(commentsWithAvatars)
  } catch (error) {
    console.error('Comments GET error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    const task = await prisma.workUnit.findUnique({
      where: { id },
      select: { assigneeId: true, brandId: true }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    let isAuthorized = false
    let authorId = ''

    if (session?.user.role === 'ADMIN') {
      isAuthorized = true
      authorId = session.user.id
    } else if (authenticatedAgent) {
      isAuthorized = authenticatedAgent.id === task.assigneeId
      authorId = authenticatedAgent.id
    } else if (session?.user.id) {
      isAuthorized = await canHumanAccessTask(session.user.id, task.assigneeId ?? null)
      authorId = session.user.id
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (task.brandId) {
      if (authenticatedAgent) {
        const ok = await canSessionAccessBrandProject(task.brandId, authenticatedAgent.id, 'AI_AGENT', 'USER')
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      } else if (session?.user) {
        const ok = await canSessionAccessBrandProject(
          task.brandId,
          session.user.id,
          session.user.type ?? 'HUMAN',
          session.user.role
        )
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { content } = body

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    const comment = await prisma.comment.create({
      data: {
        taskId: id,
        authorId,
        content: content.trim()
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            nickname: true,
            type: true,
            themeColor: true,
            ...avatarSelect
          }
        }
      }
    })

    const commentWithAvatar = {
      ...comment,
      author: comment.author ? withResolvedAvatar(comment.author) : null
    }

    await writeAuditLog({
      actor: actorFromContext(session?.user, authenticatedAgent),
      action: 'TASK_COMMENT_ADDED',
      resourceId: id,
      newValue: commentWithAvatar,
      metadata: { commentId: comment.id, source: apiKey ? 'api' : 'web' }
    })

    eventEmitter.emit('board_update')

    return NextResponse.json(commentWithAvatar)
  } catch (error) {
    console.error('Comment POST error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
