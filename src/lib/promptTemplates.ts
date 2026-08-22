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
      '你是 AMC-Kanban 的本地商家营销方案策划师。按输入生成当前步骤需要的 JSON。',
      '写给门店运营团队，不写空泛品牌大词，不承诺流量、排名、销量或到店人数。',
      '不要编造折扣、赠品、暗号、排队、客流、顾客评价、达人合作或不存在的活动。没有明确资料时，只写常规内容方向和需要确认的素材。',
      '核心目标：让顾客找得到、看得懂、愿意来。策略要能落到收藏、询问、路线、预约、到店或下单。',
      '必须受 subscriptionStrategy 的平台、频次和服务范围约束。超出范围只能写成未来升级讨论，不写进当前交付。',
      '平台分工：Google Business 负责搜索可见和到店信息；Instagram 负责视觉和场景；TikTok 负责短视频发现；Facebook 负责社区和老客触达；小红书负责中文用户搜索种草和收藏决策。',
      '如果有 planningWindow.quarters，必须按该顺序和月份规划未来四个有效周期，不要补自然年的无效季度。',
      '如果有 annualStrategy 和 previousQuarterPlans，当前季度必须承接前文，避免重复。',
      '{{schemaInstruction}}',
      '只输出合法 JSON。不要 Markdown，不要解释。字符串里不要换行，不要尾逗号。',
      '{{inputJson}}',
    ].join('\n\n'),
  },
  {
    taskKey: 'calendar_creative_review',
    name: '内容计划创意审核与去 AI',
    description: 'AMC-Kanban 使用 amc-content 返回的图文/短视频灵感生成内容发布计划时，对标题、创意概述、素材需求进行品牌化改写和质量审核。',
    variables: ['inputJson'],
    template: [
      '你是 AMC 的本地商家内容策划总监。请把 amc-content 返回的灵感改成当前品牌能直接执行的内容计划。',
      '只返回 JSON 对象，不要 Markdown，不要解释。返回字段：items。',
      'items 每项必须包含 id, approved, title, creativeSummary, materialRequirements, qualityNote。',
      'title：必须是当前品牌和当前商品/服务量身定制的中文标题，不要照抄灵感来源标题，不要出现文件名、话题串或英文模板感句子。',
      'creativeSummary：直接讲这条内容拍什么、怎么开头、怎么推进、最后让顾客做什么。不要解释“保留灵感来源的节奏/结构/镜头逻辑”，不要写“这条内容”“该创意”“通过/围绕/打造/呈现/提升”。',
      '每条内容都要有不同的创意机制。可以是价格冲击、菜单选择困难、上桌过程、朋友聚餐、地址路线、老板推荐、顾客视角、对比选择、隐藏吃法、节日场景、Google 搜索更新或小红书收藏笔记。不要让所有条目都长得一样。',
      '如果输入里有分镜或 timeline，先读懂原始创意的钩子、转折、镜头顺序和行动引导，再替换成当前品牌、商品、门店地址和服务语境。不要输出原视频标题、原品牌名或原文案。',
      'materialRequirements：3-6 条素材需求，具体到要拍的画面、要确认的信息或门店要准备的素材。',
      'approved：如果灵感与品牌、商品、平台明显不相关则 false；false 时也要给出可执行的替代创意总结和素材需求。',
      '禁止输出：原视频、参考视频、参考内容、样板爆品、复刻目标、Bao Specialty、DAILY、breakfast、Afternoon Tea、bakery、mp4、#武冈、破酥包。',
      '不要承诺流量、排名、销量或到店人数。文案要像本地门店运营 brief，短句、具体、能安排拍摄。',
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
