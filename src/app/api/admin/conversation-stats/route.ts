import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/conversation-stats
 *
 * Admin-only: Global AI conversation statistics across all brands.
 *
 * Query params: ?startDate=2026-06-01&endDate=2026-06-30
 *
 * Returns:
 *  - totalSessions: number
 *  - totalMessages: number (user turns only = one conversation exchange)
 *  - voiceInputPct: percentage of user messages via voice
 *  - avgLatencyMs: average assistant response latency
 *  - topBrands: top 5 most active brands
 *  - intentDistribution: count per detected intent
 *  - modelDistribution: count per model used
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden — Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate   = searchParams.get('endDate')

  const dateFilter = (startDate || endDate)
    ? {
        createdAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate   ? { lte: new Date(endDate)   } : {}),
        },
      }
    : {}

  const [
    totalSessions,
    totalMessages,
    voiceCount,
    latencyData,
    topBrandsRaw,
    intentRaw,
    modelRaw,
  ] = await Promise.all([
    // Total conversation sessions
    prisma.companionSession.count({
      where: {
        ...(startDate || endDate
          ? { startedAt: { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) } }
          : {}),
      },
    }),

    // Total user messages
    prisma.companionMessage.count({
      where: { role: 'user', ...dateFilter },
    }),

    // Voice input count
    prisma.companionMessage.count({
      where: { role: 'user', inputType: 'voice', ...dateFilter },
    }),

    // Avg latency (assistant messages)
    prisma.companionMessage.aggregate({
      where: { role: 'assistant', latencyMs: { not: null }, ...dateFilter },
      _avg: { latencyMs: true },
    }),

    // Top 5 brands by session count
    prisma.companionSession.groupBy({
      by: ['brandId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
      where: startDate || endDate
        ? { startedAt: { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) } }
        : {},
    }),

    // Intent distribution
    prisma.companionMessage.groupBy({
      by: ['intentDetected'],
      _count: { id: true },
      where: { role: 'assistant', intentDetected: { not: null }, ...dateFilter },
      orderBy: { _count: { id: 'desc' } },
    }),

    // Model usage distribution
    prisma.companionMessage.groupBy({
      by: ['modelId'],
      _count: { id: true },
      where: { role: 'assistant', modelId: { not: null }, ...dateFilter },
      orderBy: { _count: { id: 'desc' } },
    }),
  ])

  // Enrich top brands with brand names
  const brandIds = topBrandsRaw.map((b: { brandId: string; _count: { id: number } }) => b.brandId)
  const brands = await prisma.brand.findMany({
    where: { id: { in: brandIds } },
    select: { id: true, name: true },
  })
  const brandNameMap = Object.fromEntries(brands.map((b: { id: string; name: string }) => [b.id, b.name]))

  const topBrands = topBrandsRaw.map((b: { brandId: string; _count: { id: number } }) => ({
    brandId:      b.brandId,
    brandName:    brandNameMap[b.brandId] ?? b.brandId,
    sessionCount: b._count.id,
  }))

  return NextResponse.json({
    period: { startDate, endDate },
    totalSessions,
    totalMessages,
    voiceInputPct:
      totalMessages > 0 ? Math.round((voiceCount / totalMessages) * 100) : 0,
    avgLatencyMs: Math.round(latencyData._avg.latencyMs ?? 0),
    topBrands,
    intentDistribution: intentRaw.map((r: { intentDetected: string | null; _count: { id: number } }) => ({
      intent: r.intentDetected,
      count:  r._count.id,
    })),
    modelDistribution: modelRaw.map((r: { modelId: string | null; _count: { id: number } }) => ({
      model: r.modelId,
      count: r._count.id,
    })),
  })
}
