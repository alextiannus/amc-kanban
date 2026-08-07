import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { findActiveAndNextGameRounds, publicGameRound } from '@/lib/gameActivityRounds'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const platforms = ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'] as const
type Platform = typeof platforms[number]

function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && platforms.includes(value.toUpperCase() as Platform)
}

function platformEnabled(config: {
  taskGoogleMapsEnabled: boolean
  taskXiaohongshuEnabled: boolean
  taskInstagramEnabled: boolean
}, platform: Platform) {
  if (platform === 'GOOGLE') return config.taskGoogleMapsEnabled
  if (platform === 'XIAOHONGSHU') return config.taskXiaohongshuEnabled
  return config.taskInstagramEnabled
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
    const publicSessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!brandId || !publicSessionId || !isPlatform(body?.platform)) {
      return NextResponse.json({ error: 'brandId, sessionId, and a valid platform are required' }, { status: 400 })
    }
    if (publicSessionId.length > 128) {
      return NextResponse.json({ error: 'sessionId is too long' }, { status: 400 })
    }
    const platform = body.platform.toUpperCase() as Platform

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const config = await tx.gameConfig.findUnique({
            where: { brandId },
            select: {
              id: true,
              taskGoogleMapsEnabled: true,
              taskXiaohongshuEnabled: true,
              taskInstagramEnabled: true,
            },
          })
          if (!config) return { kind: 'NOT_FOUND' as const }
          if (!platformEnabled(config, platform)) return { kind: 'PLATFORM_DISABLED' as const }

          const { activeRound } = await findActiveAndNextGameRounds(tx, config.id)
          if (!activeRound) return { kind: 'INACTIVE' as const }

          const session = await tx.gameSession.upsert({
            where: { brandId_sessionId: { brandId, sessionId: publicSessionId } },
            create: { brandId, sessionId: publicSessionId, pointsBalance: 0 },
            update: {},
            select: { id: true, pointsBalance: true },
          })
          const existing = await tx.gameEntryReward.findUnique({
            where: { roundId_sessionId: { roundId: activeRound.id, sessionId: session.id } },
            select: { pointsAwarded: true, platform: true },
          })
          if (existing) {
            return {
              kind: 'OK' as const,
              alreadyClaimed: true,
              pointsBalance: session.pointsBalance,
              pointsAwarded: existing.pointsAwarded,
              platform: existing.platform,
              activeRound,
            }
          }

          await tx.gameEntryReward.create({
            data: { roundId: activeRound.id, sessionId: session.id, platform, pointsAwarded: 5 },
          })
          const updatedSession = await tx.gameSession.update({
            where: { id: session.id },
            data: { pointsBalance: { increment: 5 } },
            select: { pointsBalance: true },
          })
          return {
            kind: 'OK' as const,
            alreadyClaimed: false,
            pointsBalance: updatedSession.pointsBalance,
            pointsAwarded: 5,
            platform,
            activeRound,
          }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

        if (result.kind === 'NOT_FOUND') return NextResponse.json({ error: 'Game config not found' }, { status: 404 })
        if (result.kind === 'PLATFORM_DISABLED') return NextResponse.json({ error: 'This platform is not enabled' }, { status: 409 })
        if (result.kind === 'INACTIVE') {
          return NextResponse.json({ error: 'This activity is not currently active.', code: 'ACTIVITY_INACTIVE' }, { status: 409 })
        }
        return NextResponse.json({
          success: true,
          alreadyClaimed: result.alreadyClaimed,
          pointsBalance: result.pointsBalance,
          pointsAwarded: result.pointsAwarded,
          platform: result.platform,
          activeRound: publicGameRound(result.activeRound),
        })
      } catch (error) {
        if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          continue
        }
        throw error
      }
    }
    throw new Error('Unable to reserve entry reward')
  } catch (error) {
    console.error('[POST /api/game/entry-reward]', error)
    const message = error instanceof Error ? error.message : 'Unable to grant entry reward'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
