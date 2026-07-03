import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/mm/health
 *
 * Lightweight health check for the mm proxy.
 * Returns DB read/write latency so we can verify the DB is responsive.
 * Does NOT require auth — safe to call from amc-mm debug endpoint.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const xClientType = req.headers.get('x-client-type')
  if (xClientType !== 'mm') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    uptime: Math.round(process.uptime()),
  }

  // ── DB read test ─────────────────────────────────────────────────────────
  try {
    const t0 = Date.now()
    await prisma.$queryRaw`SELECT 1 AS ping`
    results.dbPing = { ok: true, ms: Date.now() - t0 }
  } catch (err: any) {
    results.dbPing = { ok: false, error: err.message }
  }

  // ── DB write test (creates + immediately deletes a temp row) ────────────
  try {
    const t0 = Date.now()
    const temp = await prisma.brandSubscription.create({
      data: {
        planId: '__health_check__',
        planName: '__health_check__',
        durationMonths: 1,
        billedMonths: 1,
        monthlyBaseUsd: 0,
        totalDueUsd: 0,
        status: 'PENDING',
        termsVersion: '__health_check__',
        termsAcceptedAt: new Date(),
      },
    })
    const createMs = Date.now() - t0
    // Clean up immediately
    await prisma.brandSubscription.delete({ where: { id: temp.id } })
    const deleteMs = Date.now() - t0
    results.dbWrite = { ok: true, createMs, deleteMs }
  } catch (err: any) {
    results.dbWrite = { ok: false, error: err.message }
  }

  return NextResponse.json(results)
}
