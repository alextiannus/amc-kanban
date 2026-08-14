import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [sso, sidebar, permissions, retiredPlanning, execution, contentContext, migration] = await Promise.all([
  read('src/app/api/integrations/amc-growth/sso/start/route.ts'),
  read('src/components/layout/Sidebar.tsx'),
  read('src/lib/permissions.ts'),
  read('src/app/api/brands/[id]/planning/route.ts'),
  read('src/app/api/brands/[id]/promotion-execution/route.ts'),
  read('src/app/api/internal/content-context/route.ts'),
  read('prisma/migrations/20260813230000_extract_local_promotion_identity_fields/migration.sql'),
])

assert(sso.includes("destination === 'brand-inspirations'"))
assert(sso.includes("destination === 'promotion-plans'"))
assert(sso.includes('brandKeys,'))
assert(sidebar.includes("'brand-inspirations',"))
assert(sidebar.includes("'promotion-plans',"))
assert(permissions.includes("href: '/api/integrations/amc-growth/sso/start?destination=brand-inspirations'"))
assert(permissions.includes("id: 'promotion-execution'"))
assert(retiredPlanning.includes("status: 410"))
assert(execution.includes("body.action === 'generate_materials'"))
assert(execution.includes("body.action === 'submit_material'"))
assert(execution.includes("body.action === 'review_material'"))
assert(!execution.includes("body.action === 'generate_plan'"))
assert(contentContext.includes('promotionPlan: undefined'))
assert(!contentContext.includes('normalizePromotionPlan'))
assert(migration.includes('"brandVoice" = NULLIF'))
assert(migration.includes('"promotionFocus" = NULLIF'))

console.log('Planning ownership and execution boundary tests passed')
