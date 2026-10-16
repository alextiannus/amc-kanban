import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const persistenceSource = readFileSync('src/lib/videoJobPersistence.ts', 'utf8')
assert.doesNotMatch(persistenceSource, /brandId\s*\+\s*['"]:['"]\s*\+\s*id/, 'globally unique job IDs must not use brand-scoped advisory locks')
assert.match(persistenceSource, /video-job:['"]?\s*\+\s*id/, 'shared persistence must use an ID-global advisory lock')

const compile = (file: string, deps: Record<string, unknown>) => {
  const mod = { exports: {} as any }
  const source = readFileSync(file, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', 'console', output)(
    (key: string) => {
      assert(key in deps, `missing test dependency: ${key}`)
      return deps[key]
    },
    mod,
    mod.exports,
    { ...console, error: () => {} },
  )
  return mod.exports
}

type Job = Record<string, any> & { id: string; brandId: string; createdBy: string | null }

const job = (id: string, brandId: string, createdBy: string | null): Job => ({
  id,
  brandId,
  createdBy,
  creativeId: null,
  title: 'Video',
  platform: 'tiktok',
  idea: 'Idea',
  status: 'generating',
  progress: 10,
  thumbnailUrl: null,
  finalVideoUrl: null,
  narration: null,
  musicBrief: null,
  creatorType: null,
  aspectRatio: null,
  assetIds: [],
  mediaUrls: [],
  scenes: [],
  plan: null,
  sceneExecutions: null,
  finalExecution: null,
  voiceoverState: null,
  error: null,
  createdAt: new Date('2026-10-17T00:00:00.000Z'),
  updatedAt: new Date('2026-10-17T00:00:00.000Z'),
})

let actor: any = { id: 'owner', type: 'HUMAN', role: 'USER' }
let brandAccess = true
let writes = 0
const rows: Job[] = [
  job('owned', 'brand', 'owner'),
  job('same-brand-other-owner', 'brand', 'other'),
  job('legacy-missing-owner', 'brand', null),
  job('different-brand', 'other-brand', 'owner'),
]
rows[0].voiceoverState = { script: 'safe script', createdBy: 'nested-owner-leak', ownedByCurrentActor: false }
rows[0].plan = {
  _mmVideoJob: {
    videoReceipt: { ownerId: 'receipt-owner', editorActorId: 'receipt-editor', signature: 'secret-signature' },
    revisions: [{ actorId: 'history-actor', userId: 'history-user', note: 'safe history' }],
    nested: { createdById: 'nested-created-by', updatedBy: 'nested-updater', value: 'safe nested value' },
  },
}

const matches = (row: Job, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => value === undefined || row[key] === value)

const videoProductionJob = {
  findFirst: async ({ where }: any) => rows.find(row => matches(row, where)) ?? null,
  findUnique: async ({ where }: any) => rows.find(row => row.id === where.id) ?? null,
  create: async ({ data }: any) => {
    writes += 1
    const created = { ...job(data.id, data.brandId, data.createdBy), ...structuredClone(data) }
    rows.push(created)
    return created
  },
  update: async ({ where, data }: any) => {
    writes += 1
    const existing = rows.find(row => row.id === where.id)
    assert(existing)
    Object.assign(existing, structuredClone(data))
    return existing
  },
}
const tx: any = {
  $queryRaw: async () => [],
  videoProductionJob,
  mediaAsset: { findMany: async () => [] },
}
const prisma: any = {
  videoProductionJob,
  $transaction: async (fn: (client: any) => unknown) => fn(tx),
}

const persistence = compile('src/lib/videoJobPersistence.ts', {
  '@prisma/client': {},
  './brandAccess': { canSessionAccessBrandProject: async (brand: string) => brandAccess && brand === 'brand' },
  './prisma': { prisma },
  './videoLineage': { pinVideoEditor: async () => { throw new Error('not expected') }, editorForLibrary: () => { throw new Error('not expected') } },
  './role-permissions/delegation': { requireActorPermission: async () => {} },
  './user-management/brandAccess': { canUserAccessBrand: async () => brandAccess },
  './videoReceipt': { verifyVideoReceipt: () => {}, videoReceiptDigest: () => 'digest' },
})

const route = compile('src/app/api/content/video/jobs/route.ts', {
  'next/server': { NextResponse: Response },
  '@prisma/client': {},
  '@/lib/auth': {
    getSession: async () => actor ? { user: actor } : null,
    extractApiKey: () => null,
    getAgentFromApiKey: async () => null,
  },
  '@/lib/brandAccess': {
    canSessionAccessBrandProject: async (brandId: string) => brandAccess && brandId === 'brand',
  },
  '@/lib/prisma': { prisma },
  '@/lib/videoLineage': {
    pinVideoEditor: async () => { throw new Error('not expected') },
    editorForLibrary: () => { throw new Error('not expected') },
  },
  '@/lib/role-permissions/delegation': { requireActorPermission: async () => {} },
  '@/lib/role-permissions/request-origin': { allowedRoleWriteOrigin: () => true },
  '@/lib/user-management/brandAccess': { canUserAccessBrand: async () => brandAccess },
  '@/lib/videoReceipt': {
    verifyVideoReceipt: () => {},
    videoReceiptDigest: () => 'digest',
  },
  '@/lib/videoJobContract': await import('../src/lib/videoJobContract.ts'),
  '@/lib/videoJobPersistence': persistence,
})

const get = (id: string, brandId = 'brand', headers?: HeadersInit) =>
  route.GET(new Request(`https://kanban.test/api/content/video/jobs?id=${id}&brandId=${brandId}`, { headers }))
const post = (id: string, brandId = 'brand', extra: Record<string, unknown> = {}) =>
  route.POST(new Request('https://kanban.test/api/content/video/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, brandId, title: 'Updated', plan: {}, ...extra }),
  }))
const snapshot = async (response: Response) => ({ status: response.status, body: await response.json() })
const forbiddenIdentityKey = (key: string) => /^(?:createdBy(?:Id)?|ownerId|editorActorId|actorId|userId|updatedBy(?:Id)?)$/i.test(key)
const assertPublicShape = (value: unknown): void => {
  if (Array.isArray(value)) return value.forEach(assertPublicShape)
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenIdentityKey(key), false, `public response leaked identity key ${key}`)
    assert.notEqual(key, 'videoReceipt', 'public response leaked the internal signed receipt')
    assertPublicShape(nested)
  }
}

const owned = await get('owned')
assert.equal(owned.status, 200)
const ownedBody: any = await owned.json()
assert.equal(ownedBody.job.ownedByCurrentActor, true)
assert.equal('createdBy' in ownedBody.job, false, 'browser response must not disclose the raw owner id')
assert.equal(ownedBody.job.script, 'safe script', 'supported voice state remains available')
assert.equal(ownedBody.job.plan._mmVideoJob.revisions[0].note, 'safe history')
assert.equal(ownedBody.job.plan._mmVideoJob.nested.value, 'safe nested value')
assertPublicShape(ownedBody.job)
assert.doesNotMatch(JSON.stringify(ownedBody.job), /receipt-owner|receipt-editor|history-actor|history-user|nested-created-by|nested-updater|secret-signature/)
const fakeMmPublic: any = await (await get('owned', 'brand', { 'x-client-type': 'mm' })).json()
assertPublicShape(fakeMmPublic.job)
assert.equal(fakeMmPublic.job.ownedByCurrentActor, true, 'client flags cannot select the trusted shape')

const absentRead = await snapshot(await get('missing'))
const otherOwnerRead = await snapshot(await get('same-brand-other-owner'))
const legacyRead = await snapshot(await get('legacy-missing-owner'))
const brandDeniedRead = await snapshot(await get('different-brand', 'other-brand'))
assert.deepEqual(otherOwnerRead, absentRead, 'same-brand different actor must be indistinguishable from absent')
assert.deepEqual(legacyRead, absentRead, 'legacy job without owner must fail closed and be indistinguishable')
assert.deepEqual(brandDeniedRead, absentRead, 'brand denial must be indistinguishable from absent')

const writesBeforeDenied = writes
const absentWrite = await snapshot(await post('same-brand-missing'))
assert.equal(absentWrite.status, 200, 'an unused id can create a job')
assert.equal(rows.find(row => row.id === 'same-brand-missing')?.createdBy, 'owner')

const otherOwnerWrite = await snapshot(await post('same-brand-other-owner'))
const legacyWrite = await snapshot(await post('legacy-missing-owner'))
const brandDeniedWrite = await snapshot(await post('different-brand'))
const canonicalDeniedWrite = { status: 404, body: { error: 'Not found' } }
assert.deepEqual(otherOwnerWrite, canonicalDeniedWrite)
assert.deepEqual(legacyWrite, canonicalDeniedWrite)
assert.deepEqual(brandDeniedWrite, canonicalDeniedWrite)
assert.equal(writes, writesBeforeDenied + 1, 'denied updates must not write')

const ownedWrite = await post('owned', 'brand', { createdBy: 'forged-owner' })
assert.equal(ownedWrite.status, 200)
const ownedWriteBody: any = await ownedWrite.json()
assert.equal(ownedWriteBody.job.ownedByCurrentActor, true)
assert.equal('createdBy' in ownedWriteBody.job, false)
assertPublicShape(ownedWriteBody.job)
assert.equal(rows.find(row => row.id === 'owned')?.createdBy, 'owner', 'owner remains immutable on downstream updates')

actor = { ...actor, id: 'other' }
assert.deepEqual(await snapshot(await get('owned')), absentRead, 'refresh is owner-bound even within the same brand')

const previousInternalToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN
try {
  process.env.CONTENT_SERVICE_INTERNAL_TOKEN = 'test-only-video-job-internal-token'
  rows.find(row => row.id === 'owned')!.plan = { _mmVideoJob: { videoReceipt: { ownerId: 'receipt-owner', editorActorId: 'receipt-editor', signature: 'secret-signature' } } }
  const internal = compile('src/app/api/internal/content/video-jobs/route.ts', {
    'node:crypto': await import('node:crypto'),
    '@/lib/videoJobAccess': {
      readTrustedVideoJob: async (actorId: string, id: string) => {
        const found = rows.find(row => row.id === id)
        if (!found || found.createdBy !== actorId) throw Object.assign(new Error('Not found'), { status: 404 })
        return found
      },
      resolveTrustedVideoJobActor: async (actorId: string, brandId: string) => {
        if (!actorId || brandId !== 'brand' || actorId === 'inactive') throw Object.assign(new Error('Not found'), { status: 404 })
        return { id: actorId, type: 'HUMAN', role: 'USER' }
      },
    },
    '@/lib/videoJobContract': await import('../src/lib/videoJobContract.ts'),
    '@/lib/videoJobPersistence': persistence,
  })
  const internalPost = (token: string, payload: any = { actorId: 'owner', id: 'owned', brandId: 'brand' }) => internal.POST(new Request('https://kanban.test/api/internal/content/video-jobs', {
    method: 'POST', headers: { 'x-content-service-token': token }, body: JSON.stringify(payload),
  }))
  const internalWrites = writes
  assert.equal((await internalPost('wrong-token', { actorId: 'owner', job: { id: 'internal-forbidden', brandId: 'brand' } })).status, 401)
  assert.equal(writes, internalWrites, 'invalid internal token cannot mutate')
  assert.equal((await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: 'other', id: 'owned', brandId: 'brand' })).status, 404)
  assert.equal((await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: 'inactive', job: { id: 'internal-inactive', brandId: 'brand' } })).status, 404)
  assert.equal(writes, internalWrites, 'inactive internal actor cannot mutate')
  const trusted = await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN)
  assert.equal(trusted.status, 200)
  assert.equal(trusted.headers.get('cache-control'), 'no-store')
  const trustedBody: any = await trusted.json()
  assert.equal(trustedBody.job.createdBy, 'owner')
  assert.equal(trustedBody.job.plan._mmVideoJob.videoReceipt.ownerId, 'receipt-owner')
  const internalCreated = await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: 'owner', job: { id: 'internal-created', brandId: 'brand', title: 'Internal create', plan: {} } })
  assert.equal(internalCreated.status, 200)
  assert.equal((await internalCreated.json() as any).job.createdBy, 'owner')
  const internalUpdated = await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: 'owner', job: { id: 'internal-created', brandId: 'brand', title: 'Internal update', plan: {} } })
  assert.equal(internalUpdated.status, 200)
  assert.equal((await internalUpdated.json() as any).job.createdBy, 'owner', 'trusted update keeps the persisted owner immutable')
  const beforeWrongOwner = writes
  const wrongOwner = await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: 'other', job: { id: 'internal-created', brandId: 'brand', title: 'Overwrite', plan: {} } })
  assert.equal(wrongOwner.status, 404)
  assert.equal(writes, beforeWrongOwner, 'wrong internal owner cannot mutate')
  assert.equal(rows.find(row => row.id === 'internal-created')?.title, 'Internal update')
} finally {
  if (previousInternalToken === undefined) delete process.env.CONTENT_SERVICE_INTERNAL_TOKEN
  else process.env.CONTENT_SERVICE_INTERNAL_TOKEN = previousInternalToken
}

console.log('PASS video job ownership: owner-only read/refresh/write, legacy fail-closed, non-enumerable denial, immutable hidden owner')
