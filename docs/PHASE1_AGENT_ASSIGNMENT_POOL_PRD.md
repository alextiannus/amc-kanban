# Phase 1 Agent 自动分配池 PRD 与 API 草案

更新时间：2026-06-07
状态：Draft v1.1（字段与规则冻结候选）

## 1. 目标

在 Phase 1 内交付可运营的 Agent 自动分配能力，满足以下业务决策：
1. 支持 Admin 管理 Agent 分配池。
2. 自动分配规则采用 capacity + priority + overflowPolicy + rebalancePolicy。
3. 无邀请码注册时，先按行业/地区路由，再回退到平台默认 Agent。
4. 品牌支持多个 owner/collaborator，支持多个 Agent 协作。
5. 品牌与 Agent 删除语义采用软删除。
6. 现有与新增 ADMIN 人类用户默认同时具备 AMC 主理人身份。

## 1.1 权限映射（已确认）

1. 身份映射
- HUMAN + role=ADMIN => AMC 主理人。
- ADMIN 不需要额外 Operator 开通步骤。

2. 能力边界
- 分配池管理、手工重分配、决策日志查询均以 ADMIN 作为权限门槛。
- 主理人业务能力与系统管理能力并存，不做拆分。

3. 上线要求
- 发布前需校验存量 ADMIN 账号可直接访问主理人相关页面与接口。
- 不新增独立数据库角色字段，仅采用既有 role=ADMIN 判定。

## 2. 核心对象

1. AssignmentPoolConfig（全局配置）
- enabled: 是否启用自动分配
- overflowPolicy: 池满时策略
- rebalancePolicy: 重平衡策略
- fallbackAgentId: 平台默认兜底 Agent
- matchingOrder: 路由匹配顺序（industry_first / region_first）

2. AssignmentPoolMember（池成员）
- agentId
- active: 是否参与分配
- capacity: 最大服务品牌数（默认 30）
- priority: 分配优先级（数值越大优先）
- industries: 支持行业标签数组
- regions: 支持地区标签数组
- currentLoad: 当前已服务品牌数（只读计算）

3. AssignmentDecisionLog（分配决策日志）
- decisionId
- subjectType: user_register / brand_create / manual_reassign
- subjectId
- requestedIndustry
- requestedRegion
- matchedBy: industry / region / fallback
- selectedAgentId
- reason
- createdBy（system 或 admin）
- createdAt

## 3. 分配算法（Phase 1）

输入：
- industry
- region
- referenceCode（可选）
- brandId 或 userId

流程：
1. 若有 referenceCode：优先在指定主理人的分配池内选取可用 Agent。
2. 若无 referenceCode：
- 步骤 A：按 matchingOrder 做行业/地区匹配，筛出 active 且未超 capacity 的成员。
- 步骤 B：按 priority 降序，其次按 currentLoad 升序排序。
- 步骤 C：选择第一名。
3. 若无可用匹配：按 overflowPolicy 执行。
4. 若仍无结果：回退 fallbackAgentId。
5. 写入 AssignmentDecisionLog。

## 4. overflowPolicy 与 rebalancePolicy

1. overflowPolicy（Phase 1 建议值）
- pending_queue: 进入待分配队列，等待 Admin 处理
- fallback_only: 忽略匹配，直接使用 fallbackAgentId
- allow_soft_overflow: 允许超出 capacity 的最小超载分配

默认建议：fallback_only（先保证体验闭环）

2. rebalancePolicy（Phase 1 建议值）
- manual_only: 仅 Admin 手动触发重平衡
- scheduled_daily: 每日定时建议重平衡（仅生成建议，不自动执行）

默认建议：manual_only

## 5. 管理端能力（Admin）

1. 全局配置管理
- 开关自动分配
- 维护 fallback Agent
- 维护 matchingOrder
- 设置 overflowPolicy 与 rebalancePolicy

2. 分配池成员管理
- 启用/停用池成员
- 设置 capacity 与 priority
- 设置行业/地区标签
- 查看 currentLoad 与超载状态

3. 决策可观测
- 查看分配决策日志
- 按 industry、region、matchedBy、agentId 筛选
- 失败分配告警

## 6. API 草案

## 6.1 Admin 配置接口

1. GET /api/admin/agent-assignment-pool/config
- 说明：读取全局分配配置
- 权限：ADMIN

响应字段：
- enabled
- overflowPolicy
- rebalancePolicy
- fallbackAgentId
- matchingOrder
- updatedAt
- updatedBy

2. PATCH /api/admin/agent-assignment-pool/config
- 说明：更新全局分配配置
- 权限：ADMIN

请求字段：
- enabled（可选）
- overflowPolicy（可选）
- rebalancePolicy（可选）
- fallbackAgentId（可选）
- matchingOrder（可选）

## 6.2 Admin 池成员接口

1. GET /api/admin/agent-assignment-pool/members
- 说明：查询池成员列表
- 权限：ADMIN
- 支持参数：active, industry, region, overloaded

响应字段（单条）：
- agentId
- agentNickname
- active
- capacity
- priority
- industries
- regions
- currentLoad
- availableSlots
- updatedAt

2. POST /api/admin/agent-assignment-pool/members
- 说明：新增池成员
- 权限：ADMIN

请求字段：
- agentId
- active
- capacity
- priority
- industries
- regions

3. PATCH /api/admin/agent-assignment-pool/members/:agentId
- 说明：更新池成员配置
- 权限：ADMIN

请求字段：
- active（可选）
- capacity（可选）
- priority（可选）
- industries（可选）
- regions（可选）

4. DELETE /api/admin/agent-assignment-pool/members/:agentId
- 说明：从分配池移除成员（不删除 Agent 实体）
- 权限：ADMIN

## 6.3 分配执行接口

1. POST /api/agent-assignment/resolve
- 说明：根据输入上下文解析目标 Agent（支持预览与正式写入）
- 权限：SYSTEM / ADMIN

请求字段：
- subjectType: user_register / brand_create / manual_reassign
- subjectId
- industry（可选）
- region（可选）
- referenceCode（可选）
- dryRun（可选，默认 false）

响应字段：
- selectedAgentId
- matchedBy
- reason
- overflowHandled
- fallbackUsed
- decisionId（dryRun 时可为空）

2. GET /api/admin/agent-assignment/decisions
- 说明：查询分配决策日志
- 权限：ADMIN
- 支持参数：subjectType, agentId, matchedBy, from, to

## 7. 错误码草案

1. ASSIGNMENT_POOL_DISABLED
2. FALLBACK_AGENT_NOT_CONFIGURED
3. NO_ELIGIBLE_AGENT
4. AGENT_NOT_IN_POOL
5. AGENT_SOFT_DELETED
6. INVALID_ROUTING_TAG
7. PERMISSION_DENIED

## 7.1 枚举冻结（Phase 1）

1. overflowPolicy
- fallback_only
- pending_queue
- allow_soft_overflow

2. rebalancePolicy
- manual_only
- scheduled_daily

3. matchingOrder
- industry_first
- region_first

4. subjectType
- user_register
- brand_create
- manual_reassign

5. matchedBy
- industry
- region
- fallback
- reference_code

6. createdBy
- system
- admin

7. active 状态约束
- AssignmentPoolMember.active: true | false
- Agent 软删除后强制视为不可分配

## 8. 数据与审计要求

1. 所有配置变更写入 AuditLog。
2. 所有分配决策写入 AssignmentDecisionLog。
3. 软删除 Agent 不得参与分配。
4. 软删除 Brand 不得触发新分配。

## 9. Phase 1 验收补充

1. Admin 可独立完成分配池全流程管理（配置 + 成员 + 观察日志）。
2. 无邀请码用户注册可走行业/地区路由，未命中可稳定回退到 fallback Agent。
3. 高并发注册下不出现超配异常（允许 soft overflow 时需明确记录）。
4. 分配失败可观测、可告警、可人工兜底。

## 10. 实施建议（最小可交付）

1. 先交付配置与成员管理 API。
2. 再接入注册与建牌流程中的 resolve 调用。
3. 最后补齐决策日志查询页与失败告警。

## 11. 触发点与幂等规则（冻结候选）

## 11.1 触发点

1. 用户注册触发（主触发）
- 路由：POST /api/auth/register
- 触发时机：用户创建成功后、响应返回前
- 动作：调用 POST /api/agent-assignment/resolve（subjectType=user_register）
- 结果写入：
	- 决策日志 AssignmentDecisionLog
	- 首个 Agent 绑定关系（BrandAgent 或待分配队列，根据业务流程）

2. 品牌创建触发（主触发）
- 路由：POST /api/brands
- 触发时机：品牌创建并完成 owner 绑定后
- 动作：调用 POST /api/agent-assignment/resolve（subjectType=brand_create）
- 结果写入：品牌-Agent 绑定（active=true）

3. 管理员手动重分配触发（人工触发）
- 路由：POST /api/agent-assignment/resolve（subjectType=manual_reassign）
- 触发时机：Admin 在管理端执行“重新分配”
- 结果写入：
	- 新增/更新 BrandAgent 绑定
	- 决策日志
	- 审计日志（含操作人）

## 11.2 幂等规则

1. 所有 resolve 正式调用必须支持幂等键
- 请求头：X-Idempotency-Key
- 幂等窗口：24 小时
- 唯一键建议：subjectType + subjectId + X-Idempotency-Key

2. 幂等行为
- 首次成功：写入决策日志并返回 decisionId
- 重复请求：返回首次结果（selectedAgentId / decisionId 保持一致）
- 参数冲突（同幂等键不同参数）：返回 409 IDEMPOTENCY_KEY_CONFLICT

3. 事务边界
- 决策日志写入与绑定写入必须在同一事务提交
- 提交失败不得产生“仅写日志未绑定”或“仅绑定未写日志”的半状态

4. 并发保护
- 对 AssignmentPoolMember 采用事务内负载校验
- capacity 校验与 currentLoad 递增必须原子化
- allow_soft_overflow 时需记录 overflowHandled=true 和超载幅度

## 11.3 回退与补偿

1. resolve 失败时
- 返回可观测错误码
- 记录失败决策日志（selectedAgentId 可为空）

2. fallbackAgentId 不可用时
- 不做静默吞错
- 返回 FALLBACK_AGENT_NOT_CONFIGURED 或 AGENT_SOFT_DELETED
- 自动进入 pending_queue（若 overflowPolicy 允许）

## 12. 开发任务拆分（后端 / 前端 / Dify）

## 12.1 后端任务

1. 数据模型
- 新增 AssignmentPoolConfig（单例）
- 新增 AssignmentPoolMember
- 新增 AssignmentDecisionLog
- 新增 IdempotencyRecord（若现有系统未统一支持）

2. API 实现
- 实现 /api/admin/agent-assignment-pool/config 的 GET/PATCH
- 实现 /api/admin/agent-assignment-pool/members 的 GET/POST/PATCH/DELETE
- 实现 /api/agent-assignment/resolve（dryRun + 正式写入）
- 实现 /api/admin/agent-assignment/decisions 查询

3. 流程接入
- 在 POST /api/auth/register 中接入 resolve（user_register）
- 在 POST /api/brands 中接入 resolve（brand_create）
- 接入失败补偿：pending_queue 或 fallback

4. 安全与审计
- 所有 admin 接口强制 ADMIN 权限
- 配置与手工重分配写入 AuditLog
- 决策全量写入 AssignmentDecisionLog

5. 测试
- 单元测试：排序与匹配算法
- 集成测试：注册/建牌触发、幂等、并发、回退
- 权限测试：非 ADMIN 禁止改池

## 12.2 前端任务

1. Admin 分配池页面
- 全局配置卡片（enabled、overflowPolicy、rebalancePolicy、fallbackAgentId、matchingOrder）
- 池成员列表（capacity、priority、industries、regions、currentLoad）
- 成员编辑弹窗（启停、容量、优先级、标签）

2. 决策日志页面
- 日志列表 + 多条件筛选
- 失败高亮与重试入口
- 详情抽屉展示 reason、matchedBy、fallbackUsed

3. 品牌详情页增强
- 展示“当前分配 Agent 来源”（industry/region/fallback/reference_code）
- 提供 Admin 可见“手动重分配”入口

## 12.3 Dify 工作流任务

1. 注册后编排
- 注册成功事件触发 Dify workflow，调用 resolve 并回写绑定结果

2. 建牌后编排
- 建牌成功事件触发 Dify workflow，确保品牌初始化任务与 Agent 绑定一致

3. 异常兜底编排
- resolve 失败触发告警流程（Lark/邮件）
- pending_queue 触发人工处理任务创建

4. 上下文联动
- Agent 分配完成后，触发初始化上下文任务（brandcontext 初始化）

## 13. 开发冻结建议（本轮评审通过后生效）

1. 冻结第 7.1 节所有枚举值，不在 Phase 1 中途变更。
2. 冻结第 11 节触发点与幂等语义。
3. 允许第 12 节 UI 样式微调，但不改 API 结构。

## 14. 执行清单

可直接用于迭代排期与任务分配：
- [docs/PHASE1_ASSIGNMENT_TICKETS.md](docs/PHASE1_ASSIGNMENT_TICKETS.md)
