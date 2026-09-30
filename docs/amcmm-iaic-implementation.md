# AMCMM IAIC 技术改造执行设计

状态：2026-09-30 应用实现和本地验收已完成，生产部署与真实模型验收待验证。P0 人工版本保存已上线，见 creative-lineage.md。本文件是 AI Native 改造的执行契约；设计、代码、本地验证、生产验证分别记账。

## 产品与验收

AMCMM 由短对话入口扩展为品牌工作台。用户提出目标后取得持久任务回执，可关闭页面，稍后查询进度、补充资料、取消任务、查看候选和验证过的业务结果。系统只有取得权威业务回执才能声称保存完成。候选完成、版本保存、视频完成、发布成功分别显示。

工作台支持两类目标：品牌工作简报（读取品牌事实、账号、最近30条草稿与全量状态计数，不推断收入或外部交付）；指定创意改写（候选经用户采用后生成可追溯新版本）。个人品牌偏好通过 Core Memory 保存、读取和遗忘；模型只有读取权限，偏好不能成为产品事实或业务授权。

首条贯通流程：选择品牌与创意 → 输入改写目标 → Core 任务读取品牌事实和当前创意 → 缺失事实进入等待资料 → 补充后继续同一任务 → 保存候选工作区产物 → 用户检查候选并确认保存 → 复用版本服务原子保存 → 按 revisionId 回读核对。人工保存入口继续可用。

验收包含：两用户/品牌隔离、补资料持久化、服务重建后继续、并发执行器所有权、撤权、原模型绑定、预算耗尽、未知模型调用保留账务、保存结果不明核对、重复提交、旧版本冲突、移动端进度与错误反馈。真实模型质量与合成模型故障测试分别记录。

## 框架与边界

核定公共 Core main `8b184031ee3211acb2d1ee06a1f7aa7ef175e12c`，包 `0.1.0-candidate.114`；从独立仓库打包，SHA-256 `1eb1b87bcef1c1191eff788ca77cee678a1ac979c91ac0bcbecc77a525d79f24`。只使用公共导出，不修改 vendor 为框架源码。

Kanban 托管 Core TaskStore、AgentRuntime、CapabilityDispatcher、身份、Skills、Workspace、Memory、Knowledge、模型额度和任务控制。PostgreSQL 为持久层，独立 schema 防止框架表名和其他应用混淆。Core 自己执行模块迁移，应用不读写 Core 私有表。AMCMM 通过认证 BFF 调用同一能力；不持有模型密钥，不在 localStorage 存任务真值。

超大品牌资料使用有界原文摘录并明确 partial，摘要始终绑定完整授权数据快照；省略部分必须按未知处理，必要时向人类补资料。运营列表和计数按稳定顺序计算摘要。

品牌知识、创意、Content 制作任务、发布、支付保留原权威系统。Core 任务引用它们的 ID、版本和核对回执。业务适配器进行字段白名单、当前权限、幂等和版本检查。无需把现有所有作业复制成另一套任务系统。

## 身份与责任

User AI 接收个人目标、持有个人工作记忆；Business AI 在品牌授权范围执行；Platform AI 处理限权工程任务与外部 Codex 协作。三种责任使用同一框架契约，分别绑定责任身份、资源范围和额度。框架角色不授予平台管理员权限。

服务器从会话恢复 userId，从已校验路径取得 brandId；每次任务读取、工具调用、历史回读和结果采用均重验当前用户状态与品牌权限。模型不得提供 actor、Crew、角色、预算主体或凭据作为真值。工具输入中的品牌不能扩大任务品牌范围。

任务提交的允许工具由服务器确定。创意改写默认只读取品牌/创意并写候选工作区。批准保存为独立人类动作，绑定任务、候选摘要、目标创意版本和稳定请求键；来源和身份继续由后端填充。后续有明确 mandate 才允许持续 Business AI 自行保存或执行外部业务。

## 模型与预算

中央 /admin 模型配置是唯一模型与密钥入口，使用已发布不可变 ModelPolicyRevision、ModelCatalogEntry、ModelConnection。Core 模型适配器复用既有协议，报告真实 provider usage；缺失 usage 不伪造零消耗。Gemini 输出统计包括 thoughts 与 candidates（[官方定义](https://ai.google.dev/api/generate-content)）；Anthropic 输入合计包含普通输入、缓存创建与缓存读取（[官方定义](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)）。模型超时或未知结果不自动更换模型、不重复扣款式重试。

每个任务固定模型配置身份与实施版本。重建后保持原绑定；不兼容升级或模型不可用明确等待迁移。Core Ledger 负责预留和结算；本轮实际创建的额度账户仅为 User AI，按用户与品牌隔离；Business AI 和 Platform AI 在后续启用时使用独立账户，不共用个人授权。额度由明确的应用配置/授权分配，不能由模型发放，不将 allowance 单位当作货币或供应商 token。

## 持久化、部署与恢复

任务接受后即返回202及原 taskId；任务列表、详情、补资料、取消与恢复采用 Core 公共能力。提交及继续请求使用稳定 requestKey；回执丢失按原键核对。状态只投影 Core 状态，不增加平行状态机。结果工作区带版本与摘要，每次读取重验权限。

应用接受索引丢失时，以 Core 公共 TaskStore 的原请求与 trusted context 恢复关联。浏览器 sessionStorage 只保留未确认提交的原请求（不是任务真值），重试沿用原键及版本；用户明确再次启动则生成新键。

后台 Runtime 与 HTTP 生命周期分别管理。新实例可接受持久任务而等待旧执行器退出；使用 Core 独占执行器与排空契约，不以超时猜测旧进程已死。退出先停止接单并有界 drain；未知外部写入必须取得原提供方回执后处理。

生产构建不连接数据库或初始化 Runtime。正式启动才执行受控 schema 初始化并启动后台执行。初始化失败应清晰暴露不可用状态，不能影响现有人工版本保存或把失败当作空任务。

## 后续业务能力与平台协作

Content 制作、排期、发布和持续运营按同一 capability 契约逐项接入：创建返回原 job ID；查询及恢复核对原 job；价格与付款须独立授权；外部结果未知不重新提交。候选不能直接发布，也不自动改写已付款或已发布记录。

Platform AI/Codex 协作复用 Core collaboration/peer 公共契约，任务包含仓库、基线、范围、预算、产物、评审与部署证据。只能注册被授权的代码/验证/发布适配器；未注册的动作明确不可用。需验证双向真实交接及失败恢复，安装 endpoint 不代表验收通过。

## 交付状态

| 范围 | 当前状态 | 验收证据 |
| --- | --- | --- |
| 人工版本追溯 | 已上线 | creative-lineage.md |
| Core 固定依赖与服务端组合 | 本地通过，待生产 | candidate.114；两端类型检查与生产构建 |
| 持久创意任务、资料等待、候选采用 | 本地通过，待生产 | 真实 PostgreSQL + Core；桌面/手机真实组件 |
| 品牌简报、个人品牌偏好 | 本地通过，待生产 | 运营证据绑定；记住/遗忘/旧写不可复活 |
| 模型账务、权限及故障恢复 | 本地通过，待实模 | 未知用量不重调；撤权；回执重放；中央模型配置已核实 |
| 制作发布、持续运营 | 设计待实现 | 不能由本文件宣称完成 |
| Platform AI 双向工程协作 | 设计待实现 | 不能由安装框架宣称完成 |

负责人：AMC 应用维护者。Framework 缺口须先复现再回独立 Core 仓库修改；本轮未认定 Core 缺陷。实践记录回写 Obsidian 原笔记51及 IAiC Home。

## 已实现接口与操作边界

所有接口基于当前已认证 HUMAN 用户，要求品牌写范围及 brand.update；简报读取另需 draft.read/brand.read。MCP 中的同名任务服务使用请求 API key 对应的真实用户，不将 Agent 服务身份冒充人类委托。持续 Business AI 身份和 mandate 的激活另行交付。

| 接口 | 行为 |
| --- | --- |
| GET/POST /api/brands/:id/ai/tasks | Core 分页列表；提交 creative 或 brand_brief，返回202及taskId |
| GET/POST /api/brands/:id/ai/tasks/:taskId | 结果、用量、原稿与候选；补资料、取消、核对后继续及原控制回执 |
| POST /api/brands/:id/ai/tasks/:taskId/adopt | 显式采用固定摘要候选，复用创意版本服务并回读；不发布 |
| GET/POST /api/brands/:id/ai/preference | Core 品牌范围个人偏好；按 revision 编辑/遗忘，过期旧写不恢复已遗忘内容 |
| MCP create_ai_brand_task / create_ai_creative_task / list_ai_tasks / get_ai_task / control_ai_task | 与 UI 共用授权、额度、任务与恢复服务；不提供隐式采用工具 |

任务每次最多12轮/18次工具调用，每项额度600000、每用户UTC日最多3000000。单位是应用 allowance；真实供应商用量单独记录，不能视作售价。模型实际响应缺 usage 时停为 usage_reconciliation，保留预留，不按零结算、不自动重调。中央策略变更有界排空后重建，新任务等待服务刷新；历史任务保留原模型策略。代码/Skill 版本不兼容时不静默迁移任务。

## 本地验证及生产操作

- scripts/test-ai-native.mts：真实隔离 PostgreSQL、真实 Core，合成模型故障注入；覆盖接受索引恢复、原回执、补资料、Runtime重建、身份隔离、撤权、候选来源、AI版本追溯、未知用量保留、取消、简报快照、偏好记住/遗忘与旧写拒绝。
- scripts/test-ai-native-usage.mts、test-ai-native-http.mts：协议用量与输出上限、可信用户、Origin、载荷、no-store和安全错误；原全局文本与人工版本测试继续通过。
- MM scripts/test-ai-native-ui.mjs：真实组件/模拟API，1280及390宽；刷新续接、补资料、对比、保存回执丢失后同键确认；不冒充真实线上商户验收。
- scripts/verify-ai-native-production.mts：显式 --production-acceptance，分 prepare/complete 两个独立进程验证持久任务；使用标记归档测试品牌、中央真实模型和实际用量，再删除测试业务对象，保留Core账务和任务证据。没有付费媒体或发布动作。
- 原全库 auth audit 存在20条未识别的既有路由；本轮4条新路由由 nativeHttp 封装鉴权且单独测试。此历史扫描债务未扩为本轮权限改造。

未交付范围明确为：旧语音 companion 业务动作尚未全部迁入 Core、Content付费制作及发布能力、周期Business AI、Platform AI/Codex双向实际工程交接。这些仍使用已有流程或保持未启用状态；不能从本轮User AI验收推导其已完成。
