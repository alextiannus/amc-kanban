import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const identityRoute = await readFile(new URL('../src/app/api/brands/[id]/identity/route.ts', import.meta.url), 'utf8')
const identityResolver = await readFile(new URL('../src/lib/brandIdentity.ts', import.meta.url), 'utf8')
const identitySync = await readFile(new URL('../src/lib/brandIdentitySync.ts', import.meta.url), 'utf8')
const identitySyncRoute = await readFile(new URL('../src/app/api/brands/[id]/identity/[field]/sync/route.ts', import.meta.url), 'utf8')
const identityCron = await readFile(new URL('../src/app/api/cron/brand-identity-sync/route.ts', import.meta.url), 'utf8')
const prismaSchema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
const brandRoute = await readFile(new URL('../src/app/api/brands/[id]/route.ts', import.meta.url), 'utf8')
const profileRoute = await readFile(new URL('../src/app/api/brands/[id]/profile/route.ts', import.meta.url), 'utf8')
const profileView = await readFile(new URL('../src/components/dashboard/BrandProfileView.tsx', import.meta.url), 'utf8')

for (const field of [
  'brandTone',
  'targetAudience',
  'sellingPoints',
  'operatingRegion',
  'brandVoice',
  'brandImage',
  'promotionFocus',
  'publishingFrequency',
]) {
  assert(identityResolver.includes(`'${field}'`), `identity resolver is missing ${field}`)
  assert(profileView.includes(`openIdentityEditor('${field}')`), `identity row is missing ${field} editor`)
}

assert(identityRoute.includes('resolveSessionOrApiKey(request)'))
assert(identityRoute.includes('canSessionWriteBrandProject'))
assert(identityRoute.includes('expectedVersion'))
assert(identityRoute.includes('queueAndSyncGrowthIdentityChange'))
assert(identityRoute.includes("syncStatus === 'pending_sync'"))
assert(identityRoute.includes('const nextPlan = { ...promoPlan, [promoKey]: nextValue }'))
assert(identityRoute.includes("action: 'BRAND_IDENTITY_FIELD_UPDATED'"))

assert(identityResolver.indexOf('if (entry)') < identityResolver.indexOf('const hasLegacy'))
assert(identityResolver.includes("status === 'unavailable'"))
assert(identityResolver.includes("status: conflict ? 'sync_conflict' : 'pending_sync'"))
assert(identityResolver.includes("source: 'kanban_pending'"))

assert(prismaSchema.includes('model BrandIdentityPendingChange'))
assert(prismaSchema.includes('@@unique([brandId, field])'))
assert(identitySync.includes('queueAndSyncGrowthIdentityChange'))
assert(identitySync.includes('processPendingIdentityChanges'))
assert(identitySync.includes('retryDelayMs'))
assert(identitySync.includes("action === 'overwrite'"))
assert(identitySync.includes("action === 'use_growth'"))
assert(identitySyncRoute.includes('canSessionWriteBrandProject'))
assert(identityCron.includes("request.headers.get('x-cron-secret')"))
assert(brandRoute.includes("action: 'BRAND_STORY_UPDATED'"))

assert(!profileRoute.includes('brandUpdate.location'))
assert(!profileRoute.includes('knowledgeUpdate.brandTone ='))
assert(!profileRoute.includes('knowledgeUpdate.audienceAssumptions ='))
assert(!profileRoute.includes('knowledgeUpdate.productAssumptions ='))
assert(!profileRoute.includes('knowledgeUpdate.promoPlan ='))
assert(!profileRoute.includes('knowledgeUpdate.publishingFreq ='))

assert(profileView.includes('数据来源：'))
assert(profileView.includes('保存后立即生效'))
assert(profileView.includes('data.message || data.error'))
assert(profileView.includes('已保存 · 待同步'))
assert(profileView.includes('覆盖到 Growth'))
assert(profileView.includes('采用 Growth 最新值'))
assert(profileView.includes('platforms: { ...editingPublishingFrequency.platforms'))
assert(!profileView.includes('handleSaveVoice'))
assert(!profileView.includes('parsedAudienceAssumptions ||'))

console.log('Brand identity route, resolver and UI contract checks passed.')
