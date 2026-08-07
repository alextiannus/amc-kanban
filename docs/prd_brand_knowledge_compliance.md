# Brand Knowledge Compliance Validation PRD & Design Doc

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

Growth is the canonical merchant data and knowledge center. Merchant identity, classification, locations, menu/product facts, positioning, audience, channels, reputation, evidence and confirmed competitors are read from Growth by stable `Brand.growthBrandKey`.

Confirmed Google Places data follows the same ownership boundary. Growth performs Place confirmation, collection, source attribution and freshness control, and exposes store-level Google action links through the authenticated Merchant 360 interface. Kanban does not call Places API for this sync; an explicit Growth sync caches each store's links in `BrandKnowledge.stores[].googleBusiness` and mirrors the current primary store into the legacy Brand Google fields for existing review and game flows. Cached values retain source and expiry metadata and must not be presented as current after expiry.

Kanban continues to own content-execution policy, including prohibited words, required campaign keywords, approval rules and draft validation. These rules are not merchant master data and therefore remain in Kanban. The existing Markdown/`ext.compliance` format is a compatibility representation for these execution rules only; it must not be used to create a second copy of Growth merchant facts.

The Kanban brand-identity editor reads `brand.tone`, `audience.primary` and `brand.unique_selling_points` from published Growth knowledge. A brand writer may publish an immediate Growth revision through Kanban's authenticated BFF; Growth retains the superseded version and the forwarded actor audit. Kanban-local execution fields such as promotion focus, brand voice/image and publishing frequency remain partial, audited Kanban updates. Markdown profile editing is not an independent write path for these identity fields.

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
