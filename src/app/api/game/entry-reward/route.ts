import { after, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { findActiveAndNextGameRounds, publicGameRound } from '@/lib/gameActivityRounds'
import { getGameSharePoolContext, requestGameShareDraftPoolRefill } from '@/lib/gameShareDraftPool'
import type { GameShareLocale } from '@/lib/gameShareDrafts'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const draftId = typeof body?.draftId === 'string' && body.draftId.trim() ? body.draftId.trim() : null
    if (draftId && draftId.length > 128) {
      return NextResponse.json({ error: 'draftId is too long' }, { status: 400 })
    }

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
              gameConfigId: config.id,
              consumedLocale: null,
            }
          }

          let consumedLocale: GameShareLocale | null = null
          if (draftId) {
            const poolContext = await getGameSharePoolContext(tx, config.id)
            if (!poolContext) return { kind: 'DRAFT_INVALID' as const }
            const draft = await tx.gameShareDraftPoolItem.findFirst({
              where: {
                id: draftId,
                gameConfigId: config.id,
                configFingerprint: poolContext.fingerprint,
                status: 'RESERVED',
                reservedSessionId: session.id,
                reservedRoundId: activeRound.id,
                reservedUntil: { gt: new Date() },
              },
              select: { locale: true },
            })
            if (!draft || (draft.locale !== 'zh' && draft.locale !== 'en')) return { kind: 'DRAFT_INVALID' as const }
            const consumed = await tx.gameShareDraftPoolItem.updateMany({
              where: {
                id: draftId,
                status: 'RESERVED',
                reservedSessionId: session.id,
                reservedRoundId: activeRound.id,
              },
              data: {
                status: 'USED',
                usedPlatform: platform,
                usedAt: new Date(),
                reservedUntil: null,
              },
            })
            if (consumed.count !== 1) return { kind: 'DRAFT_INVALID' as const }
            consumedLocale = draft.locale
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
            gameConfigId: config.id,
            consumedLocale,
          }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

        if (result.kind === 'NOT_FOUND') return NextResponse.json({ error: 'Game config not found' }, { status: 404 })
        if (result.kind === 'PLATFORM_DISABLED') return NextResponse.json({ error: 'This platform is not enabled' }, { status: 409 })
        if (result.kind === 'DRAFT_INVALID') {
          return NextResponse.json({ error: 'This draft reservation expired. Please reload and try again.', code: 'DRAFT_RESERVATION_INVALID' }, { status: 409 })
        }
        if (result.kind === 'INACTIVE') {
          return NextResponse.json({ error: 'This activity is not currently active.', code: 'ACTIVITY_INACTIVE' }, { status: 409 })
        }
        if (!result.alreadyClaimed && result.consumedLocale) {
          after(async () => {
            await requestGameShareDraftPoolRefill(result.gameConfigId, [result.consumedLocale as GameShareLocale])
          })
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
