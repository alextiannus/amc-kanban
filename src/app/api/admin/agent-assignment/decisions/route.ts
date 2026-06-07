import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { isAmcOperator } from '@/lib/amcOperator'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(session.user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || '20')))

  const subjectType = url.searchParams.get('subjectType')
  const agentId = url.searchParams.get('agentId')
  const matchedBy = url.searchParams.get('matchedBy')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const where: Prisma.AssignmentDecisionLogWhereInput = {}
  if (subjectType) where.subjectType = subjectType
  if (agentId) where.selectedAgentId = agentId
  if (matchedBy) where.matchedBy = matchedBy

  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) where.createdAt.lte = new Date(to)
  }

  const [rows, total] = await Promise.all([
    prisma.assignmentDecisionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assignmentDecisionLog.count({ where }),
  ])

  return NextResponse.json({
    data: rows,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  })
}
