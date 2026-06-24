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

### 3.1 Overview
The AMC Copywriter (AI Agent) is automated to run on a background schedule and immediately triggers in response to specific user actions and task additions. Additionally, it references a structured Brand Knowledge Base to ensure consistent and high-quality copywriting outputs.

### 3.2 Automated Scheduling (6 Hours)
- **Mechanism**: A background loop executes every 6 hours (`setInterval.unref()` to prevent thread blocking).
- **Execution**: The scheduler queries all active Kanban tasks (`WorkUnit`) in `todo` status assigned to any active AI Agent.
- **Workflow**: For each matched task, the agent triggers the `marketingGraph.invoke` process to complete copy generation and media assembly.

### 3.3 Immediate Triggers
The copywriter workflow triggers immediately under three user-driven contexts:
1. **a. Post Draft Editing Flow**: In the post draft edit drawer, clicking the **✨ AI 创作** button saves the current draft, creates/links a corresponding Kanban task, and runs the workflow in the background.
2. **b. Draft Review Panel**: In the pending review drawer, clicking the **✨ AI 重新创作** button runs the workflow in the background to recreate the caption based on review comments or task guidelines.
3. **c. New Kanban Todo Task**: Whenever a new creation task is added to the `todo` lane (either via direct Kanban task addition or Asset Library scheduling), the system immediately triggers the copywriter workflow in the background.

### 3.4 Brand Board & Knowledge Base Integration
- **Structured Knowledge Base**: Implemented in [knowledgeBase.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/knowledgeBase.ts), storing templates, prompts, video scripts, and marketing ideas for Food & Beverage, Fitness, Renovation, Winery, and General categories.
- **Dynamic Retrieval**: In the copywriter agent [copywriter.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/nodes/copywriter.ts), the AI agent detects the brand's industry from database metrics and queries the knowledge base matching the platform and task title keywords.
- **In-Context Prompting**: Dynamic templates, scripts, ideas, and prompts are injected directly into the Gemini prompt instructions.
- **Fallback Templates**: If Gemini is offline/fails, the rule-based fallback system uses the templates loaded from the knowledge base rather than hardcoded rules.

### 3.5 Duplicate Prevention (In-place Draft Updates)
- To prevent duplicate drafts when the user edits or reviews a draft and triggers the copywriter:
  - The `publisherNode` in [publisher.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/agents/nodes/publisher.ts) checks for an existing draft ID (passed in the state or parsed from task descriptions/materials).
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
