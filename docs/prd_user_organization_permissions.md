# 用户、组织与权限管理 PRD（Auth V2）

> 状态：决策已确认，等待开发批准
> 日期：2026-07-04
> 适用系统：amc-kanban、amc-mm、外部 REST API、AMC MCP
> 文档性质：产品需求、技术方案与执行基线
> 优先级：P0

## 1. 背景

当前系统同时存在 Cookie Session、AI Agent Key、人类个人 Key 委托、`x-agent-id`、`AgentPermission`、`BrandAgent`、`BrandOwner`、`CrewMember` 等多套身份和品牌访问路径。

这造成以下问题：

- API 路由重复实现身份解析和权限判断。
- 同一品牌访问可能产生多条串行数据库查询。
- 网页、REST API 与 MCP 的权限结果可能不一致。
- AMC Agent 被当作特殊委托身份，无法自然复用人类员工操作。
- 角色既有显式配置，又有基于关联数量的动态推导。
- API Key 存在明文、Hash、长效 JWT 等多种格式。
- 权限关系和业务数据耦合，迁移、测试和审计成本过高。

本 PRD 将用户、组织、品牌成员、角色、API Key、REST API 和 MCP 收敛到同一套认证授权体系。

## 2. 已确认决策

以下决策已经完成 Review，不再作为待讨论项：

1. `CrewMember` 成为唯一的直接品牌权限关系。
2. 所有角色必须显式配置，不再根据品牌数、Agent 数或关联数量动态推导。
3. AMC Agent 是正常的系统用户，与人类用户使用相同权限模型。
4. AMC Agent 获得 `ADMIN` 角色后，可以执行与人类 `ADMIN` 完全相同的操作。
5. `User.type` / `actorType` 只用于身份展示和工作日志，不参与权限放宽或限制。
6. 组织成员继续自动继承组织 Owner 的品牌权限。
7. 旧 `Human API Key + x-agent-id` 委托模式只保留 24 小时兼容期。
8. 新密码使用 Argon2id；旧 bcrypt Hash 在成功登录时渐进升级。
9. `/api/brands/[id]/mcp/execute` 在第一批实施中关闭；确认存在必要内部调用时，改用内部服务凭证重新开放。
10. 泳道阶段只保留在工作日志中，不再作为品牌权限或任务权限模型。

本方案取代 `docs/prd_amc.md` 中 v1.8.30 的“人类 API Key 委托 + AI Avatar 双层 ACL”设计。

## 3. 目标

### 3.1 功能目标

- 人类用户和 AMC Agent 使用统一的 `User`、角色和品牌成员体系。
- 网页、REST API、MCP 调用同一业务服务和权限策略。
- 所有受保护接口显式声明所需 Capability。
- 所有写操作以真实操作者身份写入工作日志。
- 组织成员能够继承组织 Owner 已拥有的品牌访问范围。
- API Key 支持创建、过期、撤销、轮换和审计。

### 3.2 性能目标

- Session 请求的身份和角色加载最多产生一次数据库查询。
- API Key 请求通过一次索引查询得到凭证、用户和显式角色。
- 品牌授权最多产生一次额外数据库查询。
- 同一请求内不得重复解析身份或重复查询相同授权结果。
- `/api/auth/me` 从当前多次查询降低为一次查询。
- 鉴权 P95 相比上线前基线至少下降 50%。
- 登录密码验证不再产生十秒级事件循环阻塞。

### 3.3 安全目标

- 未认证返回 `401`，已认证但无权限返回 `403`。
- 对需要隐藏资源存在性的跨品牌访问，可统一返回 `404`。
- 数据库不保存可直接使用的 API Key 明文。
- 过期、撤销、禁用用户和 `authVersion` 失效必须即时生效。
- 不允许通过 `User.type === AI_AGENT` 绕过或扩大权限。
- 每个 API Route 必须明确声明为公开、登录、授权、服务或 Webhook 路由。

## 4. 非目标

- 本阶段不建设可在 Admin UI 中任意编辑的数据库驱动权限规则引擎。
- 本阶段不引入 Redis；先消除重复查询，再根据性能数据决定。
- 本阶段不通过 AMC Agent 类型设置额外黑白名单。
- 本阶段不保留 WorkUnit、泳道任务或 Task 权限模型。
- 本阶段不重构所有业务服务，仅抽离鉴权与已涉及的操作服务边界。

## 5. 用户与组织模型

### 5.1 User

`User` 同时承载人类员工和 AMC Agent：

```text
User
├── id
├── type: HUMAN | AI_AGENT
├── status: ACTIVE | SUSPENDED | DISABLED
├── authVersion
├── email / nickname
├── passwordHash（仅需要密码登录的用户）
└── businessRoles
```

约束：

- `type` 不决定权限。
- 禁用用户后，Session 和 API Key 均不得继续调用业务 API。
- 密码、角色、账号状态或安全设置变化时递增 `authVersion`。
- `ownerId` 可以暂时保留为 Agent 来源信息，但不得参与授权。

### 5.2 显式全局角色

`UserBusinessRole` 是全局角色唯一来源：

| 角色 | 说明 |
|---|---|
| `ADMIN` | 系统全局管理 |
| `AMC_PRINCIPAL` | AMC 运营主理人 |
| `BRAND_OWNER` | 品牌经营者 |
| `BD` | 商务拓展 |

规则：

- 一个用户可以拥有多个角色。
- 权限取角色 Capability 的并集。
- AMC Agent 可以被显式授予任意角色，包括 `ADMIN`。
- 删除基于 `AgentPermission`、品牌数量或 Owner 数量推导角色的逻辑。
- 迁移完成后删除 `User.role` 的授权职责。

### 5.3 MarketingCrew 与 CrewMember

每个品牌对应一个 `MarketingCrew`，`CrewMember` 是唯一直接品牌权限关系。

建议字段：

```text
CrewMember
├── crewId
├── userId
├── role: OWNER | PRINCIPAL | EDITOR | VIEWER
├── active
├── source: DIRECT | MIGRATION
├── createdById
├── joinedAt
└── updatedAt
```

唯一约束：

```text
unique(crewId, userId)
```

逐步停止并删除以下授权关系：

- `BrandOwner`
- `BrandAgent`
- `AgentPermission`
- `Brand.ownerId` 的授权用途

### 5.4 组织继承

组织继承规则：

```text
直接访问：
用户是品牌的有效 CrewMember

继承访问：
用户属于某个 Organization
且该 Organization Owner 是品牌的有效 CrewMember
```

实现要求：

- 继承关系通过单次数据库查询计算。
- 不为组织继承重复创建 `CrewMember`，避免直接授权和继承授权互相覆盖。
- 用户退出组织后，继承权限立即失效。
- 若用户同时拥有直接 CrewMember，则退出组织不影响直接权限。

## 6. Capability 模型

第一阶段采用代码定义、类型安全的 Capability，不建立动态 RBAC 配置表。

建议初始清单：

```text
brand.read
brand.create
brand.update
brand.archive

asset.read
asset.create
asset.update
asset.archive

draft.read
draft.create
draft.update
draft.submit
draft.approve
draft.reject

content.schedule
content.publish
content.retry

review.read
review.reply

action_item.read
action_item.create
action_item.resolve

agent.manage
user.manage
subscription.manage
system.configure
work_log.read
```

授权由两个条件共同决定：

1. 用户全局角色是否具有目标 Capability。
2. 涉及品牌资源时，用户是否处于品牌数据范围内。

`ADMIN` 拥有全部 Capability 和全部品牌范围。AMC Agent 与人类 ADMIN 结果一致。

## 7. 统一认证授权架构

```text
Browser Cookie ─┐
REST API Key   ─┼─> authenticateRequest(request)
MCP API Key    ─┘             │
                               ▼
                         AuthPrincipal
                               │
                               ▼
               authorize(capability, brandId?)
                               │
                               ▼
                    Application Service
                         │             │
                         ▼             ▼
                      业务写入       工作日志
```

统一身份上下文：

```ts
type AuthPrincipal = {
  userId: string
  actorType: 'HUMAN' | 'AMC_AGENT'
  globalRoles: GlobalRole[]
  credentialId?: string
  authVersion: number
}
```

核心接口：

```ts
authenticateRequest(request)
requirePrincipal(request)
requireCapability(principal, capability, scope)
withAuth(policy, handler)
scopeBrandQuery(principal)
```

禁止事项：

- Route 内自行组合 `getSession()` 和 `getAgentFromApiKey()`。
- Route 内直接写 `role === 'ADMIN'`。
- Route 内根据 `type === 'AI_AGENT'` 拒绝或允许业务操作。
- MCP Tool 内再次解析 API Key。
- 业务服务内部重新读取 Cookie 或 Header。

## 8. Session 与密码

### 8.1 Session

Session JWT 仅保存必要 Claims：

```text
sub
type
authVersion
issuer
audience
iat
exp
```

API 请求会加载一次最新用户状态和显式角色，避免七天 Cookie 中的旧角色持续生效。

Proxy 只负责页面是否登录，不承担业务授权。

Cookie 必须设置：

```text
HttpOnly
Secure（生产）
SameSite=Lax
Path=/
```

### 8.2 登录流程

登录关键路径移除：

- 每次登录执行的全表 User count。
- 根据固定邮箱运行时自动提权。
- 角色动态推导。
- 与登录无关的同步业务写入。

用户不存在和密码错误统一返回 `401`，避免账号枚举。

### 8.3 Argon2id 迁移

- 新建和重置密码使用 Argon2id。
- 优先采用 `@node-rs/argon2`，部署前验证 Render Node 20 兼容性。
- 保留旧 bcrypt 校验器。
- 旧 bcrypt 用户成功登录后，在同次请求中生成 Argon2id Hash 并更新。
- Hash 参数通过基准测试校准，目标单次验证约 100–250ms。
- 密码升级失败不阻止本次合法登录，但必须记录安全告警。

## 9. API Key

目标字段：

```text
UserApiKey
├── id
├── userId
├── tokenHash
├── prefix
├── name
├── expiresAt
├── revokedAt
├── lastUsedAt
└── createdAt
```

规则：

- Token 创建时仅显示一次。
- 数据库仅保存 Hash 和可识别 Prefix。
- Key 直接绑定实际操作者，包括 AMC Agent。
- 验证必须检查用户状态、`expiresAt` 和 `revokedAt`。
- `lastUsedAt` 限频异步更新，不阻塞每次业务请求。
- 禁止创建新的 Human Key 委托 Agent。

### 9.1 旧 Key 兼容 24 小时

```text
T0：
- 发布 Agent 专属 UserApiKey。
- 开启 Auth V2。
- 旧 Human Key + x-agent-id 进入兼容模式。
- 每次旧调用记录 deprecation 日志。

T+24h：
- 禁止 x-agent-id 委托。
- 旧请求返回 legacy_credential_disabled。
- 保留紧急回滚开关，但默认不延长兼容期。
```

历史 Agent Key 可以在迁移时计算 Hash 并绑定到对应 AMC Agent，避免在日志或脚本中再次输出明文。

## 10. REST API 路由规范

所有 API Route 必须显式声明一种类型：

| 类型 | 用途 |
|---|---|
| `publicRoute` | 明确公开的只读或公共业务接口 |
| `authenticatedRoute` | 只要求有效用户 |
| `authorizedRoute` | 要求 Capability，可包含品牌范围 |
| `serviceRoute` | Cron、内部服务、MM 服务间调用 |
| `webhookRoute` | Stripe 等签名验证回调 |

建议路由写法：

```ts
export const POST = withAuth(
  {
    capability: 'draft.create',
    brandId: ({ params }) => params.id,
  },
  async ({ principal, brandId, request }) => {
    return draftService.create({ principal, brandId, input })
  }
)
```

CI 必须检查：

- 是否存在未声明访问类型的 Route。
- 是否仍直接调用旧认证函数。
- 是否仍直接判断角色或用户类型。
- 是否存在未保护的品牌资源接口。

## 11. MCP

MCP 入口只认证一次：

```ts
const principal = await authenticateRequest(request)
const server = createAmcMcpServer({ principal })
```

MCP Tool：

- 使用与 REST 相同的 Capability。
- 调用与网页相同的 Application Service。
- 不直接访问 Prisma 完成业务写入。
- 不解析 `x-agent-id`。
- 不查询 Agent Avatar、AgentPermission 或 BrandAgent。

`/api/brands/[id]/mcp/execute` 在第一批上线时关闭。若确认存在必要内部消费者，应改为 `serviceRoute`，使用独立的短期内部凭证和明确的 Tool allowlist。

## 12. 工作日志

所有人类和 AMC Agent 操作使用同一日志模型：

```text
actorId
actorType
action
resourceType
resourceId
brandId
workStage
result
metadata
createdAt
```

规则：

- `actorType` 仅用于区分人类和 AMC Agent。
- `resourceType` 必填，不再默认为 `WorkUnit`。
- 正常业务操作进入工作日志。
- 认证失败、越权和旧 Key 调用进入安全审计。
- 泳道分类只保留为 `workStage` 筛选，不形成任务或授权模型。

## 13. 数据库迁移

采用 Add → Backfill → Dual Read → Shadow → Cutover → Drop：

1. 增加 `User.status`、`User.authVersion`。
2. 扩展 `CrewMember` 的角色和状态字段。
3. 扩展 `UserApiKey` 的 Hash、过期和撤销字段。
4. 将所有有效全局角色回填到 `UserBusinessRole`。
5. 将 BrandOwner、BrandAgent、AgentPermission 的有效品牌关系回填到 CrewMember。
6. 将历史 Agent Key Hash 后绑定到实际 AMC Agent。
7. 新旧授权双读并比较结果。
8. Auth V2 开始决定权限。
9. 停止旧权限关系写入。
10. 稳定观察后删除旧字段和旧表。

迁移必须具备：

- 可重复执行。
- Dry Run。
- 迁移前后数量对账。
- 冲突清单输出。
- 不在第一版 Migration 中 Drop 旧表。

## 14. 性能与可观测性

指标：

```text
auth.authenticate.duration
auth.authorize.duration
auth.db_query_count
auth.denied.count
auth.shadow_mismatch.count
auth.legacy_key.count
auth.key_expired.count
auth.key_revoked.count
```

要求：

- 使用结构化日志，不记录 Cookie、API Key 或密码。
- 开发和测试环境提供 `Server-Timing`。
- 建立 Session、API Key、品牌授权、MCP 四组基线。
- 第一阶段不增加跨实例缓存。
- 如果完成单查询收敛后仍未达到目标，再评估短 TTL 缓存。

## 15. 测试矩阵

### 15.1 单元测试

- 角色到 Capability 映射。
- 多角色权限并集。
- CrewMember 品牌范围。
- 组织继承。
- 人类和 AMC Agent 同角色结果一致。
- API Key 有效、过期、撤销。
- 禁用用户和 authVersion 失效。
- bcrypt 到 Argon2id 渐进升级。

### 15.2 集成测试

每项业务至少覆盖：

| 身份 | 同品牌 | 跨品牌 | 无 Capability | 禁用/过期 |
|---|---:|---:|---:|---:|
| 人类 Session | 允许 | 拒绝 | 拒绝 | 拒绝 |
| AMC Agent Key | 允许 | 拒绝 | 拒绝 | 拒绝 |
| ADMIN Session | 允许 | 允许 | 不适用 | 拒绝 |
| ADMIN Agent Key | 允许 | 允许 | 不适用 | 拒绝 |

### 15.3 一致性测试

同一操作分别通过网页 REST、外部 REST 和 MCP 调用，验证：

- 权限结果一致。
- 业务结果一致。
- 工作日志一致。
- 错误码一致。

### 15.4 静态检查

- 每个 Route 已声明访问类型。
- 无旧认证函数新增引用。
- 无 Route 内直接角色判断。
- 无 API Key、密码、Session Secret 泄漏。

## 16. 分阶段执行计划

### PR 1：安全基线与观测

交付：

- 关闭 `/api/brands/[id]/mcp/execute`。
- API Key 过期检查补齐。
- 鉴权耗时和查询次数基线。
- Route 访问类型盘点清单。

退出条件：

- 已获得生产 P50/P95 和查询次数。
- 已确认所有公开、服务和 Webhook 例外。

### PR 2：Auth V2 Core

新增建议目录：

```text
src/lib/auth-v2/
├── types.ts
├── session.ts
├── api-key.ts
├── authenticate.ts
├── capabilities.ts
├── authorize.ts
├── brand-scope.ts
├── route.ts
├── errors.ts
└── metrics.ts
```

退出条件：

- 单元测试完整。
- 不改变现有路由结果。

### PR 3：用户、Crew 与 Key Schema

交付：

- Add-only Prisma Migration。
- Backfill/Dry Run 脚本。
- 数据对账报告。
- Auth V2 双读。

退出条件：

- 数据迁移无未解释冲突。
- 旧逻辑仍可完整回滚。

### PR 4：登录、Session 与 Argon2id

交付：

- 登录关键路径优化。
- 显式角色加载。
- authVersion。
- Argon2id 新 Hash。
- bcrypt 登录后自动升级。

退出条件：

- 登录性能达标。
- 旧账号无需重置密码。

### PR 5：品牌与 Admin API

迁移：

- Auth、Profile、Admin。
- Brand、Crew、Organization。
- Subscription。
- Dashboard。

退出条件：

- 新旧授权 Shadow 差异为零或均有明确解释。

### PR 6：内容业务 API

迁移：

- Assets。
- Drafts。
- Publish/Schedule。
- Reviews。
- Action Items。
- Integrations。

退出条件：

- 跨品牌防越权测试通过。
- 人类与 AMC Agent 操作结果一致。

### PR 7：MCP 与外部 API

交付：

- MCP 使用 AuthPrincipal。
- MCP Tool 与 REST 共用业务服务。
- Agent 专属 UserApiKey。
- 开始 24 小时兼容窗口。

退出条件：

- 外部 Agent 全部拿到新 Key。
- 旧模式调用方有明确清单。

### PR 8：切断旧委托和旧授权

交付：

- T+24h 禁止 `x-agent-id`。
- 停止 BrandOwner、BrandAgent、AgentPermission 授权读取和写入。
- 删除动态角色推导。

退出条件：

- 旧 Key 调用数为零。
- 新权限错误率正常。

### PR 9：清理与文档

交付：

- 删除旧 auth、permissions、brandAccess 重复文件。
- 删除旧表和字段的独立 Migration。
- 更新 OpenAPI、MCP、Q&A、SOP、Skill、Connect 页面。
- 更新权限测试和运维手册。

## 17. 发布开关与回滚

建议开关：

```text
AUTH_V2_SHADOW=true
AUTH_V2_ENFORCE=false
AUTH_V2_LEGACY_KEYS=true
```

Shadow 阶段：

- 旧权限决定响应。
- 新权限同步计算。
- 只记录差异。

Cutover：

```text
AUTH_V2_ENFORCE=true
```

回滚：

- Auth V2 发生问题时关闭 Enforce。
- 不回滚 Add-only Schema。
- 不在稳定期前 Drop 旧表。
- 24 小时 Key 兼容结束后，仅在生产事故下短时开启紧急开关。

## 18. Definition of Done

- 所有角色均为显式配置。
- CrewMember 是唯一直接品牌权限关系。
- 组织继承行为正确且单次查询完成。
- 人类和 AMC Agent 使用相同授权函数。
- AMC Agent ADMIN 与人类 ADMIN 权限一致。
- API Key 不以明文存储。
- `expiresAt`、`revokedAt`、用户状态和 authVersion 全部生效。
- 所有 Route 都有明确访问类型。
- 同一业务在网页、REST 和 MCP 权限一致。
- 所有写操作进入统一工作日志。
- 鉴权 P95 至少降低 50%。
- `/api/auth/me` 只执行一次主查询。
- 旧 `x-agent-id` 在 T+24h 后不可用。
- 旧权限表删除前完成数据对账和稳定观察。
- Q&A、SOP、OpenAPI、MCP Skill 与代码一致。

## 19. 执行准备清单

开发开始前必须完成：

- [ ] 确认生产发布时间 T0 和 24 小时截止时间。
- [ ] 导出当前 User、角色、Crew、BrandOwner、BrandAgent、AgentPermission 数量。
- [ ] 盘点所有生产 Agent 和当前 Key 使用方。
- [ ] 建立 167 个 API Route 的访问类型与 Capability 清单。
- [ ] 确认公开接口、Webhook、Cron、MM 内部调用例外。
- [ ] 建立鉴权 P50/P95 和每请求查询次数基线。
- [ ] 验证 `@node-rs/argon2` 在本地、CI、Render Node 20 环境可安装运行。
- [ ] 准备 API Key 安全轮换通知和操作手册。
- [ ] 准备 Shadow mismatch 查询和告警。
- [ ] 准备数据库迁移 Dry Run 与回滚演练。
- [ ] 为每个 PR 指定负责人和 Reviewer。
- [ ] 得到明确的“开始开发”批准。

在最后一项完成前，本 PRD 只作为执行准备，不授权功能开发。

## 20. 当前代码基线

本 PRD 制定时的只读代码盘点结果：

| 项目 | 当前数量或现状 |
|---|---|
| API Route | 167 个 |
| 直接读取 Session 的 Route | 约 134 个 |
| 自行处理 Agent API Key 的 Route | 约 48 个 |
| 自定义 `getActor` / `ensureAccess` 等 Helper | 15 个 Route |
| 直接判断 `role` / `type` 的 Route | 约 95 个 |
| 使用旧品牌权限关系的代码文件 | 约 53 个 |
| `/api/auth/me` 权限相关查询 | User 查询 + 3 次统计 |
| 普通品牌访问 | 最多 4–5 次串行查询 |
| Agent Key 解析 | 明文、Hash、JWT 多级 fallback |
| MCP 身份解析 | MCP 入口和 Tool 内部重复执行 |

以上数字用于确定改造范围。开发开始前应由自动化盘点脚本重新生成一次，避免后续提交导致基线漂移。

## 21. 文件级执行范围

### 21.1 新增

```text
src/lib/auth-v2/types.ts
src/lib/auth-v2/session.ts
src/lib/auth-v2/api-key.ts
src/lib/auth-v2/authenticate.ts
src/lib/auth-v2/capabilities.ts
src/lib/auth-v2/authorize.ts
src/lib/auth-v2/brand-scope.ts
src/lib/auth-v2/route.ts
src/lib/auth-v2/errors.ts
src/lib/auth-v2/metrics.ts

scripts/audit-route-auth.mjs
scripts/migrate-auth-v2.mts
scripts/benchmark-auth.mts
scripts/test-auth-v2.mts
```

`auth-v2` 是迁移期目录。旧实现删除后，应将其收敛为 `src/lib/auth/`，避免长期保留版本号。

### 21.2 第一批修改

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_add_auth_v2/

src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/me/route.ts
src/proxy.ts

src/app/api/mcp/route.ts
src/app/api/brands/[id]/mcp/execute/route.ts
src/lib/partner/mcp/server.ts

src/lib/audit.ts
src/lib/userRoles.ts
src/lib/amcOperator.ts
```

### 21.3 迁移期保留、最终删除或合并

```text
src/lib/auth.ts
src/lib/user-management/auth.ts
src/lib/brandAccess.ts
src/lib/user-management/brandAccess.ts
src/lib/permissions.ts
src/lib/user-management/permissions.ts
src/lib/agentAdmin.ts
scripts/migrate-crew-auth.mts
```

删除条件：

- 所有 Route 已迁移到 Auth V2。
- MCP 不再引用旧认证函数。
- Shadow mismatch 已清零。
- 旧 Key 兼容窗口已经结束。
- 文档和测试不再引用旧模型。

### 21.4 文档同步

```text
docs/prd_amc.md
docs/API_SERVICES.md
docs/AGENT_CONNECTIVITY.md
README.md
skills/kanban-openapi.yaml
skills/amc-kanban/SKILL.md
src/lib/agentInitPrompt.ts
src/app/connect/page.tsx
```

文档必须与对应功能 PR 同步提交，不允许最后一次性补文档。

## 22. 风险登记

| 风险 | 等级 | 处理 |
|---|---|---|
| Crew 回填遗漏导致用户失去品牌访问 | P0 | Dry Run、数量对账、Shadow 双读、可回滚 |
| 旧 Agent 未在 24 小时内更新 Key | P0 | T0 前完成调用方清单和新 Key 分发 |
| ADMIN Agent 权限扩大后误操作 | P0 | 与人类 ADMIN 使用相同显式授权和完整工作日志 |
| Route 漏迁移造成未鉴权访问 | P0 | Route 类型静态检查作为 CI 阻断项 |
| Argon2 原生依赖无法在 Render 安装 | P1 | 开发前验证 Node 20 构建；失败则暂停密码 PR |
| Session 角色缓存导致撤权不及时 | P1 | API 每请求加载最新状态、角色和 authVersion |
| 组织继承查询仍然缓慢 | P1 | 单查询基线；达不到目标后再考虑物化 |
| Shadow 新旧结果不一致 | P1 | 不进入 Enforce，逐条解释并修复 |
| 工作日志写入影响主流程 | P2 | 结构化异步写入、失败告警，不静默丢失 |

## 23. 开发启动门

只有同时满足以下条件，才允许从文档准备进入功能开发：

1. 本 PRD 获得产品负责人确认。
2. PR 1 的范围、负责人和 Reviewer 已指定。
3. 生产 Agent 与 API Key 使用方清单完整。
4. T0 与 T+24h 的具体时间已确定。
5. 数据库备份、Dry Run 和回滚责任人已确定。
6. `/api/brands/[id]/mcp/execute` 的消费者盘点完成。
7. 性能基线采集方式已确认。
8. 明确收到“开始开发”的指令。

当前状态：前七项待执行，第八项未授权，因此不得开始功能开发。
