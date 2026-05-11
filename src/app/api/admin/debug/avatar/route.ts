import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'

/**
 * Debug endpoint for avatar upload issues
 * GET /api/admin/debug/avatar?agentId=xxx
 */
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const agentId = url.searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json({ error: 'agentId parameter required' }, { status: 400 })
    }

    // Check database
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, nickname: true, email: true, avatar: true }
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Check file system
    const uploadDir = path.join(process.cwd(), 'public/uploads')
    const files = await fs.readdir(uploadDir)
    const avatarFiles = files.filter(f => f.startsWith(`${agentId}-avatar-`))

    // Check if avatar URL is accessible
    let avatarAccessible = false
    if (agent.avatar) {
      try {
        const avatarPath = path.join(process.cwd(), 'public', agent.avatar)
        await fs.access(avatarPath)
        avatarAccessible = true
      } catch (e) {
        avatarAccessible = false
      }
    }

    return NextResponse.json({
      debug: {
        agent: {
          id: agent.id,
          nickname: agent.nickname,
          email: agent.email,
          avatar: agent.avatar,
          avatarExists: avatarAccessible
        },
        filesystem: {
          uploadDir,
          allAvatarFiles: avatarFiles,
          latestAvatarFile: avatarFiles.length > 0 ? avatarFiles[avatarFiles.length - 1] : null
        },
        mismatch: agent.avatar && !avatarAccessible ? 'Avatar in DB but file not found on disk' : 'OK'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
