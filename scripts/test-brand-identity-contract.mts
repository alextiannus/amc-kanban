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
const { brandPlanEditorIdentityValues } = await import('../src/lib/brandPlanEditorIdentity.ts')

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
}

assert(identityRoute.includes('resolveSessionOrApiKey(request)'))
assert(identityRoute.includes('canSessionWriteBrandProject'))
assert(identityRoute.includes('expectedVersion'))
assert(identityRoute.includes('queueAndSyncGrowthIdentityChange'))
assert(identityRoute.includes("syncStatus === 'pending_sync'"))
assert(identityRoute.includes("const localKey = field === 'brandVoice' ? 'brandVoice' : field === 'brandImage' ? 'brandImage' : 'promotionFocus'"))
assert(identityRoute.includes('update: { [localKey]: nextValue || null }'))
assert(!identityRoute.includes('const nextPlan = { ...promoPlan'))
assert(identityRoute.includes("action: 'BRAND_IDENTITY_FIELD_UPDATED'"))

assert(identityResolver.indexOf('if (entry)') < identityResolver.indexOf('const hasLegacy'))
assert(identityResolver.includes("status === 'unavailable'"))
assert(identityResolver.includes("status: conflict ? 'sync_conflict' : 'pending_sync'"))
assert(identityResolver.includes("source: 'kanban_pending'"))

assert(prismaSchema.includes('model BrandIdentityPendingChange'))
assert(prismaSchema.includes('@@unique([brandId, field])'))
assert(prismaSchema.includes('brandVoice    String?'))
assert(prismaSchema.includes('brandImage    String?'))
assert(prismaSchema.includes('promotionFocus String?'))
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

assert(!profileView.includes('handleSaveVoice'))
assert(!profileView.includes('parsedAudienceAssumptions ||'))
assert(profileView.includes('const snapshot = await res.json() as BrandIdentitySnapshot'))
assert(profileView.includes('const editorIdentity = brandPlanEditorIdentityValues(snapshot)'))
assert(!profileView.includes("setDraftAudience(k.audienceAssumptions || '')"))
assert(!profileView.includes("brandVoice: k.brandVoice || ''"))

for (const field of ['brandTone', 'targetAudience', 'sellingPoints', 'brandVoice', 'brandImage', 'promotionFocus']) {
  assert(profileView.includes(`saveIdentityField('${field}'`), `brand plan editor does not save ${field} through /identity`)
}

const editorIdentity = brandPlanEditorIdentityValues({
  brandId: 'brand_1',
  growthBrandKey: 'growth_1',
  growthAvailable: false,
  fields: {
    brandTone: { key: 'brandTone', value: '亲切、专业', source: 'kanban_pending', status: 'pending_sync', editable: true },
    targetAudience: { key: 'targetAudience', value: '附近上班族', source: 'kanban_pending', status: 'pending_sync', editable: true },
    sellingPoints: { key: 'sellingPoints', value: ['现做现卖', '性价比高'], source: 'kanban_pending', status: 'pending_sync', editable: true },
    operatingRegion: { key: 'operatingRegion', value: '新加坡', source: 'kanban', status: 'local', editable: true },
    brandVoice: { key: 'brandVoice', value: '像懂吃的老朋友', source: 'kanban', status: 'local', editable: true },
    brandImage: { key: 'brandImage', value: '干净高级', source: 'kanban', status: 'local', editable: true },
    promotionFocus: { key: 'promotionFocus', value: '午市套餐', source: 'kanban', status: 'local', editable: true },
    publishingFrequency: { key: 'publishingFrequency', value: { postsPerDay: 1, platforms: {} }, source: 'kanban', status: 'local', editable: true },
  },
})
assert.deepEqual(editorIdentity, {
  brandTone: '亲切、专业',
  targetAudience: '附近上班族',
  sellingPointsText: '现做现卖\n性价比高',
  creativeIdentity: {
    brandVoice: '像懂吃的老朋友',
    brandImage: '干净高级',
    promotionFocus: '午市套餐',
  },
})

console.log('Brand identity route, resolver and UI contract checks passed.')
