# CHANGELOG - Brand Owner Portal Database Data Integration

**Date**: 2026-06-25

---

## 1. Context & Objectives

To fulfill the requirement that all frontend views, subpages, and interactive controls in the Brand Owner Portal (`/dashboard/brand-owner`) retrieve and persist real and accurate data rather than displaying mock fallbacks:
- We audited the subpages: Marketplace Add-ons and AI Settings (Brand Voice Style & Slang Dictionary).
- We implemented real database storage models via PostgreSQL/Prisma (`BrandSubscription`, `BrandKnowledge`).
- We updated API endpoints to support retrieving and persisting these configurations dynamically.

---

## 2. Technical Decisions & Implementations

### A. AI Character Voice & Slang Dictionary Settings
- **Endpoint Created**: `GET /api/brands/[id]/knowledge` & `PATCH /api/brands/[id]/knowledge`.
  - **GET**: Resolves the `BrandKnowledge` model for the active brand. Returns a default template if not yet initialized in the database.
  - **PATCH**: Updates/Upserts `brandTone` and `slangDict` (stored as JSON) into `prisma.brandKnowledge`.
- **UI Refactoring**:
  - Bound the **Brand Voice Style** textarea dynamically to the database `brandTone` field.
  - Replaced the hardcoded, static list of slang entries in the settings drawer with an interactive **Slang Dictionary Manager**.
  - Users can now dynamically view existing term mappings, add new terms with definitions inline, delete mappings, and click **Save AI Instructions** to persist changes back to the database.

### B. Add-on Services Marketplace Toggles
- **Endpoint Updated**: `GET /api/brands/[id]/subscription` & `PATCH /api/brands/[id]/subscription`.
  - **GET**: Exposes the `selectedAddons` (JSON) associated with the brand's active subscription.
  - **PATCH**: Receives selected addons (e.g., `{ veo3: boolean, dubco: boolean }`) and updates the active subscription.
  - **Resilience Mechanism**: If a brand does not yet have an active subscription (e.g., in a newly set up development environment), the PATCH handler automatically provisions a default active **Essential Plan** subscription in the database, allowing subsequent addon selections to proceed and persist seamlessly.
- **UI Refactoring**:
  - The marketplace checkboxes (`Veo3 Image-to-Video` and `Dub.co ROI tracking`) now load their state dynamically from the database and trigger PATCH requests on click to save the changes in the database.

---

## 3. Verification

- **Typescript Compilation**: Completed cleanly without any errors.
- **Integration Tests**: Booted local dev server and ran integration checks. All workflow endpoints and mock validations passed successfully.

---

## 4. Calendar Brand Switcher & Channel Warning Updates

**Date**: 2026-06-25

To allow brand owners to view all their brands on the publishing calendar page and receive alerts when configurations are incomplete:
- **Retrieve All Brands**: Fetched the complete brand list from `/api/brands` on component mount.
- **Interactive Switcher**: Added a "我的品牌 (My Brands)" list to the Left Sidebar of the calendar. Clicking any brand updates the local `activeBrandId` state, dynamically reloading the calendar events, drafts, and active channel details.
- **Channel Warnings**: For each brand, checked the configured `accounts` length. If a brand has no channels configured, the prompt `⚠️ 缺失渠道配置` is displayed underneath the brand name in red font, alerting the owner to complete channel configuration.

