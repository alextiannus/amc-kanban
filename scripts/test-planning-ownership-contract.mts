import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [sso, sidebar, permissions, brandProfile, brandPlanRoute, brandPlanService, planning, execution, contentContext, migration] = await Promise.all([
  read('src/app/api/integrations/amc-growth/sso/start/route.ts'),
  read('src/components/layout/Sidebar.tsx'),
  read('src/lib/permissions.ts'),
  read('src/components/dashboard/BrandProfileView.tsx'),
  read('src/app/api/brands/[id]/brand-plan/route.ts'),
  read('src/lib/brand-plan/service.ts'),
  read('src/app/api/brands/[id]/planning/route.ts'),
  read('src/app/api/brands/[id]/promotion-execution/route.ts'),
  read('src/app/api/internal/content-context/route.ts'),
  read('prisma/migrations/20260813230000_extract_local_promotion_identity_fields/migration.sql'),
])

assert(sso.includes("destination === 'brand-inspirations'"))
assert(sso.includes('brandKeys,'))
assert(sidebar.includes("'brand-inspirations',"))
assert(!sidebar.includes("'promotion-plans',"))
assert(permissions.includes("href: '/api/integrations/amc-growth/sso/start?destination=brand-inspirations'"))
assert(!permissions.includes("href: '/planning/promotion-strategy'"))
assert(permissions.includes("id: 'promotion-execution'"))
assert(brandProfile.includes('/brand-plan'))
assert(brandProfile.includes('handleGenerateResearchReport'))
assert(brandProfile.includes('handleGenerateInterviewReport'))
assert(brandProfile.includes('handleGenerateAnnualPlan'))
assert(brandProfile.includes('handleGenerateQuarterPlan'))
assert(brandProfile.includes('handleGeneratePublishingCalendar'))
assert(brandPlanRoute.includes("runBrandPlanAction"))
assert(brandPlanService.includes('marketingSolution'))
assert(brandPlanService.includes('brandClaim'))
assert(brandPlanService.includes('researchReport'))
assert(brandPlanService.includes("'generate_research_report'"))
assert(brandPlanService.includes("'save_merchant_interview'"))
assert(brandPlanService.includes("'generate_annual_plan'"))
assert(brandPlanService.includes("'generate_quarter_plan'"))
assert(brandPlanService.includes("'generate_publishing_calendar'"))
assert(brandPlanService.includes('buildAnnualMarketingSolution'))
assert(brandPlanService.includes('buildQuarterMarketingSolution'))
assert(!brandPlanService.includes("action === 'update_brand_plan'"))
assert(planning.includes('@/lib/promotion-strategy/route'))
assert(!planning.includes('matchRemotePromotionPointCreatives'))
const promotionStrategy = await read('src/lib/promotion-strategy/service.ts')
const promotionStrategyClients = await read('src/lib/promotion-strategy/clients.ts')
assert(promotionStrategy.includes('generatePromotionStrategyPlan'))
assert(promotionStrategy.includes('monthlyPublicationPlanDrafts'))
assert(promotionStrategyClients.includes('matchPromotionStrategyCreativeCandidates'))
assert(promotionStrategyClients.includes('fetchPromotionStrategyMarketCalendar'))
assert(execution.includes("body.action === 'generate_materials'"))
assert(execution.includes("body.action === 'submit_material'"))
assert(execution.includes("body.action === 'review_material'"))
assert(!execution.includes("body.action === 'generate_plan'"))
assert(contentContext.includes('promotionPlan: undefined'))
assert(!contentContext.includes('normalizePromotionPlan'))
assert(migration.includes('"brandVoice" = NULLIF'))
assert(migration.includes('"promotionFocus" = NULLIF'))

console.log('Planning ownership and execution boundary tests passed')
