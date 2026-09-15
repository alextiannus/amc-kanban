import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { sanitizePostFastDraftControls } from '../src/lib/integrations/postfast.ts'

let allowed = true
let writes = 0
let stale = false
const original = {
  id: 'post', brandId: 'brand', accountId: 'account', status: 'draft',
  postUrl: 'https://example.com/original', platformPostId: null,
  publishedAt: null,
  scheduledAt: null, gbpLocationId: null, updatedAt: new Date(),
  postfastControls: { firstComment: 'Keep me', tiktokAutoAddMusic: true },
}
let record: any = { ...original }
const contentDraft = {
  findFirst: async () => record,
  findUniqueOrThrow: async () => record,
  update: async ({ data, where }: any) => {
    if (stale) throw Object.assign(new Error('Stale'), { code: 'P2025' })
    assert.equal(where.updatedAt, record.updatedAt)
    writes++
    record = { ...record, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) }
    return record
  },
}
const prisma = {
  contentDraft,
  socialAccount: { findFirst: async () => ({ platformId: 'tiktok' }) },
  $transaction: async (task: any) => task({ contentDraft }),
}
const deps: Record<string, any> = {
  'next/server': { NextResponse: { json: Response.json } },
  '@/lib/auth': { getSession: async () => ({ user: { id: 'owner', type: 'HUMAN' } }), extractApiKey: () => null },
  '@/lib/prisma': { prisma },
  '@/lib/brandAccess': { canSessionAccessBrandProject: async () => allowed },
  '@/lib/integrations/huaweiObs': { persistDraftSnapshotToObs: async () => {} },
  '@/lib/compliance': {}, '@/lib/audit': {}, '@/lib/events': {}, '@/lib/postfastDelivery': {},
  '@/lib/integrations/postfast': { sanitizePostFastDraftControls }, // Any provider call during metadata editing must fail this test.
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
assert.equal((await patch({ postfastControls: { tiktokIsAigc: true } })).status, 404)
assert.equal(writes, 0)
allowed = true
for (const value of ['true', 1, null]) {
  assert.equal((await patch({ postfastControls: { tiktokIsAigc: value } })).status, 400)
}
for (const value of [true, false]) {
  assert.equal((await patch({ postfastControls: { tiktokIsAigc: value } })).status, 200)
  const readback = await (await loaded.exports.GET(new Request('http://localhost'), params)).json()
  assert.deepEqual(readback.draft.postfastControls, { ...original.postfastControls, tiktokIsAigc: value })
}
for (const locked of [
  { status: 'publishing' }, { status: 'published' }, { status: 'done' },
  { status: 'scheduled', platformPostId: 'remote' }, { publishedAt: new Date() },
]) {
  for (const previous of [true, false]) {
    record = { ...original, ...locked, postfastControls: { tiktokIsAigc: previous } }
    assert.equal((await patch({ postfastControls: { tiktokIsAigc: !previous } })).status, 409)
    if (previous) assert.equal((await patch({ postfastControls: null })).status, 409)
  }
}
record = { ...original, status: 'scheduled', postfastControls: null }
assert.equal((await patch({ postfastControls: { tiktokIsAigc: true } })).status, 200, 'Local schedule has not reached PostFast')
record = { ...original }
stale = true
assert.equal((await patch({ postfastControls: { tiktokIsAigc: true } })).status, 409)
assert.deepEqual(record.postfastControls, original.postfastControls)
console.log('PASS TikTok AIGC draft authorization, validation, preservation, on/off readback, publication locks and stale writes')
