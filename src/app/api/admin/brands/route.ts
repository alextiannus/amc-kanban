import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const brands = await prisma.brand.findMany({
    select: {
      id: true,
      name: true,
      location: true,
      timezone: true,
      status: true,
      autoPilot: true,
      ownerId: true,
      owners: {
        where: { role: 'owner' },
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, email: true, nickname: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      brandAgents: {
        where: { active: true },
        select: {
          agentId: true,
          role: true,
          agent: { select: { id: true, email: true, nickname: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      subscriptions: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          planId: true,
          planName: true,
          status: true,
          durationMonths: true,
          monthlyBaseUsd: true,
          totalDueUsd: true,
          contractStartDate: true,
          contractEndDate: true,
        },
      },
      _count: { select: { actionItems: true, contents: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })

  return NextResponse.json(brands)
}