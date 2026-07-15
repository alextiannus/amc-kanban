# Changelog - Brand Story & Tagline Saving Fixes

**Date**: 2026-07-15  
**Author**: Antigravity  
**Status**: Completed & Deployed  

---

## Background & Problem Statement

Users reported that brand story and tagline updates (stored in the `description` column of the `Brand` model) were not saving properly.
1. In `amc-mm` (the mobile merchant app), saving a brand story update sent a `PATCH` request to `/api/brands/[id]` containing the updated description, but the local React state `activeBrand` was never updated. This caused the UI to continue displaying the old tagline and description.
2. In `amc-kanban` (the back-office operations platform), editing the brand profile markdown file directly in the embedded markdown editor saved the file on disk, but did not synchronize the parsed description back to the database. Consequently, subsequent automated system refreshes of the brand profile markdown file (`refreshBrandProfileMarkdown`) would read the old database tagline/description and overwrite the user's manual changes.

---

## Technical Design & Solution

### 1. Markdown-to-Database Synchronization (amc-kanban)
- Implemented `parseDescriptionFromMarkdown(markdown: string): string | null` in `brandProfileMarkdown.ts` to locate the `## 2. 品牌介绍（来自系统字段 description）` section and extract the user-edited text.
- Integrated this parser into `PATCH /api/brands/[id]/profile` (`profile/route.ts`). Upon saving the markdown, it extracts the description and updates the database `Brand.description` column, guaranteeing alignment between the markdown file and the database.

### 2. Frontend State Propagation (amc-kanban)
- Modified `BrandProfileView.tsx` to accept an `onUpdate` prop callback.
- Invoked `onUpdate` with the updated brand object after successful basic brand info saves and markdown profile saves.
- Connected the `onUpdate` callback in `KanbanBoard.tsx` to immediately update `activeBrand` state and the master `brands` list, updating UI components like `BrandHeroCard` without page reloads.

### 3. Immediate State Update on Save (amc-mm)
- Updated the save handler in `BrandOwnerDashboard.tsx` to read the returned JSON from the `PATCH /api/brands/[id]` endpoint and immediately call `setActiveBrand(updatedBrand)`. This ensures that the merchant portal updates its view of the tagline and description immediately upon saving.

### 4. Dynamic Tagline Rendering & Auto-save Slang Terms (amc-mm)
- Fixed a bug in `BrandStorySubPage.tsx` where the brand's tagline in the hero banner was hardcoded to `“传承经典美味，主理本地生活印记”`. Implemented dynamic extraction: it now extracts and displays the first sentence of the brand's database description, defaulting to the placeholder only if no description exists.
- Addressed a UX issue where typed slang terms (in the slang dictionary input fields) were lost if the user clicked "Save" without first clicking the `+ Add` button. The save handler in `BrandOwnerDashboard.tsx` now automatically appends any pending slang key/value input to the saved dictionary.

---

## Verification & Deployment
- Validated tagline extraction logic via a dedicated test script (`test-extraction.ts`), ensuring accuracy with multi-line text and custom markdown structures.
- Confirmed that both `amc-kanban` and `amc-mm` compile cleanly via TypeScript compiler check (`npx tsc --noEmit`).
- Committed all modifications and successfully pushed to the production branch (`origin/main`) for both repositories.
