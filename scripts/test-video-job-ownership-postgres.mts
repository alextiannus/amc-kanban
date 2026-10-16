import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { prisma } from '../src/lib/prisma.ts'
import { readTrustedVideoJob } from '../src/lib/videoJobAccess.ts'

assert(process.env.DATABASE_URL?.includes('localhost') && process.env.DATABASE_URL.includes('_test_'))

const compile = (file: string, deps: Record<string, unknown>) => {
  const mod = { exports: {} as any }
  const output = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', 'console', output)(
    (key: string) => {
      assert(key in deps, `missing test dependency: ${key}`)
      return deps[key]
    }, mod, mod.exports, { ...console, error: () => {} },
  )
  return mod.exports
}

const suffix = randomUUID()
const brandA = `video-owner-a-${suffix}`
const brandB = `video-owner-b-${suffix}`
const sharedId = `video-shared-${suffix}`
const internalId = `video-internal-${suffix}`
const internalSharedId = `video-internal-shared-${suffix}`
const revokedActorId = `actor-revoked-${suffix}`
const actors: Record<string, any> = {
  'token-a': { id: `actor-a-${suffix}`, type: 'HUMAN', role: 'USER' },
  'token-b': { id: `actor-b-${suffix}`, type: 'HUMAN', role: 'USER' },
}

let barrierState: { entered: number; promise: Promise<void>; release: () => void } | null = null
function armTwoTransactionBarrier() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  barrierState = { entered: 0, promise, release }
}
const db = {
  videoProductionJob: prisma.videoProductionJob,
  $transaction: (fn: (tx: any) => unknown) => prisma.$transaction(async tx => {
    const barrier = barrierState
    if (barrier) {
      barrier.entered += 1
      if (barrier.entered === 2) {
        barrier.release()
        barrierState = null
      }
      await barrier.promise
    }
    return fn(tx)
  }),
}
const persistence = compile('src/lib/videoJobPersistence.ts', {
  '@prisma/client': {},
  './brandAccess': { canSessionAccessBrandProject: async () => true },
  './prisma': { prisma: db },
  './videoLineage': { pinVideoEditor: async () => { throw new Error('not expected') }, editorForLibrary: () => { throw new Error('not expected') } },
  './role-permissions/delegation': { requireActorPermission: async () => {} },
  './user-management/brandAccess': { canUserAccessBrand: async () => true },
  './videoReceipt': { verifyVideoReceipt: () => {}, videoReceiptDigest: () => 'digest' },
})

const route = compile('src/app/api/content/video/jobs/route.ts', {
  'next/server': { NextResponse: Response },
  '@prisma/client': {},
  '@/lib/auth': {
    getSession: async () => null,
    extractApiKey: (request: Request) => request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null,
    getAgentFromApiKey: async (token: string) => actors[token] || null,
  },
  '@/lib/brandAccess': { canSessionAccessBrandProject: async () => true },
  '@/lib/prisma': { prisma: db },
  '@/lib/videoLineage': { pinVideoEditor: async () => { throw new Error('not expected') }, editorForLibrary: () => { throw new Error('not expected') } },
  '@/lib/role-permissions/delegation': { requireActorPermission: async () => {} },
  '@/lib/role-permissions/request-origin': { allowedRoleWriteOrigin: () => true },
  '@/lib/user-management/brandAccess': { canUserAccessBrand: async () => true },
  '@/lib/videoReceipt': { verifyVideoReceipt: () => {}, videoReceiptDigest: () => 'digest' },
  '@/lib/videoJobContract': await import('../src/lib/videoJobContract.ts'),
  '@/lib/videoJobPersistence': persistence,
})
const internal = compile('src/app/api/internal/content/video-jobs/route.ts', {
  'node:crypto': await import('node:crypto'),
  '@/lib/videoJobAccess': await import('../src/lib/videoJobAccess.ts'),
  '@/lib/videoJobContract': await import('../src/lib/videoJobContract.ts'),
  '@/lib/videoJobPersistence': persistence,
})

const post = (token: string, brandId: string) => route.POST(new Request('https://kanban.test/api/content/video/jobs', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ id: sharedId, brandId, title: brandId, plan: {} }),
}))
const internalPost = (token: string | null, payload: any) => internal.POST(new Request('https://kanban.test/api/internal/content/video-jobs', {
  method: 'POST',
  headers: token ? { 'x-content-service-token': token } : {},
  body: JSON.stringify(payload),
}))

const previousInternalToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN
try {
  process.env.CONTENT_SERVICE_INTERNAL_TOKEN = 'test-only-internal-video-job-write'
  for (const actor of Object.values(actors)) await prisma.user.create({ data: { id: actor.id, email: `${actor.id}@example.invalid`, password: 'fixture', role: 'ADMIN' } })
  await prisma.user.create({ data: { id: revokedActorId, email: `${revokedActorId}@example.invalid`, password: 'fixture', role: 'USER' } })
  await prisma.brand.create({ data: { id: brandA, name: brandA, crew: { create: { members: { create: { userId: actors['token-a'].id, role: 'OWNER' } } } } } })
  await prisma.brand.create({ data: { id: brandB, name: brandB, crew: { create: { members: { create: { userId: actors['token-b'].id, role: 'OWNER' } } } } } })
  armTwoTransactionBarrier()
  const responses = await Promise.all([post('token-a', brandA), post('token-b', brandB)])
  const results = await Promise.all(responses.map(async response => ({ status: response.status, body: await response.json() })))
  assert.deepEqual(results.map(result => result.status).sort(), [200, 404], 'exactly one global-ID creator wins')
  assert.deepEqual(results.find(result => result.status === 404)?.body, { error: 'Not found' })
  const winner = await prisma.videoProductionJob.findUniqueOrThrow({ where: { id: sharedId } })
  const expectedActor = winner.brandId === brandA ? actors['token-a'].id : actors['token-b'].id
  assert.equal(winner.createdBy, expectedActor)
  assert.equal(winner.title, winner.brandId, 'loser did not overwrite winner payload')
  assert.equal(await prisma.videoProductionJob.count({ where: { id: sharedId } }), 1)
  assert.equal((await readTrustedVideoJob(expectedActor, sharedId, winner.brandId)).id, sharedId)
  const losingActor = expectedActor === actors['token-a'].id ? actors['token-b'].id : actors['token-a'].id
  await assert.rejects(() => readTrustedVideoJob(losingActor, sharedId, winner.brandId), (error: any) => error?.status === 404)

  const internalPayload = { actorId: actors['token-a'].id, job: { id: internalId, brandId: brandA, title: 'Trusted create', plan: {} } }
  assert.equal((await internalPost(null, internalPayload)).status, 401)
  assert.equal((await internalPost('wrong-token', internalPayload)).status, 401)
  assert.equal(await prisma.videoProductionJob.count({ where: { id: internalId } }), 0, 'missing/wrong internal tokens cause zero mutation')
  const trustedCreate = await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, internalPayload)
  assert.equal(trustedCreate.status, 200)
  const trustedBody: any = await trustedCreate.json()
  assert.equal(trustedBody.job.createdBy, actors['token-a'].id)
  assert.equal(trustedBody.job.title, 'Trusted create')
  assert.equal(trustedCreate.headers.get('cache-control'), 'no-store')
  const trustedUpdate = await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, {
    actorId: actors['token-a'].id,
    job: { ...internalPayload.job, title: 'Trusted update' },
  })
  assert.equal(trustedUpdate.status, 200)
  assert.equal((await trustedUpdate.json() as any).job.createdBy, actors['token-a'].id, 'trusted update keeps the persisted owner immutable')
  armTwoTransactionBarrier()
  const internalRaceResponses = await Promise.all([
    internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: actors['token-a'].id, job: { id: internalSharedId, brandId: brandA, title: 'Internal A', plan: {} } }),
    internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: actors['token-b'].id, job: { id: internalSharedId, brandId: brandB, title: 'Internal B', plan: {} } }),
  ])
  assert.deepEqual(internalRaceResponses.map(response => response.status).sort(), [200, 404])
  const internalRaceWinner = await prisma.videoProductionJob.findUniqueOrThrow({ where: { id: internalSharedId } })
  const internalExpectedOwner = internalRaceWinner.brandId === brandA ? actors['token-a'].id : actors['token-b'].id
  assert.equal(internalRaceWinner.createdBy, internalExpectedOwner)
  assert.equal(internalRaceWinner.title, internalRaceWinner.brandId === brandA ? 'Internal A' : 'Internal B')
  const beforeDenied = await prisma.videoProductionJob.findUniqueOrThrow({ where: { id: internalId } })
  assert.equal((await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: actors['token-b'].id, job: { ...internalPayload.job, title: 'Wrong owner overwrite' } })).status, 404)
  assert.equal((await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { actorId: revokedActorId, job: { ...internalPayload.job, title: 'Revoked overwrite' } })).status, 404)
  await prisma.user.update({ where: { id: actors['token-a'].id }, data: { status: 'DISABLED' } })
  assert.equal((await internalPost(process.env.CONTENT_SERVICE_INTERNAL_TOKEN, { ...internalPayload, job: { ...internalPayload.job, title: 'Inactive overwrite' } })).status, 404)
  await prisma.user.update({ where: { id: actors['token-a'].id }, data: { status: 'ACTIVE' } })
  const afterDenied = await prisma.videoProductionJob.findUniqueOrThrow({ where: { id: internalId } })
  assert.equal(afterDenied.title, beforeDenied.title, 'wrong-owner, revoked and inactive internal writes cause zero mutation')
  console.log('PASS PostgreSQL global video-job ID race: one winner, normalized loser, no foreign overwrite')
  console.log('PASS PostgreSQL internal video-job write: token-first auth, active/access/owner enforcement, atomic trusted ack')
} finally {
  await prisma.brand.deleteMany({ where: { id: { in: [brandA, brandB] } } })
  await prisma.user.deleteMany({ where: { id: { in: [...Object.values(actors).map(actor => actor.id), revokedActorId] } } })
  await prisma.$disconnect()
  if (previousInternalToken === undefined) delete process.env.CONTENT_SERVICE_INTERNAL_TOKEN
  else process.env.CONTENT_SERVICE_INTERNAL_TOKEN = previousInternalToken
}
