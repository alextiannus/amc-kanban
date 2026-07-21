export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  const sessionId = url.searchParams.get('sessionId')

  if (!brandId || !sessionId) {
    return NextResponse.json({ error: 'brandId and sessionId required' }, { status: 400 })
  }

  try {
    // 1. Find or create the GameSession
    let session = await prisma.gameSession.findUnique({
      where: {
        brandId_sessionId: { brandId, sessionId },
      },
    })

    if (!session) {
      session = await prisma.gameSession.create({
        data: {
          brandId,
          sessionId,
          pointsBalance: 0,
        },
      })
    }

    // 2. Query any unclaimed spin logs for crash resilience
    const unclaimedSpins = await prisma.gameSpinLog.findMany({
      where: {
        sessionId: session.id,
        status: 'UNCLAIMED',
      },
      include: {
        prize: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const config = await prisma.gameConfig.findUnique({
      where: { brandId },
      select: { maxSpinsPerUserDay: true },
    })

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const spinsTodayCount = await prisma.gameSpinLog.count({
      where: {
        sessionId: session.id,
        createdAt: { gte: startOfDay },
      },
    })
    const maxSpinsPerUserDay = config?.maxSpinsPerUserDay ?? 3

    return NextResponse.json({
      pointsBalance: session.pointsBalance,
      spinsTodayCount,
      maxSpinsPerUserDay,
      spinsRemainingToday: Math.max(maxSpinsPerUserDay - spinsTodayCount, 0),
      unclaimedPrizes: unclaimedSpins.map((log: any) => ({
        logId: log.id,
        prizeName: log.prize.name,
        prizeType: log.prize.type,
        redemptionCode: log.redemptionCode,
        createdAt: log.createdAt,
      })),
    })
  } catch (e: unknown) {
    console.error('[GET /api/game/status]', e)
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
