import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/scheduler/reports?limit=10 — scheduler run history
export async function GET(request: Request) {
  const session = await getSession()
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const requestedLimit = Number(new URL(request.url).searchParams.get('limit') || 10)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : 10

  const reports = await prisma.schedulerReport.findMany({
    orderBy: { runAt: 'desc' },
    take: limit,
    select: {
      id: true,
      triggeredBy: true,
      runAt: true,
      summary: true,
      status: true,
    },
  })

  return NextResponse.json({ reports })
}
