import assert from 'node:assert/strict'
import fs from 'node:fs'

const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../prisma/migrations/20260813190000_add_brand_growth_sync_outbox/migration.sql', import.meta.url), 'utf8')
const sync = fs.readFileSync(new URL('../src/lib/brandGrowthSync.ts', import.meta.url), 'utf8')
const growthClient = fs.readFileSync(new URL('../src/lib/growthDataCenter.ts', import.meta.url), 'utf8')
const unifiedCron = fs.readFileSync(new URL('../src/app/api/cron/growth-sync/route.ts', import.meta.url), 'utf8')
const legacyCron = fs.readFileSync(new URL('../src/app/api/cron/brand-identity-sync/route.ts', import.meta.url), 'utf8')
const statusRoute = fs.readFileSync(new URL('../src/app/api/brands/[id]/growth-sync/route.ts', import.meta.url), 'utf8')
const view = fs.readFileSync(new URL('../src/components/dashboard/BrandProfileView.tsx', import.meta.url), 'utf8')
const brandCreateRoute = fs.readFileSync(new URL('../src/app/api/brands/route.ts', import.meta.url), 'utf8')

assert(schema.includes('model BrandGrowthSyncState'))
assert(schema.includes('growthSyncState   BrandGrowthSyncState?'))
assert(schema.includes('industry          String?'))
assert(schema.includes('latitude          Float?'))
assert(migration.includes("'BACKFILL'"), 'historical brands must be automatically queued')
assert(migration.includes('WHERE b."status" <> \'ARCHIVED\''))

for (const delay of ['60_000', '5 * 60_000', '15 * 60_000', '60 * 60_000']) {
  assert(sync.includes(delay), `retry delay ${delay} missing`)
}
assert(sync.includes("storeId: 'main'"), 'placeholder primary store missing')
assert(sync.includes("'pending_details'"), 'placeholder status missing')
assert(sync.includes('seedInitialBrandStores'), 'real registration stores must be persisted before queueing')
assert(brandCreateRoute.includes('seedInitialBrandStores'), 'brand registration must consume real stores')
assert(sync.includes("where: { status: { not: 'ARCHIVED' }, growthSyncState: null }"))
assert(sync.includes("status: 'PROCESSING', updatedAt: state.updatedAt"), 'newer local edits must supersede in-flight sync results')
assert(sync.includes("existing?.mode === 'BACKFILL' ? 'BACKFILL'"), 'user edits must not cancel the remaining historical backfill')
assert(!sync.includes("return next.includes('*') ? ['*'] : next"), 'explicit dirty paths must survive beside the backfill wildcard')
assert(sync.includes("action: 'overwrite_growth' | 'use_growth'"))
assert(sync.includes("'growth_auth_error'"))
assert(sync.includes("'growth_link_rebuilding'"))
assert(sync.includes("'growth_unavailable'"))

assert(growthClient.includes('/v1/internal/merchant-snapshots/amc-kanban/'))
assert(unifiedCron.includes('processPendingBrandGrowthSync'))
assert(unifiedCron.includes('processPendingIdentityChanges'))
assert(legacyCron.includes("from '../growth-sync/route'"))
assert(statusRoute.includes("body.action === 'overwrite_growth' || body.action === 'use_growth'"))
assert(view.includes('本地修改已保存，正在同步到 AMC-Growth'))
assert(view.includes('下次重试'))
assert(view.includes('store_${crypto.randomUUID()}'))

console.log('brand Growth sync contract tests passed')
