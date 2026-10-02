import assert from 'node:assert/strict'
import { ANALYSIS_VERSION, INITIAL_FOLDERS, isNightlyWindow, parseImageAnalysis, suggestedFolder } from '../src/lib/asset-analysis/policy.ts'

assert.equal(ANALYSIS_VERSION, 'asset-image-video-v2')
for (const folder of ['菜品','门店环境','人物','活动与宴席','菜单与价格','视频原片','待确认','重复素材','不建议使用']) assert(INITIAL_FOLDERS.includes(folder))
const result = parseImageAnalysis({ contentType: '菜品', caption: '铁锅炖和配菜近景', tags: ['铁锅炖','菜品','近景'], needsReview: false,
  subjects: [{ type: 'dish', name: '铁锅炖', confidence: .96 }, { type: 'dish', name: '凉菜', confidence: .82 }], captureType: 'close_up',
  textDetection: { items: [{ text: '$28', type: 'price', confidence: .9 }] }, quality: { clarity: .9, exposure: .8, stability: .95, subjectCompleteness: .9, overall: .88 },
  searchText: '东北菜 铁锅炖 凉菜', segments: [{ segmentKey: 'shot-1', startMs: 1000, endMs: 4500, stabilityScore: .92, roleSuitability: ['hero'], subjects: [{ type: 'dish', name: '铁锅炖', confidence: .96 }] }] })
assert.equal(result.textDetection.hasRiskText, true)
assert.deepEqual(suggestedFolder(result), { topLevel: '菜品', child: '铁锅炖' })
assert.equal(result.segments[0].startMs, 1000)
assert.equal(isNightlyWindow(new Date('2026-10-01T18:30:00Z'), 'Asia/Singapore'), true)
assert.equal(isNightlyWindow(new Date('2026-10-01T12:30:00Z'), 'Asia/Singapore'), false)
console.log('PASS asset intelligence policy: folders, OCR risk, segments and brand-local nightly window')
