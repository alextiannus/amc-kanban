<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:system-config-rules -->
# API Key & Model Configuration — MUST use SystemConfig (DB), NOT Render env vars

**Rule**: All AI model credentials and third-party service API keys MUST be stored in the
`SystemConfig` database table, NOT in Render environment variables.

This applies to:
- Gemini API Key → `SystemConfig.geminiApiKey` / `getGeminiApiKey()`
- MiniMax TTS API Key → `SystemConfig.minimaxApiKey` / `getMiniMaxApiKey()`
- Any future LLM/model API keys (OpenAI, Claude, DeepSeek, etc.)

**Management UI**: `/admin` page → "全局 AI 接口配置" panel (Admin-only, with AuditLog)
**Library**: `src/lib/systemConfig.ts` — add new `get*Config()` helper functions here

**Only exceptions** (infrastructure secrets that cannot be DB-sourced):
- `DATABASE_URL` — needed to connect to the DB
- `JWT_SECRET` / `NEXTAUTH_SECRET` — session encryption
- `OBS_*` storage credentials (binary service config)

When a user asks you to configure an API key, ALWAYS direct them to the Admin UI,
NEVER suggest adding to Render Dashboard > Environment variables.
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
