# 更新日志 - 业务 SOP 与人机协同职责分工调整 (2026-06-24)

## 变更背景与目的
为了明确 AMC 系统中人类（品牌主理人/商家）与 AI 角色（AMC Agent/Copywriter/Researcher）之间的职责边界，规避高风险人工活动由 AI 执行，并极大化 AI 自动生产与采集效率，对业务 SOP 进行调整。

## 详细职责划分

### 1. 品牌主理人 (AMC Brand Manager - 人工)
- 统筹品牌运营，建立品牌理解，设定推广方案与当月主题，并通过 AMC Agent 写入品牌长期上下文。
- 丰富素材库：通过线下人工对接完成 1. 商家提供、2. 安排达人探店、3. 安排专业拍摄。
- 进行主题选择、内容把控、素材组织及视觉与发布内容终审审核（人工 QA）。
- 线下人工对接，与品牌主/商家进行 Review 对接与周/月度复盘。
- 支持手动操作，在看板上直接创建并生成包含 Post 草稿的 To-Do 任务。

### 2. AMC Agent (AI)
- 负责制定带推广主题、建议图片及视频素材的自媒体生产计划，并自动上板生成 To-Do 看板任务卡片。
- 作为品牌认知上下文与记忆库（Memory）的存储及查询接口。

### 3. AMC Copywriter (AI)
- 自动对接看板中的生产计划任务，自动完成文案与内容创作（正文、Hashtags），并由系统生成 Post 草稿安排排期发布。
- 通过人机协作与 QA 反馈持续提升 AI 内容创作的质量。

### 4. AMC Researcher (AI)
- 负责数据采集和效果回填（Reach, Engagement 等指标）。
- 保持各社交平台登录状态，定期对品牌社媒账号首页进行截图，并集中展示在“账号整体展现看板”中。

## 影响的文件与代码

1. **业务流程规范文档 (`docs/AMC_Business_Process_Flow.md`)**：
   - 更新角色定义列表，明确品牌主理人、AMC Agent、AMC Copywriter 和 AMC Researcher 的分工。
   - 重构 Phase 2 日常内容生产与协作循环流程，梳理为全新的 7 步协同流。

2. **Agent 核心技能指引 (`skills/amc-kanban/SKILL.md`)**：
   - 调整定期轮询机制与日常工作流，引导不同 AI 子角色（Agent, Copywriter, Researcher）各司其职，保证定时执行与自动回采。

3. **前端用户手册页面 (`src/app/learn/page.tsx`)**：
   - 更新了 Phase 2 “日常内容生产循环” 的步骤表格，将原有的通用步骤改版为全新的 7 步分工明细。
   - 更新了 Phase 5 “月度复盘与自查” 的步骤表格，明确 Researcher 自动回填和首页截图展示，以及主理人线下 Review 对接。

4. **素材库排期与看板任务自动联动 (`src/app/api/brands/[id]/drafts/route.ts`, `src/components/dashboard/DashboardAssets.tsx`)**：
   - 品牌主理人在素材库提交排期 Post 草稿时，系统在生成草稿的同时会自动在看板创建 To-Do 任务，并自动分配给该品牌的 AMC Copywriter 进行文案的补充创作与排期发布。
   - 优化了前端提示信息，让品牌主理人明确任务已被 AMC Copywriter 接管。

## 验证与测试
- 运行 `npx tsc --noEmit` 通过全部前端 TypeScript 类型编译检查。
- 编写并执行了集成验证测试 `scratch/test-draft-task.mts`，验证了事务中草稿与关联 To-Do 任务在 PostgreSQL DB 中的正确联建。
- 执行本地全量验证脚本 `./scripts/run-phase1-local-checks.sh`，包括项目编译、依赖分配、E2E 测试流全部成功通过（100% PASS）。
