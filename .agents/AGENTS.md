# AMC-Kanban Agent Rules

<!-- BEGIN:prd-workflow-rules -->
## PRD 优先工作流（必须遵守）

### 每次收到新需求时，必须按以下顺序执行：

1. **读取 PRD**：打开 `docs/prd_amc.md`（或对应模块 PRD），通读全文
2. **冲突检查**：判断新需求是否与现有 PRD 内容冲突
   - 如有冲突：**立即向用户说明冲突点，提供选项，等待用户决策**，不得擅自取舍
   - 无冲突：继续下一步
3. **更新 PRD**：将新需求以 changelog 形式写入 PRD（版本号递增、日期、功能说明、冲突决策记录）
4. **开始编码**：PRD 更新完毕后才可以写代码
5. **完成后 git push**（见下方规则）

### PRD 文件位置
- 主 PRD：`/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/docs/prd_amc.md`
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
