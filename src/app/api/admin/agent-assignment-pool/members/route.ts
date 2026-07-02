import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isAmcOperator } from '@/lib/amcOperator'

function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map((v: any) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter(Boolean)
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const activeParam = url.searchParams.get('active')
  const industry = url.searchParams.get('industry')?.trim().toLowerCase()
  const region = url.searchParams.get('region')?.trim().toLowerCase()
  const overloaded = url.searchParams.get('overloaded')

  const where: Prisma.AssignmentPoolMemberWhereInput = {}
  if (activeParam === 'true') where.active = true
  if (activeParam === 'false') where.active = false
  if (industry) where.industries = { has: industry }
  if (region) where.regions = { has: region }

  const members = await prisma.assignmentPoolMember.findMany({
    where,
    orderBy: [{ active: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const agentIds = members.map((m: any) => m.agentId)
  const [agents, loads] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, nickname: true, email: true },
    }),
    prisma.brandOwner.groupBy({
      by: ['userId'],
      where: { brand: { status: 'ACTIVE' }, userId: { in: agentIds } },
      _count: { _all: true },
    }),
  ])

  const agentMap = new Map(agents.map((a: any) => [a.id, a]))
  const loadMap = new Map(loads.map((l: any) => [l.userId, l._count._all]))

  let rows = members.map((m: any) => {
    const currentLoad = Number(loadMap.get(m.agentId) || 0)
    const availableSlots = Math.max(0, m.capacity - currentLoad)
    return {
      ...m,
      agentNickname: (agentMap.get(m.agentId) as any)?.nickname || null,
      agentEmail: (agentMap.get(m.agentId) as any)?.email || null,
      currentLoad,
      availableSlots,
      overloaded: currentLoad >= m.capacity,
    }
  })

  if (overloaded === 'true') rows = rows.filter((r: any) => r.overloaded)
  if (overloaded === 'false') rows = rows.filter((r: any) => !r.overloaded)

  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorId = typeof session.user.id === 'string' ? session.user.id : null
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : ''
  if (!agentId) return NextResponse.json({ error: 'agentId is required' }, { status: 400 })

  const agent = await prisma.user.findFirst({
    where: { id: agentId },
    select: { id: true },
  })
  if (!agent) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const payload = {
    agentId,
    active: typeof body.active === 'boolean' ? body.active : true,
    capacity: Number.isInteger(body.capacity) ? body.capacity : 30,
    priority: Number.isInteger(body.priority) ? body.priority : 100,
    industries: normalizeTags(body.industries),
    regions: normalizeTags(body.regions),
  }

  if (payload.capacity <= 0) {
    return NextResponse.json({ error: 'capacity must be > 0' }, { status: 400 })
  }

  const created = await prisma.assignmentPoolMember.create({ data: payload })

  await prisma.auditLog.create({
    data: {
      actorId,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: 'ASSIGNMENT_POOL_MEMBER_CREATED',
      resourceId: created.id,
      resourceType: 'AssignmentPoolMember',
      newValue: created,
    },
  })

  return NextResponse.json(created, { status: 201 })
}
