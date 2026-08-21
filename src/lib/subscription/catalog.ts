export type PlanId = 'starter' | 'essential' | 'advanced'

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
    id: 'starter',
    name: 'Essential · 基础线上经营',
    monthlyUsd: 800,
    description: '基础线上门面 + 稳定内容维护',
    oneLiner: '适合需要把线上门面做起来的商家。',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · 品牌主理人',
    suitableFor: '刚开始做海外社媒、内容断更、Google Map 信息不完整、评分和评论无人管理的本地生活商家',
    services: [
      '每月不少于 12 次图文发布',
      'Instagram + TikTok + Google Business Profile',
      'Google Map 资料完善与评论监控',
      '每月 4 位 KOC/微型博主探店',
      '每月舆情报告与下月优化建议'
    ],
    baseline: '让客户在 Instagram / TikTok / Google Map 上找得到、看得懂、愿意来。',
    explanation: {
      positioning: '基础线上门面 + 稳定内容维护',
      promise: '不是承诺立刻爆单，而是把商家在线上找得到、看得懂、愿意来的基础经营做好。',
      operations: [
        'Instagram 做品牌展示号：招牌产品、门店环境、套餐、节日活动、顾客场景，并配置 WhatsApp/预约/点餐入口。',
        'TikTok 做轻量曝光号：新品、优惠、门店氛围、活动短内容，持续触达第一次看到你的潜在用户。',
        'Google Map 做最后一公里转化：分类、营业时间、菜单、照片、电话、链接、评论回复持续维护。',
        '内容建议按 8 条品牌/产品内容 + 4 条活动/场景内容安排。'
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
      '1. 每月不少于 12 次图文发布，建议 8 条品牌/产品内容 + 4 条活动/场景内容',
      '2. Instagram 做品牌门面和信任留存',
      '3. TikTok 做轻量曝光和兴趣种草',
      '4. Google Map / Google Business Profile 做最后一公里转化',
      '5. 每月 4 位 KOC/微型博主探店，沉淀真实第三方内容',
      '6. 每月舆情报告与下月优化建议'
    ],
  },
  {
    id: 'essential',
    name: 'Booster · 增长战役版',
    monthlyUsd: 3600,
    description: '增长战役 + 素材资产 + 博主扩散',
    oneLiner: '适合已经准备好接客流、想在一个月内集中放大声量的商家。',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
    suitableFor: '已有基础门店，准备冲新品、新店、节日档期、短期声量或线上口碑修复的商家',
    services: [
      '每月至少 24 次图文 + 12 条精品视频',
      'Instagram + TikTok + 小红书 + Google Business Profile',
      '定制月度增长策划案',
      '专业素材采集与当月素材资产整理',
      '10 位博主分批探店扩散',
      '每周舆情与运营复盘'
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
      '1. 每月至少 24 次图文 + 12 条精品视频，拆成 4 个内容主题周',
      '2. Instagram / TikTok / 小红书 / Google Map 联动运营',
      '3. 一次专业素材采集，覆盖主视觉、短视频、菜单、门店环境、人物和活动素材',
      '4. 10 位博主探店：6 位 2k+、3 位 4k+、1 位 1w+，分批发布',
      '5. 每周舆情报告和下周调整动作'
    ],
  },
  {
    id: 'advanced',
    name: '全域增长版',
    monthlyUsd: 5800,
    visible: false,
    description: '全平台覆盖，私域运营，精准拉新转化',
    oneLiner: '适合需要投流、私域和全链路增长管理的成熟商家。',
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
    explanation: {
      positioning: '全域增长、投流与私域复购',
      promise: '把内容、广告、KOL、私域和转化追踪放在同一条增长链路里持续优化。',
      operations: [
        '搭建广告账户、受众分层、素材测试和预算调配。',
        '安排头部 KOL 合作并做跨平台扩散。',
        '建立 WhatsApp / 微信私域社群框架，推动老客复购。',
        '每月追踪曝光、点击、到店、复购和广告表现。'
      ],
      reporting: '月度广告绩效和全链路转化优化报告。',
      bestFor: ['已有线上基础', '需要投流放大', '需要私域沉淀', '需要系统提升转化率'],
    },
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
      starter: 'Instagram + TikTok + Google Map / Google Business Profile',
      essential: 'Instagram + TikTok + 小红书 + Google Map / Google Business Profile',
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
      starter: '每月不少于 12 次图文发布',
      essential: '每月至少 24 次图文 + 12 条精品视频',
      advanced: '付费广告创意投放 + 每月 2 次头部 KOL 合作',
    },
  },
  {
    key: 'metrics',
    label: '核心效果保障',
    values: {
      starter: '线上资料完整、内容稳定更新、评论有人管理',
      essential: '月度主题、素材、博主、内容发布和每周复盘一起推进',
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
