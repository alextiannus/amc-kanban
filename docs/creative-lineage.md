# 品牌创意修改与版本追溯

## SKU 二阶段适配（Task 5，本地已实现，未发布）

任务历史使用固定产物与上下文快照展示，并标注 was_current / stale；当前品牌权限、Core 任务归属与调用可见性仍逐次检查。采用重试先查权威回执，匹配任务及规范化请求时返回原回执；不同载荷冲突，只有新采用才进入当前来源/决策/版本验证。省略 kind 按 creative 严格解析，adaptToBrand 只接受布尔值；任何旧一阶段 true 请求都在 dispatch 前拒绝。自动驾驶的持久任务目标也须明确等待人工 SKU 决策，包括空目录普通品牌内容，不得以自动驾驶授权替代确认。

来源候选先进入待确认创意。`sku_proposal` 仅建议 2–4 个当前品牌真实 SKU，目录仅一项时允许一项；每项包含精确名称、角色、理由与来源镜头 ID，不包含最终脚本。人工可调整并经 `POST .../sku-decision?month=YYYY-MM` 确认；服务端校验目录摘要、SKU 身份、固定来源版本/摘要、镜头 ID、当前创意版本、内容编辑权限和保管人，使用既有品牌行锁、CAS、幂等修订和审计保存。

`creative_adaptation` 必须携带已确认决策摘要，逐镜覆盖固定来源并生成素材清单，只可使用人工选中的 SKU。目录为空时明确输出普通品牌内容（非爆款复刻）；来源不完整时拒绝伪装来源复刻。新 discovery 只保存来源候选，不再将自动选品稿视为已确认适配。商户确认界面属于 Task 7/8，当前未实现；本任务不制作视频或发布。

保存输入为 `expectedRevision`、`idempotencyKey`、`catalogDigest`、`sourceRevision`、`sourceDigest`、`selectedSkuIds`、逐项 `recommendations`（含 skuId/skuName/roles/rationale/sourceShotIds）、可选 `adjustmentNote`；月份来自 URL。人工可选择 1–4 项，推荐必须为 2–4 项（单项目录例外）。GET 返回当前目录、固定来源、版本绑定、已保存决策及 canConfirm。无权限返回 403/404，版本/目录/来源/决策冲突为 409，非法映射为 400，来源上游错误沿用 413/503；响应均 no-store。确认沿用 draft.update 和保管人规则；AI 任务仍沿用现有 User AI 准入权限，并额外要求当前创意可覆盖。

新来源候选保存 `adaptationStatus=awaiting_sku`，人工确认后为 `sku_confirmed`，完整脚本采用后为 `adapted`。前两种状态不能创建发布草稿；adapted 仍须有正文与素材清单。取消已有排期保持可用。旧一阶段 AI 适配入口返回明确 409，引导至新流程；历史任务产物仍可读取，不能新采用为已确认适配。SKU 任务无制作或发布工具。

## 当前额度与收费品牌 CLI 验收（2026-10-11）

用户已授权全部品牌不限制额度，只记录实际消耗。本轮额度调整已于2026-10-11发布（Kanban a60bd365，MM f0b1b21），12个收费品牌实际账号的生产接口均已核对通过：人工、每日自动任务及自动驾驶均取消品牌/账号日额度与任务总额度拦截；AMC Credit 同样仅计量，旧套餐基准不作为准入条件。保留原始供应商用量、平台消耗、预留及结算证据；内部按可信调用发放计量预留，属于系统政策，不购买余额、不作为用户剩余额度展示。未知用量仍先核对，不按零结算或重复请求。每次调用的技术预留、40轮/48工具调用及超时、连续3次非法工具参数停止等执行边界保留；质量标准与每轮匹配批次边界保留。

12个有效收费品牌使用实际品牌主或主理人账号的正式 API Key 验证策划、匹配、来源、人工修改、AI 审阅采用及两端回读，不发布社交内容或制作付费视频。稳定性修复160c4044与6e876772已部署；工具参数严格规范化，非法字符串不修补。全品牌实测另发现工作文档正文非法 JSON 会在写入前被拒绝却标记未知结果：本轮已发布修复在模型响应边界验证 JSON 文档正文，保留实测用量并使用三次格式错误上限，禁止把确定的格式失败当外部写入结果。既有失败保留证据，不直接修改 Core 状态。补充审查发现异常工具响应结构可能丢失已知用量；结构缺失或非数组同样应归类为携带供应商用量的格式错误，本补充项已随3823ffee发布。坡晓馒实测还发现套餐及其单品同时关联导致超过每脚本3个SKU，通用反馈没有指出具体错误。补充修复：Skill与产物契约明确1–3个独立SKU、套餐优先关联套餐自身、完整目录名可作为非口播产品标注；校验逐条明确数量/身份/名称问题，标准不放宽，已随3823ffee发布。同产品/方向上限及重复候选属于质量缺口，保留空档；系统失败单独显示。旧版本确定性模型失败或额度暂停仅在用量结清、实现版本已更新且用户显式重试时建立一次新任务，保留原任务证据。CLI 实测：东北人、宽窄主品牌、Funan、天天湘上、Z Wash、蒸食尚、28℃、宴来居、百能共9个品牌通过完整编辑采用与两端回读；Stellaris零合格匹配，3个空档和指定不足提示验证通过；滋味烤鱼、坡晓馒因供应商调用用量回执缺失暂停，未计入完整通过。两者需可信用量回执后通过正式核对流程恢复，不重复发起任务绕过。真实夜间补全尚未验收，隔离时钟补全回归通过。

AI 改写素材需求应保存到 patch.materialRequirements。对既有产物顶层同名字段进行严格校验后投影到缺失的 patch 字段，保留原始产物及摘要不变；已有 patch 值优先。新改写要求非空素材需求，普通改写与品牌适配一致。本项已实现、通过本地回归并发布。


状态：代码已实现并部署；本地验证和生产隔离回滚验证通过。范围为人工修改保存与追溯，不包含 Core 接入或自动发布。

复用 BrandMarketingSolution，kind=CREATIVE_ITEM，以品牌、月份和卡片 ID 的摘要为 period。版本0保留首次编辑时的策划原稿，作者未知标记 legacy_unknown；版本1起保存真实会话操作者、角色快照、当时有效 Crew PRINCIPAL 关系、父版本、原始来源 ID/已知内容快照及摘要。来源仅有策划摘录时明确 plan_snapshot，不能冒充 Content 原文或原创意准确发行版本。已有版本只读保留。

Task 4 本地来源接口（未发布）：`GET /api/brands/:brandId/content-creatives/:creativeId/source?month=YYYY-MM` 通过既有修订读取服务校验品牌 READ 权限，再用服务凭据读取 Content 完整来源。真实来源 ID 冲突或无法解析返回 404；固定 sourceRevision/sourceDigest 不符返回 409；Content 服务失败返回 503。新候选在匹配时保存完整来源的 revision/digest，历史 nativeSourceSnapshot.libraryDigest 仍是批次摘要，不用于单条摘要比较。无时间线为 source_unavailable；缺字段或历史未固定版本为 partial_source；全部字段和固定版本均完整才为 full_source。保留全部镜头，不生成占位。

商户仅接收允许的文本/镜头字段及无 query、fragment、用户凭据、管理/内部路径的公开 HTTPS 链接；不返回原始管理元数据、Content libraryDetailPath 或管理链接。受控/OBS/签名视频返回 `/api/brands/:brandId/content-creatives/:creativeId/source/media?month=YYYY-MM`，代理每次重验品牌访问与固定来源，再校验精确主机白名单和公网 IPv4 DNS；连接固定解析出的地址，拒绝重定向及非视频内容。不转发浏览器 Cookie/Authorization，不回传上游签名、Location、Set-Cookie。代理默认最多 64 MiB、配置 `AMC_SOURCE_MEDIA_MAX_BYTES`，提前拒绝声明超限，chunked 超限中止传输。允许主机来自 `AMC_SOURCE_MEDIA_ALLOWED_HOSTS`（逗号分隔精确媒体主机）及已有 OBS 公开主机配置，无通配主机；IPv6-only 源暂不支持。internalDetailPath 固定为编码后的 `/dashboard?brandId=...&sub=ai_workspace&creativeId=...&panel=source`，对应来源在 Task 7 商户详情面板展示原脚本拆解与原视频；当前仅定义该深链契约，尚未接入 UI。

Content 在完整序列化后按 UTF-8 字节检查 `AMC_SOURCE_EVIDENCE_MAX_BYTES`（默认 8 MiB，上限配置不超过 64 MiB），等于限额允许；超限为 413/library_evidence_too_large。Kanban S2S 同时检查 Content-Length 与逐块累计的真实字节，伪造/缺失长度不绕过限制；超限取消读取，来源接口保留明确 413 错误。时间线从不为满足限额而截断。

Task 4 审查轮次 2：媒体主机策略与 Huawei OBS 共用 endpoint 规范化，endpoint 已含 bucket 前缀时不重复添加。精确收录私有签名的 bucket+endpoint 主机，并另外收录配置的 PUBLIC_BASE_URL/CDN 主机；CDN 不替代私有签名主机。仅允许 HTTPS 默认端口，主机统一小写；尾点、用户凭据、非默认端口和通配主机配置不得扩大白名单。

GET/POST /api/brands/:id/content-creatives/:creativeId/revisions?month=YYYY-MM 提供读取及保存。保存接收 expectedRevision（当前卡片摘要）、idempotencyKey、白名单 patch。脚本保存与既有 AI 修改采用按 draft.update 校验角色权限，不要求 brand.update；canSaveAsNew / canOverwrite 使用同一内容编辑权限和品牌访问范围，覆盖还须符合保管人限制。保存事务锁定品牌知识记录并复核当前权限，追加版本和审计、更新唯一卡片。幂等键绑定品牌、卡片、月份、实际用户和载荷；同键异内容409；并发旧版本409。响应与后续 GET 指定 revisionId 回读相互核对。

保存不修改现有 ContentDraft、排期、发布或付费视频。不需要跨服务 outbox；制作/下游采用版本属于后续阶段。原整月接口不允许覆盖或删除已有追溯的卡片；改用逐条版本入口。新月份通过统一策划匹配请求创建待审核创意；包含已追溯创意的整月生成与覆盖入口统一拒绝，防止丢失人工修改。历史作者不猜测，首次快照不声称是原创作者投稿。

AMCMM 编辑窗口只展示当前脚本、标签、保管人、素材需求和原视频链接，不展示版本历史或对比。覆盖保存仍追加后台审计修订；另存新脚本保留原稿、继承标签、绑定当前用户保管。此界面与另存能力已部署；2026-10-13 的内容编辑权限修复已随 Kanban 03eead30 / MM 8ffa3dd 部署，生产隔离回滚验证通过。保存失败保留输入，冲突可显式重载；结果不明重试沿用同一请求键。原始来源链接按当前已有授权打开，不授予新权限。所有响应 no-store，当前品牌访问在每次读取和写入时重验。

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

用户入口：AMCMM 品牌创意 → 选择脚本 → 直接编辑或一键 AI 修改 → 覆盖保存／另存新脚本 → 进入制作。Core 与持久 User AI 工作台已接入，见 [IAIC 实施与验收](amcmm-iaic-implementation.md)；制作发布版本采用与持续运营仍待交付。

AI 辅助版本扩展：用户明确采用固定候选摘要后，复用同一原子版本服务，记录 taskId、agentId、requestedBy、artifact引用与品牌事实摘要；作者及当时主理人仍由服务端确定。采用时检查原创意版本和品牌事实，重复采用返回原回执并按revisionId回读。此扩展不触发发布或覆盖已有制作结果。


## 统一策划匹配与编辑（2026-10-11，已部署，收费品牌 CLI 验收及补充修复状态见文首）

当前增量契约见 [统一创意工作流](unified-creative-planning.md)。看板与 MM 共用逐条修订服务；MM 使用单页脚本编辑和一键 AI 修改，字段差异及审核记录在后台保留。旧整月生成、重写和整月覆盖入口拒绝写入。已确定策划的匹配请求以 CREATIVE_MATCH_REQUEST 保存，初次即时认领，后续按品牌时区 01:00–05:59 补全；单任务最多三条，每日最多五批，消耗仅记录而不限制额度。未耗尽候选或达到批次执行边界时不冒充匹配不足；匹配不足使用用户确定的提示。服务异常、策划变更及过期空档分别展示。已有通用品牌创意池仍保留，常规每日检索改为夜间；策划请求为独立有界任务，不能将两者误写成只会检索一次。
