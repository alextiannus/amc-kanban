import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import ts from 'typescript'

let job: any
let fail = true
const requests: any[] = []
const db: any = {
  brand: { findUnique: async ({ where, select }: any) => {
    const row: any = { id: 'brand', postfastApiKey: 'mock' }
    assert.equal(where.id, row.id)
    return Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]]))
  } },
  socialAccount: { findFirst: async () => ({ id: 'account', unboundAt: null }) },
  contentDraft: { updateMany: async () => ({ count: 1 }), update: async ({ data }: any) => ({ id: 'draft', ...data }) },
  actionItem: { updateMany: async () => ({ count: 1 }) },
  postfastDeliveryJob: {
    findFirst: async () => null, findUnique: async () => null,
    create: async ({ data }: any) => (job = { id: 'job', attempts: 1, leaseToken: 'lease', ...data }),
    updateMany: async ({ data }: any) => { job = { ...job, ...data }; return { count: 1 } },
  },
  $transaction: async (task: any) => typeof task === 'function' ? task(db) : Promise.all(task),
}
const deps: Record<string, any> = {
  './role-permissions/delegation': { requireActorPermission: async (_actorId: string, permission: string, brandId: string) => {
    assert.equal(permission, 'content.publish')
    assert.equal(brandId, 'brand')
  } },
  './role-permissions/store': { PolicyError: class extends Error {} },
  'node:crypto': { createHash, randomUUID },
  '@/lib/prisma': { prisma: db },
  '@/lib/socialAccountBinding': { lockAccountBinding: async () => {}, assertAccountBound: () => {} },
  '@/lib/integrations/huaweiObs': { persistDraftSnapshotToObs: async () => {} },
  '@/lib/syncDraftStatuses': { POSTFAST_RESULT_UNKNOWN: 'POSTFAST_RESULT_UNKNOWN' },
  './feedbackService': { processDraftCuration: async () => {} },
  '@/lib/integrations/postfast': {
    postfastPublish: async (input: any) => {
      requests.push(input)
      return fail ? { success: false, error: 'HTTP 503' } : { success: true, postId: 'post' }
    },
    postfastUploadPublicUrlStream: async () => { throw new Error('Stored upload must be reused') },
  },
}
const source = readFileSync(new URL('../src/lib/postfastDelivery.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source + '\nexport { processClaimedJob };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const loaded = { exports: {} as any }
new Function('require', 'module', 'exports', compiled)((name: string) => {
  assert(name in deps, name)
  return deps[name]
}, loaded, loaded.exports)

for (const enabled of [true, false, undefined]) {
  for (const immediate of [true, false]) {
    const publish = {
      platform: 'tiktok', accountId: 'account', caption: 'AI content', tiktokIsAigc: enabled,
      firstComment: 'Preserved', scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      mediaItems: [{ storageKey: 'video/already-uploaded', metadata: { kind: 'video', sizeBytes: 80000000 } }],
    }
    await loaded.exports.enqueuePostfastDelivery({
      brandId: 'brand', draftId: 'draft', actorId: 'owner', draftUpdatedAt: new Date(),
      immediatePublish: immediate, scheduled: !immediate, publish,
    })
    assert.equal(job.payload.publish.tiktokIsAigc, enabled)
    publish.tiktokIsAigc = !enabled // The job must own a snapshot, not reference mutable input.
    fail = true
    assert.equal(await loaded.exports.processClaimedJob(job, Date.now() + 120000), 'retried')
    assert.equal(job.payload.publish.tiktokIsAigc, enabled)
    fail = false
    job.payload.publish.brandId = 'stale-brand' // The persisted job scope overrides an old payload.
    assert.equal(await loaded.exports.processClaimedJob(job, Date.now() + 120000), 'succeeded')
    for (const input of requests.slice(-2)) {
      assert.equal(input.brandId, 'brand', 'initial and retried delivery must retain the job brand')
      assert.equal(input.tiktokIsAigc, enabled)
      assert.equal(input.firstComment, 'Preserved')
      assert.equal(input.mediaItems[0].storageKey, 'video/already-uploaded')
    }
  }
}
console.log('PASS AIGC queue snapshots and retry delivery for immediate/scheduled, on/off/legacy settings')
