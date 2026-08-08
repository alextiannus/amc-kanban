export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findActiveAndNextGameRounds, publicGameRound } from '@/lib/gameActivityRounds'
import { getBusinessDate } from '@/lib/gameShareDrafts'
import { effectiveGameRedemptionStatus } from '@/lib/gameRedemptions'

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

    // 2. Query recent issued rewards so claimed/expired state survives refreshes and rescans.
    const rewardLogs = await prisma.gameSpinLog.findMany({
      where: {
        sessionId: session.id,
        status: { in: ['UNCLAIMED', 'CLAIMED', 'EXPIRED'] },
      },
      select: {
        id: true,
        prizeNameSnapshot: true,
        prizeTypeSnapshot: true,
        redemptionCode: true,
        status: true,
        createdAt: true,
        claimedAt: true,
        expiresAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    })

    const config = await prisma.gameConfig.findUnique({
      where: { brandId },
      select: {
        id: true,
        maxSpinsPerUserDay: true,
        brand: { select: { timezone: true } },
      },
    })

    const roundState = config
      ? await findActiveAndNextGameRounds(prisma, config.id)
      : { activeRound: null, nextRound: null }
    const entryReward = roundState.activeRound
      ? await prisma.gameEntryReward.findUnique({
          where: {
            roundId_sessionId: {
              roundId: roundState.activeRound.id,
              sessionId: session.id,
            },
          },
          select: { platform: true, pointsAwarded: true, createdAt: true },
        })
      : null

    const rewardDate = getBusinessDate(config?.brand.timezone)
    const todayFeedbackSubmission = await prisma.customerTaskSubmission.findUnique({
      where: {
        sessionId_taskType_rewardDate: {
          sessionId: session.id,
          taskType: 'EXPERIENCE_FEEDBACK',
          rewardDate,
        },
      },
      select: {
        id: true,
        status: true,
        pointsAwarded: true,
      },
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

    const now = new Date()
    const issuedPrizes = rewardLogs.map((log: {
      id: string
      prizeNameSnapshot: string
      prizeTypeSnapshot: string
      redemptionCode: string
      status: string
      createdAt: Date
      claimedAt: Date | null
      expiresAt: Date | null
    }) => {
      const status = effectiveGameRedemptionStatus(log.status, log.expiresAt, now)
      return {
        logId: log.id,
        prizeName: log.prizeNameSnapshot,
        prizeType: log.prizeTypeSnapshot,
        status,
        redemptionCode: status === 'UNCLAIMED' ? log.redemptionCode : null,
        createdAt: log.createdAt,
        claimedAt: status === 'CLAIMED' ? log.claimedAt : null,
        expiresAt: log.expiresAt,
      }
    })

    return NextResponse.json({
      pointsBalance: session.pointsBalance,
      spinsTodayCount,
      maxSpinsPerUserDay,
      spinsRemainingToday: Math.max(maxSpinsPerUserDay - spinsTodayCount, 0),
      activeRound: publicGameRound(roundState.activeRound),
      nextRound: publicGameRound(roundState.nextRound),
      entryRewardClaimed: Boolean(entryReward),
      entryReward: entryReward ? {
        platform: entryReward.platform,
        pointsAwarded: entryReward.pointsAwarded,
        createdAt: entryReward.createdAt,
      } : null,
      todayFeedbackSubmission: todayFeedbackSubmission ? {
        submissionId: todayFeedbackSubmission.id,
        status: todayFeedbackSubmission.status,
        pointsAwarded: todayFeedbackSubmission.pointsAwarded,
      } : null,
      issuedPrizes,
      unclaimedPrizes: issuedPrizes.filter((prize: { status: string }) => prize.status === 'UNCLAIMED'),
    })
  } catch (e: unknown) {
    console.error('[GET /api/game/status]', e)
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
