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
const actors: Record<string, any> = {
  'token-a': { id: `actor-a-${suffix}`, type: 'HUMAN', role: 'USER' },
  'token-b': { id: `actor-b-${suffix}`, type: 'HUMAN', role: 'USER' },
}

let entered = 0
let releaseBarrier!: () => void
const barrier = new Promise<void>(resolve => { releaseBarrier = resolve })
const db = {
  videoProductionJob: prisma.videoProductionJob,
  $transaction: (fn: (tx: any) => unknown) => prisma.$transaction(async tx => {
    entered += 1
    if (entered === 2) releaseBarrier()
    await barrier
    return fn(tx)
  }),
}

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
})

const post = (token: string, brandId: string) => route.POST(new Request('https://kanban.test/api/content/video/jobs', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ id: sharedId, brandId, title: brandId, plan: {} }),
}))

try {
  for (const actor of Object.values(actors)) await prisma.user.create({ data: { id: actor.id, email: `${actor.id}@example.invalid`, password: 'fixture', role: 'ADMIN' } })
  await prisma.brand.create({ data: { id: brandA, name: brandA, crew: { create: { members: { create: { userId: actors['token-a'].id, role: 'OWNER' } } } } } })
  await prisma.brand.create({ data: { id: brandB, name: brandB, crew: { create: { members: { create: { userId: actors['token-b'].id, role: 'OWNER' } } } } } })
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
  console.log('PASS PostgreSQL global video-job ID race: one winner, normalized loser, no foreign overwrite')
} finally {
  await prisma.brand.deleteMany({ where: { id: { in: [brandA, brandB] } } })
  await prisma.user.deleteMany({ where: { id: { in: Object.values(actors).map(actor => actor.id) } } })
  await prisma.$disconnect()
}
