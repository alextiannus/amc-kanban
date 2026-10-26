import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { SocialAccountBindingError } from '../src/lib/socialAccountIdentity.ts'
import { lockAccountBinding, lockBrandSync } from '../src/lib/socialAccountLocks.ts'
import { placeholderTestDb } from './helpers/placeholder-test-db.mts'
import * as creativeVisibility from '../src/lib/brand-plan/creativeVisibility.ts'
import * as creativeRevisionContract from '../src/lib/brand-plan/creativeRevisionContract.ts'
import { disablePlaceholderAutopilot, resolveDraftPlatformAccount, resolveDraftAccount, reconcilePlaceholderAccounts, placeholderReferences, draftPlatform, isPurePlaceholder } from '../src/lib/socialAccountPlaceholder.ts'

const test = await placeholderTestDb()
const db = test.db
const placeholder = (extra: any = {}) => ({ id: 'placeholder', brandId: 'brand', platformId: 'facebook', handle: 'unconfigured', ...extra })
const real = (extra: any = {}) => ({ id: 'real', brandId: 'brand', platformId: 'facebook', handle: 'restaurant', postfastAccountId: 'provider-real', connectionStatus: 'CONNECTED', ...extra })
const draft = (extra: any = {}) => ({ id: 'draft', brandId: 'brand', accountId: 'placeholder', caption: 'keep this exact caption', mediaUrls: ['asset://original'], hashtags: ['keep'], ...extra })
async function seed(accountExtra: any = {}, draftExtra: any = {}) {
  await test.reset()
  await db.brand.create({ data: { id: 'brand', name: 'Restaurant', status: 'ACTIVE' } })
  await db.socialAccount.create({ data: placeholder(accountExtra) })
  await db.socialAccount.create({ data: real() })
  await db.contentDraft.create({ data: draft(draftExtra) })
}
const reconcile = (apply = true) => db.$transaction((tx: any) => reconcilePlaceholderAccounts(tx, 'brand', apply))
try {
  assert.equal(draftPlatform('GOOGLE_BUSINESS_PROFILE'), 'google')
  assert.equal(draftPlatform('rednote'), 'xiaohongshu')
  assert.equal(draftPlatform('fb'), 'facebook')
  for (const field of ['postfastAccountId', 'profileUrl', 'accessToken', 'refreshToken', 'loginUsername', 'loginPassword']) assert.equal(isPurePlaceholder(placeholder({ [field]: 'nonempty' })), false)

  for (const reason of ['archived', 'not_configured', 'unavailable']) {
    await seed({ loginUsername: 'keep-login' }, { status: 'published', postUrl: 'https://example.com/history' })
    const savedAccount = await db.socialAccount.findFirst({ where: { id: 'placeholder' } })
    const savedDraft = await db.contentDraft.findFirst({ where: { id: 'draft' } })
    const savedReal = await db.socialAccount.findFirst({ where: { id: 'real' } })
    assert.deepEqual(await db.$transaction((tx: any) => disablePlaceholderAutopilot(tx, 'brand', false, reason)), ['placeholder'])
    assert.deepEqual(await db.socialAccount.findFirst({ where: { id: 'placeholder' } }), savedAccount)
    test.failAudit(true)
    await assert.rejects(() => db.$transaction((tx: any) => disablePlaceholderAutopilot(tx, 'brand', true, reason)), /injected audit failure/)
    assert.deepEqual(await db.socialAccount.findFirst({ where: { id: 'placeholder' } }), savedAccount)
    test.failAudit(false)
    assert.deepEqual(await db.$transaction((tx: any) => disablePlaceholderAutopilot(tx, 'brand', true, reason)), ['placeholder'])
    assert.equal((await db.socialAccount.findFirst({ where: { id: 'placeholder' } })).autoPilot, false)
    assert.equal((await db.socialAccount.findFirst({ where: { id: 'placeholder' } })).loginUsername, 'keep-login')
    assert.deepEqual(await db.contentDraft.findFirst({ where: { id: 'draft' } }), savedDraft)
    assert.deepEqual(await db.socialAccount.findFirst({ where: { id: 'real' } }), savedReal)
    assert.deepEqual(await db.$transaction((tx: any) => disablePlaceholderAutopilot(tx, 'brand', true, reason)), [])
    assert.equal(await db.auditLog.count({}), 1)
  }

  await seed()
  const before = await db.contentDraft.findFirst({ where: { id: 'draft' } })
  const unchangedAccounts = await db.socialAccount.findMany({ where: { handle: { not: 'unconfigured' } } })
  const dry = await reconcile(false)
  assert.deepEqual(dry[0].migratedDraftIds, ['draft'])
  assert.equal(dry[0].deleted, true)
  assert.deepEqual(await db.contentDraft.findFirst({ where: { id: 'draft' } }), before)
  assert.equal(await db.auditLog.count({}), 0)
  const report = await reconcile()
  assert.deepEqual(report[0].migratedDraftIds, ['draft'])
  assert.equal(await db.socialAccount.count({ where: { id: 'placeholder' } }), 0)
  const after = await db.contentDraft.findFirst({ where: { id: 'draft' } })
  const { accountId: oldId, updatedAt: oldTime, ...oldContent } = before
  const { accountId: newId, updatedAt: newTime, ...newContent } = after
  assert.equal(oldId, 'placeholder'); assert.equal(newId, 'real'); assert.deepEqual(newContent, oldContent)
  assert.deepEqual(await db.socialAccount.findMany({ where: { handle: { not: 'unconfigured' } } }), unchangedAccounts)
  assert.equal(await db.auditLog.count({}), 1)
  assert.deepEqual(await reconcile(), [])
  assert.equal(await db.auditLog.count({}), 1)

  for (const extra of [{ status: 'published' }, { status: 'pending_review' }, { status: 'scheduled' }, { scheduledAt: '2030-01-01' }, { publishedAt: '2026-01-01' }, { platformPostId: 'post' }, { postUrl: 'https://example.com/post' }]) {
    await seed({}, extra); const saved = await db.contentDraft.findFirst({ where: { id: 'draft' } }); await reconcile()
    assert.deepEqual(await db.contentDraft.findFirst({ where: { id: 'draft' } }), saved)
    assert.equal(await db.socialAccount.count({ where: { id: 'placeholder' } }), 1)
  }
  for (const model of ['postfastDeliveryJob', 'actionItem']) {
    await seed(); await db[model].create({ data: { id: 'reference', draftId: 'draft', accountId: 'placeholder', status: 'FAILED' } }); await reconcile()
    assert.equal((await db.contentDraft.findFirst({ where: { id: 'draft' } })).accountId, 'placeholder')
  }
  for (const extra of [{ connectionStatus: 'DISABLED' }, { disabledReason: 'TOKEN_REVOKED' }, { unboundAt: '2026-01-01' }, { postfastAccountId: null }]) {
    await seed(); await db.socialAccount.update({ where: { id: 'real' }, data: extra }); await reconcile()
    assert.equal((await db.contentDraft.findFirst({ where: { id: 'draft' } })).accountId, 'placeholder')
  }
  await seed(); await db.socialAccount.create({ data: real({ id: 'other-real', handle: 'second', postfastAccountId: 'provider-second', connectionStatus: 'DISABLED' }) }); await reconcile()
  assert.equal((await db.contentDraft.findFirst({ where: { id: 'draft' } })).accountId, 'placeholder', 'never choose the healthy member of an ambiguous platform')
  await seed(); await db.socialAccount.update({ where: { id: 'real' }, data: { brandId: 'other-brand' } }); await reconcile()
  assert.equal((await db.contentDraft.findFirst({ where: { id: 'draft' } })).accountId, 'placeholder')
  await seed()
  const absent = await db.$transaction((tx: any) => reconcilePlaceholderAccounts(tx, 'brand', true, new Set()))
  assert(absent[0].reasons.includes('provider_account_missing'))
  assert.equal((await db.contentDraft.findFirst({ where: { id: 'draft' } })).accountId, 'placeholder')

  for (const field of ['postfastAccountId', 'profileUrl', 'accessToken', 'refreshToken', 'loginUsername', 'loginPassword']) {
    await seed({ [field]: 'mixed-identity' }); const saved = await db.contentDraft.findFirst({ where: { id: 'draft' } }); const result = await reconcile()
    assert(result[0].reasons.includes('mixed_identity')); assert.deepEqual(await db.contentDraft.findFirst({ where: { id: 'draft' } }), saved)
    assert.equal(await db.socialAccount.count({ where: { id: 'placeholder' } }), 1)
  }
  for (const model of ['socialAccountSnapshot', 'postfastInboxConversation', 'googleBrandImport']) {
    await seed(); await db[model].create({ data: { id: 'reference', accountId: 'placeholder', socialAccountId: 'placeholder' } }); await reconcile()
    assert.equal(await db.socialAccount.count({ where: { id: 'placeholder' } }), 1, 'all references must be empty before pruning')
  }
  await seed(); await db.postfastDeliveryJob.create({ data: { id: 'orphan-payload', brandId: 'brand', draftId: 'draft', payload: { publish: { accountId: 'placeholder' } } } })
  assert.equal((await placeholderReferences(db, 'brand', 'placeholder')).jobs, 1)
  for (const table of ['autopilot_settings', 'autopilot_runs']) {
    await seed()
    await test.pg.query(`INSERT INTO amc_iaic.${table} (${table === 'autopilot_settings' ? 'brand_id' : 'id'},account_id) VALUES ($1,$2)`, ['brand', 'placeholder'])
    await reconcile()
    assert.equal(await db.socialAccount.count({ where: { id: 'placeholder' } }), 1, 'retain AI configuration and run history references')
  }

  await seed({ platformId: 'google_business' }); await db.socialAccount.update({ where: { id: 'real' }, data: { platformId: 'google_maps' } }); await reconcile()
  assert.equal((await db.contentDraft.findFirst({ where: { id: 'draft' } })).accountId, 'real')

  await test.reset()
  const created = await Promise.all(Array.from({ length: 8 }, (_, index) => db.$transaction((tx: any) => resolveDraftPlatformAccount(tx, 'brand', index % 2 ? 'rednote' : 'xhs'))))
  assert.equal(new Set(created.map((a: any) => a.id)).size, 1)
  assert.equal(await db.socialAccount.count({}), 1)
  assert.equal(created[0].autoPilot, false)
  await db.socialAccount.create({ data: real({ platformId: 'xiaohongshu' }) })
  assert.equal((await db.$transaction((tx: any) => resolveDraftPlatformAccount(tx, 'brand', 'red'))).id, 'real')
  assert.equal((await db.$transaction((tx: any) => resolveDraftPlatformAccount(tx, 'brand', 'red', false))).id, created[0].id, 'historical saves keep a placeholder')
  await assert.rejects(() => db.$transaction((tx: any) => resolveDraftAccount(tx, 'other-brand', 'real')), (e: any) => e.code === 'ACCOUNT_NOT_FOUND')
  await db.socialAccount.update({ where: { id: 'real' }, data: { unboundAt: '2026-01-01' } })
  await assert.rejects(() => db.$transaction((tx: any) => resolveDraftAccount(tx, 'brand', 'real')), (e: any) => e.code === 'ACCOUNT_NOT_FOUND')
  assert.equal((await db.socialAccount.findFirst({ where: { id: 'real' } })).unboundAt, '2026-01-01')

  await seed(); const transactionBefore = await db.contentDraft.findFirst({ where: { id: 'draft' } }); test.failAudit(true)
  await assert.rejects(reconcile, /injected audit failure/)
  assert.deepEqual(await db.contentDraft.findFirst({ where: { id: 'draft' } }), transactionBefore)
  assert.equal((await db.socialAccount.findFirst({ where: { id: 'placeholder' } })).autoPilot, true)
  assert.equal(await db.auditLog.count({}), 0)
  test.failAudit(false)
  for (const concurrentChange of [
    (tx: any) => tx.contentDraft.update({ where: { id: 'draft' }, data: { status: 'publishing' } }),
    (tx: any) => tx.postfastDeliveryJob.create({ data: { id: 'concurrent-job', draftId: 'draft', status: 'QUEUED' } }),
    (tx: any) => tx.actionItem.create({ data: { id: 'concurrent-action', draftId: 'draft', accountId: 'placeholder' } }),
  ]) {
    await seed()
    const saved = await db.contentDraft.findFirst({ where: { id: 'draft' } })
    test.beforeDraftUpdate(concurrentChange)
    await assert.rejects(reconcile, (error: any) => error.code === 'ACCOUNT_BUSY')
    assert.deepEqual(await db.contentDraft.findFirst({ where: { id: 'draft' } }), saved)
    assert.equal(await db.auditLog.count({}), 0)
  }

  // Exercise real synchronization and API handlers against PostgreSQL, rather
  // than merely asserting that a filter or safety check appears in the source.
  ;(globalThis as any).prisma = db
  const originalBrandFind = db.brand.findUnique
  db.brand.findUnique = async (args: any) => {
    const brand = await originalBrandFind(args)
    if (brand && args.select?.accounts) brand.accounts = await db.socialAccount.findMany({ where: { brandId: brand.id, unboundAt: null } })
    return brand
  }
  const binding = await import('../src/lib/socialAccountBinding.ts')
  await seed()
  const synced = await binding.syncSocialAccountBindings('brand', [{ id: 'provider-real', platformId: 'facebook', platform: 'FACEBOOK', handle: 'restaurant', connectionStatus: 'CONNECTED', inboxCapable: false }])
  assert.deepEqual(synced.map((a: any) => a.id), ['real'])
  assert.equal((await db.contentDraft.findFirst({ where: { id: 'draft' } })).accountId, 'real')

  let user: any = { id: 'operator', role: 'ADMIN' }
  let canWrite = true
  let reclaimCalls = 0
  const deps: Record<string, any> = {
    '@/lib/brand-plan/creativeVisibility': creativeVisibility,
    '@/lib/brand-plan/creativeRevisionContract': creativeRevisionContract,
    'next/server': { NextResponse: { json: (data: any, options: any) => Response.json(data, options) } },
    '@/lib/auth': { getSession: async () => user ? { user } : null, extractApiKey: () => null, getAgentFromApiKey: async () => null },
    '@/lib/prisma': { prisma: db },
    '@/lib/brandAccess': { canWriteBrandProject: async () => canWrite, canSessionWriteBrandProject: async () => canWrite },
    '@/lib/socialAccountBinding': binding,
    '@/lib/socialAccountPlaceholder': { isPurePlaceholder, placeholderReferences, resolveDraftAccount, draftPlatform },
    '@/lib/socialAccountLocks': { lockAccountBinding, lockBrandSync },
    '@/lib/socialAccountIdentity': { SocialAccountBindingError },
    '@/lib/postfastKeyPool': { reclaimPostfastKeyForBrandIfUnused: async () => { reclaimCalls++ } },
    '@/lib/role-permissions/request-origin': { allowedRoleWriteOrigin: () => true },
    '@/lib/videoDraftReceipt': {},
    '@/lib/integrations/huaweiObs': { persistDraftSnapshotToObs: async () => {} },
    '@/lib/compliance': { parseBrandComplianceConfig: async () => null },
    '@/lib/audit': {}, '@/lib/events': {},
    '@/lib/integrations/postfast': { sanitizePostFastDraftControls: () => ({ controls: null }) },
    '@/lib/calendarDraftQuery': {},
  }
  function route(path: string) {
    const loaded = { exports: {} as any }
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    new Function('require', 'module', 'exports', code)((name: string) => { assert(deps[name], name); return deps[name] }, loaded, loaded.exports)
    return loaded.exports
  }
  const accountRoute = route('../src/app/api/brands/[id]/accounts/[aid]/route.ts')
  const unbindRoute = route('../src/app/api/brands/[id]/accounts/[aid]/unbind/route.ts')
  const params = { params: Promise.resolve({ id: 'brand', aid: 'placeholder' }) }
  const request = (method: string, body?: any) => new Request('http://localhost/api/brands/brand/accounts/placeholder', { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) })
  await seed()
  assert.equal((await accountRoute.DELETE(request('DELETE'), params)).status, 409)
  assert.equal(await db.contentDraft.count({}), 1)
  for (const body of [{ autoPilot: true }, { autoPilot: 'true' }, { handle: 'renamed' }, { profileUrl: 'https://facebook.com/page' }, { loginPassword: 'test-only' }]) assert.equal((await accountRoute.PATCH(request('PATCH', body), params)).status, 409)
  assert.equal((await accountRoute.PATCH(request('PATCH', { autoPilot: false }), params)).status, 200)
  assert.equal((await db.socialAccount.findFirst({ where: { id: 'placeholder' } })).autoPilot, false)
  const savedDraft = await db.contentDraft.findFirst({ where: { id: 'draft' } })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Unexpected provider request for a placeholder') }
  try {
    await db.socialAccount.update({ where: { id: 'placeholder' }, data: { autoPilot: true } })
    assert.equal((await unbindRoute.POST(request('POST'), params)).status, 200)
    assert.equal((await unbindRoute.POST(request('POST'), params)).status, 200)
    assert.equal((await db.socialAccount.findFirst({ where: { id: 'placeholder' } })).unboundAt, null)
    assert.deepEqual(await db.contentDraft.findFirst({ where: { id: 'draft' } }), savedDraft)
  } finally { globalThis.fetch = originalFetch }
  user = null
  assert.equal((await accountRoute.DELETE(request('DELETE'), params)).status, 401)
  user = { id: 'operator' }; canWrite = false
  assert.equal((await accountRoute.DELETE(request('DELETE'), params)).status, 404)
  canWrite = true
  assert.equal((await accountRoute.DELETE(request('DELETE'), { params: Promise.resolve({ id: 'brand', aid: 'foreign-account' }) })).status, 404)
  await db.contentDraft.deleteMany({ where: { id: 'draft' } })
  assert.equal((await accountRoute.DELETE(request('DELETE'), params)).status, 200)
  assert.equal(await db.socialAccount.count({ where: { id: 'placeholder' } }), 0)
  assert.equal(reclaimCalls, 0, 'placeholder deletion and foreign-account requests must not reclaim a third-party key')
  const draftRoute = route('../src/app/api/brands/[id]/drafts/route.ts')
  const create = async (body: any) => {
    const result = await draftRoute.POST(new Request('http://localhost/api/brands/brand/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption: 'API draft content', ...body }) }), { params: Promise.resolve({ id: 'brand' }) })
    assert.equal(result.status, 201)
    return (await result.json()).draft
  }
  await seed()
  assert.equal((await create({ accountId: 'unconfigured_facebook' })).accountId, 'real')
  const historical = await create({ accountId: 'unconfigured_facebook', status: 'published', publishedAt: '2020-01-01T00:00:00Z', postUrl: 'https://example.com/historical' })
  assert.equal(historical.accountId, 'placeholder')
  assert.equal(historical.status, 'published')
  assert.equal((await db.socialAccount.findFirst({ where: { id: 'placeholder' } })).autoPilot, false)
  const pending = await create({ accountId: 'unconfigured_facebook', status: 'pending_review' })
  assert.equal(pending.accountId, 'placeholder')
  assert.equal((await db.actionItem.findFirst({ where: { draftId: pending.id } })).accountId, 'placeholder', 'approval uses the resolved account ID, never a virtual ID')
  await db.socialAccount.create({ data: real({ id: 'second-real', handle: 'other-page', postfastAccountId: 'other-provider' }) })
  assert.equal((await create({ accountId: 'unconfigured_facebook' })).accountId, 'placeholder')
  assert.equal((await create({ accountId: 'real' })).accountId, 'real', 'explicit selection remains valid with multiple accounts')
  await test.pg.exec('DROP SCHEMA amc_iaic CASCADE')
  const legacyRefs = await placeholderReferences(db, 'brand', 'placeholder')
  assert.equal(legacyRefs.nativeSettings, 0)
  assert.equal(legacyRefs.nativeRuns, 0)
  console.log('PASS actual draft POST: unique connected selection, historical identity, approval association, ambiguity and explicit selection')
  console.log('PASS actual sync and account APIs: channel filtering, guarded deletion, PATCH protection, provider-free idempotent placeholder unbind, history retention and permissions')
  console.log('PASS placeholder PostgreSQL tests: safe migration, dry-run, rollback, history, all references, ambiguity, health, identity, aliases, tenant isolation and concurrent idempotent creation')
} finally {
  await test.pg.close()
}
