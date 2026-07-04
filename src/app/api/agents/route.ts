import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'
import type { Prisma } from '@prisma/client'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let whereClause: Prisma.UserWhereInput = { type: 'AI_AGENT' }

    if (session.user.role !== 'ADMIN') {
      const [permissions, ownedRows, legacyOwnedBrands] = await Promise.all([
        prisma.agentPermission.findMany({
          where: { humanId: session.user.id },
          select: { agentId: true },
        }),
        prisma.brandOwner.findMany({
          where: { userId: session.user.id },
          select: { brandId: true },
        }),
        prisma.brand.findMany({
          where: { ownerId: session.user.id },
          select: { id: true },
        }),
      ])

      const ownedBrandIds = Array.from(
        new Set([
          ...ownedRows.map((row: any) => row.brandId),
          ...legacyOwnedBrands.map((brand: any) => brand.id),
        ])
      )

      const brandBoundAgentLinks = ownedBrandIds.length
        ? await prisma.brandAgent.findMany({
            where: {
              brandId: { in: ownedBrandIds },
              active: true,
            },
            select: { agentId: true },
          })
        : []

      const visibleAgentIds = Array.from(
        new Set([
          ...permissions.map((p: any) => p.agentId),
          ...brandBoundAgentLinks.map((link: any) => link.agentId),
        ])
      )

      if (visibleAgentIds.length > 0) {
        whereClause = {
          ...whereClause,
          id: { in: visibleAgentIds }
        }
      } else {
        return NextResponse.json([])
      }
    }

    const agents = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        nickname: true,
        email: true,
        insights: true,
        introduction: true,
        workflow: true,
        themeColor: true,
        ...avatarSelect,
        createdAt: true,
        tasksAsAssignee: {
          where: {
            status: { in: ['todo', 'in_progress', 'pending'] }
          },
          select: { id: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Convert avatar data to data URI and format response
    const formattedAgents = agents.map((agent: any) => {
      const { tasksAsAssignee, ...rest } = agent
      return {
        ...withResolvedAvatar(rest),
        isOnline: tasksAsAssignee.length > 0,
      }
    })

    return NextResponse.json(formattedAgents)
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
