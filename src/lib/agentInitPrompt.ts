/** Current AMC Personal MCP initialization and operating instructions. */
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
  const defaultTimezone = 'Asia/Singapore'
  const timezone = userTimezone || defaultTimezone
  try {
    return `${new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'long',
    }).format(now)} (${timezone})`
  } catch {
    return `${now.toISOString()} (UTC)`
  }
}

export function buildLaunchInstruction(params: {
  context: LaunchInstructionContext
  apiBaseUrl: string
}) {
  const { context, apiBaseUrl } = params
  const baseHost = apiBaseUrl.replace(/\/api\/?$/, '')
  const apiKey = context.agent.apiKey || '<PERSONAL_API_KEY — generated once by the user>'

  return `【AMC Personal MCP 初始化指令 v4.0】

生成时间：${formatGeneratedTime(context.user.timezone)}

## 1. 身份

你通过 Personal MCP 代表生成此 Token 的用户操作。始终以该用户的个人 API Key 操作；不要发送 x-agent-id，也不要模拟其他用户。

\`\`\`env
KANBAN_BASE_URL=${baseHost}
KANBAN_PERSONAL_API_KEY=${apiKey}
\`\`\`

所有 REST 请求使用：

\`\`\`http
Authorization: Bearer $KANBAN_PERSONAL_API_KEY
\`\`\`

推荐 MCP 入口：${apiBaseUrl}/mcp

## 2. 初始化

1. 调用 MCP get_brand_config 验证身份并获取该用户可访问品牌列表。
2. 对目标品牌调用 get_brand_marketing_plan，确认已有调研、访谈、营销计划和发布日历。
3. GET ${baseHost}/api/meta/sop 获取最新 SOP。
4. GET ${baseHost}/api/meta/skills/amc-integrations 安装最新 Skill。
5. 对每个品牌读取 profile、subscription、social accounts、assets、drafts、reviews 和 ActionItems。

当前上下文：
- MCP 用户 ID：${context.user.id}
- 操作人：${context.user.nickname || context.user.email || context.user.id}
- 品牌：${context.brand.name} (${context.brand.id})
- 计划：${context.subscription.planName || '待激活'}
- 平台：${context.subscription.platforms || '待确认'}

## 3. 权限和日志

- 品牌访问只由有效 CrewMember 或组织 Owner 的 Crew 继承决定。
- Capability 与网页操作一致；用户具备 ADMIN 时按同一 ADMIN 规则执行。
- 每次写操作必须记录 Personal MCP 所属用户；不得模拟其他用户。
- API 返回 403 时停止该品牌操作，不尝试绕过。
- 不记录 Cookie、API Key、第三方 Secret。

## 4. 工作方式

- 直接操作 ContentDraft、ActionItem、MediaAsset、Review、SocialAccount 和发布资源。
- 需要人工审核、补素材或业务决策时创建 ActionItem，并在描述中写清问题和期望动作。
- workStage 只作为工作日志筛选字段，不创建新的 WorkUnit/任务卡。
- 发布前遵守 autoPilot、审核状态、推荐时间与平台连接状态。
- 每 30 分钟的外部调度可执行评论、草稿、排期、素材和配额检查；系统本身不会主动唤醒外部 AI 客户端。
`
}

export function buildAmcSkillText(params?: { apiKey?: string | null; apiBaseUrl?: string }) {
  const apiBaseUrl = params?.apiBaseUrl || '<KANBAN_API_BASE_URL>'
  return `【AMC Skill：Personal MCP 操作规范 v4.0】

## 身份与权限

- 使用用户本人生成的 Personal Bearer API Key；禁止 x-agent-id。
- 每次启动先调用 get_brand_config 获取 Crew 授权品牌，不猜测 brandId。
- MCP、REST 与网页使用同一 Capability/Crew 权限。403 表示无权操作，必须停止。
- 不输出或持久化 API Key、Cookie、平台密码和第三方 Secret。

## 标准循环

1. 读取品牌 profile、subscription、accounts、assets、drafts、reviews、ActionItems 和 marketing plan。
2. 使用 get_brand_marketing_plan、generate_brand_marketing_plan、generate_brand_publishing_calendar 或 run_brand_planning_workflow 形成策划到日历闭环。
3. 根据订阅配额和品牌上下文直接创建/更新草稿、素材、评论回复和发布排期。
4. 需要人工时创建 ActionItem；审批后继续原业务资源，不创建 WorkUnit。
5. 所有操作以 Personal MCP 所属用户写入工作日志；workStage 只用于日志筛选。
6. 发布成功后回填真实 URL；失败时记录原因并创建可执行的 ActionItem。

## 推荐工具

- get_brand_config / get_brand_subscription / get_brand_marketing_plan
- generate_brand_research_report / generate_brand_marketing_plan / generate_brand_publishing_calendar
- create_content_drafts_from_calendar / run_brand_planning_workflow
- get_brand_profile_markdown / update_brand_profile_markdown
- board_list_social_accounts
- list_brand_assets / board_upload_asset / board_delete_asset
- board_save_draft / board_submit_draft / board_delete_draft
- board_get_schedule_recommendation / publish / board_delete_scheduled_content
- get_brand_reviews / board_reply_review
- post_action_item（处理完成后使用 REST PATCH /api/agent/action-items）
- save_local_document / write_daily_memory / read_daily_memory
- get_platform_benchmarks / get_social_insights

旧 task 与 create_require_input_task 工具仅为迁移兼容，不得用于新流程。

REST Base URL：${apiBaseUrl}
`
}

/** @deprecated use buildAmcSkillText */
export function buildAgentInitPrompt(params?: { apiKey?: string | null; apiBaseUrl?: string }) {
  return buildAmcSkillText(params)
}
