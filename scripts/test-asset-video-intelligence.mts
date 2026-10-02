import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseImageAnalysis, suggestedFolder } from '../src/lib/asset-analysis/policy.ts'

const service = fs.readFileSync(new URL('../src/lib/asset-analysis/service.ts', import.meta.url), 'utf8')
const configRoute = fs.readFileSync(new URL('../src/app/api/admin/system-config/route.ts', import.meta.url), 'utf8')
const operationRoute = fs.readFileSync(new URL('../src/app/api/internal/model-operations/route.ts', import.meta.url), 'utf8')
assert.match(service, /mimeType: \{ startsWith: 'video\/' \}/)
assert.match(service, /video \? 'asset_video_analysis' : 'asset_image_analysis'/)
assert.match(service, /type: video \? 'video' : 'image'/)
for (const field of ['subjects', 'captureType', 'textDetection', 'quality', 'segments', 'duplicateHint']) assert(service.includes(field))
for (const risk of ['price', 'english_address', 'watermark']) assert(service.includes(risk))
assert.match(service, /assetVideoSegment\.createMany/)
assert.match(service, /perceptualHash: result\.duplicateHint/)
assert.match(service, /parentId: assignedFolder\.id/)
assert.match(service, /analysisCredit\(taskType, rawUsage\)/)
assert.match(configRoute, /'asset_video_analysis'/)
assert.match(operationRoute, /'asset_video_analysis'/)
const parsed = parseImageAnalysis({ contentType: '东北菜展示', caption: '镜头展示锅包肉与门店环境', tags: ['锅包肉', '东北菜', '门店'], needsReview: false,
  subjects: [{ type: 'dish', name: '锅包肉', confidence: .96 }], captureType: 'close_up',
  textDetection: { items: [{ text: '$18', type: 'price', confidence: .9 }] }, quality: { clarity: .9, exposure: .8, stability: .92, subjectCompleteness: .95, overall: .9 },
  duplicateHint: 'dish-golden-pork-blue-plate', searchText: '锅包肉 金黄酥脆 蓝色餐盘',
  segments: [{ segmentKey: 'dish-1', startMs: 0, endMs: 3200, subjects: [{ type: 'dish', name: '锅包肉', confidence: .96 }], stabilityScore: .92, roleSuitability: ['hero'], searchText: '锅包肉近景' }] })
assert.equal(parsed.textDetection.hasRiskText, true)
assert.equal(parsed.segments[0].stabilityScore, .92)
assert.deepEqual(suggestedFolder(parsed), { topLevel: '菜品', child: '锅包肉' })
console.log('PASS asset video intelligence: nightly enqueue, OCR, segments, duplicate signature, subfolder placement and AMC Credit accounting')
