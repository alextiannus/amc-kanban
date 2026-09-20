import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { SocialAccountBindingError } from '../src/lib/socialAccountIdentity.ts'

function compile(path: string, deps: Record<string, any>) {
  const module = { exports: {} as any }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)((name: string) => { assert(name in deps, name); return deps[name] }, module, module.exports)
  return module.exports
}
let state: any
let remote: any
let posts: any
let pending = 0, jobs = 0, busy = false, failAudit = false, conflict = false
const initial = () => ({
  key: { id: 'key', token: 'secret-key-never-expose', status: 'ASSIGNED', assignedBrandId: 'brand', assignedUserId: 'owner', assignedAt: 'date', updatedAt: '2026-09-20T00:00:00.000Z' },
  brand: { id: 'brand', postfastApiKey: 'secret-key-never-expose', postfastConnectLink: 'old-link', postfastConnectLinkUpdatedAt: 'date', postfastSnapshot: { accounts: [] }, postfastSyncedAt: 'date' },
  accounts: [{ id: 'a', postfastAccountId: 'pf', autoPilot: true }, { id: 'direct', postfastAccountId: null, autoPilot: true }],
  history: [{ id: 'history', status: 'published' }], audit: [],
})
function reset() {
  state = initial(); remote = { success: true, accounts: [] }; posts = { success: true, posts: [], hasNextPage: false }
  pending = jobs = 0; busy = failAudit = conflict = false
}
function matches(row: any, where: any) { return Object.entries(where).every(([k, v]) => row[k] === v) }
const tx: any = {
  postfastApiKeyPool: {
    findUnique: async () => state.key,
    updateMany: async ({ where, data }: any) => {
      if (conflict || !matches(state.key, where)) return { count: 0 }
      Object.assign(state.key, data); return { count: 1 }
    },
  },
  brand: {
    findUnique: async () => state.brand,
    findFirst: async () => null,
    updateMany: async ({ where, data }: any) => {
      if (!matches(state.brand, where)) return { count: 0 }
      Object.assign(state.brand, data); return { count: 1 }
    },
  },
  socialAccount: {
    findMany: async () => state.accounts,
    updateMany: async ({ data }: any) => { state.accounts.filter((a: any) => a.postfastAccountId).forEach((a: any) => Object.assign(a, data)) },
  },
  contentDraft: { count: async () => pending },
  postfastDeliveryJob: { count: async () => jobs },
  auditLog: { create: async ({ data }: any) => { if (failAudit) throw new Error('audit failed'); state.audit.push(data) } },
}
const prisma: any = { ...tx, $transaction: async (work: any) => {
  const before = structuredClone(state)
  try { return await work(tx) } catch (error) { state = before; throw error }
} }
const pool = { sanitizePostfastPoolRecords: (keys: any[]) => keys.map(({ token, ...key }) => ({ ...key, maskedKey: 'masked' })) }
const binding = { SocialAccountBindingError, lockBrandSync: async () => {}, lockAccountBinding: async () => {
  if (busy) throw new SocialAccountBindingError('busy', 409, 'ACCOUNT_BUSY')
} }
const service = compile('src/lib/postfastKeyRelease.ts', {
  '@prisma/client': { Prisma: { DbNull: null, TransactionIsolationLevel: { Serializable: 'Serializable' } } },
  '@/lib/prisma': { prisma }, '@/lib/postfastKeyPool': pool, '@/lib/socialAccountBinding': binding,
  '@/lib/integrations/postfast': { postfastFetchAccounts: async () => remote, postfastListPosts: async () => posts },
})
const release = () => service.releasePostfastPoolKey({ id: 'key', expectedBrandId: 'brand', expectedUpdatedAt: '2026-09-20T00:00:00.000Z', actorId: 'admin' })
reset()
const result = await release()
assert.equal(result.status, 'AVAILABLE')
assert(!JSON.stringify(result).includes('secret'))
for (const field of ['assignedBrandId', 'assignedUserId', 'assignedAt']) assert.equal(state.key[field], null)
for (const field of ['postfastApiKey', 'postfastConnectLink', 'postfastConnectLinkUpdatedAt', 'postfastSnapshot', 'postfastSyncedAt']) assert.equal(state.brand[field], null)
assert.deepEqual(state.history, initial().history)
assert.equal(state.accounts[0].autoPilot, false)
assert.equal(state.accounts[1].autoPilot, true)
assert.equal(state.audit.length, 1)
assert(!JSON.stringify(state.audit).includes('secret'))
remote.success = false
await release()
assert.equal(state.audit.length, 1)

for (const [setup, code] of [
  [() => { state.key.assignedBrandId = 'other' }, 'KEY_ASSIGNMENT_CHANGED'],
  [() => { state.brand.postfastApiKey = 'replacement' }, 'KEY_ASSIGNMENT_CHANGED'],
  [() => { state.key.updatedAt = '2026-09-20T01:00:00.000Z' }, 'KEY_ASSIGNMENT_CHANGED'],
  [() => { state.key.status = 'RETIRED' }, 'KEY_ASSIGNMENT_CHANGED'],
  [() => { pending = 1 }, 'KEY_HAS_PENDING_POSTS'],
  [() => { jobs = 1 }, 'KEY_HAS_PENDING_POSTS'],
  [() => { busy = true }, 'ACCOUNT_BUSY'],
  [() => { remote.accounts = [{ id: 'remote-account' }] }, 'KEY_HAS_ACCOUNTS'],
  [() => { remote.success = false }, 'KEY_STATUS_UNAVAILABLE'],
  [() => { posts.success = false }, 'KEY_STATUS_UNAVAILABLE'],
  [() => { posts.posts = [{ id: 'scheduled' }] }, 'KEY_HAS_PENDING_POSTS'],
  [() => { posts.total = 1 }, 'KEY_HAS_PENDING_POSTS'],
  [() => { posts.hasNextPage = true }, 'KEY_STATUS_UNAVAILABLE'],
  [() => { conflict = true }, 'KEY_ASSIGNMENT_CHANGED'],
] as const) {
  reset(); setup(); const before = structuredClone(state)
  await assert.rejects(release, (error: any) => error.code === code)
  assert.deepEqual(state, before, `${code} must not partially write`)
}
reset(); failAudit = true
await assert.rejects(release, /audit failed/)
assert.deepEqual(state, initial(), 'audit failure must roll back both brand and pool')

let user: any = null
const route = compile('src/app/api/admin/postfast-keys/route.ts', {
  'next/server': { NextResponse: { json: (body: any, options: any = {}) => Response.json(body, options) } },
  '@/lib/prisma': { prisma }, '@/lib/auth': { getSession: async () => user ? { user } : null },
  '@/lib/amcOperator': { isAmcOperator: (u: any) => u.role === 'ADMIN' },
  '@/lib/postfastKeyPool': { ...pool, POSTFAST_KEY_STATUSES: ['AVAILABLE', 'ASSIGNED', 'RETIRED'] },
  '@/lib/postfastKeyRelease': service, '@/lib/socialAccountBinding': binding,
})
const call = (body: any) => route.PATCH(new Request('http://localhost/api/admin/postfast-keys', { method: 'PATCH', body: JSON.stringify(body) }))
const body = { id: 'key', action: 'release', expectedBrandId: 'brand', expectedUpdatedAt: '2026-09-20T00:00:00.000Z' }
reset()
assert.equal((await call(body)).status, 401)
user = { id: 'owner', role: 'BRAND_OWNER' }
assert.equal((await call(body)).status, 403)
user = { id: 'admin', role: 'ADMIN' }
assert.equal((await call({ id: 'key', action: 'release' })).status, 400)
assert.equal((await call({ ...body, expectedUpdatedAt: undefined })).status, 400)
assert.equal((await call({ ...body, expectedUpdatedAt: 'invalid' })).status, 400)
assert.equal((await call({ ...body, expectedUpdatedAt: '2026-09-19T00:00:00.000Z' })).status, 409)
assert.equal((await call({ ...body, status: 'RETIRED' })).status, 400)
assert.equal((await call({ id: 'key', status: 'AVAILABLE' })).status, 400)
assert.equal((await call({ id: 'key', status: 'RETIRED' })).status, 400)
assert.equal((await call(body)).status, 200)
assert.equal((await call({ id: 'key', status: 'ASSIGNED' })).status, 400)
reset(); remote.accounts = [{ id: 'bound' }]
assert.equal((await call(body)).status, 409)
remote.success = false
assert.equal((await call(body)).status, 503)
console.log('PASS PostFast key release: release, history, redaction, idempotency, conflicts, pending work, remote failures, rollback and route authorization')
