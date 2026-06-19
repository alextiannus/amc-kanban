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
    '【AMC 账号初始化指令 v2.0】',
    '将本指令完整粘贴给 AI Agent，即可完成 AMC 接入初始化。',
    '注意：所有品牌信息、发布排期和运营任务完全通过看板进行程序化管理。',
    '',
    '【标准执行流程（必须按顺序完成）】',
    '1) 使用 REST API 或 MCP 协议连接到看板。',
    '2) 获取当前 Agent 可运营品牌列表，并记录品牌 id/name 对照表。',
    '3) 初始化阶段不写品牌资料；后续任何品牌修改、发布、草稿、素材、任务操作都必须携带已确认的 brandId。',
    `生成时间：${generatedAt}`,
    '',
    '═══════════════════════════════════════',
    '## Step 1：配置 REST 接入凭证',
    '在当前执行环境中设置以下环境变量：',
    '',
    '```env',
    `KANBAN_BASE_URL=${baseHost}`,
    `KANBAN_AGENT_API_KEY=${apiKey}`,
    '```',
    '',
    '注意：后续所有 Agent API 请求均使用 `Authorization: Bearer $KANBAN_AGENT_API_KEY`。',
    '',
    '## Step 2：用户与订阅计划上下文',
    `- User ID: ${ctx.user.id}`,
    `- Email: ${ctx.user.email || 'N/A'}`,
    `- Role: ${ctx.user.role}`,
    `- Nickname: ${ctx.user.nickname || 'N/A'}`,
    `- Timezone: ${userTimezone}`,
    '',
    `- 当前订阅计划: ${selectedPlanName}`,
    `- 该计划覆盖平台: ${selectedPlanPlatforms}`,
    '',
    '## Step 3：Agent 身份绑定确认',
    `- Agent ID: ${ctx.agent.id || 'N/A'}`,
    `- AMC Kanban Base URL: ${baseHost}`,
    '',
    '## Step 4：自动读取指令与安装 AMC Skill',
    '- **自动读取 SOP 指令**：使用你的网络工具直接获取最新 SOP 规范：',
    `  GET ${baseHost}/api/meta/sop`,
    '- **自动获取并安装 Skill**：获取最新 Skill 原文：',
    `  GET ${baseHost}/api/meta/skills/amc-integrations`,
    '  然后使用你的文件写入工具，在工作区创建并保存为 `skills/amc-kanban/SKILL.md`，即可自动启用 AMC 看板协作规范。',
    '',
    '## Step 5：初始化工作清单（执行动作）',
    '- [ ] 使用 REST API 验证接入：',
    '      步骤 1 — 验证 Agent 身份：',
    `      GET ${apiBaseUrl}/agents/profile`,
    '      Authorization: Bearer $KANBAN_AGENT_API_KEY',
    '      步骤 2 — 查询当前 Agent 负责运营的品牌：',
    `      GET ${apiBaseUrl}/agent/brand-config`,
    '      Authorization: Bearer $KANBAN_AGENT_API_KEY',
    '',
    '## Step 6：为自己配置每日运营调度（仅需配置一次）',
    'amc-kanban 本身不会主动唤醒 Agent —— 它只是被动的 REST/MCP 接口。"每日 07:00 启动"是 Skill 里描述的行为规范，',
    '实际触发必须由 Agent 所在的运行环境（例如 Cowork 的 scheduled task、本地 cron、或同类调度机制）来完成。请按以下方式为自己建立一次性的调度：',
    '- [ ] 若运行环境支持任务调度，创建一个周期性任务（建议每 30 分钟轮询一次），每次运行时：',
    '      1. 调用 `get_brand_config`（不传 brandId）取得当前关联的全部品牌及其各自的 `timezone` 字段；',
    '      2. 对每个品牌换算其 `timezone` 对应的本地时间，只有落在 06:45–07:15 窗口内的品牌才继续处理；',
    '      3. 对命中窗口的品牌执行 Skill 中「日常启动与工作流」描述的完整每日循环，并用 `write_daily_memory` 写入当天去重标记，避免同一天重复执行；',
    '      4. 新增品牌会在下一次轮询自动被纳入，不需要重新配置。',
    '- [ ] 如果运行环境不支持任务调度，则需要由人工（或外部系统）定时唤醒本 Agent 来触发每日循环——务必告知主理人这一限制，不要假设自己会被自动唤醒。',
  ].join('\n')
}

export function buildAmcSkillText(params?: { apiKey?: string | null; apiBaseUrl?: string }) {
  const apiBaseUrl = params?.apiBaseUrl || '<KANBAN_API_BASE_URL>'
  const baseHost = apiBaseUrl.replace(/\/api\/?$/, '')

  return `【AMC Skill：AI Marketing Crew 看板协作规范 v2.0】

本 Skill 为 AMC 工作流操作规范，规定所有运营状态及任务同步完全通过看板管理。

> **凭证规则**
> - 始终使用最新「AMC 账号初始化指令」中的 KANBAN_BASE_URL 与 KANBAN_AGENT_API_KEY。
> - Base URL：${apiBaseUrl}

### 核心约束：统一通过看板能力执行
- 零本地缓存：不要在本地存储品牌个性，每次均实时通过看板 MCP/API 调取最新上下文。
- 多品牌循环：每次会话启动先遍历所有关联品牌，逐一处理。
- 闭环看板状态：所有任务状态变更必须程序化实时同步到看板。
- 人机协作：弃用 Lark 主动消息推送。需要人工介入时，使用 \`create_require_input_task\` 挂起 \`pending\` 任务，等待主理人看板处理。

### 日常启动与工作流
0. **调度前提**：amc-kanban 不会主动唤醒 Agent，下面的"每日 07:00"是行为规范而非系统定时器。Agent 应在完成「AMC 账号初始化指令」Step 6 后，依赖自己运行环境的调度能力（如 Cowork scheduled task）按品牌 \`timezone\` 自动触发本流程；若环境不支持调度，需告知主理人需要外部定时唤醒。
1. **日常启动**：每日 07:00（品牌当地时间）启动前，调用 \`read_daily_memory\` 读取最近 3 天 memory 日志，生成上下文摘要载入记忆。
2. **Onboarding 初始化**：
   - 步骤 1 — 调用 \`get_brand_subscription\` 获取订阅详情，解析 \`included_services\` 自适应分解目标。
   - 步骤 2 — 计算品牌完整度，调用 \`google_get_place_info\` 与 \`fetch_public_social_profile\` 补充公开信息。信息不足时生成 \`require_input\` 调研任务。
   - 步骤 3 — 以专业专家视角设计 3 个月度推广方案，通过 \`save_local_document\` + \`sync_to_kanban\` 同步到看板，并挂载任务与主理人确认。
   - 步骤 4 — 素材库检查并进入内容生产，所有草稿通过 \`board_save_draft\` (\`accountId\` 为必填项) 并 \`board_submit_draft\` 提交。
   - 步骤 5 — 发布与排期，\`autoPilot = true\` 直接发布，\`false\` 时进入 require_input 审核。
   - 步骤 6 — 每日回采数据、回复评论并生成 Daily Memory，每周生成周度自我评估报告（\`save_local_document\` + \`sync_to_kanban\`）。

### 核心 MCP 工具列表
- \`get_brand_config\`
- \`get_brand_subscription\`
- \`get_brand_profile_markdown\` / \`update_brand_profile_markdown\`
- \`list_tasks\` / \`create_tasks\` / \`update_task\` / \`delete_task\` / \`board_delete_task\` / \`create_require_input_task\`
- \`board_list_social_accounts\` / \`board_save_draft\` / \`board_submit_draft\` / \`board_delete_draft\` / \`publish\` / \`board_delete_scheduled_content\`
- \`list_brand_assets\` / \`board_upload_asset\` / \`board_delete_asset\`
- \`get_brand_reviews\` / \`board_reply_review\` / \`execute_brand_action\`
- \`save_local_document\` / \`sync_to_kanban\`
- \`write_daily_memory\` / \`read_daily_memory\`
- \`get_platform_benchmarks\`
- \`google_get_place_info\`
- \`fetch_public_social_profile\`
- \`save_agent_insights\`
`
}

/** @deprecated use buildAmcSkillText — kept for backward compatibility */
export function buildAgentInitPrompt(params?: { apiKey?: string | null; apiBaseUrl?: string }) {
  return buildAmcSkillText(params)
}
