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
