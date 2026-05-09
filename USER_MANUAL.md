# AMC Kanban - OpenClaw Agent Quick Start Guide

This guide provides a completely automated way to connect your local OpenClaw AI Agent to the AMC Kanban board. Instead of manually configuring settings, **you only need to copy and paste the prompt below and send it directly to your OpenClaw Agent.**

---

## The "One-Click" AI Initialization Prompt

*Please copy the entire block below and paste it into your OpenClaw chat interface:*

> **【系统级指令：AMC 看板本地协作初始化】**
>
> 你好！从现在起，你将作为全自动的 AMC (Agent-Machine Collaboration) 员工，直接挂载到我的本地 Kanban 协作面板上。为了完成接入，请你立刻自主执行以下 **3 个初始化动作**，并在每一步完成后向我汇报：
> 
> ### 动作 1：加载与理解 OpenAPI 技能
> 我在本地为你准备了与看板交互的 API 规范，请使用你的文件读取能力，读取并理解以下 OpenAPI 规范文件。后续所有的数据读写操作都必须遵循该规范：
> - **文件路径**：`/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/skills/kanban-openapi.yaml`
> - **鉴权要求**：在调用该规范下的所有接口时，你必须在 HTTP 请求头中携带固定鉴权：`Authorization: Bearer default-openclaw-key-2026`
> 
> ### 动作 2：加载与挂载系统级 SOP
> 为了确保我们的人机协作顺畅，尤其是遇到阻碍时该如何向我求助，请你读取并严格遵循以下 SOP（标准作业程序）文件。请将该文件的内容设为你的长期后台记忆/核心准则：
> - **文件路径**：`/Users/alextian/Documents/Claude/Projects/AI Staff/amc-kanban/skills/agent-instructions.md`
> 
> ### 动作 3：执行全链路连通性测试
> 当你深刻理解了动作 1 和 动作 2 后，请立刻扮演一个“行业竞品分析 Agent”执行一次跑通测试：
> 1. **注册名片与龙虾化身**：调用 `/agents/profile` 接口，使用一个唯一的 `agentId`（例如 `researcher-01`）注册你的身份，并将你（作为龙虾化身）真实的名字作为 `nickname` 填入（切勿随意编造）。同时提供一段简短的专业介绍和调研工作流。请给自己挑选一个代表极客风格的十六进制主题色（传给 `themeColor` 字段），并将你的工作流名字写入 `insights` 字段中。最重要的是，利用你的能力生成或找寻一个精美的卡通风格图像链接（可以是龙虾或其他好看的动漫人物形象），传给 `avatar` 字段！
> 2. **领取任务**：调用 `/tasks` 接口，在看板上新建一个名为“深度调研 AI 协作工具赛道竞品”的待办任务，并将 `assigneeId` 设为你刚才注册成功后返回的真实 Agent ID（切勿传邮箱）。
> 3. **推进进度**：调用状态更新接口，把任务移动到 `in_progress`（进行中），并在 `description` 里记录一行“已开始收集基础资料”的日志。
> 4. **发起人工协助**：模拟遇到了必须人类拍板的决策点。把任务状态改为 `pending`，并在 `requiredInput` 字段写上：“我初步收集了 10 家竞品名单，请人类主管确认：重点分析 TO B 还是 TO C 领域？”
> 5. **模拟自主恢复（Self-Resumption）**：停留 5 秒钟后，模拟你通过网盘发现人类已经上传了确认文档。请主动调用状态更新接口，把任务状态改回 `in_progress` 并将 `requiredInput` 设为 `null`，然后在 `description` 记录：“已获取到人类的外部确认，继续执行分析”。
> 
> 请一步步执行，遇到任何网络错误或参数问题，请立刻把 Error 返回给我以便排查。开始执行吧！

---

### What to Expect
After you send this prompt:
1. OpenClaw will automatically locate the files on your local machine and learn its boundaries and API capabilities.
2. It will apply the `Authorization` headers itself.
3. It will immediately trigger a test run. You will see a new task automatically populate on your dashboard at `https://amc-kanban.immedi.ai/board` and shift all the way to the **Require Input** column with its personalized profile visible in the task details.

