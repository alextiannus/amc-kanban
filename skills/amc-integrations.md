# AMC Skill: Board Integrations and Agent Tools

版本：v3.0 · 适用：OpenClaw / Claude / Dify / 任意支持 MCP 或 REST 的 AMC Agent

## 1. 总原则

AMC Agent 是 AI Marketing Crew 看板的一等用户。默认使用 MCP 工具执行工作；仅当 MCP 不可用时使用 REST API fallback。

Agent 不持有 PostFast、Google、Lark、Huawei OBS 等第三方密钥。第三方凭证由品牌设置或主理人配置在看板中，MCP/REST 后端自动注入。

品牌级操作必须先确认目标 `brandId`。一个 Agent 可以运营多个品牌，禁止默认操作第一个品牌。

## 2. 推荐连接

MCP endpoint：

```json
{
  "mcpServers": {
    "amc-kanban": {
      "url": "https://amc-kanban.immedi.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer <AGENT_API_KEY>"
      }
    }
  }
}
```

REST fallback：

```http
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json
```

## 3. 启动必做

1. `get_brand_config`：读取当前 Agent 负责运营的品牌列表。
2. 记录每个品牌的 `id/name/timezone/status`，保存为 `KANBAN_BRAND_IDS` 与 `KANBAN_BRAND_LIST`。
3. 多品牌时确认本次目标 `brandId`，只能从已记录列表中选择。
4. `get_brand_profile_markdown`：读取品牌上下文。
5. `get_agent_profile` / `update_agent_profile`：保持 Agent 名片完整。
6. 有可追踪工作时，先 `create_task` 或更新已有任务。

服务端会在所有品牌修改接口上再次校验当前 Agent 是否拥有目标品牌的 active `BrandAgent` 绑定。若返回 403，不要重试写入或猜测其他 brandId，应重新 `get_brand_config` 并向人类确认绑定关系。

## 4. MCP 工具清单

### 4.1 品牌与 Profile

- `get_brand_config`：读取当前 Agent 可运营品牌列表，或指定品牌配置。指定 `brandId` 时，服务端会校验当前 Agent 是否绑定该品牌。
- `update_brand_config`：更新已绑定品牌的基础资料或集成配置；不可创建新品牌。服务端会 double check 当前 Agent 对该 `brandId` 的 active 绑定权限。
- `get_brand_profile_markdown`：读取品牌 Profile Markdown。
- `refresh_brand_profile_markdown`：刷新品牌 Profile Markdown 自动快照。
- `update_brand_profile_markdown`：写入完整品牌上下文 Markdown。

### 4.2 Agent 名片

- `get_agent_profile`：读取当前 Agent 自己的名片。
- `update_agent_profile`：更新 nickname、introduction、workflow、insights、themeColor、avatar。

### 4.3 任务闭环

- `list_tasks`：读取当前 Agent 任务。
- `create_task`：创建任务。多品牌 Agent 必须传 `brandId`，避免任务落到错误品牌。
- `update_task`：更新任务和状态，可设置或修改 `brandId`。阻塞时必须写 `requiredInput`。
- `post_action_item`：给品牌主理人创建待办/审批。

### 4.4 Research / TopicFeed

- `board_list_topics`：读取品牌 TopicFeed research markdown 文档。
- `board_get_topic`：读取单篇 TopicFeed。
- `board_save_topic`：创建或更新 TopicFeed。
- `board_archive_topic`：归档 TopicFeed。

写入示例：

```json
{
  "brandId": "<品牌ID>",
  "title": "Weekend brunch content angles",
  "summary": "Local trend notes and campaign ideas.",
  "tags": ["brunch", "local-trend", "content-angle"],
  "sourceUrl": "https://example.com/source",
  "markdown": "# Weekend brunch content angles\n\n## Findings\n- ..."
}
```

### 4.5 素材库

- `board_list_assets`：读取品牌素材库。
- `board_upload_asset`：上传素材到看板素材库。优先 Huawei OBS，未配置时 local fallback。
- `board_upload_media`：上传发布用媒体到 PostFast 并返回 `storageKey`。当目标是直接发布且品牌配置了 PostFast 时使用。

素材库上传示例：

```json
{
  "brandId": "<品牌ID>",
  "filename": "brunch-menu.jpg",
  "mimeType": "image/jpeg",
  "fileBase64": "<base64，不含 data: 前缀>",
  "folder": "brunch",
  "aiTags": ["menu", "brunch"],
  "aiCaption": "Weekend brunch menu photo"
}
```

### 4.6 Post 中文 发布内容

- `board_list_drafts`：读取草稿。
- `board_save_draft`：创建或更新草稿。保存后再提交。
- `board_submit_draft`：提交草稿。自动驾驶品牌直接发布/排期；老板审批品牌进入审批。

草稿示例：

```json
{
  "brandId": "<品牌ID>",
  "caption": "New brunch menu this weekend.",
  "hashtags": ["brunch", "weekend"],
  "accountId": "<社媒账号ID>",
  "scheduledAt": "2026-06-10T15:00:00Z",
  "assetIds": ["<素材ID>"],
  "agentNote": "Draft created after TopicFeed research."
}
```

提交示例：

```json
{
  "brandId": "<品牌ID>",
  "draftId": "<草稿ID>",
  "note": "Ready for delivery."
}
```

规则：

1. `autoPilot = true`：直接发布或排期。
2. `autoPilot = false`：进入老板审批，生成 ActionItem。
3. 已排期草稿修改后再次提交，会取消旧排期并重建。

### 4.7 社媒账号与发布

- `board_list_social_accounts`：查看品牌已连接账号。
- `board_generate_account_connect_link`：生成社媒账号连接链接。
- `board_list_published_content`：查看已发布/已排期内容。
- `board_delete_scheduled_content`：删除已排期内容。
- `publish` / `board_publish_content`：直接发布或排期。若品牌需要老板审批，应优先使用草稿流。

发布示例：

```json
{
  "brandId": "<品牌ID>",
  "platform": "instagram",
  "caption": "New brunch menu this weekend.",
  "mediaStorageKeys": ["<storageKey>"],
  "hashtags": ["brunch", "weekend"],
  "scheduledAt": "2026-06-10T15:00:00Z",
  "accountId": "<社媒账号ID>"
}
```

### 4.8 评论与反馈

- `google_get_reviews`：获取 Google 评论。
- `google_reply_review`：回复 Google 评论。
- `board_reply_review`：通过看板后端回复 Google/Yelp 评论。
- `execute_brand_action`：统一营销动作入口，可执行回复、通知和发布等动作。

### 4.9 Lark

- `lark_notify`：通知品牌主理人。
- `lark_create_workspace`：创建 Lark Drive 工作区。
- `lark_upload_file`：上传文件到 Lark Drive，并写入素材记录。

## 5. 兼容别名

以下旧工具名仍可用，但新 Agent 应优先使用上文的 `board_*` 和 `publish`：

- `list_accounts` -> `board_list_social_accounts`
- `connect_account` -> `board_generate_account_connect_link`
- `upload_asset` -> `board_upload_media`
- `postfast_upload_media` -> `board_upload_media`
- `postfast_publish` -> `publish`
- `postfast_list_posts` -> `board_list_published_content`
- `postfast_delete_post` -> `board_delete_scheduled_content`
- `reply_review` -> `board_reply_review`
- `notify_owner` -> `lark_notify`

## 6. 推荐工作流

### 6.1 内容创作与发布

1. `get_brand_config`
2. `get_brand_profile_markdown`
3. `board_list_topics`
4. `board_list_assets`
5. `board_save_draft`
6. `board_submit_draft`
7. `update_task`
8. 必要时 `lark_notify`

### 6.2 Research 沉淀

1. `get_brand_profile_markdown`
2. `board_list_topics`
3. `board_save_topic`
4. `update_task`

### 6.3 素材整理

1. `board_upload_asset`
2. `board_list_assets`
3. `board_save_draft` 引用 `assetIds`

### 6.4 直接发布

仅在品牌策略允许且无需审批时使用：

1. `board_list_social_accounts`
2. `board_upload_media` 或使用已有 `mediaUrls`
3. `publish`
4. `board_list_published_content`
5. `update_task`

## 7. 能力边界

1. Instagram / Facebook / TikTok 的评论和私信自动拉取/回复不属于默认能力，需要官方 API 凭证和 webhook。
2. PostFast scheduled post 当前本地封装没有原生 update；草稿更新采用取消旧排期再重建。
3. Agent 不创建品牌；品牌必须先由人类在订阅流程中创建并绑定 Agent。
4. Dify 是工作流与知识库中心；看板 API 不承载复杂业务编排。
