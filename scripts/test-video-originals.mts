import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { makeBrandVideoOriginalKey } from '../src/lib/integrations/huaweiObs.ts'

const key = makeBrandVideoOriginalKey({ brandId: 'brand/unsafe', captureDate: '2026-08-24', projectId: 'project 1', filename: '摄影师 原片.MOV' })
assert.match(key, /^brands\/brand\/unsafe\/assets\/视频原片\/2026\/2026-08-24\/project-1\//)
assert.match(key, /\.mov$/)

const [folders, internalApi, schema, dashboard] = await Promise.all([
  readFile(new URL('../src/app/api/brands/[id]/folders/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/internal/content-assets/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/dashboard/DashboardAssets.tsx', import.meta.url), 'utf8'),
])
assert.match(folders, /DEFAULT_FOLDERS.*视频原片/)
assert.match(folders, /RESERVED_FOLDERS.*视频原片/)
for (const action of ['createShootBatch', 'updateShootBatch', 'listShootBatches']) assert.match(internalApi, new RegExp(action))
assert.match(internalApi, /250_000_000/)
assert.match(internalApi, /video_production_upload/)
assert.match(internalApi, /basic_video_reference/)
assert.match(internalApi, /视频制作参考/)
assert.match(internalApi, /mediaKind === 'video' && !projectId && !basicVideoReference/)
assert.match(schema, /model VideoShootBatch/)
for (const field of ['shootBatchId', 'videoProjectId', 'captureDate', 'originalFilename', 'rightsStatus']) assert.match(schema, new RegExp(field))
assert.match(dashboard, /collapsedShootBatches/)
console.log('video originals and shoot batch checks passed')
