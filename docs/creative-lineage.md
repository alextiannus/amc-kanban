# 品牌创意修改与版本追溯

状态：代码已实现并部署；本地验证和生产隔离回滚验证通过。范围为人工修改保存与追溯，不包含 Core 接入或自动发布。

复用 BrandMarketingSolution，kind=CREATIVE_ITEM，以品牌、月份和卡片 ID 的摘要为 period。版本0保留首次编辑时的策划原稿，作者未知标记 legacy_unknown；版本1起保存真实会话操作者、角色快照、当时有效 Crew PRINCIPAL 关系、父版本、原始来源 ID/已知内容快照及摘要。来源仅有策划摘录时明确 plan_snapshot，不能冒充 Content 原文或原创意准确发行版本。已有版本只读保留。

GET/POST /api/brands/:id/content-creatives/:creativeId/revisions?month=YYYY-MM 提供读取及保存。保存接收 expectedRevision（当前卡片摘要）、idempotencyKey、白名单 patch。保存事务锁定品牌知识记录并复核当前权限，追加版本和审计、更新唯一卡片。幂等键绑定品牌、卡片、月份、实际用户和载荷；同键异内容409；并发旧版本409。响应与后续 GET 指定 revisionId 回读相互核对。

保存不修改现有 ContentDraft、排期、发布或付费视频。不需要跨服务 outbox；制作/下游采用版本属于后续阶段。原整月接口不允许覆盖或删除已有追溯的卡片；改用逐条版本入口。生成新月份不受影响；包含已追溯创意的整月重新生成拒绝，防止丢失人工修改。历史作者不猜测，首次快照不声称是原创作者投稿。

AMCMM 编辑窗口显示版本历史、品牌、操作者、当时主理人、原来源和完整历史内容。保存失败保留输入，冲突可显式重载；结果不明重试沿用同一请求键。原始来源链接按当前已有授权打开，不授予新权限。所有响应 no-store，当前品牌访问在每次读取和写入时重验。

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

用户入口：AMCMM 品牌策划 → 编辑创意草稿与查看版本记录 → 选择创意 → 编辑保存/版本历史。Core 与持久 User AI 工作台已接入，见 [IAIC 实施与验收](amcmm-iaic-implementation.md)；制作发布版本采用与持续运营仍待交付。

AI 辅助版本扩展：用户明确采用固定候选摘要后，复用同一原子版本服务，记录 taskId、agentId、requestedBy、artifact引用与品牌事实摘要；作者及当时主理人仍由服务端确定。采用时检查原创意版本和品牌事实，重复采用返回原回执并按revisionId回读。此扩展不触发发布或覆盖已有制作结果。
