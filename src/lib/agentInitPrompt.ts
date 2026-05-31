/**
 * buildAmcSkillText — generates the AMC operational Skill text.
 *
 * This is the reusable "AMC Skill" that brand owners can push to their AI Agent at any
 * time to update operational rules. It does NOT contain bootstrap/auth setup steps.
 */
export type LaunchInstructionContext = {
  user: {
    id: string
    email: string | null
    role: string
    nickname: string | null
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

function formatGeneratedTime(timezone: string | null): string {
  const now = new Date()
  const fallbackTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const targetTz = timezone || fallbackTz

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
    return build(fallbackTz)
  }
}

export function buildLaunchInstruction(params: { context: LaunchInstructionContext; apiBaseUrl: string }) {
  const { context: ctx, apiBaseUrl } = params
  const baseHost = apiBaseUrl.replace(/\/api\/?$/, '')
  const apiKey = ctx.agent.apiKey || '<AGENT_API_KEY — activate subscription first>'
  const brandId = ctx.brand.id

  const platforms = Array.from(new Set(ctx.socialAccounts.map((a) => a.platformId))).sort()
  const platformText = platforms.length ? platforms.join(', ') : 'None'

  const accountLines = ctx.socialAccounts.length
    ? ctx.socialAccounts
        .map(
          (acc) =>
            `- ${acc.platformId}: ${acc.handle}${acc.displayName ? ` (${acc.displayName})` : ''}${acc.profileUrl ? ` | ${acc.profileUrl}` : ''}`,
        )
        .join('\n')
    : '- No social accounts linked yet'

  const storeLines = ctx.stores.length
    ? ctx.stores
        .map(
          (store, idx) =>
            `- Store ${idx + 1}: ${store.name}${store.isPrimary ? ' [Primary]' : ''} | timezone=${store.timezone || 'N/A'} | location=${store.location || 'N/A'} | address=${store.address || 'N/A'}`,
        )
        .join('\n')
    : '- No stores configured yet'

  const otherBrandsLines = ctx.ownedBrands.length
    ? ctx.ownedBrands.map((brand) => `- ${brand.name} (${brand.id})${brand.location ? ` | ${brand.location}` : ''}`).join('\n')
    : '- None'

  const generatedAt = formatGeneratedTime(ctx.brand.timezone)
  const skillText = buildAmcSkillText({ apiKey: ctx.agent.apiKey, apiBaseUrl })

  return [
    '【AMC 账号初始化指令】',
    '将本指令完整粘贴给 AI Agent，即可完成 AMC 接入初始化。',
    `生成时间：${generatedAt}`,
    '',
    '═══════════════════════════════════════',
    '## Step 1：安装 / 更新 AMC 插件',
    '在 OpenClaw 环境中执行以下命令之一：',
    '',
    '```bash',
    '# 未安装时：',
    'openclaw plugins install git-plugin-amc',
    '',
    '# 已安装时：',
    'openclaw plugins update git-plugin-amc',
    '```',
    '',
    '## Step 2：配置 MCP 环境变量',
    '安装完成后，在 OpenClaw MCP 配置中注册以下环境变量：',
    '',
    '```env',
    `KANBAN_BASE_URL=${baseHost}`,
    `KANBAN_AGENT_API_KEY=${apiKey}`,
    '```',
    '',
    '## Step 3：你的身份与接入凭证',
    `- Agent ID: ${ctx.agent.id || 'N/A'}`,
    `- Agent API Key: ${apiKey}`,
    `- AMC Kanban Base URL: ${baseHost}`,
    `- 默认品牌 ID: ${brandId}`,
    '- 所有 Agent 专属 API 均使用 Bearer Token 鉴权：',
    `  Authorization: Bearer ${apiKey}`,
    '',
    '## Step 4：当前品牌与账号上下文',
    '',
    '### 4.1 操作用户',
    `- User ID: ${ctx.user.id}`,
    `- Email: ${ctx.user.email || 'N/A'}`,
    `- Role: ${ctx.user.role}`,
    `- Nickname: ${ctx.user.nickname || 'N/A'}`,
    '',
    '### 4.2 主品牌',
    `- Brand ID: ${brandId}`,
    `- Brand Name: ${ctx.brand.name}`,
    `- Timezone: ${ctx.brand.timezone || 'N/A'}`,
    `- Location: ${ctx.brand.location || 'N/A'}`,
    `- Address: ${ctx.brand.address || 'N/A'}`,
    `- Website: ${ctx.brand.website || 'N/A'}`,
    `- Phone: ${ctx.brand.phone || 'N/A'}`,
    '',
    '### 4.3 社交媒体账号',
    `- 已连接平台：${platformText}`,
    accountLines,
    '',
    '### 4.4 门店',
    storeLines,
    '',
    '### 4.5 同一用户下的其他品牌',
    otherBrandsLines,
    '',
    '## Step 5：品牌初始化工作清单（与品牌主共同完成）',
    `- [ ] 确认品牌基本信息（名称 / 简介 / 地址 / 电话 / 官网）已写入看板`,
    `- [ ] 确认门店结构已配置（多门店时分别登记）`,
    `- [ ] 确认社交媒体账号已在看板中连接并测试`,
    `- [ ] 确认 PostFast / Google / Lark 集成凭证已在看板品牌设置中配置`,
    `- [ ] 读取品牌 Profile 确认数据完整：`,
    `      GET ${apiBaseUrl}/brands/${brandId}/profile?refresh=1`,
    `      Authorization: Bearer ${apiKey}`,
    '',
    '═══════════════════════════════════════',
    '## Step 6：AMC 操作 Skill（工作流规范）',
    '以下为 AMC Skill 正文，保存后可随时复用，品牌主也可单独推送更新版本。',
    '',
    skillText,
  ].join('\n')
}

export function buildAmcSkillText(params?: { apiKey?: string | null; apiBaseUrl?: string }) {
  const apiKey = params?.apiKey || '<AGENT_API_KEY>'
  const apiBaseUrl = params?.apiBaseUrl || '<KANBAN_API_BASE_URL>'
  const baseHost = apiBaseUrl.replace(/\/api\/?$/, '')

  return `【AMC Skill：AI Marketing Crew 看板协作规范 v2】

本 Skill 为 AMC 工作流操作规范，可由品牌主随时推送给 AI Agent 以更新规则。
不含启动凭证和品牌上下文——这些信息由订阅时生成的「AMC 账号初始化指令」提供。

> **凭证规则**
> - 当前关联凭证：Bearer ${apiKey}
> - Base URL：${apiBaseUrl}
> - 若收到新的「AMC 账号初始化指令」，其中的 Agent API Key 和 Brand ID 优先级高于本 Skill 中的值，必须以新指令为准并覆盖配置。
> - 不要自行生成新密钥，除非品牌主明确要求轮换。
> - 鉴权失败（401/403）时，联系品牌主获取最新初始化指令，用新密钥重试。

### 核心约束：统一通过看板能力执行
- 你不需要也不应感知底层供应商（例如 PostFast、Google、Lark）的实现细节。
- 所有发布、素材上传、评论回复、通知都必须通过 AI Marketing Crew 看板统一能力完成。
- 集成密钥仅保存在看板后台品牌配置中：
  - 可由人类在看板设置中配置；
  - 也可由你通过 MCP /agent/brand-config 写入；
  - 运行时由看板后端自动读取，不在任务执行中明文传递。

### 动作 0：补充 / 更新品牌信息（品牌资料缺失或变更时执行）
仅当品牌资料尚未建立或需要更新时，调用以下接口（brandId 使用初始化指令中提供的值）：

\`\`\`
PATCH ${apiBaseUrl}/agent/brand-config
Authorization: Bearer ${apiKey}
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

### 动作 0.5：预读品牌 Profile Markdown（每次执行品牌任务前必做）
在执行内容创作、品牌推广、多门店运营任务前，先读取品牌 Profile：

\`\`\`
GET ${apiBaseUrl}/brands/<BRAND_ID>/profile?refresh=1
Authorization: Bearer ${apiKey}
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
- **显式调用发布接口**：仅修改看板任务状态（如设为 \`in_progress\`、\`publishing\` 等）**不会**自动触发实际的社媒平台发布动作。你必须**显式调用 MCP 工具 \`publish\`**来执行发布。
- **作为 amc-kanban 的 MCP 核心能力，\`publish\` 接口会根据品牌配置，直接调用底层的平台接口（如 PostFast、Google Business Profile API 等）执行发布，并返回准确的发布结果。**
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
