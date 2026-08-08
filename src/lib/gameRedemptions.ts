import type { Prisma } from '@prisma/client'

export type GameRedemptionDisplayStatus = 'UNCLAIMED' | 'CLAIMED' | 'EXPIRED'

export type ClaimedGameRedemption = {
  id: string
  redemptionCode: string
  status: 'CLAIMED'
  prizeName: string
  prizeType: string
  createdAt: Date
  claimedAt: Date
  expiresAt: Date | null
  sessionId: string
  alreadyClaimed: boolean
}

export type ExpiredGameRedemption = {
  id: string
  status: 'EXPIRED'
}

export type GameRedemptionOutcome = ClaimedGameRedemption | ExpiredGameRedemption

export class GameRedemptionError extends Error {
  readonly code: string
  readonly status: number

  constructor(
    message: string,
    code: string,
    status: number,
  ) {
    super(message)
    this.name = 'GameRedemptionError'
    this.code = code
    this.status = status
  }
}

const redemptionSelect = {
  id: true,
  redemptionCode: true,
  status: true,
  prizeNameSnapshot: true,
  prizeTypeSnapshot: true,
  createdAt: true,
  claimedAt: true,
  expiresAt: true,
  session: {
    select: {
      id: true,
      sessionId: true,
      brandId: true,
    },
  },
} satisfies Prisma.GameSpinLogSelect

type RedemptionLog = Prisma.GameSpinLogGetPayload<{ select: typeof redemptionSelect }>

type ClaimGameRedemptionInput = {
  brandId: string
  publicSessionId?: string
  spinLogId?: string
  redemptionCode?: string
  now?: Date
}

export function effectiveGameRedemptionStatus(
  status: string,
  expiresAt: Date | null,
  now = new Date(),
): GameRedemptionDisplayStatus {
  if (status === 'CLAIMED') return 'CLAIMED'
  if (status === 'EXPIRED' || (expiresAt && expiresAt.getTime() <= now.getTime())) return 'EXPIRED'
  return 'UNCLAIMED'
}

function claimedResult(log: RedemptionLog, alreadyClaimed: boolean): ClaimedGameRedemption {
  if (!log.claimedAt) {
    throw new GameRedemptionError('The redemption record is incomplete.', 'REDEMPTION_STATE_INVALID', 409)
  }

  return {
    id: log.id,
    redemptionCode: log.redemptionCode,
    status: 'CLAIMED',
    prizeName: log.prizeNameSnapshot,
    prizeType: log.prizeTypeSnapshot,
    createdAt: log.createdAt,
    claimedAt: log.claimedAt,
    expiresAt: log.expiresAt,
    sessionId: log.session.sessionId,
    alreadyClaimed,
  }
}

async function findRedemptionLog(
  tx: Prisma.TransactionClient,
  input: ClaimGameRedemptionInput,
): Promise<RedemptionLog | null> {
  if (input.spinLogId) {
    return tx.gameSpinLog.findUnique({
      where: { id: input.spinLogId },
      select: redemptionSelect,
    })
  }

  if (input.redemptionCode) {
    return tx.gameSpinLog.findUnique({
      where: { redemptionCode: input.redemptionCode },
      select: redemptionSelect,
    })
  }

  return null
}

function assertRedemptionOwnership(log: RedemptionLog | null, input: ClaimGameRedemptionInput): asserts log is RedemptionLog {
  if (
    !log
    || log.session.brandId !== input.brandId
    || (input.publicSessionId && log.session.sessionId !== input.publicSessionId)
  ) {
    throw new GameRedemptionError('Redemption not found.', 'REDEMPTION_NOT_FOUND', 404)
  }
}

export async function claimGameRedemption(
  tx: Prisma.TransactionClient,
  input: ClaimGameRedemptionInput,
): Promise<GameRedemptionOutcome> {
  const now = input.now ?? new Date()
  const initial = await findRedemptionLog(tx, input)
  assertRedemptionOwnership(initial, input)

  if (initial.prizeTypeSnapshot === 'THANKS' || initial.status === 'RECORDED') {
    throw new GameRedemptionError(
      'This result does not need redemption.',
      'REDEMPTION_NOT_REQUIRED',
      400,
    )
  }
  if (initial.status === 'CLAIMED') return claimedResult(initial, true)

  if (effectiveGameRedemptionStatus(initial.status, initial.expiresAt, now) === 'EXPIRED') {
    if (initial.status === 'UNCLAIMED') {
      await tx.gameSpinLog.updateMany({
        where: { id: initial.id, status: 'UNCLAIMED' },
        data: { status: 'EXPIRED' },
      })
    }
    return { id: initial.id, status: 'EXPIRED' }
  }
  if (initial.status !== 'UNCLAIMED') {
    throw new GameRedemptionError('This redemption cannot be used.', 'REDEMPTION_STATE_INVALID', 409)
  }

  const updated = await tx.gameSpinLog.updateMany({
    where: {
      id: initial.id,
      status: 'UNCLAIMED',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    data: {
      status: 'CLAIMED',
      claimedAt: now,
    },
  })

  const current = await tx.gameSpinLog.findUnique({
    where: { id: initial.id },
    select: redemptionSelect,
  })
  assertRedemptionOwnership(current, input)

  if (updated.count === 1 && current.status === 'CLAIMED') return claimedResult(current, false)
  if (current.status === 'CLAIMED') return claimedResult(current, true)

  if (effectiveGameRedemptionStatus(current.status, current.expiresAt, now) === 'EXPIRED') {
    if (current.status === 'UNCLAIMED') {
      await tx.gameSpinLog.updateMany({
        where: { id: current.id, status: 'UNCLAIMED' },
        data: { status: 'EXPIRED' },
      })
    }
    return { id: current.id, status: 'EXPIRED' }
  }

  throw new GameRedemptionError('This redemption cannot be used.', 'REDEMPTION_STATE_INVALID', 409)
}
