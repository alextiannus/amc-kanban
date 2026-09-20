# 品牌运营看板发布验证

状态：已部署。应用提交 `9c8fc4ef9305de5c100e6e38a0c2f0fe398d5894`。

- 服务：Render `amc-kanban-sg`（`srv-d94hhbt7vvec73dk7uig`）。
- 部署：`dep-danvo8cs728c73b75ggg`，2026-09-20 15:33:30 UTC 完成，状态 `live`。
- 入口：[主理人 → 品牌运营看板](https://amc-kanban.immedi.ai/board?tab=managementOverview)。
- 本次发布没有新增数据库迁移。原工作区独立的 PostFast key 回池改动没有包含在该提交。

## 审查修复

1. **P2：无请求时限导致界面永久等待。** 列表和保存请求现有 15 秒时限，涵盖响应正文读取。保存超时或结果不确定后要求刷新确认现状，防止盲目重复变更；409 版本冲突同样要求刷新。
2. **P2：失败后筛选显示与查询不一致。** 加载失败不再清空主理人筛选选项；选中的人选因归属变化不再出现在当前结果时仍保留可见选项。

## 验证结果

- 隔离发布目录的 `npm run build`（Next.js 16.2.9 Turbopack）、TypeScript、新文件 ESLint、Git diff 检查通过。
- `test:brand-operations`：月初/跨年时区边界、续约待激活选择、品牌范围、分页、管理员限制、OWNER 保护、过期版本拒绝及 PostgreSQL 事务回滚通过；增加请求超时、缓慢响应正文、结果不确定与 409/400 行为测试。
- 菜单分组、有效权限菜单、32 组权限总览组合回归通过；API 文档清单一致性通过。
- `scripts/test-brand-operations-ui.mjs` 在模拟 API 下验证桌面/手机、保存请求、空结果、失败重试、筛选保留、弹窗 Escape 和普通主理人只读；浏览器无运行时错误。
- 上线后正式域名首页返回 200；GET /api/brand-operations 与 PATCH /api/brand-operations/deployment-check/principal 在无会话时均返回 401、JSON、Cache-Control: no-store。

生产检查未执行真实品牌主理人变更；实际业务修改仍由管理员在页面中进行。生产认证后的完整品牌查询没有作为本次自动化冒烟测试执行，授权与数据聚合验证来自本地服务测试及模拟界面测试。

本记录与 PRD 状态更新是纯文档提交，使用 Render 支持的 `[skip render]` 提交标记，避免重复部署相同应用代码：[Render 部署文档](https://render.com/docs/deploys#skipping-an-auto-deploy)。
