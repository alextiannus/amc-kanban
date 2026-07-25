# WorkUnit Dependency Audit

Date: 2026-07-25 (second-pass scan: 2026-07-26)

## Purpose

This document is the phase 1 audit for removing the old Kanban task / AI lane architecture.
It does not propose immediate deletion of core backend code. Its job is to map the remaining
`WorkUnit`, `/api/tasks`, `marketingGraph`, and legacy Agent workflow dependencies so the next
cleanup phase can migrate safely.

## Target Architecture

New AMC operation flows should use:

- `ContentDraft` for content creation, review, scheduling, publishing, and rewrite state.
- `ActionItem` for human review, missing materials, business decisions, alerts, and approvals.
- `MediaAsset` for asset library work.
- `Review`, `SocialAccount`, `PostFastSnapshot`, and related business resources for platform state.
- `AuditLog` with explicit `resourceType` values for each business resource.
- `workStage` or equivalent log metadata only as a log filter, not as a task board model.

`WorkUnit`, task dependencies, task comments, and task status transitions should become historical
compatibility only, then be removed after all new writes are migrated.

## Current WorkUnit Model Surface

The Prisma schema still contains the old task model:

| Model / relation | Current role | Removal condition |
| --- | --- | --- |
| `WorkUnit` | Old task card / lane item with status, priority, assignee, materials, required input, tags, and brand scope. | No API route, report, log, ActionItem, draft flow, Agent detail, or test creates or reads it for current behavior. |
| `TaskDependency` | Old task blocking graph. | `/api/tasks/[id]` status dependency checks are removed or replaced. |
| `Comment` | Old task comments. | `/api/tasks/[id]/comments` is removed or archived. |
| `User.tasksAsAssignee` | Used for Agent task assignment and online status heuristics. | Agent online/status logic is no longer derived from WorkUnit count. |
| `Brand.tasks` | Brand scoped task list. | Brand dashboards, logs, reports, and usage exports no longer query brand WorkUnits. |
| `AuditLog.resourceType @default("WorkUnit")` | Default still assumes task resources. | All audit writers pass explicit resource types and the schema default is changed or removed. |

## Remaining Runtime Entry Points

| Area | Files | Current behavior | Replacement target | Recommended action |
| --- | --- | --- | --- | --- |
| Public task API | `src/app/api/tasks/route.ts` | Lists, creates, archives, and filters `WorkUnit`; can invoke `marketingGraph` after creating tasks. | `ActionItem` and `ContentDraft` APIs. | Migrate callers, then delete route. |
| Task detail API | `src/app/api/tasks/[id]/route.ts` | Reads and patches `WorkUnit`; can invoke `marketingGraph` on task updates. | Business-resource-specific PATCH routes. | Remove after task UI/API callers are gone. |
| Task status API | `src/app/api/tasks/[id]/status/route.ts` | Applies task status transitions and dependency checks. | `ActionItem.status` / `ContentDraft.status` transitions. | Replace dependency logic or delete if unused. |
| Task comments API | `src/app/api/tasks/[id]/comments/route.ts` | Stores comments against `WorkUnit`. | `ActionItem` notes or draft review comments. | Delete once old task detail page/API is gone. |
| Retry publish API | `src/app/api/tasks/[id]/retry-publish/route.ts` | Retries publish through the old task route and logs `WorkUnit`. | Draft publish retry from calendar/draft management. | Replace with draft-level retry route. |
| Unassigned task API | `src/app/api/tasks/unassigned/route.ts` | Old task-assignment helper. | Assignment pool / brand-agent binding, if still needed. | Likely delete after checking callers. |
| Archive UI | `src/components/ArchiveView.tsx` | Fetches `/api/tasks?archive=true`. | Draft/archive or ActionItem history. | Candidate for deletion or rewrite. |
| System log filter | `src/components/layout/SystemLogModal.tsx` | Includes `WorkUnit` as resource filter option. | Resource-specific filters. | Remove `WorkUnit` option after log migration. |
| **Dashboard summary API** ⚠️ NOT IN PHASE 1 DOC | `src/app/api/dashboard/summary/route.ts` | Groups, counts `WorkUnit` by agent and brand for summary stats. **No active frontend caller found after KanbanBoard cleanup** (`fetchSummary` was removed). | Remove route entirely. | Confirm no external caller; safe to delete with Group C. |
| **Document sync route** ⚠️ NOT IN PHASE 1 DOC | `src/app/api/brands/[id]/documents/[docId]/sync/route.ts` | Creates a `WorkUnit` with status `done` when a brand document is synced; emits `board_update`. | Replace with an `AuditLog` write only, no WorkUnit creation. | Low risk; remove WorkUnit creation in isolation. |
| **Content context API** ⚠️ NOT IN PHASE 1 DOC | `src/app/api/internal/content-context/route.ts` | Optionally reads a `WorkUnit` by `taskId` to populate `briefDefaults.theme` when called by `amc-content`. | Pass theme/brief from `ContentDraft` or brand knowledge directly; stop accepting `taskId`. | Blocked on amc-content integration; coordinate with content service. |

## ActionItem Dependencies

| File | Current dependency | Risk | Migration |
| --- | --- | --- | --- |
| `src/app/api/agent/action-items/route.ts` | Creates an `ActionItem`, then always creates a linked `WorkUnit` tagged with `action_item:<id>`. | New Agent requests still create old task rows even though the UI no longer uses lanes. | Stop creating `WorkUnit`; store all required state on `ActionItem` and `ContentDraft`. |
| `src/app/api/brands/[id]/actions/[aid]/approve/route.ts` | Updates linked `WorkUnit` status during approval/publish outcomes. | Approval logic assumes old task status mirrors action-item resolution. | Update only `ActionItem`, `ContentDraft`, publish result, and audit log. |
| `scripts/test-postfast-flow.mts` | Asserts WorkUnit status transitions for ActionItem approval. | Tests encode old architecture. | Rewrite assertions around `ActionItem` and `ContentDraft` statuses. |

Recommended first code migration:

1. Add a feature-compatible path in `POST /api/agent/action-items` that does not create `WorkUnit`.
2. Update approval route to tolerate missing WorkUnit and prefer direct ActionItem/Draft updates.
3. Update `test-postfast-flow.mts` to assert ActionItem/Draft state.
4. Only then remove the old linked-WorkUnit write.

## ContentDraft / Copywriter Dependencies

| File | Current dependency | Risk | Migration |
| --- | --- | --- | --- |
| `src/app/api/brands/[id]/drafts/[draftId]/trigger-copywriter/route.ts` | Finds or creates an associated `WorkUnit`, then invokes `marketingGraph`. | Draft rewrite/generation can still depend on old graph execution. | Route generation through `amc-content` or the current draft generation service directly. |
| `src/lib/amc-content/contentGenerationService.ts` | Falls back to importing `copywriterNode` from `src/agents/nodes/copywriter.ts`. | `copywriterNode` remains pinned to legacy graph assumptions. | Remove fallback after amc-content remote/local path is reliable. |
| `src/components/dashboard/DashboardAssets.tsx` | Comments explicitly say the draft itself is the work item, not WorkUnit. | This is aligned with target design. | Keep; remove any old comments only if they become stale. |

Recommended migration:

1. Make draft-trigger copywriter use `createPlatformContent` / `amc-content` directly.
2. Remove any `WorkUnit` creation from draft trigger routes.
3. Remove `copywriterNode` fallback from `contentGenerationService` once output parity is acceptable.

## Marketing Graph and Agent Nodes

| Module | Current callers | Current role | Recommendation |
| --- | --- | --- | --- |
| `src/agents/graph/marketingGraph.ts` | `/api/tasks`, `/api/tasks/[id]`, `trigger-copywriter`, `copywriterScheduler`, scripts. | Old LangGraph pipeline: coordinator, researcher, strategist, copywriter, asset curator, designer, compliance, publisher. | Delete after all runtime callers are migrated. |
| `src/agents/nodes/copywriter.ts` | `marketingGraph`, `contentGenerationService` fallback. | Legacy copywriter path. | Migrate fully to amc-content, then delete. |
| `src/agents/nodes/designer.ts` | `marketingGraph`, designer test scripts. | Legacy graph design step. | If design generation is still useful, expose as a focused asset service, not graph node. |
| `src/agents/nodes/researcher.ts` | `marketingGraph`. | Legacy graph researcher step. | Prefer amc-growth / research topic feeds; likely delete with graph. |
| `src/agents/nodes/strategist.ts` | `marketingGraph`. ⚠️ **NOT IN PHASE 1 DOC** | Reads `WorkUnit.findUnique` to load task context for strategy. | Delete with graph. |
| `src/agents/nodes/assetCurator.ts` | `marketingGraph`. | Updates WorkUnit to pending when input is needed. | Delete with graph or rewrite to ActionItem if still needed. |
| `src/agents/nodes/publisher.ts` | `marketingGraph`. | Publishes and updates WorkUnit to done. | Replace with draft/calendar publish flows. |
| `src/agents/cli.ts` | Manual graph runner. | Old WorkUnit/graph debug CLI. | Delete with marketingGraph. |
| `src/agents/checkpointer.ts` | marketingGraph persistence. | Graph checkpointing. | Delete if no other graph uses it. |

## Scheduler Dependencies

| Module | Observed state | Recommendation |
| --- | --- | --- |
| `src/lib/copywriterScheduler.ts` | Imports `marketingGraph` and triggers it for TODO WorkUnits. No active `startCopywriterScheduler` caller was found in `src`, `scripts`, or `package.json` during this audit. | Candidate for direct deletion after one more full-repo caller scan. |
| `src/lib/researcherScheduler.ts` | Defines `startResearcherScheduler`; no active caller found in the scanned paths. | Candidate for direct deletion after confirming production startup does not import it elsewhere. |
| `src/agents/nodes/scheduler.ts` | Used by `/api/scheduler/daily-check`; produces scheduler reports and ActionItem-style alerts. | Keep for now; not part of old lane UI, though output wording should avoid task-card assumptions. |
| `src/components/admin/SchedulerPanel.tsx` | Calls scheduler report/check APIs. | Keep if scheduler reports remain useful. |

## Agent Detail and Online Status Dependencies

| Area | Current dependency | Risk | Migration |
| --- | --- | --- | --- |
| `src/app/agents/[id]/page.tsx` | Shows `tasksAsAssignee` and old task status details. | UI page survives after sequence/lanes are removed. | Delete or replace with a simple credential/brand binding page. |
| `src/app/api/agents/[id]/route.ts` | Includes `tasksAsAssignee`. | API exposes old task-derived detail. | Remove task include after `/agents/[id]` is deleted or rewritten. |
| `src/app/api/agents/route.ts` | Uses `tasksAsAssignee.length` as `isOnline`. | Online status is really task-load proxy. | Replace with API key heartbeat, recent audit log, or lastUsedAt. |
| `src/app/api/profile/principal-dashboard/route.ts` | Uses `tasksAsAssignee` for `isOnline`; current scan shows this is concentrated in four spots: two Prisma includes and two `isOnline` calculations. | Principal dashboard still reports task-derived online state. | Remove all four references in one migration; use last activity or remove online indicator. |
| `src/app/profile/principal/page.tsx` | Uses fetched `tasksAsAssignee` when opening agent detail modal. | Keeps old task detail coupling. | Remove task dependency from modal details. |
| `src/app/profile/principal/brands/[id]/page.tsx` | Links to `/agents/:id`. | Keeps old Agent detail page reachable. | Change to inline brand-agent details or no link. |

## Logs and Analytics Dependencies

| File | Current dependency | Migration |
| --- | --- | --- |
| `src/app/api/logs/agent/route.ts` | Queries `WorkUnit` IDs and formats `STATUS_CHANGED` descriptions around task status. | Keep historical WorkUnit logs readable, but add direct support for `ActionItem` / `ContentDraft` statuses and stop requiring WorkUnit joins. |
| `src/components/dashboard/AgentLogsView.tsx` | Status filter labels are old task statuses (`todo`, `in_progress`, `pending`, `done`, `void`) — **confirmed in second-pass scan (lines 20–24)**. | Replace with work-stage or business-resource filters. |
| `src/app/api/analytics/activity/route.ts` | Includes `resourceType: 'WorkUnit'`. | Replace with direct resource aggregation. |
| `src/app/api/analytics/agents/[id]/weekly/route.ts` | Includes `resourceType: 'WorkUnit'`. | Replace with ActionItem/Draft activity. |
| `src/lib/audit.ts` | Defaults `resourceType` to `'WorkUnit'` (line 35). **This is a Phase 4 compile-time gate**: making it required will surface all callers that omit the field. | Make `resourceType` required in `AuditInput` type; remove the `?? 'WorkUnit'` fallback. Do this in Step 4a before deleting routes. |
| `src/components/layout/SystemLogModal.tsx` | Offers WorkUnit filter. | Remove after log route stops treating WorkUnit as primary. |

## Usage Report Dependencies

| File | Current dependency | Migration |
| --- | --- | --- |
| `src/app/api/brands/[id]/usage-report/route.ts` | Counts completed WorkUnits and joins WorkUnit audit logs. | Replace `workflowTasksCompleted` with counts from `ContentDraft`, `ActionItem`, published posts, asset operations, review replies, and scheduler reports. |

This should be migrated before deleting the Prisma model because reports may be customer-facing evidence.

## MCP Compatibility Dependencies

> **⚠️ SECOND-PASS CORRECTION**: The phase 1 doc only listed `create_require_input_task`. The full
> WorkUnit exposure in `mcp/server.ts` is significantly larger — five active tools plus internal helpers.

| File | Tool / dependency | Current behavior | Migration |
| --- | --- | --- | --- |
| `src/lib/partner/mcp/server.ts` | `list_tasks` | Queries `WorkUnit.findMany` filtered by brand/status/agent. Live Agent tool. | Migrate to `board_list_drafts` / ActionItem query, then remove. |
| `src/lib/partner/mcp/server.ts` | `create_task` | Creates a `WorkUnit` directly. Still in active MCP tool set. | Deprecate: agents should use `post_action_item` for human-review items and `board_save_draft` for content. |
| `src/lib/partner/mcp/server.ts` | `update_task` | Patches `WorkUnit` status, description, etc. | Remove after callers migrate. |
| `src/lib/partner/mcp/server.ts` | `delete_task` / `board_delete_task` | Deletes `WorkUnit`. | Remove after task model is gone. |
| `src/lib/partner/mcp/server.ts` | `create_require_input_task` | Creates `WorkUnit` tagged with `source: create_require_input_task`. Marked deprecated in agentInitPrompt but not yet removed. | Mark deprecated in tool description; add `post_action_item` as canonical path; remove after clients migrate. |
| `src/lib/partner/mcp/server.ts` | `requireOwnedTask()` internal helper (line ~72) | `WorkUnit.findFirst` ownership check used by update/delete tools. | Remove with the tools above. |
| `scripts/test-v2-flow.mts` | Tests `create_require_input_task`. | Update to `post_action_item` / ActionItem assertions. |
| `docs/AGENT_CONNECTIVITY.md`, `docs/API_SERVICES.md`, `docs/prd_amc.md` | Already describe WorkUnit as compatibility or removal target. | Keep as source of truth; update when routes are actually deleted. |

## Test and Script Dependencies

These encode old behavior and should be rewritten or deleted alongside code changes:

- `scripts/test-api.mts` task API tests.
- `scripts/verify-permissions.mjs` task permission tests.
- `scripts/test-postfast-flow.mts` WorkUnit transition assertions.
- `scripts/test-v2-flow.mts` `create_require_input_task`.
- `scripts/test_designer_flow.mts`, `scripts/test_hil_flow.mts`, `scripts/test_asset_curator_flow.mts`, `scripts/test_copywrite_preservation.mts` marketingGraph tests.
- `scripts/list-tasks.mts`.

## Candidate Deletion Groups

### Group A: Low Risk After One More Caller Scan

- `src/lib/copywriterScheduler.ts`
- `src/lib/researcherScheduler.ts`
- `scripts/list-tasks.mts`

Reason: no active caller was found in the scanned runtime paths, and they reference old WorkUnit / graph behavior.

Before deleting Group A, rerun a full caller scan:

```bash
rg -rn "startCopywriterScheduler|startResearcherScheduler|copywriterScheduler|researcherScheduler" src/ prisma/ scripts/
```

### Group B: Medium Risk, Requires Route Migration

- `src/app/agents/[id]/page.tsx`
- task-derived fields in `src/app/api/agents/[id]/route.ts`
- task-derived `isOnline` in `src/app/api/agents/route.ts`
- Agent detail links in `src/app/profile/principal/brands/[id]/page.tsx`

Reason: still reachable from principal brand pages.

### Group C: High Risk, Requires Behavior Migration

- `src/app/api/tasks/*`
- `src/agents/graph/marketingGraph.ts`
- `src/agents/nodes/copywriter.ts`
- `src/agents/nodes/assetCurator.ts`
- `src/agents/nodes/designer.ts`
- `src/agents/nodes/publisher.ts`
- `src/agents/nodes/researcher.ts`
- `src/agents/cli.ts`
- `src/agents/checkpointer.ts`
- Prisma `WorkUnit`, `TaskDependency`, and task `Comment` models.

Reason: still involved in ActionItem approval, draft generation, reports, logs, and tests.

## Recommended Phase 2 Order

1. **Stop new ActionItem-linked WorkUnit writes**
   - Change `/api/agent/action-items` to create only `ActionItem` and optional `ContentDraft`.
   - Make action approval tolerate missing WorkUnit.
   - Rewrite `test-postfast-flow.mts`.

2. **Remove task-derived Agent detail and online status**
   - Delete or rewrite `/agents/[id]`.
   - Remove `tasksAsAssignee` from Agent APIs (4 occurrences in `principal-dashboard/route.ts` alone).
   - Replace `isOnline` with last API key usage or recent audit activity.

3. **Move draft trigger-copywriter off marketingGraph**
   - Use amc-content content generation directly.
   - Remove WorkUnit creation in draft trigger route.
   - Remove `taskId` parameter from `internal/content-context` once amc-content no longer sends it.

4. **Migrate logs and usage reports**
   - **Step 4a**: Make `src/lib/audit.ts` `resourceType` required in the `AuditInput` type (remove `?? 'WorkUnit'` default). Run typecheck to surface all callers that omit the field — fix them all before proceeding.
   - Update logs and report aggregations to ActionItem/Draft/etc.
   - Replace `workflowTasksCompleted` in usage report with ContentDraft/ActionItem counts.
   - Remove WorkUnit option from `SystemLogModal.tsx` and `AgentLogsView.tsx` status filters.

5. **Deprecate and remove MCP WorkUnit task tools** ⚠️ *Added in second-pass*
   - Mark `list_tasks`, `create_task`, `update_task`, `delete_task`, `board_delete_task`, and `create_require_input_task` as deprecated in their tool descriptions.
   - Add a migration notice pointing agents to `board_list_drafts`, `post_action_item`, and `board_save_draft`.
   - Coordinate Agent client migration window before removal.
   - Remove all six tools and the `requireOwnedTask` helper once clients have migrated.
   - Remove WorkUnit creation from `brands/[id]/documents/[docId]/sync` (low-risk, standalone change).

6. **Delete task API and marketingGraph**
   - Remove `/api/tasks/*` and `dashboard/summary` (now has no active frontend caller).
   - Remove graph, graph nodes (including `strategist.ts` not listed in phase 1 doc), graph CLI, and graph tests.

7. **Prisma schema cleanup**
   - Drop `WorkUnit`, `TaskDependency`, task comments, and task relations only after production data retention/export decisions are made.

## Validation Checklist for Each Cleanup PR

Run:

```bash
rg -n "WorkUnit|/api/tasks|create_require_input_task|marketingGraph|tasksAsAssignee|list_tasks|create_task|update_task|delete_task|board_delete_task" src prisma scripts
git diff --check
npm run typecheck
```

For route-level migrations, also run or update:

```bash
npm run build
```

Manual smoke checks:

- `/board`
- `/admin`
- `/admin/content-lab`
- `/admin/ai-roles`
- `/profile`
- `/profile/principal`
- `/profile/principal/brands/[id]`
- Draft generation / rewrite
- Draft approval / publish
- ActionItem creation / approval
- Work logs
- Usage report export
- Agent register/profile API
- Agent MCP: `post_action_item`, `board_save_draft`, `board_list_drafts` (verify replacing old task tools)

## Current Decision Summary

- Do not delete WorkUnit schema in phase 1.
- Do not delete Agent API authentication and brand binding.
- Keep `src/app/admin/content-lab/page.tsx` as the amc-content SSO handoff.
- Treat `/api/tasks/*`, `marketingGraph`, and WorkUnit writes as the main cleanup target for phase 2.
- **Second-pass additions**: MCP has 5+ WorkUnit task tools (not just `create_require_input_task`); `strategist.ts` node and 3 additional routes (`dashboard/summary`, `documents/[docId]/sync`, `internal/content-context`) were missing from phase 1 doc and must be included in the cleanup scope.
