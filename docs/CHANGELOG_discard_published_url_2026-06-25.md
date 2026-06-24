# CHANGELOG - Discard Verification & Published Post URL Resolution (2026-06-25)

## 变更背景
为了进一步完善平台的设计闭环与操作安全性：
1. **废弃（Discard）操作限制**：允许用户在文章发布前对其进行废弃操作，但一旦文章已发布（`published`），则不允许废弃（隐藏“废弃”按钮）。
2. **已发布文章链接获取与展示**：对于已发布（`published`）状态的草稿，系统需动态从 PostFast 后端服务获取其实际的平台发布 URL (`postUrl`)，并在编辑/查看抽屉中提供便捷入口以打开和浏览真实的发布文章。

---

## 变更设计与决策

### 1. 后端 API 级 URL 动态融合
- **按需单点获取** (`GET /api/brands/[id]/drafts/[draftId]`)：当请求单个草稿且其状态为 `published`、存在第三方平台发布 ID `platformPostId` 时，向 PostFast 平台批量查询该品牌已发布的帖子列表，匹配对应的 `postUrl` 并实时返回。
- **列表批量合并** (`GET /api/brands/[id]/drafts`)：检测列表内是否存在已发布的帖子，存在时通过单次 PostFast API 批量列表调用（零数据库 schema 修改成本）解析各帖子的发布链接，防止数据库冗余并确保获取到实时最新 URL。

### 2. 前端查看抽屉与只读态改造
- **抽屉标题与状态区**：
  - 抽屉标题自动切换为 `查看已发布文章`（普通草稿状态为 `编辑草稿`）。
  - 在顶部状态 Label 旁动态绘制 `🔗 查看文章` 超链接，点击新开页面访问。
- **操作区（Footer）按需重构**：
  - 对已发布帖子，隐藏原有的保存、AI 创作/重新创作、提交审批、同意/驳回等动作，只渲染一个明显的 `打开已发布文章` 蓝色微动画按钮。
  - 对非发布状态草稿，提供 `废弃` 按钮以支持一键删除。
- **表单控件全面只读化**：
  - 自动禁用正文 `textarea`、标签 `input`、排期时间 `input`、协作备注 `textarea`。
  - 禁用发布账号多选按钮、外部媒体链接添加区和拖拽排序动作、以及素材库关联操作，保持交互的只读态完整性。

---

## 变更文件列表

- **[MODIFY] [route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/[id]/drafts/[draftId]/route.ts)**：单条查询获取动态 `postUrl` 并融合。
- **[MODIFY] [route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/brands/[id]/drafts/route.ts)**：列表查询动态融合 `postUrl` 字段。
- **[MODIFY] [DraftManagementView.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DraftManagementView.tsx)**：抽屉 UI 标题切换、状态栏超链接、底部按钮替换、表单全控件只读态控制。

---

## 验证与测试
- 运行 TypeScript 类型检查 (`npx tsc --noEmit`) 100% 通过。
- 进行了前端组件只读与动作替换效果的静态审查。
