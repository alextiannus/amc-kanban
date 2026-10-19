# 品牌创意修改与版本追溯

创意详情定位（2026-10-19，本地实现与定向回归通过，未发布）：品牌 ID 与创意 ID 是详情读取及页面深链的身份；不要求入口提供月份，不从发布日期猜测归属。后端在品牌授权后解析当前记录的内部存储月份并返回；编辑、SKU、排期与修订回读自动沿用该位置，继续验证摘要、权限和幂等回执。月份仍用于列表筛选、计划目标和发布安排，不作为打开详情的先决条件。同一品牌有重复创意 ID 时明确拒绝定位；缺失或撤权不能跨品牌查找。历史带月份的链接继续兼容。


## MM 创意浏览（2026-10-19，当前交互与选择契约）

看板提示和消息收件夹「品牌创意」共用同一个全屏创意浏览、来源与选择状态；通知按每次 Dashboard 打开汇总提示一次，不按创意轮播或重复弹出。打开收件夹条目定位对应创意。看板提示「品牌创意」打开全屏创意浏览，视频模式查看 Content 原视频，脚本模式仅展示原脚本爆款元素与品牌相似推荐原因，不改写脚本。候选使用 Content 真实 matchScore 严格大于 75 的已持久化来源；排序分不冒充百分比。喜欢前不加入内容日历；喜欢保存无日期、未改写创意，不创建 AI 改写任务、发布草稿或视频。不喜欢永久排除该品牌的此来源，保留来源与选择记录；稍后决定仍可再次浏览。

内容日历已选创意与创意浏览共用以视频为中心的预览，支持视频/原脚本/已有品牌脚本、爆款元素和推荐理由；普通查看不展示内部编号、来源版本、摘要、技术状态或触发改写。只有点击「复刻」才进入现有制作工作流：已有品牌脚本直接进入制作；未改写创意先创建 User Assistant 脚本任务，结果由用户 Review 和采用后继续制作。日历内可以再次选择「不喜欢」，通过当前创意版本校验保存品牌内隐藏记录，并排除同来源推荐；保留来源、选择历史、脚本及已有制作/发布内容，不自动取消已安排发布。仅对同源关联、未改动标题占位文案、无素材且未排期/未发布的待制作占位记录软归档，保留原记录，避免在日历中残留。完整拍摄说明、参考视频、上传和素材库选择沿用现有制作/采集入口，不新增按创意归集缺失镜头的要求。旧日历创意通过选择契约版本退回创意浏览，必须由用户重新喜欢才能回到日历；只改变创意层展示，不删除、取消或改写实际制作、排期、发布及历史记录。历史缺少来源/分数时如实显示不可用，不伪造证据。后台不得自动重新纳入旧创意；新来源匹配分达到 90 的自动纳入与改写流程保留。喜欢标记由服务端写入，客户端普通编辑不能伪造或清除。所有选择按品牌持久化，喜欢和复刻分别幂等；源版本变化、撤权或任务结果不明不得伪报成功。

接口（本次扩展，验证与发布证据另行记录）：`GET /api/brands/:id/ai/brainstorm` 读取当前候选；同路径 POST 接受 refresh、decide、decideSaved、replicate、dismiss（creativeId 与 expectedRevision；已移出的同请求幂等重放）。decide 接受 sourceId、固定 sourceDigest、decision（like/dislike/defer）、expectedVersion 及可选持久化 poolIdeaId；decideSaved 接受 creativeId、固定 expectedRevision 和 decision，旧创意喜欢复用原记录，不生成新脚本；品牌内行锁串行，重复选择返回原回执，过时选择返回 409。喜欢直接追加未改写的工作区创意并审计，不伪造 AI 任务或脚本修订；首个人工/AI 审阅保存继续沿用既有基线与修订链。原视频使用品牌授权的 `/ai/brainstorm/:sourceId/media`，固定来源版本后复用现有精确域名、公网 DNS、类型与流量上限策略。复刻使用既有 creative 任务，幂等键绑定用户、品牌、创意与当前版本；候选不自动采用。

Content 匹配新增可选 `minimumMatchScore`，在候选截取之前严格筛选大于阈值；创意浏览传 75，旧调用不传时默认匹配行为及匹配请求 ID 保持不变。UI 显示原始匹配分而非百分比。验证包括服务/路由替身、原视频流代理、四种屏幕下真实组件浏览及播放、选择持久化和结果不明重试、日历复刻到待 Review 候选、三个服务的当前源码类型检查；未验证生产登录后的真实来源、AI 模型改写或付费制作。

## 当前交付状态（2026-10-17）

Task 11A 可信反馈入口（本地已实现并完成 PGlite 定向验证、未发布）：`video_feedback_event@1` 的不可变 core 固定 schema、eventId、occurredAt、projectId、brandId、creativeId、creativeRevisionId、actorId 和 Task 7 `evidence`，`coreDigest` 是与传输令牌无关的稳定 SHA-256。每次 HTTP 交付必须用当前内部服务令牌提供新的 `deliveredAt`、随机 nonce 和 HMAC-SHA-256；规范字符串为 `video_feedback_delivery@1\nPOST\n/api/internal/content/video-feedback\neventId\ncoreDigest\ndeliveredAt\nnonce`，对应 `x-amc-video-feedback-delivered-at` / `-nonce` / `-signature` 头。令牌在读取正文前鉴权，正文后复验精确 method/path、五分钟交付时间窗口、nonce 和签名；五分钟只约束交付，不约束证据发生时间。积压的旧 core 可用当前令牌重新签名后首次入库，相同 eventId + coreDigest 可在当前保留期内使用新交付包幂等重放；旧令牌和旧的正文内签名合同均关闭失败，同 eventId 不同 coreDigest 为 409 冲突。每次交付都重新确认 ACTIVE 操作者、当前品牌写权限和项目追溯身份；projectId 只认可持久化 plan、`_mmVideoJob` 与签名视频回执中完全一致的 Content 项目固定值，不接受 VideoProductionJob.id 别名，任何缺失或不一致均关闭失败。证据使用专属 `VIDEO_EDIT_FEEDBACK` 事件和唯一/窗口索引，不创建品牌创意修订，不进入人工修订、采用或弃用计数；反馈聚合只投影有界结构化证据，不返回项目/修订/操作者身份、备注、提示词、脚本正文或来源私有数据。公开品牌修订接口对 `videoFeedback`、事件 envelope/digest/signature 及其他未知证据键在任何修订写入前返回 400。

core 的 `identity` 是严格对象，且只含 projectId、brandId、creativeId、creativeRevisionId 和 actorId；这些字段不是 core 顶层别名。

终审修复：发现与人工 SKU 确认将可信来源投影为 canonical source（sourceRevision + sourceDigest；libraryDigest 兼容字段使用单条 sourceDigest，而非查询批次摘要）。采用与复制原样保留确认快照，视频读取实际已保存修订，不按当前最新来源补造历史。完整源证据的新适配不再误报 legacy；未知历史仍明确缺证据。

两端发布安排支持选择品牌当前可用账号；同平台有多个账号时不默认选择。提交时复验账号归属/连接，断连提示重新选择或先连接。取消安排经 schedule DELETE，带原 CAS/幂等键并读回 schedule:null；未知结果保留原请求重试，创意、历史与未排期草稿不删除。schedule GET 只返回有当前 content.schedule 权限的品牌可用账号最小字段，MM 仅放行精确 GET 路径，写入仍保留同源检查。

排期在候选选择与加锁读回后检查唯一 marker；两个 raw 身份即使另一个创意缺失仍拒绝，未关联的跨月同 ID 也不得推断归属。重排/取消保留原 agentNote 并追加权威 marker，不覆盖历史文本。

本文为 current-truth / fixed-reference。Task 1–11 的无日期内容创意、品牌授权来源/视频、二阶段 SKU、共享修订/反馈、固定视频追溯与可信反馈交付均已在隔离分支本地实现，尚未 push 或部署。Content 生产者已对当前 Kanban 消费者执行真实入库级跨仓 outbox 验证；这不是生产部署或线上 E2E。历史已上线记录仅证明当时范围，不覆盖本轮。

Task 12 发布前门禁（Node 20.20.2）已通过 `npm run typecheck`、`npm run test:creative-revisions`、`npm run test:ai-native`、`node --import tsx scripts/test-video-feedback-ingestion.mts` 及 `npm run build -- --webpack`。标准 Turbopack 构建在当前临时工作树因保留的 `node_modules` 符号链接指向工作树根外而终止；webpack 生产构建已完成，未将该环境限制冒充 Turbopack 通过。空白数据库执行全部 94 个历史 migration 时，在 `20260703000000_fix_user_fk_ondelete` 因前序链未创建 `Comment` 关系而失败；因此全新数据库迁移兼容性为`待确认`。本地事务测试数据库只使用 `prisma db push` 建立当前 schema，不构成 migration deploy 证据。部署前必须对获授权的生产数据库运行 `prisma migrate status`，核对待执行的 `20261017010000_video_edit_feedback`，禁止以 `db push` 替代生产迁移。

最终全分支 code review、跟随最新 `origin/main` 的重放、三类授权真实来源 E2E、推送和部署均未完成，仍是发布门禁。没有商户登录会话或授权真实来源时，来源 ID、确认 SKU、镜头 ID、文字哈希、语音/字幕/BGM 回执、返回目标和最终视频 ID 一律标记`待确认`，不得以 fixture、401 或跳转代替。

月度频率只产生创意目标：20 个目标匹配 8 条仍需 12 条，不创建日期占位、草稿或发布任务。awaiting_sku / sku_confirmed 使用真实来源身份和证据去重，不拿通用等待文案做脚本文本判重；adapted 继续原文本质量校验。后台续检只增加合格来源候选，不承诺夜间补足或排期。内容编辑、SKU 确认、候选采用、显式 schedule、付费重做、正式发布是不同权限/确认动作。

历史兼容与迁移见 [迁移运行手册](creative-workspace-migration.md)：默认纯 dry-run，显式 --apply 才执行品牌/草稿行锁、兼容投影与同事务审计。唯一同品牌精确 marker 可恢复 schedule.legacy=true，未知 scheduledBy / scheduledAtRevisionId 为 null；客户端不能写 legacy，新显式排期必须有真实操作者与固定版本。缺 marker、跨品牌或歧义保持 needs_confirmation；不补造来源、SKU、原因或作者。真实 PostgreSQL 已验证双连接 apply 仅一次、重复稳定、审计失败回滚、旧关联取消与重排。

视频制作固定 creativeRevisionId、来源版本/摘要、SKU 决策、原镜头映射、实际脚本及素材；继续编辑/素材库重开不更换为最新来源。免费文字保存、AI 可编辑候选和明确付费重做独立。没有 basicVideoProjectId 的历史项目禁用重做与独立文字保存，仍可查看旧成片；不足证据明确待确认。Content 回执验签、固定版本与修改历史已本地实现，不再是未实现的未来关联。

## Task 8 运营工作台（本地已实现，未发布）

Task 8 审查修复（本地实现，未部署）：指定 revisionId 的读取仅核对单条回执，随后独立读取历史首页。历史缓存按已读取区间合并；只有重叠或连续区间才沿用较老游标，不连续时先按新首页游标补齐缺口，再进入缓存的旧页。多次刷新形成的多个缺口逐一补齐，分页失败保留缓存与原游标，所有展示按版本降序去重（round 2 已实现、本地验证）。排期能力由服务端按品牌 WRITE 范围与 content.schedule 独立返回，不依赖脚本保管人或 draft.update。列表版本数由数据库按 period 聚合，批量只返回各创意最新修订与准确计数，禁止轮询传输全历史。长 SKU 在 390px 下断行；跨仓契约核验缺少真实 MM 路径会阻断门禁，默认 UI suite 读取真实兄弟 MM 仓库。

实际挂载入口为 `BrandProfileView` 内的内容创意区域，不是 `src/app/planning/page.tsx`。状态驱动卡片展示平台、来源身份、已选 SKU、素材准备情况、修订数量及已有排期入口；无日期创意不显示日期或排期空档，不承诺夜间补齐。编辑器保持 Kanban 唯一状态所有权，使用当前权限、CAS、幂等及回读核验。反馈汇总仅显示服务端计数，不暴露原始说明；版本内经授权的反馈说明仍可追溯。支持桌面及 390px、键盘焦点和减少动态效果。

## 反馈统计（Task 6 本地已实现，未发布）

审查修复 round 1（本地已实现，未发布）：采用与放弃均在同一品牌锁内互查，不允许同一 task/artifact 同时成为已采用和已放弃；所有采用入口复用修订服务检查。放弃回执只接受原请求键重放，新键命中同一候选明确 409，不把未绑定的新键视为已保存。人工候选差异以 CAS 固定的同一原稿为基础，把候选 patch 和实际最终保存内容分别按保存规则投影后比较；缺少且未改变的字段不计编辑，恢复与清空仍计编辑。

原因固定为 `sku_mismatch`、`selling_point`、`transitions`、`visual_description`、`voiceover`、`subtitle`、`platform_style`、`material_feasibility`、`brand_facts`、`other`。历史 `sku` 在读取时映射 `sku_mismatch`，原 revision 不改写；旧客户端 sku 写入继续兼容，以保持既有幂等载荷。结构化差异记录实际字段变化，不从文本猜测原因；旧日历字段投影到 workspace 后比较，迁移本身不算编辑。

`GET /api/brands/:brandId/content-creatives/feedback?cursor=...` 每次重验品牌 READ 权限，按 createdAt/id 倒序返回最多 2000 条修订/放弃/忠实度评审事件的计数和 nextCursor（游标为不透明分页位置）。审核和修改按窗口内唯一 month/creativeId 计数；直接采用是明确未改动的人工保存，或与可信 AI 候选规范化字段一致的采用。AI 采用的当前版本差异仍保留，人工候选改动单独记录；缺少旧差异/候选证据不推断直接采用。审核、直接采用、修改是窗口内可重叠集合，不能把多页 distinct 计数相加当全历史去重数。SKU 确认算人工审核/修改；自动生成、自动排期、系统修订及独立忠实度评审不算人工审核。字段与原因计数按事件去重；无原因的修改只计字段。

Task 7 统计扩展（本地已实现与定向验证，未发布）：`editDistanceByField` 只读取严格校验的 `input.videoFeedback.textChanges` 中实际 before/after 字符串，不解析 planning；每字段给出 total、comparisons、excludedPairs。文本字段为 spokenText、overlayText、visualDescription、subjectAction、soundDesign、transition、narrativePurpose；每事件至多七项且不重复，每字符串最多 512 个 Unicode 码点，窗口动态规划预算最多 4000000 个单元，超限证据不截断计分。`bySourceShot` 使用明确 sourceShotId 或摘要绑定的 V2 qualityReview 镜头，沿用 50 键上限，只有明确镜头编辑证据才计该镜头 editedScripts。`captionMismatchBlocks` 仅计明确 true 的阻断事件。voiceReplacementRate/musicReplacementRate 分母为严格校验的 beforeId/afterId 对（允许 null），分子仅为两个非空且不同的 ID；新增/移除不算替换。fidelityPassRate 按同一任务和产物引用去重已完成评审 attempt，必须 classification.candidateDigest 与 artifact.digest 一致；失败候选也入分母，缺证据及待评审不入分母，空分母 rate=null。各页指标仅代表当前事件窗口，不得跨页相加当完整去重总数。

`videoFeedback` 是服务端保存的显式证据契约，允许 sourceShotId、textChanges、captionMismatchBlocked、voiceReceiptChange、musicReceiptChange；拒绝未知键、超限与重复字段，不从主观原因推断任何变化。当前公共修订写接口不接受客户端提交此结构；可信内部入口已接通并只接受固定项目/创意修订/操作者身份的签名事件，生产者实际调用与端到端发布仍待后续任务验证。未写入的证据保持未知。聚合仅返回计数，不返回文本、媒体 ID 或问题原文。数据库只投影受限证据；来源脚本、说明及 AI 指令仍不得加载。

证据总字节预算为统一的 `VIDEO_FEEDBACK_MAX_BYTES=32768`。reader 要求完整紧凑 JSON 的 UTF-8 字节数加 256 字节 JSONB 格式余量不超过预算；该严格结构最多七个文本字段，256 字节覆盖 JSONB 增加的分隔空格。SQL 投影使用同一个常量为上限，合法证据不会因控制字符转义或格式开销丢失；超预算整个 videoFeedback 无效，不保留其中字幕/音频计数。

既有文案反馈服务复用同一 Unicode 编辑距离实现，单次最大 20000 码点与 4000000 计算单元；超限返回未知 diffRatio=null，不新增或自动批准训练样本，不将未知当作全文重写。

来源/SKU/平台/内容类型使用保存时固定上下文，各维度最多 49 个按字典序选择的真实键与 `other`；缺失、非法或剩余键归入 other。同一事件落入多个 SKU/平台时每桶只计一次；other 也按脚本/候选去重。聚合不返回说明、脚本、AI 指令或原始 revision；数据库只投影统计所需 JSON 字段。

`POST /api/brands/:brandId/content-creatives/feedback` 接收 `action:discard_candidate`、`month`、`creativeId`、`taskId`、`artifactDigest`、`expectedRevision`、`idempotencyKey` 与可选 feedback。服务端核对当前用户的成功 AI 任务、创意/月、候选绑定版本及固定产物，再在品牌锁内重验内容编辑权限和 CAS。独立 `CREATIVE_CANDIDATE_FEEDBACK` 事件及审计记录放弃，不新增 CREATIVE_ITEM 修订、不改当前脚本/source/SKU/schedule、不调用制作或发布。原请求键和规范化载荷匹配时返回原事件回执；同键异载荷或同候选换新键均 409，不改写旧事件。已采用的候选拒绝放弃，已放弃的候选不能再次采用。MM 已本地接入；Kanban（Task 8）已本地接入并验证，尚未发布。

部署需执行 `20261016060000_creative_feedback_window` 索引迁移；brandId/kind/createdAt/id 索引分别读取至多 2001 个修订、放弃和忠实度评审事件，再合并取窗口。此任务不回填或重写历史数据。

## SKU 二阶段适配（Task 5，本地已实现，未发布）

任务历史使用固定产物与上下文快照展示，并标注 was_current / stale；当前品牌权限、Core 任务归属与调用可见性仍逐次检查。采用重试先查权威回执，匹配任务及规范化请求时返回原回执；不同载荷冲突，只有新采用才进入当前来源/决策/版本验证。省略 kind 按 creative 严格解析，adaptToBrand 只接受布尔值；任何旧一阶段 true 请求都在 dispatch 前拒绝。自动驾驶的持久任务目标也须明确等待人工 SKU 决策，包括空目录普通品牌内容，不得以自动驾驶授权替代确认。

来源候选先进入待确认创意。`sku_proposal` 仅建议 2–4 个当前品牌真实 SKU，目录仅一项时允许一项；每项包含精确名称、角色、理由与来源镜头 ID，不包含最终脚本。人工可调整并经 `POST .../sku-decision?month=YYYY-MM` 确认；服务端校验目录摘要、SKU 身份、固定来源版本/摘要、镜头 ID、当前创意版本、内容编辑权限和保管人，使用既有品牌行锁、CAS、幂等修订和审计保存。

`creative_adaptation` 必须携带已确认决策摘要，逐镜按原顺序覆盖固定来源并生成素材清单，只可使用人工选中的 SKU，且每镜 SKU 与确认映射完全一致。新产物采用下述 V2 契约；历史产物保留只读，不按新形状推断旧证据。目录为空时明确输出普通品牌内容（非爆款复刻）；来源不完整时拒绝伪装来源复刻。新 discovery 只保存来源候选，不再将自动选品稿视为已确认适配。MM 确认界面已本地实现；Kanban 确认界面（Task 8）已本地实现，未发布；本任务不制作视频或发布。

### SKU 适配 V2 目标契约（未发布）

Task 6 修复轮次 1（本地已实现与定向验证，未发布）：修复窗口只接受原评审产物 revision 作为 expectedRevision 的一次成功写入；应用层守卫复用 Core workspace 原写入能力，返回写入回执前追加冻结的第二份产物与修复计数。第二次 finish 前及重启后均拒绝第三份写入，结构非法的已写入修复稿直接 needs_revision 并保留原文。若 workspace 已成功提交但评审元数据确认中断，策略检查和执行守卫使用第一份新 immutable revision 恢复并冻结，不能通过改写新 head 绕过。沿用 Core never-replay 写入契约与原回执重放，不将相同内容的新 revision 当作幂等重放；历史成功写入的重验仅读取确切引用，不再执行写入。

来源忠实度门槛（Task 6 本地已实现与定向验证，未发布）：先执行 V2 不可变来源与确认 SKU 校验，再以固定 hook、narrative_order、selling_point_position、continuity、cta、diversity 六维度进行确定性检查和结构化模型分类。模型通过受限 amc.creative_fidelity 能力只提交候选摘要、六维度状态及问题，不能修改可信绑定或保存内容；未知维度、缺失／重复维度、额外字段及非法状态均拒绝，适用维度不得以 not_applicable 跳过。质量评审沿用当前 Core task、统一模型配置与实际用量账本，没有独立代理或新供应商。qualityReview 为服务端持久证据，保留两次候选快照、产物引用、维度结果及问题，追加在独立 CREATIVE_FIDELITY_REVIEW 的 input，并在通过后的正式修订 input.ai.qualityReview 留存。首次失败在同一 Core task 内 repair_once，最多一份新候选；第二次失败或修复稿结构非法 needs_revision，MM 读取该状态与问题，不能作为 adapted 采用。任务 API 同时返回 status=needs_revision 与 runtimeStatus=succeeded，区分评估完成和适配通过；candidate.qualityReview 与顶层 qualityReview 相同。通过后的采用仍复核品牌、用户、当前创意版本、来源与 SKU 决策。重启或同一产物引用的重复完成不增加修复次数；新的 workspace revision 即使字节相同也占用修复次数，改变 digest 不能绕过上限。

状态：本地已实现与定向验证，待发布；完整 PostgreSQL 修订套件待专用测试库验证。新 `AdaptedCreativeShotV2` 保存 `contractVersion: 2`、`sourceShotId`、`skuIds`、`visualDescription`、`subjectAction`、`spokenText`、`captionMode`、`overlayText`、`soundDesign`、`transition`、`narrativePurpose`、`continuityRequirements` 及 `sourcePreservation`。`spokenText` 是 TTS 与逐字字幕的唯一文本；`mirror_spoken` 从它派生字幕，`off` 不显示逐字字幕；`overlayText` 只作画面文字。纯视觉空口播必须关闭字幕，不能将生成失败视作静音选择。新写入拒绝旧 `voiceover/onScreenText/sound` 和独立字幕正文；读取固定来源时兼容原字段，不批量改写历史。来源接口可选投影 `continuityRequirements`；历史缺字段不影响原 full_source 判定，明确提供但格式错误则为 partial_source，禁止丢弃后声称完整。

`sourcePreservation` 记录 hookRole（preserved/adapted/not_applicable）、narrativeRole/pacingRole（preserved/adapted）与 `changeReasons`。改编状态须有可审核原因。允许的有限原因与显示标签为：`voiceover_removed_for_visual_storytelling`（视觉叙事：明确不使用口播）、`overlay_removed_for_visual_storytelling`（视觉叙事：明确不使用画面文字）、`sound_removed_for_visual_storytelling`（视觉叙事：明确不使用来源声音）、`transition_removed_for_visual_storytelling`（视觉叙事：明确不使用来源转场）、`brand_facts`（依据已确认品牌资料调整）、`material_feasibility`（依据素材可行性调整）、`platform_style`（依据目标平台风格调整）。删除非空源旁白、画面文字、声音或转场只能由该字段专用的原因解释，通用原因不能放行清空；非空叙事与连贯性不可丢失。全部保留状态、原因代码及标签进入保存的脚本文本，可由现有审核界面展示。

来源数量、顺序、唯一 ID、确认 SKU 映射与实际名称使用继续由 `adaptationFrom(...)` 服务端验证；每个选中 SKU 的实际名称必须出现在分配给它的镜头内容，不能仅放在标题或素材清单。来源时间/景别/镜头运动由固定快照派生，不允许产物覆盖。产物示例按全部原镜头和确认映射生成，并在存在源字段时提供非空口播、画面文字、声音、转场、叙事作用和连贯性，不使用全空默认示例。

保存输入为 `expectedRevision`、`idempotencyKey`、`catalogDigest`、`sourceRevision`、`sourceDigest`、`selectedSkuIds`、逐项 `recommendations`（含 skuId/skuName/roles/rationale/sourceShotIds）、可选 `adjustmentNote`；月份来自 URL。人工可选择 1–4 项，推荐必须为 2–4 项（单项目录例外）。GET 返回当前目录、固定来源、版本绑定、已保存决策及 canConfirm。无权限返回 403/404，版本/目录/来源/决策冲突为 409，非法映射为 400，来源上游错误沿用 413/503；响应均 no-store。确认沿用 draft.update 和保管人规则；AI 任务仍沿用现有 User AI 准入权限，并额外要求当前创意可覆盖。

新来源候选保存 `adaptationStatus=awaiting_sku`，人工确认后为 `sku_confirmed`，完整脚本采用后为 `adapted`。前两种状态不能创建发布草稿；adapted 仍须有正文与素材清单。取消已有排期保持可用。旧一阶段 AI 适配入口返回明确 409，引导至新流程；历史任务产物仍可读取，不能新采用为已确认适配。SKU 任务无制作或发布工具。

## 当前额度与收费品牌 CLI 验收（2026-10-11）

用户已授权全部品牌不限制额度，只记录实际消耗。本轮额度调整已于2026-10-11发布（Kanban a60bd365，MM f0b1b21），12个收费品牌实际账号的生产接口均已核对通过：人工、每日自动任务及自动驾驶均取消品牌/账号日额度与任务总额度拦截；AMC Credit 同样仅计量，旧套餐基准不作为准入条件。保留原始供应商用量、平台消耗、预留及结算证据；内部按可信调用发放计量预留，属于系统政策，不购买余额、不作为用户剩余额度展示。未知用量仍先核对，不按零结算或重复请求。每次调用的技术预留、40轮/48工具调用及超时、连续3次非法工具参数停止等执行边界保留；质量标准与每轮匹配批次边界保留。

历史验收（2026-10-11，非本轮上线证据）：12 个收费品牌用实际品牌主或主理人账号的正式 API Key 核对旧版策划、匹配、来源、人工修改、AI 候选采用和两端回读。160c4044、6e876772、3823ffee 的工具参数、JSON 正文、用量保留及 SKU 校验修复已部署；不修补非法工具参数，不把格式失败当未知外部结果。东北人、宽窄主品牌、Funan、天天湘上、Z Wash、蒸食尚、28℃、宴来居、百能共 9 个品牌通过完整编辑采用与两端回读；Stellaris 通过零合格匹配及不足提示分支。滋味烤鱼、坡晓馒因供应商用量回执缺失暂停，不计为完整通过，不新建任务绕过核对。未发布社交内容或制作付费视频。旧版自动选品与日期槽位行为已被本地二阶段 SKU／无日期内容创意契约取代；这些历史结果不证明新流程、真实夜间运行或本轮部署。当前缺口是待匹配创意数量，旧任务仅在用量结清、版本已更新且用户显式重试时允许一次可追溯恢复；未知用量不按零结算。

AI 改写素材需求应保存到 patch.materialRequirements。对既有产物顶层同名字段进行严格校验后投影到缺失的 patch 字段，保留原始产物及摘要不变；已有 patch 值优先。新改写要求非空素材需求，普通改写与品牌适配一致。本项已实现、通过本地回归并发布。


历史状态（2026-09-30 旧版）：人工修改保存与追溯已部署，本地与生产隔离回滚验证通过。此记录不证明本轮内容创意、两阶段 SKU 或视频谱系已部署；本轮仍为本地实现与验证，不包含 Core 接入或自动发布。

复用 BrandMarketingSolution，kind=CREATIVE_ITEM，以品牌、月份和卡片 ID 的摘要为 period。版本0保留首次编辑时的策划原稿，作者未知标记 legacy_unknown；版本1起保存真实会话操作者、角色快照、当时有效 Crew PRINCIPAL 关系、父版本、原始来源 ID/已知内容快照及摘要。来源仅有策划摘录时明确 plan_snapshot，不能冒充 Content 原文或原创意准确发行版本。已有版本只读保留。

Task 4 本地来源接口（未发布）：`GET /api/brands/:brandId/content-creatives/:creativeId/source`（month 可选） 通过既有修订读取服务校验品牌 READ 权限，再用服务凭据读取 Content 完整来源。真实来源 ID 冲突或无法解析返回 404；固定 sourceRevision/sourceDigest 不符返回 409；Content 服务失败返回 503。新候选在匹配时保存完整来源的 revision/digest，历史 nativeSourceSnapshot.libraryDigest 仍是批次摘要，不用于单条摘要比较。无时间线为 source_unavailable；缺字段或历史未固定版本为 partial_source；全部字段和固定版本均完整才为 full_source。保留全部镜头，不生成占位。

商户仅接收允许的文本/镜头字段及无 query、fragment、用户凭据、管理/内部路径的公开 HTTPS 链接；不返回原始管理元数据、Content libraryDetailPath 或管理链接。受控/OBS/签名视频返回 `/api/brands/:brandId/content-creatives/:creativeId/source/media?month=YYYY-MM`，代理每次重验品牌访问与固定来源，再校验精确主机白名单和公网 IPv4 DNS；连接固定解析出的地址，拒绝重定向及非视频内容。不转发浏览器 Cookie/Authorization，不回传上游签名、Location、Set-Cookie。代理默认最多 64 MiB、配置 `AMC_SOURCE_MEDIA_MAX_BYTES`，提前拒绝声明超限，chunked 超限中止传输。允许主机来自 `AMC_SOURCE_MEDIA_ALLOWED_HOSTS`（逗号分隔精确媒体主机）及已有 OBS 公开主机配置，无通配主机；IPv6-only 源暂不支持。internalDetailPath 固定为编码后的 `/dashboard?brandId=...&sub=ai_workspace&creativeId=...&panel=source`，MM 来源面板按品牌与创意身份读取；Kanban 在当前运营编辑器直接展示同一来源证据。

Content 在完整序列化后按 UTF-8 字节检查 `AMC_SOURCE_EVIDENCE_MAX_BYTES`（默认 8 MiB，上限配置不超过 64 MiB），等于限额允许；超限为 413/library_evidence_too_large。Kanban S2S 同时检查 Content-Length 与逐块累计的真实字节，伪造/缺失长度不绕过限制；超限取消读取，来源接口保留明确 413 错误。时间线从不为满足限额而截断。

Task 4 审查轮次 2：媒体主机策略与 Huawei OBS 共用 endpoint 规范化，endpoint 已含 bucket 前缀时不重复添加。精确收录私有签名的 bucket+endpoint 主机，并另外收录配置的 PUBLIC_BASE_URL/CDN 主机；CDN 不替代私有签名主机。仅允许 HTTPS 默认端口，主机统一小写；尾点、用户凭据、非默认端口和通配主机配置不得扩大白名单。

`GET /api/brands/:id/content-creatives/:creativeId/revisions` 按品牌与创意 ID 读取，后端返回内部存储月份，旧 GET 的 month 参数不参与定位；`revisionId` 和 `beforeVersion` 继续用于历史回读与分页。`POST .../revisions?month=YYYY-MM` 接收编辑器从读取结果自动取得的内部位置用于保存。保存接收 expectedRevision（当前卡片摘要）、idempotencyKey、白名单 patch。脚本保存与既有 AI 修改采用按 draft.update 校验角色权限，不要求 brand.update；canSaveAsNew / canOverwrite 使用同一内容编辑权限和品牌访问范围，覆盖还须符合保管人限制。保存事务锁定品牌知识记录并复核当前权限，追加版本和审计、更新唯一卡片。幂等键绑定品牌、卡片、月份、实际用户和载荷；同键异内容409；并发旧版本409。响应与后续 GET 指定 revisionId 回读相互核对。

保存不修改现有 ContentDraft、排期、发布或付费视频。制作由独立交接固定修订与 Content 签名回执，显式排期由专用 schedule/unschedule 接口完成；不能从保存推导下游更新。原整月接口不允许覆盖或删除已有追溯的卡片；改用逐条版本入口。新月份通过统一策划匹配请求创建待审核创意；包含已追溯创意的整月生成与覆盖入口统一拒绝，防止丢失人工修改。历史作者不猜测，首次快照不声称是原创作者投稿。

当前目标：两端编辑器展示来源对比、原视频、SKU 推荐与人工确认、当前脚本、素材需求、AI 候选审阅、修订时间线和显式排期。MM 已本地实现；Kanban（Task 8）已本地实现，未发布。覆盖保存仍追加后台审计修订；另存新脚本保留原稿、继承标签、绑定当前用户保管。既有另存能力已部署；本次来源／SKU／修订界面未发布；2026-10-13 的内容编辑权限修复已随 Kanban 03eead30 / MM 8ffa3dd 部署，生产隔离回滚验证通过。保存失败保留输入，冲突可显式重载；结果不明重试沿用同一请求键。原始来源链接按当前已有授权打开，不授予新权限。所有响应 no-store，当前品牌访问在每次读取和写入时重验。

验收：原始快照和二次修改链；品牌和用户隔离；真实用户身份；主理人变更不改历史；并发；幂等；事务审计失败回滚；来源字段不可伪造；旧整月写入拒绝；刷新与历史回读；手机桌面交互。


## 本地验证

真实 PostgreSQL 验证原始快照、父版本、来源保护、实际作者、主理人转移、跨品牌拒绝、重复请求、同键异载荷、并发一成功一409、撤权及审计故障完整回滚通过。API 鉴权/Origin/载荷限制/no-store/409、现有日历分页/脚本/匹配回归通过。MM 真实组件桌面1280与手机390宽度验证编辑、冲突输入保留、未知结果同键核对与历史展示通过。Kanban 与 MM TypeScript、webpack 生产构建通过。

已知基线问题：test-brand-plan-inspiration-link.mts 仍断言已替换的旧 Content 跳转代码，在未修改基线上同样失败；audit-route-auth --strict 的20个未识别旧路由在基线与本次完全相同，新版本接口被识别为已鉴权。没有将这些检查冒充全绿。

实现复用既有表和索引，无生产 Schema 迁移、历史批量回填或 Core 版本变化。版本存储在服务中只追加；按品牌知识行锁序列化版本分配。生产验证脚本只在事务内创建隔离样本，并强制整体回滚，不触发发布或通知。

## 生产交付证据（2026-09-30）

- Kanban `e02bbf653ae87995f018759fe245364bdc41534f`；Render SG `dep-dau5m9jbc2fs73c9enog` 为 live。
- AMCMM `56cee190c22de02c5218d423537ea1bf083e385f`；Render SG `dep-dau5o57f3r2c73fg8ur0` 为 live。
- 生产任务 `job-dau5o13ncjis73asbku0` succeeded，输出 ok:true、mode:rollback-only，代码版本匹配 Kanban。save/source/actor/principal/readback/idempotency/audit/no-downstream-writes/complete-rollback 全部通过。
- 正式域名 AMCMM 页面200；Kanban/MM 未登录新接口401；MM 跨来源写入403且 no-store。未登录401由既有鉴权层提前返回，未声称其具备新路由的 no-store 响应头。
- 浏览器编辑流程使用真实组件和模拟 API，本地真实 PostgreSQL 与生产回滚服务测试分别验证数据行为；未使用真实商户登录会话执行线上 UI 保存，不将这三层验证冒充线上商户端到端验收。

当前用户入口：内容创意 → 完整来源对比 → SKU 推荐与人工确认 → 适配候选审阅采用 → 覆盖保存／另存新脚本 → 显式排期或固定版本制作。Core 与持久 User AI 工作台既有能力见 [IAIC 实施与验收](amcmm-iaic-implementation.md)；本轮新界面、视频固定版本与迁移尚未部署，不能沿用旧版生产验收结论。

AI 辅助版本扩展：用户明确采用固定候选摘要后，复用同一原子版本服务，记录 taskId、agentId、requestedBy、artifact引用与品牌事实摘要；作者及当时主理人仍由服务端确定。采用时检查原创意版本和品牌事实，重复采用返回原回执并按revisionId回读。此扩展不触发发布或覆盖已有制作结果。


## 统一策划匹配与编辑（2026-10-11，已部署，收费品牌 CLI 验收及补充修复状态见文首）

当前增量契约见 [统一创意工作流](unified-creative-planning.md)。看板与 MM 共用逐条修订服务；两端使用来源对比、SKU 确认、候选审阅和修订时间线，字段差异及审核记录由同一服务维护。旧整月生成、重写和整月覆盖入口拒绝写入。已确定策划的匹配请求以 CREATIVE_MATCH_REQUEST 保存，初次即时认领，后续按品牌时区 01:00–05:59 补全；单任务最多三条，每日最多五批，消耗仅记录而不限制额度。未耗尽候选或达到批次执行边界时不冒充匹配不足；匹配不足使用用户确定的提示。服务异常和策划变更分别展示；新创意没有日期空档或过期空档语义。已有通用品牌创意池仍保留，常规每日检索改为夜间；策划请求为独立有界任务，不能将两者误写成只会检索一次。
