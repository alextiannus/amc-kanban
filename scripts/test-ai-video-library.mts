import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const assets = new Map<string, any>()
const folders = new Set<string>()
let allowed = true
let invalidVideo = false
let inspections = 0
const prisma = {
  mediaAsset: {
    findUnique: async ({ where }: any) => assets.get(where.id),
    upsert: async ({ where, create }: any) => { if (!assets.has(where.id)) assets.set(where.id, create); return assets.get(where.id) },
  },
  brandFolder: { createMany: async ({ data }: any) => { for (const row of data) folders.add(`${row.brandId}:${row.name}`) } },
}
process.env.CONTENT_SERVICE_INTERNAL_TOKEN = 'fixture-token'
const mocks: Record<string, any> = {
  'next/server': { NextResponse: { json: Response.json } },
  '@/lib/brandAccess': { canSessionAccessBrandProject: async () => allowed },
  '@/lib/prisma': { prisma },
  '@/lib/integrations/huaweiObs': {
    getHuaweiObsPresignedPutUrl: ({ key }: any) => ({ uploadUrl: `https://storage.test/${encodeURI(key)}?put=1`, publicUrl: `https://storage.test/${encodeURI(key)}`, headers: { 'content-type': 'video/mp4' } }),
  },
  '@/lib/mediaValidation': {
    inspectMediaUrl: async (url: string) => { inspections++; assert(url.includes('/assets/AI%E8%A7%86%E9%A2%91/')); if (invalidVideo) throw new Error('Invalid media'); return { mimeType: 'video/mp4', sizeBytes: 1024, width: 720, height: 1280, durationSeconds: 15, videoCodec: 'h264', hasVideo: true } },
    assertUploadMedia: () => {},
    MediaValidationError: Error,
    mediaValidationResponse: (error: Error) => ({ error: error.message }),
    mediaValidationStatus: () => 422,
  },
}
const source = readFileSync(new URL('../src/app/api/internal/content-assets/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const module = { exports: {} as any }
vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Response, URL, process, console, Buffer })(
  (name: string) => mocks[name] || require(name), module, module.exports)
const common = { brandId: 'brand', actorId: 'operator', actorRole: 'AMC_PRINCIPAL', videoProjectId: 'project', mediaId: 'final-v1', filename: 'National Day.mp4' }
async function call(action: string, extra: any = {}, token = 'fixture-token') {
  return module.exports.POST(new Request('http://fixture/api/internal/content-assets', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-content-service-token': token }, body: JSON.stringify({ ...common, action, ...extra }) }))
}
assert.equal((await call('presignAiVideo', {}, 'wrong')).status, 401)
allowed = false
assert.equal((await call('presignAiVideo')).status, 404)
allowed = true
assert.equal((await call('presignAiVideo', { actorRole: 'RESEARCHER' })).status, 403)
assert.equal((await call('presignAiVideo', { mediaId: '' })).status, 400)
const slot = await (await call('presignAiVideo')).json()
assert(slot.uploadUrl.includes('/assets/AI%E8%A7%86%E9%A2%91/'))
assert.equal(slot.uploadUrl, (await (await call('presignAiVideo')).json()).uploadUrl)
invalidVideo = true
assert.equal((await call('confirmAiVideo')).status, 422)
assert.equal(assets.size, 0)
invalidVideo = false
const responses = await Promise.all([call('confirmAiVideo'), call('confirmAiVideo')])
for (const response of responses) assert.equal(response.status, 200, await response.clone().text())
const first = await responses[0].json()
assert.equal(first.assetId, (await responses[1].json()).assetId)
assert.equal(assets.size, 1)
const asset = assets.get(first.assetId)
assert.equal(asset.aiCategory, 'AI视频')
assert.equal(asset.videoProjectId, 'project')
assert.equal(asset.filename, 'National Day.mp4')
assert.equal(asset.technicalMetadata.durationSeconds, 15)
assert(folders.has('brand:AI视频'))
const beforeReplay = inspections
assert.equal((await (await call('presignAiVideo')).json()).assetId, first.assetId)
assert.equal((await (await call('confirmAiVideo')).json()).assetId, first.assetId)
assert.equal(inspections, beforeReplay)
const another = await (await call('presignAiVideo', { brandId: 'other' })).json()
assert.notEqual(slot.uploadUrl, another.uploadUrl)
console.log('PASS: AI video library authorization, brand scoping, deterministic copies, media validation, concurrent upsert, replay and folder metadata')
