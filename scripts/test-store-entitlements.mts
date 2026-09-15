import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

// Run the actual handlers with an isolated transaction store; never touch a live DB.
const require = createRequire(import.meta.url)
function load(path: string, deps: Record<string, any> = {}) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', compiled)((key: string) => key in deps ? deps[key] : require(key), module, module.exports)
  return module.exports
}
const policy = load('src/lib/storeEntitlementPolicy.ts')
for (const addons of [{ multi_store: 3 }, [{ id: 'multi_store', quantity: 3 }], { multi_store: { quantity: 3 } }]) {
  assert.equal(policy.multiStoreQuantity(addons), 3)
}
assert.equal(policy.multiStoreQuantity({ multi_store: true }), 1)
assert.equal(policy.multiStoreQuantity({ multi_store: -5 }), 0)
for (const value of [0, -1, 1.5, '3', undefined, 2147483648]) assert.throws(() => policy.validateManualStoreLimit(value))
for (const value of [null, 1, 3]) policy.validateManualStoreLimit(value)
assert.equal(policy.effectiveStoreLimit(4, 2), 4)
assert.throws(() => policy.assertStoreCount(4, 3, 3))
policy.assertStoreCount(3, 3, 1)
policy.assertStoreCount(2, 3, 1)

let brand: any = { id: 'brand', manualStoreLimit: null }
let knowledge: any = { brandId: 'brand', stores: [{ storeId: 'main', name: 'Funan', googleBusiness: { placeId: 'google-funan' } }] }
let subscription: any = { status: 'ACTIVE', contractEndDate: null, selectedAddons: {}, totalDueUsd: 100, feeWaived: false }
let audits: any[] = []
let files = 0, outbox = 0, afterCalls = 0, locks = 0
const db: any = {
  $queryRaw: async () => { locks++; return [{ id: 'brand' }] },
  brand: {
    findUnique: async () => brand ? { ...brand, knowledge } : null,
    update: async ({ data }: any) => { Object.assign(brand, data); return brand },
  },
  brandKnowledge: {
    findUnique: async () => structuredClone(knowledge),
    upsert: async ({ update }: any) => { Object.assign(knowledge, update); return knowledge },
  },
  brandSubscription: {
    findFirst: async () => subscription.status === 'ACTIVE' && (!subscription.contractEndDate || subscription.contractEndDate > new Date()) ? subscription : null,
  },
  auditLog: { create: async ({ data }: any) => { audits.push(data) } },
}
db.$transaction = async (callback: any) => {
  const before = structuredClone({ brand, knowledge, audits, outbox })
  try { return await callback({ ...db, $transaction: undefined }) } catch (error) { ({ brand, knowledge, audits, outbox } = before); throw error }
}
const entitlements = load('src/lib/storeEntitlements.ts', { '@/lib/prisma': { prisma: db }, './storeEntitlementPolicy': policy })
let principal: any = { userId: 'admin', source: 'session', actorType: 'HUMAN', globalRoles: ['ADMIN'] }
const shared: any = {
  '@/lib/prisma': { prisma: db },
  '@/lib/storeEntitlements': entitlements,
  '@/lib/storeEntitlementPolicy': policy,
  'next/server': { NextResponse: Response, after: () => { afterCalls++ } },
  '@/lib/auth-v2': { authenticateRequest: async () => principal },
  '@/lib/auth': { getSession: async () => ({ user: { id: 'owner', type: 'HUMAN', role: 'USER' } }) },
  '@/lib/brandAccess': { canOwnBrand: async () => true, canSessionAccessBrandProject: async () => true },
  '@/lib/gameShareDraftPool': {},
  '@/lib/brandGrowthSync': {
    growthPathsForKnowledgePatch: (value: any) => value.stores ? ['stores.*'] : [],
    growthPathsForBrandPatch: () => [],
    queueBrandGrowthSync: async () => { outbox++ }, syncBrandGrowthState: async () => {},
  },
}
const admin = load('src/app/api/admin/brands/[id]/store-entitlements/route.ts', shared)
const context = { params: Promise.resolve({ id: 'brand' }) }
const request = (body: any) => new Request('http://localhost/api/test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const billBefore = structuredClone(subscription)
assert.equal((await admin.PATCH(request({ manualStoreLimit: 3 }), context)).status, 200)
assert.equal(brand.manualStoreLimit, 3)
assert.equal(audits[0].oldValue.manualStoreLimit, null)
assert.equal(audits[0].newValue.manualStoreLimit, 3)
assert.deepEqual(subscription, billBefore, 'authorization must not update billing')
principal = { ...principal, globalRoles: ['BRAND_OWNER'] }
assert.equal((await admin.PATCH(request({ manualStoreLimit: 9 }), context)).status, 403)
principal = { ...principal, globalRoles: ['ADMIN'], source: 'api_key' }
assert.equal((await admin.PATCH(request({ manualStoreLimit: 9 }), context)).status, 403)
principal = null
assert.equal((await admin.PATCH(request({ manualStoreLimit: 9 }), context)).status, 401)
principal = { userId: 'admin', source: 'session', actorType: 'HUMAN', globalRoles: ['ADMIN'] }
assert.equal((await admin.PATCH(request({ manualStoreLimit: 0 }), context)).status, 400)

const knowledgeRoute = load('src/app/api/brands/[id]/knowledge/route.ts', shared)
const stores = [{ storeId: 'main', name: 'Funan updated' }, { storeId: 'bugis', name: 'Bugis' }, { storeId: 'orchard', name: 'Orchard' }]
assert.equal((await knowledgeRoute.PATCH(request({ stores }), context)).status, 200)
assert.equal(knowledge.stores[0].googleBusiness.placeId, 'google-funan')
const beforeRejected = structuredClone({ knowledge, outbox, files, afterCalls })
assert.equal((await knowledgeRoute.PATCH(request({ stores: [...stores, { name: 'Fourth' }] }), context)).status, 409)
assert.deepEqual({ knowledge, outbox, files, afterCalls }, beforeRejected)
assert.equal((await admin.PATCH(request({ manualStoreLimit: null }), context)).status, 200)
assert.equal(knowledge.stores.length, 3)
assert.equal((await knowledgeRoute.PATCH(request({ stores }), context)).status, 200, 'historical excess may be edited')
assert.equal((await knowledgeRoute.PATCH(request({ stores: stores.slice(0, 2) }), context)).status, 200)
assert.equal((await knowledgeRoute.PATCH(request({ stores }), context)).status, 409, 'removed capacity cannot be reused when over limit')

let parsedStores: any[] = stores
const profileLib = load('src/lib/brandProfileMarkdown.ts', shared)
const markdownWithIds = profileLib.withStoreIdsInMarkdown('## 经营信息\n### Funan\n- 地址：Funan\n### Bugis\n- 地址：Bugis\n## Other\nUnchanged', stores.slice(0, 2))
assert.deepEqual(profileLib.parseEditableBrandContextFromMarkdown(markdownWithIds).knowledge.stores.map((s: any) => s.storeId), ['main', 'bugis'])
assert.ok(markdownWithIds.endsWith('## Other\nUnchanged'))
const profile = load('src/app/api/brands/[id]/profile/route.ts', {
  ...shared,
  '@/lib/brandProfileMarkdown': {
    withStoreIdsInMarkdown: profileLib.withStoreIdsInMarkdown,
    parseDescriptionFromMarkdown: () => null,
    parseEditableBrandContextFromMarkdown: () => ({ brand: {}, knowledge: { stores: parsedStores } }),
    writeBrandProfileMarkdown: async () => { files++; return { relativePath: 'profile.md', markdown: 'profile' } },
  },
})
const beforeProfile = structuredClone({ knowledge, outbox, files, afterCalls })
assert.equal((await profile.PATCH(request({ markdown: 'profile with three stores' }), context)).status, 409)
assert.deepEqual({ knowledge, outbox, files, afterCalls }, beforeProfile, 'rejected markdown must not write files or queue sync')
parsedStores = stores.slice(0, 2)
assert.equal((await profile.PATCH(request({ markdown: 'two existing stores' }), context)).status, 200)
assert.equal(knowledge.stores[0].googleBusiness.placeId, 'google-funan')

subscription.selectedAddons = { multi_store: 3 }
brand.manualStoreLimit = 2
assert.equal((await entitlements.getStoreEntitlements('brand')).store_limit, 4)
subscription.contractEndDate = new Date(0)
assert.equal((await entitlements.getStoreEntitlements('brand')).store_limit, 2)
assert.equal(brand.manualStoreLimit, 2, 'subscription expiry must retain the grant')
const merged = policy.normalizeStoreRecords([{ name: 'Funan updated', address: 'new address' }], knowledge.stores)
assert.equal(merged[0].storeId, 'main')
assert.equal(merged[0].googleBusiness.placeId, 'google-funan')
assert.throws(() => policy.normalizeStoreRecords([{ storeId: 'x' }, { storeId: 'x' }]))
const google = load('src/lib/growthGooglePlaces.ts')
let incoming = [...stores]
const growthRoute = load('src/app/api/brands/[id]/sync-growth/route.ts', {
  ...shared,
  '@/lib/growthDataCenter': { ensureGrowthMerchantForBrand: async () => 'growth', readGrowthMerchantData: async () => ({ profile: { name: 'Merchant' }, brandStory: { stores: incoming } }) },
  '@/lib/growthGooglePlaces': google,
  '@/lib/sku-library/service': { validateSkuLibrary: () => [], serializeSkuLibrary: (v: any) => v },
})
const beforeImport = structuredClone({ brand, knowledge, outbox, files })
assert.equal((await growthRoute.POST(request({}), context)).status, 409)
assert.deepEqual({ brand, knowledge, outbox, files }, beforeImport, 'over-capacity import must leave brand and knowledge unchanged')
incoming = stores.slice(0, 2)
assert.equal((await growthRoute.POST(request({}), context)).status, 200)
assert.equal(knowledge.stores[0].storeId, 'main')
assert.equal(knowledge.stores[0].googleBusiness.placeId, 'google-funan')
const growthService = load('src/lib/brandGrowthSync.ts', { ...shared, '@/lib/growthDataCenter': {}, '@/lib/growthGooglePlaces': google })
knowledge.stores = []
brand.manualStoreLimit = null
const beforeCreate = structuredClone(knowledge)
await assert.rejects(() => growthService.seedInitialBrandStores('brand', stores, db), policy.StoreEntitlementError)
assert.deepEqual(knowledge, beforeCreate, 'creation helper must enforce capacity before persisting stores')
brand.manualStoreLimit = 3
await growthService.seedInitialBrandStores('brand', stores, db)
assert.equal(knowledge.stores.length, 3)
brand.accounts = []
brand.name = 'Merchant'
const generatedProfile = await profileLib.composeBrandProfileMarkdown('brand')
assert.ok(generatedProfile.includes('Bugis') && generatedProfile.includes('Orchard'), 'automatic Profile must include all stores')
const legacyProfileRoute = load('src/app/api/brands/[id]/profile/route.ts', {
  ...shared, '@/lib/brandProfileMarkdown': { ...profileLib, writeBrandProfileMarkdown: async () => { files++; return { relativePath: 'profile.md', markdown: 'profile' } } },
})
const legacyMarkdown = '<!-- AMC:BRAND_PROFILE:STORES_CONFIG:START -->\n```json\n'
  + JSON.stringify({ stores: [...stores, { name: 'Fourth' }] })
  + '\n```\n<!-- AMC:BRAND_PROFILE:STORES_CONFIG:END -->'
const beforeLegacy = structuredClone({ knowledge, files, outbox })
assert.equal((await legacyProfileRoute.PATCH(request({ markdown: legacyMarkdown }), context)).status, 409, 'legacy JSON editor must not bypass quota')
assert.deepEqual({ knowledge, files, outbox }, beforeLegacy)
assert.ok(locks > 0)
console.log('PASS: store entitlements, admin auth/audit/billing isolation, historical excess, metadata preservation and rejected Markdown side effects')
