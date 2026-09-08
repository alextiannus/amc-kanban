import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { calendarDraftQuery } from '../src/lib/calendarDraftQuery.ts'

const start = '2026-01-31T16:00:00.000Z'
const end = '2026-02-28T16:00:00.000Z'
const query = `?calendarStart=${start}&calendarEnd=${end}`
const rows = Array.from({ length: 553 }, (_, index) => ({
  id: `draft-${index}`, brandId: 'brand-a', status: 'published', caption: 'post',
  // The eleven historical posts are beyond the default first 100.
  publishedAt: new Date(index >= 122 && index < 133 ? '2026-02-02T04:09:00Z' : '2026-09-01T00:00:00Z'),
  scheduledAt: null, createdAt: new Date('2026-09-07'), updatedAt: new Date('2026-09-07'),
}))
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return value.every((item: any) => matches(row, item))
    if (key === 'OR') return value.some((item: any) => matches(row, item))
    if (value && typeof value === 'object' && 'gte' in value) return row[key] != null && row[key] >= value.gte && row[key] < value.lt
    return row[key] === value
  })
}
let user: any = null
let allowed = false
let reads = 0
const deps: Record<string, any> = {
  'next/server': { NextResponse: { json: (data: any, init: any) => Response.json(data, init) } },
  '@/lib/auth': { getSession: async () => user ? { user } : null, extractApiKey: () => null },
  '@/lib/brandAccess': { canSessionAccessBrandProject: async () => allowed },
  '@/lib/calendarDraftQuery': { calendarDraftQuery },
  '@/lib/prisma': { prisma: {
    $transaction: (queries: any[]) => Promise.all(queries),
    contentDraft: {
      findMany: async (args: any) => {
        reads++
        return rows.filter(row => matches(row, args.where)).slice(args.skip ?? 0, (args.skip ?? 0) + args.take)
      },
      groupBy: async ({ where }: any) => [{ status: 'published', _count: { _all: rows.filter(row => matches(row, where)).length } }],
    },
  } },
  '@/lib/integrations/huaweiObs': {}, '@/lib/compliance': {}, '@/lib/audit': {},
  '@/lib/events': {}, '@/lib/integrations/postfast': {},
}
const source = readFileSync(new URL('../src/app/api/brands/[id]/drafts/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} as any }
new Function('require', 'module', 'exports', compiled)((name: string) => { assert(deps[name], name); return deps[name] }, mod, mod.exports)
const request = (suffix = '') => mod.exports.GET(new Request(`http://localhost/api/brands/brand-a/drafts${suffix}`), { params: Promise.resolve({ id: 'brand-a' }) })
const read = async (suffix = '') => { const res = await request(suffix); assert.equal(res.status, 200); return res.json() }
assert.equal((await request(query)).status, 404)
user = { id: 'owner', role: 'USER' }
assert.equal((await request(query)).status, 404)
assert.equal(reads, 0)
allowed = true
const legacy = await read()
assert.equal(legacy.drafts.length, 100)
assert.equal(legacy.pagination, undefined)
const historical = await read(query)
assert.equal(historical.drafts.length, 11)
assert.equal(historical.counts.all, 11)
assert.equal(historical.pagination.hasMore, false)
// Cross-brand rows never enter the month, and publishedAt wins over scheduledAt.
rows.push({ ...rows[122], id: 'other', brandId: 'brand-b' })
rows.push({ ...rows[0], id: 'different-published-month', scheduledAt: new Date(start) } as any)
rows.push({ ...rows[122], id: 'start', publishedAt: new Date(start) })
rows.push({ ...rows[122], id: 'end', publishedAt: new Date(end) })
assert.equal((await read(query)).drafts.length, 12)
for (let i = 0; i < 205; i++) rows.push({ ...rows[122], id: `extra-${i}` })
const first = await read(query)
const second = await read(`${query}&page=2`)
const third = await read(`${query}&page=3`)
assert.deepEqual([first.drafts.length, second.drafts.length, third.drafts.length], [100, 100, 17])
assert.equal(new Set([...first.drafts, ...second.drafts, ...third.drafts].map(d => d.id)).size, 217)
assert.equal(third.pagination.hasMore, false)
assert.equal(first.pagination.total, 217)
for (const bad of ['?calendarStart=bad', `${query}&page=0`, `${query}&page=1.5`, '?calendarStart=2026-01-01&calendarEnd=2026-09-01']) {
  assert.equal((await request(bad)).status, 400)
}
const where = calendarDraftQuery(new URLSearchParams(query.slice(1)))!.where
assert(matches({ ...rows[0], publishedAt: null, scheduledAt: new Date(start) }, where))
assert(matches({ ...rows[0], publishedAt: null, scheduledAt: null, createdAt: new Date(start) }, where))
console.log('PASS: real drafts GET history, pagination, date priority/boundaries, validation, access isolation, legacy compatibility')
