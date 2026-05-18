# AMC Skill: Integrations — PostFast · Google Business · Lark Drive

> **版本**: v2.0 · **适用**: OpenClaw / Claude / 任意支持 MCP 的 AI Agent

本 Skill 描述如何通过 AMC Kanban MCP 服务，让 AI Agent 直接调用 PostFast 完整功能、Google Business 评论管理、Lark Drive 文件管理，**无需在 Agent 侧持有任何第三方密钥**（凭证由主理人配置在品牌设置中，MCP 服务端自动注入）。

---

## 🔗 接入前提

1. 已通过 `agent-instructions.md` 完成 Agent 注册及品牌初始化
2. 主理人已在 **品牌主看板 → 设置** 中填写所需集成凭证

| 功能模块 | 需配置字段 |
|---------|-----------|
| PostFast 所有功能 | `postfastApiKey` |
| Google 评论读取 | `googlePlaceId` + `googleApiKey` |
| Google 评论回复 | `postfastApiKey`（PostFast 代理 OAuth）|
| Lark 通知 | `larkBotWebhook` 或 `larkAppId`+`larkAppSecret`+`larkOwnerId` |
| Lark Drive 上传 | `larkAppId` + `larkAppSecret` |

---

## 📡 完整 MCP 工具列表（共 20 个）

### PostFast — 账号管理

#### `postfast_list_accounts`
列出品牌 PostFast 工作区中所有已连接的社媒账号。

```json
{ "brandId": "<品牌ID>" }
```

**返回**: `{ ok, count, accounts: [{ id, platformId, handle, displayName, connected }] }`

> 获取 `accountId` 后可在 `postfast_publish` 中指定具体账号发布。

---

#### `postfast_generate_connect_link`
生成安全连接链接，让品牌主理人无需 PostFast 账号即可授权连接社媒账号。

```json
{
  "brandId": "<品牌ID>",
  "label": "成都滋味烤鱼",
  "redirectUrl": "https://amc-kanban.immedi.ai/settings"
}
```

**返回**: `{ ok, connectUrl }`

---

### PostFast — 帖子管理

#### `postfast_list_posts`
列出已排期或已发布的帖子。

```json
{
  "brandId": "<品牌ID>",
  "status": "scheduled",
  "platform": "instagram",
  "limit": 20
}
```

**返回**: `{ ok, total, posts: [{ id, platform, caption, status, scheduledAt, postUrl, engagementStats }] }`

`status` 枚举: `scheduled` | `published` | `failed` | `draft`

---

#### `postfast_delete_post`
取消并删除一条已排期的帖子。

```json
{
  "brandId": "<品牌ID>",
  "postId": "<来自 postfast_list_posts 的 id>"
}
```

**返回**: `{ ok, deleted, postId }`

> ⚠️ 只能删除 `status=scheduled` 的帖子，已发布帖子无法通过 API 删除。

---

### PostFast — 媒体上传 + 发布

#### `postfast_upload_media`
上传媒体文件到 PostFast，返回 `storageKey` 用于发布时附加。比直接传 URL 质量更高。

```json
{
  "brandId": "<品牌ID>",
  "filename": "june_banner.jpg",
  "mimeType": "image/jpeg",
  "fileBase64": "<base64字符串，不含 data: 前缀>"
}
```

**返回**: `{ ok, storageKey, fileToken, filename }`

---

#### `postfast_publish`
发布或排期一条社媒帖子。

```json
{
  "brandId": "<品牌ID>",
  "platform": "instagram",
  "caption": "今日特惠 🔥 红油水煮鱼只要 ¥58！",
  "mediaStorageKeys": ["<来自 postfast_upload_media 的 storageKey>"],
  "hashtags": ["成都美食", "水煮鱼"],
  "scheduledAt": "2025-06-01T03:00:00Z",
  "accountId": "<可选，指定特定账号>"
}
```

**返回**: `{ ok, postId, url, platform, scheduledAt }`

**支持平台**: `instagram` `tiktok` `xiaohongshu` `facebook` `youtube` `x` `linkedin` `threads` `bluesky` `pinterest` `snapchat` `telegram` `google`

> ✅ **推荐流程**: `postfast_upload_media` → 拿 `storageKey` → `postfast_publish`  
> ⚠️ `scheduledAt` 必须是 **UTC 时间** ISO 8601 格式（如 `2025-06-01T03:00:00Z` = 北京时间11:00）

---

#### `postfast_reply_review`
通过 PostFast 回复 Google / Yelp 评论。

```json
{
  "brandId": "<品牌ID>",
  "platform": "google",
  "reviewId": "<reviewId>",
  "replyText": "感谢您的光临！期待下次再见 🙏"
}
```

**返回**: `{ ok, reviewId, platform, replied }`

---

### Google Business — 评论管理

#### `google_get_reviews`
拉取品牌最新 Google 评论（最多 20 条）。

```json
{ "brandId": "<品牌ID>", "limit": 10 }
```

**返回**: `{ ok, count, reviews: [{ reviewId, reviewer, rating, comment, createTime, replyText }] }`

---

#### `google_reply_review`
回复一条 Google 评论（自动经由 PostFast OAuth）。

```json
{
  "brandId": "<品牌ID>",
  "reviewId": "<来自 google_get_reviews 的 reviewId>",
  "replyText": "亲爱的张先生，感谢您的五星好评！..."
}
```

**返回**: `{ ok, reviewId, via: "postfast" }`

---

### Lark — 通知与文件

#### `lark_notify`
向品牌主理人发送 Lark 消息卡片。

```json
{
  "brandId": "<品牌ID>",
  "title": "🔔 帖子已成功排期",
  "content": "**小红书帖子**已排期，预计明日上午11点推送。",
  "actionUrl": "https://amc-kanban.immedi.ai/board",
  "urgent": false
}
```

**返回**: `{ ok, channel: "webhook" | "direct_message" }`

---

#### `lark_create_workspace`
在 Lark Drive 创建品牌工作区文件夹（每个品牌调用一次）。

```json
{ "brandId": "<品牌ID>" }
```

**返回**: `{ ok, folderToken, folderUrl }`

---

#### `lark_upload_file`
上传文件到品牌 Lark Drive 工作区（素材归档）。

```json
{
  "brandId": "<品牌ID>",
  "filename": "campaign_banner_june.jpg",
  "mimeType": "image/jpeg",
  "fileBase64": "<base64字符串>"
}
```

**返回**: `{ ok, fileToken, downloadUrl, filename }`

---

## 🧭 推荐工作流

### 完整内容发布全链路

```
1. postfast_list_accounts(brandId)
   → 确认平台账号已连接

2. 生成图文内容（AI 创作）

3. postfast_upload_media(brandId, filename, mimeType, fileBase64)
   → 获取 storageKey

4. postfast_publish(brandId, platform, caption, mediaStorageKeys=[storageKey], scheduledAt)
   → 发布或排期

5. update_task(taskId, status="done", description="已发布至 Instagram，postId=xxx")
   → 看板记录

6. lark_notify(brandId, title="发布成功 ✅", content="...")
   → 通知主理人
```

### 排期日历管理

```
1. postfast_list_posts(brandId, status="scheduled")
   → 查看本周所有排期帖子

2. 如需调整：
   → postfast_delete_post(brandId, postId)   // 取消旧排期
   → postfast_publish(...)                    // 重新排期

3. create_task / update_task 更新看板记录
```

### Google 评论批量回复（推荐每日）

```
1. create_task(title="Google评论巡检 YYYY-MM-DD", status="in_progress")

2. google_get_reviews(brandId, limit=20)
   → 筛选 replyText == null 的未回复评论

3. for each:
   → 生成个性化回复（参考品牌描述和语调）
   → google_reply_review(brandId, reviewId, replyText)

4. update_task(status="done")
5. lark_notify(title="评论巡检完成 ✅", content="今日回复 N 条评论")
```

### 新品牌社媒账号连接

```
1. postfast_generate_connect_link(brandId, label="品牌名")
   → 获取 connectUrl

2. lark_notify(brandId, title="请连接您的社媒账号",
     content="点击链接连接您的社媒账号：[connectUrl]",
     actionUrl=connectUrl)
   → 把链接发给品牌主理人

3. （主理人点击链接完成授权后）
   postfast_list_accounts(brandId)
   → 确认账号已连接
```

---

## ⚠️ 注意事项

- **Agent 侧零密钥** — 所有 API Key 由 AMC 服务端从数据库自动注入，Agent 永远不接触原始凭证
- `scheduledAt` 必须是 **UTC 时间** — 北京时间 11:00 = `T03:00:00Z`
- `mediaStorageKeys` > `mediaUrls` — 优先使用 PostFast 原生上传（质量/速度更好）
- Google 评论回复**必须配置 PostFast**（PostFast 代管 Google OAuth）
- Lark Drive 上传大文件（>20MB）建议先压缩

---

## 📋 REST API 备选（MCP 不可用时）

```
POST https://amc-kanban.immedi.ai/api/integrations/postfast
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "brandId": "<品牌ID>",
  "action": "list_posts",
  "status": "scheduled",
  "limit": 20
}
```

**可用 action**: `test_connection` · `list_accounts` · `list_posts` · `delete_post` · `generate_connect_link` · `get_gbp_locations`

---

## 📋 MCP 连接配置

```json
{
  "mcpServers": {
    "amc-kanban": {
      "url": "https://amc-kanban.immedi.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer <你的 AGENT_API_KEY>"
      }
    }
  }
}
```

### 完整工具列表（20 个）

| 类别 | 工具 |
|------|------|
| 品牌配置 | `get_brand_config` · `update_brand_config` |
| Agent 档案 | `get_agent_profile` · `update_agent_profile` |
| 看板任务 | `list_tasks` · `create_task` · `update_task` |
| 账号 & 动态 | `update_accounts` · `post_action_item` |
| PostFast 账号 | `postfast_list_accounts` · `postfast_generate_connect_link` |
| PostFast 帖子 | `postfast_list_posts` · `postfast_delete_post` |
| PostFast 媒体 | `postfast_upload_media` |
| PostFast 发布 | `postfast_publish` · `postfast_reply_review` |
| Google Business | `google_get_reviews` · `google_reply_review` |
| Lark | `lark_notify` · `lark_upload_file` · `lark_create_workspace` |
