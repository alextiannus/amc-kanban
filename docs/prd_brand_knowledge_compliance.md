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
