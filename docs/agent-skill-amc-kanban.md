---
title: AMC Kanban Agent Skill
category: operations
version: 1.0.0
description: >
  Allows an OpenClaw AI Agent to interact with the AMC Kanban board:
  submit action items for brand owner review, report social account snapshots,
  poll approved content drafts, and report publish results.
  This is the primary interface between the AI agent and the brand owner.
---

# AMC Kanban — Agent Skill

## Overview

The AMC Kanban is a **brand owner monitoring dashboard**. The AI Agent does the work; the brand owner reviews and approves via the Kanban. This skill enables the agent to:

1. **Push action items** (content approval requests, sentiment alerts, material requests)
2. **Report monitoring snapshots** (follower counts, ratings)
3. **Poll for approved drafts** ready to publish via PostFast
4. **Report publish results** back to the Kanban

## Authentication

All agent endpoints require an `Authorization` header with the agent's API key:

```
Authorization: Bearer <agentApiKey>
```

The `agentApiKey` is set in the agent's User profile (`User.apiKey`) in the Kanban database.

---

## Endpoint: Push Action Item

**When to use:** After creating content, detecting a bad review, or needing materials from the owner.

```
POST <KANBAN_BASE_URL>/api/agent/action-items
Authorization: Bearer <agentApiKey>
Content-Type: application/json
```

### Request Body

```json
{
  "brandId": "clx...",
  "accountId": "clx...",          // optional — which social account this relates to
  "type": "content_approval",     // content_approval | sentiment_alert | material_request
  "priority": "normal",           // urgent | high | normal
  "title": "母亲节预热海报等待审核",
  "description": "AI已生成英文文案，配合节日热点，建议今晚发布。",
  "payload": {},                   // see payload schemas below
  "draftData": {                   // only for content_approval
    "caption": "🌸 Mother's Day...",
    "captionLang": "en",
    "mediaUrls": ["https://..."],
    "hashtags": ["MothersDay"],
    "scheduledAt": "2025-05-10T19:00:00Z",
    "agentNote": "适配母亲节流量高峰时段"
  }
}
```

### Payload Schemas by Type

**`content_approval`** — Payload optional (draft embedded in `draftData`):
```json
{ "platform": "instagram", "scheduledAt": "2025-05-10T19:00:00Z" }
```

**`sentiment_alert`** — Include AI-generated reply suggestions:
```json
{
  "rating": 2,
  "reviewerName": "John D.",
  "reviewText": "Wait time was too long...",
  "reviewUrl": "https://maps.google.com/...",
  "suggestedReplies": [
    "Dear John, we sincerely apologize...",
    "Hi John, thank you for the feedback..."
  ]
}
```

**`material_request`** — Request photos/videos from owner:
```json
{
  "occasion": "万圣节南瓜装饰",
  "requiredCount": 3,
  "deadline": "2025-10-25T00:00:00Z",
  "examplePrompt": "请发两张店面南瓜灯摆设的照片"
}
```

### Response

```json
{ "id": "clx...", "status": "pending", "brandId": "clx..." }
```

> **Note:** If `Brand.autoPilot = true`, `status` will be `"auto_resolved"` and the draft will immediately move to `"publishing"` — no owner review needed.

---

## Endpoint: Poll Approved Drafts

**When to use:** Poll every N minutes to find content the owner has approved for publishing.

```
GET <KANBAN_BASE_URL>/api/agent/pending-approvals?brandId=<brandId>
Authorization: Bearer <agentApiKey>
```

### Response

Array of approved `ContentDraft` records with account and asset info:

```json
[
  {
    "id": "clx...",
    "caption": "🌸 Mother's Day Special!...",
    "captionLang": "en",
    "mediaUrls": ["https://lark-drive.../image.jpg"],
    "hashtags": ["MothersDay"],
    "scheduledAt": "2025-05-10T19:00:00Z",
    "account": {
      "platformId": "instagram",
      "handle": "@yushanfang_nyc",
      "accessToken": null
    }
  }
]
```

**Publishing flow:**
1. Agent receives draft with `status: "publishing"`
2. Agent uses `account.platformId` + `caption` + `mediaUrls` to call PostFast MCP
3. Agent gets PostFast `postId` back
4. Agent reports result (see below)

---

## Endpoint: Report Publish Result

**When to use:** After PostFast publishes (or fails to publish) a draft.

```
POST <KANBAN_BASE_URL>/api/agent/pending-approvals
Authorization: Bearer <agentApiKey>
Content-Type: application/json
```

```json
{
  "draftId": "clx...",
  "success": true,
  "platformPostId": "instagram_post_id_123"
}
```

On failure:
```json
{
  "draftId": "clx...",
  "success": false,
  "error": "PostFast API rate limit exceeded"
}
```

---

## Endpoint: Report Monitoring Snapshots

**When to use:** After fetching follower counts / ratings from platform APIs. Run daily.

```
POST <KANBAN_BASE_URL>/api/agent/snapshots
Authorization: Bearer <agentApiKey>
Content-Type: application/json
```

```json
{
  "updates": [
    { "accountId": "clx...", "followerCount": 1285, "followerDelta": 12 },
    { "accountId": "clx...", "ratingScore": 4.7 }
  ]
}
```

---

## PostFast Integration

The brand owner configures their **PostFast API key** in the Kanban settings UI:
`Settings → 集成配置 → PostFast API Key`

This key is stored in `Brand.postfastApiKey`. When the agent polls approved drafts, it should:

1. Fetch the brand's PostFast key via:
   ```
   GET <KANBAN_BASE_URL>/api/agent/brand-config?brandId=<brandId>
   ```
2. Use `postfastApiKey` to call the PostFast MCP publishing tool
3. Pass `platformId`, `caption`, `mediaUrls`, `hashtags`, `scheduledAt` to PostFast

---

## Recommended Agent Workflow (OpenClaw Skill Loop)

```
Every 30 min:
  1. POST /api/agent/action-items  ← push content drafts for review
  2. GET  /api/agent/pending-approvals ← check for approved content
  3. If approved drafts found:
       → Call PostFast MCP to publish
       → POST /api/agent/pending-approvals (report result)

Every 6 hours:
  4. Monitor platform APIs for new reviews/ratings
  5. POST /api/agent/snapshots  ← update follower/rating data
  6. If bad review found (≤ 3 stars):
       → POST /api/agent/action-items (sentiment_alert, priority: urgent)

Weekly:
  7. Scan upcoming holidays/events
  8. Generate content drafts proactively
  9. POST /api/agent/action-items (content_approval) for each
```

---

## Environment Variables for Agent

```env
KANBAN_BASE_URL=https://your-kanban.vercel.app
KANBAN_AGENT_API_KEY=amc-agent-dev-key-001
KANBAN_BRAND_ID=clx...
```
