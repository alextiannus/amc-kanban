import assert from 'node:assert/strict'
import { canonicalFolderForAnalysis, generatedClassificationTags, templateForIndustry } from '../src/lib/asset-library/templates.ts'
const restaurant = templateForIndustry('F&B Restaurant')
assert.equal(restaurant.key, 'restaurant-v1')
assert.equal(new Set(restaurant.folders.map(folder => folder.key)).size, restaurant.folders.length)
assert.equal(canonicalFolderForAnalysis(restaurant, { needsReview: false, subjects: [{ type: 'dish', name: '锅包肉', confidence: .97 }], contentType: '东北菜', tags: ['热菜'], captureType: 'close_up', quality: { overall: .9 }, textDetection: { items: [], hasRiskText: false } }), 'dishes_drinks')
assert.equal(canonicalFolderForAnalysis(restaurant, { subjects: [{ type: 'dish', name: '锅包肉', confidence: .97 }] }, 'video/mp4'), 'original_video')
assert.deepEqual(generatedClassificationTags({ subjects: [{ type: 'dish', name: '锅包肉', confidence: .97 }], captureType: 'close_up', textDetection: { items: [{ type: 'price' }], hasRiskText: true } }), ['dish:锅包肉', 'capture:close_up', 'ocr:price'])
console.log('PASS asset library templates: stable industry folders, deterministic mapping and tags')
