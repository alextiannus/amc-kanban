import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../src/app/api/internal/brands/[id]/asset-index/route.ts', import.meta.url), 'utf8')
assert.match(route, /x-content-service-token/)
for (const field of ['candidateId','duplicateGroupId','qualityScore','stabilityScore','startMs','endMs','roleSuitability','textRiskTypes']) assert(route.includes(field), `missing indexed field ${field}`)
assert.doesNotMatch(route, /internalCost|rawUsage/)
console.log('PASS asset index contract: authenticated retrieval, timecodes, quality, duplicate and OCR-risk metadata')
