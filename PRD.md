# AI Marketing Crew 最新产品需求文档 (PRD)

版本日期：2026-06-08

## 1. 产品定位

AI Marketing Crew 是面向本地商家与 AMC 运营团队的 Human-AI 营销协作系统。产品把品牌、订阅、主理人、品牌主、AI Agent、内容草稿、素材库、Research TopicFeed、发布排期、评论反馈与活动获客放在同一个可审计工作台中。

系统定位不是替代 Dify。当前产品原则是 **Dify-first**：工作流逻辑、知识库管理与复杂 Agent 编排优先放在 Dify；本系统负责 UI、权限、品牌/订阅数据、Agent 接入、本地化文件与工作记忆系统存储、第三方发布与回退集成、审计和人工协同。2.0 架构全面弃用了对 Lark 通知的日常主动推送以及 Lark Drive 存储的依赖，统一使用本地文件系统和看板阻塞式待办来进行异步人机协作。

## 2. 产品目标

1. 让品牌主、AMC 主理人、管理员和 AI Agent 在同一品牌上下文中协作。
2. 每个品牌必须绑定一个有效订阅套餐；用户可无限添加品牌，每新增品牌都需要购买独立套餐。
3. 一个 AMC Agent 可以运营多个品牌；每次执行前必须明确目标品牌，不能默认第一个品牌。
4. 草稿、素材、Research、发布、评论与活动都应沉淀在品牌工作区内，供人类与 AI 持续复用。
5. 自动驾驶模式下减少人工阻塞，老板审批模式下保留主理人/品牌主确认权。
6. 让外部 Agent 通过 Skill、OpenAPI、SOP、MCP 或 REST API 快速接入。
7. 所有关键动作可追踪、可回放、可治理。

## 3. 用户角色

### 3.1 ADMIN / AMC Operator

平台管理员和 AMC 内部运营角色。可管理用户、品牌、订阅、Agent 分配池、权限、日志、凭证与全局配置。管理员在主理人场景中看到的业务看板口径与 AMC 主理人一致。

### 3.2 BRAND_DIRECTOR / AMC 主理人

AMC 侧品牌主理人。负责管理多个品牌、绑定或调整 AMC Agent、查看品牌动作日志、处理审批、维护品牌运营质量。

### 3.3 BRAND_OWNER / 品牌主

品牌客户。可查看自己的品牌看板、AI 序列、发布计划、草稿、素材库、Research、活动与订阅状态。AI 序列只展示给品牌主。

### 3.4 AI_AGENT / AMC Agent

通过 API Key、MCP 或 REST API 接入。可读取被绑定品牌，写入任务、草稿、素材、TopicFeed、ActionItem，并按权限执行发布、排期、评论回复等操作。

## 4. 核心业务对象

### 4.1 Brand

品牌是系统核心运营对象。品牌包含基础信息、联系方式、官网、地址、时区、品牌 profile、集成凭证、社媒账号、素材、草稿、Research、活动和订阅关系。

### 4.2 BrandSubscription

每个品牌需要一个订阅套餐。套餐承载品牌运营权益，包括内容运营范围、探店活动、品牌主理人支持和附加服务。品牌创建流程必须由订阅支撑，Agent 不应自行绕过订阅创建品牌。

### 4.3 BrandAgent

品牌与 Agent 的多对多绑定。一个品牌可由多个 Agent 协作，一个 Agent 也可运营多个品牌。Agent 被软 dismissal 后不硬删除历史数据。

### 4.4 BrandOwner / OrganizationMember

品牌主与品牌的授权关系，以及组织成员对品牌资产的协作访问关系。

### 4.5 WorkUnit / ActionItem

WorkUnit 是执行任务；ActionItem 是面向人类的待办、审批、确认或阻塞项。草稿审批、差评或非 autopilot 状态下评论的人工审核回复、由于订阅配额不足或到期需催促素材与安排探店活动等，均使用 `require_input` 类型的 ActionItem 挂起，等待主理人或品牌主处理。

### 4.6 ContentDraft

品牌内容草稿。支持账号选择、正文、标签、素材引用、排期时间、发布状态、Agent 备注、驳回意见、平台 postId、发布时间，以及结构化发布失败代码和失败时间。

状态建议：`draft`、`pending_review`、`approved`、`publishing`、`scheduled`、`published`、`failed`。

### 4.7 MediaAsset

品牌素材库资产。支持图片/视频上传、文件夹/分类、AI tags、caption、ready 状态、归档和草稿引用。

### 4.8 TopicFeed

Research 模块的核心对象。每条 TopicFeed 是品牌维度的 Markdown 研究文档，用于沉淀选题、趋势、竞品、用户洞察、内容角度和来源链接。

### 4.9 SocialAccount

品牌已连接或手动补录的社媒/点评账号，包括平台、handle、展示名、授权 token、登录凭证、粉丝与评分快照。

### 4.10 GameConfig / GameSession

店内活动模块配置与参与记录，用于扫码抽奖、评论任务、社媒关注任务和门店获客活动。

## 5. 信息架构与模块

### 5.1 品牌主看板

品牌运营首页。展示任务、Agent 运行、摘要指标、近期动态、订阅状态和品牌相关工作入口。

### 5.2 AI 序列

面向品牌主展示。用于查看品牌绑定的 AMC Agent、Agent 说明、初始化 Skill、下载 Skill、复制连接指令。已移除“全部/在线/离线”过滤，仅保留搜索和 Agent 列表。

### 5.3 主理人看板

面向 ADMIN 和 BRAND_DIRECTOR。支持查看所有负责品牌、编辑品牌名与品牌主信息、删除/添加品牌、修改品牌绑定的 AMC Agent、筛选品牌动作日志。

### 5.4 发布内容（Post）

独立模块。支持创建、编辑、保存、提交草稿，选择发布账号和排期时间，查看引用素材，处理驳回意见。

业务规则：

1. `autoPilot = true`：提交草稿后直接发布或排期。若已存在未发布的 `platformPostId`，更新时先取消旧排期，再用最新草稿重建排期。
2. `autoPilot = false`：提交草稿进入 `pending_review`，创建审批 ActionItem；只有批准后才发布或排期。
3. 驳回后草稿回到 `draft` 并保留 `rejectionNote`。

### 5.5 素材库

独立模块。支持用户和 AMC Agent 上传、拖拽上传、分类整理、批量移动、标记 ready、归档。上传优先级：Huawei OBS -> PostFast -> Lark -> Local。

### 5.6 Research / TopicFeed

独立模块。支持按品牌创建、读取、搜索、更新、归档 Markdown research topics。AMC Agent 可通过 API 写入和读取 topics，前端提供 markdown 编辑与预览。

### 5.7 发布日历

展示品牌已排期与已发布内容，作为内容运营计划视图。

### 5.8 社媒透视

面向 ADMIN 和 BRAND_DIRECTOR。汇总渠道表现、情绪、ROI、竞品等社媒洞察。

### 5.9 店内活动

配置扫码抽奖、评论任务、社媒关注任务、奖品和海报，用于门店线下获客。

### 5.10 订阅与品牌创建

用户可新增多个品牌。每新增一个品牌必须购买一个品牌订阅套餐；每个套餐绑定一个品牌。品牌创建时系统应初始化品牌 workspace 本地存储与工作记忆目录（不再依赖 Lark Workspace 目录）。

### 5.11 Admin 管理后台

管理用户、AI Agent、权限、订阅、品牌凭证、Agent 分配池、审计日志、系统调试。

## 6. 核心流程

### 6.1 品牌新增流程

1. 用户进入新增品牌或订阅流程。
2. 选择套餐并确认条款。
3. 支付成功或订阅确认后创建/绑定 BrandSubscription。
4. 创建品牌记录并绑定 BrandOwner。
5. 自动初始化品牌本地存储与记忆文件夹（替代旧版 Lark 共享目录）。
6. 可绑定 AMC Agent，进入运营。

### 6.2 Agent 接入流程

1. 主理人或品牌主生成 Agent Key / 初始化指令。
2. Agent 读取 Skill、OpenAPI、SOP（统一从 docs/AGENT_CONNECTIVITY.md 获取）、Avatar Guide。
3. Agent 调用 profile 接口更新自身名片。
4. Agent 查询可运营品牌列表。
5. 若多品牌且任务未指定品牌，必须询问或将任务置为 pending。
6. Agent 在目标品牌下执行任务、写入草稿、TopicFeed、素材或发布。

### 6.3 草稿发布流程

1. Agent 或人类创建 ContentDraft。
2. 选择 SocialAccount 和 scheduledAt。
3. 提交草稿。
4. 根据 Brand.autoPilot 决定：直接发布/排期，或进入审批。
5. 发布成功后记录 platformPostId；排期成功则状态为 `scheduled`。
6. 修改已排期草稿并重新提交时，取消旧排期并重建。
7. PostFast 每15分钟核对 `scheduled` 和 `publishing`；优先使用 platformPostId，旧数据仅在账号、标准化完整文案和发布时间一致时恢复。
8. 发布结果超过30分钟仍无法确认时转为 `failed`/`POSTFAST_RESULT_UNKNOWN`，再次发布前必须由用户确认平台上尚未发布。

### 6.4 Research 写入流程

1. Agent 在执行内容或市场研究前读取品牌 profile。
2. Agent 查询已有 TopicFeed，避免重复研究。
3. 将新发现以 Markdown 文档写入 TopicFeed。
4. 人类可在 Research 模块编辑、归档或复用。

### 6.5 素材上传流程

1. 用户或 Agent 选择品牌与文件夹/分类。
2. 上传文件。
3. 系统按 Huawei OBS、PostFast、Lark、Local 顺序选择可用存储。
4. 写入 MediaAsset，供草稿引用。

### 6.6 Agent 定期轮询与订阅履约流程

由于本系统采用被动 REST/MCP API 架构，不包含主动唤醒 Agent 的服务器端定时器，Agent 必须在其所在运行环境配置定期轮询（建议每 30 分钟轮询一次）。在每次轮询被唤醒时，针对所有关联品牌，Agent 需执行以下自动化任务以履行对应的订阅套餐承诺：

1. **评论自动处理流程（口碑承诺）**：
   - 自动查询未处理评论。比对订阅包权益（Starter 仅监控；Essential/Advanced 需在 24h 内回复）。
   - 在 `autoPilot = true` 且授权正常时，AI 自动生成符合品牌风格的回复并调用接口回复；若为非自动驾驶状态或收到低星（≤2星）差评，立即创建 `require_input` 挂起任务等待主理人介入。
2. **内容发布自检流程（发布自检）**：
   - 定期检查待发布任务和内容草稿，若发布时间已到且通过了审核（或处于自动驾驶模式 `autoPilot = true`），调用发布接口执行社媒分发，成功后回填真实 URL 并流转任务状态至 `done`。
3. **素材及探店承诺保障流程（素材与探店承诺）**：
   - 获取订阅的详细权益及配额（如 Starter 每月 30 篇发帖、4 次探店；Essential 每季度 24 次探店等）。
   - 比对素材库中 ready 状态 of the 素材储备。若素材不足以支撑当月发帖配额，或者本月承诺的博主探店仍未开展时，**主动在看板创建 `require_input` 任务**，标注为 `[订阅承诺] 需要补充素材 / 安排达人探店活动`。
   - 在任务描述中详细列出所需的拍摄画面要求或博主探店策划大纲，督促主理人确认或安排线下配合。
4. **内容创作与自动排期流程（发帖配额承诺）**：
   - 在定期轮询中，自检当前自然月内的内容发帖进度。根据订阅计划约定的月度发帖配额（如 Starter 套餐月度 30 条发帖，约每日平均 1 条；Essential 套餐月度 20 条图文 + 8 条短视频），统计本月已发布内容与未来已排期（`scheduled`）草稿的合计总数。
   - 若发现已发布与已排期总数落后于当前时间节点的配额进度，或者未来 3 天内没有排期发布的内容，**自动触发内容创作与排期工作流**。
   - 调用 `list_brand_assets` 提取可用素材，结合选题研究库（TopicFeed）生成契合品牌风格的图文或视频内容。
   - 调用 `board_save_draft` 保存草稿，根据受众活跃黄金时间（如当地时间中午 12:00 或晚上 19:30）合理计算并设定发布时间 `scheduledAt`，然后调用 `board_submit_draft` 提交。在 `autoPilot = true` 时，该草稿将直接置为 `scheduled` 状态等待自动分发。

## 7. 权限与访问控制

1. HUMAN 使用 Cookie session；AI_AGENT 使用 Bearer API Key。
2. ADMIN 可访问全局管理能力。
3. BRAND_DIRECTOR 可访问主理人运营视图和负责品牌。
4. BRAND_OWNER 只能访问自己拥有或组织授权的品牌。
5. AI_AGENT 只能访问 active BrandAgent 绑定的品牌。
6. 品牌级接口必须统一使用 `canSessionAccessBrandProject` / `canHumanAccessBrandProject` / `canAgentAccessBrand` 等资源级校验。

## 8. 集成与存储策略

### 8.1 Huawei OBS

用于生产品牌 workspace、素材与草稿快照存储。生产环境变量：

1. `HUAWEI_OBS_ACCESS_KEY_ID`
2. `HUAWEI_OBS_SECRET_ACCESS_KEY`
3. `HUAWEI_OBS_BUCKET`
4. `HUAWEI_OBS_ENDPOINT`
5. `HUAWEI_OBS_REGION`
6. `HUAWEI_OBS_PUBLIC_BASE_URL`

### 8.2 PostFast

用于社媒发布、排期、取消 scheduled post、媒体上传和部分点评回复能力。当前更新 scheduled post 的策略是取消旧 post 后重建。后台每15分钟拉取 scheduled、published、failed 三类结果并同步 ContentDraft；供应商读取失败或结果冲突时不修改本地状态。

### 8.3 Google Business Profile

用于 OAuth、评论读取/回复和 GBP local post 直连发布路径。

### 8.4 Lark

Lark 相关的通知卡片推送、云盘文件夹创建及文件上传工具接口在 2.0 架构中已被废弃。Agent 严禁在日常流中主动调用 Lark 接口，统一转用本地文件存储服务（`save_local_document`）和看板挂起任务（`create_require_input_task`）实现人机交互与文档共享。

### 8.5 Stripe

用于订阅支付和 webhook 确认。

### 8.6 Dify

作为工作流和知识库中心。本系统不把复杂业务编排迁移到 proxy 层；proxy 只做传输、集成和 fallback。

## 9. 非功能需求

1. 可追踪：任务、审批、发布、Research、素材变化应可被审计或复盘。
2. 可恢复：外部存储初始化失败不应阻塞品牌创建，但必须记录错误。
3. 可扩展：API Services 按领域拆分，便于未来迁移到独立服务。
4. 安全：密钥只通过环境变量或受控凭证字段保存，不写入代码和文档。
5. 多品牌安全：Agent 不得跨品牌混用资料、账号、草稿或素材。
6. 构建稳定：Next.js、Prisma 与 route handlers 必须通过 `npx tsc --noEmit` 和 `npm run build`。

## 10. 当前验收标准

1. 品牌主可新增多个品牌，每个品牌绑定独立订阅。
2. 品牌创建后初始化 workspace，并可上传素材。
3. AI 序列仅品牌主可见，主理人和 admin 使用主理人看板。
4. 主理人可编辑品牌、品牌主信息、品牌绑定 Agent，并按品牌筛选动作日志。
5. Agent 可运营多个品牌，Skill 明确多品牌边界。
6. 发布内容（Post）支持自动驾驶直接发布/排期与老板审批模式。
7. 素材库支持上传、分类、整理和被草稿引用。
8. Research 模块支持 TopicFeed markdown 写入、读取、搜索和归档。
9. API metadata 暴露 OpenAPI、SOP (统一由 docs/AGENT_CONNECTIVITY.md 提供) 和 Skill，便于 Agent 唯一接入。
10. Agent 支持自动化定期轮询（建议每 30 分钟一次），在轮询中自动处理评论回复、检查并执行发布、根据订阅包承诺检查并主动挂起素材与探店 `require_input` 任务。
11. TypeScript 与生产构建通过。

## 11. 近期 Roadmap

1. 将 TopicFeed 接入 Dify dataset 或同步任务，形成品牌研究知识库。
2. 为草稿、素材、TopicFeed 增加更细粒度审计日志。
3. 增加 PostFast scheduled post 原生 update 能力，如果第三方 API 支持。
4. 扩展素材库文件夹模型，替代当前逻辑分类字符串。
5. 增加 API rate limit、Agent 调用配额与滥用保护。
6. 完善活动模块数据分析与转化归因。
7. 将 API Services 中高耦合集成抽成独立 service 层，减少 route handler 复杂度。
