import { NextResponse } from 'next/server'
import { runSchedulerCheck } from '@/agents/nodes/scheduler'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin() {
  const session = await getSession()
  return session?.user?.role === 'ADMIN' ? session.user : null
}

// GET /api/scheduler/daily-check — latest scheduler run status
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const lastReport = await prisma.schedulerReport.findFirst({
    orderBy: { runAt: 'desc' },
    select: {
      id: true,
      triggeredBy: true,
      runAt: true,
      summary: true,
      status: true,
    },
  })

  return NextResponse.json({ lastReport })
}

// POST /api/scheduler/daily-check — run a scheduler check immediately
export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  try {
    const result = await runSchedulerCheck(user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[scheduler/daily-check] Manual run failed:', error)
    return NextResponse.json({ error: 'Scheduler check failed' }, { status: 500 })
  }
}
