import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import {
  ensureAssignmentPoolConfig,
  MATCHING_ORDERS,
  OVERFLOW_POLICIES,
  REBALANCE_POLICIES,
} from '@/lib/assignmentPool'
import { isAmcOperator } from '@/lib/amcOperator'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await ensureAssignmentPoolConfig()
  return NextResponse.json(config)
}

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actorId = typeof session.user.id === 'string' ? session.user.id : null
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const data: Prisma.AssignmentPoolConfigUpdateInput = {}

  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })
    }
    data.enabled = body.enabled
  }

  if ('overflowPolicy' in body) {
    if (typeof body.overflowPolicy !== 'string' || !OVERFLOW_POLICIES.includes(body.overflowPolicy as (typeof OVERFLOW_POLICIES)[number])) {
      return NextResponse.json({ error: 'Invalid overflowPolicy' }, { status: 400 })
    }
    data.overflowPolicy = body.overflowPolicy
  }

  if ('rebalancePolicy' in body) {
    if (typeof body.rebalancePolicy !== 'string' || !REBALANCE_POLICIES.includes(body.rebalancePolicy as (typeof REBALANCE_POLICIES)[number])) {
      return NextResponse.json({ error: 'Invalid rebalancePolicy' }, { status: 400 })
    }
    data.rebalancePolicy = body.rebalancePolicy
  }

  if ('matchingOrder' in body) {
    if (typeof body.matchingOrder !== 'string' || !MATCHING_ORDERS.includes(body.matchingOrder as (typeof MATCHING_ORDERS)[number])) {
      return NextResponse.json({ error: 'Invalid matchingOrder' }, { status: 400 })
    }
    data.matchingOrder = body.matchingOrder
  }

  if ('fallbackAgentId' in body) {
    if (body.fallbackAgentId !== null && typeof body.fallbackAgentId !== 'string') {
      return NextResponse.json({ error: 'fallbackAgentId must be string or null' }, { status: 400 })
    }

    if (typeof body.fallbackAgentId === 'string') {
      const exists = await prisma.assignmentPoolMember.findUnique({
        where: { agentId: body.fallbackAgentId },
        select: { agentId: true, active: true },
      })
      if (!exists?.active) {
        return NextResponse.json({ error: 'fallbackAgentId must be an active pool member' }, { status: 400 })
      }
    }

    data.fallbackAgentId = body.fallbackAgentId
  }

  const current = await ensureAssignmentPoolConfig()
  const updated = await prisma.assignmentPoolConfig.update({
    where: { id: current.id },
    data: {
      ...data,
      updatedById: actorId,
    },
  })

  await prisma.auditLog.create({
    data: {
      actorId,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: 'ASSIGNMENT_POOL_CONFIG_UPDATED',
      resourceId: updated.id,
      resourceType: 'AssignmentPoolConfig',
      oldValue: current,
      newValue: updated,
    },
  })

  return NextResponse.json(updated)
}
