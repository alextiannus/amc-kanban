/**
 * POST /api/scheduler/daily-check
 * ─────────────────────────────────────────────────────────────────────────────
 * 双触发机制：
 *   1. Cron 触发：Authorization: Bearer {CRON_SECRET}（无 session）
 *   2. 手动触发：有效 session（role: ADMIN | COORDINATOR）
 *
 * Render / Vercel Cron 配置示例（render.yaml 或 vercel.json）：
 *   cron: "0 9 * * *"   → 每天 09:00 UTC+8（服务器时区）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { runSchedulerCheck } from '@/agents/nodes/scheduler'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  let triggeredBy = 'cron'

  // ─── Auth: Cron token OR session ──────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const isCron = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`

  if (!isCron) {
    // Fall back to session auth for manual trigger
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = session.user.role
    if (role !== 'ADMIN' && role !== 'COORDINATOR') {
      return NextResponse.json(
        { error: 'Forbidden: only ADMIN or COORDINATOR can trigger scheduler check' },
        { status: 403 },
      )
    }
    triggeredBy = session.user.id
  }

  // ─── Run the check ────────────────────────────────────────────────────────
  try {
    const result = await runSchedulerCheck(triggeredBy, 30)

    return NextResponse.json({
      success: true,
      reportId: result.reportId,
      summary: result.summary,
    })
  } catch (error) {
    console.error('[Scheduler API] 巡检执行失败:', error)
    return NextResponse.json(
      { error: 'Scheduler check failed', detail: String(error) },
      { status: 500 },
    )
  }
}

// ─── GET: quick status ────────────────────────────────────────────────────────
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prisma } = await import('@/lib/prisma')
  const lastReport = await prisma.schedulerReport.findFirst({
    orderBy: { runAt: 'desc' },
    select: { id: true, runAt: true, summary: true, status: true, triggeredBy: true },
  })

  return NextResponse.json({ lastReport })
}
