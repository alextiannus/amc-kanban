import assert from 'node:assert/strict'
import {
  normalizeSkuLibrary,
  serializeSkuLibrary,
  validateSkuLibrary,
} from '../src/lib/sku-library/service.ts'

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

console.log('SKU library contract checks passed')
