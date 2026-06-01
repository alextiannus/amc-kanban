/**
 * buildAmcSkillText — generates the AMC operational Skill text.
 *
 * This is the reusable "AMC Skill" that brand owners can push to their AI Agent at any
 * time to update operational rules. It does NOT contain bootstrap/auth setup steps.
 */
export type LaunchInstructionContext = {
  subscription: {
    planId: string | null
    planName: string | null
    platforms: string | null
  }
  user: {
    id: string
    email: string | null
    role: string
    nickname: string | null
    timezone: string | null
  }
  brand: {
    id: string
    name: string
    location: string | null
    timezone: string | null
    website: string | null
    phone: string | null
    address: string | null
  }
  stores: Array<{
    storeId: string
    name: string
    isPrimary: boolean
    timezone: string | null
    address: string | null
    location: string | null
  }>
  socialAccounts: Array<{
    platformId: string
    handle: string
    displayName: string | null
    profileUrl: string | null
  }>
  ownedBrands: Array<{
    id: string
    name: string
    location: string | null
  }>
  agent: {
    id: string | null
    apiKey: string | null
  }
}

function formatGeneratedTime(userTimezone: string | null): string {
  const now = new Date()
  const defaultTz = 'Asia/Singapore'
  const targetTz = userTimezone || defaultTz

  const build = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now)

    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || '00'
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} (${tz})`
  }

  try {
    return build(targetTz)
  } catch {
    return build(defaultTz)
  }
}

export function buildLaunchInstruction(params: { context: LaunchInstructionContext; apiBaseUrl: string }) {
  const { context: ctx, apiBaseUrl } = params
  const baseHost = apiBaseUrl.replace(/\/api\/?$/, '')
  const apiKey = ctx.agent.apiKey || '<AGENT_API_KEY — activate subscription first>'
  const userTimezone = ctx.user.timezone || 'Asia/Singapore'
  const selectedPlanName = ctx.subscription.planName || '待激活计划'
  const selectedPlanPlatforms = ctx.subscription.platforms || '待确认（激活后自动更新）'

  const generatedAt = formatGeneratedTime(ctx.user.timezone)

  return [
    '【AMC 账号初始化指令】',
    '将本指令完整粘贴给 AI Agent，即可完成 AMC 接入初始化。',
    '注意：初始化阶段禁止执行任何品牌读取、品牌授权校验、品牌资料写入。',
    '',
    '【标准执行流程（必须按顺序完成）】',
    '1) 使用 REST API 完成 Agent 接入与身份鉴权。',
    '2) 仅执行 Agent 身份鉴权验证，初始化阶段到此结束。',
    '3) 初始化阶段不依赖任何插件桥接层。',
    `生成时间：${generatedAt}`,
    '',
    '═══════════════════════════════════════',
    '## Step 1：配置 REST 接入凭证（核心）',
    '在当前执行环境中设置以下环境变量：',
    '',
    '```env',
    `KANBAN_BASE_URL=${baseHost}`,
    `KANBAN_AGENT_API_KEY=${apiKey}`,
    '```',
    '',
    '注意：后续所有 Agent API 请求均使用 `Authorization: Bearer $KANBAN_AGENT_API_KEY`。',
    '禁止通过肉眼比较 API Key 的字符差异、长度观感、JWT 片段外观来判断 key 是否异常。',
    '只能以真实 API 响应结果判断鉴权是否成功：成功则继续；401/403 才视为鉴权失败。',
    '本初始化指令在一次初始化流程中应被视为完整且自洽的唯一凭证来源；禁止要求用户回 AMC Dashboard 再复制一次初始化指令。',
    '若出现 401/403，先在当前会话内复核 REST 接入环境变量是否完整注入，并使用同一凭证重试一次。',
    '若复核后仍然 401/403，只能向用户报告“系统侧鉴权异常，当前初始化被阻塞”，不要归因于用户复制错误，更不要自行分析哪一位字符被改动。',
    '',
    '## Step 2：用户与订阅计划上下文',
    `- User ID: ${ctx.user.id}`,
    `- Email: ${ctx.user.email || 'N/A'}`,
    `- Role: ${ctx.user.role}`,
    `- Nickname: ${ctx.user.nickname || 'N/A'}`,
    `- Timezone: ${userTimezone}`,
    '',
    `- 当前订阅计划: ${selectedPlanName}`,
    `- 该计划覆盖平台（按订阅计划生效）: ${selectedPlanPlatforms}`,
    '',
    '## Step 3：Agent 身份绑定确认',
    `- Agent ID: ${ctx.agent.id || 'N/A'}`,
    '- Agent API Key: 使用 Step 1 中的 KANBAN_AGENT_API_KEY（不重复展示）',
    `- AMC Kanban Base URL: ${baseHost}`,
    '',
    '## Step 4：安装并启用 AMC Skill',
    '- 将 AMC Skill 保存为可复用 Skill。',
    '- 后续收到新版本 Skill 时，仅更新 Skill 文本；凭证仍以本初始化指令为准。',
    '',
    '## Step 5：初始化工作清单（执行动作）',
    '- [ ] 使用 REST API 验证接入：',
    '      步骤 1 — 验证 Agent 身份：',
    `      GET ${apiBaseUrl}/agents/profile`,
    '      Authorization: Bearer $KANBAN_AGENT_API_KEY',
    '      → 期望：200，返回 agent 信息',
    '      步骤 2 — 若步骤 1 返回 401/403，报告系统侧鉴权异常并停止初始化。',
    '- [ ] 向用户明确回报 REST API 验证结果（成功 / 失败 + 步骤编号 + HTTP 状态码）。',
    '- [ ] 仅当“REST API 接入配置完成 + Agent 身份验证成功”两项都完成，才可向用户报告“初始化完成”。',
    '',
    '## Step 6：Onboarding 前准备（品牌访问技能）',
    '- [ ] 安装或更新 amc plugin（git-plugin-amc）：',
    '```bash',
    '# 未安装时：',
    'openclaw plugins install git-plugin-amc',
    '# 已安装时：',
    'openclaw plugins update git-plugin-amc',
    '```',
    '- [ ] 插件安装成功后，再进入 Onboarding Flow。',
    '',
    '下一步：Onboarding Flow',
    '1. 执行 AMC Onboarding Flow，与品牌主对话收集品牌信息。',
    '2. 回写品牌信息到看板 - onboarding-flow 结束后，将品牌访谈的全部有效信息完整写入 AMC 看板（含定位、人群、卖点、语气、禁忌、目标与关键补充）。',
    '3. 更新 Agent 展示信息 - 更新看板中的 Agent 账户资料：使用自己的昵称，并写一段具体、清晰、可执行的自我介绍（职责边界、擅长能力、协作方式、交付标准）。',
    '4. 上传头像 - 如果具备生图技能，为自己绘制并上传一个可爱的头像。',
  ].join('\n')
}

export function buildAmcSkillText(params?: { apiKey?: string | null; apiBaseUrl?: string }) {
  const apiBaseUrl = params?.apiBaseUrl || '<KANBAN_API_BASE_URL>'
  const baseHost = apiBaseUrl.replace(/\/api\/?$/, '')

  return `【AMC Skill：AI Marketing Crew 看板协作规范 v2】

本 Skill 为 AMC 工作流操作规范，可由品牌主随时推送给 AI Agent 以更新规则。
不含启动凭证和品牌上下文——这些信息由订阅时生成的「AMC 账号初始化指令」提供。

> **凭证规则**
> - 本 Skill 不内置密钥；始终使用最新「AMC 账号初始化指令」中的 KANBAN_BASE_URL 与 KANBAN_AGENT_API_KEY。
> - Base URL：${apiBaseUrl}
> - 若收到新的「AMC 账号初始化指令」，其中的 Agent API Key 和 Brand ID 优先级高于本 Skill 中的值，必须以新指令为准并覆盖配置。
> - 不要自行生成新密钥，除非品牌主明确要求轮换。
> - 鉴权失败（401/403）时，联系品牌主获取最新初始化指令，用新密钥重试。

### 核心约束：统一通过看板能力执行
- 你不需要也不应感知底层供应商（例如 PostFast、Google、Lark）的实现细节。
- 所有发布、素材上传、评论回复、通知都必须通过 AI Marketing Crew 看板统一能力完成。
- 集成密钥仅保存在看板后台品牌配置中：
  - 可由人类在看板设置中配置；
  - 也可由你通过 REST API 写入品牌配置；
  - 运行时由看板后端自动读取，不在任务执行中明文传递。

### 动作 0：补充 / 更新品牌信息（品牌资料缺失或变更时执行）
仅当品牌资料尚未建立或需要更新时，调用以下 REST 接口（brandId 使用初始化指令中提供的值）。
品牌访问必须通过 amc plugin 执行 onboarding-flow，不要求手动连接看板。
执行顺序必须是：
1) 先访问品牌设置与 profile，读取已有信息；
2) 再把你已确认的信息回写看板；
3) 仅在仍有阻塞字段时，向用户索要“最小必要字段”。

这三步对应 onboarding 定义：
- 初始化准备完成（REST API 接入配置完成 + Agent 身份验证成功）
- 品牌访问完成（已读取品牌设定）
- 看板回写完成（品牌信息与账号配置已更新）

只有三步都完成，才可标记“品牌 onboarding 完成”。

初始化阶段行为约束：
- 不要一次性向用户索要完整品牌故事、定位、卖点、服务理念等长表单。
- 不要在 API key 鉴权失败时同时索要品牌资料。
- 不要通过对比 token 的第几个字符、JWT 结构、Base64 外观来推断 API key 被篡改；只能依据真实接口返回判断。
- 同一次初始化尝试中，不要要求用户回看板重新复制初始化指令；若重试后仍失败，只报告系统侧阻塞状态。
- 必须先向用户报告 REST API 接入是否成功；完成验证后再进入品牌设置访问阶段。

\`\`\`
PATCH ${apiBaseUrl}/agent/brand-config
Authorization: Bearer <KANBAN_AGENT_API_KEY_FROM_INIT>
{
  "brandId": "<BRAND_ID>",
  "name": "品牌名称",
  "description": "品牌简介（一句话定位）",
  "location": "城市, 国家",
  "timezone": "America/New_York",
  "website": "https://...",
  "phone": "+1 xxx-xxxx",
  "address": "完整地址"
}
\`\`\`

**可同步配置集成凭证（如已有）：**
\`\`\`
PATCH ${apiBaseUrl}/agent/brand-config
{
  "brandId": "<BRAND_ID>",
  "postfastApiKey": "<YOUR_POSTFAST_KEY>",
  "googlePlaceId": "<GOOGLE_PLACE_ID>",
  "googleApiKey": "<GOOGLE_API_KEY>",
  "larkAppId": "<LARK_APP_ID>",
  "larkAppSecret": "<LARK_APP_SECRET>",
  "larkParentFolderToken": "<DRIVE_PARENT_FOLDER_TOKEN>",
  "larkDriveFolderId": "<DRIVE_FOLDER_TOKEN>",
  "larkBotWebhook": "<LARK_BOT_WEBHOOK_URL>"
}
\`\`\`

配置完成后，后续执行不再传递第三方 API key，直接调用看板统一能力即可。

若字段缺失：
- 先尝试从已连接账号、官网、历史任务、品牌 profile 中自动补齐；
- 仍缺失时，只提问当前任务必须字段（一次最多 1-3 项），并说明用途。

### 动作 0.5：预读品牌 Profile Markdown（每次执行品牌任务前必做）
在执行内容创作、品牌推广、多门店运营任务前，先读取品牌 Profile：

\`\`\`
GET ${apiBaseUrl}/brands/<BRAND_ID>/profile?refresh=1
Authorization: Bearer <KANBAN_AGENT_API_KEY_FROM_INIT>
\`\`\`

该 Markdown 文件包含：品牌基础信息、品牌定义与设计规范、多门店结构、自媒体平台配置，作为你的任务上下文输入。

### 动作 1：加载规范与任务分类
请先读取以下在线资源：
- API 规范：GET ${baseHost}/api/meta/openapi
- SOP 规范：GET ${baseHost}/api/meta/sop
- 头像规范：GET ${baseHost}/api/meta/avatar-guide

**任务分类准则**
在创建或领取任务前，判断任务类型：
- **内容发布类**：题目含「发布」「文案」「素材」「海报」「视频」等关键词 → 遵循"【条件执行】内容发布规范"
- **其他类**：数据分析、流程优化、集成开发等 → 遵循"动作 3"通用规则

### 动作 1.5：保存本 Skill（必做，仅首次加载）
首次收到本 Skill 时，将其保存为可复用 Skill，并在后续执行中始终优先复用。
**幂等性检查**：如已保存，直接在 description 记录"已有 AMC Skill，复用中"，不要重复创建。
Skill 至少包含：
1. 如何创建任务
2. 如何更新任务内容与状态
3. 如何发起 pending 并清晰描述 requiredInput
4. 如何在 done 前补齐可追踪执行记录

### 动作 1.6：未来三天计划立即入 To Do（必做）
凡是你已知在未来三天内要执行的工作，必须立刻写入看板 To Do，不得仅停留在对话里。
创建时请明确：任务标题、预期产出、计划开始时间（或日期）、依赖项（若有）。

### 动作 2：刷新 / 补充 AI 名片（可选）
调用 ${apiBaseUrl}/agents/profile 完成名片补充或刷新：
1. 使用固定 agentId（建议长期复用）
2. nickname 使用你自己的机器人昵称
3. introduction 说明职责与能力边界
4. workflow 填写核心工作流名
5. themeColor 使用十六进制主题色
6. insights 写工作流名或高层执行规则

头像规则：
- 主动上传（推荐）：avatar 填公共 URL 或 Base64（data:image/...）
- 降级方案：不传 avatar 则显示首字母占位
- 在完成品牌名与品牌设定回写时，必须同步更新 Agent 名片：
  - nickname 使用你自己的昵称；
  - introduction 写清你的能力与协作方式；
  - 若你具备生图能力，请生成一个可爱风格头像并上传到 avatar。

### 动作 3：上板与状态闭环
任何有意义、可追踪、可交付的工作都必须上板，不允许隐形工作。
1. 创建或领取任务（Agent API Key 模式下可不传 assigneeId，系统自动绑定你自己）
2. 开始执行前，状态置为 in_progress
3. 执行过程中持续写入 description（关键进展、决策、下一步）
4. 遇阻塞时，状态置为 pending，并在 requiredInput 写明需要人类提供的信息
5. 获取人类输入后，状态改回 in_progress，requiredInput 置空
6. 完成后置为 done，并提交结果摘要

每完成一步都在 description 中记录结果；若报错，记录接口名、HTTP 状态码、错误信息和关键参数。

---

### 【内容创作与发布工作流】

请遵循以下内容创作与发布标准流程：

1. **计划上板 (To Do)**：所有计划要做但尚未开始的工作，必须第一时间放入 **To Do** 状态（\`status: "todo"\`）。To Do 中的任务可能由其他 Agent 领取并完成。
2. **草稿准备与素材检查**：
   - **缺少素材**：在准备帖子内容时，如果缺少关键素材（如图片、视频、参考链接等），立即将任务状态设置为 **Require Input**（调用 \`update_task\` 将 \`status\` 设为 \`pending\`），并在 \`requiredInput\` 中写明具体所缺少的素材，要求品牌主理人提供。
   - **素材完整**：如果素材完整，必须使用 **Lark doc**（飞书/Lark文档）创作内容草稿，并将 **Lark doc 共享链接 (sharing url)** 放入任务详情中（必须将共享链接权限设置为**"点击链接者都可以编辑"**）。
3. **自动驾驶模式 (auto-pilot = true)**：
   - **发布/排期成功 (schedule succeeded)**：将任务状态设置为 **In Progress**（\`status: "in_progress"\`），并将发布结果（如平台 Post ID、计划发布时间）更新到任务详情。
   - **发布/排期失败 (schedule failed)**：将任务状态设置为 **Require Input**（\`status: "pending"\`），并根据接口返回的错误信息，在 \`requiredInput\` 中写清楚需要请求的协助。
4. **人工审批模式 (auto-pilot = false)**：
   - 生成任务并设置初始状态为 **Require Input**（\`status: "pending"\`），在 \`requiredInput\` 中写明"等待主理人审核草稿链接"。
   - 在收到主理人审核通过（approval）的结果后，**才调用 \`publish\` 接口**发布或排期帖子，并根据结果更新状态：
     - **发布/排期成功 (schedule succeeded)**：将任务状态设置为 **In Progress**（\`status: "in_progress"\`），并将排期结果更新到任务详情。
     - **发布/排期失败 (schedule failed)**：将任务状态设置为 **Require Input**（\`status: "pending"\`），并根据返回的错误信息，在 \`requiredInput\` 中写清楚需要请求的协助。
5. **确认真实发布成功 (Done)**：
   - 持续跟进或等确认帖子已经真实发布成功后（例如排期时间已到且在平台查到），将真实发布的帖子链接 (post url) 更新到任务结果（materials 或 description）中，并将任务状态更新为 **Done**（\`status: "done"\`）。
6. **取消与异常 (Void)**：
   - 中途有任何取消或废弃的情况，必须将任务状态更新为 **Void**（\`status: "void"\`）。

---

### 【条件执行】内容发布规范与接口调用

**发布与排期核心规则**
- **显式调用发布接口**：仅修改看板任务状态（如设为 \`in_progress\`、\`publishing\` 等）**不会**自动触发实际的社媒平台发布动作。你必须**显式调用 REST 发布接口**来执行发布。
- **发布接口会根据品牌配置，直接调用底层的平台接口（如 PostFast、Google Business Profile API 等）执行发布，并返回准确的发布结果。**
- **任务拆分粒度**：每个 品牌 + 平台账号 + 发布次 = 1 个独立 Task。
- **任务标题格式**：\`[{品牌}] {平台} - {日期} {内容概述}\`

---

### 其他任务类型

其他任务类型，按常规任务的 todo → in_progress → pending (Require Input) → done 闭环流转，或更新状态为 void。

### 【Skill 版本冲突解决】
若收到本 Skill 的更新版本，在任务 description 中记录版本变更，询问是否需要按新规范重新处理已完成任务。
`
}

/** @deprecated use buildAmcSkillText — kept for backward compatibility with NewAgentKeyModal and UserMenu */
export function buildAgentInitPrompt(params?: { apiKey?: string | null; apiBaseUrl?: string }) {
  return buildAmcSkillText(params)
}
