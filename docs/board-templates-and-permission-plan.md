# AI Marketing Crew 权限隔离与泳道模板设计

更新时间：2026-05-10

## 1. 明天测试用户前的 P0 权限策略

目标：每个测试用户默认只关注自己的龙虾（AI Agent），看不到、操作不到其他用户的 Agent 与任务。

### 1.1 默认权限模型

- Admin：可见全部 Human、Agent、任务、权限配置与系统审计。
- Human 测试用户：默认 deny；只有 `AgentPermission(humanId, agentId)` 显式授权的 Agent 可见。
- AI Agent API Key：只能创建、读取、更新、切换分配给自己的任务。

### 1.2 必须覆盖的边界

- Agent 列表：非 Admin 只返回被授权 Agent。
- Agent 详情：非 Admin 无授权则 403，即使用户没有任何授权也不能 fallback 到可见全部。
- Agent secret：任何列表/详情接口不得返回 `apiKey`。
- Task 列表/详情/创建/状态：非 Admin 只限授权 Agent；Agent API Key 只限自身。
- Dashboard：非 Admin 统计只基于授权 Agent。
- Admin 权限管理：仅 Admin 可配置。

### 1.3 测试用户验收清单

为两个 Human 用户 A/B 与两个 Agent 龙虾 A/B 创建数据：

1. A 只授权 Agent A，B 只授权 Agent B。
2. A 登录：只能看到 Agent A、Agent A 的任务、Agent A 的统计。
3. A 直接访问 Agent B 详情 API：403。
4. A 创建任务给 Agent B：403。
5. A 更新 Agent B 任务状态：403。
6. Agent A API Key 创建/更新 Agent B 任务：403。
7. 所有 Agent GET 响应不得包含 `apiKey`。

## 2. 泳道看板模板系统

目标：让 AI Marketing Crew 从通用任务板升级为可配置的行业运营操作系统。

### 2.1 Board Template 数据概念

一个模板定义：

- `templateId`：如 `amc-openclaw-brand-ops`
- `name`：模板名称
- `description`：适用场景
- `lanes`：泳道定义
- `fields`：额外字段
- `defaultViews`：默认筛选/排序/分组
- `automationHints`：自动化建议
- `agentRoles`：推荐龙虾角色
- `slaRules`：提醒与升级规则

### 2.2 推荐模板类型

- AMC OpenClaw 品牌运营模板
- 软件研发模板
- 客户支持模板
- 研究项目模板
- 内容生产模板

## 3. AMC OpenClaw 品牌运营模板

定位：专门支持 OpenClaw 驱动的社交媒体、品牌运营、内容生产、发布、反馈复盘和增长实验。

### 3.1 推荐泳道

1. **Intake / 输入收集**
   - 团队想法、老板口头需求、客户反馈、热点线索、菜单/活动信息。

2. **Research / 热点与竞品研究**
   - 热点雷达、竞品内容、平台趋势、关键词、素材灵感。

3. **Planning / 内容策划**
   - 本周主题、平台组合、目标受众、发布时间、CTA。

4. **Creative Draft / 创意初稿**
   - 文案、脚本、图片 brief、短视频分镜、标题/标签。

5. **Compliance Gate / 合规与事实核查**
   - 价格、地址、营业时间、过敏原、品牌禁词、平台规则。

6. **Ready to Publish / 待发布**
   - 已确认素材与渠道，等待自动发布或人工发布。

7. **Published / 已发布**
   - 记录平台链接、发布时间、发布账号、内容版本。

8. **Monitor / 数据监控**
   - 曝光、互动、评论、私信、订单线索、异常反馈。

9. **Retrospective / 复盘学习**
   - 哪些内容有效、失败原因、下次改进、沉淀为品牌记忆。

### 3.2 推荐字段

- Brand / 品牌
- Platform / 平台：Instagram、TikTok、小红书、Facebook、Google Business Profile 等
- Content Type / 内容类型：post、reel、story、short、review reply、campaign
- Campaign / 活动
- PublishAt / 计划发布时间
- Asset Links / 素材链接
- Compliance Status / 合规状态
- Owner Agent / 负责龙虾
- Performance Metrics / 发布后数据

### 3.3 推荐 Agent 角色

- Trend Research Lobster：热点与竞品研究
- Brand Strategist Lobster：品牌策略与选题
- Copywriter Lobster：平台原生文案
- Visual Brief Lobster：视觉与短视频 brief
- Compliance Lobster：事实、价格、地址、过敏原、禁词检查
- Publisher Lobster：发布与排期
- Analytics Lobster：数据复盘与增长建议

### 3.4 极致体验方向

- 每个平台有自己的内容质量 checklist。
- 每个品牌有独立品牌记忆、禁词、菜品名、价格和门店信息。
- pending 状态专门用于“需要团队输入”的阻塞，例如价格确认、素材缺失、账号未连接。
- Published 后自动进入 Monitor，收集结果再进入 Retrospective。
- 支持一键从热点创建多平台内容任务。
- 支持把复盘结论写回品牌知识库。

## 4. 实施路线

### Sprint A：权限隔离硬化（P0）

- 修复非 Admin 无授权时可访问 Agent 详情的漏洞。
- 移除 Agent API Key 在 GET 响应中的暴露。
- 增加权限回归测试脚本。
- 准备测试用户验收清单。

### Sprint B：模板模型最小闭环

- 先不做复杂 DB；用代码配置定义内置模板。
- Board 页面支持选择模板并映射泳道。
- WorkUnit 增加 `templateId` / `laneId`（或先用 tags/materials 过渡）。

### Sprint C：AMC OpenClaw 模板产品化

- 上线 AMC OpenClaw 品牌运营模板。
- 增加品牌运营字段与默认视图。
- 增加发布/监控/复盘相关快捷操作。

### Sprint D：自动化与 Dify/OpenClaw 集成

- 模板内置推荐 Agent 角色。
- 根据泳道触发不同工作流。
- 与 OpenClaw/Feishu/社媒发布工具打通。
