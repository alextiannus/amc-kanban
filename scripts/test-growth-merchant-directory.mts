import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { growthMerchantRecord, growthMerchantSelect, listGrowthMerchants, growthDirectoryAuthorized, publicAccountUrl } from '../src/lib/growthMerchantDirectory.ts'

const raw = { id: 'brand-1', name: '同名商家', location: 'Singapore', address: '1 Road', status: 'ACTIVE', googlePlaceId: 'google-1',
  accessToken: 'NEVER_RETURN', googleClientSecret: 'NEVER_RETURN',
  accounts: [{ id: 'ig', platformId: 'instagram', handle: 'official', profileUrl: 'https://instagram.com/official', accessToken: 'NEVER_RETURN' },
    { id: 'unbound', platformId: 'tiktok', handle: 'former', unboundAt: new Date() },
    { id: 'empty', platformId: 'instagram', handle: 'unconfigured' }],
}
const mapped = growthMerchantRecord(raw)
assert.equal(mapped.locations[0].google_place_id, 'google-1')
assert.equal(mapped.accounts.length, 1)
assert.equal(mapped.accounts[0].scope, 'brand')
assert(!JSON.stringify(mapped).includes('NEVER_RETURN'))
assert(!JSON.stringify(growthMerchantSelect).includes('Token'))
assert.equal(publicAccountUrl('instagram', 'https://instagram.com.attacker.example/official'), '')
assert.equal(publicAccountUrl('instagram', 'https://user:secret@instagram.com/official'), '')
assert.equal(publicAccountUrl('tiktok', 'javascript:alert(1)'), '')
const multiple = growthMerchantRecord({ ...raw, knowledge: { stores: [{ storeId: 'two', address: '2 Road' }, { storeId: 'one', address: '1 Road', isPrimary: true }] } })
assert.equal(multiple.locations[0].google_place_id, '', 'Do not assign primary Google ID to the first arbitrary branch')
assert.equal(multiple.locations[1].google_place_id, 'google-1')
let find: any
const db = { brand: { findMany: async (args: any) => { find = args; return [raw] }, count: async () => 61 } }
const page = await listGrowthMerchants(db, new URLSearchParams({ q: '同名', page: '2', limit: '100' }))
assert.equal(page.limit, 50); assert.equal(find.skip, 50); assert.equal(find.take, 50)
assert.equal(find.where.status.not, 'ARCHIVED'); assert.equal(find.where.OR[0].name.contains, '同名')
assert(!JSON.stringify(page).includes('NEVER_RETURN'))
assert.equal(page.items[0].location_count, 1)
await assert.rejects(listGrowthMerchants(db, new URLSearchParams({ page: '-1' })), /invalid_pagination/)
const token = process.env.CONTENT_SERVICE_INTERNAL_TOKEN
process.env.CONTENT_SERVICE_INTERNAL_TOKEN = 'fixture-secret'
assert(!growthDirectoryAuthorized(new Request('http://localhost')))
assert(!growthDirectoryAuthorized(new Request('http://localhost', { headers: { 'x-content-service-token': 'wrong' } })))
assert(growthDirectoryAuthorized(new Request('http://localhost', { headers: { 'x-content-service-token': 'fixture-secret' } })))
if (token == null) delete process.env.CONTENT_SERVICE_INTERNAL_TOKEN; else process.env.CONTENT_SERVICE_INTERNAL_TOKEN = token
for (const file of ['src/app/api/internal/growth/merchants/route.ts','src/app/api/internal/growth/merchants/[brandId]/route.ts']) {
  const source = await readFile(file, 'utf8'); assert(source.includes('growthDirectoryAuthorized(request)')); assert(!source.includes('export async function POST'))
}
console.log('Growth merchant directory: safe DTO, active bindings, branch identities, pagination, authentication and read-only routes passed.')
