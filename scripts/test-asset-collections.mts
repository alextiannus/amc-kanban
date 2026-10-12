import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../prisma/migrations/20261008090000_industry_asset_collections/migration.sql', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../src/components/dashboard/DashboardAssets.tsx', import.meta.url), 'utf8')

for (const model of ['AssetCollection', 'AssetCollectionSlot', 'AssetCollectionItem']) {
  assert.match(schema, new RegExp(`model ${model} \\{`))
}
assert.match(schema, /systemKey\s+String\?/)
assert.match(schema, /folderKind\s+String\s+@default\("CUSTOM"\)/)
assert.match(schema, /@@unique\(\[collectionId, assetId\]\)/)
assert.match(schema, /@@unique\(\[collectionId, slotKey\]\)/)
assert.match(schema, /@@index\(\[brandId, contentHash\]\)/)
assert.match(migration, /CREATE INDEX "MediaAsset_brandId_contentHash_idx"/)
assert.match(migration, /CREATE TABLE "AssetCollection"/)
assert.match(migration, /CREATE TABLE "AssetCollectionSlot"/)
assert.match(migration, /CREATE TABLE "AssetCollectionItem"/)
assert.match(migration, /ON DELETE CASCADE/)
assert.match(dashboard, /const contentHash = isImage \? await fileSha256\(file\) : undefined/)

console.log('PASS asset collection schema: canonical folders and reference-only script collections')
