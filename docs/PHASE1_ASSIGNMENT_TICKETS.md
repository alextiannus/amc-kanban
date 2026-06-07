# Phase 1 Agent 分配池执行 Tickets（可直接入迭代）

更新时间：2026-06-07
来源文档：
- docs/PHASE1_USE_CASES.md
- docs/PHASE1_AGENT_ASSIGNMENT_POOL_PRD.md

## Milestone A：后端基础能力（P0）

0. TKT-A0 ADMIN 身份映射校验
- 优先级：P0
- 范围：确认 HUMAN + role=ADMIN 默认视为 AMC 主理人（存量账号与新增账号）
- 验收标准：
  - 存量 ADMIN 账号无需额外配置即可访问主理人功能
  - 新增 ADMIN 账号自动具备主理人能力
  - 权限校验代码与文档一致（不引入额外 operatorRole 字段）

1. TKT-A1 新增分配池数据模型
- 优先级：P0
- 范围：AssignmentPoolConfig / AssignmentPoolMember / AssignmentDecisionLog /（可选）IdempotencyRecord
- 验收标准：
  - Prisma migration 可执行
  - 模型字段覆盖 PRD 约定
  - 支持查询 currentLoad

2. TKT-A2 全局配置 API
- 优先级：P0
- 范围：GET/PATCH /api/admin/agent-assignment-pool/config
- 验收标准：
  - 仅 ADMIN 可访问
  - 支持 enabled / overflowPolicy / rebalancePolicy / fallbackAgentId / matchingOrder
  - 写入 AuditLog

3. TKT-A3 池成员 API
- 优先级：P0
- 范围：GET/POST/PATCH/DELETE /api/admin/agent-assignment-pool/members
- 验收标准：
  - 支持 active/capacity/priority/industries/regions
  - DELETE 仅移除池成员，不删除 Agent
  - 列表可筛选 overloaded

4. TKT-A4 分配执行 API
- 优先级：P0
- 范围：POST /api/agent-assignment/resolve（dryRun + commit）
- 验收标准：
  - 支持 subjectType=user_register|brand_create|manual_reassign
  - 返回 selectedAgentId / matchedBy / decisionId
  - 失败返回标准错误码

5. TKT-A5 决策日志查询 API
- 优先级：P1
- 范围：GET /api/admin/agent-assignment/decisions
- 验收标准：
  - 支持 subjectType/agentId/matchedBy/from/to 筛选
  - 支持分页

## Milestone B：流程接入与幂等（P0）

6. TKT-B1 注册流程接入自动分配
- 优先级：P0
- 范围：POST /api/auth/register
- 验收标准：
  - 用户创建成功后触发 resolve（user_register）
  - 失败按 overflow/fallback 规则处理
  - 决策日志可追踪

7. TKT-B2 建牌流程接入自动分配
- 优先级：P0
- 范围：POST /api/brands
- 验收标准：
  - 品牌创建 + owner 绑定后触发 resolve（brand_create）
  - 自动创建 BrandAgent 绑定（active=true）
  - 幂等重试不重复绑同一关系

8. TKT-B3 resolve 幂等支持
- 优先级：P0
- 范围：X-Idempotency-Key 与冲突校验
- 验收标准：
  - 同 key 重试返回同一 decisionId
  - 同 key 参数冲突返回 409 IDEMPOTENCY_KEY_CONFLICT
  - 幂等窗口 24h

9. TKT-B4 并发与事务一致性
- 优先级：P0
- 范围：capacity 原子校验、日志与绑定同事务提交
- 验收标准：
  - 无半状态写入
  - 并发压测不出现超配异常（除 allow_soft_overflow）
  - allow_soft_overflow 时写入 overflowHandled

## Milestone C：管理端 UI（P1）

10. TKT-C1 分配池配置页面
- 优先级：P1
- 范围：admin 页面新增 assignment pool 配置区
- 验收标准：
  - 可编辑并保存全局配置
  - 保存失败可见错误提示
  - 配置更新后即时刷新

11. TKT-C2 分配池成员页面
- 优先级：P1
- 范围：列表 + 编辑弹窗
- 验收标准：
  - 可新增/编辑/移除池成员
  - 展示 currentLoad/availableSlots
  - 超载成员高亮

12. TKT-C3 决策日志页面
- 优先级：P2
- 范围：日志查询与详情抽屉
- 验收标准：
  - 支持条件筛选
  - 支持失败记录高亮
  - 可追溯 matchedBy 与 reason

## Milestone D：Dify 编排接入（P1）

13. TKT-D1 注册后 workflow
- 优先级：P1
- 范围：注册成功事件 -> 调用 resolve -> 回写绑定
- 验收标准：
  - 事件可重试
  - 与 API 幂等一致

14. TKT-D2 建牌后 workflow
- 优先级：P1
- 范围：建牌成功事件 -> 调用 resolve -> 触发品牌初始化任务
- 验收标准：
  - Agent 绑定与初始化任务一致
  - 失败触发人工兜底任务

15. TKT-D3 告警与兜底 workflow
- 优先级：P2
- 范围：resolve 失败 -> Lark/邮件告警 -> pending_queue
- 验收标准：
  - 告警可观测
  - 人工处理可闭环

## 测试包（必须）

0. TEST-0 ADMIN 主理人映射测试
- 验证 HUMAN + role=ADMIN 用户默认具备 AMC 主理人权限。
- 验证存量 ADMIN 与新增 ADMIN 行为一致。

1. TEST-1 枚举兼容测试
- 验证 overflowPolicy/rebalancePolicy/matchingOrder 枚举合法性。

2. TEST-2 路由命中测试
- 行业命中、地区命中、双命中排序、未命中 fallback。

3. TEST-3 权限测试
- 非 ADMIN 无法修改分配池。

4. TEST-4 幂等测试
- 重复请求一致返回；冲突请求 409。

5. TEST-5 软删除隔离测试
- 软删除 Agent 不参与分配；软删除 Brand 不触发新分配。

## 建议迭代顺序

1. Sprint 1：A1-A4 + B3
2. Sprint 2：B1-B2-B4 + A5
3. Sprint 3：C1-C2 + D1-D2
4. Sprint 4：C3 + D3 + 全量回归
