import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Prisma } from '@prisma/client'
import {
  claimGameRedemption,
  effectiveGameRedemptionStatus,
  GameRedemptionError,
} from '../src/lib/gameRedemptions.ts'

type FakeLog = {
  id: string
  redemptionCode: string
  status: string
  prizeNameSnapshot: string
  prizeTypeSnapshot: string
  createdAt: Date
  claimedAt: Date | null
  expiresAt: Date | null
  session: { id: string; sessionId: string; brandId: string }
}

function cloneLog(log: FakeLog): FakeLog {
  return { ...log, session: { ...log.session } }
}

function createFakeTransaction(overrides: Partial<FakeLog> = {}) {
  const record: FakeLog = {
    id: 'spin-1',
    redemptionCode: 'ABC123',
    status: 'UNCLAIMED',
    prizeNameSnapshot: 'Free coffee',
    prizeTypeSnapshot: 'COUPON',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    claimedAt: null,
    expiresAt: new Date('2026-09-07T00:00:00.000Z'),
    session: { id: 'session-row-1', sessionId: 'browser-session-1', brandId: 'brand-1' },
    ...overrides,
  }
  let updateQueue = Promise.resolve()

  const tx = {
    gameSpinLog: {
      findUnique: async ({ where }: { where: { id?: string; redemptionCode?: string } }) => {
        if (where.id && where.id !== record.id) return null
        if (where.redemptionCode && where.redemptionCode !== record.redemptionCode) return null
        return cloneLog(record)
      },
      updateMany: (args: {
        where: { id?: string; status?: string; OR?: unknown[] }
        data: { status?: string; claimedAt?: Date }
      }) => {
        const operation = updateQueue.then(async () => {
          if (args.where.id && args.where.id !== record.id) return { count: 0 }
          if (args.where.status && args.where.status !== record.status) return { count: 0 }
          if (args.where.OR && record.expiresAt && args.data.claimedAt && record.expiresAt <= args.data.claimedAt) {
            return { count: 0 }
          }
          if (args.data.status) record.status = args.data.status
          if (args.data.claimedAt) record.claimedAt = args.data.claimedAt
          return { count: 1 }
        })
        updateQueue = operation.then(() => undefined, () => undefined)
        return operation
      },
    },
  }

  return { tx: tx as unknown as Prisma.TransactionClient, record }
}

const beforeExpiry = new Date('2026-08-08T08:00:00.000Z')
assert.equal(effectiveGameRedemptionStatus('UNCLAIMED', new Date('2026-08-09T00:00:00.000Z'), beforeExpiry), 'UNCLAIMED')
assert.equal(effectiveGameRedemptionStatus('UNCLAIMED', new Date('2026-08-08T07:59:59.000Z'), beforeExpiry), 'EXPIRED')
assert.equal(effectiveGameRedemptionStatus('CLAIMED', new Date('2026-08-01T00:00:00.000Z'), beforeExpiry), 'CLAIMED')

const concurrent = createFakeTransaction()
const concurrentResults = await Promise.all([
  claimGameRedemption(concurrent.tx, {
    brandId: 'brand-1',
    publicSessionId: 'browser-session-1',
    spinLogId: 'spin-1',
    now: beforeExpiry,
  }),
  claimGameRedemption(concurrent.tx, {
    brandId: 'brand-1',
    publicSessionId: 'browser-session-1',
    spinLogId: 'spin-1',
    now: beforeExpiry,
  }),
])
assert.ok(concurrentResults.every((result) => result.status === 'CLAIMED'))
assert.deepEqual(concurrentResults.map((result) => result.status === 'CLAIMED' && result.alreadyClaimed).sort(), [false, true])
assert.equal(concurrent.record.status, 'CLAIMED')
assert.equal(concurrent.record.claimedAt?.toISOString(), beforeExpiry.toISOString())

const retry = await claimGameRedemption(concurrent.tx, {
  brandId: 'brand-1',
  publicSessionId: 'browser-session-1',
  spinLogId: 'spin-1',
  now: new Date('2026-08-08T09:00:00.000Z'),
})
assert.equal(retry.alreadyClaimed, true)
assert.equal(retry.claimedAt.toISOString(), beforeExpiry.toISOString(), 'retry must preserve the first claimedAt')

await assert.rejects(
  claimGameRedemption(createFakeTransaction().tx, {
    brandId: 'brand-1',
    publicSessionId: 'another-browser',
    spinLogId: 'spin-1',
    now: beforeExpiry,
  }),
  (error: unknown) => error instanceof GameRedemptionError
    && error.code === 'REDEMPTION_NOT_FOUND'
    && error.status === 404,
)

const expired = createFakeTransaction({ expiresAt: new Date('2026-08-08T07:00:00.000Z') })
const expiredResult = await claimGameRedemption(expired.tx, {
  brandId: 'brand-1',
  publicSessionId: 'browser-session-1',
  spinLogId: 'spin-1',
  now: beforeExpiry,
})
assert.equal(expiredResult.status, 'EXPIRED')
assert.equal(expired.record.status, 'EXPIRED')

await assert.rejects(
  claimGameRedemption(createFakeTransaction({ prizeTypeSnapshot: 'THANKS', status: 'RECORDED' }).tx, {
    brandId: 'brand-1',
    publicSessionId: 'browser-session-1',
    spinLogId: 'spin-1',
    now: beforeExpiry,
  }),
  (error: unknown) => error instanceof GameRedemptionError && error.code === 'REDEMPTION_NOT_REQUIRED',
)

const staff = createFakeTransaction()
const staffResult = await claimGameRedemption(staff.tx, {
  brandId: 'brand-1',
  redemptionCode: 'ABC123',
  now: beforeExpiry,
})
assert.equal(staffResult.status, 'CLAIMED')

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [customerPage, selfRoute, statusRoute, spinRoute] = await Promise.all([
  readFile(`${repoRoot}/src/app/game/[brandId]/CustomerGameClient.tsx`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/redemptions/self/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/status/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/spin/route.ts`, 'utf8'),
])
assert.match(customerPage, /useNow: 'Use now'/)
assert.match(customerPage, /useNow: '立即使用'/)
assert.match(customerPage, /codeInvalidated: '兑换码已作废'/)
assert.match(customerPage, /Once used, this code cannot be restored/)
assert.match(selfRoute, /publicSessionId: sessionId/)
assert.match(selfRoute, /redemptionCode: null/)
assert.match(statusRoute, /status === 'UNCLAIMED' \? log\.redemptionCode : null/)
assert.match(spinRoute, /spinLogId: isThanks \? null : spinLog\.id/)

console.log('Game self-redemption, ownership, expiry, and concurrency contracts passed.')
