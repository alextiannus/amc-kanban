# CHANGELOG - Account Snapshot Crawler & Data Analysis Page (2026-06-25)

## 变更背景
AMC 平台增加了 **“账号展现” (Data Analysis)** 页面，用来呈现在系统中运行的所有社交媒体（如 Instagram 等）账号主页的最新真实截图。同时设计了由 **AMC Researcher (AI)** 每日自动采集社交平台最新主页截图的后台调度任务与对应 API 端点。

---

## 变更设计与决策

### 1. 账号快照存储模型设计
在 `prisma/schema.prisma` 中引入了 `SocialAccountSnapshot` 模型：
- 记录快照所属的社交账号 (`accountId`)。
- 记录快照图片文件的静态 URL 路径 (`imageUrl`)。
- 记录采集完成时间 (`capturedAt`)。
- 每个 `SocialAccount` 通过一对多关联拥有多条快照历史，方便追溯和查询最新状态。

### 2. AMC Researcher 截图服务与账号登录凭证授权方案
设计了 `src/lib/captureSnapshots.ts` 与 `src/lib/researcherScheduler.ts`：
- **定时调度**：每日（每24小时）自动唤醒截图抓取器，遍历抓取所有 ACTIVE 品牌的社交账号（限 Instagram）。
- **Playwright 抓取**：自动尝试启动无头 Chromium 浏览器访问账号的 `profileUrl` 并进行截图，保存到本地 `public/snapshots/[accountId]/[timestamp].png`。
- **强制阻断与要求登录**：因社交平台（Instagram）有严格的防爬/登录墙限制，若截图失败或被重定向到登录页面，爬虫程序会直接抛出错误。用户在前端展现页面中，可以直接输入 Instagram 账号密码并执行登录，生成并存储 `cookies.json` 会话缓存，以彻底突破登录重定向，不采用任何无意义的 SVG 降级卡片。

### 3. 数据分析（账号展现）API 与多维过滤
在 `src/app/api/data-analysis/route.ts` 实现了数据拉取接口：
- 拉取所有运行中的社交账号，并包含其最新的快照数据。
- 自动级联查询品牌 (`Brand`) 及其分配的主理人 (`BrandOwner`) 列表。
- 支持按 **品牌 (Brand)**、**平台 (Platform)**、**主理人 (AMC Owner)** 进行多维过滤，并支持按 **品牌字母顺序** 进行正序/倒序排列。

### 4. 极致美学的前端展现看板
在 `src/components/dashboard/DataAnalysisView.tsx` 实现了全新的展现页面：
- **实时过滤与瞬时更新**：在客户端预载数据后进行多维过滤器组合计算，实现过滤切换零延迟（秒级呈现）。
- **高阶卡片式栅格**：卡片上整合了品牌信息、平台类型、账号 Handle、绑定主理人列表、实时粉丝数和最后更新时间。
- **交互微动画**：快照底图悬停时会有放大阴影发光特效，点击可触发大图遮罩层缩放预览，并提供快速“访问主页”链接。
- **即时重新截图**：提供“重新抓取全部快照”按钮，供主理人/管理员后台即时异步重试。

---

## 变更文件列表

- **[MODIFY] [schema.prisma](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/prisma/schema.prisma)**：新增 `SocialAccountSnapshot` 快照实体与关联。
- **[NEW] [captureSnapshots.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/captureSnapshots.ts)**：实现截图器与 SVG 矢量备用渲染器。
- **[NEW] [researcherScheduler.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/researcherScheduler.ts)**：每天运行的截图轮询器。
- **[MODIFY] [prisma.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/lib/prisma.ts)**：服务启动时装载 `startResearcherScheduler`。
- **[NEW] [route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/researcher/capture-snapshots/route.ts)**：截图触发 API。
- **[NEW] [route.ts](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/app/api/data-analysis/route.ts)**：数据分析数据拉取与多维过滤 API。
- **[NEW] [DataAnalysisView.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/dashboard/DataAnalysisView.tsx)**：账号展现主视图。
- **[MODIFY] [MainLayout.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/layout/MainLayout.tsx)**：加入“账号展现”菜单项。
- **[MODIFY] [KanbanBoard.tsx](file:///Users/alextian/Documents/Claude/Projects/AI%20Staff/amc-kanban/src/components/KanbanBoard.tsx)**：增加 `dataAnalysis` SPA 路由与视图挂载。

---

## 验证与测试
- 执行 `npx tsc --noEmit` 编译检查无任何错误。
- 运行 `scripts/test-snapshots-api.mts`，完成测试账号创建、未授权重定向抛错断言与 Crawler 错误统计测试，取得 **100% PASS**。
