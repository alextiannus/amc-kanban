import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [sso, sidebar, permissions, brandProfile, brandPlanRoute, brandPlanService, subscriptionRoute, schema, planning, execution, contentContext, migration] = await Promise.all([
  read('src/app/api/integrations/amc-growth/sso/start/route.ts'),
  read('src/components/layout/Sidebar.tsx'),
  read('src/lib/permissions.ts'),
  read('src/components/dashboard/BrandProfileView.tsx'),
  read('src/app/api/brands/[id]/brand-plan/route.ts'),
  read('src/lib/brand-plan/service.ts'),
  read('src/app/api/brands/[id]/subscription/route.ts'),
  read('prisma/schema.prisma'),
  read('src/app/api/brands/[id]/planning/route.ts'),
  read('src/app/api/brands/[id]/promotion-execution/route.ts'),
  read('src/app/api/internal/content-context/route.ts'),
  read('prisma/migrations/20260813230000_extract_local_promotion_identity_fields/migration.sql'),
])

assert(sso.includes("const ALLOWED_ROLES = new Set(['ADMIN', 'AMC_PRINCIPAL'])"))
assert(sso.includes("principal.source !== 'session' || principal.actorType !== 'HUMAN'"))
assert(sso.includes('brandKeys,'))
assert(sso.includes("roles.includes('ADMIN') ? ['*'] : await scopedGrowthBrandKeys(principal)"))
assert(sso.includes(".setAudience('amc-growth')"))
assert(sso.includes(".setIssuer('amc-kanban')"))
assert(sso.includes(".setExpirationTime('60s')"))
assert(sso.includes("url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')"))
assert(!sso.includes("destination === 'brand-inspirations'"))
assert(sidebar.includes("'amc-growth',"))
assert(!sidebar.includes("'brand-inspirations',"))
assert(!sidebar.includes("'promotion-plans',"))
assert(permissions.includes("href: '/api/integrations/amc-growth/sso/start?returnTo=%2Fdashboard%2Fknowledge'"))
assert(!permissions.includes('destination=brand-inspirations'))
assert(!permissions.includes('destination=promotion-plans'))
assert(!permissions.includes("href: '/planning/promotion-strategy'"))
assert(permissions.includes("id: 'promotion-execution'"))
assert(brandProfile.includes('/brand-plan'))
assert(brandProfile.includes('handleGenerateResearchReport'))
assert(brandProfile.includes('handleGenerateInterviewReport'))
assert(brandProfile.includes('handleGenerateAnnualPlan'))
assert(brandProfile.includes("runBrandPlanAction('generate_next_quarter_plan'"))
assert(brandProfile.includes('handleGeneratePublishingCalendar'))
assert(brandPlanRoute.includes("runBrandPlanAction"))
assert(brandPlanService.includes('marketingSolution'))
assert(brandPlanService.includes('brandClaim'))
assert(brandPlanService.includes('researchReport'))
assert(brandPlanService.includes('saveResearchReport'))
assert(brandPlanService.includes('brandGrowthResearchSnapshot'))
assert(brandPlanService.includes("callLLM('marketing_plan'"))
assert(brandPlanService.includes('brandMarketingSolution'))
assert(brandPlanService.includes('getSubscriptionOperationsPolicy'))
assert(brandPlanService.includes("'generate_research_report'"))
assert(brandPlanService.includes("'save_merchant_interview'"))
assert(brandPlanService.includes("'generate_annual_plan'"))
assert(brandPlanService.includes("'generate_next_quarter_plan'"))
assert(brandPlanService.includes("'generate_publishing_calendar'"))
assert(brandPlanService.includes('buildAnnualMarketingSolution'))
assert(brandPlanService.includes('buildNextQuarterMarketingPlan'))
assert(!brandPlanService.includes("action === 'update_brand_plan'"))
assert(subscriptionRoute.includes('subscriptionOperationsStrategy'))
assert(schema.includes('model BrandGrowthResearchSnapshot'))
assert(schema.includes('model BrandMarketingSolution'))
assert(schema.includes('model SubscriptionOperationsStrategy'))
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
