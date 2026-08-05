import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const identityRoute = await readFile(new URL('../src/app/api/brands/[id]/identity/route.ts', import.meta.url), 'utf8')
const identityResolver = await readFile(new URL('../src/lib/brandIdentity.ts', import.meta.url), 'utf8')
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
assert(identityRoute.includes("GrowthDataCenterError(409, 'knowledge_revision_conflict')"))
assert(identityRoute.includes('expectedVersion'))
assert(identityRoute.includes('const nextPlan = { ...promoPlan, [promoKey]: nextValue }'))
assert(identityRoute.includes("action: 'BRAND_IDENTITY_FIELD_UPDATED'"))

assert(identityResolver.indexOf('if (entry)') < identityResolver.indexOf('const hasLegacy'))
assert(identityResolver.includes("status === 'unavailable'"))
assert(identityResolver.includes('editable: canEdit && growthAvailable'))

assert(!profileRoute.includes('brandUpdate.location'))
assert(!profileRoute.includes('knowledgeUpdate.brandTone ='))
assert(!profileRoute.includes('knowledgeUpdate.audienceAssumptions ='))
assert(!profileRoute.includes('knowledgeUpdate.productAssumptions ='))
assert(!profileRoute.includes('knowledgeUpdate.promoPlan ='))
assert(!profileRoute.includes('knowledgeUpdate.publishingFreq ='))

assert(profileView.includes('数据来源：'))
assert(profileView.includes('保存后立即生效'))
assert(profileView.includes('data.message || data.error'))
assert(profileView.includes('platforms: { ...editingPublishingFrequency.platforms'))
assert(!profileView.includes('handleSaveVoice'))
assert(!profileView.includes('parsedAudienceAssumptions ||'))

console.log('Brand identity route, resolver and UI contract checks passed.')
