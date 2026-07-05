# AMC-Kanban Agent Rules

<!-- BEGIN:prd-workflow-rules -->
## PRD 优先工作流（必须遵守）

### 每次收到新需求时，必须按以下顺序执行：

1. **读取 PRD**：打开 `docs/prd_amc.md` 和所有受影响的模块 PRD，理解当前完整产品与架构状态。
2. **冲突检查**：判断新需求是否与现有 PRD 内容冲突。
   - 如有冲突且用户没有明确取舍：立即说明冲突点，提供选项，等待用户决策，不得擅自取舍。
   - 如用户已经明确新决策：以新决策为准，继续统一更新，不重复询问。
3. **更新当前理解**：直接改写所有受影响的目标、模型、流程、接口、验收和执行计划，使 PRD 只保留当前唯一有效描述。
4. **清除冲突旧文**：不得仅追加新 Changelog 后保留相互冲突的旧方案。被替代的内容必须删除或改写，历史由 Git 保存。
5. **跨文档同步**：搜索主 PRD、模块 PRD、API 文档、SOP、Skill 和 Agent 指令中的旧术语、旧模型与旧流程，并在同一次变更中统一。
6. **标记实现状态**：明确区分“目标状态 / 待执行”和“已实现 / 已上线”，不得把规划写成现状。
7. **一致性复核**：重新搜索角色、权限、数据模型、API/MCP、工作流程和术语，确认没有冲突描述。
8. **开始编码**：PRD 更新并完成一致性复核后才可以写代码；若用户要求只做方案或文档，不得开始开发。
9. **完成后 git push**（见下方规则）。

### PRD 内容原则

- PRD 是当前事实源，不是历史方案堆栈。
- Changelog 只记录仍与当前方案一致的发布事实，不承载已被替代的设计正文。
- 决策发生变化时，必须更新对整个项目的理解，而不是局部追加补丁。
- 专项 PRD 与主 PRD 冲突时必须在同一次变更中统一；无法判断时先请用户决策。

### PRD 文件位置
- 主 PRD：`/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/docs/prd_amc.md`
- 用户、组织与权限 PRD：`docs/prd_user_organization_permissions.md`
- MM 端 PRD：`docs/prd_amc_mm.md`
- 品牌知识合规 PRD：`docs/prd_brand_knowledge_compliance.md`

<!-- END:prd-workflow-rules -->

<!-- BEGIN:git-push-rules -->
## Git Push 规范（每次代码变更后必须执行）

### 执行顺序
```bash
git add -A
git commit -m "<type>(<scope>): <简短描述>

<详细说明（可选）>"
git push
```

### Commit 类型
| type | 适用场景 |
|------|---------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `prd` | PRD 文档更新 |
| `refactor` | 重构（不改变功能） |
| `style` | 样式/UI 调整 |
| `chore` | 构建/配置变更 |

### Commit Scope 示例
- `copywriter` — 内容创作模块
- `calendar` — 发布日历
- `dashboard` — 管理后台
- `brands` — 品牌管理 API
- `agent` — AI 智能体
- `auth` — 认证相关

<!-- END:git-push-rules -->

<!-- BEGIN:modular-design-principles -->
## 编码原则 — 模块化设计（必须遵守）

**核心目标：模块化、高复用、低耦合、易维护。**

### 文件规模控制

| 文件行数 | 要求 |
|----------|------|
| > 600 行 | 评估是否需要拆分子组件或 hook |
| > 900 行 | **必须拆分**，不得继续在同文件堆加代码 |

优先提取：纯展示组件、独立子页面、可复用的自定义 hook。

### 共享类型先行
- 多个文件共用的 TypeScript 接口，**必须**集中到 `src/components/shared/types.ts`
- 禁止在多个文件中重复定义相同接口（会导致类型不兼容报错）

### 工具函数集中管理
- 跨组件使用的工具函数统一放入 `shared/` 目录
- 禁止复制粘贴相同逻辑到多个组件

### 依赖方向
- 子组件只通过 **props** 接收数据，不直接读取父组件 state
- 新增代码 > 80 行前，先判断能否独立成组件/hook 或复用现有 `shared/`

### 基础设施变更的验收要求

凡涉及 **middleware、路由、认证、i18n** 等基础设施改动，除 `tsc --noEmit` 外还必须：
1. 执行生产构建（`next build` 或等效命令）确保通过
2. 浏览器/curl 访问所有关键路径，确认 HTTP 200
3. 验证通过后才可 `git push`

> ⚠️ 教训：`tsc` 通过 ≠ 路由正常。曾因 i18n middleware 引入导致全站 404，`createIntlMiddleware` 需要 `[locale]` 目录而项目未使用该结构。
<!-- END:modular-design-principles -->

<!-- BEGIN:render-instance-map -->
## Render 生产实例映射（新加坡迁移后，2026-07-05）

> ⚠️ 关键规则：AMC 项目已从美国实例迁移到新加坡实例。Agent 在使用 Render CLI 操作时，**必须使用 `-sg` 后缀的实例**，旧美国实例均已暂停（suspended）。

### 活跃实例（Singapore ✅）

| 服务名 | Render ID | 类型 | 说明 |
|--------|-----------|------|------|
| `amc-kanban-sg` | `srv-d94hhbt7vvec73dk7uig` | Web Service | **主业务后端**（Next.js），对外域名 `amc-kanban.immedi.ai` |
| `amc-kanban-sg` DB | `dpg-d94hejlckfvc73a18nc0-a` | PostgreSQL | 主业务数据库，DB名 `amc_cupw_0n3f` |
| `amc-mm-sg` | `srv-d94hhgtckfvc73a1dla0` | Web Service | MM 商家端（Next.js），对外域名 `amc-mm.immedi.ai` |
| `amc-content` | `srv-d94h66gjs32c73ehcfu0` | Web Service | 内容生成服务 |
| `apify-daily-sync-sg` | `crn-d94hq35ckfvc73a1rqgg` | Cron Job | Apify 每日同步 |
| `postfast-daily-sync-sg` | `crn-d94hq3kvikkc73cepl70` | Cron Job | Postfast 每日同步 |

### 已暂停实例（US 旧实例 ❌ 勿操作）

| 服务名 | Render ID | 说明 |
|--------|-----------|------|
| `amc-kanban` | `srv-d7v9em7aqgkc739167kg` | 旧美国 Web Service |
| `amc-db` | `dpg-d7v9ec7aqgkc73915tcg-a` | 旧美国 PostgreSQL |
| `amc-mm` | `srv-d8vk5am8bjmc738cnf1g` | 旧美国 MM 服务 |
| `apify-daily-sync` | `crn-d946k7vlk1mc73ait6ag` | 旧美国 Cron |
| `postfast-daily-sync` | `crn-d93sln5ckfvc73959gtg` | 旧美国 Cron |

### Render CLI 操作规范

```bash
# ✅ 正确：查看生产日志
render logs --resources srv-d94hhbt7vvec73dk7uig --output text --limit 50

# ✅ 正确：对生产 DB 执行 SQL
render psql dpg-d94hejlckfvc73a18nc0-a --confirm --output text -c "SELECT ..."

# ✅ 正确：触发部署
render deploys create srv-d94hhbt7vvec73dk7uig --output text --confirm

# ❌ 错误：操作美国旧实例（已暂停）
# render logs --resources srv-d7v9em7aqgkc739167kg  ← 旧美国，WRONG
# render psql dpg-d7v9ec7aqgkc73915tcg-a           ← 旧美国 DB，WRONG
```

### 部署流程说明
- **Pre-deploy**：`npx prisma migrate deploy`（自动运行 prisma/migrations/ 下的迁移文件）
- **Schema 变更**：必须创建 migration 文件（`prisma/migrations/YYYYMMDDXXXXXX_name/migration.sql`），不能只用 `prisma db push`
- **Git push 自动触发部署**：push 到 `main` 分支后 Render 自动构建并部署
<!-- END:render-instance-map -->

<!-- BEGIN:llm-config-rules -->
## LLM 配置规范 — 必须使用 LLMConfig 数据表（Admin UI）

### ⚠️ 核心规则：系统不默认使用 Gemini API，也不使用单一固定 LLM 提供商

AMC 系统使用**数据库驱动的多供应商 LLM 路由架构**，当前生效配置来源于 `LLMConfig` 数据表。

**绝对禁止**：
- 在代码中硬编码任何 LLM provider（如 `new GoogleGenerativeAI(...)` 直接实例化）
- 向 Render Dashboard 添加 `GEMINI_API_KEY`、`OPENAI_API_KEY` 等 AI 模型 key 环境变量
- 读取 `SystemConfig.geminiApiKey` 或调用 `getGeminiApiKey()`（废弃，新代码禁止）

**正确做法**：
- 所有 AI 推理调用 → 通过 `src/lib/llmRouter.ts` 的 `callLLMByTag(taskTag, messages)` 接口
- 模型配置变更 → 引导用户到 `/admin` → **AI 模型配置** 面板操作
- 需要新增 AI 功能 → 在 LLMConfig 添加对应 provider 条目，并打上对应 taskTag

### LLMConfig 路由机制
1. 系统从 `LLMConfig` 表取出所有 `isEnabled=true` 的配置
2. 按 `taskTags` 过滤（如 `"copywriting"`、`"tts"`、`"reasoning"`）
3. 按 `priority` 降序排列，依次尝试直到成功（Fallback 链）
4. API Key 存储在 `LLMConfig.apiKey`，服务端读取，不暴露给浏览器

### 管理入口
- **后台路径**：`/admin` → **AI 模型配置（LLMConfig）**
- **核心文件**：`src/lib/llmRouter.ts`（路由逻辑）、`src/lib/gemini-chat.ts`（语音聊天，实际走 LLMConfig）

<!-- END:llm-config-rules -->
