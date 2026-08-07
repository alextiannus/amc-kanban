import { after, NextResponse } from 'next/server'
import { findActiveAndNextGameRounds } from '@/lib/gameActivityRounds'
import {
  leaseGameShareDraftBundle,
  poolDrafts,
  requestGameShareDraftPoolRefill,
} from '@/lib/gameShareDraftPool'
import { buildAutoShareFallbackDrafts, enabledSharePlatforms, type GameShareLocale } from '@/lib/gameShareDrafts'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const brandId = url.searchParams.get('brandId')?.trim() || ''
    const publicSessionId = url.searchParams.get('sessionId')?.trim() || ''
    const locale: GameShareLocale = url.searchParams.get('locale') === 'zh' ? 'zh' : 'en'
    if (!brandId || !publicSessionId) {
      return NextResponse.json({ error: 'brandId and sessionId are required' }, { status: 400 })
    }
    if (publicSessionId.length > 128) {
      return NextResponse.json({ error: 'sessionId is too long' }, { status: 400 })
    }

    const config = await prisma.gameConfig.findUnique({
      where: { brandId },
      select: {
        id: true,
        taskReviewEnabled: true,
        taskGoogleMapsEnabled: true,
        taskXiaohongshuEnabled: true,
        taskInstagramEnabled: true,
        brand: { select: { name: true, location: true } },
      },
    })
    if (!config || config.taskReviewEnabled === false) {
      return NextResponse.json({ error: 'Game sharing assistant is unavailable' }, { status: 404 })
    }
    const { activeRound } = await findActiveAndNextGameRounds(prisma, config.id)
    if (!activeRound) {
      return NextResponse.json({ error: 'This activity is not currently active.', code: 'ACTIVITY_INACTIVE' }, { status: 409 })
    }
    const platforms = enabledSharePlatforms(config)
    if (platforms.length === 0) {
      return NextResponse.json({
        draftId: null,
        locale,
        drafts: {},
        source: null,
        generatedAt: null,
      })
    }

    const session = await prisma.gameSession.upsert({
      where: { brandId_sessionId: { brandId, sessionId: publicSessionId } },
      create: { brandId, sessionId: publicSessionId, pointsBalance: 0 },
      update: {},
      select: { id: true },
    })
    const lease = await leaseGameShareDraftBundle({
      gameConfigId: config.id,
      sessionId: session.id,
      roundId: activeRound.id,
      locale,
    })
    if (!lease.item) {
      after(async () => {
        await requestGameShareDraftPoolRefill(config.id, [locale])
      })
      return NextResponse.json({
        draftId: null,
        locale,
        drafts: buildAutoShareFallbackDrafts({
          brandName: config.brand.name,
          brandLocation: config.brand.location,
          locale,
          platforms,
        }),
        source: 'fallback',
        generatedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      draftId: lease.item.id,
      locale,
      drafts: poolDrafts(lease.item.drafts),
      source: lease.item.generationSource,
      generatedAt: lease.item.generatedAt,
    })
  } catch (error) {
    console.error('[GET /api/game/share-drafts]', error)
    const message = error instanceof Error ? error.message : 'Unable to load sharing drafts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
