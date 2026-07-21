import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Omit confusing chars: O, I, 1, 0, Z/2 (optional, kept easy)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { brandId, sessionId } = body

    if (!brandId || !sessionId) {
      return NextResponse.json({ error: 'brandId and sessionId required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Fetch GameSession
      const session = await tx.gameSession.findUnique({
        where: { brandId_sessionId: { brandId, sessionId } },
      })
      if (!session) {
        throw new Error('Session not found')
      }

      // 2. Fetch GameConfig
      const config = await tx.gameConfig.findUnique({
        where: { brandId },
        include: { prizes: true },
      })
      if (!config) {
        throw new Error('Game config not found')
      }

      // 3. Points balance check
      if (session.pointsBalance < 5) {
        throw new Error('Insufficient points. You need at least 5 points to spin.')
      }

      // 4. Daily limits check (based on GameSpinLog timestamp)
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const spinsTodayCount = await tx.gameSpinLog.count({
        where: {
          sessionId: session.id,
          createdAt: { gte: startOfDay },
        },
      })

      if (spinsTodayCount >= config.maxSpinsPerUserDay) {
        throw new Error(`Daily spin limit reached. Max ${config.maxSpinsPerUserDay} spins per day.`)
      }

      // 5. Select active prizes (filter out out-of-stock items)
      const activePrizes = config.prizes.filter((prize: any) => {
        if (prize.totalInventory === null) return true // Infinite
        return prize.claimedCount < prize.totalInventory // In stock
      })

      if (activePrizes.length === 0) {
        throw new Error('No prizes available at the moment.')
      }

      // 6. Server-side weighted random selection
      const totalProb = activePrizes.reduce((sum: any, p: any) => sum + p.probability, 0)
      if (totalProb <= 0) {
        throw new Error('Prize configuration error: total probability is zero.')
      }

      const r = Math.random() * totalProb
      let runningSum = 0
      let selectedPrize = activePrizes[0]

      for (const prize of activePrizes) {
        runningSum += prize.probability
        if (r <= runningSum) {
          selectedPrize = prize
          break
        }
      }

      // 7. Deduct points atomically
      await tx.gameSession.update({
        where: { id: session.id },
        data: { pointsBalance: { decrement: 5 } },
      })

      // 8. Increment claimedCount if inventory is limited
      if (selectedPrize.type !== 'THANKS' && selectedPrize.totalInventory !== null) {
        await tx.gamePrize.update({
          where: { id: selectedPrize.id },
          data: { claimedCount: { increment: 1 } },
        })
      }

      // 9. Generate unique redemption code
      let redemptionCode = ''
      let isUnique = false
      let attempts = 0
      while (!isUnique && attempts < 10) {
        redemptionCode = generateRedemptionCode()
        const existing = await tx.gameSpinLog.findUnique({
          where: { redemptionCode },
        })
        if (!existing) {
          isUnique = true
        }
        attempts++
      }

      if (!isUnique) {
        throw new Error('Failed to generate unique code, please try again.')
      }

      const isThanks = selectedPrize.type === 'THANKS'

      // 10. Record Spin Log. THANKS keeps an internal code for audit uniqueness, but customers do not see it.
      await tx.gameSpinLog.create({
        data: {
          sessionId: session.id,
          prizeId: selectedPrize.id,
          pointsDeducted: 5,
          redemptionCode,
          status: isThanks ? 'RECORDED' : 'UNCLAIMED',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Valid for 30 days
        },
      })

      const spinsTodayAfter = spinsTodayCount + 1

      return {
        prize: {
          id: selectedPrize.id,
          name: selectedPrize.name,
          type: selectedPrize.type,
          imageUrl: selectedPrize.imageUrl,
        },
        redemptionCode: isThanks ? null : redemptionCode,
        pointsBalance: session.pointsBalance - 5,
        spinsTodayCount: spinsTodayAfter,
        maxSpinsPerUserDay: config.maxSpinsPerUserDay,
        spinsRemainingToday: Math.max(config.maxSpinsPerUserDay - spinsTodayAfter, 0),
      }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Spin failed'
    console.error('[POST /api/game/spin]', e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
