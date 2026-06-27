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
- Azure Speech Key → `SystemConfig.azureSpeechKey` / `getAzureSpeechConfig()`
- Azure Speech Region → `SystemConfig.azureSpeechRegion` / `getAzureSpeechConfig()`
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
