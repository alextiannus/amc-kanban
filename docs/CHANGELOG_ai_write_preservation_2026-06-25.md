# CHANGELOG: AI Write Content & Tag Generation with Image, Brand Context and Platform Preservation

**Date**: 2026-06-25  
**Author**: Antigravity (AI Coding Assistant)  
**Status**: Completed & Verified  

---

## 1. Overview
The user requested that when the AI writer ("AI 创作" or "AI 重新创作") is triggered:
1. It should only generate/re-write the post caption and tags (hashtags) based on the theme, prompt, or attached images, but **must not touch or overwrite the attached images (mediaUrls)** and **must not modify other parts of the post** (such as status, account, or scheduled time).
2. It must **always load the complete brand context** (brand metadata and folder-based documents/memory logs) and **apply platform-specific formatting and copywriting rules** (RED, Instagram, TikTok, Facebook, GBP) during each creation.
3. If there are **no attached images or videos**, the copywriter should prompt the user to first select images or videos. If there are attached images and videos, the copywriter should read the relevant information to avoid image-copy mismatch ("图不对文").

---

## 2. Technical Architecture & Solutions

### 2.1 State Flow Protection
We added two boolean fields to the LangGraph `StateAnnotation` in `src/agents/state.ts`:
- `copywriteOnly`: Indicates whether the agent workflow is running in copywriting-only mode (triggered via UI editor buttons).
- `mediaFromDraft`: Tracks whether the media files in the state originated from a pre-existing draft.

### 2.2 Missing Media Safety Check
In `src/agents/nodes/copywriter.ts`, if the execution corresponds to a user-triggered draft (`existingDraftId` is present) and the draft has no attached media (`draftMediaUrls.length === 0`):
- Updates the draft caption to `"【AI 提示：请先选择或上传配图/视频再进行 AI 创作】"`.
- Pauses the Kanban task by updating `WorkUnit` to `pending` status and writing a clear requirement prompt: `"【AI 创作提醒】未检测到配图或视频。请先在草稿中选择或上传配图/视频，然后再点击 AI 创作。"`.
- Suspends the agent workflow immediately and returns status `pending`.

### 2.3 Image Metadata & Alignment Rules
In `src/agents/nodes/copywriter.ts`, if attached media is present:
- Queries the `MediaAsset` table to retrieve labels (`aiTags`), visual description (`aiCaption`), and categorizations (`aiCategory`).
- Injects this descriptive metadata into the Gemini prompt as visual context.
- Adds a strict instruction constraint under prompt instructions: *"Alignment with Images: You MUST analyze the details of the attached images provided above. Ensure the caption's description matches the visual contents of the images (e.g., if the image shows a specific flavor of food or reformer pilates movement, describe exactly that; do not write about steak if the image shows a burger). Avoid generic filler copy."*

### 2.4 Brand Context and Memory Loading
Implemented recursive file reading in `src/agents/nodes/copywriter.ts`:
- **Brand Metadata**: Loads `website`, `phone`, `address`, and `location` parameters from the brand profile database record.
- **Brand Documents**: Recursively reads files in `documents/[brandSlug]/**/*.*` to capture custom guidelines and target audience instructions.
- **Brand Memory**: Reads up to 5 of the most recent memory files in `memory/[brandSlug]/*.md` to apply past feedback and learnings.

### 2.5 Platform-Specific Rules Injection
Added explicit copywriting constraints in `src/agents/nodes/copywriter.ts` tailored to each social network:
- **小红书 (RED)**: Dictates visual titles, high emoji frequency, and sisterly/brotherly recommendation tone.
- **Instagram**: Guides clean aesthetic spacing, English/Chinese bilingual or Singlish localizations, and visual-oriented CTAs.
- **TikTok**: Requires short caption lengths and synchronous video script layout prompts.
- **Facebook**: Specifies informative paragraph listing structures and direct clickable links.
- **Google Business Profile**: Enforces professional update framing and **strict zero-hashtag** compliance.

### 2.6 Node Flow Preservation
- **`coordinatorNode` (`coordinator.ts`)**: Resolves the `draftId` and pre-loads the existing draft's `mediaUrls` into the state.
- **`assetCuratorNode` (`assetCurator.ts`)**: Bypasses asset curation if `mediaUrls` are present or if `copywriteOnly` is true.
- **`designerNode` (`designer.ts`)**: Bypasses watermark overlays and cropping if `mediaFromDraft` or `copywriteOnly` is true.
- **`publisherNode` (`publisher.ts`)**: If `copywriteOnly` is true, updates *only* `caption` and `hashtags` of the draft and completes the task.

---

## 3. Verification & Test Results

### 3.1 Type Safety Checks
- Executed `npx tsc --noEmit` which completed successfully with **0 errors**.

### 3.2 Production Build
- Executed `npm run build` which succeeded in packaging all server and client files without compilation issues.

### 3.3 E2E Integration Test
- Ran `scripts/test_copywrite_preservation.mts` covering:
  - **Phase 1: Missing Media Warning**: Correctly suspended the graph, returned `Missing attached assets`, updated draft caption to the warning text, and set task status to `pending`.
  - **Phase 2: Success & Alignment**: Correctly generated caption/hashtags, preserved original media URL, kept draft status as `draft`, and marked task as `done`.
  - **Outcome**: `SUCCESS: E2E COPYWRITING PRESERVATION TEST PASSED`.
