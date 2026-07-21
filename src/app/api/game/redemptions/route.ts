import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  const code = url.searchParams.get('code')
  const pinCode = url.searchParams.get('pinCode')

  if (!brandId || !pinCode) {
    return NextResponse.json({ error: 'brandId and pinCode are required' }, { status: 400 })
  }

  const config = await prisma.gameConfig.findUnique({
    where: { brandId },
    select: { clerkPin: true },
  })
  if (!config) {
    return NextResponse.json({ error: 'Game configuration not found' }, { status: 404 })
  }
  if (config.clerkPin !== pinCode) {
    return NextResponse.json({ error: 'Incorrect staff PIN code.' }, { status: 403 })
  }

  const logs = await prisma.gameSpinLog.findMany({
    where: {
      session: { brandId },
      ...(code ? { redemptionCode: normalizeCode(code) } : {}),
    },
    include: {
      prize: true,
      session: true,
    },
    orderBy: { createdAt: 'desc' },
    take: code ? 1 : 50,
  })

  return NextResponse.json({
    redemptions: logs.map((log: any) => ({
      id: log.id,
      redemptionCode: log.redemptionCode,
      status: log.status,
      prizeName: log.prize.name,
      prizeType: log.prize.type,
      pointsDeducted: log.pointsDeducted,
      createdAt: log.createdAt,
      claimedAt: log.claimedAt,
      expiresAt: log.expiresAt,
      sessionId: log.session.sessionId,
    })),
  })
}

export async function POST(request: Request) {
  try {
    const { brandId, redemptionCode, pinCode } = await request.json()
    if (!brandId || !redemptionCode || !pinCode) {
      return NextResponse.json({ error: 'brandId, redemptionCode, and pinCode are required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const config = await tx.gameConfig.findUnique({
        where: { brandId },
        select: { clerkPin: true },
      })
      if (!config) throw new Error('Game configuration not found')
      if (config.clerkPin !== pinCode) throw new Error('Incorrect staff PIN code.')

      const log = await tx.gameSpinLog.findUnique({
        where: { redemptionCode: normalizeCode(redemptionCode) },
        include: { prize: true, session: true },
      })
      if (!log || log.session.brandId !== brandId) {
        throw new Error('Redemption code not found for this brand.')
      }
      if (log.prize.type === 'THANKS') {
        throw new Error('This is a thank-you result and does not need redemption.')
      }
      if (log.status === 'CLAIMED') {
        throw new Error('This prize has already been redeemed.')
      }
      if (log.expiresAt && log.expiresAt < new Date()) {
        await tx.gameSpinLog.update({
          where: { id: log.id },
          data: { status: 'EXPIRED' },
        })
        throw new Error('This redemption code has expired.')
      }

      const updated = await tx.gameSpinLog.update({
        where: { id: log.id },
        data: {
          status: 'CLAIMED',
          claimedAt: new Date(),
        },
        include: { prize: true, session: true },
      })

      return {
        id: updated.id,
        redemptionCode: updated.redemptionCode,
        status: updated.status,
        prizeName: updated.prize.name,
        prizeType: updated.prize.type,
        createdAt: updated.createdAt,
        claimedAt: updated.claimedAt,
        sessionId: updated.session.sessionId,
      }
    })

    return NextResponse.json({ redemption: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to redeem this code.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
