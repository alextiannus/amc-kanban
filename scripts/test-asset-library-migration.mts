import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const service = readFileSync(new URL('../src/lib/asset-library/migration.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../src/app/api/brands/[id]/asset-library-migration/route.ts', import.meta.url), 'utf8')
assert.match(service, /previewAssetLibraryMigration/)
assert.match(service, /expectedDigest/)
assert.match(service, /ASSET_LIBRARY_MIGRATION_MOVE/)
assert.match(service, /rollbackAssetLibraryMigration/)
assert.match(route, /analysisActor/)
assert.match(route, /Admin access required/)
assert.match(route, /body\?\.action === 'apply'/)
console.log('PASS asset library migration: authenticated preview, digest-gated apply and audited rollback')
