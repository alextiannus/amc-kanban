# Industry Asset Library and Script Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each merchant asset once in a stable industry folder while exposing reusable, uploadable virtual collections for confirmed scripts.

**Architecture:** `MediaAsset.folderId` becomes the canonical physical location chosen by a deterministic industry template. Script collections, requirement slots, and asset membership are new relational records that point to the canonical asset; exact duplicate uploads reuse the existing brand-scoped asset. Existing visual analysis supplies tags and structured metadata but cannot invent folders.

**Tech Stack:** Next.js 16 App Router, TypeScript, React, Prisma/PostgreSQL, Node.js test scripts, Huawei OBS.

**Spec:** `docs/superpowers/specs/2026-10-08-industry-asset-library-and-script-collections-design.md`

## Global Constraints

- System-wide Token and AMC Credit optimization remains outside this feature and must not block it.
- One stored `MediaAsset` has one canonical folder; script collections store references only.
- Exact deduplication is brand-scoped; no cross-brand asset sharing.
- Near duplicates are grouped for review and never deleted automatically.
- AI may select a standard folder but may not create dish, product, capture-type, or arbitrary category folders.
- User captions, user tags, manual folder moves, and ambiguous existing custom folders must be preserved.
- Northeast Chinese Restaurant migration is preview-only until the preview is explicitly approved.
- Release evidence must distinguish local tests, remote synchronization, deployment status, and authenticated production proof.

## File map

- `prisma/schema.prisma`: folder metadata and virtual collection relations.
- `prisma/migrations/20261008090000_industry_asset_collections/migration.sql`: additive schema migration and indexes.
- `src/lib/asset-library/templates.ts`: industry template registry, normalization, and deterministic folder selection.
- `src/lib/asset-library/collections.ts`: collection, slot, membership, and exact-dedup linking service.
- `src/lib/asset-library/migration.ts`: preview/apply/rollback service for legacy AI folders.
- `src/lib/asset-analysis/policy.ts`: analysis-to-tags normalization; no child-folder creation.
- `src/lib/asset-analysis/folders.ts`: idempotent standard-folder seeding.
- `src/lib/asset-analysis/service.ts`: canonical placement and removal of AI folder-summary generation.
- `src/app/api/brands/[id]/asset-collections/route.ts`: list/create collections.
- `src/app/api/brands/[id]/asset-collections/[collectionId]/route.ts`: read/update/delete one collection.
- `src/app/api/brands/[id]/asset-collections/[collectionId]/items/route.ts`: link/unlink assets and slots.
- `src/app/api/brands/[id]/asset-library-migration/route.ts`: preview/apply/rollback endpoint.
- `src/app/api/brands/[id]/assets/route.ts`: direct-upload exact reuse and collection membership.
- `src/app/api/brands/[id]/assets/confirm-upload/route.ts`: signed-upload exact reuse and collection membership.
- `src/lib/brand-plan/creativeCollections.ts`: convert confirmed creative requirements and shots into stable slots.
- `src/lib/brand-plan/creativeRevisions.ts`: synchronize the collection when a creative becomes confirmed.
- `src/components/dashboard/AssetCollectionPanel.tsx`: virtual collection and slot UI.
- `src/components/dashboard/DashboardAssets.tsx`: standard/script/custom navigation and collection-aware upload.
- `src/components/dashboard/BrandProfileView.tsx`: confirmed-script material collection affordance.
- `scripts/test-asset-library-templates.mts`: template and generated-tag regression tests.
- `scripts/test-asset-collections.mts`: collection, deduplication, and authorization contracts.
- `scripts/test-asset-library-migration.mts`: migration preview/apply/rollback tests.
- `scripts/test-asset-image-analysis.mts`: updated analysis placement expectations.

---

### Task 1: Add canonical-folder and virtual-collection schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261008090000_industry_asset_collections/migration.sql`
- Test: `scripts/test-asset-collections.mts`
- Modify: `package.json`

**Interfaces:**
- Produces: Prisma models `AssetCollection`, `AssetCollectionSlot`, `AssetCollectionItem` and enum-like string fields documented below.
- Produces: nullable `BrandFolder.systemKey`, `BrandFolder.folderKind`, and `BrandFolder.templateVersion`.
- Consumes: existing `Brand`, `BrandFolder`, `MediaAsset`, and `User` identities.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
for (const model of ['AssetCollection', 'AssetCollectionSlot', 'AssetCollectionItem']) {
  assert.match(schema, new RegExp(`model ${model} \\{`))
}
assert.match(schema, /systemKey\s+String\?/)
assert.match(schema, /folderKind\s+String\s+@default\("CUSTOM"\)/)
assert.match(schema, /@@unique\(\[collectionId, assetId\]\)/)
assert.match(schema, /@@unique\(\[collectionId, slotKey\]\)/)
```

- [ ] **Step 2: Run the schema contract test and verify failure**

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Expected: FAIL because `AssetCollection` does not exist.

- [ ] **Step 3: Add additive Prisma models and relations**

```prisma
model AssetCollection {
  id              String                @id @default(cuid())
  brandId         String
  brand           Brand                 @relation(fields: [brandId], references: [id], onDelete: Cascade)
  kind            String                @default("SCRIPT")
  creativeId      String
  creativeVersion Int                   @default(0)
  month           String?
  name            String
  status          String                @default("WAITING_FOR_ASSETS")
  createdById     String?
  slots           AssetCollectionSlot[]
  items           AssetCollectionItem[]
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@unique([brandId, kind, creativeId, creativeVersion])
  @@index([brandId, status, updatedAt])
}

model AssetCollectionSlot {
  id            String                @id @default(cuid())
  collectionId  String
  collection    AssetCollection       @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  slotKey       String
  title         String
  requirement   String
  expectedTags  String[]              @default([])
  order         Int                   @default(0)
  status        String                @default("MISSING")
  items         AssetCollectionItem[]
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt

  @@unique([collectionId, slotKey])
  @@index([collectionId, order])
}

model AssetCollectionItem {
  id            String               @id @default(cuid())
  collectionId  String
  collection    AssetCollection      @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  assetId       String
  asset         MediaAsset            @relation(fields: [assetId], references: [id], onDelete: Cascade)
  slotId        String?
  slot          AssetCollectionSlot?  @relation(fields: [slotId], references: [id], onDelete: SetNull)
  role          String?
  order         Int                  @default(0)
  uploadOrigin  String               @default("LIBRARY")
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  @@unique([collectionId, assetId])
  @@index([assetId])
  @@index([slotId, order])
}
```

Add these fields to `BrandFolder`:

```prisma
systemKey       String?
folderKind     String  @default("CUSTOM")
templateVersion String?

@@unique([brandId, systemKey])
```

Add collection relations to `Brand` and `MediaAsset`.

- [ ] **Step 4: Write the SQL migration with additive columns, tables, foreign keys, and indexes**

The migration must use quoted Prisma table/column names, set existing folders to `CUSTOM`, and avoid deleting or moving any asset:

```sql
ALTER TABLE "BrandFolder"
  ADD COLUMN "systemKey" TEXT,
  ADD COLUMN "folderKind" TEXT NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "templateVersion" TEXT;

CREATE UNIQUE INDEX "BrandFolder_brandId_systemKey_key"
  ON "BrandFolder"("brandId", "systemKey");

CREATE TABLE "AssetCollection" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL DEFAULT 'SCRIPT',
  "creativeId" TEXT NOT NULL,
  "creativeVersion" INTEGER NOT NULL DEFAULT 0,
  "month" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING_FOR_ASSETS',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
```

Create `AssetCollectionSlot` and `AssetCollectionItem` with the constraints from the Prisma schema.

- [ ] **Step 5: Generate Prisma client and run checks**

Run: `npx prisma generate`

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Run: `npm run typecheck`

Expected: all PASS.

- [ ] **Step 6: Commit the schema slice**

```bash
git add prisma/schema.prisma prisma/migrations/20261008090000_industry_asset_collections/migration.sql scripts/test-asset-collections.mts package.json
git commit -m "Add virtual asset collection schema"
```

### Task 2: Implement stable industry templates and folder seeding

**Files:**
- Create: `src/lib/asset-library/templates.ts`
- Modify: `src/lib/asset-analysis/folders.ts`
- Modify: `src/lib/asset-analysis/policy.ts`
- Create: `scripts/test-asset-library-templates.mts`
- Modify: `package.json`

**Interfaces:**
- Produces: `templateForIndustry(industry: unknown): IndustryFolderTemplate`.
- Produces: `canonicalFolderForAnalysis(template, result): StandardFolderKey`.
- Produces: `generatedClassificationTags(result): string[]`.
- Produces: `ensureAssetFolders(brandId): Promise<void>` seeded by stable `systemKey`.

- [ ] **Step 1: Write failing template tests**

```ts
import assert from 'node:assert/strict'
import { canonicalFolderForAnalysis, generatedClassificationTags, templateForIndustry } from '../src/lib/asset-library/templates.ts'

const restaurant = templateForIndustry('F&B Restaurant')
assert.equal(restaurant.key, 'restaurant-v1')
assert.equal(new Set(restaurant.folders.map(folder => folder.key)).size, restaurant.folders.length)
assert.equal(canonicalFolderForAnalysis(restaurant, {
  needsReview: false,
  subjects: [{ type: 'dish', name: '锅包肉', confidence: .97 }],
  contentType: '东北菜', tags: ['热菜'], captureType: 'close_up',
  quality: { overall: .9 }, textDetection: { items: [], hasRiskText: false },
}), 'dishes_drinks')
assert.deepEqual(generatedClassificationTags({
  subjects: [{ type: 'dish', name: '锅包肉', confidence: .97 }], captureType: 'close_up',
  textDetection: { items: [{ text: '$18', type: 'price', confidence: .9 }], hasRiskText: true },
  quality: { overall: .9 },
}), ['dish:锅包肉', 'capture:close_up', 'ocr:price'])
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `node --experimental-strip-types scripts/test-asset-library-templates.mts`

Expected: FAIL with module-not-found for `templates.ts`.

- [ ] **Step 3: Add the template registry and deterministic mapping**

```ts
export type StandardFolderKey =
  | 'brand_storefront' | 'dishes_drinks' | 'store_environment'
  | 'people_service' | 'preparation' | 'events_atmosphere'
  | 'menu_pricing' | 'original_video' | 'needs_review' | 'not_recommended'

export type IndustryFolderTemplate = {
  key: string
  folders: Array<{ key: StandardFolderKey; zh: string; en: string }>
}

export function templateForIndustry(industry: unknown): IndustryFolderTemplate {
  const value = String(industry || '').toLowerCase()
  if (/restaurant|food|f&b|餐饮|餐厅/.test(value)) return RESTAURANT_TEMPLATE
  if (/retail|零售/.test(value)) return RETAIL_TEMPLATE
  if (/service|服务/.test(value)) return SERVICE_TEMPLATE
  return GENERAL_TEMPLATE
}
```

Implement folder selection with ordered checks: review, quality, original video, menu/price, preparation, dish/product, people/service, event, storefront/environment, then needs review. Do not return subject names as folder names.

- [ ] **Step 4: Update folder seeding to upsert stable system keys**

`ensureAssetFolders` must read the brand industry, select a template, and upsert each standard folder using `(brandId, systemKey)`. It must not adopt arbitrary `aiCategory` values as standard folders.

```ts
await tx.brandFolder.upsert({
  where: { brandId_systemKey: { brandId, systemKey: folder.key } },
  create: { brandId, systemKey: folder.key, name: folder.zh, folderKind: 'STANDARD', templateVersion: template.key },
  update: { folderKind: 'STANDARD', templateVersion: template.key },
})
```

- [ ] **Step 5: Remove child-folder output from analysis policy**

Replace `suggestedFolder()` with a compatibility wrapper that returns one standard key/name and never a `child` field. Keep `mergeAnalysisTags()` preserving non-generated user tags.

- [ ] **Step 6: Run tests and commit**

Run: `node --experimental-strip-types scripts/test-asset-library-templates.mts`

Run: `node --experimental-strip-types scripts/test-asset-image-analysis.mts`

Run: `npm run typecheck`

Expected: all PASS.

```bash
git add src/lib/asset-library/templates.ts src/lib/asset-analysis/folders.ts src/lib/asset-analysis/policy.ts scripts/test-asset-library-templates.mts scripts/test-asset-image-analysis.mts package.json
git commit -m "Add stable industry asset folders"
```

### Task 3: Build the virtual collection service and APIs

**Files:**
- Create: `src/lib/asset-library/collections.ts`
- Create: `src/app/api/brands/[id]/asset-collections/route.ts`
- Create: `src/app/api/brands/[id]/asset-collections/[collectionId]/route.ts`
- Create: `src/app/api/brands/[id]/asset-collections/[collectionId]/items/route.ts`
- Modify: `scripts/test-asset-collections.mts`

**Interfaces:**
- Produces: `ensureScriptCollection(input: EnsureScriptCollectionInput): Promise<AssetCollectionView>`.
- Produces: `linkAssetToCollection(input: LinkAssetInput): Promise<AssetCollectionItem>`.
- Produces: `unlinkAssetFromCollection(input): Promise<{ removed: boolean }>`.
- Consumes: Prisma schema from Task 1 and brand authorization used by existing asset routes.

- [ ] **Step 1: Extend failing tests for collection idempotency and isolation**

```ts
const sameInput = {
  brandId: 'brand-a', creativeId: 'creative-1', creativeVersion: 3, month: '2026-10',
  name: '自助餐视频', createdById: 'user-1', slots: [{ slotKey: 'shot-1', title: '开场', requirement: '门头全景', expectedTags: ['scene:storefront'], order: 0 }],
}
const first = await ensureScriptCollection(sameInput)
const replay = await ensureScriptCollection(sameInput)
assert.equal(replay.id, first.id)
await linkAssetToCollection({ brandId: 'brand-a', collectionId: first.id, assetId: 'asset-1', slotId: first.slots[0].id, uploadOrigin: 'UPLOAD' })
await linkAssetToCollection({ brandId: 'brand-a', collectionId: first.id, assetId: 'asset-1', slotId: first.slots[0].id, uploadOrigin: 'UPLOAD' })
assert.equal(await itemCount(first.id, 'asset-1'), 1)
await assert.rejects(() => linkAssetToCollection({ brandId: 'brand-b', collectionId: first.id, assetId: 'asset-1' }), /not found/i)
```

- [ ] **Step 2: Run and verify failure**

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Expected: FAIL because collection service functions are absent.

- [ ] **Step 3: Implement transactional collection synchronization**

```ts
export type CollectionSlotInput = {
  slotKey: string; title: string; requirement: string; expectedTags: string[]; order: number
}

export type EnsureScriptCollectionInput = {
  brandId: string; creativeId: string; creativeVersion?: number; month?: string
  name: string; createdById?: string; slots: CollectionSlotInput[]
}

export type LinkAssetInput = {
  brandId: string; collectionId: string; assetId: string
  slotId?: string; role?: string; order?: number; uploadOrigin?: 'UPLOAD' | 'LIBRARY' | 'MIGRATION'
}

export type AssetCollectionView = {
  id: string; brandId: string; creativeId: string; creativeVersion: number
  name: string; status: string; missingCount: number
  slots: Array<{ id: string; slotKey: string; title: string; requirement: string; status: string; items: Array<{ id: string; assetId: string }> }>
}

export async function ensureScriptCollection(input: EnsureScriptCollectionInput, db = prisma) {
  return db.$transaction(async tx => {
    const collection = await tx.assetCollection.upsert({
      where: { brandId_kind_creativeId_creativeVersion: {
        brandId: input.brandId, kind: 'SCRIPT', creativeId: input.creativeId,
        creativeVersion: input.creativeVersion ?? 0,
      } },
      create: {
        brandId: input.brandId, kind: 'SCRIPT', creativeId: input.creativeId,
        creativeVersion: input.creativeVersion ?? 0, month: input.month,
        name: input.name, createdById: input.createdById,
      },
      update: { name: input.name, month: input.month },
    })
    for (const slot of input.slots) {
      await tx.assetCollectionSlot.upsert({
        where: { collectionId_slotKey: { collectionId: collection.id, slotKey: slot.slotKey } },
        create: {
          collectionId: collection.id, slotKey: slot.slotKey, title: slot.title,
          requirement: slot.requirement, expectedTags: slot.expectedTags, order: slot.order,
        },
        update: {
          title: slot.title, requirement: slot.requirement,
          expectedTags: slot.expectedTags, order: slot.order,
        },
      })
    }
    return presentCollection(await loadCollection(tx, input.brandId, collection.id))
  }, { isolationLevel: 'Serializable' })
}
```

Define the private helpers in the same file with these exact contracts:

```ts
async function loadCollection(db: Prisma.TransactionClient, brandId: string, collectionId: string): Promise<LoadedCollection>
function presentCollection(row: LoadedCollection): AssetCollectionView
```

Do not delete unmatched slots during synchronization; mark them `UNASSIGNED` when their script shot disappears so existing references remain visible.

- [ ] **Step 4: Implement authenticated APIs**

Use the existing `getSession`/API-key authentication and `canSessionAccessBrandProject`. `GET` lists collections with missing/filled slot counts. `POST` creates/synchronizes a script collection. Collection `DELETE` removes only collection records and references through cascade, never a `MediaAsset`. Item `POST` and `DELETE` call the service and enforce brand ownership.

- [ ] **Step 5: Run service/API tests and commit**

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Run: `npm run typecheck`

Expected: all PASS.

```bash
git add src/lib/asset-library/collections.ts src/app/api/brands/[id]/asset-collections scripts/test-asset-collections.mts
git commit -m "Add virtual script asset collections"
```

### Task 4: Reuse exact uploads and attach them to collections

**Files:**
- Modify: `src/lib/asset-library/collections.ts`
- Modify: `src/app/api/brands/[id]/assets/route.ts`
- Modify: `src/app/api/brands/[id]/assets/confirm-upload/route.ts`
- Modify: `scripts/test-asset-ingestion-index.mts`
- Modify: `scripts/test-asset-collections.mts`

**Interfaces:**
- Produces: `findReusableAsset(brandId: string, contentHash: string, db?): Promise<MediaAsset | null>`.
- Produces: upload inputs `collectionId?: string` and `slotId?: string`.
- Consumes: `linkAssetToCollection()` from Task 3.

- [ ] **Step 1: Write failing exact-reuse tests**

Assert that uploading the same bytes twice for one brand returns the first asset ID, creates one `MediaAsset`, and creates collection membership for both requested collections. Assert that the same bytes uploaded for a second brand create a different asset.

```ts
assert.equal(second.assetId, first.assetId)
assert.equal(await assetCount({ brandId: 'brand-a', contentHash }), 1)
assert.equal(await membershipCount({ assetId: first.assetId }), 2)
assert.notEqual(otherBrand.assetId, first.assetId)
```

- [ ] **Step 2: Run and verify current duplicate-record behavior fails**

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Expected: FAIL because the second upload creates another asset record.

- [ ] **Step 3: Add collection validation before storage upload**

Validate collection and slot ownership before uploading bytes. Reject mismatched collection/slot with 404 and do not upload an object.

- [ ] **Step 4: Reuse brand-scoped exact assets**

In direct upload, calculate SHA-256 before storage. If an existing asset is found, call `linkAssetToCollection` when requested and return:

```ts
return NextResponse.json({
  ok: true,
  assetId: reusable.id,
  assetUrl: reusable.url,
  asset: reusable,
  exactDuplicateReused: true,
  uploadedAt: reusable.createdAt.toISOString(),
})
```

Do not upload a second OBS/PostFast/local object on this path. For signed uploads, extend confirmation to persist an authoritative content hash obtained during inspection; when exact reuse is proven after upload, link the existing asset and retain the newly uploaded object for a separately audited cleanup path.

- [ ] **Step 5: Set canonical initial placement and link newly created assets**

New assets use the standard `needs_review` folder ID and synchronized label, then call:

```ts
if (body.collectionId) {
  await linkAssetToCollection({
    brandId, collectionId: body.collectionId, assetId: asset.id,
    slotId: body.slotId, uploadOrigin: 'UPLOAD',
  })
}
```

Keep existing `creativeId` compatibility by resolving or creating the corresponding script collection before linking.

- [ ] **Step 6: Run upload and collection tests, then commit**

Run: `node --experimental-strip-types scripts/test-asset-ingestion-index.mts`

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Run: `npm run typecheck`

Expected: all PASS.

```bash
git add src/lib/asset-library/collections.ts src/app/api/brands/[id]/assets/route.ts src/app/api/brands/[id]/assets/confirm-upload/route.ts scripts/test-asset-ingestion-index.mts scripts/test-asset-collections.mts
git commit -m "Reuse exact assets across script collections"
```

### Task 5: Make visual analysis update tags and canonical folders only

**Files:**
- Modify: `src/lib/asset-analysis/service.ts`
- Modify: `src/lib/asset-analysis/policy.ts`
- Modify: `scripts/test-asset-image-analysis.mts`
- Modify: `scripts/test-asset-video-intelligence.mts`

**Interfaces:**
- Consumes: `templateForIndustry`, `canonicalFolderForAnalysis`, `generatedClassificationTags` from Task 2.
- Produces: one canonical `folderId`, synchronized `aiCategory`, and merge-safe generated tags.

- [ ] **Step 1: Change tests to reject dynamic child folders**

```ts
assert.equal(rows.mediaAsset[0].aiCategory, '菜品与饮品')
assert.ok(rows.mediaAsset[0].aiTags.includes('dish:锅包肉'))
assert.ok(!rows.brandFolder.some(folder => folder.name === '锅包肉'))
assert.equal(rows.assetAnalysisBatch[0].summaryRequest, null)
```

- [ ] **Step 2: Run tests and verify old child-folder behavior fails**

Run: `node --experimental-strip-types scripts/test-asset-image-analysis.mts`

Run: `node --experimental-strip-types scripts/test-asset-video-intelligence.mts`

Expected: FAIL because the current code creates a dish child folder and requests a model-generated folder summary.

- [ ] **Step 3: Replace folder upsert logic with template lookup**

```ts
const template = templateForIndustry(batch.industry)
const systemKey = canonicalFolderForAnalysis(template, result, item.asset.mimeType)
const assignedFolder = await tx.brandFolder.findUniqueOrThrow({
  where: { brandId_systemKey: { brandId: asset.brandId, systemKey } },
})
const generated = generatedClassificationTags(result)
```

Update `folderId` only when the asset was untouched and still in a system review/root state. Store the generated tag list in `imageAnalysis.generatedTags`; use `mergeAnalysisTags` so user tags survive.

- [ ] **Step 4: Remove model-generated summary grouping**

Delete `summarize()` and the `asset_category_summary` request. When no pending items remain, set the batch to `READY` with deterministic summary groups derived from standard folder keys, or directly `APPLIED` for automatic upload batches. Keep per-item errors visible.

- [ ] **Step 5: Run analysis tests and commit**

Run: `node --experimental-strip-types scripts/test-asset-image-analysis.mts`

Run: `node --experimental-strip-types scripts/test-asset-video-intelligence.mts`

Run: `npm run typecheck`

Expected: all PASS.

```bash
git add src/lib/asset-analysis/service.ts src/lib/asset-analysis/policy.ts scripts/test-asset-image-analysis.mts scripts/test-asset-video-intelligence.mts
git commit -m "Classify analyzed assets into standard folders"
```

### Task 6: Create and synchronize collections from confirmed scripts

**Files:**
- Create: `src/lib/brand-plan/creativeCollections.ts`
- Modify: `src/lib/brand-plan/creativeRevisions.ts`
- Modify: `src/components/dashboard/BrandProfileView.tsx`
- Modify: `scripts/test-brand-plan-calendar-script-contract.mts`
- Modify: `scripts/test-asset-collections.mts`

**Interfaces:**
- Produces: `collectionSlotsFromCreative(creative): CollectionSlotInput[]`.
- Produces: `syncConfirmedCreativeCollection(input): Promise<AssetCollectionView>`.
- Consumes: `ensureScriptCollection()` from Task 3 and the existing structured `videoScript`/`materialRequirements` contract.

- [ ] **Step 1: Write failing slot-generation tests**

```ts
const slots = collectionSlotsFromCreative({
  materialRequirements: ['门头全景', '自助餐热菜特写'],
  videoScript: { shots: ['顾客进入门店', '夹取不同热菜'] },
})
assert.deepEqual(slots.map(slot => slot.slotKey), [
  'material-1', 'material-2', 'shot-1', 'shot-2',
])
assert.equal(new Set(slots.map(slot => slot.slotKey)).size, slots.length)
```

- [ ] **Step 2: Run and verify failure**

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Expected: FAIL because creative-to-slot conversion is absent.

- [ ] **Step 3: Implement deterministic slot conversion**

Normalize requirements and structured shots, remove exact duplicate lines, and use position-stable keys. Never call a model. Preserve existing slot/item records when the script is edited.

- [ ] **Step 4: Synchronize on confirmation**

After `saveCreativeRevision` successfully persists a transition to `已确认` or `waiting_for_assets`, call the collection synchronizer after the database transaction. Use the saved revision version and creative ID. On collection failure, retain the confirmed creative and log an auditable retryable error rather than rolling back the creative revision.

- [ ] **Step 5: Add an explicit UI action**

On confirmed creative cards, add `准备素材` / `打开素材集`. The action calls the collection API and navigates to the asset-library collection view. It must be idempotent and show missing-slot count.

- [ ] **Step 6: Run tests and commit**

Run: `node --experimental-strip-types scripts/test-brand-plan-calendar-script-contract.mts`

Run: `node --experimental-strip-types scripts/test-asset-collections.mts`

Run: `npm run typecheck`

Expected: all PASS.

```bash
git add src/lib/brand-plan/creativeCollections.ts src/lib/brand-plan/creativeRevisions.ts src/components/dashboard/BrandProfileView.tsx scripts/test-brand-plan-calendar-script-contract.mts scripts/test-asset-collections.mts
git commit -m "Create material collections for confirmed scripts"
```

### Task 7: Add script collections to the asset-library UI

**Files:**
- Create: `src/components/dashboard/AssetCollectionPanel.tsx`
- Modify: `src/components/dashboard/DashboardAssets.tsx`
- Modify: `src/components/dashboard/AssetAnalysisTools.tsx`
- Create: `scripts/test-asset-collection-ui.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: collection APIs from Task 3 and collection-aware upload fields from Task 4.
- Produces: separate navigation groups for standard folders, script collections, and custom folders.

- [ ] **Step 1: Write the failing UI contract test**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashboard = readFileSync(new URL('../src/components/dashboard/DashboardAssets.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/dashboard/AssetCollectionPanel.tsx', import.meta.url), 'utf8')
for (const text of ['标准目录', '脚本素材集', '自定义目录']) assert.ok(dashboard.includes(text))
for (const field of ['collectionId', 'slotId', 'missingCount', 'exactDuplicateReused']) assert.ok(panel.includes(field))
assert.match(panel, /素材原件保存在标准目录/)
```

- [ ] **Step 2: Run and verify missing-panel failure**

Run: `node --experimental-strip-types scripts/test-asset-collection-ui.mts`

Expected: FAIL because `AssetCollectionPanel.tsx` does not exist.

- [ ] **Step 3: Add grouped navigation and collection loading**

Keep `DashboardAssets` responsible for navigation, search, and upload state. Put slot rendering, collection membership, and collection-specific upload controls in `AssetCollectionPanel` to avoid enlarging the existing component further.

- [ ] **Step 4: Render collection slots and references**

Each slot shows title, requirement, expected tags, missing/filled state, and linked asset cards. Include `从素材库选择` and `上传到此位置`; both create references rather than copies. Show an unassigned section for retained items whose script slot was removed.

The existing asset detail view must also list the canonical standard folder, generated and user tags separately, duplicate group, and every script collection referencing that asset.

- [ ] **Step 5: Make folder management respect folder kinds**

Standard folders are visible but cannot be renamed or deleted. Custom folders retain existing management actions. Remove the AI recommendation UI that permits creation of arbitrary analysis folders; replace it with standard-folder confirmation and tag review.

- [ ] **Step 6: Run UI/type checks and commit**

Run: `node --experimental-strip-types scripts/test-asset-collection-ui.mts`

Run: `npm run typecheck`

Expected: all PASS.

```bash
git add src/components/dashboard/AssetCollectionPanel.tsx src/components/dashboard/DashboardAssets.tsx src/components/dashboard/AssetAnalysisTools.tsx scripts/test-asset-collection-ui.mts package.json
git commit -m "Add script collections to asset library"
```

### Task 8: Add safe preview/apply/rollback migration for legacy folders

**Files:**
- Create: `src/lib/asset-library/migration.ts`
- Create: `src/app/api/brands/[id]/asset-library-migration/route.ts`
- Create: `scripts/test-asset-library-migration.mts`
- Modify: `package.json`

**Interfaces:**
- Produces: `previewAssetLibraryMigration(brandId): Promise<MigrationPreview>`.
- Produces: `applyAssetLibraryMigration(brandId, previewDigest, actorId): Promise<MigrationReceipt>`.
- Produces: `rollbackAssetLibraryMigration(brandId, receiptId, actorId): Promise<MigrationReceipt>`.
- Consumes: templates from Task 2 and collection records from Task 3.

- [ ] **Step 1: Write failing migration safety tests**

Create fixtures with an AI-created `菜品/锅包肉` child, an ambiguous root custom folder, user tags, generated tags, exact duplicates, and an existing creative ID.

```ts
const preview = await previewAssetLibraryMigration('brand-ne')
assert.equal(preview.moves[0].toSystemKey, 'dishes_drinks')
assert.ok(preview.moves[0].addGeneratedTags.includes('dish:锅包肉'))
assert.ok(preview.skippedFolders.some(folder => folder.name === '主理人精选'))
assert.equal(await currentFolder(assetId), originalFolderId)
await assert.rejects(() => applyAssetLibraryMigration('brand-ne', 'wrong-digest', 'admin'), /preview changed/i)
```

- [ ] **Step 2: Run and verify missing-service failure**

Run: `node --experimental-strip-types scripts/test-asset-library-migration.mts`

Expected: FAIL because migration service does not exist.

- [ ] **Step 3: Implement a deterministic preview**

Only classify a legacy folder as AI-created when evidence proves it: recognized standard parent, analyzed assets carrying compatible subjects, and no manual override. Hash a canonical JSON representation of every proposed move, tag change, collection link, empty-folder candidate, and skipped item.

- [ ] **Step 4: Implement transactional apply and audit receipt**

Require the exact preview digest. Store before/after folder IDs, generated-tag state, created collection links, and empty-folder decisions in an `AuditLog` entry with action `ASSET_LIBRARY_MIGRATION_APPLIED`. Delete only empty folders proved AI-created by the preview.

- [ ] **Step 5: Implement rollback from the audit receipt**

Restore folder IDs and generated tags, remove only collection links created by that receipt, and recreate an AI folder only if the recorded folder was deleted and its name/parent remains unambiguous. Never delete assets or stored objects.

- [ ] **Step 6: Add admin-only migration endpoint**

`GET` returns preview. `POST { action: 'apply', previewDigest }` applies. `POST { action: 'rollback', receiptId }` rolls back. Use existing admin authorization and return 409 when the preview changed.

- [ ] **Step 7: Run tests and commit**

Run: `node --experimental-strip-types scripts/test-asset-library-migration.mts`

Run: `npm run typecheck`

Expected: all PASS.

```bash
git add src/lib/asset-library/migration.ts src/app/api/brands/[id]/asset-library-migration/route.ts scripts/test-asset-library-migration.mts package.json
git commit -m "Add safe asset library migration workflow"
```

### Task 9: Validate, deploy, and produce the Northeast Chinese Restaurant preview

**Files:**
- Modify if generated: `package-lock.json`
- Read/verify: all files from Tasks 1–8
- Production data: brand `cmr1sictu003eio2auldwt26m`, preview only

**Interfaces:**
- Consumes: all prior tasks.
- Produces: synchronized Git SHA, live deployment evidence, authenticated feature smoke evidence where available, and a migration preview report requiring explicit approval.

- [ ] **Step 1: Run the complete targeted suite**

```bash
npm run test:asset-library-templates
npm run test:asset-collections
npm run test:asset-collection-ui
npm run test:asset-library-migration
node --experimental-strip-types scripts/test-asset-image-analysis.mts
node --experimental-strip-types scripts/test-asset-video-intelligence.mts
node --experimental-strip-types scripts/test-asset-ingestion-index.mts
node --experimental-strip-types scripts/test-brand-plan-calendar-script-contract.mts
npm run typecheck
git diff --check
```

Expected: every command passes with no diff whitespace errors.

- [ ] **Step 2: Inspect the complete intended diff**

Confirm the diff contains only schema/migration, asset-library services/APIs/UI, creative integration, tests, and the approved docs. Preserve unrelated dirty changes and stop if any intended file overlaps unknown user edits.

- [ ] **Step 3: Verify migration against a disposable/local database**

Run Prisma migration deployment against a non-production database, regenerate the client, then run the targeted suite again. Confirm dropping a virtual collection leaves `MediaAsset` rows untouched.

- [ ] **Step 4: Push and verify remote synchronization**

Push the reviewed commits to `origin/main`, then verify:

```bash
git rev-parse HEAD
git rev-parse origin/main
```

Expected: identical SHAs.

- [ ] **Step 5: Verify Render deployment**

Wait for `amc-kanban-sg` to report `Live`. Confirm startup logs show Next.js ready and no migration/schema failure. A public HTTP response proves reachability only, not authenticated behavior.

- [ ] **Step 6: Run authenticated feature smoke checks**

Using an authorized test account or existing safe test mechanism:

- list standard folders and confirm stable system keys;
- confirm a test script and see an empty virtual collection;
- upload/link one test asset and verify one canonical asset plus one collection item;
- link the same asset to a second collection and verify no copied asset record;
- remove the test collection and verify the asset remains.

Record any unavailable authenticated step as unverified rather than inferred.

- [ ] **Step 7: Generate the production migration preview only**

Call the preview endpoint for `cmr1sictu003eio2auldwt26m`. Report:

- canonical folders to seed;
- assets proposed for movement;
- generated tags to add;
- exact and near-duplicate groups;
- script collection links to create;
- ambiguous/custom folders skipped;
- empty AI-folder candidates;
- preview digest.

Do not call `apply` until the user explicitly approves this concrete preview.

- [ ] **Step 8: Commit any final generated lockfile or test-only correction**

```bash
git add package-lock.json
git commit -m "Finalize asset library release validation"
```

Skip this commit when no tracked file changed.
