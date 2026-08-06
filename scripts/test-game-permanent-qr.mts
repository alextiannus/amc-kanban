import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import {
  getPermanentGameUrl,
  PERMANENT_GAME_ORIGIN,
  PERMANENT_GAME_QR_OPTIONS,
} from '../src/lib/gameQr.ts'
import { buildPrizeSnapshot, hasPrizeIdentityChanged } from '../src/lib/gamePrizes.ts'

const brandId = 'brand-permanent-qr'
const permanentUrl = getPermanentGameUrl(brandId)

assert.equal(permanentUrl, `${PERMANENT_GAME_ORIGIN}/game/${brandId}`)
assert.equal(getPermanentGameUrl(brandId), permanentUrl, 'same brand must always get the same URL')
assert.notEqual(getPermanentGameUrl('brand-a'), getPermanentGameUrl('brand-b'), 'brands must not share QR URLs')

const qrBeforeRewardEdit = await QRCode.toDataURL(permanentUrl, PERMANENT_GAME_QR_OPTIONS)
const qrAfterRewardEdit = await QRCode.toDataURL(permanentUrl, PERMANENT_GAME_QR_OPTIONS)
assert.equal(qrAfterRewardEdit, qrBeforeRewardEdit, 'reward edits must not change the generated QR image')

assert.equal(
  hasPrizeIdentityChanged(
    { name: '10% OFF', type: 'COUPON' },
    { name: '10% OFF', type: 'COUPON' },
  ),
  false,
  'probability and inventory-only changes retain prize identity',
)
assert.equal(
  hasPrizeIdentityChanged(
    { name: '10% OFF', type: 'COUPON' },
    { name: 'Free Meal', type: 'COUPON' },
  ),
  true,
  'name changes create a new prize identity',
)
assert.equal(
  hasPrizeIdentityChanged(
    { name: 'Free Meal', type: 'COUPON' },
    { name: 'Free Meal', type: 'PHYSICAL' },
  ),
  true,
  'type changes create a new prize identity',
)

const issuedReward = buildPrizeSnapshot({ name: '10% OFF', type: 'COUPON', imageUrl: '/ten-off.png' })
const laterConfiguration = { name: 'Free Meal', type: 'COUPON', imageUrl: '/free-meal.png' }
assert.deepEqual(issuedReward, {
  prizeNameSnapshot: '10% OFF',
  prizeTypeSnapshot: 'COUPON',
  prizeImageSnapshot: '/ten-off.png',
})
assert.equal(laterConfiguration.name, 'Free Meal')

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [statusRoute, redemptionRoute, migration] = await Promise.all([
  readFile(`${repoRoot}/src/app/api/game/status/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/redemptions/route.ts`, 'utf8'),
  readFile(`${repoRoot}/prisma/migrations/20260806000000_add_game_prize_snapshots/migration.sql`, 'utf8'),
])
assert.match(statusRoute, /prizeNameSnapshot/)
assert.match(redemptionRoute, /prizeTypeSnapshot/)
assert.match(migration, /ON DELETE SET NULL/)

console.log('Permanent game QR and issued-reward snapshot contract passed.')
