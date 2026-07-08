import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { isAmcOperatorRole } from '@/lib/amcOperator'
import { computeEffectiveUserRoles, getLegacyDashboardRole } from '@/lib/userRoles'

function uniq(values: string[]) {
  return Array.from(new Set(values))
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const isAdmin = isAmcOperatorRole(session.user.role)
  const scope = new URL(request.url).searchParams.get('scope')
  const adminAsPrincipal = isAdmin && scope === 'mine'

  const [ownerLinksCount, legacyOwnerCount, principalPermissionCount, explicitRoles] = await Promise.all([
    prisma.brandOwner.count({ where: { userId } }),
    prisma.brand.count({ where: { ownerId: userId } }),
    prisma.user.count({ where: { ownerId: userId, type: 'AI_AGENT' } }),
    prisma.userBusinessRole.findMany({ where: { userId }, select: { role: true } }),
  ])

  const userRoles = computeEffectiveUserRoles({
    userType: session.user.type,
    systemRole: session.user.role,
    explicitRoles: explicitRoles.map((role: any) => role.role),
    ownerCount: ownerLinksCount + legacyOwnerCount,
    principalCount: principalPermissionCount,
  })
  const dashboardRole = getLegacyDashboardRole(userRoles)

  if (!isAdmin && !userRoles.includes('AMC_PRINCIPAL')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let visibleBrandIds: string[] = []
  let scopedAgentIds: string[] | null = null

  if (isAdmin && !adminAsPrincipal) {
    const allBrands = await prisma.brand.findMany({
      select: { id: true },
    })
    visibleBrandIds = allBrands.map((b: any) => b.id)
  } else {
    const agents = await prisma.user.findMany({
      where: { ownerId: userId, type: 'AI_AGENT' },
      select: { id: true },
    })
    const delegatedAgentIds = agents.map((a: any) => a.id)
    scopedAgentIds = delegatedAgentIds
    const delegatedBrandLinks = delegatedAgentIds.length
      ? await prisma.brandAgent.findMany({
          where: {
            active: true,
            agentId: { in: delegatedAgentIds },
          },
          select: { brandId: true },
        })
      : []

    visibleBrandIds = uniq(delegatedBrandLinks.map((link: any) => link.brandId))
  }

  const brandAgentWhere = {
    active: true,
    ...(scopedAgentIds ? { agentId: { in: scopedAgentIds } } : {}),
  }

  const [brands, brandAgentLinks, actionLogs] = await Promise.all([
    visibleBrandIds.length
      ? prisma.brand.findMany({
          where: { id: { in: visibleBrandIds } },
          select: {
            id: true,
            name: true,
            location: true,
            status: true,
            owners: {
              where: { role: 'owner' },
              select: {
                userId: true,
                role: true,
                user: {
                  select: {
                    id: true,
                    email: true,
                    nickname: true,
                  },
                },
              },
            },
            brandAgents: {
              where: brandAgentWhere,
              select: {
                agentId: true,
                role: true,
                agent: {
                  select: {
                    id: true,
                    email: true,
                    nickname: true,
                  },
                },
              },
            },
            _count: {
              select: {
                actionItems: true,
                brandAgents: true,
              },
            },
            subscriptions: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { status: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([]),
    visibleBrandIds.length
      ? prisma.brandAgent.findMany({
          where: {
            brandId: { in: visibleBrandIds },
            ...brandAgentWhere,
          },
          select: {
            brandId: true,
            role: true,
            brand: { select: { id: true, name: true } },
            agent: {
              select: {
                id: true,
                email: true,
                nickname: true,
                tasksAsAssignee: {
                  where: { status: { in: ['todo', 'in_progress', 'pending'] } },
                  select: { id: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    visibleBrandIds.length
      ? prisma.actionItem.findMany({
          where: { brandId: { in: visibleBrandIds } },
          select: {
            id: true,
            brandId: true,
            type: true,
            priority: true,
            title: true,
            status: true,
            agentId: true,
            createdAt: true,
            updatedAt: true,
            brand: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 80,
        })
      : Promise.resolve([]),
  ])

  const brandBindingsByAgent = new Map<string, Array<{ id: string; name: string; role: string }>>()
  for (const link of brandAgentLinks) {
    const existing = brandBindingsByAgent.get(link.agent.id) || []
    existing.push({ id: link.brand.id, name: link.brand.name, role: link.role })
    brandBindingsByAgent.set(link.agent.id, existing)
  }

  let agents: Array<{
    id: string
    email: string
    nickname: string | null
    isOnline: boolean
    boundBrands: Array<{ id: string; name: string; role: string }>
  }> = []

  if (isAdmin && !adminAsPrincipal) {
    const allAgents = await prisma.user.findMany({
      where: { type: 'AI_AGENT' },
      select: {
        id: true,
        email: true,
        nickname: true,
        tasksAsAssignee: {
          where: { status: { in: ['todo', 'in_progress', 'pending'] } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    agents = allAgents.map((agent: any) => ({
      id: agent.id,
      email: agent.email,
      nickname: agent.nickname,
      isOnline: agent.tasksAsAssignee.length > 0,
      boundBrands: brandBindingsByAgent.get(agent.id) || [],
    }))
  } else {
    const scopedAgents = scopedAgentIds?.length
      ? await prisma.user.findMany({
          where: { id: { in: scopedAgentIds }, type: 'AI_AGENT' },
          select: {
            id: true,
            email: true,
            nickname: true,
            tasksAsAssignee: {
              where: { status: { in: ['todo', 'in_progress', 'pending'] } },
              select: { id: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : []

    agents = scopedAgents.map((agent: any) => ({
      id: agent.id,
      email: agent.email,
      nickname: agent.nickname,
      isOnline: agent.tasksAsAssignee.length > 0,
      boundBrands: brandBindingsByAgent.get(agent.id) || [],
    }))
  }

  return NextResponse.json({
    viewerUserId: userId,
    dashboardRole,
    userRoles,
    scope: adminAsPrincipal ? 'mine' : 'all',
    summary: {
      totalAgents: agents.length,
      totalBrands: brands.length,
      totalActionLogs: actionLogs.length,
    },
    agents,
    brands,
    actionLogs,
  })
}
