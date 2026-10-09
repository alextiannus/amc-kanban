# Brand Knowledge Compliance Validation PRD & Design Doc

Merchant voiceover current implementation contract (pending deployment): [merchant-voiceover.md](./merchant-voiceover.md).

This document details the product requirements and technical design for the Brand Knowledge Compliance validation features implemented in the AI Marketing Crew (AMC) dashboard.

---

## 1. Product Requirements

### 1.1 Objective
To provide deterministic guardrails and consistency checks on content creation within the AMC dashboard, ensuring that all automatically generated or edited post drafts comply with brand guidelines (e.g., tone, prohibited terminology, required keywords).

### 1.2 User Stories
* **As a Brand Manager**, I want to define specific rules for what my AI agents can and cannot write (e.g., advertising compliance guidelines, prohibited words, competitor comparisons).
* **As an AI Agent / Operator**, when I write or edit post captions, the system must enforce these compliance guidelines before allowing content to be created or scheduled, preventing brand compliance mistakes from going live.

### 1.3 Key Features
1. **Compliance Schema**: A formal JSON schema specifying prohibited words (case-insensitive), required keywords, and target tone.
2. **Zero-Downtime Extensibility**: Compliance settings are read from the `ext` (or root) field inside the `compliance` block of the brand's knowledge base markdown file, avoiding the need for heavy DB schema migrations.
3. **Strict Validation Middleware**: 
   - `POST /api/brands/[id]/drafts`: Rejects draft creation with a `400` code and details the violated prohibited words if validation fails.
   - `PATCH /api/brands/[id]/drafts/[draftId]`: Rejects draft updates containing prohibited words when the post caption is edited.

### 1.4 Ownership Boundary

Merchant cloned-voice records remain Kanban-owned execution data. The authenticated internal content-brand-voices API exposes a brand-scoped safe catalog and resolves voice selections for Content video production (implemented locally, pending release). Content stores a non-secret selection snapshot, checks current authorization/status before synthesis, and never falls back to another account or voice. No voice credentials or unscoped cloned-voice catalog are exposed to the browser.

Growth is the canonical merchant data and knowledge center. Merchant identity, classification, locations, menu/product facts, positioning, audience, channels, reputation, evidence and confirmed competitors are read from Growth by stable `Brand.growthBrandKey`.

Merchant document extraction (implemented locally, not deployed): Growth discovers merchant menu images and PDFs from confirmed Places/website/search sources. The authenticated Kanban internal merchant-document API binds an immutable published model policy and delegates extraction to Content. Text-bearing PDF pages use the unified text model; scanned pages use the unified image model after bounded rendering and OBS upload. Results retain source URL, page, currency, confidence and policy version and enter Growth as review candidates, never automatically confirmed facts. Standard/deep budgets are 10/20 document pages. Provider-unknown submissions are queried rather than replayed. No Growth supplier key or independent model selection is introduced.


Confirmed Google Places data follows the same ownership boundary. Growth performs Place confirmation, collection, source attribution and freshness control, and exposes store-level Google action links through the authenticated Merchant 360 interface. Kanban does not call Places API for this sync; an explicit Growth sync caches each store's links in `BrandKnowledge.stores[].googleBusiness` and mirrors the current primary store into the legacy Brand Google fields for existing review and game flows. Cached values retain source and expiry metadata and must not be presented as current after expiry.

Google 商家账号自动补充（已上线，2026-09-30）：Google OAuth 授权、明确门店选择及 PostFast Google 账号同步完成后，AMC 自动登记持久同步任务。任务只读取当前品牌绑定账号的精确门店，不执行名称搜索，不默认选择多个门店中的第一个。OAuth 可读取门店信息、符合条件的商家维护菜单和顾客评价；PostFast 仅导入其接口实际提供的绑定门店字段，缺少菜单/评价读取权限时显示具体缺项。配置变更、解绑与并发更新必须使旧抓取结果失效。

自动导入只补充空白资料，不覆盖主理人已有内容。商家维护菜单以稳定来源 ID 去重进入 SKU 目录，保留门店、来源和采集时间；顾客评价汇总保留样本数、时间范围、评分分布和产品提及，仅属于顾客反馈，不作为已确认产品卖点或商品目录。信息不足不虚构 SKU。导入结果和失败原因在商家资料中可见，可重试；后台任务有租约、退避和重启恢复。品牌/门店字段通过现有 Growth outbox 汇入主数据，商品目录通过 merchant.menuItems 发布为 Growth menu.items，评价统计通过 merchant.googleReviewSummary 发布为 observation 类型的 reputation.google_account_summary；原始评价不复制到永久审计日志。Google Places 公共查询继续由 Growth 管理，本流程不添加模糊检索或转移 12eat 凭证。

Kanban continues to own content-execution policy, including prohibited words, required campaign keywords, approval rules and draft validation. These rules are not merchant master data and therefore remain in Kanban. The existing Markdown/`ext.compliance` format is a compatibility representation for these execution rules only; it must not be used to create a second copy of Growth merchant facts.

The Kanban brand-identity editor reads `brand.tone`, `audience.primary` and `brand.unique_selling_points` from published Growth knowledge. A brand writer may publish an immediate Growth revision through Kanban's authenticated BFF; the requested change is first persisted as a durable command and remains visibly pending if Growth is unavailable. Pending values are effective for Kanban content execution but are never labeled as published Growth knowledge. Version conflicts require an explicit overwrite-or-discard decision. Growth retains the superseded version and the forwarded actor audit. Kanban-local execution fields such as promotion focus, brand voice/image and publishing frequency remain partial, audited Kanban updates. Markdown profile editing is not an independent write path for these identity fields.

Kanban merchant and store edits use a separate per-brand Growth snapshot Outbox. It publishes merchant name, market, industry, story, logo, website, brand service phone, merchant delivery links, the three Growth identity fields, and stable store records. Store phone, hours, reservation and ordering links are location knowledge. Registration contact numbers, credentials, publishing policy, sensitive words and subscription state remain Kanban-only. A name-and-city registration receives a `pending_details` placeholder main store that is excluded from Growth completeness.

The sync is one-way from Kanban to Growth. Growth compares each incoming field with the last successfully applied source value; concurrent Growth edits become field-level conflicts and require an explicit overwrite or one-time adopt-Growth action. Missing stores are never interpreted as deletion. Initial historical backfill sends non-empty Kanban values only, while later explicit clears are transmitted as intentional changes.

---

## 2. Technical Implementation Details

### 2.1 JSON Schema Configuration
Stored in [brand_knowledge_schema.json](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/docs/brand_knowledge_schema.json):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BrandKnowledgeComplianceSchema",
  "type": "object",
  "properties": {
    "prohibitedWords": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of case-insensitive words or phrases that must not appear in any social media post caption."
    },
    "requiredKeywords": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of words or phrases that should ideally be highlighted or mentioned in post drafts."
    },
    "tone": {
      "type": "string",
      "description": "Short description of the desired brand voice tone."
    }
  },
  "additionalProperties": true
}
```

### 2.2 Extraction & Validation Logic
Implemented in [compliance.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/compliance.ts):
- Extracts compliance parameters from manual markdown JSON sections using custom regex parsing to look for `ext.compliance` or root `compliance`.
- Runs case-insensitive checks against the defined prohibited words.
- Collects missing required keywords for possible UI hints or agent recommendations.

### 2.3 API Integration
- Integrated in draft creation [POST /api/brands/[id]/drafts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/%5Bid%5D/drafts/route.ts)
- Integrated in draft update [PATCH /api/brands/[id]/drafts/[draftId]](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/%5Bid%5D/drafts/%5BdraftId%5D/route.ts)

### 2.4 Testing Verification
- Custom integration tests are located at [test-compliance-validation.mjs](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/scratch/test-compliance-validation.mjs).
- Playwright E2E regression tests are verified at [test-extension-e2e.mjs](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/scratch/test-extension-e2e.mjs).
- Complete optimized production build validation has been executed and confirmed.

---

## 3. AMC Copywriter AI Automation & Knowledge Base

> **目标状态，待执行**：本节已按最新 Agent、权限和去 WorkUnit 方案统一描述；当前代码中的任务驱动逻辑将在 Auth V2 与泳道后台迁移阶段替换。

### 3.1 Overview
The target AMC Copywriter is a normal AMC Agent system user. It runs from explicit business events or scheduled content checks, uses the same Capability and Crew authorization as a human employee, and writes all operations to the shared work log. It does not consume Kanban tasks or `WorkUnit`.

### 3.2 Automated Scheduling (6 Hours)
- **Mechanism**: A background loop executes every 6 hours (`setInterval.unref()` to prevent thread blocking).
- **Execution**: The scheduler evaluates active brands, publishing cadence, social accounts, existing drafts, available assets, and unresolved `ActionItem` records. It creates or updates the relevant business resource directly.
- **Workflow**: When content work is required, the scheduler invokes `marketingGraph` with explicit `brandId`, `accountId`, `draftId` and actor context. Internal graph checkpoints may track technical execution, but they are not product tasks or board items.

### 3.3 Immediate Triggers
The copywriter workflow triggers immediately under three business contexts:
1. **Post Draft Editing Flow**: Clicking **✨ AI 创作** saves the draft and invokes the workflow with that draft ID.
2. **Draft Review Flow**: Clicking **✨ AI 重新创作** invokes the workflow using the draft, rejection note, brand knowledge and selected assets.
3. **Asset or Calendar Flow**: Creating content from the Asset Library or publishing calendar creates a `ContentDraft` directly and invokes the assigned AMC Agent when AI creation is requested.

If human input or approval is required, the workflow creates an `ActionItem`; it never creates a `require_input` task.

### 3.4 Brand Board & Knowledge Base Integration
- **Structured Knowledge Base**: Implemented in [knowledgeBase.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/knowledgeBase.ts), storing templates, prompts, video scripts, and marketing ideas for Food & Beverage, Fitness, Renovation, Winery, and General categories.
- **Dynamic Retrieval**: In the copywriter agent [copywriter.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/nodes/copywriter.ts), the AI agent detects the brand's industry and queries the knowledge base using the target platform, draft context, campaign intent and selected assets.
- **In-Context Prompting**: Dynamic templates, scripts, ideas, and prompts are injected directly into the Gemini prompt instructions.
- **Fallback Templates**: If Gemini is offline/fails, the rule-based fallback system uses the templates loaded from the knowledge base rather than hardcoded rules.

### 3.5 Duplicate Prevention (In-place Draft Updates)
- To prevent duplicate drafts when the user edits or reviews a draft and triggers the copywriter:
  - The `publisherNode` in [publisher.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/nodes/publisher.ts) requires an explicit existing draft ID in workflow state.
  - If a draft ID is matched, the publisher updates the existing draft record in-place instead of creating a duplicate content draft.

---

## 4. Agent-Learned Templates (REST API & MCP Tool)

### 4.1 Objectives
To enable the AMC Copywriter AI Agent to continuously learn, adapt, and save successful copywriting templates, scripts, ideas, and prompt rules to the brand's knowledge base across all social media platforms.

### 4.2 Data Storage & Persistence
- **Storage Strategy**: To maintain a zero-downtime architecture and avoid running complex Postgres schema migrations, custom templates are stored in a workspace JSON file: [customTemplates.json](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/customTemplates.json).
- **Format**:
  ```json
  [
    {
      "industry": "fitness",
      "platform": "instagram",
      "template": "【TEST TEMPLATE】Welcome to [BrandName]!",
      "idea": "Focus on alignment",
      "videoScript": "Reformer walk",
      "prompt": "Keep it professional"
    }
  ]
  ```
- **Dynamic Merging**: When `getRelevantKnowledge` is called by the agent copywriter, it automatically reads and merges entries from `customTemplates.json` with the default knowledge repository, ensuring newly learned templates are immediately available.

### 4.3 REST API Endpoints
Protected by API key and Session authentication:
- **`GET /api/learn/templates`**: Retrieves all custom templates in the repository.
- **`POST /api/learn/templates`**: Submits a new custom template.
  - Required fields: `industry`, `platform`.
  - At least one of `template`, `idea`, `videoScript`, or `prompt` must be provided.

### 4.4 Model Context Protocol (MCP) Tool
Exposed to the agent directly inside [server.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/partner/mcp/server.ts):
- **Tool Name**: `submit_knowledge_template`
- **Description**: "Submit a copywriting template, content idea, video script blueprint, or prompt rule to the AMC Knowledge Base."
- **Input Parameters**:
  - `industry`: enum (`fb`, `fitness`, `renovation`, `winery`, `general`)
  - `platform`: string (e.g. `instagram`, `red`, `tiktok`, `facebook`, `google_business`, `all`)
  - `template`: string (optional)
  - `idea`: string (optional)
  - `videoScript`: string (optional)
  - `prompt`: string (optional)

## 多门店资料与管理员授权

状态：已完成本地实现，待发布，发布前需执行新增字段迁移并验证页面。一个品牌保存多家门店资料，共享品牌运营。管理员独立设置总门店数；Brand.manualStoreLimit 为可空正整数，空值恢复订阅规则。最终额度取订阅额度（基础 1 家加有效多门店增值数量）与手动授权总数的较大值。授权不修改账单、订阅状态或增值服务，套餐切换与到期不清除授权。

仅平台管理员网页会话可以修改授权，并记录前后值审计；不开放 API Key 委托。普通用户和普通 Agent 不能修改授权，资料编辑沿用原有品牌权限。

所有门店写入使用统一校验，超额历史数据可修改、减少但不可增加；降低额度不删除门店。保留稳定标识和 Google 元数据，拒绝时不写 Markdown 或发送 Growth 同步。门店消失不代表删除 Growth 记录。独立门店账号、任务、员工权限和经营报表不属于本期。

验收：默认 1 家、授权 3 家、付费权益优先、撤销后资料保留、接口和 Markdown 无法绕过、账单不变及审计可查。发布顺序：数据库迁移、应用发布、管理员及品牌页面验证。

## Google 自动补充验收（2026-09-30）

- 运行版本：Kanban `edc56ea1`、AMC-MM `64675665`、Growth `efb51851` 均已 live。
- 本地验证：Google 精确身份、多个授权账号分页、不做名称检索、菜单来源与规格去重、保留人工/旧格式商品、评价样本与评分统计、错误脱敏；PostgreSQL 真实事务验证持久认领、并发执行、重复同步、解绑期间丢弃旧结果、Growth outbox，以及 PostFast 权限不足时只补充可取得字段。
- 浏览器验证：390px 手机界面、明确门店选择（不默认选首项）、同步状态、缺项提示、品牌切换隔离；原 Brand Ideas 消息预览回归通过。两端生产构建及类型检查通过。接口专项验证未登录、跨品牌及 AI 身份不触发读取或导入；线上未授权请求被拒绝。全库旧静态鉴权扫描仍有 20 个既有未识别路由，本次新接口不在其中，未将该扫描报告为全通过。
- 真实账号验证：Render `job-daub3qe0tbcc73en4bvg` 对“何师傅烤骨头”已配置的 PostFast Google 账号读取其唯一门店，新增地址 `81 Geylang Road, 389199`、Google 门店名称与地图主页。同步回执为 `PARTIAL`，SKU 数 0，评价摘要为空，缺项为直接 Google 菜单/评价授权。没有通过名称寻找其他商家，没有推测菜品或生成虚假评价。直接 OAuth 菜单与评价分支已通过模拟提供方及真实本地数据库验证；该品牌尚无直接授权，不能称为已通过该分支的线上菜单/评价实测。
- 主数据同步回读：Render `job-daub4o60tbcc73en85cg` 确认该品牌 Growth outbox 为 `SYNCED`，无待同步字段、错误或冲突。
