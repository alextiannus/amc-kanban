export type PlanId = 'starter' | 'essential' | 'advanced'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  monthlyUsd: number
  promoMonthlyUsd?: number
  description: string
  includes: string[]
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
    name: 'STARTER',
    monthlyUsd: 189,
    promoMonthlyUsd: 108,
    description: '英文平台基础运营自动化方案',
    includes: [
      'Instagram / Facebook 英文平台基础运营',
      'AI 自动图文内容创作与发布',
      'Google Map 配置与评论监控',
      '推广效果周报（内容与互动数据）',
      '标准远程交付支持',
    ],
  },
  {
    id: 'essential',
    name: 'ESSENTIAL',
    monthlyUsd: 600,
    description: '英文平台增强运营与品牌陪跑方案',
    includes: [
      'Instagram / Facebook / TikTok 英文平台运营',
      'AI 自动图文内容创作与发布',
      '专属品牌主理人（品牌运营计划与素材库整理）',
      'Google Map 配置与评论监控',
      '推广效果周报（内容与互动数据）',
      '每月 1 次免费博主探店',
    ],
  },
  {
    id: 'advanced',
    name: 'ADVANCED',
    monthlyUsd: 1600,
    description: '不限英文平台的高阶增长运营方案',
    includes: [
      '不限数量英文平台运营（按可接入渠道）',
      'AI 自动图文内容创作与发布',
      '专属品牌主理人（品牌运营计划与素材库整理）',
      'Google Map 配置与评论监控',
      '推广效果周报（内容与互动数据）',
      '每月 1 次免费博主探店',
      '每季度 1 次增粉营销活动',
    ],
  },
]

export const SUBSCRIPTION_ADDONS: AddonItem[] = [
  {
    id: 'xiaohongshu',
    name: '小红书 Xiaohongshu',
    pricing: 'monthly',
    usd: 300,
    description: '小红书内容规划、发布与互动管理。',
    details: ['每周选题与笔记规划', '图文/短视频内容协助发布', '评论区互动与私信线索整理'],
  },
  {
    id: 'dianping',
    name: '美团点评 Meituan Dianping',
    pricing: 'monthly',
    usd: 100,
    description: '点评监控、差评预警与回复建议。',
    details: ['差评预警与回复建议', '店铺评分趋势跟踪', '重点负评升级处理建议'],
  },
  {
    id: '12eat',
    name: '12Eat 唐人街外卖',
    pricing: 'monthly',
    usd: 60,
    description: '外卖平台菜单、活动与评价协同。',
    details: ['菜单与活动位更新建议', '基础文案优化', '订单评价监控'],
  },
  {
    id: 'grab_foodpanda',
    name: 'Grab / Foodpanda',
    pricing: 'monthly',
    usd: 180,
    description: '双外卖平台菜单与促销协同。',
    details: ['双平台菜单与视觉素材维护', '促销活动排期建议', '差评工单追踪'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    pricing: 'monthly',
    usd: 300,
    description: 'YouTube 视频选题、发布与复盘。',
    details: ['选题脚本与封面标题建议', '视频发布排期', '基础数据复盘'],
  },
  {
    id: 'tiktok',
    name: '抖音 / TikTok',
    pricing: 'monthly',
    usd: 300,
    description: '短视频选题、发布与互动优化。',
    details: ['热点选题与脚本方向', '发布节奏管理', '评论互动与话题优化建议'],
  },
  {
    id: 'onsite_photo',
    name: '现场拍摄服务',
    pricing: 'one_time',
    usd: 380,
    description: '半天现场拍摄，交付图文与视频素材。',
    details: ['约半天现场拍摄', '交付菜品/环境素材包', '可用于社媒与广告投放'],
  },
  {
    id: 'influencer_visit',
    name: '博主探店服务',
    pricing: 'one_time',
    usd: 2400,
    description: '15 位博主探店整合套餐。',
    details: ['8 位千粉博主', '5 位 5 千粉以上博主', '2 位万粉以上博主'],
  },
  {
    id: 'multi_store_support',
    name: '多门店运营支持（Add-on）',
    pricing: 'monthly',
    usd: 200,
    description: '为新增门店提供独立运营协同支持，按门店计费。',
    details: ['每新增 1 个门店 +USD 200/月', '门店级内容与任务协同', '适用于连锁门店扩展'],
  },
]

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    key: 'channels',
    label: '覆盖渠道',
    values: {
      starter: 'Instagram + Facebook',
      essential: 'Instagram + Facebook + TikTok',
      advanced: '不限英文平台（按可接入渠道）',
    },
  },
  {
    key: 'contentType',
    label: '内容类型',
    values: {
      starter: '图文内容',
      essential: '图文内容',
      advanced: '图文内容',
    },
  },
  {
    key: 'frequency',
    label: '发布频率',
    values: {
      starter: '可每日发布（素材商家提供）',
      essential: '可每日发布',
      advanced: '可每日发布（不限英文平台）',
    },
  },
  {
    key: 'google',
    label: 'Google Map 运营',
    values: {
      starter: '配置 + 评论监控 + 打分优化',
      essential: '配置 + 评论监控 + 打分优化',
      advanced: '配置 + 评论监控 + 打分优化',
    },
  },
  {
    key: 'report',
    label: '报告机制',
    values: {
      starter: '推广效果周报',
      essential: '推广效果周报',
      advanced: '推广效果周报 + 季度复盘',
    },
  },
  {
    key: 'onsite',
    label: '拍摄/探店权益',
    values: {
      starter: '无',
      essential: '每月 1 次免费博主探店',
      advanced: '每月 1 次免费博主探店 + 每季度 1 次增粉营销活动',
    },
  },
  {
    key: 'brandManager',
    label: '品牌主理人支持',
    values: {
      starter: '标准支持（无专属主理人）',
      essential: '专属品牌主理人',
      advanced: '专属品牌主理人（增长策略优先）',
    },
  },
  {
    key: 'multiStore',
    label: '多门店支持',
    values: {
      starter: '可加购（每店 +USD 200/月）',
      essential: '可加购（每店 +USD 200/月）',
      advanced: '可加购（每店 +USD 200/月）',
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
