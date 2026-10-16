import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

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

const matches = (row: Job, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => value === undefined || row[key] === value)

const videoProductionJob = {
  findFirst: async ({ where }: any) => rows.find(row => matches(row, where)) ?? null,
  findUnique: async ({ where }: any) => rows.find(row => row.id === where.id) ?? null,
  upsert: async ({ where, create, update }: any) => {
    writes += 1
    const existing = rows.find(row => row.id === where.id)
    if (existing) {
      Object.assign(existing, structuredClone(update))
      return existing
    }
    const created = { ...job(create.id, create.brandId, create.createdBy), ...structuredClone(create) }
    rows.push(created)
    return created
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
})

const get = (id: string, brandId = 'brand') =>
  route.GET(new Request(`https://kanban.test/api/content/video/jobs?id=${id}&brandId=${brandId}`))
const post = (id: string, brandId = 'brand', extra: Record<string, unknown> = {}) =>
  route.POST(new Request('https://kanban.test/api/content/video/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, brandId, title: 'Updated', plan: {}, ...extra }),
  }))
const snapshot = async (response: Response) => ({ status: response.status, body: await response.json() })

const owned = await get('owned')
assert.equal(owned.status, 200)
const ownedBody: any = await owned.json()
assert.equal(ownedBody.job.ownedByCurrentActor, true)
assert.equal('createdBy' in ownedBody.job, false, 'browser response must not disclose the raw owner id')
assert.equal(ownedBody.job.script, 'safe script', 'supported voice state remains available')

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
assert.equal(rows.find(row => row.id === 'owned')?.createdBy, 'owner', 'owner remains immutable on downstream updates')

actor = { ...actor, id: 'other' }
assert.deepEqual(await snapshot(await get('owned')), absentRead, 'refresh is owner-bound even within the same brand')

console.log('PASS video job ownership: owner-only read/refresh/write, legacy fail-closed, non-enumerable denial, immutable hidden owner')
