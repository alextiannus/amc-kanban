# Phase 1 E2E 验证清单（Assignment Pool + 主理人映射）

更新时间：2026-06-07
适用范围：Phase 1 自动分配能力与 ADMIN=AMC 主理人映射

## 1. 环境准备

1. 确保数据库已同步：
- `npx prisma db push --accept-data-loss`

2. 确保至少存在 1 个 AI_AGENT 用户。

3. 确保可访问 Admin 页面：
- `/admin`

## 2. 自动化测试命令

1. 类型与构建
- `npx tsc --noEmit`
- `npm run build`

2. Assignment 基础 smoke
- `npm run test:assignment-pool`

3. Assignment 端到端流程
- `npm run test:assignment-flow`

4. 现有项目脚本回归
- `npm run test:execution`

## 3. 关键业务场景

1. ADMIN 身份映射
- 前置：使用 ADMIN 人类账号登录
- 期望：可访问分配池配置、成员管理、日志页面与接口

2. 分配池配置
- 修改 enabled / overflowPolicy / rebalancePolicy / matchingOrder / fallbackAgentId
- 期望：保存成功并可刷新读取

3. 分配池成员管理
- 新增成员、修改 active/capacity/priority、移除成员
- 期望：列表 currentLoad/availableSlots 正确变化

4. 注册触发分配
- 调用 `/api/auth/register`
- 期望：写入 `AgentPermission`，生成 `AssignmentDecisionLog`

5. 建牌触发分配
- 调用 `/api/brands` 创建品牌
- 期望：写入 `BrandAgent(active=true)`，生成 `AssignmentDecisionLog`

6. 幂等验证
- 对同一 subject 使用相同 `X-Idempotency-Key` 调用 `/api/agent-assignment/resolve`
- 期望：返回相同 decisionId
- 冲突参数时：返回 `409 IDEMPOTENCY_KEY_CONFLICT`

7. 软删除边界
- 软删除 Agent 后不应再被分配
- 归档 Brand 不应触发新分配

## 4. 观测点

1. 审计日志 `AuditLog`
- `ASSIGNMENT_POOL_CONFIG_UPDATED`
- `ASSIGNMENT_POOL_MEMBER_CREATED/UPDATED/DELETED`
- `AGENT_ASSIGNMENT_RESOLVED`（admin触发）

2. 分配日志 `AssignmentDecisionLog`
- `subjectType`
- `matchedBy`
- `selectedAgentId`
- `overflowHandled` / `fallbackUsed`

## 5. 已知非业务阻塞

1. 当前环境 `npm run lint` 可能因 ESLint 依赖冲突失败（`@humanfs/*`）。
2. 该问题不影响 TypeScript 编译、构建与 Assignment 业务链路验证。
