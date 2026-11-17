import assert from 'node:assert/strict'
import fs from 'node:fs'

const schema=fs.readFileSync('prisma/schema.prisma','utf8')
const migration=fs.readFileSync('prisma/migrations/20261113214500_multi_store_workspaces/migration.sql','utf8')
const createRoute=fs.readFileSync('src/app/api/brands/[id]/store-workspaces/route.ts','utf8')
const updateRoute=fs.readFileSync('src/app/api/brands/[id]/store-workspaces/[workspaceId]/route.ts','utf8')

for(const field of ['workspaceKind','storeName','parentBrandId','storeWorkspaces']) assert.match(schema,new RegExp(`\\b${field}\\b`))
assert.match(migration,/FOREIGN KEY \("parentBrandId"\)/)
assert.match(migration,/Brand_parentBrandId_status_idx/)
assert.match(createRoute,/autoPilot: false/)
assert.match(createRoute,/copyBrandProfile/)
assert.match(createRoute,/copyStrategy/)
assert.match(createRoute,/copySocialAccounts/)
assert.match(createRoute,/STORE_WORKSPACE_CREATED/)
assert.doesNotMatch(createRoute,/tx\.(mediaAsset|contentDraft|workUnit|brandSubscription)\.(create|createMany)/)
assert.match(updateRoute,/Active subscription must be ended before archiving/)
assert.match(updateRoute,/STORE_WORKSPACE_STATUS_CHANGED/)
assert.match(updateRoute,/Create or activate another store workspace before pausing the brand root/)
console.log('store workspace backend contract: ok')
