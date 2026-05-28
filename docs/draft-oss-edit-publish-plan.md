# AI Marketing Crew 看板「草稿编辑 + OSS 图片管理 + 基于草稿发布」产品设计计划

## 1. 文档目标
本计划用于指导 AI Marketing Crew 看板新增并标准化以下闭环能力：
1. 连接 OSS 保存图片。
2. 在线查看和编辑草稿。
3. 用户对 AI Bot 输入的图片统一上传到 OSS。
4. 基于草稿进行发布（立即发布或定时发布）。

该文档面向产品、前端、后端、测试共同执行，强调“可上线、可审计、可回滚”。

## 2. 现状与复用基础
### 2.1 已有可复用能力（当前仓库）
1. 已有草稿主模型：`ContentDraft`、素材模型：`MediaAsset`、草稿-素材关联：`ContentAssetRef`（见 Prisma schema）。
2. 已有资产上传接口：`POST /api/brands/[id]/assets/upload`（已实现签名上传流程并支持 PostFast 作为 OSS 后端）。
3. 已有发布能力：`postfastPublish(...)` 以及人工审批后触发发布的链路（`/api/brands/[id]/actions/[aid]/approve`）。
4. 已有发布状态字段：`ContentDraft.status / platformPostId / publishedAt`。

### 2.2 当前缺口
1. 缺少面向业务用户的“草稿详情页 + 在线编辑器”完整交互。
2. 缺少“AI Bot 输入图片必须先落 OSS 再引用”的强约束规则与统一接口契约。
3. 缺少草稿版本历史（revision）和回滚能力。
4. 缺少“从草稿直接发起发布任务”的统一发布编排接口（当前较分散）。

## 3. 产品范围
### 3.1 本期范围（In Scope）
1. 草稿创建、查看、编辑、保存、版本记录。
2. 图片上传至 OSS，并在草稿中引用 OSS 资产。
3. 新增“素材库”模块：沉淀、检索、复用品牌素材。
4. 新增“草稿库”模块：统一承载草稿生命周期管理。
5. AI Bot 图片输入统一走 OSS 入库（禁止直接外链发布）。
6. 基于草稿发起发布：立即发布 / 定时发布 / 审核后发布。
7. 发布结果回写草稿状态及任务卡片。

### 3.2 非本期范围（Out of Scope）
1. 视频剪辑与封面智能生成。
2. 多人实时协同编辑（CRDT）。
3. 复杂内容模板市场。

### 3.3 产品模块定义
1. 素材库（Asset Library）
   - 定义：品牌级 OSS 素材中心，管理图片资产的上传、分类、检索、复用、状态与来源。
   - 主体对象：`MediaAsset`。
2. 草稿库（Draft Library）
   - 定义：品牌级内容草稿中心，管理草稿创建、编辑、审核、发布、归档全过程。
   - 主体对象：`ContentDraft` + `ContentDraftRevision`（建议新增）。

## 4. 角色与权限
1. 品牌主理人（Human Admin/Owner）：可查看、编辑、审核、发布所有品牌草稿。
2. 品牌协作者（Human User）：可在授权范围内查看/编辑草稿，发布权限可配置。
3. AI Bot（AI_AGENT）：可创建草稿、上传图片、更新草稿内容，不可越权发布。

权限原则：
1. 草稿可见性继承品牌权限（brand scope）。
2. 发布动作为高风险动作，默认需 Human 审核通过。
3. AI 上传的图片资产必须可追踪上传者（uploadedBy=agentId）。

## 5. 核心流程设计

### 5.1 流程 A：连接 OSS 保存图片
1. 管理员在品牌设置页配置 OSS 参数（优先复用 PostFast API Key）。
2. 前端调用统一接口申请签名上传地址。
3. 客户端直传文件到 OSS（降低服务端带宽压力）。
4. 服务端写入 `MediaAsset` 元数据并返回 `assetId + assetUrl + storageKey`。
5. 草稿仅保存资产引用（`ContentAssetRef` + `mediaUrls` 补充兼容）。

成功标准：
1. 上传后在素材库可检索。
2. 图片 URL 可访问且鉴权策略符合预期。
3. 失败有明确错误码与重试提示。

### 5.2 流程 B：在线查看和编辑草稿
1. 用户进入“草稿详情”页，加载草稿正文、标签、排期、素材。
2. 编辑器支持自动保存（2 秒 debounce）与手动保存。
3. 每次保存写入 `updatedAt`，并生成 revision（本期建议新增版本表）。
4. 支持草稿状态：`draft`、`pending_review`、`publishing`、`published`、`failed`。
5. 支持“查看历史版本”和“一键回滚到某版本”。

成功标准：
1. 页面刷新后编辑内容不丢失。
2. 并发冲突可提示（基于 `updatedAt` 或版本号）。
3. 可追踪谁在何时改了什么。

### 5.3 流程 C：AI Bot 输入图片统一上传 OSS
1. AI Bot 在创建/更新草稿时，若包含图片输入，必须先调用上传接口。
2. 接口返回 `assetId/storageKey` 后，AI Bot 再写入草稿。
3. 禁止 AI 直接写第三方临时 URL 作为最终发布素材。
4. 若 AI 传入外链，服务端执行“下载->转存 OSS->替换引用”兜底策略。

成功标准：
1. 所有 AI 相关草稿均可追溯到 `MediaAsset` 记录。
2. 发布链路只消费 OSS 资产标识（`mediaStorageKeys` 优先）。
3. 审计日志可区分“人类上传”与“AI 上传”。

### 5.4 流程 D：基于草稿做发布
1. 用户在草稿页点击“发布”或“提交审核”。
2. 服务端校验草稿完整性（caption、平台、账号、素材可用性、排期合法性）。
3. 若需要审核：创建/更新 `ActionItem(content_approval)`，状态转 `pending_review`。
4. 审核通过后进入发布执行：调用 `postfastPublish`（或平台直连）。
5. 发布结果回写草稿：
   - 成功：`published`，写入 `platformPostId/publishedAt/url`。
   - 失败：`failed`，记录错误并可“一键重试发布”。

成功标准：
1. 发布结果与看板任务状态一致。
2. 定时发布可正确反映 `in_progress` 与最终 `done`。
3. 失败可追踪并可重试。

## 6. 信息架构与页面
1. 素材库页：
   - 视图：瀑布流/网格切换。
   - 能力：上传、预览、重命名、标签、分类、来源过滤（人类/AI）、被引用次数排序。
2. 草稿库列表页：筛选（状态、平台、账号、创建人、时间）、搜索、批量操作。
3. 草稿详情页：
   - 左侧：正文编辑、标签、排期、发布设置。
   - 右侧：素材库引用区、上传区、历史版本、发布日志。
4. 发布确认弹窗：显示账号、时间、素材数量、风控提示。
5. 审核中心：待审核草稿列表、通过/驳回、驳回意见。

### 6.1 素材库核心能力
1. 资产入库
   - 支持拖拽/选择上传，上传后必须落 OSS 并写入 `MediaAsset`。
2. 资产检索
   - 按文件名、标签、MIME、上传者、时间范围过滤。
3. 资产复用
   - 在草稿详情页直接引用已存在素材（创建 `ContentAssetRef`）。
4. 资产治理
   - 显示 `usedCount`、`lastUsedAt`，支持软删除/归档。

### 6.2 草稿库核心能力
1. 草稿分层
   - 我的草稿、品牌草稿、待审核、发布失败。
2. 草稿版本
   - 每次保存形成 revision，可对比和回滚。
3. 草稿操作
   - 提交审核、发布、定时发布、复制草稿、归档。
4. 草稿关联
   - 展示引用素材清单、发布记录、审核意见和任务链接。

## 7. 数据设计（增量）

## 7.1 复用现有表
1. `ContentDraft`：保留作为主实体。
2. `MediaAsset`：保留作为 OSS 资产索引。
3. `ContentAssetRef`：保留作为草稿与资产关联。
4. `ActionItem`：复用审核流。

## 7.2 建议新增表
1. `ContentDraftRevision`
   - 字段：`id, draftId, snapshot(json), editedBy, editedByType, createdAt, reason`。
   - 用途：版本历史、回滚、审计。
2. `PublishJob`（可选但推荐）
   - 字段：`id, draftId, status, provider, requestPayload, responsePayload, error, retryCount, createdAt, updatedAt`。
   - 用途：发布任务可观测、可重试、可排障。

## 8. API 设计（目标态）
1. `POST /api/brands/:id/assets/upload`
   - 用途：统一上传图片到 OSS（已存在，需补齐返回字段规范）。
2. `GET /api/brands/:id/assets`
   - 用途：素材库分页查询（支持搜索、分类、来源过滤）。
3. `PATCH /api/brands/:id/assets/:assetId`
   - 用途：更新素材元信息（标签、分类、命名、归档状态）。
4. `DELETE /api/brands/:id/assets/:assetId`
   - 用途：素材软删除/归档。
5. `GET /api/brands/:id/drafts`
   - 用途：草稿分页列表。
6. `POST /api/brands/:id/drafts`
   - 用途：新建草稿（支持 AI Bot）。
7. `GET /api/brands/:id/drafts/:draftId`
   - 用途：草稿详情。
8. `PATCH /api/brands/:id/drafts/:draftId`
   - 用途：在线编辑草稿（正文、素材、排期）。
9. `GET /api/brands/:id/drafts/:draftId/revisions`
   - 用途：版本历史。
10. `POST /api/brands/:id/drafts/:draftId/revert`
   - 用途：回滚到指定版本。
11. `POST /api/brands/:id/drafts/:draftId/publish`
   - 用途：从草稿发起发布（立即/定时/审核）。
12. `POST /api/brands/:id/drafts/:draftId/retry-publish`
   - 用途：失败重试。

## 9. 状态机设计
草稿状态建议统一为：
1. `draft`：编辑中。
2. `pending_review`：已提交待审核。
3. `approved`：审核通过待执行（可选）。
4. `publishing`：发布中。
5. `scheduled`：已排期。
6. `published`：已发布。
7. `failed`：发布失败。
8. `archived`：归档。

状态迁移示例：
1. `draft -> pending_review -> publishing -> published`
2. `draft -> publishing -> failed -> publishing -> published`
3. `draft -> scheduled -> publishing -> published`

## 10. 非功能与安全要求
1. 上传文件限制：大小、MIME、扩展名白名单。
2. 病毒扫描（可延后）：上传后异步扫描并打标。
3. 并发编辑保护：版本号冲突提示。
4. 审计：所有发布动作记录操作者、时间、参数摘要。
5. 数据保留：revision 默认保留 180 天，可配置。
6. 回滚策略：发布失败不影响草稿可编辑性。

## 11. 分阶段实施计划

### Phase 1（1 周）- 打通最小闭环
1. 固化 OSS 上传契约（统一响应结构）。
2. 新增素材库列表 API（最小查询能力：分页+关键词）。
3. 新增草稿库 CRUD API（不含版本历史）。
4. 增加草稿详情编辑页（正文+素材引用+排期）。
5. 新增“从草稿发布”入口并复用现有发布能力。

交付验收：四条主流程可跑通。

### Phase 2（1 周）- 稳定性与可审计
1. 新增素材库治理能力（标签、分类、软删除、使用统计）。
2. 新增 revision 表与历史回滚。
3. 新增 PublishJob 与失败重试面板。
4. 完善 AI 图片上传强约束与外链兜底转存。
5. 增加告警和日志看板（失败率、耗时、重试次数）。

交付验收：可追溯、可重试、可回滚。

### Phase 3（可选）- 体验增强
1. 富文本增强（模板、变量、@素材引用）。
2. 双人协同编辑（锁机制或实时协同）。
3. 智能发布建议（最佳发布时间、标签建议）。

## 12. 验收标准（对应你的 4 条流程）
1. 连接 OSS 保存图片：
   - 可在品牌配置后成功上传并获得可复用资产 ID。
2. 在线查看和编辑草稿：
   - 草稿可打开、修改、保存、刷新不丢失。
3. AI Bot 图片统一上传 OSS：
   - AI 草稿中的图片均来自 `MediaAsset` 记录，抽检通过率 100%。
4. 基于草稿发布：
   - 支持立即发布/定时发布/审核后发布，状态与结果可追踪。

## 12.1 素材库与草稿库专项验收
1. 素材库
   - 可按品牌范围展示素材，支持检索、筛选、预览、复用。
   - 素材被草稿引用后，`usedCount` 可准确增加。
2. 草稿库
   - 可按状态完整查看草稿生命周期（draft -> pending_review -> publishing/published/failed）。
   - 草稿详情可看到关联素材、审核记录、发布记录。
3. 库间联动
   - 在草稿页引用素材库资源后，发布链路优先使用 OSS 资产标识。
   - 删除素材时若仍被草稿引用，系统需阻断硬删除并给出提示。

## 13. 风险与应对
1. 风险：外部 OSS/发布平台偶发失败。
   - 应对：幂等键 + 重试队列 + 发布任务记录。
2. 风险：AI 上传外链不可访问。
   - 应对：服务端拉取失败时明确报错并回到待处理。
3. 风险：多人改稿覆盖。
   - 应对：版本冲突校验 + revision 回滚。
4. 风险：素材权限泄漏。
   - 应对：签名 URL 时效控制 + 资源访问鉴权。

## 14. 研发任务拆解（可直接开工）
1. 后端
   - 统一上传响应协议与错误码。
   - 素材库查询/编辑/归档接口。
   - 草稿库 CRUD + 发布接口。
   - AI 图片外链转存 OSS 兜底逻辑。
   - revision / PublishJob 数据表与服务层。
2. 前端
   - 素材库页面（列表/筛选/预览/复用）。
   - 草稿库列表、草稿详情编辑器、发布弹窗、历史版本抽屉。
   - 自动保存、冲突提示、失败重试入口。
3. 测试
   - 素材库入库/检索/复用/归档链路。
   - 草稿库编辑/审核/发布/失败重试链路。
   - 权限测试（owner/user/agent）。
4. 运维
   - OSS 配置项模板化。
   - 发布失败告警与日志归档。

---

此方案是“基于你当前仓库能力的增量设计”，目标是在不推翻现有模型与发布链路的前提下，最短路径完成草稿编辑与 OSS 发布闭环。
