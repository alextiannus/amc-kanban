# Changelog - Creative Hooks Support & Copywriter Alignment (2026-06-26)

## Overview
Optimized the AI copywriter node's compliance and theme alignment by strongly forcing the LLM to follow the user's provided creative ideas. Added a new `creativeHooks` field to the draft model, API routes, and frontend editor panels (Draft Manager and Calendar) to enable users to save and persist specific creative writing hooks or angles.

---

## Changes

### 1. Database Schema
- **Modified**: [schema.prisma](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/prisma/schema.prisma)
  - Added `creativeHooks String?` to the `ContentDraft` model.
  - Successfully synced local PostgreSQL database via `npx prisma db push`.

### 2. Backend & Agent API Routes
- **Modified**: [route.ts (drafts list)](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/%5Bid%5D/drafts/route.ts)
  - Added `creativeHooks` to `DRAFT_SELECT`.
  - Stored `creativeHooks` in `POST` draft handler.
  - Appended `creativeHooks` details to automatically generated Kanban task descriptions.
- **Modified**: [route.ts (draft details)](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/%5Bid%5D/drafts/%5BdraftId%5D/route.ts)
  - Added `creativeHooks` to `DRAFT_SELECT`.
  - Updated draft `PATCH` endpoint to allow editing `creativeHooks`.
- **Modified**: [route.ts (agent action items)](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/agent/action-items/route.ts)
  - Stored `creativeHooks` in agent-triggered draft creation.
- **Modified**: [server.ts (MCP Server)](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/partner/mcp/server.ts)
  - Added `creativeHooks` to the save/update draft tool schema and arguments.

### 3. AI Agent Logic
- **Modified**: [copywriter.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/nodes/copywriter.ts)
  - Retrieved `creativeHooks` from draft details or task descriptions.
  - Injected `creativeHooks` and `userPrompt` into LLM prompts.
  - Added a `CRITICAL REQUIREMENT` section to both hook generation and body copywriting instructions, strictly instructing the LLM to structure content based on the provided creative prompt and writing hooks instead of generating generic copy.

### 4. Frontend UI Components
- **Modified**: [DraftManagementView.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DraftManagementView.tsx)
  - Added `creativeHooks` state and reset logic.
  - Added visual text area labeled `创意 hooks (Creative Hooks)` directly below the `内容创意 / 生成指令` input.
  - Updated API `PATCH` and `POST` calls to send the `creativeHooks` parameter.
- **Modified**: [DashboardCalendar.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DashboardCalendar.tsx)
  - Added `creativeHooks` state, reset logic, and form text area in calendar sidebar.
  - Enforced saving `creativeHooks` in payloads.
  - Set social media channels to be default-selected (all channels selected) on opening draft creation.

---

## Update - Copywriter Alignment Bug Fixes & UX Optimization

### 1. Copywriter Original Theme Preservation
- **Issue**: The API route `/api/brands/[id]/drafts/[draftId]/trigger-copywriter` updated the draft caption to `【AI 正在创作中...】` before starting the workflow, which erased the user's custom theme from the database before the copywriter agent could read it.
- **Solution**: 
  - Modified [trigger-copywriter/route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/%5Bid%5D/drafts/%5BdraftId%5D/trigger-copywriter/route.ts) to capture the original caption as `originalCaption` and pass it to `marketingGraph.invoke` under the state's `caption` property.
  - Updated [copywriter.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/nodes/copywriter.ts) to fall back and read `state.caption` if `userPrompt` is empty, ensuring custom themes are preserved.
  - Updated the draft editor UI in [DraftManagementView.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DraftManagementView.tsx) to automatically call `saveDraft()` first before triggering `triggerCopywriter()`, ensuring the latest user edits to the text areas are saved before generation starts.

### 2. Robust API Key Fallback
- **Issue**: If there was an `LLMConfig` record in the database for a provider but its `apiKey` was empty/invalid, the router did not check system settings/environment variables, causing API key missing routing failures.
- **Solution**: Updated [llmRouter.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/llmRouter.ts) key resolution logic to robustly fall back to globally configured system config keys (`SystemConfig.geminiApiKey`) or environment variables if the matched config's key is empty.

### 3. LLM Token & Quota Error Bubbling
- **Solution**:
  - Updated [llmRouter.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/llmRouter.ts) to detect specific API status codes (e.g. 429 quota limit, 400 bad requests/token limit) and bubble them up in `LLMCallResult.error`.
  - Updated [copywriter.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/nodes/copywriter.ts) fallback logic to prepends a warning header banner (e.g. `【⚠️ AI 智能写作未成功：Gemini API quota/token limit exceeded (Rate limit / 429). Please check your billing or limit settings.】`) to the generated rules-based template so users are immediately alerted.

### 4. Default Social Media Selection
- **Solution**: Modified [DraftManagementView.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DraftManagementView.tsx) and [DashboardCalendar.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DashboardCalendar.tsx) to initialize selected channels (`selectedAccountIds`) to default select all available platform accounts (`accounts.map(a => a.id)`) during draft creation.

