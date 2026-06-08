import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { isAmcOperatorRole } from '@/lib/amcOperator'

function uniq(values: string[]) {
  return Array.from(new Set(values))
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userId = session.user.id
  const isAdmin = isAmcOperatorRole(session.user.role)
  const scope = new URL(request.url).searchParams.get('scope')
  const adminAsPrincipal = isAdmin && scope === 'mine'

  const [ownerLinksCount, legacyOwnerCount] = await Promise.all([
    prisma.brandOwner.count({ where: { userId } }),
    prisma.brand.count({ where: { ownerId: userId } }),
  ])

  const dashboardRole = isAdmin
    ? 'ADMIN'
    : ownerLinksCount > 0 || legacyOwnerCount > 0
      ? 'BRAND_OWNER'
      : 'BRAND_DIRECTOR'

  if (!isAdmin && dashboardRole !== 'BRAND_DIRECTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const visibleBrandFilter = {
    status: { not: 'ARCHIVED' as const },
  }

  let visibleBrandIds: string[] = []

  if (isAdmin && !adminAsPrincipal) {
    const allBrands = await prisma.brand.findMany({
      where: visibleBrandFilter,
      select: { id: true },
    })
    visibleBrandIds = allBrands.map((b) => b.id)
  } else {
    const [permissions, orgMemberships, ownerLinks, legacyOwnedBrands] = await Promise.all([
      prisma.agentPermission.findMany({
        where: { humanId: userId },
        select: { agentId: true },
      }),
      prisma.organizationMember.findMany({
        where: { memberId: userId },
        select: { ownerId: true },
      }),
      prisma.brandOwner.findMany({
        where: { userId, brand: visibleBrandFilter },
        select: { brandId: true },
      }),
      prisma.brand.findMany({
        where: { ownerId: userId, ...visibleBrandFilter },
        select: { id: true },
      }),
    ])

    const delegatedAgentIds = permissions.map((p) => p.agentId)
    const delegatedBrandLinks = delegatedAgentIds.length
      ? await prisma.brandAgent.findMany({
          where: {
            active: true,
            agentId: { in: delegatedAgentIds },
            brand: visibleBrandFilter,
          },
          select: { brandId: true },
        })
      : []

    const orgOwnerIds = uniq(orgMemberships.map((m) => m.ownerId))
    const orgBrands = orgOwnerIds.length
      ? await prisma.brand.findMany({
          where: {
            ...visibleBrandFilter,
            OR: [
              { ownerId: { in: orgOwnerIds } },
              {
                owners: {
                  some: {
                    role: 'owner',
                    userId: { in: orgOwnerIds },
                  },
                },
              },
            ],
          },
          select: { id: true },
        })
      : []

    visibleBrandIds = uniq([
      ...ownerLinks.map((l) => l.brandId),
      ...legacyOwnedBrands.map((b) => b.id),
      ...delegatedBrandLinks.map((l) => l.brandId),
      ...orgBrands.map((b) => b.id),
    ])
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
              where: { active: true },
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
          },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([]),
    visibleBrandIds.length
      ? prisma.brandAgent.findMany({
          where: {
            brandId: { in: visibleBrandIds },
            active: true,
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

  if (isAdmin) {
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

    agents = allAgents.map((agent) => ({
      id: agent.id,
      email: agent.email,
      nickname: agent.nickname,
      isOnline: agent.tasksAsAssignee.length > 0,
      boundBrands: brandBindingsByAgent.get(agent.id) || [],
    }))
  } else {
    const seen = new Set<string>()
    for (const link of brandAgentLinks) {
      if (seen.has(link.agent.id)) continue
      seen.add(link.agent.id)
      agents.push({
        id: link.agent.id,
        email: link.agent.email,
        nickname: link.agent.nickname,
        isOnline: link.agent.tasksAsAssignee.length > 0,
        boundBrands: brandBindingsByAgent.get(link.agent.id) || [],
      })
    }
  }

  return NextResponse.json({
    dashboardRole,
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
