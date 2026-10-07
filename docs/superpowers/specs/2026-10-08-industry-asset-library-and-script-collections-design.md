---
status: active
lifecycle_class: iterative-working-document
created: 2026-10-08
last_reviewed_at: 2026-10-08T00:00:00+08:00
last_used_at: 2026-10-08T00:00:00+08:00
---

# Industry Asset Library and Script Collections

## Decision

AMC Kanban will store each uploaded media asset once in one canonical industry folder. Semantic classification belongs in structured metadata and tags. A confirmed script creates a virtual collection whose shot requirements and assets are references, not copied files.

System-wide Token and AMC Credit optimization is explicitly outside this feature. It is tracked as a separate task and must not block this implementation.

## Goals

- Replace AI-generated dish and content-type subfolders with a small, stable industry folder template.
- Preserve dish, scene, people, capture type, OCR, quality, orientation, and other classifications as searchable metadata and tags.
- Create a virtual script collection as soon as a user confirms a script and waits for materials.
- Let users upload directly into that collection while retaining one canonical `MediaAsset` record and one stored original.
- Keep script references stable when AI later reclassifies the canonical asset.
- Reuse an existing asset for exact duplicate uploads and prevent duplicate references inside a collection.
- Migrate the Northeast Chinese Restaurant test library conservatively, with a preview and audit trail.

## Non-goals

- Redesigning system-wide model routing, Token optimization, or AMC Credit policy.
- Automatically deleting near-duplicate files.
- Inferring that every existing custom folder was AI-generated.
- Replacing human-created tags or manual asset placement without an explicit migration decision.

## Options considered

### A. Canonical folders plus tags plus virtual script collections — selected

This keeps the library understandable for people while preserving flexible AI retrieval. A script collection can reuse assets without copying records or objects.

### B. Flat library plus tags only

This minimizes directory management but makes the library harder to browse for merchants and operators.

### C. Many-to-many physical folders

This supports multiple folder memberships but obscures the canonical location and recreates the apparent-duplication problem.

## Canonical folder templates

Folders are selected by a stable template key derived from the brand industry. Display labels may be localized, but template keys and classification rules are stable. AI may select from the template; it may not create new canonical folder names.

The restaurant template contains:

1. Brand and storefront
2. Dishes and drinks
3. Store and environment
4. People and service
5. Preparation process
6. Events and atmosphere
7. Menu and pricing
8. Original video
9. Needs review
10. Not recommended

The first release also includes small templates for retail, service businesses, and a generic fallback. Each template follows the same constraints: few durable folders, no product-name or capture-type children, and reserved review/quality states.

Examples of data stored as tags or fields rather than folders:

- `dish:锅包肉`
- `scene:自助餐台`
- `person:customer`
- `capture:close_up`
- `orientation:vertical`
- `ocr:price`
- `risk:watermark`
- `quality:stable`

Generated tags must remain distinguishable from user tags so reanalysis only replaces system-owned values.

## Data model

### Canonical folders

`BrandFolder` remains the physical organization boundary. It gains stable metadata sufficient to distinguish system template folders from user-created folders:

- `systemKey`: nullable stable folder key, unique within a brand when present.
- `folderKind`: `STANDARD` or `CUSTOM`.
- `templateVersion`: nullable template revision.

`MediaAsset.folderId` is the canonical folder relationship. `aiCategory` remains synchronized during compatibility migration but is no longer the source of truth.

### Virtual script collections

Add `AssetCollection`:

- `id`, `brandId`, `kind`, `creativeId`, `creativeVersion`, `month`
- `name`, `status`, `createdById`, timestamps
- unique active identity for a brand and creative revision

Add `AssetCollectionSlot`:

- `id`, `collectionId`, stable `slotKey`, title, requirement text
- expected media/capture/subject tags, order, status
- represents a shot requirement and may exist before any upload

Add `AssetCollectionItem`:

- `collectionId`, `assetId`, optional `slotId`
- role, order, upload origin, timestamps
- unique `(collectionId, assetId)` so an asset cannot appear twice in one script collection

These records reference `MediaAsset`; they never duplicate media objects.

## Main flows

### Confirm script and wait for materials

1. The user confirms a script or moves it to waiting-for-materials.
2. Kanban creates or idempotently returns its virtual collection.
3. Structured shot/material requirements become collection slots.
4. The collection is immediately visible even when all slots are empty.

### Upload into a script collection

1. The upload carries `collectionId` and optional `slotId`.
2. The server validates brand access and that the slot belongs to the collection.
3. It computes the content hash before creating a durable asset record.
4. If an exact brand-scoped asset already exists, the server reuses it and creates only the collection reference.
5. Otherwise it creates one `MediaAsset`, initially in the standard needs-review folder, and one collection reference.
6. The upload succeeds independently of later visual analysis.

### Visual analysis and classification

1. The existing analysis worker produces subjects, capture type, OCR, quality, search text, duplicate hints, and segments.
2. A deterministic industry-template mapper chooses one canonical folder.
3. Specific dishes, products, scene types, and camera techniques become generated tags and structured fields.
4. The canonical folder may change; collection references do not.
5. AI folder-summary generation and dish-name child-folder creation are removed.

### Use one asset in multiple scripts

Each script receives its own `AssetCollectionItem` pointing to the same asset ID. Usage count and last-used time belong to the canonical asset. Removing a collection or reference does not remove the asset.

## Duplicate handling

- Exact duplicate: same brand and content hash reuses the canonical asset and analysis result.
- Repeated reference: unique collection constraint makes the request idempotent.
- Near duplicate: `duplicateGroupId` groups candidates for review; no automatic deletion or analysis-result copying occurs.
- Cross-brand files are never deduplicated into a shared asset record.
- Physical-object cleanup is not part of the first migration; no stored object is deleted without a separately verified lifecycle.

## Compatibility and APIs

- Existing asset upload endpoints accept optional collection and slot identities.
- Existing creative uploads using `creativeId` are translated into the corresponding virtual collection.
- Asset search reads canonical folder, structured fields, tags, and collection references.
- Existing draft `ContentAssetRef` continues to represent assets selected for a produced draft. It is not reused for pre-production script collections because it requires a `ContentDraft`.
- Folder management exposes standard folders as non-deletable/non-renamable and custom folders as user-managed.

## Northeast Chinese Restaurant migration

Migration runs in preview and apply phases.

Preview:

- Seed the restaurant template without moving assets.
- Identify AI-created child folders under recognized standard parents.
- Propose canonical folder moves and generated tags based on folder lineage plus current analysis evidence.
- Report affected assets, exact duplicates, unresolved folders, and folders that would become empty.
- Preserve user-created or ambiguous folders as custom.

Apply:

- Move approved assets to canonical folders.
- Add generated classification tags without overwriting user tags.
- Create collection references for known creative-linked assets.
- Remove only empty folders proven to have been AI-created; otherwise leave them for review.
- Write an audit record containing the preview digest and applied counts.

Rollback restores prior folder IDs and generated-tag state from the migration audit. It never recreates or deletes media objects.

## Permissions and safety

- Anyone with existing brand asset access may view standard folders and script collections.
- Existing content-edit authorization controls script confirmation, slot edits, uploads, and collection membership.
- Folder and collection identities are always brand-scoped.
- Upload, collection linking, and exact-dedup decisions are transactional and idempotent.
- User-edited captions, tags, and folder placement survive concurrent analysis.

## Failure behavior

- Analysis unavailable: upload and collection reference remain successful; the asset stays in needs review.
- Script changed: create/update slots by stable keys and keep unmatched assets in an unassigned section of the same collection.
- Collection removed: delete references and slots only.
- Exact duplicate found after upload: converge to one canonical asset and preserve every valid collection reference; do not silently delete the uploaded object in the first release.
- Migration ambiguity: report it and skip the asset or folder.

## UI behavior

- The asset library shows `Standard folders`, `Script collections`, and optional `Custom folders` as separate groups.
- Script collections show empty requirement slots, uploaded assets, missing counts, and assets reused from the library.
- An asset detail view shows its canonical folder, generated/user tags, duplicate group, and every script that references it.
- Moving the canonical asset does not visually remove it from script collections.

## Testing and release evidence

Required automated coverage:

- industry template selection and deterministic mapping
- analysis never creates dish/product child folders
- generated tags preserve user tags
- script confirmation idempotently creates slots and one collection
- upload creates one asset plus one collection reference
- exact duplicate upload reuses the asset and analysis
- one asset can serve multiple collections without copies
- reference deletion preserves the asset
- standard folder protection and custom folder behavior
- concurrent upload, classification, and script-edit conflict handling
- migration preview/apply/rollback and audit digest
- brand authorization and cross-brand isolation

Release validation must distinguish local checks, remote synchronization, deployment state, and authenticated production proof. The Northeast Chinese Restaurant migration remains preview-only until its report is explicitly approved.
