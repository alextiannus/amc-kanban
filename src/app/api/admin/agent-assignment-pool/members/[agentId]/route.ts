import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isAmcOperator } from '@/lib/amcOperator'

type Params = { params: Promise<{ agentId: string }> }

function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter(Boolean)
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorId = typeof session.user.id === 'string' ? session.user.id : null
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await params
  const current = await prisma.assignmentPoolMember.findUnique({ where: { agentId } })
  if (!current) return NextResponse.json({ error: 'Pool member not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const data: Prisma.AssignmentPoolMemberUpdateInput = {}

  if ('active' in body) {
    if (typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'active must be boolean' }, { status: 400 })
    }
    data.active = body.active
  }

  if ('capacity' in body) {
    if (!Number.isInteger(body.capacity) || body.capacity <= 0) {
      return NextResponse.json({ error: 'capacity must be positive integer' }, { status: 400 })
    }
    data.capacity = body.capacity
  }

  if ('priority' in body) {
    if (!Number.isInteger(body.priority)) {
      return NextResponse.json({ error: 'priority must be integer' }, { status: 400 })
    }
    data.priority = body.priority
  }

  if ('industries' in body) data.industries = normalizeTags(body.industries)
  if ('regions' in body) data.regions = normalizeTags(body.regions)

  const updated = await prisma.assignmentPoolMember.update({
    where: { agentId },
    data,
  })

  await prisma.auditLog.create({
    data: {
      actorId,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: 'ASSIGNMENT_POOL_MEMBER_UPDATED',
      resourceId: updated.id,
      resourceType: 'AssignmentPoolMember',
      oldValue: current,
      newValue: updated,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorId = typeof session.user.id === 'string' ? session.user.id : null
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await params
  const current = await prisma.assignmentPoolMember.findUnique({ where: { agentId } })
  if (!current) return NextResponse.json({ error: 'Pool member not found' }, { status: 404 })

  await prisma.assignmentPoolMember.delete({ where: { agentId } })

  const config = await prisma.assignmentPoolConfig.findUnique({ where: { id: 'default' } })
  if (config?.fallbackAgentId === agentId) {
    await prisma.assignmentPoolConfig.update({
      where: { id: 'default' },
      data: { fallbackAgentId: null, updatedById: actorId },
    })
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: 'ASSIGNMENT_POOL_MEMBER_DELETED',
      resourceId: current.id,
      resourceType: 'AssignmentPoolMember',
      oldValue: current,
    },
  })

  return NextResponse.json({ ok: true })
}
