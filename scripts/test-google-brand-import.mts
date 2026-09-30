import assert from 'node:assert/strict'
import { googleId, GoogleImportError, listOwnedGoogleLocations, readGoogleBrandData, normalizeGoogleMenu, mergeGoogleMenu, summarizeGoogleReviews } from '../src/lib/integrations/googleBrandData.ts'
const at = new Date().toISOString()
const menu = { menus: [{ sections: [{ items: [{ labels: [{ displayName: '烤骨头', description: '商家菜单描述' }], attributes: { price: { currencyCode: 'SGD', units: '12', nanos: 500000000 } } }] }] }] }
const normalized = normalizeGoogleMenu(menu, 'accounts/a/locations/l', at)
assert.equal(normalized[0].name, '烤骨头'); assert.equal(normalized[0].price, 'SGD 12.50')
assert.deepEqual(normalizeGoogleMenu({ reviews: [{ comment: 'lobster' }] }, 'l', at), [])
assert.equal(mergeGoogleMenu([{ id: 'human', name: '烤骨头', description: '人工编辑' }], normalized).added, 0)
assert.equal(mergeGoogleMenu(normalized, normalized).items.length, 1)
assert.equal(normalizeGoogleMenu(menu, 'another-location', at)[0].id === normalized[0].id, false)
const summary = summarizeGoogleReviews({ reviews: [{ comment: '烤骨头好吃 but service slow', starRating: 'TWO' }, { comment: 'Too expensive', starRating: 'THREE' }], totalReviewCount: 42, nextPageToken: 'more' }, normalized)
assert.equal(summary.sampleSize, 2); assert.equal(summary.totalReviewCount, 42); assert.equal(summary.productMentions[0].mentions, 1); assert.equal(summary.distribution[1], 1); assert.equal(summary.truncated, true)
assert.throws(() => googleId('../evil?key=secret', 'locations'), GoogleImportError)
const calls: string[] = []
const fake = (async (url: any) => { const u = String(url); calls.push(u); let data: any
 if (u.includes('accountmanagement')) data = { accounts: [{ name: 'accounts/a' }, { name: 'accounts/b' }] }
 else if (u.includes('/accounts/a/locations?')) data = { locations: [{ name: 'locations/one', title: 'Store 1' }] }
 else if (u.includes('/accounts/b/locations?')) data = { locations: [{ name: 'locations/two', title: 'Store 2' }] }
 else if (u.includes('businessinformation')) data = { name: 'locations/l', title: 'My brand', phoneNumbers: { primaryPhone: '123' } }
 else if (u.includes('foodMenus')) data = menu
 else if (u.includes('locationState')) data = { locationState: { canHaveFoodMenu: true } }
 else if (u.includes('/reviews?')) data = { reviews: [{ starRating: 'FIVE', comment: '烤骨头好吃' }] }
 else throw new Error('unexpected request')
 return new Response(JSON.stringify(data), { status: 200 })
}) as typeof fetch
const locations = await listOwnedGoogleLocations('token', fake)
assert.equal(locations.length, 2); assert.equal(locations[1].accountId, 'b')
const data = await readGoogleBrandData('token', 'a', 'l', fake)
assert.equal(data.menu.length, 1); assert.equal(data.profile.phone, '123'); assert.equal(data.missing.length, 0)
assert.ok(calls.every(u => !u.includes('searchText') && !u.includes('findplace') && !u.includes('query=')))
await assert.rejects(readGoogleBrandData('secret', 'a', 'l', (async () => new Response('secret-provider-error', { status: 403 })) as typeof fetch), e => e instanceof GoogleImportError && e.code === 'GOOGLE_HTTP_403' && !e.message.includes('secret'))
console.log('PASS: bound identity, multi-account enumeration, menu provenance/dedup, review evidence, provider failures, no fuzzy search')
