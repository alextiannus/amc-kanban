# AI Marketing Crew Skill
**Version:** 2.0  

> 本 Skill 面向 AI Marketing Crew 的看板协作、品牌配置、本地化文档/记忆存储与社媒发布工作流。

## 核心目标

当 Agent 需要同步工作至看板、配置品牌、读写每日记忆、或提交帖子排期时，必须优先使用 AI Marketing Crew 的 MCP 工具或 REST API，且遵循 zero local cache 原则实时调用。

## 日常工作流

1. **Periodic Polling Loop (每 30 分钟自动化轮询工作，确保完成 Subscription Plan 套餐承诺)**:
   Agent（含各专业 AI 子角色，如 Copywriter、Researcher）应在定时调度下被唤醒执行自检，完成以下操作：
   - **内容创作与自动排期自检**：自动比对当月订阅的发帖配额。若发现发帖进度滞后或未来 3 天没有排期，**AMC Agent** 生成包含推广主题、建议图片及视频素材的 To-do 看板任务，随后由 **AMC Copywriter** 自动对接进行内容创作（撰写正文与 hashtags），保存草稿，设置黄金发布时间并提交排期。
   - **评论自动处理**：调用 `get_brand_reviews` 检查新评论。在 `autoPilot = true` 且凭证正常时，自动进行回复。如果为非自动驾驶状态或收到低星差评，立刻创建 `require_input` 挂起任务等待主理人审批或跟进。
   - **素材及探店承诺自检**：自检素材库，若发现素材不足或本月尚未记录博主探店，主动在看板创建 `require_input` 任务，督促主理人线下丰富素材（人工丰富素材途径包括：商家日常提供、主理人安排探店、主理人组织专业拍摄服务）。
   - **数据回填与看板截图（AI数据采集）**：**AMC Researcher** 保持社交平台登录状态，自动抓取最新的展示与运营数据完成回填，并且定期截图各品牌账号首页，将截图展示在“账号整体展现看板”中。
2. **Daily Startup**: 每日 07:00 启动前，调用 `read_daily_memory(brandId, days=3)` 读取前三天日志并生成当日策略上下文（包含主理人先前通过 Agent 录入的品牌推广方案、当月主题与品牌上下文）。
3. **Onboarding**: 
   - 调用 `get_brand_subscription` 解析订阅服务列表设定执行目标。
   - Onboarding 问卷、素材补充审核等交互均创建 `require_input` 类型任务上载至看板，取代任何主动推送通知。
   - **达人探店与合作分工**：达人探店工作完全交给主理人线下安排。当主理人上传素材并确认后，AI 执行文案与排期发布。
4. **Daily Cycle**: 
   - 草稿提交必须通过 `board_save_draft` 绑定具体账号的 `accountId`。
   - 每日回采分析数据及评论，并通过 `write_daily_memory` 写入 memory 日志中。
   - 每周日生成月度/周度报告存入 `save_local_document` 并同步看板。
   - 配合主理人线下对接 Review：AMC 主理人与品牌主 Review 之后，将沟通反馈和下期营销主题更新同步给 AMC Agent 存入品牌认知记忆。

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
