import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { claimGameRedemption, GameRedemptionError } from '@/lib/gameRedemptions'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const spinLogId = typeof body?.spinLogId === 'string' ? body.spinLogId.trim() : ''

    if (!brandId || !sessionId || !spinLogId) {
      return NextResponse.json(
        { error: 'brandId, sessionId, and spinLogId are required', code: 'INVALID_REQUEST' },
        { status: 400 },
      )
    }

    const result = await prisma.$transaction((tx: Prisma.TransactionClient) => claimGameRedemption(tx, {
      brandId,
      publicSessionId: sessionId,
      spinLogId,
    }))

    if (result.status === 'EXPIRED') {
      return NextResponse.json(
        { error: 'This redemption code has expired.', code: 'REDEMPTION_EXPIRED' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      redemption: {
        id: result.id,
        redemptionCode: null,
        status: result.status,
        prizeName: result.prizeName,
        prizeType: result.prizeType,
        createdAt: result.createdAt,
        claimedAt: result.claimedAt,
        expiresAt: result.expiresAt,
        alreadyClaimed: result.alreadyClaimed,
      },
    })
  } catch (error: unknown) {
    if (error instanceof GameRedemptionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[POST /api/game/redemptions/self]', error)
    return NextResponse.json(
      { error: 'Unable to use this redemption.', code: 'REDEMPTION_FAILED' },
      { status: 500 },
    )
  }
}
