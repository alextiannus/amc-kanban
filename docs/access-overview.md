# Kanban / Content 角色权限管理

状态：本地实现与验证中，未迁移生产数据库、未部署。权限执行协议 permissionProtocol=1；目录协议 contractVersion=1。角色策略版本按角色独立递增。

## 使用方式

管理员进入「用户与权限管理 → 用户组与角色」，选择主理人、品牌主、BD 或研究员，点击「编辑功能权限」。同一页按 Kanban、Content 分组勾选模块和操作，查看变更摘要后保存。成员管理继续保留；ADMIN 角色不能编辑功能权限。

选择操作自动选中模块查看，取消查看同时清除本角色在该模块的操作。多角色取授权并集，不存在“显式禁止”覆盖其他角色；账号诊断展示每项操作的角色来源。平台共享库继续共享；功能授权不授予品牌，品牌仍受现有有效 Crew、组织继承以及认证兼容关系约束。无角色账号不从旧 dashboardRole 推导主理人菜单。

Kanban 模块包括品牌资料、素材、发布内容、发布计划、店内活动、数据分析、评价、行动事项、日志、品牌员工和订阅。Content 包括控制台、视频制作、爆款复刻、灵感星链、标签库、AI 角色库、规则与技能、知识查看、记录审核。Growth、未开放菜单、模型密钥、系统管理以及 Content 管理员专属操作不可配置。

## 接口

| 接口 | 认证与用途 |
|---|---|
| GET /api/admin/role-permissions | 管理员网页会话；modules、policies、versions、contentReady |
| PUT /api/admin/role-permissions/[role] | 管理员网页会话；保存完整授权集合 |
| GET /api/admin/access-overview | 角色矩阵，使用当前数据库策略 |
| GET /api/admin/users/[id]/access-overview?brandId=... | 账号当前角色、品牌来源、有效权限及限制 |
| POST /api/internal/access/resolve | 内部服务认证；验证签名身份并读取实时用户、品牌与策略 |
| Content GET /v1/lab/access | 已签名身份；当前有效权限，供页面导航与操作展示使用 |
| Content GET /v1/internal/access-overview | 内部服务认证；版本、功能目录与保守初始化基线，最终授权由 Kanban 决定 |

保存示例（集合替换，并非增量；这里仅保留视频查看）：

~~~json
{"expectedVersion":1,"grants":["content.video-making.read"]}
~~~

成功返回 role、grants、version、affectedUsers。未知权限、ADMIN 保留权限或操作缺少查看依赖返回 400；未登录 401，非管理员 403，版本冲突 409，服务/迁移/版本不可用 503。保存中的授权、版本和 AuditLog 在同一事务提交。所有查询响应 no-store，不返回用户凭证或密钥。API Key 不能替代管理员网页会话修改策略。

Content 调用内部解析接口使用现有 x-content-service-token。浏览器身份是 Kanban 签名的 sub/authVersion/brandId/exp；不相信客户端角色或旧令牌权限。purpose=job 仅供已通过内部认证的后台任务，提交持久化真实 userId 和 brandId 重查当前权限，不签发登录凭证。服务不可达、协议不匹配均拒绝执行，不使用过期缓存兜底。

## 规则与兼容边界

- 权限保存影响后续请求。旧 Content 凭证缺少 authVersion 时必须从 Kanban 重新进入；撤销角色、停用和品牌撤销不能靠旧页面继续操作。
- Kanban 导航与页面、业务 HTTP 边界、Auth V2 Capability、MCP 工具及旧别名接入配置检查。Content 在业务处理前检查方法与路径，未知 Lab 路由只允许管理员，服务令牌本身不能充当 Lab 用户。
- Content 目录/语音列表/就绪状态作为已授权内容模块的辅助数据；品牌目录只返回当前账号授权品牌。用户代理请求携带签名身份。
- 异步合成、视频参考准备、源素材处理及拍摄导出在 worker 开始时复核角色与品牌。已提交第三方执行的任务不会自动撤回。
- 初始配置按模块取保守权限，不自动扩大授权。研究员原先资产编辑/删除与创意审核共用模块而守卫不一致，初始化仅开放查看、录入、导出；需要编辑、删除或生成时由管理员明确授予。AI 角色库默认仍关闭，但管理员可开启，随后入口与接口一致生效。
- 管理员专属的模板维护、主视频替换、分类初始化、批量重打标、知识导入、训练导出和模型设置继续保留，不能用业务模块操作勾选绕过。
- 权限允许仍不代表对象可操作：订阅、发布状态、归属、资源确认和模型就绪限制继续生效。

## 迁移、测试与交付

新增 RolePermissionPolicy（role 主键、grants JSON、version、updatedById、updatedAt），迁移 20260917090000_role_permission_policy 初始化四个角色。SQL 可重复执行，不覆盖管理员已有配置；不使用 db push 替代已审阅的生产迁移。旧系统未接入动态权限，启用后不能单独回退旧服务绕开撤权。

部署需协调两个服务：先执行 Kanban 数据库迁移，部署支持相同权限协议的两套代码，再开放编辑并让用户重新从 Kanban 进入 Content；期间 Content 不能联通解析接口则返回 503。编辑保存要求 Content 版本检查成功。生产连接、数据库迁移及版本实际值需在发布时验证。

本地验证命令：两仓库 npm run test:role-permissions、npm run test:access-overview、npm run typecheck；Content 另运行 npm run test:integration、npm run build、npm run test:deployment；Kanban 运行 npm run build。数据库事务测试使用 PGlite，Content HTTP 测试使用本地模拟权限服务，浏览器编辑器用合成账号及模拟保存接口；均不冒充线上验证。

上线验收填写：两个服务 commit SHA、迁移版本、permissionProtocol、角色策略版本、管理员/主理人/研究员代表账号、品牌、时间、保存前后访问结果。当前尚无线上验收结果。

## 2026-09-17 本地验收记录

- 两服务权限测试、权限总览测试及类型检查通过。
- Kanban 生产构建、视频入口与侧栏回归通过；Content 完整集成测试、构建和部署契约检查通过。
- 实际权限编辑组件通过本地浏览器验证：模块搜索、撤销生成、保存版本递增、关闭查看清除模块操作、取消恢复。接口使用模拟数据。
- 数据库迁移仅在本地 PGlite 验证；生产迁移、部署、真实账号联调尚未执行。
