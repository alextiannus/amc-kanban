export type PlanId = 'essential' | 'booster'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  monthlyUsd: number
  promoMonthlyUsd?: number
  description: string
  oneLiner: string
  includes: string[]
  teamConfig: string
  suitableFor: string
  services: string[]
  baseline: string
  explanation: {
    positioning: string
    promise: string
    operations: string[]
    reporting: string
    bestFor: string[]
  }
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
    id: 'essential',
    name: 'Essential · 基础线上经营',
    monthlyUsd: 800,
    description: '基础线上门面 + 稳定内容维护',
    oneLiner: '适合需要把海外社媒和 Google Map 基础经营跑起来的商家。',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · 品牌主理人',
    suitableFor: '刚开始做海外社媒、内容断更、Google Map 信息不完整、评分和评论无人管理的本地生活商家',
    services: [
      '每月 12 条 Instagram、6 条 TikTok、2 条 Google Business 内容维护',
      'Google Map 配置、评论监控与打分优化',
      '中英双语内容与远程交付',
      '可安排 4 位博主探店',
      '每月舆情报告'
    ],
    baseline: '让客户在 Instagram / TikTok / Google Map 上找得到、看得懂、愿意来。',
    explanation: {
      positioning: '基础线上门面 + 稳定内容维护',
      promise: '不是承诺立刻爆单，而是把商家在线上找得到、看得懂、愿意来的基础经营做好。',
      operations: [
        'Instagram 做品牌展示号：招牌产品、门店环境、套餐、节日活动、顾客场景，并配置 WhatsApp/预约/点餐入口。',
        'TikTok 做轻量曝光号：新品、优惠、门店氛围、活动短内容，持续触达第一次看到你的潜在用户。',
        'Google Map 做最后一公里转化：分类、营业时间、菜单、照片、电话、链接、评论回复持续维护。',
        '内容创建和发布节奏默认按每月 12 条 Instagram、6 条 TikTok、2 条 Google Business 安排，可在品牌计划页按月调整。'
      ],
      reporting: '每月舆情报告：评论、评分变化、热门内容、客户反馈、下月优化建议。',
      bestFor: [
        '新店开业，需要先把线上资料补齐。',
        '老店评分不错但社媒弱，需要建立基础品牌形象。',
        '老板没时间发内容，只需要稳定维护和基础曝光。',
        '主要服务新加坡本地英文/双语客户。'
      ],
    },
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · 品牌主理人',
      '适合：刚开始做海外社媒、内容断更、Google Map 信息不完整、评分和评论无人管理的商家',
      '服务内容：',
      '1. 每月 12 条 Instagram、6 条 TikTok、2 条 Google Business 内容维护',
      '2. Google Map 配置、评论监控与打分优化',
      '3. 中英双语内容，远程交付',
      '4. 可安排 4 位博主探店',
      '5. 每月舆情报告',
      '6. 2026 年 9 月 30 日前签约商家赠送 1 次价值 S$200 素材拍摄采集和 6 条视频'
    ],
  },
  {
    id: 'booster',
    name: 'Booster · 增长战役版',
    monthlyUsd: 3600,
    description: '增长战役 + 素材资产 + 博主扩散',
    oneLiner: '适合需要用 3 个月集中做流量增长和运营活动的商家。',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
    suitableFor: '已有基础门店，准备冲新品、新店、节日档期、短期声量或线上口碑修复的商家',
    services: [
      'Instagram、TikTok、小红书等自媒体内容策划',
      '流量增长和运营活动策划',
      'Google Map 配置、评论监控与打分优化',
      '每月 12 条 Instagram、12 条 TikTok、12 条小红书、2 条 Google Business 内容维护',
      '专业素材采集',
      '10 位博主探店与每周舆情报告'
    ],
    baseline: '用一个月把品牌内容、活动话题、博主探店和地图口碑一起推起来，让更多人看到、收藏、咨询、到店。',
    explanation: {
      positioning: '增长战役 + 素材资产 + 博主扩散',
      promise: '围绕一个月主题，把内容、活动、博主、地图口碑和到店转化连起来，不只是多发帖。',
      operations: [
        '先看品类、商圈、客群、竞品、评分、现有内容，再确定本月主推主题。',
        'Instagram 从门面展示升级为品牌经营：招牌故事、套餐组合、活动海报、Reels、Story 互动。',
        'TikTok 主攻爆点内容：价格锚点、反差卖点、制作过程、挑战话题、限时活动、探店视频。',
        '小红书面向中文用户、中国游客、留学生和华语本地消费者，做可搜索、可收藏、可照着去的生活方式笔记。',
        'Google Map 强化评论回复、差评修复、照片更新、菜单和热门产品呈现，把社媒种草流量接住。'
      ],
      reporting: '每周舆情报告：曝光、互动、评论、收藏、私信、Google 评分、热门内容、下周调整动作。',
      bestFor: [
        '新店开业或新菜单上线。',
        '节日档期、午餐套餐、晚市活动、生日/聚会场景推广。',
        '评分低、评论少，需要系统修复线上信任。',
        '想吸引游客、中文用户、小红书用户。',
        '商圈竞争强，需要短期提高存在感。'
      ],
    },
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
      '适合：已有基础门店，准备冲新品、新店、节日档期、短期声量或线上口碑修复的商家',
      '服务内容：',
      '1. 定制增长策划案',
      '2. 每月 12 条 Instagram、12 条 TikTok、12 条小红书、2 条 Google Business 内容维护',
      '3. Instagram / TikTok / 小红书等自媒体内容策划与运营活动策划',
      '4. Google Map 配置、评论监控与打分优化',
      '5. 专业素材采集',
      '6. 10 位博主探店：6 位 2k+、3 位 4k+、1 位 1w+',
      '7. 每周舆情报告'
    ],
  },
]

export const SUBSCRIPTION_ADDONS: AddonItem[] = [
  {
    id: 'multi_store',
    name: '多门店管理',
    pricing: 'monthly',
    usd: 300,
    description: '同一品牌下管理多个门店，每个新增门店增加 S$300 / 门店 / 月，用于增加一个 Google Map 账号。',
    details: ['S$300 / 门店 / 月', '增加一个 Google Map 账号', '按新增门店数量计费'],
  },
  {
    id: 'xiaohongshu_ops',
    name: '小红书 Xiaohongshu',
    pricing: 'monthly',
    usd: 600,
    description: '和英文平台同步运营，覆盖中文用户、中国游客、留学生和华语本地消费者。',
    details: ['S$600 / 月', '同步内容规划、发布与基础互动监控'],
  },
  {
    id: 'meituan_dianping_setup',
    name: '美团点评开通（商户通，推广通）',
    pricing: 'one_time',
    usd: 2200,
    description: '协助完成美团点评商户通与推广通开通，让门店入口和推广能力先准备好。',
    details: ['S$2,200 / 年', '商户通开通', '推广通开通'],
  },
  {
    id: 'meituan_dianping_ops',
    name: '美团点评 Meituan Dianping 代运营',
    pricing: 'monthly',
    usd: 200,
    description: '美团点评代运营，协助页面信息、评价与日常运营动作维护。',
    details: ['S$200 / 月', '海外华人点评管理'],
  },
  {
    id: 'twelveeat_delivery_setup',
    name: '12Eat 唐人街外卖上线',
    pricing: 'one_time',
    usd: 220,
    description: '12Eat 唐人街外卖上线服务，协助完成外卖平台账号和基础资料上线。',
    details: ['S$220 / 次', '外卖平台账号上线'],
  },
  {
    id: 'twelveeat_delivery_ops',
    name: '12Eat 唐人街外卖代运营',
    pricing: 'monthly',
    usd: 80,
    description: '12Eat 外卖平台账号代运营，维护外卖信息、菜单与基础运营配置。',
    details: ['S$80 / 月', '外卖平台账号管理'],
  },
  {
    id: 'grab_foodpanda_ops',
    name: 'Grab / Foodpanda',
    pricing: 'monthly',
    usd: 300,
    description: '本地外卖平台管理，协助菜单、活动和页面基础维护。',
    details: ['S$300 / 月', 'Grab / Foodpanda 账号管理'],
  },
  {
    id: 'youtube_ops',
    name: 'YouTube',
    pricing: 'monthly',
    usd: 800,
    description: '视频内容制作与发布，帮助商家把门店体验、产品和服务做成可沉淀的视频内容。',
    details: ['S$800 / 月', '视频内容制作与发布'],
  },
  {
    id: 'short_video_six',
    name: '视频制作（6 条）',
    pricing: 'one_time',
    usd: 600,
    description: '6 条短视频内容制作，可用于当月社媒发布、活动预热或平台店铺素材。',
    details: ['S$600 / 次', '交付 6 条短视频'],
  },
  {
    id: 'onsite_photo',
    name: '现场拍摄服务 On-site Photography',
    pricing: 'one_time',
    usd: 300,
    description: '专业摄影到店采集菜品、环境、服务与门店素材。',
    details: ['S$300 / 次', '专业摄影，素材采集'],
  },
  {
    id: 'influencer_visit',
    name: '博主探店服务',
    pricing: 'one_time',
    usd: 2200,
    description: '15 个博主探店：8 个 1k+ 粉丝、5 个 5k-1w、3 个 1w+。',
    details: ['S$2,200 / 次', '包含探店流程对接与发布跟进'],
  },
]

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    key: 'channels',
    label: '覆盖渠道',
    values: {
      essential: 'Instagram + TikTok + Google Map / Google Business Profile',
      booster: 'Instagram + TikTok + 小红书等自媒体 + Google Map / Google Business Profile',
    },
  },
  {
    key: 'team',
    label: '团队配置',
    values: {
      essential: 'AI 内容创作官 · AI 市场调研官 · 品牌主理人',
      booster: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
    },
  },
  {
    key: 'frequency',
    label: '内容产出',
    values: {
      essential: '每月 12 条 Instagram、6 条 TikTok、2 条 Google Business',
      booster: '每月 12 条 Instagram、12 条 TikTok、12 条小红书、2 条 Google Business',
    },
  },
  {
    key: 'metrics',
    label: '核心效果保障',
    values: {
      essential: '线上资料完整、内容稳定更新、评论有人管理',
      booster: '增长策划、素材采集、博主探店、内容发布和每周复盘一起推进',
    },
  },
]

export const ALLOWED_DURATIONS = [3, 6, 12] as const

export function getAllowedDurationsForPlan(planId: string): readonly number[] {
  if (planId === 'essential') return [6, 12]
  if (planId === 'booster') return [3]
  return ALLOWED_DURATIONS
}

export const DEFAULT_SUBSCRIPTION_TERMS_VERSION = 'AMC-SMSA-v1.08'

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
  if (!getAllowedDurationsForPlan(planId).includes(durationMonths)) {
    throw new Error('Invalid contract duration for plan')
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
  const recurringAfterDiscountUsd = (monthlyBaseUsd + recurringAddonsUsd) * billedMonths
  const discountPercent = 0
  const discountUsd = 0

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
