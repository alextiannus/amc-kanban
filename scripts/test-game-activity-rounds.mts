import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  assertNoRoundOverlap,
  assertRoundWindow,
  assertValidTimeZone,
  findActiveAndNextGameRounds,
} from '../src/lib/gameActivityRounds.ts'

assert.doesNotThrow(() => assertRoundWindow(new Date('2026-08-08T00:00:00Z'), new Date('2026-08-09T00:00:00Z')))
assert.throws(() => assertRoundWindow(new Date('2026-08-09T00:00:00Z'), new Date('2026-08-09T00:00:00Z')), /later/)
assert.doesNotThrow(() => assertValidTimeZone('Asia/Shanghai'))
assert.throws(() => assertValidTimeZone('Invalid/Timezone'), /valid IANA/)

const active = { id: 'active', startsAt: new Date('2026-08-07T00:00:00Z'), endsAt: new Date('2026-08-08T00:00:00Z') }
const next = { id: 'next', startsAt: new Date('2026-08-09T00:00:00Z'), endsAt: new Date('2026-08-10T00:00:00Z') }
const roundReader = {
  gameActivityRound: {
    findFirst: async (args: { where: { startsAt: { lte?: Date; gt?: Date } } }) => args.where.startsAt.lte ? active : next,
  },
}
assert.deepEqual(await findActiveAndNextGameRounds(roundReader as never, 'config', new Date('2026-08-07T12:00:00Z')), { activeRound: active, nextRound: next })
await assert.doesNotReject(() => assertNoRoundOverlap({ gameActivityRound: { findFirst: async () => null } } as never, {
  gameConfigId: 'config', startsAt: active.startsAt, endsAt: active.endsAt,
}))
await assert.rejects(() => assertNoRoundOverlap({ gameActivityRound: { findFirst: async () => ({ id: 'overlap' }) } } as never, {
  gameConfigId: 'config', startsAt: active.startsAt, endsAt: active.endsAt,
}), /cannot overlap/)

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [schema, migration, rewardRoute, roundsRoute, statusRoute, spinRoute, client, dashboard] = await Promise.all([
  readFile(`${repoRoot}/prisma/schema.prisma`, 'utf8'),
  readFile(`${repoRoot}/prisma/migrations/20260807180000_add_game_activity_rounds/migration.sql`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/entry-reward/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/rounds/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/status/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/spin/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/game/[brandId]/CustomerGameClient.tsx`, 'utf8'),
  readFile(`${repoRoot}/src/components/dashboard/GameSettingsDashboard.tsx`, 'utf8'),
])

assert.match(schema, /model GameActivityRound/)
assert.match(schema, /model GameEntryReward/)
assert.match(schema, /@@unique\(\[roundId, sessionId\]\)/)
assert.match(migration, /CREATE UNIQUE INDEX "GameEntryReward_roundId_sessionId_key"/)
assert.doesNotMatch(migration, /INSERT INTO "GameActivityRound"/, 'deployment must not auto-create a Super Rola round')
assert.match(migration, /cmr8o494f006trg2af6m9qb34/)

assert.match(rewardRoute, /TransactionIsolationLevel\.Serializable/)
assert.match(rewardRoute, /pointsBalance: \{ increment: 5 \}/)
assert.match(rewardRoute, /alreadyClaimed: true/)
assert.match(rewardRoute, /\['P2002', 'P2034'\]/)
assert.doesNotMatch(rewardRoute, /body\?\.roundId/)
assert.match(roundsRoute, /Activity rounds cannot overlap|assertNoRoundOverlap/)
assert.match(roundsRoute, /The start time of an active round is locked/)
assert.match(roundsRoute, /An ended round is read-only/)
assert.match(roundsRoute, /assertValidTimeZone/)
assert.match(statusRoute, /activeRound: publicGameRound/)
assert.match(statusRoute, /nextRound: publicGameRound/)
assert.match(statusRoute, /entryRewardClaimed: Boolean/)
assert.match(spinRoute, /findActiveAndNextGameRounds/)
assert.match(client, /window\.addEventListener\('pageshow'/)
assert.match(client, /window\.addEventListener\('focus'/)
assert.match(client, /activityPaused/)
assert.match(dashboard, /type="datetime-local"/)
assert.match(dashboard, /activityRoundStatus\(round\)/)

console.log('Game activity-round and one-entry-reward contract passed.')
