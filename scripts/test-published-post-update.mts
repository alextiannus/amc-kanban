import { resolveDraftAccount, draftPlatform } from '../src/lib/socialAccountPlaceholder.ts'
import { lockBrandSync } from '../src/lib/socialAccountLocks.ts'
import { SocialAccountBindingError } from '../src/lib/socialAccountIdentity.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as draftMarkers from '../src/lib/brand-plan/creativeDraftMarker.ts'
import * as shortVideoCarousel from '../src/lib/shortVideoCarousel.ts'

let allowed = true
let writes = 0
let platform = 'facebook'
let cancelSucceeds = true
let cancellations = 0
let resubmissions = 0
let beforeTransaction: (() => void) | undefined
let linkedClips: Array<{ id: string; url: string; mimeType: string; sizeBytes: number; technicalMetadata: unknown }> = []
const original = {
  id: 'post', brandId: 'brand', accountId: 'account', status: 'published',
  postUrl: 'https://example.com/original', platformPostId: 'provider-post',
  publishedAt: new Date('2026-04-09T08:16:27Z'),
  scheduledAt: new Date('2026-04-09T08:00:00Z'), gbpLocationId: null,
  updatedAt: new Date('2026-04-09T08:16:27Z'),
}
let record: any = { ...original }
const contentDraft = {
  findFirst: async () => record,
  findUnique: async () => record,
  findUniqueOrThrow: async () => record,
  update: async ({ data }: any) => {
    writes++
    record = { ...record, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) }
    return record
  },
}
const prisma = {
  $queryRaw: async () => [],
  brandKnowledge: { findUnique: async () => null },
  contentDraft,
  socialAccount: { findFirst: async () => ({ id: 'account', brandId: 'brand', handle: 'real-account', unboundAt: null, platformId: platform }) },
  contentAssetRef: { findMany: async () => linkedClips.map(asset => ({ assetId: asset.id })) },
  mediaAsset: { findMany: async () => linkedClips },
  brand: { findUnique: async () => ({ postfastApiKey: 'fixture', timezone: 'Asia/Singapore' }) },
  $transaction: async (task: any) => {
    beforeTransaction?.()
    beforeTransaction = undefined
    const saved = record
    try { return await task({ ...prisma, $queryRaw: async () => [{ locked: true }] }) }
    catch (error) { record = saved; throw error }
  },
}
;(globalThis as any).prisma = { ...prisma, $extends: () => prisma }
const deps: Record<string, any> = {
  '@/lib/shortVideoCarousel': shortVideoCarousel,
  '@/lib/shortVideoDraft': await import('../src/lib/shortVideoDraft.ts'),
  '@/lib/asset-library/covers': {},
  '@/lib/socialAccountPlaceholder': { resolveDraftAccount, draftPlatform },
  '@/lib/socialAccountLocks': { lockBrandSync },
  '@/lib/socialAccountIdentity': { SocialAccountBindingError },
  '@/lib/brand-plan/creativeDraftMarker': draftMarkers,
  'next/server': { NextResponse: { json: Response.json } },
  '@/lib/auth': { getSession: async () => ({ user: { id: 'owner', type: 'HUMAN' } }), extractApiKey: () => null },
  '@/lib/prisma': { prisma },
  '@/lib/brandAccess': { canSessionAccessBrandProject: async () => allowed },
  '@/lib/integrations/huaweiObs': { persistDraftSnapshotToObs: async () => {} },
  '@/lib/compliance': {}, '@/lib/audit': {}, '@/lib/events': {}, '@/lib/postfastDelivery': {},
  '@/lib/postfastPublishAccount': { checkPostfastPublishAccount: async () => { assert.equal(record.mediaMode, shortVideoCarousel.SHORT_VIDEO_CAROUSEL); return { success: true } } },
  '@/lib/integrations/postfast': { postfastDeletePost: async (_key: string, id: string) => {
    assert.equal(id, 'scheduled-post')
    cancellations++
    return { success: cancelSucceeds, error: 'HTTP 404' }
  } },
  '@/lib/draftSubmission': { submitDraftForDelivery: async () => {
    resubmissions++
    assert.equal(record.status, 'draft')
    assert.equal(record.platformPostId, null)
    record = { ...record, status: 'publishing' }
    return { ok: true, mode: 'queued', jobId: 'job', status: 'QUEUED', draft: record }
  } },
}
const source = readFileSync(new URL('../src/app/api/brands/[id]/drafts/[draftId]/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} as any }
new Function('require', 'module', 'exports', compiled)((name: string) => {
  assert(name in deps, `Unexpected dependency: ${name}`)
  return deps[name]
}, loaded, loaded.exports)
const params = { params: Promise.resolve({ id: 'brand', draftId: 'post' }) }
const patch = (body: unknown) => loaded.exports.PATCH(new Request('http://localhost/api/brands/brand/drafts/post', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), params)

allowed = false
assert.equal((await patch({ publishedAt: '2026-04-08T12:30:00+08:00' })).status, 404)
assert.equal(writes, 0)
allowed = true
for (const value of [null, '', 'invalid', 123, '2999-01-01T00:00:00Z']) {
  assert.equal((await patch({ publishedAt: value })).status, 400)
}
assert.equal(writes, 0)
for (const status of ['draft', 'scheduled', 'publishing']) {
  record = { ...original, status }
  assert.equal((await patch({ publishedAt: '2026-04-08T04:30:00Z' })).status, 400)
}
record = { ...original }
assert.equal((await patch({ publishedAt: '2026-04-08T12:30:00+08:00' })).status, 200)
assert.equal(record.publishedAt.toISOString(), '2026-04-08T04:30:00.000Z')
assert.equal(record.postUrl, original.postUrl)
assert.equal(record.scheduledAt, original.scheduledAt)
assert.equal(record.platformPostId, original.platformPostId)
assert.equal(record.status, 'published')
const readback = await (await loaded.exports.GET(new Request('http://localhost'), params)).json()
assert.equal(readback.draft.publishedAt, '2026-04-08T04:30:00.000Z')
record = { ...original }
assert.equal((await patch({ postUrl: 'https://example.com/changed' })).status, 200)
assert.equal(record.publishedAt, original.publishedAt, 'URL-only changes preserve timestamp seconds')
assert.equal((await patch({ postUrl: 'javascript:alert(1)' })).status, 400)
assert.equal((await patch({ postUrl: 'https://example.com/both', publishedAt: '2026-04-07T03:00:00Z' })).status, 200)
assert.equal(record.postUrl, 'https://example.com/both')
assert.equal(record.publishedAt.toISOString(), '2026-04-07T03:00:00.000Z')
assert.equal((await patch({ postUrl: null })).status, 200)
assert.equal(record.postUrl, null)
assert.equal(record.publishedAt.toISOString(), '2026-04-07T03:00:00.000Z')
console.log('PASS published post updates: authorization, validation, date-only, URL-only, combined edits, clearing URL, persistence and readback without publishing')

platform = 'instagram'
const mode = shortVideoCarousel.SHORT_VIDEO_CAROUSEL
const mediaUrls = ['https://cdn.example.test/c.mp4', 'https://cdn.example.test/a.mp4', 'https://cdn.example.test/b.mp4']
record = { ...original, status: 'draft', postUrl: null, platformPostId: null, publishedAt: null, scheduledAt: null, mediaUrls: [] }
assert.equal((await patch({ mediaMode: mode, mediaUrls })).status, 200)
assert.equal(record.instagramPublishType, 'TIMELINE')
assert.equal(record.mediaMode, mode)
const reordered = [...mediaUrls].reverse()
assert.equal((await patch({ mediaUrls: reordered })).status, 200)
const shortReadback = await (await loaded.exports.GET(new Request('http://localhost'), params)).json()
assert.deepEqual(shortReadback.draft.mediaUrls, reordered)
assert.equal(shortReadback.draft.mediaMode, mode)
const beforeInvalid = writes
assert.equal((await patch({ instagramPublishType: 'REEL' })).status, 422)
assert.equal((await patch({ mediaUrls: ['https://cdn.example.test/photo.jpg'] })).status, 422)
assert.equal(writes, beforeInvalid)
assert.equal((await patch({ mediaMode: null })).status, 200)
assert.equal(record.mediaMode, null)
assert.equal(record.instagramPublishType, null)
assert.deepEqual(record.mediaUrls, reordered)
console.log('PASS short video draft PATCH and GET: activation, order, mode retention, rejection, and explicit exit')

linkedClips = mediaUrls.map((url, index) => ({
  id: `clip-${index}`, url, mimeType: 'video/mp4', sizeBytes: 1000,
  technicalMetadata: { kind: 'video', mimeType: 'video/mp4', sizeBytes: 1000, durationSeconds: 4 },
}))
record = { ...record, mediaMode: mode, mediaUrls, status: 'scheduled', scheduledAt: new Date(Date.now() + 600_000), platformPostId: 'scheduled-post' }
const beforeScheduledEdit = record
beforeTransaction = () => { record = { ...record, updatedAt: new Date(record.updatedAt.getTime() + 1000) } }
assert.equal((await patch({ mediaUrls: reordered })).status, 409)
assert.equal(cancellations, 0, 'a concurrent edit must not cancel the existing post')
cancelSucceeds = false
assert.equal((await patch({ mediaUrls: reordered })).status, 409)
assert.equal(record.platformPostId, beforeScheduledEdit.platformPostId)
assert.deepEqual(record.mediaUrls, mediaUrls)
assert.equal(resubmissions, 0, 'an unconfirmed cancellation must not create a replacement')
cancelSucceeds = true
const replaced = await patch({ mediaUrls: reordered })
assert.equal(replaced.status, 202)
assert.equal((await replaced.json()).jobId, 'job')
assert.deepEqual(record.mediaUrls, reordered)
assert.equal(resubmissions, 1, 'reorder alone queues the existing schedule exactly once')
console.log('PASS scheduled short video edits: stale write, cancelled-result rollback, and reorder-only requeue')
