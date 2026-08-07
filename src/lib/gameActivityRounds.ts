import type { Prisma } from '@prisma/client'

export type PublicGameRound = {
  id: string
  startsAt: Date
  endsAt: Date
}

type RoundReader = Pick<Prisma.TransactionClient, 'gameActivityRound'>

export function publicGameRound(round: PublicGameRound | null | undefined) {
  return round ? {
    id: round.id,
    startsAt: round.startsAt,
    endsAt: round.endsAt,
  } : null
}

export async function findActiveAndNextGameRounds(
  db: RoundReader,
  gameConfigId: string,
  now: Date = new Date(),
) {
  const [activeRound, nextRound] = await Promise.all([
    db.gameActivityRound.findFirst({
      where: {
        gameConfigId,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: { startsAt: 'desc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    db.gameActivityRound.findFirst({
      where: {
        gameConfigId,
        startsAt: { gt: now },
      },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
  ])
  return { activeRound, nextRound }
}

export function parseRoundDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid ISO date-time.`)
  }
  return parsed
}

export function assertRoundWindow(startsAt: Date, endsAt: Date) {
  if (startsAt >= endsAt) {
    throw new Error('Round end time must be later than its start time.')
  }
}

export function assertValidTimeZone(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('timezone must be a valid IANA time zone.')
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.trim() }).format(new Date())
  } catch {
    throw new Error('timezone must be a valid IANA time zone.')
  }
}

export async function assertNoRoundOverlap(
  db: RoundReader,
  input: { gameConfigId: string; startsAt: Date; endsAt: Date; excludeRoundId?: string },
) {
  const overlap = await db.gameActivityRound.findFirst({
    where: {
      gameConfigId: input.gameConfigId,
      ...(input.excludeRoundId ? { id: { not: input.excludeRoundId } } : {}),
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
    select: { id: true },
  })
  if (overlap) {
    throw new Error('Activity rounds cannot overlap.')
  }
}
