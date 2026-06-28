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
