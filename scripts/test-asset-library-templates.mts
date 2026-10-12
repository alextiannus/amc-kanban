import assert from 'node:assert/strict'
import {
  canonicalFolderForAnalysis,
  generatedClassificationTags,
  templateForIndustry,
} from '../src/lib/asset-library/templates.ts'

const restaurant = templateForIndustry('F&B Restaurant')
assert.equal(restaurant.key, 'restaurant-v1')
assert.equal(restaurant.folders.length, 10)
assert.equal(new Set(restaurant.folders.map(folder => folder.key)).size, restaurant.folders.length)

const dish = {
  needsReview: false,
  subjects: [{ type: 'dish', name: '锅包肉', confidence: .97 }],
  contentType: '东北菜', tags: ['热菜'], captureType: 'close_up',
  quality: { overall: .9 },
  textDetection: { items: [{ text: '$18', type: 'price', confidence: .9 }], hasRiskText: true },
}
assert.equal(canonicalFolderForAnalysis(restaurant, dish, 'image/jpeg'), 'dishes_drinks')
assert.deepEqual(generatedClassificationTags(dish), ['dish:锅包肉', 'capture:close_up', 'ocr:price'])
assert.equal(canonicalFolderForAnalysis(restaurant, { ...dish, needsReview: true }, 'image/jpeg'), 'needs_review')
assert.equal(canonicalFolderForAnalysis(restaurant, { ...dish, quality: { overall: .2 } }, 'image/jpeg'), 'not_recommended')
assert.equal(canonicalFolderForAnalysis(restaurant, { ...dish, subjects: [], contentType: '素材', tags: [] }, 'video/mp4'), 'original_video')

assert.equal(templateForIndustry('retail fashion').key, 'retail-v1')
assert.equal(templateForIndustry('professional services').key, 'service-v1')
assert.equal(templateForIndustry('unknown').key, 'general-v1')

console.log('PASS asset library templates: stable industry folders, deterministic mapping and tags')
