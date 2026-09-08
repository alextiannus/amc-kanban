import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Run the real GET handler with deterministic rows; no live database writes.
const rows = Array.from({ length: 245 }, (_, index) => ({
  id: `asset-${String(245 - index).padStart(3, '0')}`, brandId: 'brand-a',
  createdAt: new Date('2026-09-08'), filename: `Photo ${index + 1}`,
  mimeType: index % 3 === 0 ? 'video/mp4' : index % 3 === 1 ? 'IMAGE/JPEG' : 'image/png',
  usedCount: index < 210 ? 1 : 0, aiCategory: index < 210 ? '产品' : '封面图',
  url: `key-${index}`, sourceType: 'postfast',
}))
rows.push({ ...rows[0], id: 'other-brand', brandId: 'brand-b' })
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return value.every((item: any) => matches(row, item))
    if (key === 'OR') return value.some((item: any) => matches(row, item))
    if (typeof value === 'object' && value !== null) {
      if ('contains' in value) return String(row[key] ?? '').toLowerCase().includes(value.contains.toLowerCase())
      if ('equals' in value) return String(row[key]).toLowerCase() === value.equals.toLowerCase()
      return false
    }
    return row[key] === value
  })
}
let user: any = null
let allowed = false
let queries = 0
let counts = 0
let lastWhere: any
const deps: Record<string, any> = {
  'next/server': { NextResponse: { json: (data: any, init: any) => Response.json(data, init) } },
  '@/lib/auth': { getSession: async () => user ? { user } : null, extractApiKey: () => null },
  '@/lib/brandAccess': { canSessionAccessBrandProject: async () => allowed },
  '@/lib/prisma': { prisma: {
    mediaAsset: {
      findMany: async (args: any) => {
        queries++; lastWhere = args.where
        assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }])
        return rows.filter(row => matches(row, args.where)).sort((a, b) => b.id.localeCompare(a.id)).slice(args.skip ?? 0, (args.skip ?? 0) + args.take)
      },
      count: async ({ where }: any) => { counts++; assert.deepEqual(where, lastWhere); return rows.filter(row => matches(row, where)).length },
    },
    brandFolder: { findMany: async ({ where }: any) => { assert.equal(where.brandId, 'brand-a'); return [{ name: '封面图' }] } },
  } },
  '@/lib/integrations/postfast': {}, '@/lib/integrations/huaweiObs': {},
  '@/lib/mediaValidation': {}, '@/lib/brand-plan/calendarSync': {}, 'fs/promises': {}, path: {},
}
const source = readFileSync(new URL('../src/app/api/brands/[id]/assets/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} as any }
new Function('require', 'module', 'exports', compiled)((name: string) => { assert(deps[name], name); return deps[name] }, mod, mod.exports)
const request = (query = '') => mod.exports.GET(new Request(`http://localhost/api/brands/brand-a/assets${query}`), { params: Promise.resolve({ id: 'brand-a' }) })
const read = async (query = '') => { const response = await request(query); assert.equal(response.status, 200); return response.json() }

assert.equal((await request('?page=1')).status, 401)
user = { id: 'operator', role: 'USER' }
assert.equal((await request('?page=1')).status, 404)
assert.equal(queries, 0)
allowed = true
const legacy = await read()
assert.equal(legacy.assets.length, 200)
assert.equal(legacy.pagination, undefined)
assert.equal(counts, 0)
const first = await read('?page=1&pageSize=12')
assert.deepEqual(first.pagination, { page: 1, pageSize: 12, total: 245, totalPages: 21 })
const second = await read('?page=2&pageSize=12')
assert.equal(second.assets.length, 12)
assert(!first.assets.some((row: any) => second.assets.some((other: any) => other.id === row.id)))
const last = await read('?page=21&pageSize=12')
assert.equal(last.assets.length, 5)
assert.equal(last.assets.at(-1).id, 'asset-001')
assert.equal(last.assets.at(-1).url, '/api/integrations/postfast/file/brand-a/key-244')
const unused = await read('?page=1&usage=unused')
assert.equal(unused.pagination.total, 35)
assert(unused.assets.every((row: any) => row.usedCount === 0))
const cover = await read('?page=1&mediaType=cover&folder=' + encodeURIComponent('封面图'))
assert.equal(cover.pagination.total, 23)
assert(cover.assets.every((row: any) => row.mimeType.toLowerCase().startsWith('image/') && row.aiCategory === '封面图'))
const searchedCover = await read('?page=1&mediaType=cover&q=Photo%20245')
assert.equal(searchedCover.pagination.total, 1)
assert.equal(searchedCover.assets[0].filename, 'Photo 245')
const empty = await read('?page=1&q=missing')
assert.equal(empty.pagination.total, 0)
assert.deepEqual(empty.assets, [])
assert.equal((await read('?page=99')).assets.length, 0)
for (const query of ['?page=0', '?page=-1', '?page=1.5', '?page=NaN', '?page=', '?page=1000001', '?pageSize=0', '?pageSize=101', '?usage=bad', '?mediaType=video']) {
  assert.equal((await request(query)).status, 400, query)
}
console.log('PASS draft asset pagination: authorization, brand isolation, legacy compatibility, stable pages, >200 assets, unused/cover/search filters, totals, URL mapping, empty/invalid pages')
