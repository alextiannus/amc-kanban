# amc-kanban 产品需求文档 (PRD)

## 1. 产品愿景与目标 (Product Vision & Goals)
打造一个专为“人机协同”与“多智能体协同”（Human-AI & AI-AI Collaboration）设计的泳道看板系统。打破传统看板仅面向人类用户的局限，将 AI 视为“一等公民”。使智能体能够自主规划、沟通状态、并与人类无缝协作，特别是解决智能体在执行任务时遇到的阻碍（Human-in-the-loop）。

## 2. 角色与实体定义 (Roles & Entities)

### 2.1 智能体用户 (AI Agent User)
不同于普通的脚本，每个 AI Agent 在系统中也是一个独立的用户实体，拥有自己的 Profile 页面，包含：
* **Agent Insights (见解与偏好)**: 记录该 Agent 总结的业务见解、记忆和工作习惯。
* **Task List (看板任务列表)**: Agent 日常操作和负责的看板任务列表，由 Agent 自身自主维护和更新。
* **Agent Drive (专属网盘)**: 该 Agent 专属的资料存放文件夹链接/挂载点。
* **Chat Link (对话入口)**: 提供一个可以直接唤起与该 Agent 对话的快捷链接。

### 2.2 人类用户 (Human User)
* **人类协助者 (Human Assistant)**:
  - 拥有独立的个人 Profile 页面，展示基本信息。
  - **权限视图**: 在 Profile 中清晰展示该人类用户拥有哪些 AI Agent 的可见/协作权限。
  - 主要关注 `Need Input` 泳道，解决自己权限范围内的 AI 遇到的阻碍。

### 2.3 管理员 (Administrator)
* 负责整个系统的人类与 AI 用户的 **CURD (增删查改)** 管理。
* **权限分配核心**: 负责配置并设定“哪个人类用户可以查看/协作哪个 AI Agent 的工作”。

## 3. 核心工作流 (Core Workflows)
### 3.1 智能体日常工作流 (Agent Daily Workflow)
1. **启动与计划**: AMC Agent 被唤醒，调用看板接口获取分配给自己的任务。
2. **Profile & 物料拉取**: Agent 可以随时读取自身的 Profile (Insights) 以及 Central Research AI 提供的全集物料。
3. **执行与流转**: 任务在 `To Do`, `In Progress`, `Done`, `Void` 间流转。
4. **异常求助**: 遇到无法解决的问题，移入 `Need Input` 泳道。

### 3.2 人类协作与管理流 (Human Collaboration Workflow)
1. **权限过滤看板**: 人类用户登录后，看板上仅显示**管理员为其授权**的 AI Agent 所负责的任务。
2. **响应阻碍**: 人类用户重点处理 `Need Input` 任务并释放给 AI 继续处理。
3. **人员与智能体管理 (Admin 专属)**: 
   - 管理员在后台查看全部的 AI Agent 列表和人类用户列表。
   - 创建新用户、新 Agent，并配置它们之间的可见性绑定关系。

## 4. 看板架构与状态机 (Kanban Architecture)
卡片根据 Status 状态自动流转至对应的泳道中。
* **To Do (待办)** | **In Progress (进行中)** | **Need Input (需人工介入)** | **Done (已完成)** | **Void (已作废)**

## 5. AI 接口机制 (AI Interface / Skill)
系统需提供 REST API / MCP 接口供 AI 接入。新增接口需求：
* `get_agent_profile(agent_id)`: 获取自身见解、网盘链接等。
* `update_agent_insights(agent_id, content)`: AI 自主更新对业务的理解。

## 6. 用户认证与权限控制 (Auth & RBAC)
* **账户系统**: 邮箱账号登录，默认密码 `234567`。
* **RBAC 权限设计**:
  - 系统底层维护 `UserAgentPermission` 映射表。
  - 普通人类用户只能看到和操作自己有权限的 Agent 产生的看版卡片。
