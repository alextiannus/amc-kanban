# AI Marketing Crew Skill
**Version:** 2.0  

> 本 Skill 面向 AI Marketing Crew 的看板协作、品牌配置、本地化文档/记忆存储与社媒发布工作流。

## 核心目标

当 Agent 需要同步工作至看板、配置品牌、读写每日记忆、或提交帖子排期时，必须优先使用 AI Marketing Crew 的 MCP 工具或 REST API，且遵循 zero local cache 原则实时调用。

## 日常工作流

1. **Periodic Polling Loop (每 30 分钟自动化轮询工作，确保完成 Subscription Plan 套餐承诺)**:
   Agent 应在其运行环境（如 Cowork scheduled task）的定时调度下，每 30 分钟被唤醒执行一次自检检查，完成以下自动化操作：
   - **评论自动处理**：调用 `get_brand_reviews` 检查新评论。结合订阅包承诺（如 Starter 仅监控，Essential 24h 内必须回复）。在 `autoPilot = true` 且凭证正常时，使用符合品牌个性的文案调用 `board_reply_review`/`execute_brand_action` 进行自动回复。如果为非自动驾驶状态或收到低星（≤2星）差评，立刻创建 `require_input` 挂起任务等待主理人审批或跟进。
   - **内容排期与分发**：检查排期内容，若已到发布时间且审核通过（或开启了 `autoPilot`），调用 `publish` 执行分发。分发成功后更新任务的线上真实 URL，并标记为 `done`。
   - **内容创作与自动排期自检**：自动比对当月订阅的发帖配额（如 Starter 每月 30 条发帖，约每日 1 条；Essential 每月 20 条图文 + 4-8 条视频）。统计本月已发布与未来已排期（`scheduled`）的草稿总数。若发现发帖进度滞后或未来 3 天没有排期发布的内容，**自动触发内容创作工作流**，从 TopicFeed 选题库和素材库（`list_brand_assets`）提取内容，调用 `board_save_draft` 保存草稿，设置黄金发布时间 `scheduledAt` 并调用 `board_submit_draft` 提交（若开启了 `autoPilot` 将直接排期发布）。
   - **素材及探店承诺自检**：对比当月订阅承诺（如发帖配额、博主探店次数）。检查 `list_brand_assets` 发现素材不足，或者本月尚未记录完成承诺的博主探店任务时，**主动在看板创建 `require_input` 任务**，标明 `[订阅承诺] 需要补充素材 / 安排达人探店活动`，提供明确的拍摄要求或博主探店策划大纲，督促主理人线下完成或提供素材。
2. **Daily Startup**: 每日 07:00（品牌当地时间）启动前，调用 `read_daily_memory(brandId, days=3)` 读取前三天日志并生成当日策略上下文。
3. **Onboarding**: 
   - 调用 `get_brand_subscription` 解析 `included_services` 订阅列表设定具体执行目标。
   - Onboarding 问卷、素材补充审核等交互均创建 `require_input` 类型任务上载至看板，取代任何主动推送通知。
   - **达人探店与合作分工**：达人探店工作完全交给主理人线下安排（包括筛选探店人员、邀约沟通、到店体验等）。Agent 绝对不参与筛选或外联，只需在预设推广节点或检测到本月订阅探店配额未满时，生成 `require_input` 挂起任务提出素材需求（格式：`[订阅承诺] 需要补充素材 / 安排达人探店活动`）。当主理人上传素材并确认后，Agent 执行文案与排期发布。
4. **Daily Cycle**: 
   - 图文/视频草稿提交必须通过 `board_save_draft` 绑定具体账号的 `accountId`。
   - 每日回采分析数据（`get_social_insights`、`get_brand_analytics`）及评论，并通过 `write_daily_memory` 写入 memory 日志中。
   - 每周日生成月度/周度报告存入 `save_local_document` 并 `sync_to_kanban` 同步看板。

---

## 核心 API 字典

### 1. 订阅服务
```http
GET /api/brands/[brandId]/subscription
Authorization: Bearer <AGENT_API_KEY>
```
返回：包含 `plan_name`, `included_services`[], `monthly_content_quota`, `platform_coverage`[] 等的详情。

### 2. 批量创建任务
```http
POST /api/tasks
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "brandId": "<BRAND_ID>",
  "tasks": [
    { "title": "任务标题", "status": "todo", "deadline": "2026-06-20T12:00:00Z" }
  ]
}
```

### 3. 创建 Require Input 任务
```http
POST /api/tasks
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "brandId": "<BRAND_ID>",
  "title": "需要主理人确认品牌语气",
  "description": "详细说明所缺少的内容",
  "type": "require_input",
  "priority": "high"
}
```

### 4. 读写本地文档与日常记忆
- **保存文档**
```http
POST /api/brands/[brandId]/documents
{
  "filename": "weekly_report_2026-W24.md",
  "docType": "weekly_report",
  "content": "# Weekly Report..."
}
```
- **同步至看板**
```http
POST /api/brands/[brandId]/documents/[docId]/sync
{
  "summary": "周报摘要内容"
}
```
- **写每日记忆**
```http
POST /api/brands/[brandId]/memory
{
  "date": "2026-06-14",
  "content": "# Daily Memory..."
}
```
- **读每日记忆**
```http
GET /api/brands/[brandId]/memory?days=3
```

### 5. 抓取与分析接口
- **获取 Places 详情**: `GET /api/integrations/google/places?placeId=`
- **获取社交主页分析**: `GET /api/integrations/social/public-profile?platform=&handle=`
- **获取同品类基准**: `GET /api/analytics/benchmarks?category=&location=`
- **更新自学习 Insights**: `PATCH /api/agent/insights` (Body: `{ "insights": "..." }`)

### 6. 删除接口与 MCP 工具
- **删除任务 (Task)**: `DELETE /api/tasks/[taskId]` 或使用 MCP `board_delete_task` / `delete_task`
- **删除草稿 (Draft)**: `DELETE /api/brands/[brandId]/drafts/[draftId]` 或使用 MCP `board_delete_draft` (已排期内容会自动在 PostFast 取消发布)
- **删除资产 (Asset)**: MCP `board_delete_asset`
- **删除已排期帖 (Scheduled Post)**: MCP `board_delete_scheduled_content`

---

## 任务纪律
- 任务必须带 `deadline` (新加坡时间)。
- 阻塞时设置 status 为 `pending`，并把 requiredInput 填入任务。
- 旧版 Lark 云盘及通知方法已废弃，不要在工作中调用。
