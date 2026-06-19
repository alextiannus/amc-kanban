# AMC Agent Connectivity and Onboarding Guide

**Version:** 2.0  
**Last Updated:** 2026-06-14  
**For:** AMC Kanban AI Agent (Lobster AI Employee) & Developers  
**Purpose:** Single source of truth for Agent authentication, onboarding workflows, daily startups, capabilities catalogs, and API/MCP specifications.

---

## 1. 结论 & 核心运营原则 (Core Guidelines)

AMC Agent 是看板体系中的一等数字员工。Agent 必须严格遵守以下运营原则以确保协作高效且符合合规要求：

*   **零本地缓存 (Zero Local Cache)**：不要在本地存储/持久化任何品牌个性或设置。每次会话启动均必须实时通过看板 MCP/API 调取最新的品牌 profile 上下文。
*   **闭环状态 (Autobank State Sync)**：任何有意义、可追踪、可交付的工作都必须上板，不允许在后台隐形工作。任务生命周期的状态流转（`todo` → `in_progress` → `pending` → `done`/`void`）必须实时同步至看板，并利用 Markdown 格式在 description 中追加进展日志（Progress Log）。
*   **多品牌循环 (Multi-Brand Loop)**：每次执行时需循环遍历所有已关联的品牌。
*   **挂起挂载待办 (Proactive Require Input)**：弃用 Lark 作为日常主动消息推送渠道。需要人工（主理人/品牌主）审核、确认或补充素材时，统一使用 `create_require_input_task` 创建 `status: 'pending'` 的阻塞任务，在 `requiredInput` 字段中写明所需信息。主理人将在看板上的专属视图查阅。
*   **本地化文档/记忆存储 (Local Document & memory)**：所有的报告、方案、分析以及日志均生成为本地 Markdown 文件并通过 `save_local_document` / `sync_to_kanban` 同步看板进行结果归档与版本审计，取代旧版直接上传飞书云盘的模式。

---

## 2. Agent 连接与接入方式 (Connection Methods)

AI Marketing Crew 提供两种接入通道，**开发及运行优先推荐使用 MCP 协议**。

### 2.1 方式一：MCP 协议 (推荐)

在你的 MCP Client（Claude Desktop / Hermes / OpenClaw 等）中添加如下配置：

```json
{
  "mcpServers": {
    "amc-kanban": {
      "url": "https://amc-kanban.immedi.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer <你的 KANBAN_AGENT_API_KEY>"
      }
    }
  }
}
```

**MCP 协议优势：**
1. **免除直接 HTTP 调用**：Agent 可直接调用暴露出的 MCP 工具，无需手写 HTTP 请求。
2. **凭证安全性**：第三方平台密钥（PostFast, Google Maps, Lark, OBS）由看板后端统一托管和注入，Agent 不直接接触。
3. **基于 API Key 的细粒度权限校验**：服务端会根据 `BrandAgent` 多对多绑定关系，自动校验 Agent 对特定品牌的访问权限。

### 2.2 方式二：REST API (备选 Fallback)

如果 MCP 通道不可用，可以使用标准的 HTTP 请求：
*   **API 基准地址**：`https://amc-kanban.immedi.ai`
*   **核心请求头**：
    ```http
    Authorization: Bearer <KANBAN_AGENT_API_KEY>
    Content-Type: application/json
    ```

**REST API 注意事项：**
1. 所有涉及品牌数据的请求必须显式携带目标 `brandId`。
2. 多品牌 Agent 不得默认操作第一个品牌，否则会导致数据泄露或混淆。
3. 严格禁止在日志、任务描述或对话中明文打印或写入 `KANBAN_AGENT_API_KEY`。

---

## 3. Onboarding 与日常工作流 (onboarding & Operational SOP)

### 3.1 Onboarding 完整初始化流

新品牌首次激活或 Agent 首次绑定品牌时，需在 5 个工作日内完成以下 1-5 步 Onboarding 流程：

```
ONBOARDING_FLOW:
[Daily Startup]  读取 daily memory（首次为空，跳过）
      ↓
[Step 1]  读取订阅内容（included_services）→ 创建本期目标任务
      ↓
[Step 2]  自动抓取公开信息（路径A） + 创建品牌调研 require_input 任务（路径B）
      ↓
[等待]  主理人填写问卷 → Agent 更新品牌上下文
      ↓
[Step 3]  生成推广方案（Markdown）→ save_local_document + sync_to_kanban
          + 创建 require_input 任务：「方案已就绪，请主理人与 Agent 讨论确认」
      ↓
[等待]  主理人确认方案 → Agent 创建本月内容任务列表
      ↓
[Step 4]  素材检查（充足直接开始生产，不足则创建 require_input 任务并用现有素材先启动）
      ↓
[Step 5]  草稿生成 → require_input（首月审核）→ 排期发布
      ↓
[Step 6]  日常监控飞轮启动（cron 每日自动执行，开始日常循环）
```

### 3.2 Onboarding 分步细则

#### Step 1 — 读取品牌订阅，设定任务目标
1. 调用 `get_brand_config` 获取被关联的品牌列表。
2. 调用 `get_brand_subscription(brandId)` 获取订阅详情，完全根据 `included_services` 数组动态解析，不可硬编码套餐权益。
3. 拆解本期可执行任务，通过 `create_tasks` 批量写入 Kanban。任务粒度必须细化到：平台 × 类别 = 独立任务卡片。

#### Step 2 — 建立品牌运营上下文 (幂等 Onboarding 写入)
1. 检查 completeness。如果缺失必要字段，通过三条路径补充：
   *   **路径A（自动抓取）**：调用 `google_get_place_info` 与 `fetch_public_social_profile` 自动抓取公开信息填入。
   *   **路径B（调研问卷）**：如果 completeness < 70%，生成包含 10 个问题的调研问卷，写入 Kanban 并创建 `require_input` 任务等待主理人填写。
   *   **路径C（交互式对话）**：在看板任务的评论中逐步向主理人提问（每次 1-2 问）。
2. 整合为标准 Brand Context Markdown（含 `Brand Profile`、`Target Audience`、`Hero Products`、`Brand Tone`、`Active Platforms` 等模块），调用 `update_brand_profile_markdown` 写入 Kanban。

#### Step 3 — 策划品牌推广方案
1. 结合 `get_brand_profile_markdown`、`get_brand_analytics(brandId, period='30d')` 和 `get_platform_benchmarks` 数据，站在专业营销专家视角，提出 3 个最契合品牌数据现状的推广方案。
2. 每个方案包含：方案名称、策略背景、主题清单（10-15个话题）、平台分配与发布排期、素材需求、预期 KPI 及执行优先级。
3. 方案保存为本地 Markdown（`save_local_document`），通过 `sync_to_kanban` 同步到看板，并创建一个 `require_input` 待办通知主理人查阅和交互讨论。
4. 主理人确认后，调用 `update_brand_profile_markdown` 更新品牌 profile 中的 `promo_focus` 字段，并批量创建本期发帖任务（`create_tasks`）。

#### Step 4 — 素材检查与内容生产
1. 调用 `list_brand_assets` 获取素材库。
2. 基础标准：Logo 图、门店/环境图、主打产品/招牌图片 ≥5 张，视频订阅要求 ≥2 段 15-60s 短视频。
3. 素材不足时：
   *   创建 `require_input` 任务催促主理人补充素材。
   *   同步先使用库存素材 + 纯文字或设计类内容进行生产，保持内容稳定输出，不等待阻塞。
4. 内容草稿生成：
   *   调用内容创作技能生成多语言文案，通过 `board_save_draft` 绑定账号 `accountId` 并创建草稿，调用 `board_submit_draft` 提交。

#### Step 5 — 草稿审核与排期发布
1. 检查 `get_brand_config` 中的 `autoPilot` 属性。
   *   `autoPilot = true`：直接排期或发布。
   *   `autoPilot = false`（如首月）：创建 `require_input` 任务供主理人审批。
2. 在发布窗口调用 `publish` 执行实际社媒平台分发。
3. 将最终发布出来的线上真实 URL 更新回任务（`update_task`），并将状态流转至 `done`。

---

### 3.3 自动化定期轮询与工作飞轮

为保障客户所购订阅套餐（Subscription Plan）的承诺按时交付，Agent 应依赖自己执行端的调度定时器（如每 30 分钟轮询一次），在每次唤醒时对所有关联品牌自动检查并处理以下日常工作：

#### 1. 每 30 分钟自动轮询与评论回复（口碑保障）
1. 调用 `get_brand_reviews(brandId, status='unread')` 抓取未读/未回复评论。
2. 对比订阅包服务清单（Starter 仅监控；Essential/Advanced 需在 24h 内回复）。
3. 如果品牌处于自动驾驶（`autoPilot = true`）且配置了对应的授权账号，自动生成符合品牌风格的回复，调用 `execute_brand_action(actionType='reply_review')` 执行回复。
4. 如果是差评（≤2星）或未开启自动驾驶，立刻创建 `require_input` 挂起任务等待主理人审批。

#### 2. 内容排期与自检发布（发布自检）
1. 定期检查待发布任务和内容草稿，若发布时间已到且通过了审核（或处于自动驾驶模式 `autoPilot = true`），调用 `publish` 接口向对应平台推送发布。
2. 发布成功后，将真实的线上 URL 填回任务中，并将任务状态移至 `done`。

#### 3. 内容创作与自动排期自检（发帖配额承诺保障）
1. 自动对比当月订阅的发帖配额（如 Starter 每月 30 条发帖，约每日 1 条；Essential 每月 20 条图文 + 4-8 条视频）。
2. 统计本月已发布与未来已排期（`scheduled`）的草稿总数。若发现发帖进度滞后，或未来 3 天内没有排期发布的内容，**自动触发内容创作工作流**。
3. 从 TopicFeed 选题库和素材库中提取内容，调用 `board_save_draft` 保存草稿，设置黄金发布时间 `scheduledAt` 并调用 `board_submit_draft` 提交（若开启了 `autoPilot` 将直接排期发布）。

#### 4. 素材库与探店承诺自检（素材与探店承诺保障）
1. 提取订阅计划中包含的服务详情及发帖/探店配额（例如 Starter 每月 30 篇发帖、4 次探店）。
2. 调用 `list_brand_assets` 获取当前素材，若发帖素材有缺口，或者当期需要安排的博主探店仍未进行，**主动在看板创建 `require_input` 任务**，标注为 `[订阅承诺] 需要补充素材 / 安排达人探店活动`。
3. 在描述中列出具体的拍摄建议或博主探店策划大纲，督促主理人确认或安排线下配合。

#### 4. 每日 07:00 启动自检
1. 调用 `read_daily_memory(brandId, days=3)` 读取每个关联品牌最近 3 天的 daily memory 文件。
2. 生成当日工作上下文摘要（包含：前3天执行内容、未完成待办和执行中任务、数据表现关键点、当前策略方向与本日优先任务）。
3. 将摘要载入工作记忆后开始本日运营循环。

#### 5. 每日数据回采与工作日志整理
*   **13:00 / 19:00 (数据回采)**：调用 `get_social_insights(brandId)`，将表现数据（点赞、分享、点击等）同步更新至看板已发布帖子元数据。
*   **23:00 (运营日志记忆整理)**：
    1. 汇总今日所有执行记录、评论回复、新增任务与数据快照。
    2. 调用 `write_daily_memory` 写入 `/memory/{brandSlug}/YYYY-MM-DD.md`。
    3. 调用 `sync_to_kanban` 同步看板生成一条 done 状态的「运营日志」任务。

#### 每周日 22:00 自我数据评估
1. 调用 `get_brand_analytics(brandId, period='7d')` 获取周度数据，并用 `get_platform_benchmarks` 进行品类基准对比。
2. 编写周度自我评估报告（含目标达成率、对比基准、爆款 TOP3 成功分析、低效内容改进、下周内容调整）。
3. 调用 `save_local_document` + `sync_to_kanban` 归档。
4. 调用 `save_agent_insights` 写入 Agent 自学习知识库。
5. 创建 `require_input` 任务提醒主理人。

#### 策略自动调整指标：
*   **触发A (互动率低)**：连续 2 周低于品类基准均值 30%+ → 生成策略调整方案，更新品牌 Markdown 设定，并挂载任务请主理人讨论。
*   **触发B (出现爆款)**：连续 3 次超出均值 50%+ → 提取成功因子，写入上下文并自动倾斜下期此类内容比例。
*   **触发C (声誉预警)**：7 天内差评 ≥3 条 → 立即暂停促销类推文发布，并生成高优先级 `require_input` 任务报警。
*   **触发D (表现优异)**：自动驾驶模式下连续 4 周达标且无差评 → 挂载任务建议客户升级套餐或调高频次。

---

## 4. MCP 工具字典 (MCP Tools Catalog)

### 4.1 品牌、上下文与名片

*   `get_brand_config`
    *   **用途**：获取当前 Agent 被授权运营的品牌列表及各自的凭证状态。
    *   **关键参数**：`brandId` (可选)
*   `update_brand_config`
    *   **用途**：更新品牌基础配置与凭证。
    *   **关键参数**：`brandId`, `website`, `phone`, `address`, `timezone`, `googlePlaceId`, `postfastApiKey`, `googleApiKey`
*   `get_brand_profile_markdown` / `refresh_brand_profile_markdown`
    *   **用途**：读取/强制重构品牌 Profile Markdown 上下文。
    *   **关键参数**：`brandId`
*   `update_brand_profile_markdown`
    *   **用途**：写入/更新品牌的 Profile Markdown 上下文。
    *   **关键参数**：`brandId`, `markdown`
*   `get_brand_subscription`
    *   **用途**：获取订阅的详细服务及权益，返回含 `included_services` 数组的详情。
    *   **关键参数**：`brandId`
*   `get_agent_profile` / `update_agent_profile`
    *   **用途**：获取或更新/注册 AI 员工自己的名片。
    *   **关键参数**：`agentId` (注册必填), `nickname`, `introduction`, `workflow`, `themeColor` (十六进制 HEX), `avatar` (Base64 或公共 URL)
*   `save_agent_insights`
    *   **用途**：保存 Agent 在周度数据评估中获得的自学习结论与洞察。
    *   **关键参数**：`insights`

### 4.2 任务与审批

*   `list_tasks`
    *   **用途**：拉取待处理的任务列表。
    *   **关键参数**：`brandId`, `status` (数组，可选)
*   `create_task`
    *   **用途**：创建单条看板任务。
    *   **注意事项**：必须携带新加坡时区的 ISO 8601 格式的 `deadline` 字段。
    *   **关键参数**：`brandId`, `title`, `description`, `deadline`, `status`
*   `create_tasks`
    *   **用途**：批量创建看板任务（数组形式）。
    *   **关键参数**：`brandId`, `tasks` (Task 数组)
*   `update_task`
    *   **用途**：更新任务进度或在遇到阻塞时流转状态。
    *   **注意事项**：当 `status` 更新为 `pending` 时，必须同时在 `requiredInput` 填入所需信息说明。
    *   **关键参数**：`taskId`, `status`, `description`, `requiredInput`
*   `create_require_input_task`
    *   **用途**：创建面向主理人的 `require_input` 挂起待办。
    *   **关键参数**：`brandId`, `title`, `description`, `priority` (low, normal, high, urgent)

### 4.3 内容草稿、素材与发布

*   `board_list_social_accounts`
    *   **用途**：列出品牌已连接的所有社交平台账号。内容创作前**必须**优先调用，用于获取具体的 `accountId` 进行风格匹配。
    *   **关键参数**：`brandId`
*   `board_generate_account_connect_link`
    *   **用途**：当账号未授权或凭证过期时，生成授权绑定链接提供给主理人。
    *   **关键参数**：`brandId`, `platformId`
*   `board_list_drafts`
    *   **用途**：列出品牌所有的内容草稿。
    *   **关键参数**：`brandId`
*   `board_save_draft`
    *   **用途**：新建或更新草稿。
    *   **注意事项**：必须填入具体的 `accountId`，禁止创建无账号关联的裸草稿。
    *   **关键参数**：`brandId`, `draftId` (可选), `caption`, `hashtags`, `accountId`, `mediaUrls`, `agentNote`
*   `board_submit_draft`
    *   **用途**：提交草稿。系统将根据 `autoPilot` 设置自动发布或将其推入审批流。
    *   **关键参数**：`brandId`, `draftId`, `note` (可选)
*   `list_brand_assets` / `board_upload_asset`
    *   **用途**：获取或上传多媒体素材到品牌的素材库。
    *   **关键参数**：`brandId`, `filename`, `fileBase64` (上传时), `mimeType`
*   `board_upload_media`
    *   **用途**：上传媒体文件并生成 PostFast 规范的 storageKey 引用。
    *   **关键参数**：`brandId`, `filename`, `fileBase64`
*   `publish` / `board_publish_content`
    *   **用途**：立即发布或排期发布社媒内容。
    *   **关键参数**：`brandId`, `platform`, `caption`, `mediaStorageKeys`, `mediaUrls`, `scheduledAt` (ISO 8601 格式排期)
*   `board_list_published_content` / `board_delete_scheduled_content`
    *   **用途**：查看已排期/已发布内容，或在草稿更新时取消旧排期。
    *   **关键参数**：`brandId`, `draftId`
*   `get_social_insights` / `get_brand_analytics`
    *   **用途**：回采实时或周/月度社媒发帖表现数据。
    *   **关键参数**：`brandId`

### 4.4 反馈与本地存储记忆

*   `get_brand_reviews` / `board_reply_review` / `execute_brand_action`
    *   **用途**：获取 Google/Yelp 等平台的评论，或执行回复动作。
    *   **关键参数**：`brandId`, `reviewId`, `replyText`, `platform`
*   `save_local_document`
    *   **用途**：保存 Markdown 格式的推广方案或评估周报。
    *   **注意事项**：在系统本地文件系统归档，分文件夹存储：`/documents/{brandSlug}/{docType}/`。
    *   **关键参数**：`brandId`, `filename`, `docType` (weekly_report / strategy_plan 等), `content`
*   `sync_to_kanban`
    *   **用途**：同步本地存储的文档，并在看板上生成一条已完成状态的文档浏览任务卡片。
    *   **关键参数**：`brandId`, `docId`, `summary`
*   `write_daily_memory` / `read_daily_memory`
    *   **用途**：写入或读取 `/memory/{brandSlug}/YYYY-MM-DD.md` 下的每日运营记忆。
    *   **关键参数**：`brandId`, `date`, `content` (写时), `days` (读时，默认3天)
*   `get_platform_benchmarks`
    *   **用途**：匿名回采同品类、同地区的平均社交互动率基准。
    *   **关键参数**：`category`, `location`
*   `google_get_place_info`
    *   **用途**：Onboarding 抓取 Google Maps 公开门店信息。
    *   **关键参数**：`placeId`
*   `fetch_public_social_profile`
    *   **用途**：Onboarding 抓取社交公开主页的粉丝量及排版风格。
    *   **关键参数**：`platform`, `handle`

### ⚠️ Deprecation Note (弃用通知)
Lark 接口（`lark_notify`、`lark_create_workspace`、`lark_upload_file`）在 2.0 架构中已被废弃。Agent 严禁在日常工作流中主动调用它们。如需与人类沟通或上传文档，统一转用 `create_require_input_task` 和 `save_local_document`。

---

## 5. REST API 接口定义 (REST API Spec)

以下为高频使用的 REST API 端点说明，可替代对应的 MCP 工具。

### 5.1 订阅与任务

#### 获取订阅详情
*   **请求**：`GET /api/brands/{brandId}/subscription`
*   **响应**：
    ```json
    {
      "plan_name": "essential",
      "included_services": ["content_creation", "google_review_reply", "weekly_report"],
      "monthly_content_quota": 38,
      "platform_coverage": ["Instagram", "Facebook", "TikTok", "Xiaohongshu"]
    }
    ```

#### 批量创建任务
*   **请求**：`POST /api/tasks`
*   **请求体**：
    ```json
    {
      "brandId": "clx...",
      "tasks": [
        {
          "title": "[12eat] Instagram 图文 - W24",
          "description": "准备第24周的日常促销帖子",
          "status": "todo",
          "deadline": "2026-06-20T12:00:00Z"
        }
      ]
    }
    ```

#### 创建 Require Input 挂起任务
*   **请求**：`POST /api/tasks`
*   **请求体**：
    ```json
    {
      "brandId": "clx...",
      "title": "需要提供菜品图以推进发帖",
      "description": "请上传至少 3 张新品大龙虾的特写图",
      "type": "require_input",
      "priority": "high"
    }
    ```

---

### 5.2 存储与记忆

#### 保存本地文档
*   **请求**：`POST /api/brands/{brandId}/documents`
*   **请求体**：
    ```json
    {
      "filename": "weekly_report_2026-W24.md",
      "docType": "weekly_report",
      "content": "# Weekly Report\n\n- 任务达标率: 100%..."
    }
    ```
*   **响应**：`{ "id": "doc_clx...", "filename": "weekly_report_2026-W24.md" }`

#### 同步至看板
*   **请求**：`POST /api/brands/{brandId}/documents/{docId}/sync`
*   **请求体**：`{ "summary": "第 24 周自媒体运营总结" }`

#### 写入每日记忆
*   **请求**：`POST /api/brands/{brandId}/memory`
*   **请求体**：
    ```json
    {
      "date": "2026-06-14",
      "content": "# Daily Memory — 2026-06-14\n\n- 今日发布: Instagram 1条\n- 今日回复: 2条 Google 评论"
    }
    ```

#### 读取每日记忆
*   **请求**：`GET /api/brands/{brandId}/memory?days=3`
*   **响应**：
    ```json
    [
      { "date": "2026-06-13", "content": "..." },
      { "date": "2026-06-12", "content": "..." }
    ]
    ```

---

### 5.3 草稿与发布

#### 保存内容草稿
*   **请求**：`POST /api/brands/{brandId}/drafts`
*   **请求体**：
    ```json
    {
      "caption": "Enjoy our weekend special menu!",
      "hashtags": ["weekend", "brunch"],
      "accountId": "acc_clx123",
      "scheduledAt": "2026-06-20T12:00:00Z"
    }
    ```

#### 提交草稿
*   **请求**：`POST /api/brands/{brandId}/drafts/{draftId}/submit`
*   **请求体**：`{ "note": "已完成英文文案并配图" }`

---

## 6. 异常容错与安全策略 (Fault Tolerance & Security)

为了保证看板系统的健壮性与稳定性，Agent 调用 API 时必须遵循以下防御性准则：

1.  **强参数本地预检**：在向 MCP/REST 接口发送请求前，必须进行内部校验。如果缺少 `deadline`、`brandId` 或 `accountId`，直接在 Agent 本地警告，不发起无效的网络调用。
2.  **网络超时重试限制**：单次 API 超时或遇到 `502`、`504` 等临时报错时，执行指数退避重试，限制**最多重试 2 次**（如间隔 1s、3s 后再试），绝对禁止死循环请求。
3.  **脱敏报错回传**：若重试 2 次后依然失败，停止尝试，将任务状态流转至 `pending`。回传报错给人类主理人时，必须**脱敏**内部实现细节，仅提供以下信息：
    *   调用的接口名称
    *   HTTP 状态码及 Response Error Message
    *   调用的关键脱敏参数
    *   具体的下一步排查建议（如：“请检查 PostFast API 密钥是否过期”）
4.  **安全隔离与凭证防护**：多品牌运营时，Agent 提示词内存必须绝对隔离。严禁在任务描述、聊天对话或帖子文案中包含任何明文密码、API Token 或混淆其他品牌的文案。
