import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { humanId, agentIds, agentId, humanIds } = await request.json()

    if (agentId !== undefined || humanIds !== undefined) {
      if (!agentId || !Array.isArray(humanIds)) {
        return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
      }

      const agent = await prisma.user.findUnique({
        where: { id: agentId },
        select: { id: true, type: true },
      })
      if (!agent || agent.type !== 'AI_AGENT') {
        return NextResponse.json({ error: 'AI Agent not found' }, { status: 404 })
      }

      const uniqueHumanIds = Array.from(new Set(humanIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')))
      if (uniqueHumanIds.length > 0) {
        const validHumansCount = await prisma.user.count({
          where: { id: { in: uniqueHumanIds }, type: 'HUMAN' },
        })
        if (validHumansCount !== uniqueHumanIds.length) {
          return NextResponse.json({ error: 'One or more humanIds are invalid' }, { status: 400 })
        }
      }

      const targetOwnerId = uniqueHumanIds[0] || null
      await prisma.$transaction([
        prisma.user.update({
          where: { id: agentId },
          data: { ownerId: targetOwnerId },
        }),
        ...(targetOwnerId ? [
          prisma.userBusinessRole.createMany({
            data: [{ userId: targetOwnerId, role: 'AMC_PRINCIPAL' }],
            skipDuplicates: true,
          }),
        ] : []),
      ])

      const affectedBrands = await prisma.brandAgent.findMany({
        where: { agentId, active: true },
        select: { brand: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json({
        success: true,
        mode: 'agent_to_principals',
        removed: 1,
        principals: targetOwnerId ? 1 : 0,
        affectedBrands: affectedBrands.map((link: any) => link.brand),
      })
    }

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

    const uniqueAgentIds = Array.from(new Set(agentIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')))

    if (uniqueAgentIds.length > 0) {
      const validAgentsCount = await prisma.user.count({
        where: {
          id: { in: uniqueAgentIds },
          type: 'AI_AGENT'
        }
      })

      if (validAgentsCount !== uniqueAgentIds.length) {
        return NextResponse.json({ error: 'One or more agentIds are invalid' }, { status: 400 })
      }
    }

    await prisma.$transaction([
      prisma.user.updateMany({
        where: { ownerId: humanId },
        data: { ownerId: null },
      }),
      ...(uniqueAgentIds.length > 0 ? [
        prisma.user.updateMany({
          where: { id: { in: uniqueAgentIds } },
          data: { ownerId: humanId },
        }),
        prisma.userBusinessRole.upsert({
          where: { userId_role: { userId: humanId, role: 'AMC_PRINCIPAL' } },
          create: { userId: humanId, role: 'AMC_PRINCIPAL' },
          update: {},
        }),
      ] : []),
    ])

    const affectedBrands = uniqueAgentIds.length
      ? await prisma.brandAgent.findMany({
          where: { agentId: { in: uniqueAgentIds }, active: true },
          select: { brand: { select: { id: true, name: true, status: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : []

    return NextResponse.json({
      success: true,
      mode: 'principal_to_agents',
      agents: uniqueAgentIds.length,
      affectedBrands: affectedBrands.map((link: any) => link.brand),
    })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
