# AMC Kanban 产品路线图 v2.0
## Human-AI 协同任务操作系统进化方案

**更新时间**: 2026年5月  
**品牌显示名**: AMC Dashboard（原 AMC Command Center）  
**策略指导**: Dify-First 优先级 - 所有工作流/知识库管理由Dify承载，amc-kanban专注看板UI、权限、审计和Agent生命周期  
**对标项目**: Vibe Kanban (AI agents)、EDICT (多Agent协调)、Plane (功能完整性)、OpenProject (成熟度)

---

## 📈 实施进度与最新成果 (截至 2026年5月23日)

### ✅ 已完成的阶段性里程碑
* **浏览器插件桥接器（Chrome Extension Bridge）**：
  * 基于 Server-Sent Events (SSE) 的长连接通道（`/api/integrations/extension/events`）和接收响应接口（`/api/integrations/extension/response`）。
  * 实现 Mock 商家平台模拟器（`/mock-merchant`）用于模拟美团、大众点评的自动化操作。
  * 插件端背景脚本（`background.js`）和内容脚本（`content_amc.js`）完成，通过 `chrome.scripting` 安全注入人机模拟输入脚本。
* **Agent 权限审计与安全性校验**：
  * 对 API-key 认证的 Agent 进行了严格的任务创建及编辑范围限制，防止越权指派（`/api/tasks`）。
  * 扩展了 `PATCH /api/tasks/[id]` 接口，完整支持任务状态 `status` 更新。
  * 精准化管理系统日志（`/api/admin/logs`），增加“浏览器插件桥（ExtensionBridge）”日志过滤，重点动作（`EXTENSION_CMD_SEND`, `EXTENSION_CMD_RECV`, `EXTENSION_CMD_ERR`）实现颜色高亮。
* **接口规范兼容性**：
  * 利用 `js-yaml` 将 OpenAPI 规范接口化（`/api/meta/openapi`），对外直接返回标准的 JSON 格式，满足各类外部套件解析断言。
  * 调整了 MCP 协议兼容性（Accept 头部支持 `application/json, text/event-stream`）。

### 🚧 研发中与下阶段核心工作
我们对 Phase 2 的核心内容进行了重新排期和优化，明确了以**“多 Agent 协同编排与上下文沟通”**为中心的 P0 级别产品突破：

| 优先级 | 特性 | 详细描述 | 实施状态 |
| :--- | :--- | :--- | :--- |
| **P0** | **任务依赖与 DAG 编排** | 支持 `dependencies` 自关联依赖，限制被阻塞的任务由 Agent 执行，看板卡片显式标注 Blockers 关系。 | 🟥 待启动 (Next Sprint) |
| **P0** | **人机上下文评论系统** | 任务详情支持 Markdown 评论和 `@` 提及（包括 Human 与 Agent 的交互，AI 可在评论区贴详细日志或备选方案）。 | 🟥 待启动 (Next Sprint) |
| **P1** | **LLM 模型热切换与自动降级** | Agent 控制面板中允许配置默认模型、备用模型，根据任务权重 (1/3/5) 及 Token 费用动态热切。 | 🟥 待启动 |
| **P1** | **Agent 绩效与效能看板** | 基于 `AuditLog` 自动统计 Agent 首次任务通过率、响应时长及 Pending 等待占比，绘制效能曲线。 | 🟥 待启动 |
| **P2** | **外部生态 Trigger 适配器** | 对接飞书、Slack、Notion Webhook，支持外部群聊或文档中通过机器人直接创建看板任务。 | 🟥 待启动 |

---

## 执行摘要

AMC Kanban 在**Human-AI协同**这一独特赛道上具有竞争优势。本路线图通过三个阶段的演进，将其从"任务看板+权限管理"升级至"完整的Multi-Agent协作大脑"——对标EDICT的制度化架构和Plane的功能完整性，同时保持Dify的工作流处理中心地位。

### 核心竞争力
- ✅ **Agent作为一等公民** — 不同于通用看板，每个Agent有独立API Key、档案、权限
- ✅ **Human-in-loop阻塞机制** — pending状态设计解决AI协同中的"人工审批"难题  
- ✅ **完整权限矩阵** — 类似EDICT的"谁能给谁发消息"制度设计
- ✅ **审计可追溯** — 所有状态变更记录，符合企业合规要求

---

## Phase 1 - 基础完善（当前 → 6月底）

### 1.1 核心看板体验优化

#### 1.1.1 增强视图系统（类似Plane的Views）
- **问题**: 当前只有单一看板视图，大量Agent时难以查找
- **方案**:
  ```
  - 预设视图：
    ✅ 按Agent分组视图
    ✅ 按状态分组视图（todo/in_progress/pending/done）
    ✅ 按优先级视图（新增优先级字段：high/medium/low）
    ✅ 我的任务视图（仅显示分配给当前用户的任务）
    ✅ 即将逾期视图（deadline > now）
  
  - 动态筛选器：
    ✅ 多条件组合（AND/OR）
    ✅ 保存筛选器快照
    ✅ 分享筛选器URL（协作沟通）
  
  - 排序选项：
    ✅ 创建时间/更新时间
    ✅ 优先级/截止期限
    ✅ 工作量/复杂度
  ```
- **交付内容**: ViewBuilder组件 + FilterStore + 视图持久化
- **工作量**: 2周

#### 1.1.2 卡片内容增强
- **新增字段**:
  ```json
  {
    "title": "...",
    "priority": "high|medium|low",
    "estimatedHours": 8,           // 工作量预估
    "deadline": "2026-06-01",      // 截止期限
    "tags": ["feature", "urgent"],  // 灵活标签
    "blockers": [],                 // 阻塞关系（哪些任务阻塞当前任务）
    "subtasks": [],                 // 子任务支持
    "attachments": [],              // 文件/链接附件
    "comments": []                  // 评论系统
  }
  ```
- **交付内容**: 更新WorkUnit schema + 数据迁移脚本
- **工作量**: 1周

#### 1.1.3 实时协作（基于WebSocket）
- **问题**: 多用户同时操作时需要实时同步
- **方案**:
  ```
  工作流：
  1. WebSocket连接建立 → 获取当前看板快照
  2. 本地操作 → 乐观更新UI
  3. 发送更新事件到服务器
  4. 服务器广播到其他客户端
  5. 冲突解决：后写入的操作优先（或用Operational Transform）
  ```
- **交付内容**: WebSocket handler + 冲突解决策略
- **工作量**: 2周

---

### 1.2 Agent 生命周期管理

#### 1.2.1 Agent 档案完善（类似EDICT官员档案）
**当前缺陷**: avatar/themeColor 存储但无法有效展示和管理

**增强方案**:
```
Agent档案卡片新增：
├─ 基础信息
│  ├─ 昵称 / 简介 / 工作流标签
│  ├─ 头像 / 主题色
│  ├─ 在线状态指示（基于最近活跃时间推断）
│  └─ 可用模型列表（如支持gpt-4/claude-3等）
│
├─ 能力声明
│  ├─ 可执行的任务类型
│  ├─ 支持的工具/Skills列表
│  └─ 技能等级标签
│
├─ 活动统计（仪表板）
│  ├─ 本周完成任务数
│  ├─ 平均响应时间
│  ├─ Token消耗统计（与Dify集成）
│  └─ 错误率/重试次数
│
└─ 健康监控
   ├─ 最后心跳时间
   ├─ 连续失败计数
   ├─ 告警状态（🟢活跃 🟡停滞 🔴告警）
   └─ 实时日志流
```
- **交付内容**: AgentProfileCard + AgentStatsPanel + HeartbeatService
- **工作量**: 1.5周

#### 1.2.2 Agent 权限矩阵UI（对标EDICT）
**设计原则**: "谁能给谁分配任务"必须显式配置，而非隐式推断

**实现方案**:
```
权限管理后台：
┌─────────────────────────────────────┐
│ 权限矩阵可视化编辑器                │
├─────────────────────────────────────┤
│        | Agent-A | Agent-B | Agent-C│
├────────┼─────────┼─────────┼─────────┤
│Human-1 |  ✅     |  ✅     |   ❌    │
│Human-2 |  ❌     |  ✅     |  ✅     │
│Admin   |  ✅     |  ✅     |  ✅     │
└────────┴─────────┴─────────┴─────────┘

操作：
- 单击格子切换权限
- 按Agent查看 / 按Human查看
- 批量操作（复制权限配置）
- 权限变更审计日志
```
- **交付内容**: PermissionMatrix组件 + 权限查询API
- **工作量**: 1周

---

### 1.3 审计与合规

#### 1.3.1 完整审计日志系统
**当前缺陷**: 无法追溯任务流转历史

**设计**:
```
AuditLog 数据结构：
{
  id: UUID,
  timestamp: DateTime,
  actor: {
    id: User/Agent ID,
    type: "HUMAN" | "AI_AGENT",
    name: string
  },
  action: "TASK_CREATED" | "TASK_UPDATED" | "STATUS_CHANGED" | "PERMISSION_GRANTED" | ...,
  resourceId: UUID,
  resourceType: "WorkUnit" | "AgentPermission" | "User" | ...,
  oldValue: JSON,        // 变更前值
  newValue: JSON,        // 变更后值
  reason?: string,       // 操作原因（可选）
  ipAddress?: string,
  metadata?: JSON        // 额外上下文
}

查询界面：
- 时间范围筛选
- 操作类型筛选（创建/更新/删除/权限变更）
- Actor搜索（人或Agent）
- 导出为CSV/JSON
- 完整变更链视图（展示一个任务的所有变更）
```
- **交付内容**: AuditLog model + AuditService + AuditViewer UI
- **工作量**: 2周

#### 1.3.2 操作日志看板
```
新增看板页面：操作审计 (Admin only)
├─ 最近30天操作时间线
├─ 高频操作者排行
├─ 权限变更历史
├─ 异常操作告警（如批量删除等）
└─ 导出合规报告
```
- **交付内容**: AuditDashboard 页面
- **工作量**: 1周

---

### 1.4 通知与提醒

#### 1.4.1 多渠道通知（参考Plane/Planka的100+通知方案）
```
支持集成：
- ✅ 站内通知（Inbox）
- ✅ 邮件通知
- 🚧 企业微信 / 飞书（Webhook集成）
- 🚧 Slack（OAuth集成）
- 🚧 钉钉

触发条件：
- 任务分配给我
- 我的任务状态变更
- 任务变为pending（需要我处理）
- @我的评论
- Agent掉线告警
- 配额告警（Token/API调用）
```
- **交付内容**: NotificationService + 多渠道适配器
- **工作量**: 2周

---

### 1.5 数据驱动决策

#### 1.5.1 基础Dashboard（类似EDICT官员总览）
```
指标卡片：
┌─────────────────────────────────────┐
│ 📊 任务统计                          │
├──────┬──────┬──────┬──────┬──────┐
│ 总数 │ todo │ 进行 │待输入│已完成│
│ 124  │  32  │  28  │  8   │  56  │
└──────┴──────┴──────┴──────┴──────┘

┌─────────────────────────────────────┐
│ 🤖 Agent 活跃度                     │
├─────────────────────────────────────┤
│ Agent-A: 28 tasks completed        │
│ Agent-B: 15 tasks (2 failed)       │
│ Agent-C: 🔴 offline 2h             │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⏰ 工作流指标                        │
├─────────────────────────────────────┤
│ 平均周期: 2.3 days                 │
│ 逾期率: 8%                         │
│ pending平均等待: 1.5h              │
└─────────────────────────────────────┘
```
- **交付内容**: DashboardService + 简单图表组件
- **工作量**: 1.5周

---

## Phase 2 - 协同深化（7月-9月）

### 2.1 Multi-Agent 协调机制

#### 2.1.1 Agent间依赖管理（对标EDICT的DAG编排）
**问题**: 当前无法表示"Task B依赖Task A完成"的关系

**设计**:
```
任务依赖系统：
WorkUnit 新增字段：
{
  dependencies: [
    {
      taskId: UUID,
      type: "BLOCKS" | "BLOCKED_BY" | "RELATED_TO",
      reason: string
    }
  ],
  // 派生字段
  isBlocked: boolean,           // 有未完成的前置依赖
  blockingTasks: [],           // 该任务阻塞了哪些任务
  criticalPath: number          // 关键路径长度（天）
}

可视化：
- 任务卡片上显示依赖关系标记
- 工作流视图：显示任务间的箭头连接
- 关键路径高亮：红色箭头表示影响总周期的路径
```
- **API**:
  ```
  POST /api/tasks/{id}/dependencies
  DELETE /api/tasks/{id}/dependencies/{depId}
  GET /api/tasks/{id}/dependency-chain  // 获取完整依赖链
  GET /api/analytics/critical-path      // 分析关键路径
  ```
- **工作量**: 2周

#### 2.1.2 任务路由与自动分配（对标EDICT的调度引擎）
**问题**: 新建任务后需要手动分配给Agent，无法根据能力/负载自动分配

**方案**:
```
智能路由系统：
1. Agent能力声明（在档案中）：
   - 支持的任务类型（通过Dify工作流标签）
   - 技能等级（初级/中级/高级）
   - 并发限制（最多同时处理N个任务）

2. 任务分配策略：
   a) 显式分配：用户指定Agent
   b) 自动分配：系统根据规则推荐
      - 规则1: 能力匹配 + 负载最低 → 推荐Agent
      - 规则2: 优先级高 + 遴选top Agent
      - 规则3: 复杂度高 → 分配给高级Agent
   
   c) 轮流制：按顺序轮流分配（简单场景）

3. 重新分配机制：
   - 若Agent失败 → 自动升级给更高级Agent
   - 若Agent超时 → 分配给备选Agent
   - 人工干预 → 管理员可强行转移

UI：
┌──────────────────────────────────┐
│ 创建任务 → 智能建议分配           │
├──────────────────────────────────┤
│ 推荐方案 1: Agent-A (85% 匹配)   │
│ 推荐方案 2: Agent-B (72% 匹配)   │
│ 手动选择: [下拉菜单]              │
│ ☐ 无法分配时告警我               │
└──────────────────────────────────┘
```
- **交付内容**: AssignmentEngine + CapabilityMatcher + RouteAPI
- **工作量**: 2.5周

#### 2.1.3 工作流编排（Task Pipeline）
**设计**:
```
支持定义任务管道：
示例1: 代码审查流程
创建→设计审查→安全审查→代码审查→测试→发布

示例2: 内容创作流程  
创建→初稿→编辑评审→修改→终审→发布

实现：
- 拖拽式管道编辑器
- 每个阶段可配置：
  ✓ 执行人/Agent
  ✓ 时间限制
  ✓ 并行/串行执行
  ✓ 失败处理（重试/升级/跳过）
  
- 执行：一个任务通过整个流程时自动创建/更新子任务

对接Dify：
- 每个管道阶段调用不同的Dify工作流
- 传递上一阶段的输出作为下一阶段的输入
```
- **交付内容**: PipelineBuilder + PipelineExecutor + Dify集成
- **工作量**: 3周

---

### 2.2 实时协作增强

#### 2.2.1 评论系统（@提及、线程化、Markdown）
```
评论功能：
WorkUnit.comments = [
  {
    id: UUID,
    author: User/Agent,
    content: string,        // Markdown
    mentions: [User],       // @user
    createdAt: DateTime,
    updatedAt: DateTime,
    replies: Comment[],     // 线程回复
    reactions: {            // 表情反应
      "👍": [User1, User2],
      "🎉": [User3]
    }
  }
]

UI特性：
- 实时输入提示（@Agent、#Task等）
- Markdown预览
- 上传截图/附件拖拽支持
- 通知@提及者
- 评论@某人时通过消息通知
```
- **交付内容**: CommentThread组件 + 实时WebSocket同步
- **工作量**: 1.5周

#### 2.2.2 活动流（Activity Feed）
```
实时活动时间线：
├─ 14:32 Agent-A 完成了 "代码审查" 任务
├─ 14:15 Human-1 评论了任务
├─ 14:10 Agent-B 已分配任务 "前端优化"
├─ 14:05 Human-1 创建了任务
└─ ...

特性：
- 团队视图：整个团队的活动
- 个人视图：我的活动 + @我的活动
- 过滤：按行为类型/Actor过滤
- 导出：活动报告
```
- **交付内容**: ActivityFeed组件 + EventStore
- **工作量**: 1周

---

### 2.3 高级分析（对标OpenProject的Analytics）

#### 2.3.1 团队生产力分析
```
仪表板新增：
┌─────────────────────────────────────┐
│ 📈 生产力指标                        │
├─────────────────────────────────────┤
│ 本周完成任务: 42 (+15% vs 上周)    │
│ 平均完成时间: 1.8 days (-0.3d)    │
│ 团队容量利用率: 78%                │
│ 高优先级任务完成率: 92%            │
└─────────────────────────────────────┘

图表：
- 任务完成趋势曲线（周/月）
- Agent生产力对比（条形图）
- 任务类型分布（饼图）
- 工作量预测（基于历史数据）
```
- **交付内容**: AnalyticsService + 图表库集成（Recharts）
- **工作量**: 2周

#### 2.3.2 Agent 性能评分
```
Agent绩效卡片（对标EDICT功过簿）：

┌─────────────────────────────────────┐
│ Agent-A 绩效评分                    │
├─────────────────────────────────────┤
│ 完成度: ████████░░ 82%              │
│ 质量: █████████░ 91%                │
│ 及时性: ███████░░░ 74%              │
│ 可靠性: ██████████ 100%             │
│                                     │
│ 综合评分: 87/100 (A级)             │
│ 建议: 质量优秀，可分配高难度任务   │
└─────────────────────────────────────┘

维度定义：
- 完成度 = 完成任务数 / 分配任务数
- 质量 = 首次通过率（无需重做）
- 及时性 = 按时完成率
- 可靠性 = 连续成功天数 / 总天数
- 成本效率 = 完成价值 / Token消耗

模型选择（需与Dify集成）：
- 如果Agent主要用gpt-4，评分时考虑成本
- 如果Agent用claude-3，重视质量指标
```
- **交付内容**: PerformanceRater + ScoreBoard组件
- **工作量**: 2周

---

### 2.4 AI Agent配置管理（对标EDICT模型配置）

#### 2.4.1 LLM模型热切换
**问题**: 目前Agent绑定固定模型，无法动态调整

**设计**:
```
Agent配置面板新增：

┌─────────────────────────────────────┐
│ 模型配置                            │
├─────────────────────────────────────┤
│ 默认模型: [GPT-4 ▼]                │
│ 备用模型: [GPT-3.5-turbo]          │
│ 应急模型: [Claude-3]               │
│                                     │
│ 切换策略:                           │
│ ☑ 自动降级（超时→用备用模型）     │
│ ☑ 成本控制（费用>$N时自动用便宜的）│
│ ☑ 性能模式（优先高质量）           │
│                                     │
│ [保存配置] 修改后自动重启Gateway   │
└─────────────────────────────────────┘

后端：
- 保存新配置到DB
- 发送信号给Agent重新加载配置
- 记录配置变更审计日志
```
- **对接Dify**: 读取Agent支持的模型列表，更新Dify中Agent的LLM绑定
- **交付内容**: ModelConfigPanel + 配置API + Dify webhook
- **工作量**: 1.5周

---

## Phase 3 - 生态扩展（10月-12月）

### 3.1 集成生态

#### 3.1.1 外部系统适配器
```
优先级排序：
P0（必需）:
- Dify工作流同步 ✅ 既有
- Webhook支持（外部系统推送任务）

P1（重要）:
- GitHub Issues 双向同步
- Notion Database 链接
- Linear 集成
- Jira 迁移工具

P2（加分项）:
- Slack Bot（/create-task 等命令）
- Telegram Bot
- 飞书/企业微信集成
- 日历同步（看板任务导出到日历）

实现模式：
- Webhook: 接收外部事件，转换为Task
- API同步: 定期将Task状态同步回外部系统
- 双向绑定: 保持ID映射表，支持编辑时同步
```
- **工作量**: 4-6周（分迭代实现）

#### 3.1.2 数据导入导出
```
支持格式：
- CSV / Excel（批量导入任务）
- JSON（完整备份导出）
- iCal（导出到日历）
- Markdown（生成周报/月报）

示例：生成周报
看板 → 导出周报 → 输入模板 → Markdown文件
内容：
- 本周完成任务列表
- 团队生产力指标
- Agent健康状态
- 下周计划
```
- **交付内容**: ImportService + ExportService + 格式转换器
- **工作量**: 2周

---

### 3.2 移动端支持

#### 3.2.1 响应式设计优化
```
当前: 仅支持桌面端
目标: 
- 平板友好（iPad）
- 手机友好（查看+快速操作）

手机端优化：
- 看板：垂直滚动（而非横向）
- 卡片：摘要视图 → 详情弹窗
- 操作：简化为常用的3-4个按钮
- 通知：突出pending待处理

功能：
- 查看我的任务
- 接收/处理pending任务
- 快速更新状态
- 查看Agent状态
```
- **工作量**: 2周

#### 3.2.2 原生移动应用（可选）
```
使用React Native或Flutter开发轻量版本
支持离线查看、推送通知等
放在Phase 3后期，暂时为可选
```

---

### 3.3 高级功能

#### 3.3.1 智能建议与自动化
```
功能示例：
1. 自动提醒
   - Task即将逾期 → 推送提醒 + 自动升级到高优先级
   - Agent连续3次失败 → 建议降级该Agent权限

2. 异常检测
   - 任务停留在pending超过2小时 → 告警
   - Agent掉线 → 自动转移其未完成任务
   
3. 智能分配
   - 新任务来临 → AI推荐最优Agent组合
   - 检测任务可并行性 → 建议拆分
   
4. 根因分析
   - 任务延期 → 分析是哪个Agent阶段卡壳
   - 质量下降 → 关联到模型变更或负载变化
```
- **工作量**: 3-4周（需要机器学习）

#### 3.3.2 团队协作模式
```
支持多种协作场景：

场景1: 顺序审核（串行）
创建 → Agent-A审查 → Agent-B修改 → Agent-C审批 → 完成

场景2: 并行执行（并行）
创建 → [Agent-A, Agent-B, Agent-C] 同步执行 → 汇总 → 完成

场景3: 众包投票（民主）
创建 → 方案生成 → 团队投票选择 → 最优方案执行

实现：
- 在Pipeline基础上增加执行策略配置
- 并行时支持等待所有或等待其中一个完成
- 投票时统计票数，执行获票最多的分支
```
- **工作量**: 2周

---

### 3.4 合规与企业级功能

#### 3.4.1 RBAC升级（角色细粒度权限）
```
当前: ADMIN / USER两级
升级：
├─ 超级管理员 (Super Admin)
│  └─ 所有权限
├─ 管理员 (Admin)
│  ├─ 用户管理
│  ├─ Agent管理
│  └─ 权限配置
├─ 项目经理 (PM)
│  ├─ 查看全部任务
│  ├─ 创建/编辑任务
│  └─ 无权限管理
├─ 开发者 (Developer)
│  └─ 仅查看/编辑分配给自己的任务
└─ 查看者 (Viewer)
   └─ 只读权限

实现：
- 资源级权限（某Task只有特定用户可编辑）
- 字段级权限（某用户只能看title，不能看salary）
- 时间范围权限（项目结束后自动只读）
```
- **工作量**: 1.5周

#### 3.4.2 数据加密与隐私
```
功能：
- 任务描述端到端加密（对于敏感内容）
- API Key安全存储（加盐哈希）
- 审计日志不可篡改（类似区块链）
- GDPR合规：数据导出/删除功能
- SSO集成：支持企业级身份管理
```
- **工作量**: 2周

---

## Phase 4 - 长期愿景（2027年+）

### 4.1 AI-Native设计
```
目标：让看板"懂"用户意图

功能：
1. 自然语言任务创建
   用户: "今天要完成数据分析报告，要张三和李四配合"
   系统: 自动创建任务 → 分配给Zhang/Li → 设置依赖关系

2. 上下文感知
   系统根据历史推断:
   - 你这个任务通常需要2天 → 自动设置deadline
   - 通常由Agent-B处理此类 → 自动建议分配

3. 冲突预警
   - 张三今天排期已满 → 建议给李四
   - 这个任务依赖的上游还没完成 → 提前告警
```

### 4.2 多租户/SaaS化
```
目标：从私有部署 → SaaS+私有化双模式

核心：
- 租户隔离：数据/配置完全隔离
- 配置中心：支持自定义工作流/字段
- 白标方案：支持企业自定义UI
- 配额管理：按Agent数/任务数/API调用计费
```

### 4.3 跨域协作
```
支持多个amc-kanban实例间的协作：
- 子公司A的Agent可看子公司B的某些任务
- 跨公司任务依赖管理
- 统一的全局Dashboard
```

---

## 技术架构演进方案

### 当前状态
```
Frontend: React + Tailwind
Backend: Next.js API Routes + Prisma
Database: PostgreSQL
Real-time: WebSocket (基础)
```

### Phase 1-2 新增
```
Backend增强：
+ Redis: WebSocket消息队列 + Session存储
+ EventBus: 任务/权限变更事件驱动
+ AnalyticsEngine: 数据聚合与计算
+ CacheLayer: 频繁查询的数据缓存

Frontend增强：
+ WebSocket增强：乐观更新 + 冲突解决
+ 图表库: Recharts/ECharts
+ 拖拽库: dnd-kit升级 (已有)
+ 富文本编辑: Markdown编辑器
+ 通知系统: Toast + 站内消息中心
```

### Phase 3新增
```
微服务：
+ IntegrationService: 处理外部系统集成
+ AnalyticsService: 独立的分析计算
+ NotificationService: 多渠道通知
+ ExportService: 数据导出

部署：
+ Docker Compose: 完整本地部署方案
+ Kubernetes配置: 可选的云原生部署
+ CI/CD: GitHub Actions自动化测试部署
```

---

## 对标项目对比表

| 特性 | AMC v1 | AMC v2 | EDICT | Plane | OpenProject | 
|------|--------|--------|-------|-------|-------------|
| Agent一等公民 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 权限矩阵 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 实时协作 | 部分 | ✅ | ✅ | ✅ | ✅ |
| 审计日志 | 基础 | ✅ | ✅ | ✅ | ✅ |
| 任务依赖 | ❌ | ✅ | ✅ | ✅ | ✅ |
| Pipeline | ❌ | ✅ | ✅ | 部分 | ✅ |
| Gantt图 | ❌ | 🚧 | ❌ | ✅ | ✅ |
| 评论系统 | ❌ | ✅ | ❌ | ✅ | ✅ |
| 分析仪表板 | 基础 | ✅ | ✅ | ✅ | ✅ |
| Agent绩效评分 | ❌ | ✅ | ✅ | ❌ | ❌ |
| LLM热切换 | ❌ | ✅ | ✅ | ❌ | ❌ |
| 多通知渠道 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 移动端 | ❌ | 🚧 | 部分 | ✅ | ✅ |

---

## 优先级与资源规划

### 人力配置建议
```
Phase 1 (6周): 2-3人
- 1人 Backend (看板增强、权限、审计)
- 1人 Frontend (UI组件、WebSocket)
- 0.5人 DevOps (部署、CI/CD)

Phase 2 (12周): 3-4人
- 1人 Backend (编排引擎、分析)
- 1人 Frontend (实时协作、图表)
- 1人 Integration (Dify对接、外部集成)
- 0.5人 QA/DevOps

Phase 3 (12周): 2-3人
- 1人 Backend (集成生态)
- 1人 Frontend (移动端、高级UI)
- 0.5人 DevOps
```

### 里程碑
```
6月底: Phase 1 beta版本上线
  - 基础看板体验+权限矩阵+审计
  - 所有功能可自测
  
9月底: Phase 2 企业级版本
  - 多Agent编排+协作深化
  - 生产就绪（SLA 99.5%）
  
12月底: Phase 3 生态版本
  - 完整集成能力
  - 准备商业化
```

---

## Dify集成策略（Dify-First）

### 核心原则
**工作流与知识管理 → Dify负责**  
**看板、权限、协同 → AMC负责**

### 具体分工
```
Dify侧：
- 工作流定义与执行
- 知识库管理
- 提示词工程
- 模型选择与切换
- 工具/API集成
- 日志与调试

AMC侧：
- 呈现Dify工作流为可执行"任务类型"
- 基于工作流标签实现Agent能力声明
- 调用Dify API执行任务
- 记录Dify的执行结果+Token消耗
- 权限/协同/审计全栈处理
```

### API集合
```
AMC → Dify:
- GET /workflows                    # 列表所有工作流
- POST /workflows/{id}/runs         # 执行工作流
- GET /runs/{id}                    # 获取执行结果
- GET /runs/{id}/logs              # 获取执行日志

Dify → AMC (Webhook):
- 工作流执行完成事件
- 错误/超时事件
- Token消耗统计事件
```

### 数据模型映射
```
Dify Workflow          →  AMC Task Type
├─ 名称                →  taskTypeId
├─ 输入参数             →  requiredInput
├─ 输出格式             →  expectedOutput
├─ 时间限制             →  deadline
└─ 模型配置             →  Agent推荐模型

Workflow Execution     →  WorkUnit
├─ 执行ID              →  taskId
├─ 输入                →  title/description
├─ 输出                →  materials
├─ 状态                →  status
├─ Token消耗           →  costMetrics
└─ 日志                →  executionLog
```

---

## 成功指标

### 用户端
- 90%任务在SLA内完成（deadline内）
- Agent首次通过率 > 85%
- 用户对系统响应速度评分 > 4.5/5

### 运营端
- 系统可用性 > 99.5%
- 平均响应时间 < 500ms
- 审计日志完整率 100%

### 商业端
- 支持100+并发Agent
- 支持10k+月活任务
- 客户续费率 > 80%

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Dify API变更 | 集成失效 | 中 | 定期同步Dify版本 + 版本兼容性测试 |
| WebSocket扩展性 | 高并发掉线 | 低 | 采用Redis Pub/Sub + 心跳机制 |
| 权限管理复杂度 | 实现延期 | 中 | Phase 1保持简单，逐步演进 |
| 团队协作冲突 | 数据不一致 | 中 | 实施Operational Transform + 冲突解决策略 |
| 数据迁移困难 | 现有功能破坏 | 低 | 谨慎进行schema变更 + 充分测试 |

---

## 下一步行动

### Phase 1 已完成交付项
- [x] 开发环境搭建与集成配置（PostFast/Prisma/NextJS 路由）
- [x] 权限与安全系统重构（彻底防护 Agent 越权指派）
- [x] 完整审计日志实现（引入 `AuditLog` 库以及看板与 API 动作追踪）
- [x] OpenAPI YAML-to-JSON 自动转换兼容（满足 API 校验套件）
- [x] 浏览器插件长连接桥（SSE 通道、Pending/Resolve 响应闭环）
- [x] Mock Dianping/Meituan 商家平台模拟器（`/mock-merchant`）
- [x] 看板侧配置抽屉与插件桥在线状态实时检测
- [x] 管理员日志高亮及插件桥动作专用过滤（`/admin`）

### Phase 2 下一步行动（Sprint 1 启动中）
- [ ] **【P0】任务关联与 DAG 阻塞编排**：设计 `dependencies` 表结构与阻断拦截路由
- [ ] **【P0】人机评论留言系统**：完成 `Comment` 基础架构与前端富文本渲染
- [ ] **【P1】模型动态路由管理**：与 Dify 平台热切换机制接口对接
- [ ] **【P1】效能看板数据统计**：基于审计日志跑通首次通过率与平均时长指标

---

**产品负责人**: [待确认]  
**版本**: 2.0 (2026-05-10)  
**下次审阅**: 2026-06-30
