# 全局文本模型部署与切换

代码已实现，生产策略尚未启用。

## 部署

生产记录（2026-09-15）：本次 SQL 已在提供的生产数据库执行，策略版本 0、enabled=false。该数据库无需重复执行步骤 1；其他环境仍按下述步骤部署。

1. 备份数据库，在 Kanban 发布目录执行本次 SQL（只执行一次）：

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f prisma/migrations/20260915160000_global_text_policy/migration.sql
   npx prisma migrate resolve --applied 20260915160000_global_text_policy
   ```

   手工执行 SQL 后必须用 `migrate resolve --applied` 同步 Prisma 记录，否则下次部署会重复建表。初始版本为 0、`enabled=false`。不要以 `db push` 代替 SQL，后者不会创建保护触发器和初始策略。若使用完整 Prisma migration 流程，先确认历史迁移与生产一致，再执行 `prisma migrate deploy`；不要重复执行两种流程。生产数据库已于 2026-09-15 补齐 applied 记录，`migrate status` 确认 up to date。

2. 发布 Kanban，然后发布 Content、MM。环境变量如下：

   | 服务 | 必需配置 |
   | --- | --- |
   | Kanban | `DATABASE_URL`、`JWT_SECRET`、`CONTENT_SERVICE_INTERNAL_TOKEN`、`AMC_CONTENT_SERVICE_URL`、`AMC_MM_SERVICE_URL`（默认 `https://amc-mm.immedi.ai`） |
   | Content | `AMC_KANBAN_INTERNAL_URL`、`CONTENT_SERVICE_INTERNAL_TOKEN`；保留原 `AMC_CONTENT_SERVICE_TOKEN` |
   | MM | `MAIN_APP_URL`、`CONTENT_SERVICE_INTERNAL_TOKEN` |

   三者内部 token 必须一致。供应商密钥仅存 Kanban `LLMConfig`。

3. 管理员进入 **Kanban → 后台 → 系统配置 → 全局文本模型**。在下方模型路由区新增连接，分别填写供应商显示名称和协议。Kopix 地址为 `https://www.kopix.ai/v1`，模型为 `glm-5.3`，选择 Kopix 或 OpenAI 兼容协议。
4. 依次执行 **测试连接及能力 → 预检三个系统 → 应用全局切换**。验证有效期 30 分钟；修改连接后须重新验证。失败不改变当前选择。
5. 分别在 Kanban 聊天并触发工具、Content 生成一次文案、MM 发一次聊天。后台日志应出现三个 source、目标模型 `glm-5.3`、成功状态、相同配置版本；同时检查业务输出可正常解析。响应模型标识来自供应商，不能独立证明供应商内部运行的模型。

## 后续切换与回滚

- 同协议供应商只需新增连接、验证、应用，无需改代码。
- 被历史版本引用的连接不可直接修改协议、密钥、地址、模型或超时。换密钥或地址须创建新连接，确保在途工作与回滚仍能引用旧连接。
- 恢复上一连接：选择上一版连接、重新预检、应用，版本继续递增。恢复原路由：关闭严格策略。
- 多个管理员同时提交时，旧版本提交会被拒绝，刷新后重试。
- 新私有协议、特殊鉴权或工具格式需要新增适配。
- 图片、视频、语音、音乐继续使用各自配置。

## 验证记录及剩余上线工作

- 三系统 `npm run test:global-text` 已通过。
- Kanban/MM webpack 生产构建、Content build/typecheck/deployment 检查通过。本地构建临时限制 2 个 worker，避免内存耗尽。
- PostgreSQL 隔离 schema 中演练迁移与保护触发器，整体回滚；未改变生产业务配置。
- Kopix 实际工具调用和结果续写通过，返回模型标识为 `glm-5.3`。
- 仍需生产部署、三系统预检、启用及最小业务验收。本地测试不代表线上已经切换。
