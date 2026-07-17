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
  /** false = 软下架：仍可被既有逻辑（按 id 查找/历史订阅）引用，但新签约选择页不展示 */
  visible?: boolean
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
    monthlyUsd: 800,
    description: '消灭宣传真空，建立基础数字存在',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · 品牌主理人',
    suitableFor: '新商家，或只有微信/小红书账号、海外本地平台处于真空状态、无法持续更新的商家',
    services: [
      '30-36条/月图文内容创作',
      'Google Business + Facebook + Instagram + TikTok',
      '评论监控',
      '每月安排不少于 4 位博主探店',
      '账号风格统一化设计'
    ],
    baseline: '开通后 60 天内各平台商家信息完整展示，持续更新有质量的内容。',
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · 品牌主理人',
      '适合：新商家，或只有微信/小红书账号、海外本地平台处于真空状态、无法持续更新的商家',
      '服务内容：',
      '1. 30-36条/月图文内容创作',
      '2. Google Business + Facebook + Instagram + TikTok',
      '3. 评论监控',
      '4. 每月安排不少于 4 位博主探店，素材拍摄，内容发布协调（博主费用含在服务费内）',
      '5. 账号风格统一化设计'
    ],
  },
  {
    id: 'essential',
    name: 'Growth · 品牌建设版',
    monthlyUsd: 3600,
    description: '全平台覆盖 + 视频内容 + 博主矩阵',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
    suitableFor: '希望确立品牌策略、明确目标客群，通过全平台覆盖、视频内容与大规模博主推广积极拉新，并通过团购等转化设计唤醒老顾客的商家',
    services: [
      '≥20条图文 + 8条短视频/月',
      '5大平台全覆盖（含小红书）',
      '评论监控与回复',
      '每月最多30位博主探店',
      '月度营销活动策划'
    ],
    baseline: '合约期 6 个月内 Google Business 平均评分提升 0.3 分以上；中英双平台持续内容更新；团购活动上线后到店量可见增长。',
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
      '适合：希望确立品牌策略、明确目标客群，通过全平台覆盖、视频内容与大规模博主推广积极拉新，并通过团购等转化设计唤醒老顾客的商家',
      '服务内容：',
      '1. ≥20条图文 + 8条短视频/月',
      '2. 5大平台全覆盖（含小红书）',
      '3. 评论监控与回复',
      '4. 每月最多30位博主探店',
      '5. 月度营销活动策划'
    ],
  },
  {
    id: 'advanced',
    name: '全域增长版',
    monthlyUsd: 5800,
    visible: false,
    description: '全平台覆盖，私域运营，精准拉新转化',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · AI 私域运营官 · AI 客服 · 品牌主理人',
    suitableFor: '已有线上基础，希望通过付费投流快速放大曝光、头部 KOL 精准种草、私域沉淀顾客资产，系统提升全链路转化率的商家',
    services: [
      '增长策略与账户搭建（合约期第 1 个月完成）：付费广告策略制定与受众分层、广告账户开设与配置（Facebook Ads / Google Ads / TikTok Ads）、竞品数字广告策略分析、私域社群框架搭建（WhatsApp / 微信群）',
      '多平台付费广告管理（每月持续）：每月不少于 4 组广告创意制作与投放、受众定向优化与 A/B 测试、每周广告表现监控与预算调配',
      '头部 KOL 合作管理：每月 2 次头部 KOL 合作（本地 10K+ 粉丝，含费用），从选人、内容创作到发布全程协调，以及内容跨平台扩散',
      '私域社群运营：社群日常活跃维护与内容推送、每月会员专属活动或优惠设计、老顾客复购唤醒流程',
      '转化追踪与优化报告：全链路数据追踪（曝光 → 点击 → 到店 → 复购）、月度广告绩效报告（含 ROAS 分析）、转化率优化建议'
    ],
    commissionNote: '广告平台消耗费用由商家独立承担；佣金分成比例按合约约定，适用于服务方主导的线上渠道带来的销售额',
    baseline: '广告稳定投放后线上引流到店量明显提升；私域社群建立后复购率可见增长；高质量 KOL 内容带来精准新客转化；全链路数据每月可查。',
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · AI 私域运营官 · AI 客服 · 品牌主理人',
      '适合：已有线上基础，希望通过付费投流快速放大曝光、头部 KOL 精准种草、私域沉淀顾客资产，系统提升全链路转化率的商家',
      '服务内容：',
      '1. 增长策略与账户搭建（合约期第 1 个月）：广告策略制定与账户开设，私域社群框架搭建',
      '2. 多平台付费广告管理：每月不少于 4 组创意制作投放，A/B 测试，监控与预算调配',
      '3. 头部 KOL 合作管理：每月 2 次头部 KOL 探店合作（10K+ 粉丝，含费用），内容跨平台扩散',
      '4. 私域社群运营：社群活跃维护与推送，会员活动，老客复购唤醒',
      '5. 转化追踪与优化：全链路追踪，月度绩效报告，转化率优化建议',
      '分成形式：$3,600/月 + 销售佣金分成（注：广告平台消耗费由商家自担；分成比例适用于服务方主导的线上销售）',
      '成果参考：广告引流到店量明显提升；私域社群建立后复购率增长；高质量 KOL 带来精准转化；全链路数据每月可查。'
    ],
  },
]

export const SUBSCRIPTION_ADDONS: AddonItem[] = [
  {
    id: 'multi_store',
    name: '多门店支持',
    pricing: 'monthly',
    usd: 200,
    description: '支持添加多个门店，共享品牌资产与 AI 员工。',
    details: ['+S$200 / 门店 / 月', '共享素材库与发布排期', '统一看板管理与多店数据监控'],
  },
  {
    id: 'onsite_photo',
    name: '专业到店内容拍摄',
    pricing: 'one_time',
    usd: 200,
    description: '半天现场专业素材与新品拍摄等专业服务，交付高清图文与短视频素材包。',
    details: ['+S$200 / 次 (含后期，包含新品专业拍摄等)'],
  },
  {
    id: 'kol_light',
    name: 'KOL 达人探店曝光包 Light',
    pricing: 'one_time',
    usd: 599,
    description: '3-5 位本地生活博主探店发布与轻量曝光套餐。',
    details: ['+S$599 / 次', '适合新品、活动或门店基础曝光'],
  },
  {
    id: 'influencer_visit',
    name: 'KOL 达人分发包 Pro',
    pricing: 'one_time',
    usd: 1200,
    description: '15 位本地生活博主（KOL/KOC）探店发布与种草覆盖整合套餐。',
    details: ['+S$1,200 / 季 (保曝光)'],
  },
  {
    id: 'dianping_ops',
    name: '开通大众点评+代运营',
    pricing: 'one_time',
    usd: 2300,
    description: '全方位大众点评门店开通与深度代运营服务，提升品牌曝光与转化。',
    details: ['+S$2,300 / 年'],
  },
  {
    id: 'ordering_site',
    name: '订座，外卖和自取独立站服务',
    pricing: 'monthly',
    usd: 220,
    description: '品牌专属独立站，支持在线订座、外卖配送与到店自取，摆脱第三方佣金。',
    details: ['+S$220 / 月'],
  },
]

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    key: 'channels',
    label: '覆盖渠道',
    values: {
      starter: 'Google Business + Facebook + Instagram + TikTok',
      essential: 'Google Business + Facebook + Instagram + TikTok + 小红书',
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
      essential: '不少于 20 条图文 + 8 条短视频',
      advanced: '付费广告创意投放 + 每月 2 次头部 KOL 合作',
    },
  },
  {
    key: 'metrics',
    label: '核心效果保障',
    values: {
      starter: '各平台信息完整，更新持续不缺席',
      essential: '6个月内 Google Business 平均分提升 0.3+ ; 团购到店量可见增长',
      advanced: '线上引流明显提升；私域复购率增长；精准拉新转化；数据每月可查',
    },
  },
]

export const ALLOWED_DURATIONS = [3, 6, 12] as const

export const DEFAULT_SUBSCRIPTION_TERMS_VERSION = 'AMC-SMSA-v1.04'

export function calculatePricing(
  planId: string,
  durationMonths: number,
  addonIds: string[],
  addonQuantities?: Record<string, number>
): PricingSummary {
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
  const recurringAddonsUsd = selectedAddons
    .filter((a) => a.pricing === 'monthly')
    .reduce((sum, a) => {
      const qty = addonQuantities?.[a.id] ?? (a.id === 'multi_store' ? 0 : 1)
      return sum + a.usd * qty
    }, 0)
  const oneTimeAddonsUsd = selectedAddons
    .filter((a) => a.pricing === 'one_time')
    .reduce((sum, a) => {
      const qty = addonQuantities?.[a.id] ?? 1
      return sum + a.usd * qty
    }, 0)
  const monthlyBaseUsd = plan.promoMonthlyUsd ?? plan.monthlyUsd
  const recurringSubtotalUsd = (monthlyBaseUsd + recurringAddonsUsd) * durationMonths
  
  // Align discounts with wizard: No discounts
  const discountPercent = 0;

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
