---
status: current-truth
lifecycle_class: fixed-reference
updated_at: 2026-10-16
---

# 历史内容创意迁移

本地已实现，未部署、未对生产数据库执行。迁移用于兼容投影，不重写历史修订、发布记录、视频或原始来源证据。

## 执行方式

显式提供目标数据库连接的 `DATABASE_URL`；脚本不自动加载环境文件，不记录连接串。先确认目标数据库，再运行：

```sh
node --import tsx scripts/migrate-creative-workspace.mts --dry-run
node --import tsx scripts/migrate-creative-workspace.mts --dry-run --brand-id BRAND_ID
# 仅在已审阅 dry-run 报告并授权目标数据库后：
node --import tsx scripts/migrate-creative-workspace.mts --apply --brand-id BRAND_ID
```

不带参数等同 `--dry-run`。未知参数及同时指定两种模式都会失败。dry-run 在只读、可重复读事务内读取，既不取得写行锁，也不创建审计。输出 JSON 包含模式、版本、品牌和创意数量、dated / linked / ambiguous / undated / current / invalid 分类、needs_confirmation 数量、逐项问题、待修改品牌数及实际写入品牌数。

## 投影规则

历史日期、平台和旧状态保留在 `legacy`；新工作区字段没有发布日期。未排期创意的 `schedule` 为 null。现有 canonical 来源和 SKU 决策原样保留；缺失来源、作者、修改原因、SKU 及修订 ID 均不补造。已有顶层来源摘录仍保留，不升级为完整来源。

历史 `platformSlug` 也保留在 `legacy.platformSlug`，只有它而没有 platform 时可作为 platformTargets 的兼容来源。platform 与 platformSlug（沿用既有平台别名校验，其他值忽略大小写和首尾空白）冲突时保留两份原始证据、报告 `legacy_platform_conflict` / needs_confirmation；不从冲突值推断平台目标或草稿关联，已有显式 platformTargets 不改写。

只有同品牌、唯一精确创意 marker、唯一创意身份、同品牌平台账号和没有其他创意占用的旧草稿可投影成 schedule。读取草稿已有 scheduledAt（可以为 null），不从旧 date 生成时间。迁移关联显式 `legacy: true`，未知的 scheduledBy 和 scheduledAtRevisionId 保持 null。正常显式排期仍必须保存真实操作者和固定修订 ID；客户端不能写入 legacy 投影。

重复 marker、同 ID 跨月份、草稿已被其他创意占用、账号归属不明、缺少关联或非法身份均报告 needs_confirmation，不猜测草稿。非精确前缀和跨品牌记录不作为关联依据。迁移不创建、删除或更新 ContentDraft，不调用发布、模型或制作服务。

marker 判定先解析草稿中的全部权威身份，再核对工作区：即使其中一个来源创意已经缺失，两个不同 raw marker 仍是歧义；同一 raw 身份的大小写重复不算两个身份。有 V2 编码 marker 时仅以 V2 为权威，不能退回 raw 投影；冲突或损坏的 V2 不关联。关联扫描前先验证月份与非空字符串 ID（最长 200），数值 ID、缺 ID 等非法项原样保留并计入 invalid / needs_confirmation，不把 undefined 当作任意 marker 匹配。

## 事务和重放

每个品牌独立事务，先锁 BrandKnowledge，再按 ID 锁该品牌 ContentDraft，使用与创意保存和排期相同的锁顺序。写入兼容投影、SYSTEM 审计和回读核验属于同一事务；锁等待 5 秒、单语句 15 秒。审计记录迁移版本、前后摘要、幂等摘要和逐项结果，actorId=null 表示系统迁移，不冒充历史作者。失败使该品牌全部回滚；已提交的其他品牌可以安全重放。

已投影项目保存 workspaceMigration.version/result。重复 apply 保持创意、分类和审计数量稳定；wouldChangeBrands/writtenBrands 归零。needs_confirmation 不会在后续运行中自动猜测修复，必须通过明确的业务核对处理。

## 本地证据与发布边界

终审后的显式排期也采用唯一身份规则：候选筛选与草稿锁后读回均拒绝多身份，跨月同 ID 的未关联项目不猜测归属。重排或取消追加当前 marker，保留完整历史 agentNote。两端通过同权限 schedule GET 读取最小可用账号字段，POST 提交显式账号，DELETE 取消并验证 schedule:null；这不改变迁移的默认只读、锁顺序、审计或幂等契约。

`test-creative-workspace-migration.mts` 使用 PGlite 执行实际 SQL，覆盖默认只读、唯一关联、歧义、跨品牌、前缀碰撞、来源未知、审计失败回滚及重复 apply。PGlite 不代表多连接 Prisma/PostgreSQL 或生产验收；真实 PostgreSQL 结果单独记录。

`test-creative-workspace-migration-pg.mts` 已在获准的一次性 loopback PostgreSQL 16 测试库通过：两个独立 PostgreSQL 连接池并发 apply 只写一次，Prisma 负责 schema/业务写入及权威回读；完整 dry-run 无变更、audit 触发失败全回滚、重复 apply 稳定、禁止客户端 legacy、取消后无伪造 null marker、显式重排固定真实 actor/revision 并复用旧草稿。另有真实 PG 20 目标/8 来源匹配矩阵与视频草稿并发入库回归。连接串由操作者显式提供，测试仅接受本机且名为 amc_lineage_test_* 的数据库。

本轮完整历史 `prisma migrate deploy` 在一次性空库执行时，旧迁移 `20260703000000_fix_user_fk_ondelete` 因缺少 Comment 表失败。该历史链不能被宣称可从零部署；未修改旧生产迁移。当前 schema 仅在一次性测试库用 db push 建立后验证业务事务，并单独执行本分支新增反馈索引 SQL。生产执行前须确认既有基线和本分支迁移状态。
