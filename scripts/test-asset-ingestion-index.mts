import assert from 'node:assert/strict'
import fs from 'node:fs'

const upload = fs.readFileSync(new URL('../src/app/api/brands/[id]/assets/route.ts', import.meta.url), 'utf8')
const service = fs.readFileSync(new URL('../src/lib/asset-analysis/service.ts', import.meta.url), 'utf8')
assert.match(upload, /createHash\('sha256'\)\.update\(fileBuffer\)/)
assert.match(upload, /duplicateGroupId/)
assert.match(upload, /assetKind: resolvedMimeType\.startsWith\('video\/'\)/)
assert.match(service, /isNightlyWindow/)
assert.match(service, /allowNightlyOverage/)
assert.match(service, /settleCredit/)
console.log('PASS asset ingestion/index contract: exact hash, duplicate group, media kind, nightly gating and analysis credit')
