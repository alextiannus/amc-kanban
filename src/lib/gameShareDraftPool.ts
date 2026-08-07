import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { callLLM } from '@/lib/llmRouter'
import { prisma } from '@/lib/prisma'
import {
  buildAutoSharePoolPrompt,
  enabledSharePlatforms,
  parseGeneratedDraftBundles,
  type GameShareDrafts,
  type GameShareLocale,
  type GameSharePlatform,
} from '@/lib/gameShareDrafts'

export const GAME_SHARE_POOL_TARGET = 5
export const GAME_SHARE_DRAFT_LEASE_MS = 15 * 60 * 1000
const GAME_SHARE_POOL_TASK_LEASE_MS = 5 * 60 * 1000

type PoolDb = PrismaClient | Prisma.TransactionClient

export type GameSharePoolContext = {
  gameConfigId: string
  brandId: string
  brandName: string
  brandLocation: string | null
  brandDescription: string | null
  menuNames: string[]
  platforms: GameSharePlatform[]
  fingerprint: string
}

function publicMenuNames(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const record = item as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name.trim() : ''
      const isPublic = record.isPublic
      return name && isPublic !== false ? name : null
    })
    .filter((name): name is string => Boolean(name))
    .slice(0, 20)
}

export function buildGameSharePoolFingerprint(input: {
  brandName: string
  brandLocation: string | null
  brandDescription: string | null
  menuNames: string[]
  platforms: GameSharePlatform[]
}) {
  return createHash('sha256').update(JSON.stringify({
    name: input.brandName.trim(),
    location: input.brandLocation?.trim() || null,
    description: input.brandDescription?.trim() || null,
    menuNames: input.menuNames.map((name) => name.trim()).filter(Boolean).sort(),
    platforms: [...input.platforms].sort(),
  })).digest('hex')
}

export async function getGameSharePoolContext(db: PoolDb, gameConfigId: string): Promise<GameSharePoolContext | null> {
  const config = await db.gameConfig.findUnique({
    where: { id: gameConfigId },
    select: {
      id: true,
      brandId: true,
      taskReviewEnabled: true,
      taskGoogleMapsEnabled: true,
      taskXiaohongshuEnabled: true,
      taskInstagramEnabled: true,
      brand: {
        select: {
          name: true,
          location: true,
          description: true,
          knowledge: { select: { menuItems: true } },
        },
      },
    },
  })
  if (!config || config.taskReviewEnabled === false) return null
  const platforms = enabledSharePlatforms(config)
  const menuNames = publicMenuNames(config.brand.knowledge?.menuItems)
  const common = {
    brandName: config.brand.name,
    brandLocation: config.brand.location,
    brandDescription: config.brand.description,
    menuNames,
    platforms,
  }
  return {
    gameConfigId: config.id,
    brandId: config.brandId,
    ...common,
    fingerprint: buildGameSharePoolFingerprint(common),
  }
}

async function expireReservations(gameConfigId: string, locale?: GameShareLocale) {
  await prisma.gameShareDraftPoolItem.updateMany({
    where: {
      gameConfigId,
      ...(locale ? { locale } : {}),
      status: 'RESERVED',
      reservedUntil: { lte: new Date() },
    },
    data: {
      status: 'AVAILABLE',
      reservedSessionId: null,
      reservedRoundId: null,
      reservedUntil: null,
    },
  })
}

async function updatePoolCounts(context: GameSharePoolContext, locale: GameShareLocale) {
  const [availableCount, reservedCount] = await Promise.all([
    prisma.gameShareDraftPoolItem.count({
      where: { gameConfigId: context.gameConfigId, locale, configFingerprint: context.fingerprint, status: 'AVAILABLE' },
    }),
    prisma.gameShareDraftPoolItem.count({
      where: { gameConfigId: context.gameConfigId, locale, configFingerprint: context.fingerprint, status: 'RESERVED' },
    }),
  ])
  await prisma.gameShareDraftPoolState.updateMany({
    where: { gameConfigId: context.gameConfigId, locale, configFingerprint: context.fingerprint },
    data: { availableCount, reservedCount },
  })
  return { availableCount, reservedCount }
}

export async function queueGameShareDraftPoolRefill(
  gameConfigId: string,
  locales: GameShareLocale[] = ['zh', 'en'],
) {
  const context = await getGameSharePoolContext(prisma, gameConfigId)
  if (!context || context.platforms.length === 0) return false
  for (const locale of locales) {
    const existing = await prisma.gameShareDraftPoolState.findUnique({
      where: { gameConfigId_locale: { gameConfigId, locale } },
      select: { configFingerprint: true, generationStatus: true, taskLeaseUntil: true },
    })
    const fingerprintChanged = existing?.configFingerprint !== context.fingerprint
    await prisma.gameShareDraftPoolState.upsert({
      where: { gameConfigId_locale: { gameConfigId, locale } },
      create: {
        gameConfigId,
        locale,
        configFingerprint: context.fingerprint,
        targetSize: GAME_SHARE_POOL_TARGET,
        generationStatus: 'PENDING',
      },
      update: {
        configFingerprint: context.fingerprint,
        targetSize: GAME_SHARE_POOL_TARGET,
      },
    })
    await expireReservations(gameConfigId, locale)
    const counts = await updatePoolCounts(context, locale)
    const needsRefill = fingerprintChanged || counts.availableCount + counts.reservedCount < GAME_SHARE_POOL_TARGET
    const generationLeaseActive = existing?.generationStatus === 'GENERATING'
      && Boolean(existing.taskLeaseUntil && existing.taskLeaseUntil > new Date())
    if (needsRefill && (fingerprintChanged || !generationLeaseActive)) {
      await prisma.gameShareDraftPoolState.updateMany({
        where: { gameConfigId, locale, configFingerprint: context.fingerprint },
        data: { generationStatus: 'PENDING', taskLeaseUntil: null },
      })
    } else if (!needsRefill && !generationLeaseActive) {
      await prisma.gameShareDraftPoolState.updateMany({
        where: { gameConfigId, locale, configFingerprint: context.fingerprint },
        data: { generationStatus: 'IDLE', taskLeaseUntil: null, lastError: null },
      })
    }
  }
  return true
}

export async function refillGameShareDraftPool(gameConfigId: string, locale: GameShareLocale) {
  const context = await getGameSharePoolContext(prisma, gameConfigId)
  if (!context || context.platforms.length === 0) return { generated: 0, skipped: true }

  const state = await prisma.gameShareDraftPoolState.upsert({
    where: { gameConfigId_locale: { gameConfigId, locale } },
    create: {
      gameConfigId,
      locale,
      configFingerprint: context.fingerprint,
      targetSize: GAME_SHARE_POOL_TARGET,
      generationStatus: 'PENDING',
    },
    update: { configFingerprint: context.fingerprint, targetSize: GAME_SHARE_POOL_TARGET },
    select: { id: true },
  })
  const now = new Date()
  const acquired = await prisma.gameShareDraftPoolState.updateMany({
    where: {
      id: state.id,
      configFingerprint: context.fingerprint,
      OR: [
        { generationStatus: { not: 'GENERATING' } },
        { taskLeaseUntil: null },
        { taskLeaseUntil: { lte: now } },
      ],
    },
    data: {
      generationStatus: 'GENERATING',
      taskLeaseUntil: new Date(now.getTime() + GAME_SHARE_POOL_TASK_LEASE_MS),
      lastError: null,
    },
  })
  if (acquired.count === 0) return { generated: 0, skipped: true }

  try {
    await expireReservations(gameConfigId, locale)
    const counts = await updatePoolCounts(context, locale)
    const missing = Math.max(GAME_SHARE_POOL_TARGET - counts.availableCount - counts.reservedCount, 0)
    if (missing === 0) {
      await prisma.gameShareDraftPoolState.updateMany({
        where: { id: state.id, configFingerprint: context.fingerprint },
        data: { generationStatus: 'IDLE', taskLeaseUntil: null, lastError: null },
      })
      return { generated: 0, skipped: false }
    }

    const prompt = buildAutoSharePoolPrompt({
      brandName: context.brandName,
      brandLocation: context.brandLocation,
      brandDescription: context.brandDescription,
      menuNames: context.menuNames,
      locale,
      platforms: context.platforms,
      bundleCount: missing,
    })
    const result = await callLLM('copywriting', prompt, Math.max(1200, missing * 800))
    const bundles = result.text ? parseGeneratedDraftBundles(result.text, context.platforms, missing) : null
    if (!bundles) throw new Error(result.text ? 'AI returned invalid or duplicate draft bundles.' : 'All copywriting models are unavailable.')

    const latestContext = await getGameSharePoolContext(prisma, gameConfigId)
    if (!latestContext || latestContext.fingerprint !== context.fingerprint) {
      throw new Error('Brand or platform configuration changed during generation; retrying with the latest fingerprint.')
    }
    const generatedAt = new Date()
    await prisma.gameShareDraftPoolItem.createMany({
      data: bundles.map((drafts) => ({
        gameConfigId,
        locale,
        drafts: drafts as Prisma.InputJsonValue,
        configFingerprint: context.fingerprint,
        status: 'AVAILABLE',
        generationSource: 'ai',
        generatedAt,
      })),
    })
    const updatedCounts = await updatePoolCounts(context, locale)
    await prisma.gameShareDraftPoolState.updateMany({
      where: { id: state.id, configFingerprint: context.fingerprint },
      data: {
        generationStatus: updatedCounts.availableCount + updatedCounts.reservedCount >= GAME_SHARE_POOL_TARGET ? 'IDLE' : 'PENDING',
        taskLeaseUntil: null,
        lastGeneratedAt: generatedAt,
        lastError: null,
      },
    })
    return { generated: bundles.length, skipped: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refill sharing draft pool'
    await prisma.gameShareDraftPoolState.updateMany({
      where: { id: state.id, configFingerprint: context.fingerprint },
      data: { generationStatus: 'ERROR', taskLeaseUntil: null, lastError: message.slice(0, 1000) },
    })
    console.error(`[GameShareDraftPool] ${gameConfigId}/${locale}`, error)
    return { generated: 0, skipped: false, error: message }
  }
}

export async function requestGameShareDraftPoolRefill(
  gameConfigId: string,
  locales: GameShareLocale[] = ['zh', 'en'],
) {
  const queued = await queueGameShareDraftPoolRefill(gameConfigId, locales)
  if (!queued) return []
  return Promise.all(locales.map((locale) => refillGameShareDraftPool(gameConfigId, locale)))
}

export async function processGameShareDraftPoolQueue(limit = 10) {
  const configs = await prisma.gameConfig.findMany({
    where: {
      taskReviewEnabled: true,
      OR: [
        { shareDraftPoolStates: { none: {} } },
        {
          AND: [
            { shareDraftPoolStates: { some: { locale: 'zh' } } },
            { shareDraftPoolStates: { none: { locale: 'en' } } },
          ],
        },
        {
          AND: [
            { shareDraftPoolStates: { some: { locale: 'en' } } },
            { shareDraftPoolStates: { none: { locale: 'zh' } } },
          ],
        },
      ],
    },
    select: { id: true, shareDraftPoolStates: { select: { locale: true } } },
    orderBy: { updatedAt: 'asc' },
    take: 20,
  })
  for (const config of configs) {
    const locales = new Set(config.shareDraftPoolStates.map((state: { locale: string }) => state.locale))
    const missingLocales = (['zh', 'en'] as GameShareLocale[]).filter((locale) => !locales.has(locale))
    if (missingLocales.length) await queueGameShareDraftPoolRefill(config.id, missingLocales)
  }

  const states = await prisma.gameShareDraftPoolState.findMany({
    where: {
      OR: [
        { generationStatus: { in: ['PENDING', 'ERROR'] } },
        { generationStatus: 'GENERATING', taskLeaseUntil: { lte: new Date() } },
      ],
    },
    select: { gameConfigId: true, locale: true },
    orderBy: { updatedAt: 'asc' },
    take: Math.max(1, Math.min(limit, 50)),
  })
  const results = []
  for (const state of states) {
    if (state.locale !== 'zh' && state.locale !== 'en') continue
    results.push({
      gameConfigId: state.gameConfigId,
      locale: state.locale,
      ...(await refillGameShareDraftPool(state.gameConfigId, state.locale)),
    })
  }
  return results
}

export async function leaseGameShareDraftBundle(input: {
  gameConfigId: string
  sessionId: string
  roundId: string
  locale: GameShareLocale
}) {
  const context = await getGameSharePoolContext(prisma, input.gameConfigId)
  if (!context || context.platforms.length === 0) return { context, item: null }
  const now = new Date()
  const reservedUntil = new Date(now.getTime() + GAME_SHARE_DRAFT_LEASE_MS)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const item = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.gameShareDraftPoolItem.updateMany({
          where: {
            gameConfigId: input.gameConfigId,
            locale: input.locale,
            status: 'RESERVED',
            reservedUntil: { lte: now },
          },
          data: { status: 'AVAILABLE', reservedSessionId: null, reservedRoundId: null, reservedUntil: null },
        })
        const existing = await tx.gameShareDraftPoolItem.findFirst({
          where: {
            gameConfigId: input.gameConfigId,
            locale: input.locale,
            configFingerprint: context.fingerprint,
            status: 'RESERVED',
            reservedSessionId: input.sessionId,
            reservedRoundId: input.roundId,
            reservedUntil: { gt: now },
          },
          orderBy: { updatedAt: 'desc' },
        })
        if (existing) {
          return tx.gameShareDraftPoolItem.update({ where: { id: existing.id }, data: { reservedUntil } })
        }
        const available = await tx.gameShareDraftPoolItem.findFirst({
          where: {
            gameConfigId: input.gameConfigId,
            locale: input.locale,
            configFingerprint: context.fingerprint,
            status: 'AVAILABLE',
          },
          orderBy: { generatedAt: 'asc' },
        })
        if (!available) return null
        const reserved = await tx.gameShareDraftPoolItem.updateMany({
          where: { id: available.id, status: 'AVAILABLE' },
          data: {
            status: 'RESERVED',
            reservedSessionId: input.sessionId,
            reservedRoundId: input.roundId,
            reservedUntil,
          },
        })
        if (reserved.count !== 1) throw new Error('Draft reservation conflict')
        return tx.gameShareDraftPoolItem.findUnique({ where: { id: available.id } })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      await updatePoolCounts(context, input.locale)
      return { context, item }
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        ? ['P2002', 'P2034'].includes(error.code)
        : error instanceof Error && error.message === 'Draft reservation conflict'
      if (attempt < 2 && retryable) continue
      throw error
    }
  }
  return { context, item: null }
}

export function poolDrafts(value: Prisma.JsonValue): GameShareDrafts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: GameShareDrafts = {}
  for (const platform of ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'] as const) {
    const draft = (value as Record<string, unknown>)[platform]
    if (typeof draft === 'string' && draft.trim()) result[platform] = draft
  }
  return result
}

export async function getGameShareDraftPoolStatus(gameConfigId: string) {
  const context = await getGameSharePoolContext(prisma, gameConfigId)
  if (!context) return null
  await expireReservations(gameConfigId)
  const locales = {} as Record<GameShareLocale, {
    available: number
    reserved: number
    status: string
    lastGeneratedAt: Date | null
    lastError: string | null
  }>
  for (const locale of ['zh', 'en'] as GameShareLocale[]) {
    const counts = await updatePoolCounts(context, locale)
    const state = await prisma.gameShareDraftPoolState.findUnique({
      where: { gameConfigId_locale: { gameConfigId, locale } },
      select: { generationStatus: true, lastGeneratedAt: true, lastError: true },
    })
    locales[locale] = {
      available: counts.availableCount,
      reserved: counts.reservedCount,
      status: state?.generationStatus || 'PENDING',
      lastGeneratedAt: state?.lastGeneratedAt || null,
      lastError: state?.lastError || null,
    }
  }
  return { targetSize: GAME_SHARE_POOL_TARGET, fingerprint: context.fingerprint, locales }
}
