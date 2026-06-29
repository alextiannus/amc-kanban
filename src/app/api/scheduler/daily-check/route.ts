/**
 * POST /api/scheduler/daily-check
 * ─────────────────────────────────────────────────────────────────────────────
 * 双触发机制：
 *   1. Cron 触发：Authorization: Bearer {CRON_SECRET}（无 session）
 *   2. 手动触发：有效 session（role: ADMIN | COORDINATOR）
 *
 * Render Cron 配置（render.yaml）— 两次/天（UTC+8 07:00 / 14:00）：
 *   - name: scheduler-morning
 *     schedule: "0 23 * * *"    # 07:00 SGT/CST (UTC+8) = 23:00 UTC 前一天
 *   - name: scheduler-afternoon
 *     schedule: "0 6 * * *"     # 14:00 SGT/CST (UTC+8) = 06:00 UTC 当天
 *
 * 两次巡检都执行完整检查（频率/沉默/重复/失败），重复告警会取消排期。
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
