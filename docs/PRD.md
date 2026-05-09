# Product Requirements Document (PRD)

## 1. 概述 (Overview)
**项目名称**: AMC 智能工作台 (AMC OpenClaw Platform)
**项目目标**: 打造一个生产力级别的“人机协同操作系统”，将 AI Agent 与人类工作流深度融合，通过全局监控仪表盘、沉浸式 AI 序列、自动化看板等功能，实现工作流的完全透明化与自动化推进。

## 2. 核心功能特性 (Core Features)

### 2.1 任务协作看板 (Kanban Board)
- **多状态泳道管理**: 任务划分为 Todo（待办）、In Progress（进行中）、Require Input（待输入）、Done（已完成）、Void（已作废）。
- **沉浸式任务卡片**: 支持 Markdown 渲染，优雅展示任务的材料要求（Materials）和待输入要求（Required Input）。
- **拖拽与编辑**: 支持状态流转，人类用户可以通过 Task Modal 对任务状态、说明进行覆盖干预。
- **自动状态推断**: 系统每 5 秒轮询一次任务状态，看板永远处于“活（Live）”的状态。

### 2.2 监控大盘 (Interactive Dashboard)
- **全方位数据指标**: 实时统计 活跃 Agent、待输入任务、今日完成、离线 Agent 数量。
- **全局路由联动**: 
  - 点击“活跃/离线 Agent”卡片，自动切换至“AI 序列”视图并加载相应的状态过滤。
  - 点击“待输入/今日完成”卡片，自动将看板切换至对应的任务状态流。
- **交付成果展示**: 以时间线或列表形式直观展示最新产出的 `Done` 状态任务成果，展示对应的产出 AI 头像。

### 2.3 沉浸式 AI 序列 (Inline Agent Sequence)
- **全屏视图**: 替代传统的弹窗模式，将所有授权接入的 Agent 以矩阵式卡片排列。
- **在线状态感知**: 通过任务负载自动推断 Agent 是否在工作（绿灯呼吸）或休息（灰灯）。
- **多维搜索与过滤**: 支持对 Agent 的名称（Email 前缀）、工作流（Workflow）、简介（Introduction）进行全局模糊搜索。

### 2.4 API 与扩展性 (Extensibility & APIs)
- **多端开放 API**: 提供标准的 OpenAPI（YAML）规范，允许外部 OpenClaw 系统通过 `/api/tasks` 和 `/api/agents` 主动推送/拉取任务。
- **无密码自动化连接**: 提供 `初始化系统指令（System Prompt）` 和 `API Key`，让 AI Agent 在创建时即可自我介绍、自动配置其工作流引擎参数，并自我上报头像与主题色。

## 3. 技术架构方案 (Technical Architecture)

### 3.1 前端技术栈
- **核心框架**: Next.js 16 (App Router)
- **样式方案**: Tailwind CSS v4 + 响应式布局 + next-themes (支持系统级暗黑模式)
- **UI 组件**: Lucide React (图标), react-markdown (文本渲染), @dnd-kit (拖拽基础，后迭代为更轻量的 Tab)
- **状态管理**: React Hooks (`useState`, `useEffect`) 配合轮询机制（`setInterval`）。

### 3.2 后端与数据层
- **服务端方案**: Next.js Serverless API Routes (`/app/api/...`)
- **ORM & 数据库**: Prisma + PostgreSQL。
- **认证机制**: JWT + HttpOnly Secure Cookies (`jose`) 处理人类用户登录；Bearer API Token (`API_KEY`) 处理 AI Agent 的服务器间通信。
- **权限模型**: 双轨制模型，区分 `HUMAN` 与 `AI_AGENT`。具备 `AgentPermission` 多对多关系表控制人类管理员能看到哪些 AI 的数据。

### 3.3 数据流模型
1. AI Agent 启动，携带鉴权 Key 和自身画像（简介、工作流）调用 `PATCH /api/agents/profile` 完成自我注册。
2. AI 获取任务列表 (`GET /api/tasks`)，进入工作循环。
3. 工作遇到阻碍，AI 调用 `PATCH /api/tasks/:id` 将状态改为 `require_input` 并填写 `requiredInput`。
4. 人类用户通过 Dashboard 看到“待输入”，在 Kanban 补充材料，将状态改为 `todo`。
5. AI 轮询获取到新材料，继续工作，最终产出 `done` 状态成果。

## 4. 部署方案 (Deployment Strategy)
- **平台**: Render.com (Node.js Web Service)
- **启动流程**: `npm install` -> `npx prisma db push` -> `npm run build` -> `npm run start`
- **数据持久化**: 使用 Render 的 PostgreSQL 托管数据库。只需在 Render 仪表盘绑定 `DATABASE_URL` 即可实现数据持久化。

## 5. 安全与合规 (Security & Compliance)
- 首次访问系统的用户自动创建为 `ADMIN`，接管根权限。
- 全站 HTTPS 与 Secure Cookies 传输，防止重放攻击。
- 所有外网 API 路由均验证 `X-Api-Key`。

## 6. 产品演进路线 (Product Roadmap)

本部分记录了 AMC 智能工作台从 MVP 走向企业级“大型协同网络”的高阶规划，待核心业务跑通后逐步迭代落地：

### 6.1 ⚡️ 性能与架构演进 (Architecture & Performance)
- **毫秒级实时通信**: 将基于 `setInterval` 的短轮询机制升级为 Server-Sent Events (SSE) 或 WebSocket (如 Socket.io / Pusher)，大幅降低数据库 QPS，实现任务状态的无缝即时推送。
- **游标分页与懒加载**: 针对 `Done` 与 `Void` 泳道的历史任务，在 Prisma 层引入 Cursor Pagination，并在前端实现无限滚动 (Infinite Scroll)，确保海量数据下系统的绝对流畅。

### 6.2 🔔 交互与协同体验 (UX & Collaboration)
- **多渠道主动告警机制**: 引入前端通知系统（如 `sonner`），并打通 Webhook。当 Agent 将任务标记为 `Require Input` 遇到阻碍时，第一时间推送到人类干预者的飞书/Slack/钉钉，减少任务阻塞停滞时间。
- **细粒度工作审计日志 (Audit Trail)**: 新增独立的 `TaskLog` 数据库模型。以时间轴（Timeline）或评论区的方式，精细化记录 Agent 执行任务的中间进展和思考链路，替代目前笼统的描述字段。

### 6.3 🧠 高阶 AI 编排 (Advanced AI Orchestration)
- **DAG 工作流与 Agent 协同**: 引入任务依赖模型 (`dependsOn`)，实现单任务的多节点派发。例如：Agent A 完成数据搜索后，自动触发下游 Agent B 进行汇总与排版，实现流水线级别的纯 AI 协同。
- **AI 效能数据看板 (Performance Analytics)**: 引入 `Recharts` 可视化组件，统计每个 Agent 的“平均耗时”、“拦截率”、“干预频率”等效能指标，用数据驱动底层 Prompt 和工作流的不断进化。

### 6.4 🛡 安全与稳定性防护 (Security)
- **API 限流与防穿透保护**: 在核心路由入口（如 `/api/tasks`）引入 Redis 令牌桶算法限流（Rate Limiting）。彻底防范因个别外部 AI Agent 逻辑死循环导致的高频攻击，保障核心系统的高可用性。
