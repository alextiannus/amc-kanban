# AI Marketing Crew 最新产品需求文档 (PRD)

版本日期：2026-08-22

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

每个品牌需要一个订阅套餐。套餐承载品牌运营权益，包括内容运营范围、平台覆盖、月度发布频次、探店活动、品牌主理人支持和附加服务。当前商家套餐以 `Essential` 与 `Booster` 为主：

1. `Essential`：基础线上门面 + 稳定内容维护，覆盖 Instagram、TikTok、Google Business Profile，每月不少于 12 次内容发布。
2. `Booster`：增长战役 + 素材资产 + 博主扩散，覆盖 Instagram、TikTok、小红书、Google Business Profile，每月至少 24 次内容发布。

品牌创建流程必须由订阅支撑，Agent 不应自行绕过订阅创建品牌。订阅运营策略的系统配置保存在 `SubscriptionOperationsStrategy`，用于约束年度营销方案、季度营销方案和内容发布日历的生成范围。

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

### 4.11 BrandPlanInterview / BrandClaim

品牌主张来自主理人对商家的访谈整理，长期保存在 Kanban 中，可持续更新。访谈结果不写入 Growth，也不作为 Growth 品牌上下文的主数据；它只作为 Kanban 生成营销方案的输入材料之一。若最新访谈为空，品牌计划页必须持续提示“需要完成品牌主访谈”。

### 4.12 BrandGrowthResearchSnapshot

数据调研由 Kanban 调用 AMC-Growth 的摸底调研服务生成，并在 Kanban DB 中持久化为 `BrandGrowthResearchSnapshot`。它保存 Growth 返回的体检报告、数据洞察、版本信息和原始 payload 摘要，用于保证后续营销方案生成时引用的数据版本可追溯。

### 4.13 BrandMarketingSolution

Kanban 拥有营销方案生成与版本化保存。年度营销方案、季度营销方案和内容发布日历统一保存为 `BrandMarketingSolution`，通过 `kind = ANNUAL | QUARTERLY | CALENDAR` 区分，不再新增并行的旧式 `PromotionPlan` 主数据。该模型记录输入、输出、版本、生成方式、LLM 配置、关联调研快照和生成时间。

## 5. 信息架构与模块

### 5.1 品牌计划

品牌运营首页已由“品牌故事”升级为“品牌计划”。页面从上到下组织为：

1. **品牌信息和门店信息**：品牌名称、品牌主昵称、联系邮箱、官网链接、门店名称、地址、电话、营业时间、SKU 列表、预订链接、配送链接等。支持多门店配置；添加门店时必须校验当前订阅和多门店支持权益。
2. **数据调研与商家访谈入口**：在品牌信息与推广策略之间提供“同步/生成数据调研”和“商家主张访谈”入口，并支持查看报告。商家访谈不能在无摸底报告时保存；无访谈时不能更新品牌计划。
3. **推广策略 / 品牌主张**：整理商家主张、品牌定位、品牌形象、品牌声音、招牌特色、目标人群、核心产品/服务、推广点和增长机会。
4. **年度营销方案 -> 季度营销方案**：年度方案必须包含四个季度的策略、重点推广点、适用平台、建议发布次数、顾客行动、季度活动方向、内容主题和月度拆解。季度方案从年度方案中继承对应季度策略和推广点。
5. **发布日历**：可逐月向后查看每日内容策划、平台、样板爆品、创意来源和素材需求。支持整月重新生成，也支持单条发布创意重新生成。
6. **社交媒体渠道**：展示已同步社媒账号，并提供从 PostFast 同步账号的按钮。

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

展示品牌已排期与已发布内容，作为内容运营计划视图。品牌计划页生成的内容日历必须读取当前季度营销方案中的推广点、预计发布次数和平台，由 Kanban 调用 AMC-Content 获取更大的候选创意列表，再由 Kanban 生成最终日历。每条日历项保留推广目标、推广点、平台、内容类型、样板爆品、素材需求和生成来源。

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

### 6.6 品牌计划与营销方案生成流程

品牌计划是 Kanban 侧的主流程，不再由 Growth Dashboard 的旧推广计划工作台生成。Growth 只提供客观数据调研；Content 只提供候选创意与素材要求辅助。完整流程如下：

1. **配置品牌信息和门店信息**：用户或主理人填写品牌基础信息和门店信息，保存在 Kanban DB。门店支持多门店，但新增时必须检查当前订阅和多门店 addon 权益。
2. **生成品牌摸底报告**：Kanban 调用 AMC-Growth 的摸底调研服务，生成品牌形象、推广情况、市场分析、竞品情况、问题发现、增长点发现等客观调研内容，并持久化为 `BrandGrowthResearchSnapshot`。最新调研结果同时镜像到 `BrandKnowledge.researchReport`，便于品牌计划页读取。
3. **商家主张访谈**：主理人基于摸底报告和接地气的问题清单访谈商家，记录老板能说清楚的内容，例如“店里最希望顾客记住什么”“哪些菜/服务最稳定”“什么客人最适合来”“老板最不希望别人误解什么”。访谈结果保存为 `BrandPlanInterview`，并整理为长期 `brandClaim`。没有摸底报告不能保存访谈；没有访谈不能更新品牌计划。
4. **更新品牌计划**：Kanban 合并品牌信息、门店信息、品牌主张、数据调研和订阅运营策略，形成综合品牌认知。该品牌计划不把访谈结果同步进 Growth 主数据。
5. **生成年度营销方案**：Kanban 调用 LLM，读取五块数据生成全年营销方案。年度方案必须比季度方案更完整，包含四个季度的推广策略、重点推广点、平台、建议月发布次数、顾客行动、内容主题、活动方向、月度拆解和衡量指标，并保存为 `BrandMarketingSolution(kind=ANNUAL)`。
6. **生成季度营销方案**：Kanban 读取年度方案中对应季度的策略和推广点，生成季度目标、三个月重点、内容方向和结构化推广点，并保存为 `BrandMarketingSolution(kind=QUARTERLY)`。
7. **生成季度/月度发布日历**：Kanban 根据季度营销方案整理推广点、预计发布次数和平台，调用 AMC-Content 生成更大的候选创意列表，再由 Kanban 选择、排布并保存最终发布日历 `BrandMarketingSolution(kind=CALENDAR)`。用户可以整月重新生成，也可以单独重新生成某一次发布创意。
8. **素材需求同步**：发布日历生成后，Kanban 将每条内容的素材需求写入 `MaterialRequirement`，供素材库、拍摄清单和执行验收使用。

前置条件与可跳步规则：

1. 生成摸底报告与商家访谈可以在页面上跳过入口，不阻塞用户浏览品牌计划页。
2. 保存访谈必须有摸底报告作为上下文。
3. 更新品牌计划必须有访谈结果。
4. 生成季度方案必须已有年度营销方案。
5. 生成发布日历必须已有季度营销方案。

### 6.7 Agent 定期轮询与订阅履约流程

由于本系统采用被动 REST/MCP API 架构，不包含主动唤醒 Agent 的服务器端定时器，Agent 必须在其所在运行环境配置定期轮询（建议每 30 分钟轮询一次）。在每次轮询被唤醒时，针对所有关联品牌，Agent 需执行以下自动化任务以履行对应的订阅套餐承诺：

1. **评论自动处理流程（口碑承诺）**：
   - 自动查询未处理评论。比对订阅包权益（Essential/Booster 均需监控 Google Business Profile 等公开评论渠道，并按品牌授权策略生成回复建议或执行回复）。
   - 在 `autoPilot = true` 且授权正常时，AI 自动生成符合品牌风格的回复并调用接口回复；若为非自动驾驶状态或收到低星（≤2星）差评，立即创建 `require_input` 挂起任务等待主理人介入。
2. **内容发布自检流程（发布自检）**：
   - 定期检查待发布任务和内容草稿，若发布时间已到且通过了审核（或处于自动驾驶模式 `autoPilot = true`），调用发布接口执行社媒分发，成功后回填真实 URL 并流转任务状态至 `done`。
3. **素材及探店承诺保障流程（素材与探店承诺）**：
   - 获取订阅的详细权益及配额（如 Essential 每月不少于 12 次内容发布、4 位 KOC/微型博主探店；Booster 每月至少 24 次内容发布、10 位博主分批探店等）。
   - 比对素材库中 ready 状态 of the 素材储备。若素材不足以支撑当月发帖配额，或者本月承诺的博主探店仍未开展时，**主动在看板创建 `require_input` 任务**，标注为 `[订阅承诺] 需要补充素材 / 安排达人探店活动`。
   - 在任务描述中详细列出所需的拍摄画面要求或博主探店策划大纲，督促主理人确认或安排线下配合。
4. **内容创作与自动排期流程（发帖配额承诺）**：
   - 在定期轮询中，自检当前自然月内的内容发帖进度。根据订阅计划约定的月度发帖配额（Essential 每月不少于 12 次；Booster 每月至少 24 次），统计本月已发布内容与未来已排期（`scheduled`）草稿的合计总数。
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

### 8.7 AMC-Growth

AMC-Growth 在品牌计划链路中只负责客观数据调研和外部事实补充，不再负责生成 Kanban 的营销方案。Kanban 通过稳定 `growthBrandKey` 调用 Growth，并将摸底调研报告持久化为 `BrandGrowthResearchSnapshot`。旧的 Growth Dashboard `brand-inspirations` / `promotion-plans` SSO 规划入口已从 Kanban 导航中下线；`/planning/*` 旧页面仅保留为跳回品牌计划页的兼容入口。

### 8.8 AMC-Content

AMC-Content 在品牌计划链路中负责候选创意扩展。Kanban 向 Content 提交推广点、预计发布次数、适用平台和目标窗口，Content 返回大于或等于预期发布次数的创意候选列表、对应平台创意和素材缺口。最终日历排布、版本保存和素材需求写入仍由 Kanban 完成。

### 8.9 品牌计划 API

核心品牌计划 API：

1. `GET /api/brands/:id/brand-plan`：读取品牌计划页所需的品牌信息、门店、调研报告、访谈、年度方案、季度方案和发布日历。
2. `POST /api/brands/:id/brand-plan`：通过 `action` 执行既有品牌计划动作，包括 `generate_research_report`、`save_merchant_interview`、`generate_annual_plan`、`generate_quarter_plan`、`generate_publishing_calendar`、`regenerate_calendar_item`。
3. `POST /api/brands/:id/marketing-plan/generate`：显式生成年度或季度营销方案，`scope = annual | quarter`。
4. `POST /api/brands/:id/content-calendar/generate`：显式生成月度内容发布日历；传 `itemId`、`refreshItemId` 或 `mode=single` 时单条重生成。
5. `POST /api/marketing-plan/generate` 与 `POST /api/content-calendar/generate`：顶层兼容入口，必须提供 `brandId`，内部仍执行品牌级权限校验。

所有品牌级生成 API 必须校验 `canSessionWriteBrandProject`，未登录返回 `401`，无品牌权限返回 `404`。

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
11. 品牌计划页替代旧品牌故事页，展示品牌信息、门店信息、社交媒体渠道、数据调研、商家主张访谈、年度营销方案、季度营销方案和发布日历。
12. 品牌摸底报告由 Growth 生成但长期保存到 Kanban；年度/季度营销方案只能由 Kanban 生成。
13. 年度营销方案必须包含四个季度的详细策略和结构化推广点，能支撑季度方案和月度发布日历。
14. 发布日历必须基于季度营销方案向 AMC-Content 请求候选创意，再由 Kanban 生成并保存最终日历；支持整月重生成和单条创意重生成。
15. `BrandGrowthResearchSnapshot`、`BrandMarketingSolution`、`SubscriptionOperationsStrategy` 三类数据必须在 Prisma schema 和生产数据库中存在；`BrandMarketingSolution.kind` 区分 `ANNUAL`、`QUARTERLY`、`CALENDAR`。
16. 旧 Growth SSO 规划入口、`PlanningGrowthBridge` 和纯 UI 的 `/dashboard/promotion-plan` 保存逻辑不得作为真实营销方案入口出现。
17. TypeScript 与生产构建通过。

## 11. 近期 Roadmap

1. 将 TopicFeed 接入 Dify dataset 或同步任务，形成品牌研究知识库。
2. 为草稿、素材、TopicFeed 增加更细粒度审计日志。
3. 增加 PostFast scheduled post 原生 update 能力，如果第三方 API 支持。
4. 扩展素材库文件夹模型，替代当前逻辑分类字符串。
5. 增加 API rate limit、Agent 调用配额与滥用保护。
6. 完善活动模块数据分析与转化归因。
7. 将 API Services 中高耦合集成抽成独立 service 层，减少 route handler 复杂度。
8. 清理旧 `promotion-strategy` / `planning` 兼容 API 与历史 `PlanningReview` 只读数据，确认没有外部调用后再移除。
9. 合并重复的权限配置文件，避免 `src/lib/permissions.ts` 与 `src/lib/user-management/permissions.ts` 菜单事实分叉。
