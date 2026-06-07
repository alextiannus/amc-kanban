import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { humanId, agentIds } = await request.json()

    if (!humanId || !Array.isArray(agentIds)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const human = await prisma.user.findUnique({
      where: { id: humanId },
      select: { id: true, type: true }
    })

    if (!human || human.type !== 'HUMAN') {
      return NextResponse.json({ error: 'Human user not found' }, { status: 404 })
    }

    if (agentIds.length > 0) {
      const validAgentsCount = await prisma.user.count({
        where: {
          id: { in: agentIds },
          type: 'AI_AGENT'
        }
      })

      if (validAgentsCount !== agentIds.length) {
        return NextResponse.json({ error: 'One or more agentIds are invalid' }, { status: 400 })
      }
    }

    await prisma.agentPermission.deleteMany({
      where: { humanId }
    })

    if (agentIds.length > 0) {
      await prisma.agentPermission.createMany({
        data: agentIds.map(agentId => ({
          humanId,
          agentId
        }))
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
