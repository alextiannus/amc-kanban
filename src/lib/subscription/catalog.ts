export type PlanId = 'starter' | 'essential' | 'premium' | 'advantage'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  monthlyUsd: number
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
    monthlyUsd: 229,
    description: '海外社媒代运营基础版',
    includes: [
      'Instagram & Facebook 图文内容发布',
      'Google Map 配置与评论监控',
      '中英双语内容',
      '每周舆情报告',
      '远程交付',
    ],
  },
  {
    id: 'essential',
    name: 'ESSENTIAL',
    monthlyUsd: 600,
    description: '海外社媒代运营新加坡本地版',
    includes: [
      'Instagram / Facebook / TikTok 图文发布',
      '专属品牌主理人',
      'Google Map 配置与评论监控',
      '中英双语 + 每周舆情报告',
      '赠送 1 次博主探店与现场手机拍摄',
    ],
  },
  {
    id: 'premium',
    name: 'PREMIUM',
    monthlyUsd: 1600,
    description: '海外社媒代运营增强版',
    includes: [
      'Instagram / Facebook / TikTok / 小红书 图文与视频',
      '可每天发布',
      'Google Map 配置与评论监控',
      '每月一次现场拍摄素材服务',
      '每半年一次流量激活探店推广套餐',
    ],
  },
  {
    id: 'advantage',
    name: 'ADVANTAGE',
    monthlyUsd: 3800,
    description: '连锁品牌门店运营版',
    includes: [
      '含 PREMIUM 全量服务',
      '支持最多 5 个门店协同运营',
      '超出门店每店 +USD 200 / 月（线下合同处理）',
    ],
  },
]

export const SUBSCRIPTION_ADDONS: AddonItem[] = [
  {
    id: 'xiaohongshu',
    name: '小红书 Xiaohongshu',
    pricing: 'monthly',
    usd: 300,
    description: '华人社区内容运营',
    details: ['每周选题与笔记规划', '图文/短视频内容协助发布', '评论区互动与私信线索整理'],
  },
  {
    id: 'dianping',
    name: '美团点评 Meituan Dianping',
    pricing: 'monthly',
    usd: 100,
    description: '海外华人点评管理',
    details: ['差评预警与回复建议', '店铺评分趋势跟踪', '重点负评升级处理建议'],
  },
  {
    id: '12eat',
    name: '12Eat 唐人街外卖',
    pricing: 'monthly',
    usd: 60,
    description: '外卖平台账号管理',
    details: ['菜单与活动位更新建议', '基础文案优化', '订单评价监控'],
  },
  {
    id: 'grab_foodpanda',
    name: 'Grab / Foodpanda',
    pricing: 'monthly',
    usd: 180,
    description: '本地外卖平台管理',
    details: ['双平台菜单与视觉素材维护', '促销活动排期建议', '差评工单追踪'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    pricing: 'monthly',
    usd: 300,
    description: '视频内容制作与发布',
    details: ['选题脚本与封面标题建议', '视频发布排期', '基础数据复盘'],
  },
  {
    id: 'tiktok',
    name: '抖音 / TikTok',
    pricing: 'monthly',
    usd: 300,
    description: '短视频内容运营',
    details: ['热点选题与脚本方向', '发布节奏管理', '评论互动与话题优化建议'],
  },
  {
    id: 'onsite_photo',
    name: '现场拍摄服务',
    pricing: 'one_time',
    usd: 380,
    description: '摄影半天，图片+视频素材',
    details: ['约半天现场拍摄', '交付菜品/环境素材包', '可用于社媒与广告投放'],
  },
  {
    id: 'influencer_visit',
    name: '博主探店服务',
    pricing: 'one_time',
    usd: 2400,
    description: '15 个博主探店套餐',
    details: ['8 位 1k+ 粉丝博主', '5 位 5k-1w 粉丝博主', '3 位 1w+ 粉丝博主'],
  },
]

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    key: 'channels',
    label: '覆盖渠道',
    values: {
      starter: 'Instagram + Facebook',
      essential: 'Instagram + Facebook + TikTok',
      premium: 'Instagram + Facebook + TikTok + 小红书',
      advantage: 'Premium 全渠道 + 多门店协同',
    },
  },
  {
    key: 'contentType',
    label: '内容类型',
    values: {
      starter: '图文内容',
      essential: '图文内容',
      premium: '图文 + 视频',
      advantage: '图文 + 视频',
    },
  },
  {
    key: 'frequency',
    label: '发布频率',
    values: {
      starter: '可每日发布（素材商家提供）',
      essential: '可每日发布',
      premium: '可每日发布',
      advantage: '可每日发布（多门店）',
    },
  },
  {
    key: 'google',
    label: 'Google Map 运营',
    values: {
      starter: '配置 + 评论监控 + 打分优化',
      essential: '配置 + 评论监控 + 打分优化',
      premium: '配置 + 评论监控 + 打分优化',
      advantage: '配置 + 评论监控 + 打分优化',
    },
  },
  {
    key: 'report',
    label: '报告机制',
    values: {
      starter: '中英双语 + 每周舆情报告',
      essential: '中英双语 + 每周舆情报告',
      premium: '中英双语 + 每周舆情报告',
      advantage: '中英双语 + 每周舆情报告',
    },
  },
  {
    key: 'onsite',
    label: '拍摄/探店权益',
    values: {
      starter: '无',
      essential: '赠送 1 次博主探店 + 现场手机拍摄',
      premium: '每月 1 次现场拍摄 + 半年 1 次流量激活探店',
      advantage: '每月 1 次现场拍摄 + 半年 1 次流量激活探店',
    },
  },
  {
    key: 'multiStore',
    label: '多门店支持',
    values: {
      starter: '不支持',
      essential: '不支持',
      premium: '不支持',
      advantage: '支持最多 5 门店，超出每店 +USD 200/月',
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
  const monthlyBaseUsd = plan.monthlyUsd
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
