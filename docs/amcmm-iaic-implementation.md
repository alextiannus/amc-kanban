# AMCMM IAIC 技术改造执行设计

## 当前产品闭环

AMCMM AI Native 的主要业务目标是：根据当前品牌资料主动从 AMC Content 原创意库匹配创意 → 用户 review 并修改 → 保存品牌再创作版本 → 添加素材进入既有制作流程，或保留在该品牌发布计划供日后使用。品牌简报是辅助能力，不能代替这条流程。

选择策划创意后，AMC-MM User AI Assistant 自动根据当前品牌与SKU资料完成脚本适配，主理人默认审阅AI适配后的完整脚本；原稿折叠保留作为来源。推荐也必须使用当前SKU事实；有SKU时记录实际选用SKU引用，未知价格/规格/库存/卖点不得照搬参考内容，必要信息缺失进入补问。人工可继续修改后保存计划或添加素材制作，原稿→AI产物→人工版本保持追溯。此轮选择即适配与SKU约束实现中，待验收。

工作台设定入口位于「系统设置 → 工作台设定」，创意工作台不再显示个人偏好编辑器。初始设定从当前品牌名称、行业、语气、受众、产品、市场及内容限制自动生成；已有个人品牌偏好优先保留。品牌默认值随资料更新而重新读取，不自动写入个人记忆；恢复品牌默认会遗忘自定义偏好，保留Core遗忘版本，不能恢复旧内容。切换品牌重新加载且隔离设定；缺失资料不推测。此入口调整及默认投影已上线，生产隔离品牌保存/回读/恢复及权限验收通过。

本次新增流程状态：2026-09-30 已部署；真实 Content 创意库、真实模型、审阅保存及计划回读验收通过；制作交接通过真实组件/模拟 API 验证，未执行真实付费生成或公开发布。首次进入品牌 AI 工作台主动接受一次有界推荐任务，同一用户/品牌/UTC 日/品牌事实快照复用任务；明确刷新可启动新任务。后台 Runtime 在关页后继续，缺少事实进入同一任务的资料等待。只接受 Content 返回的持久原创意 ID，保留检索快照与摘要；无匹配如实展示，不伪造来源。

用户可编辑推荐标题、策划、文案、素材要求，选择计划日期和平台。采用动作在单个事务内保存原创意快照、AI 候选证据、人工修改版本、品牌和实际操作者/当时主理人关系，并权威回读；跨月重试不能重复插入。同一推荐只能首次采用一次，之后使用既有版本编辑。两种去向都先保存审阅版本：“保留发布计划”保持待用状态；“添加素材制作”把已保存创意交接给既有图文/视频制作入口。制作、付费确认、批准及正式发布仍各自遵守现有流程。

验收必须覆盖来源伪造拒绝、无匹配、品牌资料过期、并发与回执丢失、日期/平台校验、当前授权、计划回读、跨刷新采用回执、制作入口绑定同一创意及手机端可用性。自动周期运营和付费制作无人值守不包含在此触发范围。

状态：2026-09-30 User AI 工作台已部署；创意改写、补资料、采用保存通过真实模型生产验收。品牌简报的确定统计修正与常驻后台执行已通过实模复验；品牌匹配推荐、人工采用、计划保存及既有制作入口交接已交付；无人值守制作发布、周期持续运营与平台协作仍待交付。P0 人工版本保存已上线，见 creative-lineage.md。本文件是 AI Native 改造的执行契约；设计、代码、本地验证、生产验证分别记账。

## 产品与验收

AMCMM 由短对话入口扩展为品牌工作台。用户提出目标后取得持久任务回执，可关闭页面，稍后查询进度、补充资料、取消任务、查看候选和验证过的业务结果。系统只有取得权威业务回执才能声称保存完成。候选完成、版本保存、视频完成、发布成功分别显示。

工作台以品牌创意库匹配为主入口，支持 creative_discovery；指定创意改写 creative 和辅助品牌工作简报 brand_brief 继续兼容。匹配任务读取当前品牌资料与真实 Content 来源，经用户审阅修改后创建可追溯的待用计划，并可交接既有素材制作入口。个人品牌偏好通过 Core Memory 保存、读取和遗忘；模型只有读取权限，偏好不能成为产品事实或业务授权。

当前指定脚本流程：选择品牌与创意 → 自动建立品牌与SKU适配任务 → Core 任务读取品牌事实和当前创意 → 缺失事实进入等待资料 → 补充后继续同一任务 → 保存候选工作区产物 → 用户检查候选并确认保存 → 复用版本服务原子保存 → 按 revisionId 回读核对。人工保存入口继续可用。

验收包含：两用户/品牌隔离、补资料持久化、服务重建后继续、并发执行器所有权、撤权、原模型绑定、预算耗尽、未知模型调用保留账务、保存结果不明核对、重复提交、旧版本冲突、移动端进度与错误反馈。真实模型质量与合成模型故障测试分别记录。

## 框架与边界

核定公共 Core main `8b184031ee3211acb2d1ee06a1f7aa7ef175e12c`，包 `0.1.0-candidate.114`；从独立仓库打包，SHA-256 `1eb1b87bcef1c1191eff788ca77cee678a1ac979c91ac0bcbecc77a525d79f24`。只使用公共导出，不修改 vendor 为框架源码。

Kanban 托管 Core TaskStore、AgentRuntime、CapabilityDispatcher、身份、Skills、Workspace、Memory、Knowledge、模型额度和任务控制。PostgreSQL 为持久层，独立 schema 防止框架表名和其他应用混淆。Core 自己执行模块迁移，应用不读写 Core 私有表。AMCMM 通过认证 BFF 调用同一能力；不持有模型密钥，不在 localStorage 存任务真值。

超大品牌资料使用有界原文摘录并明确 partial，摘要始终绑定完整授权数据快照；省略部分必须按未知处理，必要时向人类补资料。运营列表和计数在 RepeatableRead 快照内读取，按稳定顺序计算摘要。后端明确提供账户总数、草稿总数（含确定的0），界面独立显示当前统计并标记简报源快照是否已变化；模型不能把空数组推断成数量未知。简报正文使用用户可读来源名，不暴露内部工具名和摘要。

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
| Core 固定依赖与服务端组合 | 已部署 | candidate.114；两端类型检查与生产构建 |
| 持久创意任务、资料等待、候选采用 | 生产实模通过 | 真实 PostgreSQL + Core；跨进程补资料、候选采用、原版本回执 |
| 品牌简报、个人品牌偏好 | 生产实模及本地故障验证通过 | 运营证据绑定、真实后台执行；记住/遗忘/旧写不可复活 |
| 模型账务、权限及故障恢复 | 故障本地通过，实模账务通过 | 未知用量不重调；撤权；回执重放；中央真实模型用量已结算 |
| 推荐审阅、保存计划、既有制作入口交接 | 已部署、分层验收通过 | 真实库/模型/保存回读；制作交接为真实组件+模拟API，未执行付费制作或发布 |
| 无人值守制作发布、周期持续运营 | 待实现 | 既有人工制作流程仍独立审批 |
| Platform AI 双向工程协作 | 设计待实现 | 不能由安装框架宣称完成 |

负责人：AMC 应用维护者。Framework 缺口须先复现再回独立 Core 仓库修改；本轮未认定 Core 缺陷。实践记录回写 Obsidian 原笔记51及 IAiC Home。

## 已实现接口与操作边界

所有接口基于当前已认证 HUMAN 用户，要求品牌写范围及 brand.update；简报读取另需 draft.read/brand.read。MCP 中的同名任务服务使用请求 API key 对应的真实用户，不将 Agent 服务身份冒充人类委托。持续 Business AI 身份和 mandate 的激活另行交付。

| 接口 | 行为 |
| --- | --- |
| GET/POST /api/brands/:id/ai/tasks | Core 分页列表；提交 creative_discovery、creative 或 brand_brief，返回202及taskId |
| GET/POST /api/brands/:id/ai/tasks/:taskId | 结果、用量、原稿与候选；补资料、取消、核对后继续及原控制回执 |
| POST /api/brands/:id/ai/tasks/:taskId/adopt | 显式采用固定摘要候选；discovery 另提交 sourceCreativeId 与白名单人工 patch，原子创建待用创意及版本并回读；creative 保存已有卡片新版本；不发布 |
| GET/POST /api/brands/:id/ai/preference | Core 品牌范围个人偏好；按 revision 编辑/遗忘，过期旧写不恢复已遗忘内容 |
| MCP discover_brand_creatives / create_ai_brand_task / create_ai_creative_task / list_ai_tasks / get_ai_task / control_ai_task | 与 UI 共用授权、额度、任务与恢复服务；不提供隐式采用工具 |

任务每次最多12轮/18次工具调用，每项额度600000、每用户UTC日最多3000000。单位是应用 allowance；真实供应商用量单独记录，不能视作售价。模型实际响应缺 usage 时停为 usage_reconciliation，保留预留，不按零结算、不自动重调。中央策略变更有界排空后重建，新任务等待服务刷新；历史任务保留原模型策略。代码/Skill 版本不兼容时不静默迁移任务。

## 本地验证及生产操作

- scripts/test-ai-native.mts：真实隔离 PostgreSQL、真实 Core，合成模型故障注入；覆盖接受索引恢复、原回执、补资料、Runtime重建、身份隔离、撤权、候选来源、AI版本追溯、未知用量保留、取消、简报快照、偏好记住/遗忘与旧写拒绝。
- scripts/test-ai-native-usage.mts、test-ai-native-http.mts：协议用量与输出上限、可信用户、Origin、载荷、no-store和安全错误；原全局文本与人工版本测试继续通过。
- MM scripts/test-ai-native-ui.mjs：真实组件/模拟API，1280及390宽；刷新续接、补资料、对比、保存回执丢失后同键确认；不冒充真实线上商户验收。
- scripts/verify-ai-native-production.mts：显式 --production-acceptance，分 prepare/complete 两个独立进程验证持久任务；使用标记归档测试品牌、中央真实模型和实际用量，再删除测试业务对象，保留Core账务和任务证据。没有付费媒体或发布动作。
- 原全库 auth audit 存在20条未识别的既有路由；本轮4条新路由由 nativeHttp 封装鉴权且单独测试。此历史扫描债务未扩为本轮权限改造。

未交付范围明确为：旧语音 companion 业务动作尚未全部迁入 Core、Content付费制作及发布能力、周期Business AI、Platform AI/Codex双向实际工程交接。这些仍使用已有流程或保持未启用状态；不能从本轮User AI验收推导其已完成。

## 生产验收记录

Core 未修改或发布新版本。中央策略 version5、既有文本配置；未更改密钥管理、费用或奖励规则。验收使用归档且关闭 autopilot 的合成品牌，不操作真实商户内容。

- 创意任务 b208e9c8-0dc5-4d63-873a-43ca4df7bfb7：prepare 作业 job-dau6dpmgekts73d5b9v0 真实询问受众；独立 complete 作业 job-dau6ejnlot8c739rur4g 补资料、回读候选、采用并验证版本 cmunft1pl00035l1gvzw2q3na；重复采用同一回执，实际操作者与来源 cre_acceptance_source 一致，无发布。10次真实模型请求，58921 provider tokens，pending=0。续接阶段约189秒，未宣称即时响应。
- 首次后台简报：请求进程主动 drain 自身执行器，线上常驻服务完成任务7155bf16-863e-4cc8-95bc-9319d02d8963（job-dau6h76k1f9s73aicdsg），9次真实请求/48537 provider tokens/pending=0。结构、快照及后台执行通过，但正文把空统计写成unknown；这是应用事实表达验收发现的问题，未将结构验证冒充语义正确。
- 修正：后端在RepeatableRead快照内提供确定总数，覆盖0、31条内容超出30条返回页、已解绑账号排除；UI单独显示当前数值及旧报告快照标记；Skill要求零值按零表达，正文不包含内部hash或工具名。最终复验 job-dau6m25g1s2s73blr3m0 succeeded，任务a147a341-2c6a-4c09-8c55-0e1b96d00bcc：9次请求/48461 provider tokens/pending=0，currentOperations为draftTotal=0、accountTotal=0、changed=false。正文明确两个0、不含内部摘要或工具名；请求进程自身执行器已drain，由线上后台完成。
- 页面200、未登录任务接口401、MM跨来源偏好写入403/no-store。401来自既有前置鉴权层，不声称其返回了新路由的no-store。真实组件浏览器验收与生产服务验收分开，未使用真实商户账号执行线上UI全流程。

范围边界：已交付User AI持久工作台；旧语音业务动作全面迁移、Content付费制作/发布、周期Business AI与Platform AI/Codex双向工程交接没有在本轮完成，不将其写成已上线。

最终运行版本：Kanban `473bb637f73a9e85a837d02fdf06f3f7eaf8874d` / Render SG `dep-dau6kfjrjlhs73cha4ng` live；AMCMM `ac4047f599117f3ebd1100bc648498d71a850b49` / `dep-dau6ll6q1p3s7388n6h0` live。创意实模验收首次运行于3330d696；最终版本补齐统计和读取投影，并完成本地回归、旧任务回读及简报复验。MM同时修正非当前月份采用后的刷新，保留其他月份创意。

三项实模验收共28次请求、155919 provider tokens，均已结算，无未知调用；这些是实测token，不是报价或货币。测试品牌清理作业为 job-dau6o8vavr4c73ftuki0，清理作业已succeeded并输出ok:true；清理前再次核对品牌、实际修改人、当时主理人、requestedBy与原创意关系，删除归档测试品牌及测试账号，保留Core任务、用量、artifact与审计。

下一阶段负责人：AMC应用维护者与产品负责人。先固定Content制作采用的creativeRevision及估价/授权/原job恢复契约，再实施有期限和预算的Business AI mandate；Platform AI协作需独立工程任务、双向交接和评审部署验证。现有User AI成功不代替后续阶段验收。

## 推荐检索与审阅契约

`creative_discovery` 复用 Content 的品牌创意匹配 API，要求 `requirePersistedCreative=true`，保留原库审核状态供人工审阅，不使用静态导出冒充库内原创意。Core `amc.library` 只读能力固定检索快照，模型输出必须绑定品牌事实摘要、检索摘要及实际来源 ID；空库返回空推荐。`proactive:true` 只适用于 discovery，服务端生成用户/品牌/UTC日期/品牌事实摘要的幂等键及固定目标，不信任客户端自动额度。当前触发是进入工作台，不是全天候周期运行。

采用前后端共享服务：保存原 Content 来源快照与未知发行版本标记、AI artifact/candidate、人工修改、actor 和主理人关系；品牌知识表使用原子 upsert 及行锁，复用 CREATIVE_ITEM baseline/人工版本/审计事务。相同任务和来源得到确定的品牌创意 ID，跨月份重复提交会校验原回执而非插入第二份。正常新保存重验品牌事实，旧已成功回执不因事实后续变化而丢失。GET 任务返回持久采用回执，刷新可继续制作。

制作交接通过已保存创意 ID 进入既有图文/视频工作页，用户添加自有素材并沿用原生成、报价确认、草稿审阅、批准及发布路径。本轮不把浏览器跳转当作已生成视频或已发布，不宣称新接入无人值守制作 capability。

## 真实推荐任务验收发现与修正

首个真实库推荐任务 `6920de14-794e-44ff-a457-0fa1245ef07a` 在3次模型请求后进入 model_output_limit，22639 provider tokens 已结算、pending=0，没有保存或发布。当前6000输出上限同时承担模型推理和结构化工具输出。只读检查确认真实库已返回3个来源，工具结果24531字节，第三次请求耗满6000输出额度。修正采用标记 bounded_excerpt 的有限来源摘录（保留实际 ID/链接/审核状态），并复用现有短文生成的有界推理默认：仅当中央配置未指定 reasoningEffort 且模型为 GLM-5.3 时，ai_native 默认 low；中央明确配置继续优先，输出上限/任务预算不增加，不自动续调已暂停任务。此轮失败保留；后续真实复验结果见下方最终验收。

第二次实模任务 `e5f3ad31-5a30-4052-a762-ec3c33cb832b` 没有输出超限，但12轮后进入 limit，12次请求/114722 tokens已结算。只读诊断证实模型先自行使用 candidates/reviewCopyEn 等错误字段，两次未通过验证；直到后段才读Skill并改为正确 recommendations，因此耗尽轮次。修正不增加轮数：amc.context直接提供requiredSkill与artifactContract，验证要求实际读Skill，并返回discovery专用字段反馈；强化不能从原创意或handmade推断freshness等未确认事实。此轮失败保留；后续真实复验通过，未把第二次失败标记成功。

第三次验收脚本在新模型任务创建前读取旧任务完整历史，Core因Skill版本变化正确返回409。应用状态/控制改用公共Runtime.state；任务详情在历史重验证409时仅回传当前授权状态/用量和明确historyUnavailable，不返回未通过验证的旧来源或产物，不绕过Core读取私表。品牌业务版本仍由既有版本接口读取。该边界与真实推荐质量分别验证。


## 品牌创意推荐主流程最终验收（2026-09-30）

运行版本：Kanban `b9515310a23ed298b38ad04481eab029e86ccb77`，Render `dep-dau7mcrbc2fs73cbbu6g` live；AMCMM `33cf0473ad6fe4555c9116c74b32e77ed0fe91fe`，`dep-dau7md49v7es73bansd0` live。Core 保持 candidate.114，没有框架源码修改。

真实库及模型作业 `job-dau7kaqd0e5s73ejfsug` succeeded，任务 `d9a03cb9-4b3e-4854-b55c-f602ba2ae08d` succeeded，6次模型请求、38472 provider tokens，pending=0。请求进程已排空，由线上常驻 Runtime 执行。推荐来自实际持久库来源，包括 `cre_ins_0a5f3818-c6d5-4afa-b8ad-d8b5a7ed8341`；产物 revision1，digest `ab3f05be9b43ec6aec37acba2d247e211bcb9f5f24f8443ad917df12ab871c2d`。人工采用版本 `cmunil549000b4g1g56m1n8j6` 保存到品牌计划；重复提交返回同一回执，权威回读验证品牌、实际修改人、当时主理人、原创意与AI任务关系。

语义验收发现首条文案含未经品牌确认的“every day”。通过同一人工版本服务移除该表述，作业 `job-dau7me5g1s2s73bporfg` 保存 revision2 `cmuniqglu0001321gccdxns9h`，父版本为上述 revision1，同键重放及来源保留通过。因此结构/来源验证不等于全部自然语言事实正确；review 仍为必要步骤，未宣称模型事实零错误。

历史任务实验：`job-dau7i6ugekts73d9qn4g` 在新模型请求前，被旧Skill expectedVersion冲突阻断。应用原先读取完整历史只是为了获知任务状态；修正使用公共 runtime.state 管理生命周期，详情历史409时仅返回当前受权状态与 historyUnavailable=revision_conflict，不返回过期产物/来源，也不绕过采用验证。撤权仍拒绝。真实Core测试最初未固定Skill expectedVersion而没有复现冲突，补齐真实版本绑定后成功复现并验证修正；这是应用兼容性处理，不认定Core缺陷。

本轮三项实模任务共21次请求、175833 provider tokens，均已结算，数值不是货币报价。失败任务不自动续调，验收使用归档隔离品牌；没有执行付费媒体生成或正式发布。

本地检查：真实PostgreSQL/Core来源及幂等并发测试、原任务恢复/额度/权限/偏好回归、人工版本回归、用量及中央模型路由测试、两端类型检查通过；两端生产构建通过。1280/390真实React组件+模拟API覆盖自动进入匹配、人工修改、未知保存精确重放、刷新后采用回执、保存内容制作交接及历史证据提示。该浏览器验证不冒充真实商户账号线上端到端验收。

产品边界：进入品牌工作台主动匹配，可明确刷新；已接入既有素材/图文/视频制作入口及原审核发布流程。周期自主运营、无人值守付费制作/发布、Draft/VideoProject 固定 creativeRevision 引用、Platform AI双向工程协作仍待独立交付。负责人：AMC应用维护者；下一步由产品负责人验证实际品牌使用，并另行完成下游固定版本引用和有范围/期限/预算的Business AI mandate。

最终生产核对与清理：`job-dau7p61srm7s73b4piv0` succeeded，旧任务来源冲突时状态仍可读取且不返回旧推荐；成功任务推荐与已采用回执仍可读取，revision2及父版本/来源/修改人再次验证。两个归档验收品牌和对应测试账号已删除，Core任务、产物、账本与审计保留；零ContentDraft、零公开发布。


工作台设定上线验收（2026-09-30）：Kanban `cf6f061ac306a570fe2f582a45b88927fc1fe9db` / `dep-dau7s9qvcj2c73ejdspg`、MM `6c97bfa1f0c9eb95d520120f30793df0d4e3ed60` / `dep-dau7s9vf3r2c73fi8710` 均 live。`job-dau7u67lot8c73a1m7sg` succeeded：当前品牌默认值读取不写个人记忆，自定义保存及同键重放、权威回读、遗忘与旧写拒绝、品牌资料更新后的默认刷新、跨品牌权限均通过；未调用模型或发布内容，隔离账号/品牌已清理。两端类型检查/构建、默认值白名单与空值测试、真实Core/PostgreSQL回归、1280/390真实组件+模拟API测试通过。线上页面200，未登录两端设定接口401，MM跨来源POST403/no-store。Core仍为candidate.114，无框架改动。
