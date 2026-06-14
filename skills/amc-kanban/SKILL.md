# AI Marketing Crew Skill
**Version:** 2.0  

> 本 Skill 面向 AI Marketing Crew 的看板协作、品牌配置、本地化文档/记忆存储与社媒发布工作流。

## 核心目标

当 Agent 需要同步工作至看板、配置品牌、读写每日记忆、或提交帖子排期时，必须优先使用 AI Marketing Crew 的 MCP 工具或 REST API，且遵循 zero local cache 原则实时调用。

## 日常工作流

1. **Daily Startup**: 每日 07:00 启动前，调用 `read_daily_memory(brandId, days=3)` 读取前三天日志并生成当日策略上下文。
2. **Onboarding**: 
   - 调用 `get_brand_subscription` 解析 `included_services` 订阅列表设定具体执行目标。
   - Onboarding 问卷、素材补充审核等交互均创建 `require_input` 类型任务上载至看板，取代任何主动推送通知。
3. **Daily Cycle**: 
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

---

## 任务纪律
- 任务必须带 `deadline` (新加坡时间)。
- 阻塞时设置 status 为 `pending`，并把 requiredInput 填入任务。
- 旧版 Lark 云盘及通知方法已废弃，不要在工作中调用。
