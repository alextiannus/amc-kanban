export type PlanId = 'starter' | 'essential' | 'advanced'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  monthlyUsd: number
  promoMonthlyUsd?: number
  description: string
  includes: string[]
  teamConfig: string
  suitableFor: string
  services: string[]
  baseline: string
  commissionNote?: string
}

export interface AddonItem {
  id: string
  name: string
  pricing: 'monthly' | 'one_time'
  usd: number
  description: string
  details: string[]
}

export interface PlanComparisonRow {
  key: string
  label: string
  values: Record<PlanId, string>
}

export interface PricingSummary {
  durationMonths: number
  billedMonths: number
  monthlyBaseUsd: number
  discountPercent: number
  recurringSubtotalUsd: number
  recurringAfterDiscountUsd: number
  discountUsd: number
  recurringAddonsUsd: number
  oneTimeAddonsUsd: number
  totalDueUsd: number
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: '自媒体基础运营',
    monthlyUsd: 600,
    description: '“消灭宣传真空”',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · 品牌主理人',
    suitableFor: '新开业商家，或海外本地平台处于真空状态、无法持续更新的商家',
    services: [
      '1. 账号代注册与信息完善（Google Maps / Facebook / Instagram / TikTok）',
      '2. 账号统一化风格设计（按品牌特点定制）',
      '3. 建立素材库',
      '4. 每月 30 条图文内容创作与发布，不限平台数量',
      '5. Google Maps 评分优化',
      '6. 账号运营月报',
      '7. 评论监控（不含回复）',
      '8. 每月组织 1 次粉丝探店，包含手机素材拍摄'
    ],
    baseline: '开通后 60 天内各平台商家信息完整展示，持续更新有质量的内容。',
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · 品牌主理人',
      '适合：新开业商家，或海外本地平台处于真空状态、无法持续更新的商家',
      '服务内容：',
      '1. 账号代注册与信息完善（Google Maps / Facebook / Instagram / TikTok）',
      '2. 账号统一化风格设计（按品牌特点定制）',
      '3. 建立素材库',
      '4. 每月 30 条图文内容创作与发布，不限平台数量',
      '5. Google Maps 评分优化',
      '6. 账号运营月报',
      '7. 评论监控（不含回复）',
      '8. 每月组织 1 次粉丝探店，包含手机素材拍摄',
      '成果参考：开通后 60 天内各平台商家信息完整展示，持续更新有质量的内容。'
    ],
  },
  {
    id: 'essential',
    name: '品牌建设版',
    monthlyUsd: 1600,
    description: '“从基础展示到品牌建设”',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
    suitableFor: '希望确立品牌策略、全平台覆盖目标客群，通过达人推广与转化活动积极拉新唤醒老顾客的商家',
    services: [
      '1. Tier 1 全部服务内容',
      '2. 品牌策略制定（目标客群定位、差异化卖点提炼、品牌调性确立）',
      '3. 中英双语品牌话术模板与视觉风格策划',
      '4. 拓展至中文平台（小红书 / 大众点评海外版），实现英文+中文全平台覆盖',
      '5. 每月 8 条视频内容制作与发布',
      '6. 每月营销主题策划（节日活动、新品推广、季节限定等）',
      '7. 团购套餐 / 到店转化活动设计与上线',
      '8. 每季度达人探店 2-4 次（达人费用已包含在服务费内）',
      '9. 全平台评论回复，工作日 24 小时内响应',
      '10. 差评处理与口碑危机应对',
      '11. 粉丝互动运营（私信回复、互动话题发布、点赞维护）',
      '12. 品牌月报（含评分趋势、口碑关键词、粉丝画像分析）'
    ],
    baseline: '合约期 6 个月内 Google Maps 平均评分提升 0.3 分以上；中英双平台持续内容更新；团购活动上线后到店量可见增长。',
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
      '适合：希望确立品牌策略、全平台覆盖目标客群，通过达人推广与活动拉新唤醒老客的商家',
      '服务内容：',
      '1. Tier 1 全部服务内容',
      '2. 品牌策略制定（目标客群定位、差异化卖点提炼、品牌调性确立）',
      '3. 中英双语品牌话术模板与视觉风格策划',
      '4. 拓展至中文平台（小红书 / 大众点评海外版），实现中英双语全平台覆盖',
      '5. 每月 8 条视频内容制作与发布',
      '6. 每月营销主题策划（节日活动、新品推广、季节限定等）',
      '7. 团购套餐 / 到店转化活动设计与上线',
      '8. 每季度达人探店 2-4 次（达人费用已包含在服务费内）',
      '9. 全平台评论回复，工作日 24 小时内响应',
      '10. 差评处理与口碑危机应对',
      '11. 粉丝互动运营（私信回复、互动话题发布、点赞维护）',
      '12. 品牌月报（含评分趋势、口碑关键词、粉丝画像分析）',
      '成果参考：成果参考：合约期 6 个月内 Google Maps 平均评分提升 0.3 分以上；中英双平台持续内容更新；团购活动上线后到店量可见增长。'
    ],
  },
  {
    id: 'advanced',
    name: '流量扩张版',
    monthlyUsd: 2600,
    description: '“把品牌势能转化为持续营收，建立忠诚客户群体”',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · AI 私域运营官 · AI 客服 · 品牌主理人',
    suitableFor: '品牌与口碑已建立，希望通过付费投流放大曝光、高质量达人深度种草、私域沉淀顾客资产，系统提升全链路转化率的商家',
    services: [
      '1. Tier 2 全部服务内容',
      '2. 多平台付费广告管理（Facebook Ads / Google Ads / 平台推流），含素材制作与受众定向',
      '3. 每月广告效果复盘与投放策略优化',
      '4. 达人质量升级：优先匹配本地行业头部博主及高影响力 KOL（粉丝量、互动率双重筛选）',
      '5. 私域顾客社群搭建（WhatsApp / 微信群）及持续运营',
      '6. 销售转化全链路追踪（曝光 → 点击 → 到店 → 复购）',
      '7. 转化率优化建议（活动设计、菜单呈现、钩子策略）',
      '8. 品牌战略分析与竞品情报月报'
    ],
    commissionNote: '广告平台消耗费用由商家独立承担；佣金分成比例按合约约定，适用于服务方主导的线上渠道带来的销售额',
    baseline: '广告稳定投放后线上引流到店量明显提升；私域社群建立后复购率可见增长；高质量 KOL 内容带来精准新客转化；全链路数据每月可查。',
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · AI 私域运营官 · AI 客服 · 品牌主理人',
      '适合：品牌与口碑已建立，希望付费投流放大曝光、高质量达人种草、私域沉淀提升转化率的商家',
      '服务内容：',
      '1. Tier 2 全部服务内容',
      '2. 多平台付费广告管理（Facebook Ads / Google Ads / 平台推流），含素材与定向',
      '3. 每月广告效果复盘与投放策略优化',
      '4. 达人质量升级：优先匹配本地行业头部博主及高影响力 KOL',
      '5. 私域顾客社群搭建（WhatsApp / 微信群）及持续运营',
      '6. 销售转化全链路追踪（曝光 → 点击 → 到店 → 复购）',
      '7. 转化率优化建议（活动设计、菜单呈现、钩子策略）',
      '8. 品牌战略分析与竞品情报月报',
      '分成形式：$2,600/月 + 销售佣金分成（注：广告平台消耗费由商家自担；分成比例适用于服务方主导的线上销售）',
      '成果参考：广告引流到店量明显提升；私域社群建立后复购率增长；高质量 KOL 带来精准转化；全链路数据每月可查。'
    ],
  },
]

export const SUBSCRIPTION_ADDONS: AddonItem[] = [
  {
    id: 'multi_store',
    name: '多门店支持',
    pricing: 'monthly',
    usd: 80,
    description: '支持添加多个门店，共享品牌资产与 AI 员工。',
    details: ['每增加一个门店 +$80 / 月', '共享素材库与发布排期', '统一看板管理与多店数据监控'],
  },
  {
    id: 'onsite_photo',
    name: '额外现场拍摄服务',
    pricing: 'one_time',
    usd: 380,
    description: '半天现场专业素材拍摄，交付高清图文与短视频素材包。',
    details: ['菜品/环境特写拍摄', '交付原始拍摄素材', '可用于社媒日常更新与广告投流'],
  },
  {
    id: 'influencer_visit',
    name: 'KOL 达人联络套餐',
    pricing: 'one_time',
    usd: 2400,
    description: '15 位本地生活博主（KOL/KOC）探店发布与种草覆盖整合套餐。',
    details: ['8 位千粉博主', '5 位中腰部博主', '2 位头部博主'],
  },
]

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    key: 'channels',
    label: '覆盖渠道',
    values: {
      starter: 'Instagram + Facebook + TikTok',
      essential: '英文全平台 + 中文全平台 (小红书/点评海外版)',
      advanced: '中英全平台覆盖 + 付费广告渠道 + 私域顾客社群',
    },
  },
  {
    key: 'team',
    label: '团队配置',
    values: {
      starter: 'AI 内容创作官 · AI 市场调研官 · 品牌主理人',
      essential: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
      advanced: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · AI 私域运营官 · AI 客服 · 品牌主理人',
    },
  },
  {
    key: 'frequency',
    label: '内容产出',
    values: {
      starter: '每月 30 条图文内容',
      essential: '每月 30 条图文 + 8 条视频内容',
      advanced: '每月 30 条图文 + 8 条视频 + 投流素材与定向创意',
    },
  },
  {
    key: 'metrics',
    label: '核心效果保障',
    values: {
      starter: '各平台信息完整，更新持续不缺席',
      essential: '6个月内 Google Maps 平均分提升 0.3+ ; 团购到店量可见增长',
      advanced: '线上引流明显提升；私域复购率增长；精准拉新转化；数据每月可查',
    },
  },
]

export const ALLOWED_DURATIONS = [3, 6, 12] as const

export const DEFAULT_SUBSCRIPTION_TERMS_VERSION = 'AMC-SMSA-v1.01'

export function calculatePricing(planId: string, durationMonths: number, addonIds: string[]): PricingSummary {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)
  if (!plan) throw new Error('Invalid plan')
  if (!ALLOWED_DURATIONS.includes(durationMonths as (typeof ALLOWED_DURATIONS)[number])) {
    throw new Error('Invalid contract duration')
  }

  const uniqueAddonIds = Array.from(new Set(addonIds))

  const selectedAddons = uniqueAddonIds
    .map((id) => SUBSCRIPTION_ADDONS.find((a) => a.id === id))
    .filter((v): v is AddonItem => Boolean(v))

  const billedMonths = durationMonths
  const recurringAddonsUsd = selectedAddons.filter((a) => a.pricing === 'monthly').reduce((sum, a) => sum + a.usd, 0)
  const oneTimeAddonsUsd = selectedAddons.filter((a) => a.pricing === 'one_time').reduce((sum, a) => sum + a.usd, 0)
  const monthlyBaseUsd = plan.promoMonthlyUsd ?? plan.monthlyUsd
  const recurringSubtotalUsd = (monthlyBaseUsd + recurringAddonsUsd) * durationMonths
  const discountPercent = durationMonths === 12 ? 10 : 0
  const recurringAfterDiscountUsd = Math.round(recurringSubtotalUsd * (1 - discountPercent / 100))
  const discountUsd = recurringSubtotalUsd - recurringAfterDiscountUsd

  return {
    durationMonths,
    billedMonths,
    monthlyBaseUsd,
    discountPercent,
    recurringSubtotalUsd,
    recurringAfterDiscountUsd,
    discountUsd,
    recurringAddonsUsd,
    oneTimeAddonsUsd,
    totalDueUsd: recurringAfterDiscountUsd + oneTimeAddonsUsd,
  }
}
