品牌创意的当前入口与展示契约（已上线，2026-09-30）：首页下方四个功能提示为 Plan review、Assets、Brand Ideas、More services；Brand Ideas 替换 Brand Planning，删除首页顶部的大入口和常驻长模板卡。每日检索按品牌时区执行，匹配后由 AI 自动完成品牌适配并保存为待审核策划；有产品目录时引用真实 SKU，无产品目录时生成可直接审阅的品牌通用脚本；只有已完成适配、具有完整脚本及素材需求的品牌策划才进入消息列表。消息仅展示适配标题和简短预览，点击打开可审阅、修改、下载素材需求与添加素材的详情页。Brand Ideas 入口查看所有已适配预览及处理状态。未适配模板不展示标题、正文或素材下载，不以原品牌模板冒充当前品牌内容。消息按品牌与创意 ID 去重，切换品牌立即隔离。消息的提醒/已读状态独立持久化，有效的已读消息保留 Inbox；详情可查看下一个，制作弹窗提供相册上传和素材库选择。当前契约与发布状态见 prd_amc_mm.md。普通模式审核后制作；自动驾驶可在品牌授权内生成内容，正式发布仍须人工确认。

# AMCMM IAIC 技术改造执行设计

## 当前产品闭环

AMCMM AI Native 的主要业务目标是：根据当前品牌资料主动从 AMC Content 原创意库匹配创意 → 用户 review 并修改 → 保存品牌再创作版本 → 添加素材进入既有制作流程，或保留在该品牌发布计划供日后使用。品牌简报是辅助能力，不能代替这条流程。自动驾驶模式由 User AI Assistant 接管调研、策划、脚本适配与图文内容生成的中间审批；正式发布仍需人工确认。

选择策划创意后，AMC-MM User AI Assistant 自动根据当前品牌资料完成脚本适配；产品目录存在时使用真实 SKU，产品缺失时完成品牌通用脚本，主理人默认审阅AI适配后的完整脚本；原稿折叠保留作为来源。推荐也必须使用当前SKU事实；有 SKU 时记录实际选用 SKU 引用；没有 SKU 时不阻断适配和展示，围绕已有品牌资料、门店、服务与消费场景创作，SKU 引用为空。未知价格/规格/库存/卖点不得照搬参考内容；改写为不依赖该信息的通用表达，只有任务本身不可缺少的信息才补问。人工可继续修改后保存计划或添加素材制作，原稿→AI产物→人工版本保持追溯。选择即适配与SKU约束已上线，真实模型和人工修改保存回读验收通过。

工作台设定入口位于「系统设置 → 工作台设定」，创意工作台不再显示个人偏好编辑器。初始设定从当前品牌名称、行业、语气、受众、产品、市场及内容限制自动生成；已有个人品牌偏好优先保留。品牌默认值随资料更新而重新读取，不自动写入个人记忆；恢复品牌默认会遗忘自定义偏好，保留Core遗忘版本，不能恢复旧内容。切换品牌重新加载且隔离设定；缺失资料不推测。此入口调整及默认投影已上线，生产隔离品牌保存/回读/恢复及权限验收通过。

本次新增流程状态：2026-09-30 已部署；真实 Content 创意库、真实模型、审阅保存及计划回读验收通过；制作交接通过真实组件/模拟 API 验证，未执行真实付费生成或公开发布。首页和 Brand Ideas 预览不新建 AI 任务；用户主动展开任务面板时接受一次有界推荐任务，同一用户/品牌/UTC 日/品牌事实快照复用任务；明确刷新可启动新任务。后台 Runtime 在关页后继续，缺少事实进入同一任务的资料等待。只接受 Content 返回的持久原创意 ID，保留检索快照与摘要；无匹配如实展示，不伪造来源。

用户可编辑推荐标题、策划、文案、素材要求，选择计划日期和平台。采用动作在单个事务内保存原创意快照、AI 候选证据、人工修改版本、品牌和实际操作者/当时主理人关系，并权威回读；跨月重试不能重复插入。同一推荐只能首次采用一次，之后使用既有版本编辑。两种去向都先保存审阅版本：“保留发布计划”保持待用状态；“添加素材制作”把已保存创意交接给既有图文/视频制作入口。制作、付费确认、批准及正式发布仍各自遵守现有流程。

验收必须覆盖来源伪造拒绝、无匹配、品牌资料过期、并发与回执丢失、日期/平台校验、当前授权、计划回读、跨刷新采用回执、制作入口绑定同一创意及手机端可用性。后台每日检索按品牌时区独立执行并自动保存待审策划；自动驾驶可代替策划与图文生成的逐项审批，付费视频制作与正式发布仍按既有流程确认。

状态：2026-09-30 User AI 工作台已部署；创意改写、补资料、采用保存通过真实模型生产验收。品牌简报的确定统计修正与常驻后台执行已通过实模复验；品牌匹配推荐、人工采用、计划保存及既有制作入口交接已交付；User AI 自动驾驶图文生成已实现，部署验收状态见本文自动驾驶章节；付费视频、无人确认发布与平台协作未由本次开关授权。P0 人工版本保存已上线，见 creative-lineage.md。本文件是 AI Native 改造的执行契约；设计、代码、本地验证、生产验证分别记账。

## 产品与验收

AMCMM 由短对话入口扩展为品牌工作台。用户提出目标后取得持久任务回执，可关闭页面，稍后查询进度、补充资料、取消任务、查看候选和验证过的业务结果。系统只有取得权威业务回执才能声称保存完成。候选完成、版本保存、视频完成、发布成功分别显示。

工作台以品牌创意库匹配为主入口，支持 creative_discovery；指定创意改写 creative 和辅助品牌工作简报 brand_brief 继续兼容。匹配任务读取当前品牌资料与真实 Content 来源，经用户审阅修改后创建可追溯的待用计划，并可交接既有素材制作入口。个人品牌偏好通过 Core Memory 保存、读取和遗忘；模型只有读取权限，偏好不能成为产品事实或业务授权。

当前指定脚本流程：选择品牌与创意 → 自动建立品牌与SKU适配任务 → Core 任务读取品牌事实和当前创意 → 仅任务不可缺少的事实缺失时进入等待资料；无产品目录默认生成完整品牌通用稿 → 补充后继续同一任务 → 保存候选工作区产物 → 用户检查候选并确认保存 → 复用版本服务原子保存 → 按 revisionId 回读核对。人工保存入口继续可用。

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
| User AI 自动驾驶图文生成 | 已部署，全链路生产验收进行中 | 默认开启；Agent 调用调研/策划/适配/生成能力，Core 等待与恢复；正式发布仍需人工确认 |
| 自动付费视频渲染、无人确认发布 | 不在本次自动驾驶授权内 | 保留既有确认流程 |
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


## 选择脚本后品牌与SKU自动适配：生产验收（2026-09-30）

Kanban运行版本 `bf532b456aea5bf44099e91e1e7afd8300cec399`，Render `dep-dau851dbifpc73en10n0` live；MM `efb67835fec24570f33870cc60e7962f6c32bfdd`，`dep-dau84iou01pc73863ui0` live。Core仍为candidate.114，无源码修改。首次应用提交e95767db后的幂等复核发现JSONB重排字段会让重算intent摘要误拒绝同键请求；修正比较已存准入digest，数据库回归和生产重复选择同task验收通过。

作业 `job-dau87s6gekts73dcg53g` succeeded（03:39:08Z）；任务 `c6055bdf-64cd-4bff-a5d8-1e79a2daee79` succeeded，9次真实模型请求、50836 provider tokens，pending=0，complete=true。选择同一脚本两次返回同一任务。输入为隔离品牌的合成参考脚本（Brand X Burger / 99），当前SKU为 `sku_sesame` / Sesame Noodles / SGD 8.50。真实产物引用该SKU，生成15秒开场、分镜、口播、CTA及素材需求，正文没有保留Burger或99；不是只替换标题或返回改写建议。

人工修改planning后保存回执 `cmunk37o500090i1gz8j3ak1w`，精确重复回执、任务详情读取已采用版本、品牌/真实修改人/原创意/AI任务关联及业务版本回读通过。未调用付费媒体生成或公开发布。清理作业 `job-dau89omk1f9s73ap72d0` succeeded（03:42:39Z），归档验收品牌与测试账号已删除，Core任务/Workspace产物/账本/审计保留。

验证范围：两端生产构建和类型检查；真实PostgreSQL/Core补问恢复、SKU依据、采用回执、品牌事实变化和权限回归；SKU白名单、遗留ID稳定快照、未知币种不推断、跨品牌SKU拒绝；1280/390真实组件+模拟API自动适配、原稿折叠、人工修改、未知响应精确重放、刷新后保留审阅稿、交接相同保存稿；旧推荐与任务UI回归。线上页面200，未登录任务接口401。没有把模拟浏览器验收称为真实商户线上全流程，也未进行付费制作/发布验收。

事实表达边界：引用正确SKU和替换外部产品不等于所有自然语言事实已验证。实模稿中的warm/smooth等形容以及家庭用餐等新增镜头仍需主理人核实和提供素材；它们不能因结构校验通过被当作既有品牌事实或现成素材。人工review步骤保留。日志导出曾超时，使用确切时间窗口读取后取得完整回执；未因此重复推理。

负责人AMC应用维护者；本次选择即适配需求完成。下一步由主理人在实际品牌资料与SKU下使用、审阅；周期无人值守运营及下游固定creativeRevision引用仍按独立范围推进。

### Daily brand idea pool (2026-09-30)

AMC-MM keeps an application-owned, persisted idea pool separate from reviewed publishing plans. The server worker runs without an open browser and claims one search per active brand and local calendar day. The unique `(brand_id, local_day)` receipt prevents repeat searches across replicas and restarts. On first fill it requests six persisted Content creatives; subsequent daily searches request three new sources (or the deficit to six), excluding up to 72 active/recent sources. The pool grows to 18. At capacity, new matches replace the oldest unselected suggestions first, then older selected suggestions if necessary. Replacement only changes homepage visibility: source snapshots, admitted Core tasks, reviewed revisions and publishing plans remain unchanged.

Six is a replenishment target backed by real library matches, not permission to fabricate sources. Empty matches and outages preserve the existing pool; the UI shows a shortfall. Failed or interrupted searches are not automatically repeated that day because transport completion may be unknown. Startup catches up the current day, not every missed date. Invalid brand time zones fall back to UTC; missing zones use Asia/Singapore.

The homepage reads the pool without admitting model work. It randomly selects one idea, rotates every 30 seconds while visible and idle, and pauses on pointer/focus interaction. Selecting a pool idea admits an idempotent, brand/user-scoped IAIC discovery task restricted to that immutable source. AI reads current brand/SKU facts and produces the complete adapted script and a non-empty scene-specific material checklist. Human review remains required before saving or producing content. Source/brand/principal/reviewer/AI artifact lineage continues through the existing revision service. Script and checklist downloads reflect the currently displayed review draft or saved receipt.

Storage: `amc_iaic.brand_idea_days` and `amc_iaic.brand_ideas`, initialized idempotently by the resident worker. Read endpoint: `GET /api/brands/:id/ai/ideas` with current human brand-write authorization. Selection uses `POST /api/brands/:id/ai/tasks` with `kind: creative_discovery` and `poolIdeaId`; cross-brand IDs cannot resolve. Content matching supports bounded `excludeCreativeIds` and expands its search window before filtering and counting persisted results.

Validation: real PostgreSQL daily admission concurrency, 6→18 growth, bounded replacement and immutable source retention, outage/no-match/duplicate preservation; Content matcher exclusions; desktop/mobile rotation, interaction pause, selected-source admission and exact reviewed-script/material downloads; existing Core provenance and review-to-production regression suites.

Production acceptance completed on 2026-09-30 (Singapore): Content `48c125a`, Kanban runtime `72c28756`, and AMC-MM `fb5dd49` are live. The first resident-worker sweep completed searches for 28 active brands; 15 reached six ideas and 13 returned fewer than six. These shortages remain visible and require additional suitable matches; the configured minimum is not reported as achieved for those brands.

The isolated production fixture received six real Content sources. Selecting one admitted the same Core task on replay, adapted the script to `sku_sesame`, returned five material requirements, and saved a verified human-reviewed revision with the brand, principal, original source and AI artifact lineage. Task `824b0485-e074-4814-8a68-e072c16b540f` completed six provider requests (32,759 tokens; no pending usage). Current authorization and foreign-brand source rejection passed. Production generated no content drafts or publications. Both acceptance fixtures were cleaned; Core task, ledger, artifact and audit evidence remain. Desktop/mobile browser tests covered rotation, interaction pause, selected-source binding and downloads of the edited review text and material checklist.

### 每日自动品牌策划与方向去重（2026-09-30）

每日检索按 Brand.timezone 的当地日期持久化认领；多实例、重启及首页刷新不重复检索。内容库在检索阶段排除已出现的来源和已有策划，扩大候选窗口并继续跨查询寻找不同方向。池的目标为 6–18 个；初次最多补至 6 个，此后每日增加最多 3 个，满池替换旧建议。真实来源不足时显示缺口，不伪造填充。

相似性规则包括原创意 ID、去掉追踪参数的来源 URL、规范化原创文本和字符三元组相似度（Dice ≥ 0.82）。根据原创证据分类为制作过程、产品展示、品尝、知识、对比、顾客故事、品牌故事、场景、探店、优惠、幽默及未分类。每一方向同时最多两个，优先补齐缺少方向；未分类也限制为两个。此版本使用保守分类和文本相似度，不宣称语义识别完全准确。写入策划的品牌级事务锁内再次核对，防止并发任务绕过限制。

匹配后的每个创意通过 IAIC Core 的持久任务读取当前品牌资料，产品目录存在时绑定真实 SKU，目录为空时生成无 SKU 引用的完整品牌通用脚本，并提供逐项素材需求；成功后自动加入品牌的发布策划，状态为 AI 待审核。无需点击创意才启动适配。Core 负责执行、等待、用量、恢复和产物；应用层仅认领每日检索、关联来源、校验及归档版本。后台任务使用主理人或 OWNER 的当前授权、单独的 brand_daily 范围，每品牌当地日最多六个任务额度，不占用人工任务额度。HTTP 调用不能请求该范围。主理人可在任务列表补充资料、查看等待原因或取消。

当自动适配任务明确停在 `interrupted` 或 `limit`，且 Core 确认该任务用量已完全结清、当前创意未写入策划时，应用可为“补齐六个可审核创意”建立当前应用版本唯一的恢复任务。恢复任务保留前任务 ID 和版本证据，不修改 Core 状态表；同一创意在同一应用版本只准入一次，并仍受每品牌当地日六个任务的总额度限制。已有六个成功策划或当前版本恢复任务已占满缺口时，不再续调。输入等待、未知用量、未知外部结果、取消及其他失败状态不自动重建。该逻辑已完成本地实现和验证，待生产部署与真实品牌回读。

自动入策划的版本记录 actor=AI，并关联授权主理人、品牌、SKU、原始创意快照、Core task 和 artifact。审核前不转入生产草稿；主理人修改保存后记录 HUMAN 版本，再添加素材制作。下载仅包含当前素材清单与拍摄辅助要求，不包含完整脚本或发布文案。新创意替换旧建议时，只归档旧的未审核自动稿，保留不可变版本及已审核的人工作品；已有人工作品占满方向时不再添加第三份。因品牌事实变化而无法保存的任务保留明确状态，等待后续新建议，不重复计费无限重试。

本地验证已覆盖：品牌时区与八并发每日认领、6→18 增长、来源绑定、六个真实 Core 持久任务（测试模型）、AI/主理人/原创意版本链、幂等重放、审核前无生产草稿、人工审核、自动归档和授权撤销；恢复专项另验证部署版本中断、用量结清门禁、同版本幂等、前任务 ID 保留、当地日额度、六个策划落库及重复轮询不新增任务。TypeScript 和生产构建通过。桌面和手机端消息预览、品牌隔离、已适配脚本详情审核、保存响应丢失重试及素材下载沿用既有回归结果。

发布恢复说明：此次滚动发布时，旧执行器在退出前认领了新版本的 50 个零调用任务，Core 以 version_mismatch 将其暂停。切换完成后，通过公开的 tasks.resume 接口恢复原任务；没有重建任务、修改 Core 状态表或重复模型调用。受限恢复程序为 scripts/reconcile-daily-deploy-interruptions.mts --apply：只处理当前版本校验通过、因旧执行器而 interrupted、调用历史为空且用量已结清的任务。它是发布后的维护操作，不会自动恢复输入等待、未知用量或已执行过模型调用的任务。测试已复现旧执行器暂停六个新任务，再以新执行器恢复同一任务并完成版本保存。

线上验收（2026-09-30，Render job-daua5a6gekts73dk2afg）：Content e154fd13、Kanban 19b6511d、AMC-MM 6fc3933a 均已 live。常驻池覆盖 26 个有候选的品牌，共 64 个有效创意；重复数 0、方向超限数 0。已核对两份真实自动策划，验证 AI 修改者、授权主理人、原创意、实际脚本与素材需求及待审核状态。其余任务继续在 Core 队列处理。验收时 14 个候选缺少有效主理人授权、1 个被现有策划方向上限拦截、1 个任务等待处理，未把这些状态报告为成功。检索仍遵循当天一次认领，不因上线而再次搜索同一个品牌日。发布恢复 job-daua375g1s2s73c3lms0 成功恢复 50 个原零调用任务，没有创建新任务。


### 无产品目录不阻断（2026-09-30，已上线）

无 SKU 时，AI 应直接完成品牌通用脚本，不要求补目录后才能审阅、保存、下载或制作。已确认的品牌介绍与服务定位仍可使用；资料极少时采用品牌介绍、互动提问等方向，不凭品牌名推断餐厅、门店、制作工艺或产品。完整口播不可含待填产品/卖点占位符；未知优惠从正文移除，不能先宣传再加“待确认”。当前品牌名称优先于旧介绍中的异名。素材清单只要求该脚本实际需要的素材，产品目录为可选增强。历史草稿核查与新规则生成验收分别记录，不把新规则上线描述为历史全文已重写。

无 SKU 的选中脚本适配必须同时将产品元数据明确改为“品牌内容”，禁止保存时沿用参考模板产品。AI 产物校验要求该字段，保持产物与最终保存内容一致。

## 品牌自动驾驶（2026-10-01，配置与 Agent 能力已上线，全链路生产验收进行中）

系统设置提供品牌级自动驾驶开关，默认开启。未配置品牌由应用默认政策初始化，以当前有效主理人/OWNER 为 User AI 的委托主体，使用品牌可用账号（优先 Instagram，其次 Facebook、小红书、Google Business），默认每日1份；主理人可关闭、调整账号及每日数量（1–3）。已有明确关闭的设置不得覆盖，初始化审计标记 SYSTEM 默认政策，不伪称人工点击授权。开启是对品牌调查、策划、每日创意适配与图文发布内容生成的持续授权，取消这些步骤之间的重复人工批准；正式发布仍必须人工确认，不自动排期或调用发布服务。沿用中央模型与已有额度，不购买余额。视频付费渲染继续使用既有制作入口，本期开关自动生成图文内容。

自动驾驶的决策与执行由 AMCMM User AI Assistant Agent 承担：读取 Skill、选择并调用能力、使用 IAIC Core 持久任务和 external_result 等待、核对草稿回执。应用后台仅初始化默认配置、每天唤醒原 User AI 任务并投影状态，不用固定步骤流水线冒充 Agent。服务端持久保存授权主体、配置版本和每日业务执行回执；关闭立即阻止后续步骤，已提交外部任务只核对原结果。每一步重验主理人身份、品牌和能力权限；品牌时区每日有界执行，多副本不能重复生成。Google 仅读取精确绑定门店的授权资料，菜单按来源去重、评价与商品事实分开；调研复用 Growth 网络调研和来源快照，缺失资料明确记录，不伪造 SKU 或隐性绑定商家。调研默认七天内复用，User AI 根据已有策划与当前调研决定本次策划内容。每天创意检索仍只认领一次，保留6–18目标及方向上限。

自动生成引用已保存 AI 创意的固定版本，保留原创意、品牌、授权主理人、模型产物和素材来源。图文使用当前品牌匹配素材；缺少必要素材时等待补充，不用无关图片冒充。每个原脚本最多自动生成一次；每日最多配置数量。发布草稿状态仍为 draft，不伪造人工审核。外部生成结果未知停止重提，展示需要核对；并发、关页、关闭开关和权限撤销不能触发重复收费。设置显示步骤、结果和需处理原因，无配置的既有品牌同样按默认政策开启；缺少有效主理人或账号时保持待配置，不执行生成。

自动驾驶本地验证：真实 PostgreSQL + IAIC Runtime（测试模型）验证 Agent 能力决策、资料结果等待与重启恢复、策划/脚本版本/素材追溯、并发幂等、每日数量上限、未知生成结果不重提、默认开启及显式关闭保留、权限隔离；手机/桌面设置验证通过。外部生成提供方在该测试中使用替身，此证据不等于真实模型及全链路生产成功。

上线核验：Kanban `1adf2125`、AMC-MM `1fe7dd48` 已部署。19 个具有有效主理人和目标账号的品牌已初始化为默认开启，每日任务全部绑定到对应 User AI。用户明确关闭的配置保持关闭。默认开关、权限、并发幂等、数量限制与手机/桌面设置已通过验证；测试使用替身模型及生成服务，尚不能据此宣称真实模型已完成端到端内容生成。

部署恢复：首次生产观察到旧执行器两次中断新版本任务，首次恢复回执被第二次恢复复用。仅对当前代码版本、没有模型请求/能力调用且费用已结算的任务，使用 `scripts/reconcile-autopilot-deploy-interruptions.mts --apply` 调用 Core 公共 `tasks.resume`；以中断事件序号区分恢复回执，继续原任务，不修改 Core 表、不新建生成请求。每次部署后使用 `scripts/audit-autopilot-production.mts` 核查状态；已有模型或外部调用的中断必须单独核对，不能用该脚本盲目恢复。

2026-10-01 01:59 SGT 生产回读：19 个原自动驾驶任务全部恢复，未创建新任务；17 个排队、1 个执行中、1 个等待调研外部结果。User AI 绑定19个，自动生成草稿0、自动发布0。此为恢复和开始执行的证据，端到端生成完成仍待后续真实结果验收。

## User AI / API Key 同权契约（2026-10-01，实施与验收中）

用户自己的 AI 助手使用 UserApiKey，代表 Key 所属用户调用其全部已授权业务能力。UI、REST、MCP、内置 User AI 与外部助手共享当前用户角色、品牌范围、领域规则及结果，不因 api_key 来源降权、另设 Agent 白名单或注册要求，也不获得额外权限。Cookie、Bearer 和 x-api-key 是认证方式而非业务权限。显式凭证无效时不得回退另一有效 Cookie；停用用户、Key 撤销/过期和角色/品牌撤权必须对下一次动作生效。内部 Content 服务 Token 不能代替用户授权；下游身份票据保留来源及 credentialId 并重新校验撤销状态。

代理只向固定主系统转发用户凭证；不转发客户端提供的内部角色或用户身份头。模型凭证与用户访问 Key 分离，不向模型、浏览器或日志输出密钥。业务确认规则在各入口一致：自动驾驶生成草稿，正式发布由用户明确确认；外部助手可以表达该确认，但不能从开启自动驾驶推断发布授权。

验收以相同用户/输入经 UI 会话和 API 调用的结果为准，覆盖创意、知识、素材、视频制作、草稿编辑、通知、审核和排期，以及普通用户/管理员、Key 撤销/过期、用户停用、实时撤权、跨品牌隔离、无效 Key + 有效 Cookie、重复写入与未知结果。能力测试、生产验证和完整 Framework 验收分别记录，不能以代理修复或 HTTP 200 代表完整验收通过。
