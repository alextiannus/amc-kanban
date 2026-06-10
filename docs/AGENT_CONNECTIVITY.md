# AMC Agent Connectivity and API Guide

版本日期：2026-06-08

## 1. 结论

AMC Agent 是看板的一等用户。当前系统已经提供 MCP、REST API、OpenAPI、SOP、Skill 和 Agent API Key，但文档需要按 Agent 工作路径组织，而不是只按后端服务目录组织。

Agent 推荐接入顺序：

1. 使用 MCP 连接 `/api/mcp`。
2. 加载 `/api/meta/sop`、`/api/meta/openapi`、`/api/meta/skills/amc-integrations`、`/api/meta/avatar-guide`。
3. 查询可运营品牌列表。
4. 每次任务确认目标 `brandId`。
5. 读取品牌 Profile Markdown。
6. 按任务类型调用任务、草稿、素材、TopicFeed、发布、评论或通知接口。

## 2. Agent 连接方式

### 2.1 MCP 推荐方式

适用于 Claude Desktop、Openclaw、Hermes 或其他支持 remote MCP 的 Agent runtime。

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

MCP 的优点：

1. Agent 不需要手写 HTTP 请求。
2. 第三方密钥由看板后端注入，Agent 不持有 PostFast、Google、Lark、OBS 密钥。
3. 工具名描述了意图，适合 Agent 自动选择。
4. 权限在服务端按 Agent API Key 和 `BrandAgent` 绑定校验。

### 2.2 REST API 备选方式

适用于不支持 MCP 的 Agent、Dify HTTP 节点、脚本或调试。

```http
GET https://amc-kanban.immedi.ai/api/agent/brand-config
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json
```

REST 注意事项：

1. 所有品牌级请求必须携带目标 `brandId`。
2. 多品牌 Agent 不得默认操作第一个品牌。
3. 返回 404 可能表示资源不存在，也可能表示当前 Agent 无权访问。
4. 不要向用户展示、日志打印或写入文档完整 API Key。

## 3. Agent 启动检查清单

每次 Agent session 启动时执行：

1. 检查本地是否已有 `AGENT_API_KEY`。
2. 加载 SOP：`GET /api/meta/sop`。
3. 加载 OpenAPI：`GET /api/meta/openapi`。
4. 加载 integrations Skill：`GET /api/meta/skills/amc-integrations`。
5. 加载头像规范：`GET /api/meta/avatar-guide`。
6. 调用 `GET /api/agent/brand-config` 或 MCP `get_brand_config`。
7. 如果返回多个品牌，依据任务上下文确认目标品牌。
8. 调用 `GET /api/brands/{brandId}/profile?refresh=1` 或 MCP `get_brand_profile_markdown`。
9. 为有意义工作创建或更新看板任务。

## 4. Agent 权限边界

1. Agent 只能访问 active 绑定的品牌。
2. Agent 不可自行创建品牌；品牌必须由人类在订阅流程中创建。
3. Agent 可更新被授权品牌的 profile/config，但不得跨品牌写入资料。
4. Agent 可写入任务、草稿、素材、TopicFeed、ActionItem。
5. Agent 可执行发布/排期，但是否需要审批由品牌 `autoPilot` 决定。
6. Agent 不应持有第三方服务密钥；PostFast、Google、Lark、OBS 凭证由看板后端管理。

## 5. MCP 工具能力地图

### 5.1 品牌与上下文

| 工具 | 用途 |
| --- | --- |
| `get_brand_config` | 获取当前 Agent 可运营品牌列表，或读取某个品牌配置与账号摘要 |
| `update_brand_config` | 更新被授权品牌的基础资料和集成配置 |
| `get_brand_profile_markdown` | 读取品牌 Profile Markdown |
| `refresh_brand_profile_markdown` | 刷新品牌 Profile Markdown 自动快照 |

### 5.2 Agent 名片

| 工具 | 用途 |
| --- | --- |
| `get_agent_profile` | 读取 Agent 自己的名片 |
| `update_agent_profile` | 更新 nickname、introduction、workflow、insights、themeColor、avatar |

### 5.3 任务与待办

| 工具 | 用途 |
| --- | --- |
| `list_tasks` | 读取任务列表 |
| `create_task` | 创建可追踪任务 |
| `update_task` | 更新任务内容、状态、requiredInput |
| `post_action_item` | 为品牌主理人创建审批或待办 |

### 5.4 社媒账号与发布

| 工具 | 用途 |
| --- | --- |
| `board_list_social_accounts` | 查看品牌已连接账号 |
| `board_generate_account_connect_link` | 生成账号连接链接 |
| `board_list_published_content` | 查看已发布/已排期内容 |
| `board_delete_scheduled_content` | 删除已排期内容 |
| `board_upload_media` | 上传发布用媒体并返回 storageKey |
| `publish` / `board_publish_content` | 发布或排期内容 |

兼容别名：`list_accounts`、`connect_account`、`upload_asset`、`postfast_*` 系列。新流程应优先使用 `board_*` 和 `publish`。

### 5.5 评论与反馈

| 工具 | 用途 |
| --- | --- |
| `google_get_reviews` | 获取 Google 评论 |
| `google_reply_review` | 回复 Google 评论 |
| `board_reply_review` | 通过看板后端回复 Google/Yelp 评论 |

### 5.6 Lark

| 工具 | 用途 |
| --- | --- |
| `lark_notify` | 通知品牌主理人 |
| `lark_create_workspace` | 创建 Lark Drive 工作区 |
| `lark_upload_file` | 上传文件到 Lark Drive 并写入素材记录 |

## 6. REST API Agent 工作路径

### 6.1 获取可运营品牌

```http
GET /api/agent/brand-config
Authorization: Bearer <AGENT_API_KEY>
```

返回为空时，说明当前 Agent 尚未绑定订阅品牌。Agent 应停止品牌任务并请求人类在看板中创建品牌、购买订阅并绑定 Agent。

### 6.2 读取品牌 Profile Markdown

```http
GET /api/brands/{brandId}/profile?refresh=1
Authorization: Bearer <AGENT_API_KEY>
```

必须在内容创作、Research、发布、评论回复前读取。

### 6.3 创建和更新任务

```http
POST /api/tasks
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "title": "Prepare weekend brunch campaign drafts",
  "description": "Create campaign angles, draft copy, and schedule content.",
  "status": "todo",
  "tags": ["content", "brunch"]
}
```

阻塞时：

```http
PATCH /api/tasks/{taskId}/status
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "status": "pending",
  "requiredInput": "Please confirm which brand this request belongs to: Brand A or Brand B."
}
```

### 6.4 TopicFeed Research

读取：

```http
GET /api/brands/{brandId}/topics?q=brunch&tag=content-angle
Authorization: Bearer <AGENT_API_KEY>
```

写入：

```http
POST /api/brands/{brandId}/topics
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "title": "Weekend brunch content angles",
  "summary": "Local trend notes and campaign ideas.",
  "tags": ["brunch", "local-trend", "content-angle"],
  "sourceUrl": "https://example.com/source",
  "markdown": "# Weekend brunch content angles\n\n## Findings\n- ...\n\n## Content Angles\n- ..."
}
```

### 6.5 素材库

读取素材：

```http
GET /api/brands/{brandId}/assets?q=menu&folder=brunch
Authorization: Bearer <AGENT_API_KEY>
```

写入素材建议优先使用 MCP `board_upload_media`。REST 上传接口也存在，但 Agent runtime 处理二进制/大文件时更容易出错。

### 6.6 Post 中文 发布内容

创建草稿：

```http
POST /api/brands/{brandId}/drafts
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "caption": "New brunch menu this weekend.",
  "hashtags": ["brunch", "weekend"],
  "accountId": "social_account_id",
  "scheduledAt": "2026-06-10T15:00:00.000Z",
  "agentNote": "Draft created by AMC Agent."
}
```

提交草稿：

```http
PATCH /api/brands/{brandId}/drafts/{draftId}/submit
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "note": "Ready for delivery."
}
```

规则：

1. `autoPilot = true`：直接发布或排期。
2. `autoPilot = false`：进入 `pending_review` 并等待人类批准。
3. 修改已排期草稿后再次 submit，会取消旧排期并重建。

### 6.7 发布和排期

推荐 MCP：`publish` / `board_publish_content`。

REST 可调用：

```http
POST /api/brands/{brandId}/posts/publish
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "platform": "instagram",
  "caption": "New brunch menu this weekend.",
  "mediaUrls": ["https://example.com/image.jpg"],
  "hashtags": ["brunch", "weekend"],
  "scheduledAt": "2026-06-10T15:00:00.000Z",
  "accountId": "social_account_id"
}
```

如果内容需要老板审批，应优先走 Draft Service，而不是直接 publish。

## 7. 推荐 Agent 工作流

### 7.1 内容创作与发布

1. `get_brand_config` 确认目标品牌和 `autoPilot`。
2. `get_brand_profile_markdown` 读取品牌上下文。
3. 查询 TopicFeed 和素材库。
4. 缺少素材时创建/更新任务为 `pending`。
5. 创建 ContentDraft。
6. 调用 submit。
7. 自动驾驶品牌直接发布/排期；老板审批品牌等待 ActionItem。
8. 更新任务状态和交付摘要。

### 7.2 Research 沉淀

1. 读取品牌 Profile。
2. 查询已有 TopicFeed。
3. 整理新发现为 Markdown。
4. 写入 TopicFeed。
5. 在相关任务 description 中链接 topicId 或标题。

### 7.3 评论回复

1. 获取评论列表。
2. 对敏感/高风险评论创建 ActionItem 等待人类确认。
3. 对低风险评论可按品牌策略直接回复。
4. 记录处理结果到任务或 ActionItem。

## 8. 当前文档完整性评估

### 已经清楚的部分

1. MCP 和 REST 两种连接方式已经明确。
2. Agent API Key 的使用方式已经明确。
3. 多品牌边界和禁止 Agent 创建品牌的原则已经明确。
4. Brand Profile Markdown、TopicFeed、草稿、素材库、发布、评论、任务状态闭环已有说明。
5. API Services 已按后端服务域整理。
6. `skills/kanban-openapi.yaml` 已覆盖 Agent 高频 REST endpoints：Brand Config、Brand Profile、Social Account、Asset、Draft、TopicFeed、ActionItem、Publish、Task。
7. `skills/amc-integrations.md` 已更新为 MCP-first，推荐使用 `board_*` 和 `publish` 工具名。
8. MCP server 已补齐 Agent 高频工具：TopicFeed、Draft、Asset Library、Publish、Review、Lark、Task、Brand Profile。

### 仍需补强的部分

1. MCP 工具清单仍是手写文档，建议后续自动生成 manifest，降低工具实现和文档漂移。
2. Dify HTTP 节点如何配置鉴权、错误处理和 TopicFeed -> dataset 同步还需要单独补一页。
3. Agent API Key 仍缺少 scope、rate limit、过期策略和调用审计视图。
4. OpenAPI 目前聚焦 Agent 高频能力；Admin 和内部运维接口不建议暴露给 Agent 文档。

## 9. 建议下一步

1. 为 `/api/mcp` 增加或生成工具 manifest，降低手工文档漂移。
2. 增加 Dify 接入指南，包含 HTTP headers、失败重试、TopicFeed 到 dataset 的同步策略。
3. 为 Agent API Key 增加 scope、rate limit、过期策略和调用审计。
