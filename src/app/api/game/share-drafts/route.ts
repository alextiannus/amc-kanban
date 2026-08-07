import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { callLLM } from '@/lib/llmRouter'
import {
  GAME_SHARE_BRAND_DAILY_AI_LIMIT,
  GAME_SHARE_IP_DAILY_AI_LIMIT,
  GAME_SHARE_SESSION_LIMIT,
  buildBrandIntroFallbackDrafts,
  buildBrandIntroPrompt,
  buildFallbackDrafts,
  buildGameSharePrompt,
  enabledSharePlatforms,
  extractClientIp,
  getBusinessDate,
  hashClientIp,
  normalizeExperienceInput,
  parseGeneratedDrafts,
  type GameShareDrafts,
} from '@/lib/gameShareDrafts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type GameContext = NonNullable<Awaited<ReturnType<typeof getGameContext>>>

function jsonDrafts(value: Prisma.JsonValue | null): GameShareDrafts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: GameShareDrafts = {}
  for (const platform of ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'] as const) {
    const text = (value as Record<string, unknown>)[platform]
    if (typeof text === 'string' && text.trim()) result[platform] = text
  }
  return result
}

function menuNames(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>).name : null))
    .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
    .map((name) => name.trim())
    .slice(0, 10)
}

async function getGameContext(brandId: string, publicSessionId: string) {
  return prisma.gameSession.findUnique({
    where: { brandId_sessionId: { brandId, sessionId: publicSessionId } },
    select: {
      id: true,
      brand: {
        select: {
          name: true,
          location: true,
          description: true,
          timezone: true,
          knowledge: { select: { menuItems: true } },
          gameConfig: {
            select: {
              taskReviewEnabled: true,
              taskGoogleMapsEnabled: true,
              taskXiaohongshuEnabled: true,
              taskInstagramEnabled: true,
            },
          },
        },
      },
    },
  })
}

function emptyResponse() {
  return {
    draftId: null,
    locale: null,
    experienceTags: [],
    experienceNote: null,
    drafts: {},
    source: null,
    generationsUsed: 0,
    generationsRemaining: GAME_SHARE_SESSION_LIMIT,
    limitReason: null,
    generatedAt: null,
  }
}

function draftResponse(draft: {
  id: string
  locale: string
  experienceTags: string[]
  experienceNote: string | null
  drafts: Prisma.JsonValue | null
  generationSource: string
  generationCount: number
  lastLimitReason: string | null
  generatedAt: Date | null
}) {
  return {
    draftId: draft.id,
    locale: draft.locale,
    experienceTags: draft.experienceTags,
    experienceNote: draft.experienceNote,
    drafts: jsonDrafts(draft.drafts),
    source: draft.generationSource,
    generationsUsed: draft.generationCount,
    generationsRemaining: Math.max(GAME_SHARE_SESSION_LIMIT - draft.generationCount, 0),
    limitReason: draft.lastLimitReason,
    generatedAt: draft.generatedAt,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')?.trim() || ''
  const publicSessionId = url.searchParams.get('sessionId')?.trim() || ''
  if (!brandId || !publicSessionId) {
    return NextResponse.json({ error: 'brandId and sessionId are required' }, { status: 400 })
  }

  const context = await getGameContext(brandId, publicSessionId)
  if (!context?.brand.gameConfig || context.brand.gameConfig.taskReviewEnabled === false) {
    return NextResponse.json({ error: 'Game sharing assistant is unavailable' }, { status: 404 })
  }

  const activityDate = getBusinessDate(context.brand.timezone)
  const draft = await prisma.gameShareDraft.findUnique({
    where: { sessionId_activityDate: { sessionId: context.id, activityDate } },
    select: {
      id: true,
      locale: true,
      experienceTags: true,
      experienceNote: true,
      drafts: true,
      generationSource: true,
      generationCount: true,
      lastLimitReason: true,
      generatedAt: true,
    },
  })

  return NextResponse.json(draft ? draftResponse(draft) : emptyResponse())
}

async function reserveGeneration(input: {
  context: GameContext
  brandId: string
  activityDate: string
  ipHash: string | null
  locale: 'zh' | 'en'
  experienceTags: string[]
  experienceNote: string | null
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const current = await tx.gameShareDraft.findUnique({
          where: { sessionId_activityDate: { sessionId: input.context.id, activityDate: input.activityDate } },
        })

        if (current && current.generationCount >= GAME_SHARE_SESSION_LIMIT) {
          return { draft: current, reservedGeneration: current.generationCount, allowAi: false, limitReason: 'SESSION' as const, sessionLimited: true }
        }

        const [brandUsage, ipUsage] = await Promise.all([
          tx.gameShareDraft.aggregate({
            where: { brandId: input.brandId, activityDate: input.activityDate },
            _sum: { aiCallCount: true },
          }),
          input.ipHash
            ? tx.gameShareDraft.aggregate({
                where: { ipHash: input.ipHash, activityDate: input.activityDate },
                _sum: { aiCallCount: true },
              })
            : Promise.resolve({ _sum: { aiCallCount: 0 } }),
        ])

        let limitReason: 'IP' | 'BRAND' | null = null
        if ((brandUsage._sum.aiCallCount || 0) >= GAME_SHARE_BRAND_DAILY_AI_LIMIT) limitReason = 'BRAND'
        else if (input.ipHash && (ipUsage._sum.aiCallCount || 0) >= GAME_SHARE_IP_DAILY_AI_LIMIT) limitReason = 'IP'
        const allowAi = !limitReason

        const data = {
          locale: input.locale,
          experienceTags: input.experienceTags,
          experienceNote: input.experienceNote,
          generationCount: { increment: 1 },
          aiCallCount: { increment: allowAi ? 1 : 0 },
          ipHash: current?.ipHash || input.ipHash,
          lastLimitReason: limitReason,
        }

        const draft = current
          ? await tx.gameShareDraft.update({ where: { id: current.id }, data })
          : await tx.gameShareDraft.create({
              data: {
                brandId: input.brandId,
                sessionId: input.context.id,
                activityDate: input.activityDate,
                locale: input.locale,
                experienceTags: input.experienceTags,
                experienceNote: input.experienceNote,
                generationCount: 1,
                aiCallCount: allowAi ? 1 : 0,
                ipHash: input.ipHash,
                lastLimitReason: limitReason,
              },
            })

        return { draft, reservedGeneration: draft.generationCount, allowAi, limitReason, sessionLimited: false }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue
      throw error
    }
  }
  throw new Error('Unable to reserve generation quota')
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const brandId = typeof body.brandId === 'string' ? body.brandId.trim() : ''
    const publicSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (!brandId || !publicSessionId) {
      return NextResponse.json({ error: 'brandId and sessionId are required' }, { status: 400 })
    }

    const draftMode = body.mode === 'BRAND_INTRO' ? 'BRAND_INTRO' : 'EXPERIENCE'
    const normalized = draftMode === 'BRAND_INTRO'
      ? {
          locale: body.locale === 'zh' ? 'zh' as const : 'en' as const,
          experienceTags: [],
          experienceNote: null,
        }
      : normalizeExperienceInput(body)
    if ('error' in normalized && normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }

    const context = await getGameContext(brandId, publicSessionId)
    const config = context?.brand.gameConfig
    if (!context || !config || config.taskReviewEnabled === false) {
      return NextResponse.json({ error: 'Game sharing assistant is unavailable' }, { status: 404 })
    }
    const platforms = enabledSharePlatforms(config).filter((platform) => draftMode === 'EXPERIENCE' || platform !== 'GOOGLE')
    if (platforms.length === 0) {
      return NextResponse.json(emptyResponse())
    }

    const activityDate = getBusinessDate(context.brand.timezone)
    const ipHash = hashClientIp(extractClientIp(request))
    const reservation = await reserveGeneration({
      context,
      brandId,
      activityDate,
      ipHash,
      locale: normalized.locale,
      experienceTags: normalized.experienceTags,
      experienceNote: normalized.experienceNote,
    })

    if (reservation.sessionLimited) {
      return NextResponse.json(draftResponse({
        ...reservation.draft,
        lastLimitReason: 'SESSION',
      }))
    }

    const fallbackDrafts = draftMode === 'BRAND_INTRO'
      ? buildBrandIntroFallbackDrafts({
          brandName: context.brand.name,
          brandLocation: context.brand.location,
          locale: normalized.locale,
          platforms,
        })
      : buildFallbackDrafts({
          brandName: context.brand.name,
          locale: normalized.locale,
          experienceTags: normalized.experienceTags,
          experienceNote: normalized.experienceNote,
          platforms,
        })

    let drafts = fallbackDrafts
    let source = 'fallback'
    let limitReason: string | null = reservation.limitReason
    if (reservation.allowAi) {
      try {
        const prompt = draftMode === 'BRAND_INTRO'
          ? buildBrandIntroPrompt({
              brandName: context.brand.name,
              brandLocation: context.brand.location,
              brandDescription: context.brand.description,
              menuNames: menuNames(context.brand.knowledge?.menuItems),
              locale: normalized.locale,
              platforms,
            })
          : buildGameSharePrompt({
              brandName: context.brand.name,
              brandLocation: context.brand.location,
              brandDescription: context.brand.description,
              menuNames: menuNames(context.brand.knowledge?.menuItems),
              locale: normalized.locale,
              experienceTags: normalized.experienceTags,
              experienceNote: normalized.experienceNote,
              platforms,
            })
        const result = await callLLM('copywriting', prompt, 700)
        const parsed = result.text ? parseGeneratedDrafts(result.text, platforms) : null
        if (parsed) {
          drafts = parsed
          source = 'ai'
        } else {
          limitReason = result.text ? 'INVALID_AI_OUTPUT' : 'AI_UNAVAILABLE'
        }
      } catch (error) {
        console.error('[POST /api/game/share-drafts] AI fallback', error)
        limitReason = 'AI_UNAVAILABLE'
      }
    }

    const generatedAt = new Date()
    await prisma.gameShareDraft.updateMany({
      where: { id: reservation.draft.id, generationCount: reservation.reservedGeneration },
      data: {
        drafts: drafts as Prisma.InputJsonValue,
        generationSource: source,
        lastLimitReason: limitReason,
        generatedAt,
      },
    })

    return NextResponse.json({
      draftId: reservation.draft.id,
      mode: draftMode,
      locale: normalized.locale,
      experienceTags: normalized.experienceTags,
      experienceNote: normalized.experienceNote,
      drafts,
      source,
      generationsUsed: reservation.reservedGeneration,
      generationsRemaining: Math.max(GAME_SHARE_SESSION_LIMIT - reservation.reservedGeneration, 0),
      limitReason,
      generatedAt,
    })
  } catch (error: unknown) {
    console.error('[POST /api/game/share-drafts]', error)
    const message = error instanceof Error ? error.message : 'Unable to generate sharing drafts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
