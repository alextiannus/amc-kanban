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
