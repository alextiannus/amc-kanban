/**
 * GET /api/scheduler/reports
 * ─────────────────────────────────────────────────────────────────────────────
 * 查询 Scheduler 历史巡检报告（Admin / Coordinator 可见）。
 * Query params:
 *   limit  - 返回条数，默认 10，最多 50
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 10), 50)

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
