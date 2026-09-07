import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { bindingTestDb } from './helpers/social-account-test-db.mts'
import { accountPlatform, localForProvider, providerForLocal, SocialAccountBindingError } from '../src/lib/socialAccountIdentity.ts'

const test = bindingTestDb()
;(globalThis as any).prisma = test.db
process.env.POSTFAST_BASE_URL = 'http://postfast.invalid'
const originalFetch = globalThis.fetch
let remoteFailure = false
let posts: any[] = []
let pages = 0
let pageMode = 'normal'
const remotes = [
  { id: 'google-1', platform: 'GOOGLE', platformUsername: 'xiang wanwan' },
  { id: 'google-2', platform: 'GOOGLE', platformUsername: 'correct store' },
  { id: 'tiktok-1', platform: 'TIKTOK', platformUsername: 'other' },
]
globalThis.fetch = async (url: any, init: any) => {
  assert(!init?.method || init.method === 'GET', 'unbind must never revoke OAuth or delete posts')
  if (remoteFailure) return Response.json({ error: 'unavailable' }, { status: 503 })
  if (String(url).includes('my-social-accounts')) return Response.json(remotes)
  assert(String(url).includes('statuses=SCHEDULED'))
  pages++
  if (pageMode === 'incomplete') return Response.json({ data: [], pageInfo: { hasNextPage: true } })
  if (pageMode === 'second') return Response.json({ data: pages === 1 ? [{ id: 'other-post', socialMediaId: 'google-2' }] : posts, pageInfo: { hasNextPage: pages === 1 } })
  return Response.json({ data: posts, totalCount: posts.length, pageInfo: { hasNextPage: false } })
}
const binding = await import('../src/lib/socialAccountBinding.ts')
const local = (id: string, platformId: string, handle: string, extra: any = {}) => ({ id, brandId: 'brand', platformId, handle, unboundAt: null, autoPilot: true, ...extra })
function reset() {
  remoteFailure = false; posts = []; pages = 0; pageMode = 'normal'
  test.reset({
    accounts: [local('a', 'google_maps', 'xiang wanwan', { drafts: ['historical'], snapshots: ['metrics'] }), local('b', 'google', 'correct store'), local('c', 'tiktok', 'other')],
    brands: [{ id: 'brand', postfastApiKey: 'test-key' }],
    drafts: [{ id: 'history', brandId: 'brand', accountId: 'a', status: 'published' }], audit: [],
  })
}
async function rejectsCode(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error: any) => error instanceof SocialAccountBindingError && error.code === code)
}

try {
  assert.equal(accountPlatform('GOOGLE_BUSINESS_PROFILE'), 'google')
  assert.throws(() => localForProvider([local('a', 'google', 'x'), local('b', 'google_maps', 'x')], { id: 'pf', platformId: 'google', handle: 'x' }), /歧义/)
  assert.equal(providerForLocal(local('a', 'google', 'renamed', { postfastAccountId: 'pf' }), [{ id: 'pf', platformId: 'google', handle: 'original' }])?.id, 'pf')

  reset()
  const history = structuredClone(test.state().drafts)
  await binding.unbindSocialAccount('brand', 'a', 'operator')
  assert(test.state().accounts[0].unboundAt)
  assert.equal(test.state().accounts[0].autoPilot, false)
  assert.equal(test.state().accounts[0].postfastAccountId, 'google-1')
  assert.equal(test.state().accounts[1].autoPilot, true)
  assert.equal(test.state().accounts[2].autoPilot, true)
  assert.deepEqual(test.state().drafts, history)
  assert.equal(test.state().audit.length, 1)
  remoteFailure = true // Idempotency does not depend on the provider being up.
  await binding.unbindSocialAccount('brand', 'a', 'operator')
  assert.equal(test.state().audit.length, 1)
  remoteFailure = false
  const pf = remotes.map(a => ({ id: a.id, platform: a.platform, platformId: accountPlatform(a.platform), handle: a.platformUsername }))
  const synced = await binding.syncSocialAccountBindings('brand', pf)
  assert.deepEqual(synced.map((a: any) => a.id).sort(), ['b', 'c'])
  assert(test.state().accounts.find((a: any) => a.id === 'a').unboundAt)
  await binding.syncSocialAccountBindings('brand', pf.map(a => a.id === 'google-1' ? { ...a, handle: 'renamed provider account' } : a))
  assert.equal(test.state().accounts.length, 3, 'renaming a provider account must not recreate its binding')
  await rejectsCode(() => binding.resolveLocalPublishAccount({ apiKey: 'test-key', platform: 'google', accountId: 'google-1' }, pf), 'ACCOUNT_UNBOUND')
  await rejectsCode(() => binding.withBoundAccount('a', async () => assert.fail('must not submit')), 'ACCOUNT_UNBOUND')
  await rejectsCode(() => binding.saveSocialAccount('brand', { platformId: 'google', handle: 'xiang wanwan' }), 'ACCOUNT_UNBOUND')
  const rebound = await binding.saveSocialAccount('brand', { platformId: 'google', handle: 'xiang wanwan' }, true, 'operator')
  assert.equal(rebound.id, 'a')
  assert.equal(rebound.unboundAt, null)
  assert.equal(rebound.autoPilot, false)

  reset()
  await rejectsCode(() => binding.unbindSocialAccount('another-brand', 'a', 'operator'), 'ACCOUNT_NOT_FOUND')
  for (const status of ['scheduled', 'publishing']) {
    test.state().drafts[0].status = status
    await rejectsCode(() => binding.unbindSocialAccount('brand', 'a', 'operator'), 'ACCOUNT_HAS_PENDING_POSTS')
  }
  for (const status of ['QUEUED', 'TRANSFERRING', 'CREATING_POST', 'RESULT_UNKNOWN']) {
    test.state().drafts[0].status = 'draft'; test.state().drafts[0].jobs = [{ status }]
    await rejectsCode(() => binding.unbindSocialAccount('brand', 'a', 'operator'), 'ACCOUNT_HAS_PENDING_POSTS')
  }
  reset(); posts = [{ id: 'scheduled', socialMediaId: 'google-1' }]; pageMode = 'second'
  await rejectsCode(() => binding.unbindSocialAccount('brand', 'a', 'operator'), 'ACCOUNT_HAS_PENDING_POSTS')
  assert.equal(pages, 2, 'must check later pages')
  reset(); remoteFailure = true
  await rejectsCode(() => binding.unbindSocialAccount('brand', 'a', 'operator'), 'ACCOUNT_STATUS_UNAVAILABLE')
  assert.equal(test.state().accounts[0].unboundAt, null)
  reset(); pageMode = 'incomplete'
  await rejectsCode(() => binding.unbindSocialAccount('brand', 'a', 'operator'), 'ACCOUNT_STATUS_UNAVAILABLE')
  assert.equal(pages, 20)
  reset(); posts = [{ id: 'unknown-owner' }]
  await rejectsCode(() => binding.unbindSocialAccount('brand', 'a', 'operator'), 'ACCOUNT_STATUS_UNAVAILABLE')

  reset()
  let release!: () => void
  let acquired!: () => void
  const ready = new Promise<void>(resolve => { acquired = resolve })
  const publishing = binding.withBoundAccount('a', async () => { acquired(); await new Promise<void>(resolve => { release = resolve }) })
  await ready
  await rejectsCode(() => binding.unbindSocialAccount('brand', 'a', 'operator'), 'ACCOUNT_BUSY')
  await binding.withBoundAccount('b', async () => true) // Another account has its own lock.
  release(); await publishing
  await binding.unbindSocialAccount('brand', 'a', 'operator')

  // Exercise the actual route with auth dependencies stubbed; no database or login service.
  let user: any = null
  let canWrite = false
  let called = 0
  const module = { exports: {} as any }
  const route = readFileSync(new URL('../src/app/api/brands/[id]/accounts/[aid]/unbind/route.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const deps: any = {
    'next/server': { NextResponse: { json: (body: any, options: any = {}) => Response.json(body, options) } },
    '@/lib/auth': { getSession: async () => user ? { user } : null },
    '@/lib/brandAccess': { canWriteBrandProject: async () => canWrite },
    '@/lib/socialAccountBinding': { SocialAccountBindingError, unbindSocialAccount: async (...args: any[]) => { called++; assert.deepEqual(args, ['brand', 'a', 'operator']); return { ok: true } } },
  }
  new Function('require', 'module', 'exports', compiled)((name: string) => { assert(deps[name], name); return deps[name] }, module, module.exports)
  const call = () => module.exports.POST(new Request('http://localhost'), { params: Promise.resolve({ id: 'brand', aid: 'a' }) })
  assert.equal((await call()).status, 401)
  user = { id: 'operator' }
  assert.equal((await call()).status, 404)
  assert.equal(called, 0)
  canWrite = true
  assert.equal((await call()).status, 200)
  assert.equal(called, 1)
  console.log('PASS social account unbinding: identity, isolation, history, idempotency, sync, rebind, pending posts, failure, concurrency and route permissions')
} finally {
  globalThis.fetch = originalFetch
}
