---
title: AMC Kanban Agent Skill
category: operations
version: 1.1.0
description: >
  Allows an OpenClaw AI Agent to fully manage the AMC Kanban board:
  initialize brand profiles via MCP interview, configure integration credentials,
  register and update social media accounts (including login credentials),
  submit action items for brand owner review, report monitoring snapshots,
  poll approved content drafts, and report publish results.
  This is the primary interface between the AI agent and the brand owner.
---

# AMC Kanban — Agent Skill

## Overview

The AMC Kanban is a **brand owner monitoring dashboard**. The AI Agent does the work; the brand owner reviews and approves via the Kanban. This skill enables the agent to:

1. **Configure brand profile** — fill in brand info via interview (markdown description)
2. **Configure integrations** — set PostFast, Google Business, Lark credentials per brand
3. **Register social accounts** — upsert accounts with profile URL and login credentials
4. **Push action items** — content approvals, sentiment alerts, material requests
5. **Report monitoring snapshots** — follower counts, ratings
6. **Poll approved drafts** — ready to publish via PostFast
7. **Report publish results** — back to Kanban

## Authentication

All agent endpoints require an `Authorization` header with the agent's API key:

```
Authorization: Bearer <agentApiKey>
```

The `agentApiKey` is set in the agent's User profile (`User.apiKey`) in the Kanban database.

---

## Endpoint: Configure Brand Profile & Credentials

**When to use:** After brand onboarding interview. Update description, website, integration keys.

```
PATCH <KANBAN_BASE_URL>/api/agent/brand-config
Authorization: Bearer <agentApiKey>
Content-Type: application/json
```

### Request Body

All fields optional. Only include fields you want to update.

```json
{
  "brandId": "clx...",

  // Brand profile (rendered as markdown in the dashboard)
  "description": "# 御膳房\n正宗中式海鲜餐厅，主打新鲜波士顿龙虾...\n\n## 品牌特色\n- 每日直供...",
  "website": "https://yushanfang.com",
  "phone": "+1 212-555-0100",
  "address": "123 Main St, New York, NY 10001",

  // Integration credentials
  "postfastApiKey": "pf_live_...",
  "googlePlaceId": "ChIJ...",
  "googleApiKey": "AIza...",
  "larkAppId": "cli_...",
  "larkAppSecret": "xxx",
  "larkParentFolderToken": "PbugfutjllCDM0dqMiIlN0orgZd",
  "larkBotWebhook": "https://open.larksuite.com/open-apis/bot/v2/hook/...",
  "larkOwnerId": "ou_..."
}
```

> **Note:** When `larkAppId` + `larkAppSecret` are first set and `larkDriveFolderId` is empty,
> the system will **automatically create** a `Workspace_<品牌名>` folder inside `larkParentFolderToken`.
> The folder token is saved to the brand and returned as `larkFolderUrl`.

> **Note:** The agent is also **automatically registered** to the brand on first PATCH
> (via `BrandAgent` upsert). The dashboard AI Agent tab will show the agent as connected.

### Response

```json
{
  "ok": true,
  "updated": ["description", "postfastApiKey"],
  "larkFolderUrl": "https://12eat-ai.sg.larksuite.com/drive/folder/...",
  "brand": {
    "id": "clx...",
    "name": "御膳房",
    "description": "# 御膳房\n...",
    "postfastConfigured": true,
    "googleConfigured": false,
    "larkConfigured": true,
    "larkDriveConfigured": true
  }
}
```

---

## Endpoint: Upsert Social Account

**When to use:** After collecting brand's social media account info. Creates or updates by
`(brandId, platformId, handle)` — safe to call multiple times.

```
PATCH <KANBAN_BASE_URL>/api/agent/accounts
Authorization: Bearer <agentApiKey>
Content-Type: application/json
```

### Supported Platforms

`google` | `instagram` | `tiktok` | `xiaohongshu` | `facebook` | `youtube` |
`x` | `yelp` | `linkedin` | `pinterest` | `weibo` | `wechat` | `snapchat` | `tripadvisor`

### Request Body

```json
{
  "brandId": "clx...",
  "platformId": "instagram",
  "handle": "@yushanfang_nyc",
  "displayName": "Yu Shan Fang Restaurant NYC",
  "profileUrl": "https://www.instagram.com/yushanfang_nyc",
  "loginUsername": "yushanfang@gmail.com",
  "loginPassword": "S3cur3P@ss!",
  "followerCount": 1234,
  "ratingScore": 4.8
}
```

> **Security:** `loginPassword` is stored securely and only returned to Admin users in the dashboard.
> The agent response **never** includes `loginPassword`.

### Response

```json
{
  "ok": true,
  "account": {
    "id": "clx...",
    "platformId": "instagram",
    "handle": "@yushanfang_nyc",
    "displayName": "Yu Shan Fang Restaurant NYC",
    "profileUrl": "https://www.instagram.com/yushanfang_nyc",
    "loginUsername": "yushanfang@gmail.com",
    "followerCount": 1234
  }
}
```

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

> **Note:** If `Brand.autoPilot = true`, `status` will be `"auto_resolved"` and the draft
> will immediately move to `"publishing"` — no owner review needed.

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

## Recommended Agent Workflow (OpenClaw Skill Loop)

### First-Time Brand Initialization

```
1. Interview brand owner (via Lark bot or direct message) to collect:
   - Brand description, website, phone, address
   - Social media accounts (platform, handle, profile URL, login credentials)
   - Integration credentials (PostFast, Google, Lark)

2. PATCH /api/agent/brand-config  ← write brand profile + all integration creds
   (system auto-creates Lark Workspace folder + auto-registers agent to brand)

3. PATCH /api/agent/accounts (per account)  ← register each social account
```

### Ongoing Operations

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
  6. PATCH /api/agent/accounts  ← update follower counts per account
  7. If bad review found (≤ 3 stars):
       → POST /api/agent/action-items (sentiment_alert, priority: urgent)

Weekly:
  8. Scan upcoming holidays/events
  9. Generate content drafts proactively
 10. POST /api/agent/action-items (content_approval) for each
```

---

## Environment Variables for Agent

```env
KANBAN_BASE_URL=https://your-kanban.vercel.app
KANBAN_AGENT_API_KEY=amc-agent-dev-key-001
KANBAN_BRAND_ID=clx...
```
