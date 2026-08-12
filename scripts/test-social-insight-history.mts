import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  dateOnlyInTimeZone,
  parseSocialInsightRange,
  shiftDateOnly,
} from '../src/lib/socialInsightDates.ts'
import { normalizeSocialUrl, stableSocialSourceKey } from '../src/lib/socialInsightIdentity.ts'

const singapore = parseSocialInsightRange('2026-08-01', '2026-08-12', 'Asia/Singapore', new Date('2026-08-12T12:00:00Z'))
assert.equal(singapore.from.toISOString(), '2026-07-31T16:00:00.000Z')
assert.equal(singapore.to.toISOString(), '2026-08-12T15:59:59.999Z')
assert.equal(singapore.days, 12)
assert.equal(singapore.previousTo.getTime(), singapore.from.getTime() - 1)
assert.equal(singapore.previousFrom.toISOString(), '2026-07-19T16:00:00.000Z')

const dstDay = parseSocialInsightRange('2026-03-08', '2026-03-08', 'America/New_York', new Date('2026-03-10T12:00:00Z'))
assert.equal(dstDay.from.toISOString(), '2026-03-08T05:00:00.000Z')
assert.equal(dstDay.to.toISOString(), '2026-03-09T03:59:59.999Z')
assert.equal(dstDay.days, 1)
assert.equal(dstDay.previousFrom.toISOString(), '2026-03-07T05:00:00.000Z')
assert.equal(dstDay.previousTo.toISOString(), '2026-03-08T04:59:59.999Z')

const crossYear = parseSocialInsightRange('2025-12-30', '2026-01-02', 'Asia/Singapore', new Date('2026-01-03T00:00:00Z'))
assert.equal(crossYear.days, 4)
assert.equal(shiftDateOnly('2025-12-31', 1), '2026-01-01')
assert.equal(dateOnlyInTimeZone(new Date('2025-12-31T16:30:00Z'), 'Asia/Singapore'), '2026-01-01')

const isoRange = parseSocialInsightRange('2026-08-01T00:00:00.000Z', '2026-08-02T12:00:00.000Z', 'UTC', new Date('2026-08-03T00:00:00Z'))
assert.equal(isoRange.from.toISOString(), '2026-08-01T00:00:00.000Z')
assert.equal(isoRange.to.toISOString(), '2026-08-02T12:00:00.000Z')

assert.throws(() => parseSocialInsightRange('2026-02-30', '2026-03-01', 'UTC'))
assert.throws(() => parseSocialInsightRange('2026-08-13', '2026-08-13', 'Asia/Singapore', new Date('2026-08-12T12:00:00Z')))
assert.throws(() => parseSocialInsightRange('2026-08-10', '2026-08-01', 'UTC'))

assert.equal(normalizeSocialUrl('https://www.instagram.com/p/ABC/?utm_source=test#comments'), 'instagram.com/p/abc')
assert.equal(
  stableSocialSourceKey({ externalId: 'post-123', platform: 'instagram' }),
  'id:post-123',
)
assert.equal(
  stableSocialSourceKey({ postUrl: 'https://instagram.com/p/ABC/?x=1', platform: 'instagram' }),
  stableSocialSourceKey({ postUrl: 'https://www.instagram.com/p/ABC#x', platform: 'instagram' }),
)
assert.equal(
  stableSocialSourceKey({ platform: 'instagram', handle: 'Brand', publishedAt: '2026-08-01T10:00:00Z', text: ' Hello   World ' }),
  stableSocialSourceKey({ platform: 'INSTAGRAM', handle: 'brand', publishedAt: '2026-08-01T20:00:00Z', text: 'hello world' }),
)

const route = await readFile(new URL('../src/app/api/brands/[id]/social-insight/route.ts', import.meta.url), 'utf8')
const picker = await readFile(new URL('../src/components/dashboard/SocialInsightDateRangePicker.tsx', import.meta.url), 'utf8')
const backfill = await readFile(new URL('./backfill-social-insight-history.mjs', import.meta.url), 'utf8')
const migration = await readFile(new URL('../prisma/migrations/20260812100000_add_social_insight_history/migration.sql', import.meta.url), 'utf8')

assert(route.includes('parseSocialInsightRange(fromParam, toParam, brand.timezone)'))
assert(route.includes('loadPersistedPosts(id, from, to, platformFilter)'))
assert(route.includes('previousPosts'))
assert(route.includes('normalizedReviews'))
assert(!route.includes('Date range cannot exceed 180 days'))
assert(!route.includes('sixMonthsBeforeFrom'))
assert(picker.includes('numberOfMonths={mobile ? 1 : 2}'))
assert(picker.includes('disabled={{ after: today }}'))
assert(picker.includes('resetOnSelect'))
assert(backfill.includes("process.argv.includes('--apply')"))
assert(migration.includes('SocialInsightPostMetric'))
assert(migration.includes('SocialInsightAccountMetric_brandId_platform_snapshotDate_idx'))

console.log('social insight history tests passed')
