# MCP API Catalog (Model Context Protocol API 目录)

本文档列出了 `amc-kanban` 后台集成的所有 AI Agent 专属 Model Context Protocol (MCP) API 接口。这些接口让 AI 智能体可以安全地执行用户授权范围内的系统操作。

---

## 1. 任务与看板管理 (Task & Kanban Board Management)

### `board_get_tasks`
* **描述**: 获取当前分配给该 Agent 或需要处理的看板任务列表。
* **参数**:
  * `brandId` (string, 可选): 按品牌 ID 过滤。
  * `status` (string, 可选): 任务状态过滤 (`pending` | `in_progress` | `done` | `failed` 等)。
  * `limit` (number, 可选): 返回条数限制（默认 50）。

### `board_create_task`
* **描述**: 在看板上创建一项新任务。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `title` (string): 任务标题。
  * `description` (string, 可选): 任务详细描述。
  * `status` (string, 可选): 初始状态（默认 `pending`）。
  * `priority` (string, 可选): 优先级 (`low` | `medium` | `high` | `urgent`)。
  * `deadline` (string, 可选): 截止时间（ISO 8601 格式）。

### `board_update_task`
* **描述**: 更新现有的看板任务。
* **参数**:
  * `taskId` (string): 任务 ID。
  * `fields` (object): 要修改的字段（如 `status`、`title`、`priority`、`deadline`、`requiredInput` 等）。

### `board_delete_task`
* **描述**: 删除指定的看板任务。
* **参数**:
  * `taskId` (string): 任务 ID。

### `create_require_input_task`
* **描述**: 创建一个需要人类用户输入/确认的拦截型任务。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `title` (string): 提示人类用户的问题或输入标题。
  * `description` (string): 详细上下文或提问，支持 Markdown。
  * `priority` (string, 可选): 优先级。
  * `attachments` (array, 可选): 相关附件的文件路径或 URL 列表。

---

## 2. 社交媒体与发布管理 (Social Media & Publishing)

### `board_list_social_accounts`
* **描述**: 列出当前品牌已授权连接的社交媒体账号（如 Instagram, TikTok, Facebook, Google, 小红书 等）。
* **参数**:
  * `brandId` (string): 品牌 ID。

### `board_list_published_content`
* **描述**: 查询该品牌已发布、已排期或草稿状态的内容历史记录。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `status` (string, 可选): 状态过滤 (`scheduled` | `published` | `failed` | `draft`)。
  * `platform` (string, 可选): 社交平台过滤。
  * `limit` (number, 可选): 限制条数（默认 20）。

### `board_upload_media`
* **描述**: 将图片或视频素材以 Base64 格式上传到系统 OSS (Huawei OBS)。返回的 `storageKey` 用于发布。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `filename` (string): 文件名（如 `"banner.jpg"`）。
  * `mimeType` (string): MIME 类型（如 `"image/jpeg"`, `"video/mp4"`）。
  * `fileBase64` (string): 文件的 Base64 编码数据。
  * `sizeBytes` (number, 可选): 文件大小字节数。

### `board_generate_account_connect_link`
* **描述**: 生成一个安全的社交账号授权绑定链接，可以发送给品牌主进行扫码或 OAuth 授权。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `label` (string, 可选): 显示的渠道标签。
  * `redirectUrl` (string, 可选): 绑定成功后的回调 URL。

### `publish` / `board_publish_content`
* **描述**: 立即发布或定时排期发布图文/视频内容到指定社交媒体平台。
* **参数**:
  * `brandId` (string): 品牌 ID.
  * `platform` (string): 目标社交媒体（如 `instagram` | `tiktok` | `xiaohongshu` | `google` 等）。
  * `caption` (string): 帖子配文正文。
  * `mediaStorageKeys` (array, 可选): OSS 媒体文件 storageKey 列表。
  * `mediaUrls` (array, 可选): 直连媒体文件 URL 列表。
  * `hashtags` (array, 可选): 话题标签列表。
  * `scheduledAt` (string, 可选): 定时发布时间（ISO 8601 字符串）。为空表示立即发布。
  * `accountId` (string, 可选): 具体的发布渠道账号 ID。

### `board_delete_scheduled_content`
* **描述**: 取消并删除已排期未发布的定时帖子。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `postId` (string): 帖子 ID。

---

## 3. 评论与商家互动管理 (Reviews & GBP Engagement)

### `google_get_reviews`
* **描述**: 获取 Google Maps 商家地址 (Google Business Profile) 最新的顾客评论列表（包含评分、评语、回复状态）。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `limit` (number, 可选): 条数限制。

### `google_reply_review`
* **描述**: 回复一条 Google GBP 商家评论。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `reviewId` (string): 评论 ID。
  * `replyText` (string): 回复正文。

### `board_reply_review`
* **描述**: 跨平台评论回复（支持小红书、大众点评、美团、Google Maps 等，非 GBP 平台会推送至浏览器插件执行）。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `platform` (string): 评论所在平台。
  * `reviewId` (string): 评论 ID。
  * `replyText` (string): 回复正文。

---

## 4. 品牌洞察与数据分析 (Brand Insights & Analytics)

### `get_brand_analytics`
* **描述**: 调用系统后台数据分析接口，获取品牌社交媒体表现的统计数据。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `from` (string, 可选): 起始 ISO 日期。
  * `to` (string, 可选): 截止 ISO 日期。
  * `platform` (string, 可选): 平台过滤。

### `get_social_insights`
* **描述**: 获取实时的品牌社交舆情洞察（情感倾向、高频词云、转化趋势、爆款分析）。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `from` (string, 可选): 起始日期。
  * `to` (string, 可选): 截止日期。
  * `platform` (string, 可选): 平台过滤。

### `get_platform_benchmarks`
* **描述**: 获取行业与地域的基准线对比数据，用于分析品牌在同类商家中的竞争水平。
* **参数**:
  * `category` (string): 业务品类 (如 `chinese_restaurant`)。
  * `location` (string): 城市/地区 (如 `Singapore`)。
  * `platform` (string, 可选): 平台。

### `fetch_public_social_profile`
* **描述**: 爬取并查询公开社交媒体主页（如 Instagram/Facebook 公开账号）的基本粉丝与互动数据。
* **参数**:
  * `platform` (string): 平台 (`instagram` | `facebook`)。
  * `handle` (string): 公开账号句柄 / 用户名。

---

## 5. 文档与记忆库管理 (Documents & Knowledge Memory)

### `save_local_document`
* **描述**: 将生成的文案报告、营销策略或周报以 Markdown 格式持久化保存到品牌文件库中。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `filename` (string): 文件名称。
  * `docType` (string): 文档分类 (`weekly_report` | `strategy_plan` | `daily_memory` 等)。
  * `content` (string): Markdown 文本内容。

### `sync_to_kanban`
* **描述**: 将已保存的 Markdown 文档同步发布到看板上作为一个归档 of 已完成任务，方便团队查看。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `docId` (string): 文档 ID。
  * `summary` (string, 可选): 任务摘要信息。

### `write_daily_memory`
* **描述**: 写入品牌的每日运营日志/记忆文件，方便 Agent 进行跨周期自适应学习。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `date` (string): 日期格式 `YYYY-MM-DD`。
  * `content` (string): Markdown 内容。

### `read_daily_memory`
* **描述**: 读取最近几天的历史记忆，供生成当前策略文案时参考。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `days` (number, 可选): 往前读取的天数（默认 3）。
  * `date` (string, 可选): 读取指定某天的记忆。

### `save_agent_insights`
* **描述**: 保存 Agent 自身的成长心得或自我优化建议（Self-learning Insights）。
* **参数**:
  * `insights` (string): 心得的 Markdown 内容。

---

## 6. 合规审计与配置 (Compliance & Prompt Management)

### `check_brand_compliance`
* **描述**: 根据品牌自定义合规规则与敏感词库，对撰写的文案进行预审核与风险提示。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `text` (string): 待审计的文案。

### `get_compliance_rules`
* **描述**: 获取指定品牌当前生效的文案合规限制与违禁词列表。
* **参数**:
  * `brandId` (string): 品牌 ID。

### `get_active_prompts`
* **描述**: 获取 Agent 正在使用的系统级 Prompt 提示词模版。
* **参数**: 无。

### `update_active_prompt`
* **描述**: 动态修改系统提示词模版（仅限管理员和高级权限的 Agent 操作）。
* **参数**:
  * `tag` (string): Prompt 模版标签。
  * `content` (string): 新模版内容。

---

## 7. 学习中心与常见问题 (Learning Center & FAQs)

### `list_faqs`
* **描述**: 获取 AMC 运营/技术服务中心的所有 Q&A 常见问题解答列表。
* **参数**: 无。

### `get_faq`
* **描述**: 获取单条 FAQ 解答的详细 Markdown 正文。
* **参数**:
  * `faqId` (string): FAQ 条目 ID。

### `search_faqs`
* **描述**: 在学习中心内进行文本模糊/语义检索。
* **参数**:
  * `q` (string): 搜索关键词。
  * `limit` (number, 可选): 结果数量限制。

### `save_brand_learning_insights`
* **描述**: 保存该品牌从 FAQ 学习中沉淀出来的运营心得。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `insights` (string): 营销学习成果。

### `get_brand_learning_insights`
* **描述**: 获取沉淀的运营知识心得。
* **参数**:
  * `brandId` (string): 品牌 ID。

---

## 8. 外部接口与搜索 (External Integrations & Search)

### `web_search`
* **描述**: 通过互联网搜索引擎（Tavily/SerpAPI）检索最新的外部资讯、热点和事件。
* **参数**:
  * `query` (string): 检索查询词。

### `fetch_webpage`
* **描述**: 抓取并解析任意公开网页的文本内容（自动转换为干净的 Markdown 格式）。
* **参数**:
  * `url` (string): 目标网页 URL。

### `google_search_places`
* **描述**: 使用 Google Maps API 检索地理位置附近的竞品商家或潜在合作店铺。
* **参数**:
  * `query` (string): 大致查询条件（如 "cafe in Orchard Road"）。
  * `location` (string, 可选): 经纬度定位。
  * `radius` (number, 可选): 范围半径。

### `google_get_place_info`
* **描述**: 获取单个 Google 地点（Place ID）的详细评分、电话、营业时间及公开信息。
* **参数**:
  * `placeId` (string): 地点 ID。

### `lark_notify`
* **描述**: 向品牌的 Lark Webhook 或指定群组发送富文本卡片通知（支持置顶、红色紧急高亮等）。
* **参数**:
  * `brandId` (string): 品牌 ID。
  * `title` (string): 通知标题。
  * `content` (string): 通知正文。
  * `actionUrl` (string, 可选): 卡片动作交互链接。
  * `urgent` (boolean, 可选): 是否高亮为紧急。
