import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../prisma/migrations/20261008090000_industry_asset_collections/migration.sql', import.meta.url), 'utf8')
for (const model of ['AssetCollection', 'AssetCollectionSlot', 'AssetCollectionItem']) assert.match(schema, new RegExp(`model ${model} \\{`))
assert.match(schema, /systemKey\s+String\?/)
assert.match(schema, /folderKind\s+String\s+@default\("CUSTOM"\)/)
assert.match(schema, /@@unique\(\[brandId, kind, creativeId\]\)/)
assert.doesNotMatch(schema, /@@unique\(\[brandId, kind, creativeId, creativeVersion\]\)/)
assert.match(schema, /@@unique\(\[collectionId, assetId\]\)/)
assert.match(schema, /@@unique\(\[collectionId, slotKey\]\)/)
assert.match(migration, /CREATE TABLE "AssetCollection"/)
assert.match(migration, /ON DELETE CASCADE/)
console.log('PASS asset collection schema: canonical folders and reference-only script collections')
