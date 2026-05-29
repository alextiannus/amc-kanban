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
}

export interface PricingSummary {
  durationMonths: number
  billedMonths: number
  monthlyBaseUsd: number
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
  { id: 'xiaohongshu', name: '小红书 Xiaohongshu', pricing: 'monthly', usd: 300, description: '华人社区内容运营' },
  { id: 'dianping', name: '美团点评 Meituan Dianping', pricing: 'monthly', usd: 100, description: '海外华人点评管理' },
  { id: '12eat', name: '12Eat 唐人街外卖', pricing: 'monthly', usd: 60, description: '外卖平台账号管理' },
  { id: 'grab_foodpanda', name: 'Grab / Foodpanda', pricing: 'monthly', usd: 180, description: '本地外卖平台管理' },
  { id: 'youtube', name: 'YouTube', pricing: 'monthly', usd: 300, description: '视频内容制作与发布' },
  { id: 'tiktok', name: '抖音 / TikTok', pricing: 'monthly', usd: 300, description: '短视频内容运营' },
  { id: 'onsite_photo', name: '现场拍摄服务', pricing: 'one_time', usd: 380, description: '摄影半天，图片+视频素材' },
  { id: 'influencer_visit', name: '博主探店服务', pricing: 'one_time', usd: 2400, description: '15 个博主探店套餐' },
]

export const ALLOWED_DURATIONS = [3, 6, 12] as const

export function calculatePricing(planId: string, durationMonths: number, addonIds: string[]): PricingSummary {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)
  if (!plan) throw new Error('Invalid plan')
  if (!ALLOWED_DURATIONS.includes(durationMonths as (typeof ALLOWED_DURATIONS)[number])) {
    throw new Error('Invalid contract duration')
  }

  const selectedAddons = addonIds
    .map((id) => SUBSCRIPTION_ADDONS.find((a) => a.id === id))
    .filter((v): v is AddonItem => Boolean(v))

  const billedMonths = durationMonths === 12 ? 11 : durationMonths
  const recurringAddonsUsd = selectedAddons.filter((a) => a.pricing === 'monthly').reduce((sum, a) => sum + a.usd, 0)
  const oneTimeAddonsUsd = selectedAddons.filter((a) => a.pricing === 'one_time').reduce((sum, a) => sum + a.usd, 0)
  const monthlyBaseUsd = plan.monthlyUsd

  return {
    durationMonths,
    billedMonths,
    monthlyBaseUsd,
    recurringAddonsUsd,
    oneTimeAddonsUsd,
    totalDueUsd: (monthlyBaseUsd + recurringAddonsUsd) * billedMonths + oneTimeAddonsUsd,
  }
}
