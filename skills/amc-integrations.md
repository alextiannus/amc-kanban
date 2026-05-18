# AMC Skill: Integrations — PostFast · Google Business · Lark Drive

> **版本**: v1.1 · **适用**: OpenClaw / Claude / 任意支持 MCP 的 AI Agent

本 Skill 描述如何通过 AMC Kanban MCP 服务，让 AI Agent 直接调用 PostFast 发布、Google Business 评论管理、Lark Drive 文件管理功能，**无需在 Agent 侧持有任何第三方密钥**（凭证由主理人配置在品牌设置中，MCP 服务端自动注入）。

---

## 🔗 接入前提

1. 已通过 `agent-instructions.md` 完成 Agent 注册及品牌初始化
2. 主理人已在 **品牌主看板 → 设置** 中填写所需集成凭证（见下表）

| 功能模块 | 需配置字段 |
|---------|-----------|
| PostFast 发布 | `postfastApiKey` |
| Google 评论读取 | `googlePlaceId` + `googleApiKey` |
| Google 评论回复 | `postfastApiKey`（PostFast 代理 OAuth）|
| Lark 通知 | `larkBotWebhook` 或 `larkAppId`+`larkAppSecret`+`larkOwnerId` |
| Lark Drive 上传 | `larkAppId` + `larkAppSecret` |

---

## 📡 MCP 工具速查

### PostFast — 社媒发布

#### `postfast_publish`
发布或排期一条社媒帖子。

```json
{
  "brandId": "<品牌ID>",
  "platform": "instagram",
  "caption": "今日特惠 🔥 红油水煮鱼只要 ¥58！",
  "mediaUrls": ["https://cdn.example.com/fish.jpg"],
  "hashtags": ["成都美食", "水煮鱼"],
  "scheduledAt": "2025-06-01T11:00:00+08:00"
}
```

**返回**: `{ ok, postId, url, platform, scheduledAt }`  
**支持平台**: `instagram` `tiktok` `xiaohongshu` `facebook` `youtube` `x` `linkedin` `threads` `bluesky` `pinterest` `snapchat`

> ⚠️ `scheduledAt` 省略 = 立即发布。格式必须是 ISO 8601 含时区。

---

#### `postfast_reply_review`
通过 PostFast 回复 Google / Yelp 评论。

```json
{
  "brandId": "<品牌ID>",
  "platform": "google",
  "reviewId": "<reviewId from google_get_reviews>",
  "replyText": "感谢您的光临！期待下次再见 🙏"
}
```

**返回**: `{ ok, reviewId, platform, replied }`

---

### Google Business — 评论管理

#### `google_get_reviews`
拉取品牌最新 Google 评论。

```json
{
  "brandId": "<品牌ID>",
  "limit": 10
}
```

**返回**:
```json
{
  "ok": true,
  "count": 5,
  "reviews": [
    {
      "reviewId": "...",
      "reviewer": "张三",
      "rating": 5,
      "comment": "超好吃！",
      "createTime": "2025-05-15T10:30:00Z",
      "replyText": null
    }
  ]
}
```

**推荐工作流**:
1. 调用 `google_get_reviews` 获取未回复评论（`replyText == null`）
2. 分析评论情感 → 生成个性化回复草稿
3. 调用 `google_reply_review` 发布回复
4. 调用 `create_task` / `update_task` 记录完成情况

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
  "title": "🔔 新任务已完成",
  "content": "**小红书帖子**已排期发布，预计明日上午11点推送。\n\n[查看帖子详情](https://xhs.com/...)",
  "actionUrl": "https://amc-kanban.immedi.ai/board",
  "urgent": false
}
```

**返回**: `{ ok, channel: "webhook" | "direct_message" }`

> 推荐使用 `urgent: true` 发送需要人类立即处理的警报（卡片变红）。

---

#### `lark_create_workspace`
为品牌在 Lark Drive 创建工作区文件夹（每个品牌调用一次即可）。

```json
{
  "brandId": "<品牌ID>"
}
```

**返回**: `{ ok, folderToken, folderUrl }`  
系统会自动把 `folderToken` 保存到品牌配置，后续 `lark_upload_file` 自动使用。

---

#### `lark_upload_file`
上传文件到品牌 Lark Drive 工作区。

```json
{
  "brandId": "<品牌ID>",
  "filename": "campaign_banner_june.jpg",
  "mimeType": "image/jpeg",
  "fileBase64": "<base64字符串，不含 data: 前缀>"
}
```

**返回**: `{ ok, fileToken, downloadUrl, filename }`  
`fileToken` 可用作帖子的素材引用传给 `postfast_publish.mediaUrls`（通过代理下载 URL）。

---

## 🧭 推荐工作流

### 内容发布全链路（推荐）

```
1. list_tasks(assignedToMe=true, status="in_progress")
   → 找到待发布任务

2. google_get_reviews(brandId, limit=5)
   → 分析评论情绪，生成对应内容方向

3. (可选) lark_upload_file(...)
   → 上传配图，获取 fileToken/downloadUrl

4. postfast_publish(brandId, platform, caption, mediaUrls, scheduledAt)
   → 发布帖子

5. update_task(taskId, status="done", description="已发布至 Instagram，postId=xxx")
   → 看板记录

6. lark_notify(brandId, title="发布成功", content="...")
   → 通知主理人
```

### 评论批量回复（推荐每日）

```
1. create_task(title="Google评论巡检 YYYY-MM-DD", status="in_progress")

2. google_get_reviews(brandId, limit=20)
   → 筛选 replyText == null 的未回复评论

3. for each unanswered review:
     → 生成个性化、有温度的回复（参考品牌描述和语调）
     → google_reply_review(brandId, reviewId, replyText)

4. update_task(taskId, status="done", description="已回复 N 条评论")

5. lark_notify(title="评论巡检完成", content="今日回复 N 条 Google 评论")
```

---

## ⚠️ 注意事项

- **所有 MCP 工具只接受 brandId**，不需要传 API Key — 凭证由 AMC 服务端从数据库自动加载
- 发布前检查平台账号是否已配置（通过 `get_brand_config` 查看 `accounts` 列表）
- `mediaUrls` 必须是**公开可访问**的 URL，PostFast 会从该 URL 下载素材
- Lark Drive 上传大文件（>20MB）时建议分片，或先压缩后上传
- Google 评论回复**必须配置 PostFast**（PostFast 代管 Google OAuth），直接 Google API 需要品牌主自行申请 OAuth

---

## 📋 MCP 连接配置（OpenClaw / Claude Desktop）

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

完整工具列表（共 15 个）：

| 类别 | 工具 |
|------|------|
| 品牌配置 | `get_brand_config` · `update_brand_config` |
| Agent 档案 | `get_agent_profile` · `update_agent_profile` |
| 看板任务 | `list_tasks` · `create_task` · `update_task` |
| 账号管理 | `update_accounts` · `post_action_item` |
| PostFast | `postfast_publish` · `postfast_reply_review` |
| Google Business | `google_get_reviews` · `google_reply_review` |
| Lark | `lark_notify` · `lark_upload_file` · `lark_create_workspace` |
