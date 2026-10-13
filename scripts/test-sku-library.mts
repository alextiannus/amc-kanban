import assert from 'node:assert/strict'
import {
  buildSkuLibraryResponse,
  normalizeSkuLibrary,
  serializeSkuLibraryItem,
  serializeSkuLibrary,
  skuBadges,
  skuContextLines,
  skuLibraryForLLM,
  skuPriorityScore,
  sortSkuLibrary,
  validateSkuLibrary,
} from '../src/lib/sku-library/service.ts'
import { skuFacts } from '../src/lib/ai-native/facts.ts'

const normalized = normalizeSkuLibrary([
  { id: 'sku-shared', name: '剁椒鱼头', price: '28.8', description: '鱼肉鲜嫩，剁椒鲜香带辣' },
  { id: 'sku-shared', name: '野山椒牛肉丝', price: '19.80', description: '酸辣开胃，牛肉丝鲜嫩' },
])

assert.equal(normalized.length, 2)
assert.notEqual(normalized[0].id, normalized[1].id, '重复 SKU id 必须在渲染前消除')
assert.deepEqual(normalized.map(item => item.name), ['剁椒鱼头', '野山椒牛肉丝'])
assert.deepEqual(normalized.map(item => item.description), ['鱼肉鲜嫩，剁椒鲜香带辣', '酸辣开胃，牛肉丝鲜嫩'])

const serialized = serializeSkuLibrary(normalized)
assert.deepEqual(serialized.map(item => item.name), ['剁椒鱼头', '野山椒牛肉丝'])
assert.deepEqual(serialized.map(item => item.price), ['28.8', '19.80'])

const mixedNameIssues = validateSkuLibrary([{
  name: '剁椒鱼头 S$28.8 鱼肉鲜嫩；野山椒牛肉丝 S$19.80 酸辣开胃',
  price: '24.00',
}])
assert(mixedNameIssues.some(issue => issue.field === 'name' && issue.code === 'multiple_products'))

const validIssues = validateSkuLibrary([{
  name: '烟笋炒腊肉',
  price: '24.00',
  serves: '2-4',
  description: '烟笋和腊肉的湖南风味组合，适合朋友聚餐。',
}])
assert.deepEqual(validIssues, [])

assert.equal(normalizeSkuLibrary([{ name: 'Legacy SKU' }])[0].isNew, false)
assert.equal(normalizeSkuLibrary(['Legacy text SKU'])[0].isNew, false)
assert.equal(normalizeSkuLibrary([{ name: 'Tagged SKU', tags: ['新品'] }])[0].isNew, true)
assert.equal(serializeSkuLibraryItem({ name: 'Tagged SKU', tags: ['新品'] }).isNew, true)

for (const type of ['single', 'bundle', 'service'] as const) {
  const original = serializeSkuLibraryItem({
    id: `sku-new-${type}`, type, name: `${type} SKU`, price: '28.8', currency: 'S$',
    description: 'Original description', serves: '2-3', bundleItems: 'Side / Drink',
    imageUrl: 'https://example.test/sku.png', tags: ['custom'],
    isHotSeller: true, isHighRepeat: true, isMerchantPick: true, isSignature: true,
  })
  const saved = serializeSkuLibrary([{ ...original, isNew: true }])
  const readback = buildSkuLibraryResponse(JSON.parse(JSON.stringify(saved))).items[0]
  assert.equal(readback.isNew, true)
  assert.equal(readback.tags?.filter(tag => tag === '新品').length, 1)
  assert(skuBadges(readback).includes('新品'))
  assert.equal(skuPriorityScore(readback), skuPriorityScore(original))

  const llm = skuLibraryForLLM([readback])[0]
  assert.equal(llm.isNew, true)
  assert(llm.tags.includes('新品'))
  assert(!llm.priorityLabels.includes('新品'))
  assert(skuContextLines([readback])[0].includes('new product'))
  assert.equal(skuFacts([readback])[0].isNew, true)

  // Exercise both the editor serializer and the API normalization/serializer.
  const cleared = serializeSkuLibraryItem({ ...readback, isNew: false })
  const clearedReadback = buildSkuLibraryResponse(serializeSkuLibrary([cleared])).items[0]
  assert.deepEqual(clearedReadback, original, 'Removing new preserves all existing SKU facts and labels')
  assert(!skuBadges(clearedReadback).includes('新品'))
  assert(!skuLibraryForLLM([clearedReadback])[0].tags.includes('新品'))
  assert(!skuContextLines([clearedReadback])[0].includes('new product'))
  assert.equal(skuFacts([clearedReadback])[0].isNew, false)
}

const conflicting = { id: 'sku-false', name: 'Explicit false', isNew: false, tags: ['新品', 'custom'] }
for (const projection of [normalizeSkuLibrary([conflicting])[0], serializeSkuLibrary([conflicting])[0], skuFacts([conflicting])[0]]) {
  assert.equal(projection.isNew, false, 'Explicit false overrides stale new tag')
  assert.deepEqual(projection.tags, ['custom'])
}
assert.equal(skuFacts([{ name: 'Tag only', tags: ['新品'] }])[0].isNew, true)
assert.equal(skuFacts([{ name: 'Old fact' }])[0].isNew, false)

const before = normalizeSkuLibrary([
  { id: 'plain', name: 'Plain' }, { id: 'hot', name: 'Hot', isHotSeller: true },
  { id: 'tie', name: 'Tie' },
])
const after = before.map(item => ({ ...item, isNew: item.id !== 'hot' }))
assert.deepEqual(sortSkuLibrary(after).map(item => item.id), sortSkuLibrary(before).map(item => item.id))
assert.deepEqual(buildSkuLibraryResponse(after).summary, buildSkuLibraryResponse(before).summary)

console.log('SKU library contract checks passed')
