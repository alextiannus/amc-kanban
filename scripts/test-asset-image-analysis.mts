import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as policy from '../src/lib/asset-analysis/policy.ts'

const clone = (value: any) => structuredClone(value)
let rows: Record<string, any[]> = { brand: [{ id: 'brand', industry: 'Fitness', name: 'Studio', description: 'Reformer studio' }], mediaAsset: [], brandFolder: [], assetAnalysisBatch: [], assetAnalysisItem: [] }
let ids = 0, time = Date.now(), txLock = Promise.resolve(), enabled = true
const stamp = () => new Date(++time)
const matches = (row: any, where: any = {}): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
  if (key === 'OR') return value.some((v: any) => matches(row, v))
  if (key === 'NOT') return !matches(row, value)
  if (key === 'brandId_batchKey' || key === 'brandId_name') return matches(row, value)
  if (key === 'analysisItems') { const list = rows.assetAnalysisItem.filter(i => i.assetId === row.id); return value.none ? !list.some(i => matches(i, value.none)) : list.some(i => matches(i, value.some)) }
  if (value instanceof Date) return +row[key] === +value
  if (value && typeof value === 'object') {
    if ('in' in value) return value.in.includes(row[key])
    if ('notIn' in value) return !value.notIn.includes(row[key])
    if ('lt' in value) return row[key] && row[key] < value.lt
    if ('startsWith' in value) return row[key].startsWith(value.startsWith)
  }
  return row[key] === value
})
const db: any = {
  $queryRaw: async () => [],
  $transaction: (fn: any) => {
    const result = txLock.then(async () => { const old = clone(rows); try { return await fn(db) } catch (e) { rows = old; throw e } })
    txLock = result.catch(() => {}); return result
  },
}
for (const table of Object.keys(rows)) {
  const attach = (row: any, include: any) => {
    if (!row) return row
    row = clone(row)
    if (include?.asset) row.asset = clone(rows.mediaAsset.find(a => a.id === row.assetId))
    if (include?.items) row.items = rows.assetAnalysisItem.filter(i => i.batchId === row.id).map(i => attach(i, include.items.include))
    return row
  }
  const find = (args: any = {}) => { let list = rows[table].filter(r => matches(r, args.where)); if (args.orderBy) { const [field, dir] = Object.entries(args.orderBy)[0]; list = [...list].sort((a, b) => (a[field] > b[field] ? 1 : -1) * (dir === 'desc' ? -1 : 1)) } return list.slice(0, args.take).map(r => attach(r, args.include)) }
  const update = (row: any, data: any) => { for (const [key, val] of Object.entries(data) as any) row[key] = val && typeof val === 'object' && 'increment' in val ? (row[key] || 0) + val.increment : clone(val); row.updatedAt = stamp(); return clone(row) }
  db[table] = {
    findMany: async (args: any) => find(args), findFirst: async (args: any) => find(args)[0] || null, findUnique: async (args: any) => find(args)[0] || null,
    findUniqueOrThrow: async (args: any) => { const r = find(args)[0]; if (!r) throw new Error('Not found'); return r },
    count: async (args: any) => find(args).length,
    create: async ({ data }: any) => { const r = { id: `id-${++ids}`, status: 'QUEUED', attempt: 0, leaseUntil: null, summaryJobId: null, summaryRequest: null, gatewayJobId: null, gatewayRequest: null, result: null, createdAt: stamp(), updatedAt: stamp(), ...clone(data) }; rows[table].push(r); return clone(r) },
    createMany: async ({ data, skipDuplicates }: any) => { for (const d of data) { if (skipDuplicates && table === 'brandFolder' && rows[table].some(r => r.brandId === d.brandId && r.name === d.name)) continue; await db[table].create({ data: d }) } return { count: data.length } },
    delete: async ({ where }: any) => { const index = rows[table].findIndex(r => matches(r, where)); if (index < 0) throw Error('Not found'); return rows[table].splice(index, 1)[0] },
    groupBy: async ({ where }: any) => { const counts = new Map<string, number>(); for (const row of find({ where })) counts.set(row.aiCategory, (counts.get(row.aiCategory) || 0) + 1); return [...counts].map(([aiCategory, count]) => ({ aiCategory, _count: { _all: count } })) },
    update: async ({ where, data }: any) => { const row = rows[table].find(r => matches(r, where)); if (!row) throw new Error('Not found'); return update(row, data) },
    updateMany: async ({ where, data }: any) => { const list = rows[table].filter(r => matches(r, where)); list.forEach(r => update(r, data)); return { count: list.length } },
    upsert: async ({ where, create, update: changes }: any) => { const row = rows[table].find(r => matches(r, where)); return row ? update(row, changes) : db[table].create({ data: create }) },
  }
}
const submitted: any[] = []
const jobs = new Map<string, any>()
let failAsset: string | undefined
const gateway = async (_config: any, path: string, request?: any) => {
  if (!request) return clone(jobs.get(path.split('/').pop()!))
  let job = jobs.get(request.idempotencyKey)
  if (!job) {
    submitted.push(clone(request))
    job = { id: request.idempotencyKey, status: failAsset && request.mediaInputs?.[0]?.id === failAsset ? 'provider_unknown' : 'succeeded', resolvedModel: policy.ANALYSIS_MODEL,
      result: { analysis: request.taskType === 'asset_image_analysis' ? { contentType: 'Training', caption: 'A reformer exercise', tags: ['reformer', 'exercise', 'studio'], needsReview: false } : { groups: [{ name: 'Training', folderId: null, reason: 'Exercise scenes', types: ['Training'] }] } } }
    jobs.set(job.id, job)
  }
  return clone(job)
}
function load(file: string, dependencies: Record<string, any>) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(source, { exports, require: (id: string) => { if (!(id in dependencies)) throw Error(`Unexpected dependency ${id}`); return dependencies[id] }, console, Date, Set, Map, URL, Error })
  return exports as any
}
const service = load('../src/lib/asset-analysis/service.ts', {
  'node:crypto': { randomUUID: () => `uuid-${++ids}` }, '@prisma/client': { Prisma: { DbNull: null } },
  '@/lib/asset-analysis/db': { prisma: db }, '@/lib/systemConfig': { getAssetAnalysisConfig: async () => enabled ? { baseUrl: 'https://content', token: 'test' } : null },
  '@/lib/integrations/huaweiObs': { getHuaweiObsConfig: () => null }, './content': { analysisContent: gateway }, './folders': { ensureAssetFolders: async () => {} }, './policy': policy,
})
const addImage = (id: string) => rows.mediaAsset.push({ id, brandId: 'brand', mimeType: 'image/jpeg', url: `https://images.example/${id}.jpg`, aiCategory: '素材库', aiCaption: null, aiTags: ['排期发布', 'manual'], aiReady: false, imageAnalysis: null, updatedAt: stamp() })
addImage('one'); addImage('two')
rows.mediaAsset.push({ id: 'foreign', brandId: 'other', mimeType: 'image/jpeg', aiCategory: '素材库', updatedAt: stamp() })

const batch = await service.createAnalysisBatch({ brandId: 'brand', assetIds: ['one', 'two', 'foreign'], batchKey: 'same' })
assert.equal(rows.assetAnalysisItem.length, 2, 'foreign image excluded')
assert.equal((await service.createAnalysisBatch({ brandId: 'brand', assetIds: ['one'], batchKey: 'same' })).id, batch.id)
failAsset = 'two'
await service.processAnalysisQueue()
assert.equal(rows.assetAnalysisBatch[0].status, 'READY')
assert.equal(rows.assetAnalysisItem.find(i => i.assetId === 'two').status, 'FAILED')
assert.equal(rows.mediaAsset[0].aiCategory, '素材库', 'analysis never moves images')
assert.equal(rows.mediaAsset[0].aiReady, false, 'analysis never marks publishing ready')
assert.ok(rows.mediaAsset[0].aiTags.includes('manual') && rows.mediaAsset[0].aiTags.includes('排期发布'))
assert.ok(submitted[0].prompt.includes('Fitness'))
assert.ok(submitted.every(r => r.modelName === policy.ANALYSIS_MODEL))
failAsset = undefined
await service.retryAnalysisBatch('brand', batch.id)
await service.processAnalysisQueue()
assert.equal(submitted.filter(r => r.mediaInputs?.[0]?.id === 'one').length, 1, 'successful image not billed again')
const assignments = rows.assetAnalysisItem.map(i => ({ itemId: i.id, newFolderName: 'Training' }))
await assert.rejects(service.applyAnalysisBatch('other', batch.id, assignments), /not found/)
rows.mediaAsset[1].aiCategory = 'Manual move'
await assert.rejects(service.applyAnalysisBatch('brand', batch.id, assignments), /moved/)
assert.equal(rows.brandFolder.length, 0, 'failed apply rolls back folder creation')
assert.equal(rows.mediaAsset[0].aiCategory, '素材库')
rows.mediaAsset[1].aiCategory = '素材库'
await service.applyAnalysisBatch('brand', batch.id, assignments)
await service.applyAnalysisBatch('brand', batch.id, assignments)
assert.equal(rows.brandFolder.length, 1)
assert.equal(rows.mediaAsset[0].aiCategory, 'Training')

addImage('manual-during-analysis')
const manualBatch = await service.createAnalysisBatch({ brandId: 'brand', assetIds: ['manual-during-analysis'] })
const manual = rows.mediaAsset.find(a => a.id === 'manual-during-analysis')
manual.aiCaption = 'User description'; manual.aiTags = ['User tag']; manual.updatedAt = stamp()
await service.processAnalysisQueue()
assert.equal(rows.mediaAsset.find(a => a.id === manual.id).aiCaption, 'User description')
assert.deepEqual(rows.mediaAsset.find(a => a.id === manual.id).aiTags, ['User tag'])

enabled = false
assert.equal(await service.createAnalysisBatch({ brandId: 'brand', upload: true, assetIds: ['one'] }), null)
await assert.rejects(service.createAnalysisBatch({ brandId: 'brand', assetIds: ['one'] }), /disabled/)
assert.throws(() => policy.folderName('视频原片'), /reserved/)
assert.throws(() => policy.folderName('../bad'), /Invalid/)
assert.throws(() => policy.parseImageAnalysis({ tags: ['only'] }), /Invalid/)
assert.deepEqual(policy.mergeAnalysisTags(['manual', 'old-ai'], ['old-ai'], ['new-ai']), ['manual', 'new-ai'])

rows.brand[0].assetFoldersInitialized = false
const folderService = load('../src/lib/asset-analysis/folders.ts', { '@/lib/asset-analysis/db': { prisma: db }, './policy': policy })
const foldersApi = load('../src/app/api/brands/[id]/folders/route.ts', {
  'next/server': { NextResponse: { json: (body: any, options: any) => ({ body, status: options?.status || 200 }) } },
  '@/lib/auth': { getSession: async () => ({ user: { id: 'owner', type: 'HUMAN', role: 'USER' } }), extractApiKey: () => null },
  '@/lib/asset-analysis/db': { prisma: db }, '@/lib/brandAccess': { canSessionAccessBrandProject: async (brandId: string) => brandId === 'brand' },
  '@/lib/asset-analysis/folders': folderService, '@/lib/asset-analysis/policy': policy,
})
const context = { params: Promise.resolve({ id: 'brand' }) }
const response = await foldersApi.GET(new Request('https://test/folders'), context)
assert.equal(response.status, 200)
const product = rows.brandFolder.find(f => f.name === '产品')!
rows.mediaAsset[0].aiCategory = '产品'
assert.equal((await foldersApi.PATCH(new Request('https://test/folders', { method: 'PATCH', body: JSON.stringify({ folderId: product.id, name: 'Portfolio' }) }), context)).status, 200)
assert.equal(rows.mediaAsset[0].aiCategory, 'Portfolio')
assert.equal((await foldersApi.DELETE(new Request(`https://test/folders?folderId=${product.id}`, { method: 'DELETE' }), context)).status, 200)
assert.equal(rows.mediaAsset[0].aiCategory, '素材库')
await foldersApi.GET(new Request('https://test/folders'), context)
assert.ok(!rows.brandFolder.some(f => ['产品', 'Portfolio'].includes(f.name)), 'deleted default folders stay deleted')
const videoFolder = rows.brandFolder.find(f => f.name === '视频原片')!
assert.notEqual((await foldersApi.DELETE(new Request(`https://test/folders?folderId=${videoFolder.id}`, { method: 'DELETE' }), context)).status, 200)
assert.ok(rows.brandFolder.some(f => f.id === videoFolder.id))
assert.equal((await foldersApi.GET(new Request('https://test/folders'), { params: Promise.resolve({ id: 'other' }) })).status, 404)
console.log('PASS: brand isolation, durable enqueue, idempotence, industry/model routing, partial retry, reviewed atomic filing, manual edits and validation')
console.log('PASS: folder rename, atomic delete-to-root, system folder protection, no default-folder resurrection')
