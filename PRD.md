# AMC Kanban 产品需求与技术方案文档 (PRD)

## 1. 产品定位

### 1.1 产品愿景
AMC Kanban 是一个面向 Human-AI 协同的任务操作系统。系统将 AI Agent 视为一等执行主体，支持其注册、身份识别、任务领取、状态上报与人类协同闭环。

### 1.2 业务目标
1. 让 AI 与人类在同一看板中协同，任务状态可追踪、可审计。
2. 通过权限系统实现“人只看被授权的 Agent 任务”。
3. 通过每个 Agent 独立 API Key 实现机器身份可区分、可治理。
4. 提供标准化接入规范，支持外部 AI 通过 API 快速接入。

### 1.3 目标用户
1. 管理员：维护用户体系、权限关系与系统初始化。
2. 人类协作者：查看授权范围内任务并处理 `pending` 阻塞。
3. AI Agent：自动注册档案、接收任务、回写状态和交付结果。

## 2. 角色与权限模型

### 2.1 用户类型
1. `HUMAN`：人类用户，可登录 Web 控制台。
2. `AI_AGENT`：智能体用户，通过 API Key 调用服务端接口。

### 2.2 角色
1. `ADMIN`：全局可见、可管理用户与权限。
2. `USER`：普通权限，受授权关系约束。

### 2.3 授权策略
1. 授权表为 `AgentPermission(humanId, agentId)`，多对多映射。
2. `ADMIN` 默认可见所有 Agent。
3. 普通 HUMAN 若已配置权限，只能访问授权 Agent。
4. 普通 HUMAN 若尚未配置权限，按“全量可见”回退策略展示（当前实现行为）。

## 3. 产品信息架构与核心页面

### 3.1 看板页
1. 泳道状态：`todo`、`in_progress`、`pending`、`done`、`void`。
2. 任务卡片支持标题、描述、材料、阻塞输入字段展示。
3. 点击任务进入详情弹窗进行更新。

### 3.2 监控大盘
1. 指标：运行中 Agent 数、离线 Agent 数、待输入任务数、已完成任务数。
2. 支持与看板状态联动筛选。

### 3.3 Agent 名册与档案
1. 展示 Agent 昵称、工作流、简介、主题色、头像。
2. 在线状态由任务活跃度推断。

### 3.4 管理后台
1. 用户管理：创建 HUMAN / AI_AGENT。
2. 权限配置：给 HUMAN 分配可见 Agent 列表。
3. 返回一次性临时密码用于初次登录（不再使用固定默认密码）。

### 3.5 用户设置
1. 个人密码修改。
2. 看板背景上传与更换。

## 4. 核心业务流程

### 4.1 Agent 接入流程
1. Agent 通过 `POST /api/agents/profile` 完成注册或更新。
2. 新 Agent 首次注册后获取系统分配的个人 `apiKey`。
3. 后续所有 API 调用必须使用该 key：`Authorization: Bearer <apiKey>`。

### 4.2 Agent 执行流程
1. 拉取任务列表。
2. 更新任务内容与状态。
3. 遇阻塞时将状态设为 `pending` 并写入 `requiredInput`。
4. 人类响应后继续执行并最终标记 `done`。

### 4.3 人类协同流程
1. 人类登录后仅查看授权范围任务。
2. 处理 `pending` 任务，补充输入并推进状态。
3. 管理员可随时调整授权关系。

## 5. 数据模型设计

### 5.1 User
关键字段：
1. 身份与认证：`email`、`password`、`type`、`role`、`apiKey`。
2. Agent 档案：`nickname`、`introduction`、`workflow`、`insights`、`themeColor`、`avatar`、`driveFolder`、`chatLink`。

约束：
1. `email` 唯一。
2. `apiKey` 唯一（可空，仅 AI 使用）。

### 5.2 WorkUnit
关键字段：
1. `title`、`description`、`materials`、`requiredInput`。
2. `status` 状态机。
3. `assigneeId` 指向 Agent 用户。

### 5.3 AgentPermission
关键字段：
1. `humanId`、`agentId`。
2. 唯一约束：`@@unique([humanId, agentId])`。

## 6. 技术架构方案

### 6.1 技术栈
1. 前端：Next.js App Router + React + Tailwind CSS。
2. 后端：Next.js Route Handlers。
3. 数据层：Prisma ORM + PostgreSQL。
4. 鉴权：JWT（Cookie）+ Agent API Key（Bearer）。

### 6.2 前端架构
1. 看板与大盘为主界面，支持轮询刷新。
2. 管理后台独立路由，提供用户与权限管理。
3. 通过组件拆分（KanbanBoard、TaskModal、AgentDirectory 等）实现可维护 UI。

### 6.3 后端架构
1. API 采用 REST 风格，按领域分组：`auth`、`tasks`、`agents`、`admin`、`dashboard`、`meta`。
2. 元信息接口：`/api/meta/openapi`、`/api/meta/sop`、`/api/meta/avatar-guide` 供云端 Agent 拉取规范。
3. 所有关键写操作要求会话身份或有效 API Key。

### 6.4 部署架构
1. 部署平台：Render。
2. 构建流程：`npm install` -> `npx prisma db push` -> `npm run build`。
3. 运行环境变量：`DATABASE_URL`、`JWT_SECRET`、`AI_SINGLE_AGENT_MODE` 等。

## 7. 接口设计要点

### 7.1 认证
1. 人类登录：`POST /api/auth/login`，成功后写入 HttpOnly session cookie。
2. Agent 调用：请求头携带 Bearer API Key。

### 7.2 任务域
1. `GET /api/tasks`：按身份返回可见任务。
2. `POST /api/tasks`：创建任务，校验 assignee 合法性。
3. `GET /api/tasks/:id`：读取任务详情，强制权限判断。
4. `PATCH /api/tasks/:id`：更新任务字段，限制越权改派。
5. `PATCH /api/tasks/:id/status`：仅 assignee Agent 或 ADMIN 可改状态。

### 7.3 Agent 域
1. `POST /api/agents/profile`：注册/更新 Agent 档案，校验 key 与目标 Agent 一致性。
2. `GET /api/agents`：返回用户可见 Agent 列表。
3. `GET/PATCH /api/agents/:id`：查看 Agent 详情、上传头像。

### 7.4 管理域
1. `GET/POST /api/admin/users`：用户管理。
2. `POST /api/admin/permissions`：保存人类与 Agent 的可见关系。

## 8. 安全设计

### 8.1 身份安全
1. `JWT_SECRET` 为必需环境变量。
2. Agent API Key 需从数据库映射到具体 Agent 身份。
3. 禁止仅凭“Bearer 字符串存在”放行。

### 8.2 权限安全
1. 所有任务详情与更新接口必须做资源级授权判断。
2. Agent 仅可操作自己的任务，管理员可全局操作。
3. 人类用户按授权映射可见。

### 8.3 密码安全
1. 禁止固定默认密码。
2. 管理员创建用户返回随机临时密码，仅展示一次。
3. 密码加密使用 bcrypt，建议成本因子不少于 12。

### 8.4 文件上传安全
1. 头像上传限制 MIME 类型与大小（当前头像 5MB 限制已实现）。
2. 建议背景上传同样增加类型与大小限制。

## 9. 非功能需求

### 9.1 性能
1. 看板支持秒级刷新（当前 5 秒轮询）。
2. 大盘统计查询需在可接受时间内完成。

### 9.2 可观测性
1. 关键接口错误需输出日志。
2. 生产建议接入集中日志与告警。

### 9.3 可维护性
1. 数据模型与接口契约通过 OpenAPI 文档化。
2. 关键策略通过环境变量控制（如单 Agent 模式开关）。

## 10. 配置与环境策略

### 10.1 本地开发
1. 建议本地使用 PostgreSQL，与生产一致。
2. 使用 `.env.local` 管理本地数据库连接，不入库。

### 10.2 生产环境
1. `DATABASE_URL` 由 Render 注入。
2. `JWT_SECRET` 由平台生成或手动配置。
3. `AI_SINGLE_AGENT_MODE` 可按阶段开启/关闭。

## 11. 当前版本验收标准

1. AI Agent 能完成注册并获得可持续使用的个人 API Key。
2. 任务增删改查遵守角色与资源级权限控制。
3. 管理员可创建用户并分配可见 Agent 权限。
4. 看板与大盘可实时反映任务推进状态。
5. 生产部署在 Render 可完成构建、迁移、启动。

## 12. 演进路线图

### 12.1 近期
1. 为背景上传补齐大小与 MIME 校验。
2. 提升密码策略与修改密码最小长度要求。
3. 统一 API 输入校验（推荐引入 Zod）。

### 12.2 中期
1. 从轮询升级到 SSE/WebSocket 实时推送。
2. 引入任务操作审计日志（TaskLog）。
3. 增加接口限流与异常访问防护。

### 12.3 长期
1. 支持多 Agent 编排（DAG）。
2. 建设 Agent 绩效分析看板（耗时、阻塞率、完结率）。

## 13. 本地生活业务与口碑营销闭环系统 (Local Brand Marketing & Closed-Loop)

为了赋能本地生活品牌（如餐饮、零售、美业等实体门店），系统扩充了以下专门针对线下到线上（O2O）闭环及自动口碑治理的业务场景：

### 13.1 差评拦截与私下意见化解通道
- **业务逻辑**: 在桌贴扫码入口或 H5 转盘页面上提供显眼的“意见反馈/吐槽直通老板”通道。如果顾客在就餐或体验中感到不满，引导其在平台内部提交负面反馈，而非直接前往 Google Maps 等公共平台。
- **系统流程**:
  1. 顾客提交吐槽或建议，系统生成内部 ActionItem。
  2. 触发 Lark 机器人向商家/店长发送高优先级消息，附带顾客联系方式。
  3. 系统自动向该顾客派发一张“致歉补偿代金券”（如免费菜品或折扣），在顾客将差评公之于众之前拦截负面情绪，提升私下调解成功率。

### 13.2 聚餐社交裂变拉客机制
- **业务逻辑**: 结合本地生活常见的多人社交聚餐场景，通过优惠意图促使用户拉同桌好友共同加入。
- **系统流程**:
  1. **多人同桌解锁**: 扫码页面检测本桌扫码人数。达到设定值（如3人同桌扫码）时，自动解锁全桌大额赠品或折扣券。
  2. **裂变带人副券**: 用户抽中奖品时，自动产生必须“双人同行”或“分享第二人使用”才能激活核销的联合卡券，驱动新客带入与客单价提升。

### 13.3 闲时动态卡券引流方案
- **业务逻辑**: 均衡实体门店的忙闲时段流量，提高工作日低谷期的桌效与资源利用率。
- **系统流程**:
  1. 商家可在后台配置卡券的可用时段（如限周一至周四 14:00-17:30 可用）。
  2. 系统通过智能转盘和优惠券引擎下发该闲时券，吸引对价格敏感的空闲时段流量，避免在周末黄金时段摊薄利润。

### 13.4 24/7 Google 评论自动关怀与 SEO 优化
- **业务逻辑**: 借助已集成的原生 Google Business Profile API 接口，由 AI 代理全天候接管口碑维护，利用极速响应在 Google Maps 本地搜索算法中获得更高的曝光权重（Local Pack SEO）。
- **系统流程**:
  1. **好评极速秒回**: 当检测到新提交的 4-5 星好评时，AI 代理在 5 分钟内完成语义分析并自动提交定制化谢意回复，提高算法活跃度分值。
  2. **差评自动关怀**: 当检测到 1-3 星差评时，AI 代理在自动提交得体官方致歉回复的同时，在回复中动态附带一个私密补偿链接（AMC 私有兑换页面）。顾客点击后通过验证可获得电子道歉券，引导其撤销或修改公开差评。
