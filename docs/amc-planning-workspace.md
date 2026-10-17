---
status: implemented-local
lifecycle_class: fixed-reference
updated: 2026-10-18
---

# AMCMM 品牌策划共创工作区

四步流程已本地实现，尚未发布。本文件描述当前目标和本地代码，不把旧五步版本的生产 SHA 作为本次上线证明。

## 四步流程

1. **AI Insight**：只展示最新已完成报告。统一比较本品牌已保存摸底报告、Growth 当前 V3 报告及 `BrandMarketingSolution.kind=MANAGEMENT_REPORT` 的完成版本；按分析周期结束时间、完成时间和稳定 ID 排序，日期缺失不能当作最新。只读取真实产物，不把原管理报告页面的演示数据当成真实月报。Growth 读取失败保留已存报告，标明来源状态；无任何可读来源且上游不可读时提示读取问题。
2. **品牌访谈**：AMC Skill 根据同一最新报告、历史问答和已保存附件准备可编辑调研文档，区分来源、时间、用户确认和待确认。支持直接编辑、对话和上传资料。
3. **营销方向与卖点**：合并两个旧步骤，在同一文档讨论目标客群、宣传重心、卖点证据、主推产品与资源限制，用户确认后绑定访谈版本。
4. **品牌营销策划**：以已确认访谈和方向生成品牌特点、卖点、SWOT、自然年度全年活动日历及策划、从选定起始月开始连续六个月的执行计划、店内经营配合及品牌营销创意。可编辑文档由全部校验章节生成，不能仅保存模型回复摘要。

独立季度导航移除；旧 `focus`、`selling_points`、`annual` 和 `quarter` 契约及原数据保留，季度和内容日历不自动重建。已有年度/季度策划通过第四步详情对照。

## 报告申请

无报告时显示「品牌报告尚未完成」与「Request an AI Insight Report」。点击后服务端预留申请 ID，以稳定 provider idempotency key 创建 Growth 任务。丢失回执保留原申请，重试同一 key；处理中的重复申请返回原 ID。申请成功显示「已申请，报告完成后将在此展示」。需要证据复核、失败及服务不可读分别展示，不能把申请成功当作报告完成。

| API | 作用 |
| --- | --- |
| `GET /api/brands/:id/insight` | 读取统一最新报告、来源状态和真实申请状态；有写权限时核对并同步已完成原任务，不启动新调研 |
| `POST /api/brands/:id/insight` | 显式申请或恢复原申请，返回真实申请 ID |
| `POST /api/brands/:id/ai/tasks/:taskId/planning` | 从原持久任务读取并保存经过验证的候选，不接受浏览器伪造的 AI 产物 |
| `POST /api/brands/:id/planning-document` | 保存文档或显式确认，提交 stage/action/content/attachmentIds/expectedRevision/requestKey |
| `POST /api/brands/:id/planning-document/attachments` | multipart `file`，保存本品牌附件及实际解析状态 |

## 文档、确认与附件

保存草稿与确认分开。服务端记录确认人、时间和输入版本，使用品牌行锁、工作区 revision、审计和幂等回执；冲突保留浏览器草稿。方向依赖已确认访谈，完整策划依赖二者的当前确认版本。长文压缩后的摘录不能代替服务端完整资料计算的 `confirmationState`。

附件支持 TXT、Markdown、PDF、JPG、PNG、WebP，单个不超过 10MB，每份访谈最多 20 个引用。使用 OBS 存储，文字提取后仍标为待确认；图片复用现有分析队列，未配置或未完成分析时保留待核对状态。PDF 原件可以提交，当前未提供 PDF 自动文字提取，需用户补充重点信息。解析不成功不丢附件，也不声称 AI 已读懂。

确认过的上游文档修改后，新生成及确认不能继续沿用失效输入。既有方案保留并提示重新核对。完整方案的人工编辑文档为当前内容，`structuredDataStale` 表示原结构化生成字段只供对照。正式确认另存 `BrandMarketingSolution` 版本。草案记录真实生成任务加载的 Skill 内容哈希及报告引用，不能用采用时的新 Skill 冒充生成时版本。

## 界面与权限

桌面阶段导航、文档和对话分栏；手机采用阶段切换和文档/对话双视图。AI Insight 隐藏通用讨论、草案及起始月份操作。键盘打开时精简导航，保持输入和发送可见。品牌切换隔离报告、对话、候选、编辑草稿和在途回执。新写接口在 MM 代理和业务端均检查适用的来源及品牌写权限，multipart 保持原始二进制。

## 验证入口

- `scripts/test-brand-planning-v2.mts`：最新报告排序、必需章节、跨年六个月及旧数据保留。
- `scripts/test-latest-insight.mts`：真实隔离数据库月报、摸底及 Growth fixture 的统一选择和离线回退。
- `scripts/test-insight-request.mts`：持久申请、未知结果恢复、provider key 和重复请求。
- `scripts/test-planning-document.mts`：保存/确认、长文确认状态、附件隔离、完整方案及版本历史。
- `scripts/test-planning-workspace.mts`：旧年度/季度、冲突和并发幂等。
- `scripts/test-brand-planning.mts`：真实 IAIC 运行时，含合并方向及完整策划，模型/Growth 使用 fixture。
- MM `scripts/test-planning-workspace-v2-ui.mjs`：实际组件、四种屏宽、键盘视区、申请、文档和确认。
- MM `scripts/test-planning-proxy.mts`：跨站写拒绝及二进制附件代理。

真实中央模型和 OBS/Growth 的登录后线上联调、发布及 live 健康标记不属于这些 fixture 测试的证明范围。
