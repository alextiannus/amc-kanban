<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:system-config-rules -->
# API Key & Model Configuration - database-backed Admin configuration

AI model credentials MUST use encrypted ModelConnection versions and ModelCatalogEntry through the single /admin model management interface. LLMConfig is a migration input and historical-job compatibility source after central activation.
Do not add AI keys to Render environment variables or legacy SystemConfig fields.
Reuse /api/admin/models, masked responses and AuditLog. Save edits to ModelManagementDraft with revision checks; only validated publication changes the active policy.
Other third-party service credentials use their existing database-backed settings.
Infrastructure secrets (DATABASE_URL, session secrets and OBS credentials) retain their existing configuration.

<!-- END:system-config-rules -->

<!-- BEGIN:file-storage-rules -->
# File Storage Developer Guidelines (Huawei OBS / OSS)

To prevent `403 Forbidden` (SignatureDoesNotMatch) errors and dynamic resource loading 404 bugs in Next.js production / containerized stacks, ALWAYS follow these guidelines when creating or modifying file storage features:

### 1. Production Storage Requirement
*   In production (`NODE_ENV === 'production'`), files MUST be uploaded to Huawei OBS (or other cloud storage, if configured) and never fall back to local disk storage, as container environments are ephemeral.

### 2. Signature Safety (S3 V4 Signing)
*   **Volatile Headers Exclusion**: Do NOT include volatile HTTP headers (like `Content-Type`, `Cache-Control`, or custom headers) in the `SignedHeaders` parameter of the AWS Signature Version 4. Standard HTTP client libraries (like `fetch` / `undici`) may normalize, append, or modify these headers during request transmission, causing signature mismatches.
*   **Critical Headers Only**: Only sign `host`, `x-amz-content-sha256`, and `x-amz-date` headers to ensure signature stability.

### 3. Dynamic Region Auto-Resolution
*   Do NOT hardcode regions (e.g. defaulting to `ap-southeast-3`). If `OBS_REGION` or `HUAWEI_OBS_REGION` is missing in the environment, always parse the region dynamically from the `OBS_ENDPOINT` using `endpoint.match(/obs\.([^.]+)\.myhuaweicloud\.com/)` to prevent mismatches.

### 4. Next.js Production Runtime File Serving Fallback
*   If cloud storage is not configured (e.g. in offline local development), fall back to local file writes under `public/snapshots/...` or `public/uploads/...`.
*   **Dynamic serving requirement**: Never reference locally-saved snapshots directly through static paths like `/snapshots/...` because Next.js only registers static files present at build time and will throw 404. Serve them dynamically through an API Route / Route Handler (e.g. `/api/snapshots/[accountId]/[filename]`) that reads files on-demand.
<!-- END:file-storage-rules -->

<!-- BEGIN:prd-current-truth-rules -->
# PRD Current-Truth Rules — MUST keep one latest, unified description

The PRD is the current source of truth, not a stack of historical designs.

Whenever a requirement or decision changes:

1. Read `docs/prd_amc.md` and every affected module PRD before editing or coding.
2. Rewrite all affected goals, models, flows, interfaces, acceptance criteria, and execution steps so they express one current understanding.
3. Remove or rewrite superseded and conflicting descriptions. Do not merely append a new Changelog while leaving the old design in the PRD.
4. Let Git preserve history. Changelog sections may record release facts only when they remain consistent with the current design.
5. Search the main PRD, module PRDs, API docs, SOPs, Skills, and Agent instructions for old terminology and flows; update all affected sources in the same change.
6. Clearly distinguish `target / pending implementation` from `implemented / released`. Never describe planned work as already live.
7. Re-run a consistency search after editing, checking roles, permissions, data models, API/MCP behavior, workflows, terminology, and links.
8. Update and review the PRD before coding. If the user requests planning or documentation only, do not start development.

Canonical files:

- Main PRD: `docs/prd_amc.md`
- User, organization, and permissions: `docs/prd_user_organization_permissions.md`
- MM: `docs/prd_amc_mm.md`
- Brand knowledge and compliance: `docs/prd_brand_knowledge_compliance.md`
<!-- END:prd-current-truth-rules -->


## AMC Skills 统一包

文件型 Skill 的维护源统一为 `packages/amc-skills/skills`，`manifest.json` 记录用途、宿主依赖、来源、Skill 依赖及逐文件哈希。原 `skills/`、平台 Skill 和 Growth/Content 路径为显式同步的兼容副本，不独立维护。外部 Agent 通过该包的 GitHub 目录安装全部 external 或单项 Skill；host/repository 技能需显式选择并满足依赖。Content TypeScript 生成的原生/去AI/兼容规则以标注来源的仓库默认快照收录，数据库覆盖和品牌数据不导出。安装不授予 MCP 或业务操作权限。发布前须运行包校验、消费者漂移检查、确定性 ZIP 与临时安装测试。原营销 Skill 下载继续兼容，整包为 `public/skills/amc-skills.zip`。此次 GitHub 发布与运行时部署状态分别核验，不把包创建称作线上行为验证。

修改任一 Skill 后，从包源运行 `refresh`、`sync --consumer kanban=.`、`build --archive-dir public/skills` 和 `check --consumer kanban=. --archive-dir public/skills`；不要手改生成副本或只重建营销 ZIP。

<!-- BEGIN:amc-prd-version-history -->
## Mandatory AMC PRD version history

Before working, read `/Users/immedi/Documents/ChatGPT/AMC/AGENTS.md` and the shared ledger `/Users/immedi/Documents/ChatGPT/AMC/VERSION_HISTORY.md`.
Every PRD addition, edit (including wording), deletion, rename, or rollback MUST append a record to that shared ledger in the same delivery. This includes product requirements recorded under other filenames. Keep PRD bodies consistent with the current design; history does not replace updating superseded requirements.
Record a unique ID, timestamp/timezone, author, request source, repository/file/section, before/after changes, reason, impact, implementation/deployment status, and actual validation. Reference commits/PRs only if they exist. Preserve previous entries and concurrent edits; corrections require a new entry. Verify that every changed PRD is covered and report the history ID in the final response. Unlogged PRD work is incomplete.
This is the single shared ledger for Kanban, Growth, Content, and MM. If unavailable, report the blocker; when moving to another machine, migrate the shared ledger and update all pointers together. Carry these instructions into new repositories/worktrees. These requirements supplement existing PRD current-truth rules; no automatic Git/CI enforcement is installed.
<!-- END:amc-prd-version-history -->
