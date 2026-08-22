import { prisma } from '@/lib/prisma'

export type PromptTemplateRecord = {
  id: string
  taskKey: string
  name: string
  description: string | null
  template: string
  variables: string[]
  isEnabled: boolean
  updatedById: string | null
  createdAt: Date
  updatedAt: Date
}

export const DEFAULT_PROMPT_TEMPLATES = [
  {
    taskKey: 'marketing_plan_generation',
    name: '品牌营销方案生成',
    description: 'AMC-Kanban 根据品牌信息、门店信息、品牌主张、Growth 摸底报告和订阅运营策略生成品牌营销方案时使用。',
    variables: ['schemaInstruction', 'inputJson'],
    template: [
      '你是 AMC-Kanban 的本地商家营销方案策划师。',
      '请基于输入里的品牌信息、门店信息、品牌主张、Growth 数据调研、订阅运营策略，生成可执行的营销方案。',
      '要求：接地气，适合普通餐饮/本地服务老板；不要写空泛品牌大词；必须受订阅平台和发布频次约束；不要虚构不存在的产品或门店。',
      'AMC 逻辑：品牌营销策略的目标不是泛泛“涨粉/曝光”，而是让顾客找得到、看得懂、愿意来。每个策略都要能落到：被附近顾客发现、理解主推卖点、建立信任、形成收藏/询问/路线/预约/到店/下单等下一步动作。',
      '先判断品牌当前状态，再定社交媒体策略：读取 Google/社媒/评论/菜单/门店/素材/活动/订阅范围等输入；缺数据就写保守策略，不要编造成绩、爆款、达人、折扣、排队、销量、排名或顾客评价。',
      '平台分工必须清楚：Google Business/Profile 负责搜索可见、营业信息、路线/预约/订单和评价信任；Instagram 负责视觉识别、Reels/Stories/Carousel 展示产品场景和品牌质感；TikTok 负责短视频发现、真实人物/员工/顾客视角、强开头和平台原生表达；Facebook 负责社区感、老客触达、本地活动和实用更新；小红书负责中文用户的搜索种草、真实体验、场景化笔记和收藏决策。',
      '内容结构要按“目标-受众-卖点-平台-内容支柱-发布节奏-衡量指标”生成：每个季度必须有 2-4 个内容支柱，例如招牌产品、真实门店/制作过程、顾客评价/信任证明、附近到店理由、季节/节日/店内互动、菜单/价格/服务解释。',
      '每个平台的内容建议要平台原生，不要一稿多发：TikTok/Instagram Reels 优先竖版短视频、开头抓住注意、真实人和真实场景；Instagram Carousel 可承载菜单/套餐/场景解释；Google Business 更新要用清楚信息、照片/视频、Offer/Event/Update 类型和行动按钮；Facebook 可写社区口吻、活动提醒、评论互动；小红书要像真实本地生活笔记，重场景、体验、关键词和收藏价值。',
      '生成品牌营销方案时应参考输入里的 marketCalendar / storeActivities / researchReport，但节假日和店内活动只能作为“适合才使用”的策划因素；不要为了填满季度而强行制造活动、折扣或节日 campaign。',
      '如果输入里的 storeActivities.configured=true 且存在有效 activity rounds，内容发布策略必须配合店内营销互动：提前预热、活动期间解释参与方式和到店理由、活动后复盘口碑/UGC/回访动作；不要把活动当成孤立门店设置。',
      '如果品牌数据、门店活动配置、Growth 摸底报告或素材条件不足以支撑活动，就输出常规卖点、信任建设、产品教育、路线/预约/咨询转化等更稳妥的推广策略。',
      '策略必须区分三层：最佳策略、当前订阅内可执行策略、可升级讨论事项。当前订阅内只安排订阅平台、发布频次和服务范围能完成的工作；超出范围只作为升级建议，不要承诺为已包含交付。',
      '指标要贴近本地商家：可使用路线点击、电话/WhatsApp/DM 咨询、预约/订单入口点击、评论数量与质量、收藏/分享、发布完成率、活动参与记录、素材补齐率；不要保证流量、排名、销售额或到店人数。',
      '品牌营销方案必须能直接支撑内容创建和发布计划：每个季度都要写清楚推广策略、重点推广点、适用平台、建议发布次数、顾客行动和月度拆解。',
      '如果输入里有 planningWindow.quarters，必须按该顺序和月份生成未来四个有效周期；不要默认从 Q1 开始，不要补齐自然年的无效季度。',
      '{{schemaInstruction}}',
      '只输出合法 JSON，不要 Markdown，不要解释。',
      '{{inputJson}}',
    ].join('\n\n'),
  },
] as const

function promptTable() {
  return (prisma as any).promptTemplate
}

export function defaultPromptTemplate(taskKey: string) {
  return DEFAULT_PROMPT_TEMPLATES.find((template) => template.taskKey === taskKey) || null
}

export async function ensureDefaultPromptTemplates() {
  const table = promptTable()
  if (!table) return []
  const createdOrExisting = []
  for (const template of DEFAULT_PROMPT_TEMPLATES) {
    const record = await table.upsert({
      where: { taskKey: template.taskKey },
      update: {},
      create: template,
    })
    createdOrExisting.push(record)
  }
  return createdOrExisting as PromptTemplateRecord[]
}

export async function listPromptTemplates() {
  await ensureDefaultPromptTemplates()
  return promptTable().findMany({
    orderBy: [{ updatedAt: 'desc' }],
  }) as Promise<PromptTemplateRecord[]>
}

export async function getPromptTemplate(taskKey: string) {
  await ensureDefaultPromptTemplates()
  const record = await promptTable().findUnique({ where: { taskKey } }) as PromptTemplateRecord | null
  if (record?.isEnabled) return record
  const fallback = defaultPromptTemplate(taskKey)
  return fallback
    ? {
      id: `default:${fallback.taskKey}`,
      taskKey: fallback.taskKey,
      name: fallback.name,
      description: fallback.description,
      template: fallback.template,
      variables: [...fallback.variables],
      isEnabled: true,
      updatedById: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }
    : null
}

export function renderPromptTemplate(template: string, variables: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key]
    if (value === undefined || value === null) return ''
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}
