# AI Marketing Crew API Services

版本日期：2026-07-03

## 1. 服务总览

当前系统采用 Next.js Route Handlers 提供 REST API，并通过 `/api/mcp`、`/api/meta/openapi`、`/api/meta/sop`、`/api/meta/skills/amc-integrations` 对外暴露 Agent 接入能力。

本文前半部分按业务域说明稳定接口；第 8 节是由 Route Handler 源码自动生成的完整清单。`/api/meta/openapi` 仅描述允许外部 Agent 使用的子集，不代表全部内部 API。

Agent 视角的连接与工作流手册见：[AGENT_CONNECTIVITY.md](AGENT_CONNECTIVITY.md)。

设计原则：

1. Dify-first：复杂工作流与知识库管理优先由 Dify 承载。
2. API layer 负责认证、权限、数据持久化、第三方集成、fallback 和审计。
3. 所有品牌级 API 必须执行品牌资源级授权。
4. AI Agent 使用 Bearer API Key；人类用户使用 Cookie session。
5. 所有品牌运营数据都以 `brandId` 作为隔离边界。

## 2. 认证模型

### 2.1 Human Session

用于 Web UI 和人类管理操作。

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/register`

### 2.2 Agent API Key

用于 AMC Agent、Openclaw、Dify 或外部 Agent 调用。

请求头：

```http
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json
```

API Key 必须映射到 `User.type = AI_AGENT`，并且访问品牌时必须存在 active `BrandAgent` 绑定。

## 3. API Service Domains

## 3.1 Auth Service

职责：登录、登出、当前用户、注册。

接口：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/register`

主要消费者：Web UI。

## 3.2 Profile Service

职责：人类用户资料、组织成员、主理人 dashboard 数据。

接口：

- `GET/PATCH /api/profile`
- `GET/POST /api/profile/organization-members`
- `GET /api/profile/principal-dashboard`

主要消费者：品牌主、AMC 主理人、Admin。

## 3.3 Agent Identity Service

职责：Agent 注册、名片维护、API Key 生成、Agent 列表和详情。

接口：

- `GET /api/agents`
- `GET/PATCH/DELETE /api/agents/:id`
- `GET/POST /api/agents/profile`
- `POST /api/agents/register`
- `POST /api/agents/keys`
- `GET/PATCH /api/agent/profile`
- `PATCH /api/agent/accounts`
- `PATCH /api/agent/insights`

说明：

- `/api/agents/profile` 是 Agent 初始化的主入口。
- `/api/agents/keys` 用于人类生成新的 Agent 连接密钥。
- Agent profile 应包含 nickname、introduction、workflow、insights、themeColor 和 avatar。

## 3.4 Brand Service

职责：品牌 CRUD、品牌详情、设置、品牌 owner、品牌 Agent 绑定、品牌凭证与 workspace 初始化。

接口：

- `GET/POST /api/brands`
- `GET/PATCH/DELETE /api/brands/:id`
- `POST /api/brands/:id/logo`
- `GET/PATCH /api/brands/:id/settings`
- `GET/PATCH /api/brands/:id/profile`
- `GET/POST /api/brands/:id/owners`
- `PATCH/DELETE /api/brands/:id/owners/:userId`
- `GET/POST/DELETE /api/brands/:id/agents`
- `GET/POST/PATCH /api/agent/brand-config`
- `GET /api/agent/admin/brands`
- `GET/PATCH /api/agent/admin/brands/:id`

权限：

- Human：ADMIN、BRAND_DIRECTOR、BrandOwner 或组织授权。
- Agent：必须 active 绑定到目标 brand。

说明：

- 品牌创建应由订阅流程支撑。
- 创建品牌后会 best-effort 初始化 workspace：Huawei OBS 优先，Lark 可选。

## 3.5 Subscription Service

职责：订阅计划、支付确认、品牌绑定、Admin 订阅管理。

接口：

- `GET/POST /api/subscription`
- `POST /api/subscription/confirm`
- `GET/POST/PATCH /api/brands/:id/subscription`
- `POST /api/brands/:id/subscription/confirm`
- `PATCH /api/admin/subscriptions/:id`
- `POST /api/integrations/stripe/webhook`

业务规则：

- 每个品牌绑定一个订阅套餐。
- 用户可创建多个品牌，每个新增品牌都需要购买或绑定订阅。
- 订阅权益包括内容运营、探店活动、品牌主理人支持和 add-ons。

## 3.6 Task Service

职责：看板任务、状态流转、评论、重试发布、未分配任务。

接口：

- `GET/POST /api/tasks`
- `GET/PATCH/DELETE /api/tasks/:id`
- `PATCH /api/tasks/:id/status`
- `GET/POST /api/tasks/:id/comments`
- `POST /api/tasks/:id/retry-publish`
- `DELETE /api/tasks/unassigned`

状态：

- `todo`
- `in_progress`
- `pending`
- `done`
- `void`

使用规则：

- Agent 工作必须上板。
- 遇到阻塞时置为 `pending` 并写清 `requiredInput`。
- 完成时写入交付摘要并置为 `done`。

## 3.7 Action Item Service

职责：面向人类的审批、确认、待处理事项。

接口：

- `GET /api/brands/:id/actions`
- `PATCH /api/brands/:id/actions/:aid/approve`
- `PATCH /api/brands/:id/actions/:aid/reject`
- `POST/PATCH /api/agent/action-items`
- `GET/POST /api/agent/pending-approvals`

典型场景：

- 老板审批模式下的草稿审批。
- 评论回复建议确认。
- 人类输入请求。

## 3.8 Draft Service

职责：草稿创建、读取、编辑、提交、审批、驳回、发布/排期。

接口：

- `GET/POST /api/brands/:id/drafts`
- `GET/PATCH /api/brands/:id/drafts/:draftId`
- `PATCH /api/brands/:id/drafts/:draftId/submit`
- `PATCH /api/brands/:id/drafts/:draftId/approve`
- `PATCH /api/brands/:id/drafts/:draftId/reject`

核心规则：

1. `Brand.autoPilot = true`：submit 后直接发布或排期。
2. `Brand.autoPilot = false`：submit 后进入 `pending_review`，生成 ActionItem。
3. approve 会触发发布或排期。
4. 已排期草稿更新时，如果已有 `platformPostId` 且未发布，先调用 PostFast 删除旧排期，再重建新排期。
5. 草稿快照会 best-effort 持久化到 Huawei OBS。

请求体示例：

```json
{
  "caption": "New brunch menu this weekend.",
  "hashtags": ["brunch", "weekend"],
  "accountId": "social_account_id",
  "scheduledAt": "2026-06-10T15:00:00.000Z",
  "agentNote": "Updated based on owner feedback."
}
```

## 3.9 Asset Library Service

职责：品牌素材库上传、读取、整理、归档。

接口：

- `GET/POST /api/brands/:id/assets`
- `GET/POST /api/brands/:id/assets/upload`
- `PATCH/DELETE /api/brands/:id/assets/:assetId`
- `GET /api/dashboard/assets`

上传优先级：

1. Huawei OBS
2. PostFast
3. Lark
4. Local filesystem fallback

字段：

- `url`
- `filename`
- `mimeType`
- `aiTags`
- `aiCategory`
- `aiCaption`
- `aiReady`
- `sourceType`

## 3.10 Research TopicFeed Service

职责：品牌 research topics 的 Markdown 文档读写。

接口：

- `GET /api/brands/:id/topics`
- `POST /api/brands/:id/topics`
- `GET /api/brands/:id/topics/:topicId`
- `PATCH /api/brands/:id/topics/:topicId`
- `DELETE /api/brands/:id/topics/:topicId`

查询参数：

- `q`：搜索 title、summary、markdown、tag。
- `tag`：按单个 tag 过滤。
- `status`：`active`、`archived`、`all`。
- `limit`：默认 50，最大 100。

写入示例：

```json
{
  "title": "Weekend brunch content angles",
  "summary": "本周末 brunch 推广可用的本地趋势与内容角度。",
  "tags": ["brunch", "local-trend", "content-angle"],
  "sourceUrl": "https://example.com/source",
  "markdown": "# Weekend brunch content angles\n\n## Findings\n- ...\n\n## Content Angles\n- ..."
}
```

说明：

- DELETE 是软归档，设置 `status = archived`。
- AMC Agent 可写入和读取被绑定品牌的 TopicFeed。
- 后续建议同步到 Dify dataset，作为品牌研究知识库。

## 3.11 Social Account Service

职责：品牌社媒账号连接、补录、管理。

接口：

- `GET/POST /api/brands/:id/accounts`
- `PATCH/DELETE /api/brands/:id/accounts/:aid`
- `PATCH /api/agent/accounts`

字段：

- `platformId`
- `handle`
- `displayName`
- `profileUrl`
- `loginUsername`
- `loginPassword`
- `autoPilot`
- `accessToken` / `refreshToken`

说明：

- 非 Admin 响应中登录密码应被 mask。
- 草稿发布必须选择有效 account。

## 3.12 Publishing and Content Service

职责：社媒发布、排期、帖子列表、PostFast/Google 直连路径。

接口：

- `GET/POST /api/brands/:id/posts`
- `GET/POST /api/brands/:id/posts/publish`
- `POST /api/integrations/postfast`
- `GET /api/integrations/status`

底层能力：

- `postfastPublish`
- `postfastDeletePost`
- Google GBP Local Post direct publish

说明：

- PostFast 当前没有本地封装的 scheduled post update；更新排期采用 delete + recreate。
- 发布服务应保持 transport/integration/fallback 角色，不承载 Dify 工作流编排。

## 3.13 Social Insight and Review Service

职责：评论、点评、社媒洞察、竞品/ROI 分析。

接口：

- `GET /api/brands/:id/social-insight`
- `GET /api/brands/:id/reviews`
- `GET /api/integrations/google/reviews`
- `GET /api/integrations/google/oauth`
- `GET /api/integrations/google/oauth/callback`
- `POST /api/integrations/google/oauth/disconnect`
- `GET /api/integrations/google/oauth/mock-consent`

说明：

- Google OAuth 用于评论、地点与 GBP 能力。
- Yelp/Google 回复能力优先通过统一 board reply 或 PostFast fallback。

## 3.14 Game Marketing Service

职责：店内扫码活动、抽奖配置、任务配置、海报和参与状态。

接口：

- `GET/POST /api/game/config`
- `POST /api/game/spin`
- `GET /api/game/status`
- `POST /api/game/tasks`
- `POST /api/game/tasks/override`

前端页面：

- `/board/game`
- `/board/game/poster/:brandId`
- `/game/:brandId`

## 3.15 Dashboard and Analytics Service

职责：看板摘要、日历、素材概览、执行活动分析、Agent 周报。

接口：

- `GET /api/dashboard/summary`
- `GET /api/dashboard/calendar`
- `GET /api/dashboard/assets`
- `GET /api/analytics/activity`
- `GET /api/analytics/agents/:id/weekly`
- `GET /api/brands/:id/analytics`

## 3.16 Agent Assignment Service

职责：Agent 分配池、匹配决策、fallback agent、管理员配置。

接口：

- `POST /api/agent-assignment/resolve`
- `GET/PATCH /api/admin/agent-assignment-pool/config`
- `GET/POST /api/admin/agent-assignment-pool/members`
- `PATCH/DELETE /api/admin/agent-assignment-pool/members/:agentId`
- `GET /api/admin/agent-assignment/decisions`

数据模型：

- `AssignmentPoolConfig`
- `AssignmentPoolMember`
- `AssignmentDecisionLog`

## 3.17 Admin Service

职责：系统管理、用户管理、权限、凭证、日志、订阅调整。

接口：

- `GET/POST /api/admin/users`
- `PATCH/DELETE /api/admin/users/:id`
- `POST /api/admin/permissions`
- `GET /api/admin/logs`
- `GET /api/admin/brand-credentials`
- `GET /api/admin/debug/avatar`
- `PATCH /api/admin/subscriptions/:id`

## 3.18 Integration Service

职责：第三方服务连接、浏览器扩展事件、Lark 上传、Stripe webhook。

接口：

- `GET /api/integrations/extension/events`
- `POST /api/integrations/extension/response`
- `POST /api/integrations/extension/test-trigger`
- `POST /api/integrations/lark/upload/:id`
- `POST /api/integrations/stripe/webhook`
- `GET /api/integrations/status`

## 3.19 Meta and Agent Bootstrap Service

职责：向外部 Agent 提供规范、OpenAPI、SOP、Skill、头像指南、MCP。

接口：

- `POST /api/mcp`
- `GET /api/meta/openapi`
- `GET /api/meta/sop`
- `GET /api/meta/sop?download=1`
- `GET /api/meta/avatar-guide`
- `GET /api/meta/skills/amc-integrations`

说明：

- `/api/meta/sop?download=1` 用于 Skill 文件下载。
- `/api/meta/openapi` 来源为 `skills/kanban-openapi.yaml`。
- `/api/meta/sop` 来源为 `skills/agent-instructions.md`。

## 3.20 Realtime Events Service

职责：向前端推送 board update。

接口：

- `GET /api/events`

当前实现：SSE。

## 3.21 Scheduler Service

职责：管理员查看巡检状态、读取历史报告并手动触发排期巡检。

接口：

- `GET/POST /api/scheduler/daily-check`
- `GET /api/scheduler/reports`

权限：仅 `ADMIN`。

## 4. Service Layer Files

核心服务层文件：

- `src/lib/brandAccess.ts`：品牌访问控制。
- `src/lib/subscription/service.ts`：订阅与品牌创建逻辑。
- `src/lib/brandWorkspace.ts`：品牌 workspace 初始化。
- `src/lib/draftSubmission.ts`：草稿提交、审批后发布、排期更新。
- `src/lib/topicFeed.ts`：TopicFeed CRUD 服务。
- `src/lib/integrations/huaweiObs.ts`：Huawei OBS 对象存储。
- `src/lib/integrations/postfast.ts`：PostFast 发布、媒体、点评能力。
- `src/lib/integrations/google.ts`：Google OAuth / GBP 能力。
- `src/lib/mcp/server.ts`：MCP server 能力暴露。

## 5. Data Ownership Matrix

| 数据域 | 主隔离键 | 主要角色 | Agent 可写 | 备注 |
| --- | --- | --- | --- | --- |
| Brand | brandId | Admin / 主理人 / 品牌主 | 部分 | Agent 可更新被授权品牌配置 |
| Subscription | brandId / createdById | 品牌主 / Admin | 否 | 品牌必须有套餐 |
| WorkUnit | assigneeId / brand context | Human / Agent | 是 | Agent 工作上板 |
| ActionItem | brandId | Human / Agent | 是 | 审批和待办 |
| ContentDraft | brandId | Human / Agent | 是 | autoPilot 决定审批或发布 |
| MediaAsset | brandId | Human / Agent | 是 | OBS/PostFast/Lark/Local |
| TopicFeed | brandId | Human / Agent | 是 | Markdown research docs |
| SocialAccount | brandId | Human / Admin | 受限 | 凭证需谨慎返回 |
| GameSession | brandId | Consumer / Brand | 否 | 门店活动参与记录 |

## 6. Error and Security Rules

1. 401：未登录或 API Key 无效。
2. 403：身份有效但角色不允许。
3. 404：资源不存在或不应暴露给当前身份。
4. 400：参数错误、业务前置条件不满足。
5. Agent 不得跨品牌读取或写入数据。
6. 第三方 secrets 不得写入代码、PRD、OpenAPI 示例或日志。
7. 上传和外部请求失败应可恢复；品牌创建不应因可选 workspace 初始化失败而完全失败。

## 7. Open Questions / Follow-up

1. TopicFeed 是否需要双写或异步同步到 Dify dataset。
2. 素材库是否需要正式 Folder 模型和权限模型。
3. 草稿发布是否需要支持平台原生 update scheduled post。
4. API 是否需要统一 Zod schema 和响应 envelope。
5. 是否需要把 Integration Service 从 Next route handlers 拆为独立 worker/service。
6. 是否需要为 Agent API Key 增加 rate limit、scope 和过期策略。

<!-- API_ROUTE_INVENTORY:START -->
## 8. 完整 Route Handler 清单（自动生成）

共 **166** 个 API 路径、**240** 个 HTTP 方法组合。

> 此段由 `npm run docs:api` 从 `src/app/api/**/route.ts` 生成，请勿手工编辑。

| 方法 | 路径 |
| --- | --- |
| GET, PATCH | `/api/admin/agent-assignment-pool/config` |
| GET, POST | `/api/admin/agent-assignment-pool/members` |
| DELETE, PATCH | `/api/admin/agent-assignment-pool/members/{agentId}` |
| GET | `/api/admin/agent-assignment/decisions` |
| GET | `/api/admin/brand-credentials` |
| GET | `/api/admin/brands` |
| DELETE, PATCH | `/api/admin/brands/{id}` |
| PATCH | `/api/admin/companion-messages/{id}/annotate` |
| GET | `/api/admin/conversation-stats` |
| GET | `/api/admin/copywriter-logs` |
| PATCH | `/api/admin/copywriter-logs/{id}/annotate` |
| GET | `/api/admin/debug/avatar` |
| POST | `/api/admin/email/test` |
| GET, POST | `/api/admin/llm-configs` |
| DELETE, PATCH | `/api/admin/llm-configs/{id}` |
| GET | `/api/admin/logs` |
| GET | `/api/admin/message-templates` |
| PATCH | `/api/admin/message-templates/{id}` |
| POST | `/api/admin/message-templates/{id}/test` |
| POST | `/api/admin/permissions` |
| PATCH | `/api/admin/subscriptions/{id}` |
| GET, PATCH | `/api/admin/system-config` |
| GET | `/api/admin/training-export` |
| GET, POST | `/api/admin/users` |
| DELETE, PATCH | `/api/admin/users/{id}` |
| POST | `/api/agent-assignment/resolve` |
| PATCH | `/api/agent/accounts` |
| PATCH, POST | `/api/agent/action-items` |
| GET | `/api/agent/admin/brands` |
| DELETE, GET, PATCH | `/api/agent/admin/brands/{id}` |
| GET, PATCH, POST | `/api/agent/brand-config` |
| PATCH | `/api/agent/insights` |
| GET, POST | `/api/agent/pending-approvals` |
| GET, PATCH | `/api/agent/profile` |
| POST | `/api/agent/snapshots` |
| GET | `/api/agents` |
| DELETE, GET, PATCH | `/api/agents/{id}` |
| POST | `/api/agents/keys` |
| GET, POST | `/api/agents/profile` |
| POST | `/api/agents/register` |
| GET | `/api/analytics/activity` |
| GET | `/api/analytics/agents/{id}/weekly` |
| GET | `/api/analytics/benchmarks` |
| POST | `/api/auth/login` |
| GET, POST | `/api/auth/logout` |
| GET | `/api/auth/me` |
| POST | `/api/auth/register` |
| GET, POST | `/api/brands` |
| DELETE, GET, PATCH | `/api/brands/{id}` |
| GET, POST | `/api/brands/{id}/accounts` |
| DELETE, PATCH | `/api/brands/{id}/accounts/{aid}` |
| GET | `/api/brands/{id}/actions` |
| PATCH | `/api/brands/{id}/actions/{aid}/approve` |
| PATCH | `/api/brands/{id}/actions/{aid}/reject` |
| DELETE, GET, POST | `/api/brands/{id}/agents` |
| GET | `/api/brands/{id}/analytics` |
| GET, POST | `/api/brands/{id}/apify-sync` |
| GET, PATCH, POST | `/api/brands/{id}/assets` |
| DELETE, PATCH | `/api/brands/{id}/assets/{assetId}` |
| POST | `/api/brands/{id}/assets/{assetId}/design` |
| POST | `/api/brands/{id}/assets/confirm-upload` |
| GET | `/api/brands/{id}/assets/presign-upload` |
| GET, POST | `/api/brands/{id}/assets/upload` |
| GET | `/api/brands/{id}/companion/context` |
| GET, POST | `/api/brands/{id}/companion/history` |
| GET | `/api/brands/{id}/companion/sessions` |
| POST | `/api/brands/{id}/copywriter-log` |
| POST | `/api/brands/{id}/copywriter/bulk-generate` |
| POST | `/api/brands/{id}/copywriter/voice-chat` |
| POST | `/api/brands/{id}/copywriter/voice-stream` |
| POST | `/api/brands/{id}/documents` |
| POST | `/api/brands/{id}/documents/{docId}/sync` |
| GET, POST | `/api/brands/{id}/drafts` |
| DELETE, GET, PATCH | `/api/brands/{id}/drafts/{draftId}` |
| PATCH, POST | `/api/brands/{id}/drafts/{draftId}/approve` |
| PATCH | `/api/brands/{id}/drafts/{draftId}/reject` |
| PATCH | `/api/brands/{id}/drafts/{draftId}/submit` |
| POST | `/api/brands/{id}/drafts/{draftId}/trigger-copywriter` |
| DELETE, GET, POST | `/api/brands/{id}/folders` |
| GET, PATCH | `/api/brands/{id}/knowledge` |
| POST | `/api/brands/{id}/logo` |
| POST | `/api/brands/{id}/mcp/execute` |
| GET, POST | `/api/brands/{id}/memory` |
| POST | `/api/brands/{id}/notifications` |
| GET, POST | `/api/brands/{id}/owners` |
| DELETE, PATCH | `/api/brands/{id}/owners/{userId}` |
| GET, POST | `/api/brands/{id}/posts` |
| GET, POST | `/api/brands/{id}/posts/publish` |
| GET, PATCH | `/api/brands/{id}/profile` |
| GET, POST | `/api/brands/{id}/reviews` |
| POST | `/api/brands/{id}/scheduling/recommend` |
| GET, PATCH | `/api/brands/{id}/settings` |
| GET | `/api/brands/{id}/social-insight` |
| GET, PATCH, POST | `/api/brands/{id}/subscription` |
| POST | `/api/brands/{id}/subscription/confirm` |
| GET, POST | `/api/brands/{id}/topics` |
| DELETE, GET, PATCH | `/api/brands/{id}/topics/{topicId}` |
| POST | `/api/brands/{id}/video-director` |
| GET | `/api/client-config` |
| POST | `/api/copywriter/generate-hooks` |
| GET | `/api/dashboard/assets` |
| GET | `/api/dashboard/brand-activity` |
| GET | `/api/dashboard/calendar` |
| GET | `/api/dashboard/summary` |
| GET | `/api/data-analysis` |
| POST | `/api/data-analysis/upload` |
| GET | `/api/events` |
| GET, POST | `/api/game/config` |
| POST | `/api/game/spin` |
| GET | `/api/game/status` |
| POST | `/api/game/tasks` |
| POST | `/api/game/tasks/override` |
| GET | `/api/integrations/extension/download` |
| GET | `/api/integrations/extension/events` |
| POST | `/api/integrations/extension/response` |
| POST | `/api/integrations/extension/test-trigger` |
| GET | `/api/integrations/google/oauth` |
| GET | `/api/integrations/google/oauth/callback` |
| POST | `/api/integrations/google/oauth/disconnect` |
| GET | `/api/integrations/google/oauth/mock-consent` |
| GET | `/api/integrations/google/places` |
| GET, POST | `/api/integrations/google/reviews` |
| GET | `/api/integrations/lark/file/{fileToken}` |
| POST | `/api/integrations/lark/upload/{id}` |
| GET, POST | `/api/integrations/postfast` |
| GET | `/api/integrations/postfast/file/{brandId}/{key...}` |
| GET | `/api/integrations/social/public-profile` |
| GET | `/api/integrations/status` |
| POST | `/api/integrations/stripe/webhook` |
| GET, POST | `/api/invite/{token}` |
| DELETE, GET, POST | `/api/learn/faq` |
| DELETE, GET, POST | `/api/learn/school` |
| GET, POST | `/api/learn/templates` |
| GET | `/api/logs/agent` |
| GET | `/api/maps-config` |
| DELETE, GET, POST | `/api/mcp` |
| GET | `/api/meta/avatar-guide` |
| GET | `/api/meta/openapi` |
| GET | `/api/meta/skills/amc-integrations` |
| GET | `/api/meta/sop` |
| GET, PATCH, POST | `/api/mm/bd/leads` |
| POST | `/api/mm/bd/onboard` |
| GET | `/api/mm/bd/performance` |
| POST | `/api/mm/brands` |
| GET | `/api/mm/health` |
| POST | `/api/mm/subscription` |
| POST | `/api/mm/tts-proxy` |
| GET, PATCH | `/api/profile` |
| GET, POST | `/api/profile/organization-members` |
| GET | `/api/profile/principal-dashboard` |
| POST | `/api/promo/validate` |
| GET | `/api/public/snapshots` |
| POST | `/api/researcher/capture-snapshots` |
| POST | `/api/researcher/login-instagram` |
| GET, POST | `/api/scheduler/daily-check` |
| GET | `/api/scheduler/reports` |
| POST | `/api/settings/bg` |
| GET | `/api/snapshots/{accountId}/{filename}` |
| GET, POST | `/api/subscription` |
| POST | `/api/subscription/confirm` |
| GET, POST | `/api/tasks` |
| DELETE, GET, PATCH | `/api/tasks/{id}` |
| GET, POST | `/api/tasks/{id}/comments` |
| POST | `/api/tasks/{id}/retry-publish` |
| PATCH | `/api/tasks/{id}/status` |
| DELETE | `/api/tasks/unassigned` |
<!-- API_ROUTE_INVENTORY:END -->
