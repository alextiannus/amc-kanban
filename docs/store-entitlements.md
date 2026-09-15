# 多门店资料与管理员开通

状态：本地实现及隔离测试完成，尚未执行目标环境迁移与发布。

## 管理操作

管理后台 → 品牌管理 → 编辑品牌 → 门店额度。输入授权总门店数后，点击「保存门店额度」，无需保存套餐。清除授权恢复订阅额度。最终额度取「有效订阅支持数量」与「管理员授权总数」的较大值。

授权不修改账单、订阅状态或增值服务。历史超额门店可编辑、减少，不可继续增加；撤销授权不删除资料。各店继续共享品牌运营。

## 接口

- `GET /api/admin/brands/:id/store-entitlements`：读取当前门店数与额度。
- `PATCH /api/admin/brands/:id/store-entitlements`：`{ "manualStoreLimit": 3 }` 授权共 3 家；`null` 清除授权。要求具有 ADMIN 角色的网页会话，不接受 API Key 委托。写入独立 AuditLog。
- 返回 `store_limit`、`subscription_store_limit`、`manual_store_limit`、`configured_store_count`、`multi_store_addon_quantity`；品牌订阅查询也提供这些字段。
- 额度超限：HTTP 409、`code: STORE_LIMIT_EXCEEDED`；参数错误：HTTP 400。页面展示服务端原因并保留输入。

资料保存、Markdown 保存、注册创建和 Growth 导入共用校验。校验与写入在事务中进行，通过品牌行锁协调授权变更和门店写入。Markdown 在校验成功后写入，并保存稳定门店标识；自动 Profile 包含全部门店。

## 验证与发布

- `npm run test:store-entitlements`：运行实际接口及服务代码，使用隔离事务替身，覆盖授权、鉴权、审计、账单不变、历史超额、创建、Growth 导入、Google 数据保留和 Markdown 拒绝时无副作用。
- `npm run typecheck`；`node --experimental-strip-types scripts/test-growth-google-sync.mts`。
- Playwright 隔离组件验证：加载、保存、清除授权、非法值，以及模拟服务端失败后输入保留；不代表线上环境端到端验证。
- 新增迁移：`prisma/migrations/20260915120000_brand_manual_store_limit/migration.sql`。先在目标数据库执行该迁移，再发布对应应用。不要用 `db push --accept-data-loss` 替代迁移。
- 上线后用管理员为测试品牌授权 3 家，验证三家保存、第四家拒绝、清除后原资料保留及真实 Growth 同步；核对授权前后账单不变。

已知既有测试问题：`test-brand-growth-sync-contract.mts` 对「本地修改已保存，正在同步到 AMC-Growth」的文案断言失败，该文案在修改前 HEAD 中也不存在。
