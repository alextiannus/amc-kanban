import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

let allowed = true
let writes = 0
const original = {
  id: 'post', brandId: 'brand', accountId: 'account', status: 'published',
  postUrl: 'https://example.com/original', platformPostId: 'provider-post',
  publishedAt: new Date('2026-04-09T08:16:27Z'),
  scheduledAt: new Date('2026-04-09T08:00:00Z'), gbpLocationId: null,
}
let record: any = { ...original }
const contentDraft = {
  findFirst: async () => record,
  findUniqueOrThrow: async () => record,
  update: async ({ data }: any) => {
    writes++
    record = { ...record, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) }
    return record
  },
}
const prisma = {
  contentDraft,
  socialAccount: { findFirst: async () => ({ platformId: 'facebook' }) },
  $transaction: async (task: any) => task({ contentDraft }),
}
const deps: Record<string, any> = {
  'next/server': { NextResponse: { json: Response.json } },
  '@/lib/auth': { getSession: async () => ({ user: { id: 'owner', type: 'HUMAN' } }), extractApiKey: () => null },
  '@/lib/prisma': { prisma },
  '@/lib/brandAccess': { canSessionAccessBrandProject: async () => allowed },
  '@/lib/integrations/huaweiObs': { persistDraftSnapshotToObs: async () => {} },
  '@/lib/compliance': {}, '@/lib/audit': {}, '@/lib/events': {}, '@/lib/postfastDelivery': {},
  '@/lib/integrations/postfast': {}, // Any provider call during metadata editing must fail this test.
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
