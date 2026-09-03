export type PlanId = 'starter' | 'essential' | 'booster'

export interface SubscriptionPlan {
  id: PlanId
  name: string
  monthlyUsd: number
  annualUsd?: number
  billingCycle?: 'monthly' | 'yearly'
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
  /** false = soft-hidden: still available for legacy/reference use, but not shown on new selection pages. */
  visible?: boolean
}

export interface AddonItem {
  id: string
  name: string
  pricing: 'monthly' | 'one_time'
  usd: number
  description: string
  details: string[]
  visible?: boolean
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

export const MONTHLY_SERVICE_PLANS: SubscriptionPlan[] = [
  {
    id: 'essential',
    name: 'Essential · 基础线上经营',
    monthlyUsd: 800,
    billingCycle: 'monthly',
    visible: false,
    description: '基础线上门面 + 稳定内容维护',
    oneLiner: '适合需要把海外社媒和 Google Map 基础经营跑起来的商家。',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · 品牌主理人',
    suitableFor: '刚开始做海外社媒、内容断更、Google Map 信息不完整、评分和评论无人管理的本地生活商家',
    services: [
      '每月 12 条 Instagram、6 条 TikTok、2 条 Google Business 内容维护',
      'Google Map 配置、评论监控与打分优化',
      '中英双语内容与远程交付',
      '可安排 2-4 位博主探店',
      '每月舆情报告',
    ],
    baseline: '让客户在 Instagram / TikTok / Google Map 上找得到、看得懂、愿意来。',
    explanation: {
      positioning: '基础线上门面 + 稳定内容维护',
      promise: '不是承诺立刻爆单，而是把商家在线上找得到、看得懂、愿意来的基础经营做好。',
      operations: [
        'Instagram 做品牌展示号：招牌产品、门店环境、套餐、节日活动、顾客场景，并配置 WhatsApp/预约/点餐入口。',
        'TikTok 做轻量曝光号：新品、优惠、门店氛围、活动短内容，持续触达第一次看到你的潜在用户。',
        'Google Map 做最后一公里转化：分类、营业时间、菜单、照片、电话、链接、评论回复持续维护。',
        '内容创建和发布节奏默认按每月 12 条 Instagram、6 条 TikTok、2 条 Google Business 安排，可在品牌策划页按月调整。',
      ],
      reporting: '每月舆情报告：评论、评分变化、热门内容、客户反馈、下月优化建议。',
      bestFor: [
        '新店开业，需要先把线上资料补齐。',
        '老店评分不错但社媒弱，需要建立基础品牌形象。',
        '老板没时间发内容，只需要稳定维护和基础曝光。',
        '主要服务新加坡本地英文/双语客户。',
      ],
    },
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · 品牌主理人',
      '每月 12 条 Instagram、6 条 TikTok、2 条 Google Business 内容维护',
      'Google Map 配置、评论监控与打分优化',
      '中英双语内容，远程交付',
      '可安排 2-4 位博主探店',
      '每月舆情报告',
    ],
  },
  {
    id: 'booster',
    name: 'Booster · 增长战役版',
    monthlyUsd: 3200,
    billingCycle: 'monthly',
    visible: false,
    description: '增长战役 + 素材资产 + 博主扩散',
    oneLiner: '适合需要用 3 个月集中做流量增长和运营活动的商家。',
    teamConfig: 'AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
    suitableFor: '已有基础门店，准备冲新品、新店、节日档期、短期声量或线上口碑修复的商家',
    services: [
      'Instagram、TikTok、小红书等自媒体内容策划',
      '流量增长和运营活动策划',
      'Google Map 配置、评论监控与打分优化',
      '每月 12 条 Instagram、12 条 TikTok、12 条小红书、2 条 Google Business 内容维护',
      '专业素材采集与视频剪辑',
      '12 位博主探店与每周舆情报告',
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
        'Google Map 强化评论回复、差评修复、照片更新、菜单和热门产品呈现，把社媒种草流量接住。',
      ],
      reporting: '每周舆情报告：曝光、互动、评论、收藏、私信、Google 评分、热门内容、下周调整动作。',
      bestFor: [
        '新店开业或新菜单上线。',
        '节日档期、午餐套餐、晚市活动、生日/聚会场景推广。',
        '评分低、评论少，需要系统修复线上信任。',
        '想吸引游客、中文用户、小红书用户。',
        '商圈竞争强，需要短期提高存在感。',
      ],
    },
    includes: [
      '团队配置：AI 内容创作官 · AI 市场调研官 · AI 品牌策略师 · 品牌主理人',
      '定制增长策划案',
      '每月 12 条 Instagram、12 条 TikTok、12 条小红书、2 条 Google Business 内容维护',
      '专业素材采集，视频剪辑',
      '12 位博主探店：6 位 2k+、4 位 4k+、2 位 1w+',
      '每周舆情报告',
    ],
  },
]

export const MONTHLY_SERVICE_ADDONS: AddonItem[] = [
  {
    id: 'multi_store',
    name: '多门店管理',
    pricing: 'monthly',
    usd: 300,
    visible: false,
    description: '同一品牌下管理多个门店，每个新增门店增加 S$300 / 门店 / 月，用于增加一个 Google Map 账号。',
    details: ['S$300 / 门店 / 月', '增加一个 Google Map 账号', '按新增门店数量计费'],
  },
  {
    id: 'xiaohongshu_ops',
    name: '小红书 Xiaohongshu',
    pricing: 'monthly',
    usd: 600,
    visible: false,
    description: '和英文平台同步运营，覆盖中文用户、中国游客、留学生和华语本地消费者。',
    details: ['S$600 / 月', '同步内容规划、发布与基础互动监控'],
  },
  {
    id: 'meituan_dianping_setup',
    name: '美团点评开通（商户通，推广通）',
    pricing: 'one_time',
    usd: 2200,
    visible: false,
    description: '协助完成美团点评商户通与推广通开通，让门店入口和推广能力先准备好。',
    details: ['S$2,200 / 年', '商户通开通', '推广通开通'],
  },
  {
    id: 'meituan_dianping_ops',
    name: '美团点评 Meituan Dianping 代运营',
    pricing: 'monthly',
    usd: 200,
    visible: false,
    description: '美团点评代运营，协助页面信息、评价与日常运营动作维护。',
    details: ['S$200 / 月', '海外华人点评管理'],
  },
  {
    id: 'twelveeat_delivery_setup',
    name: '12Eat 唐人街外卖上线',
    pricing: 'one_time',
    usd: 220,
    visible: false,
    description: '12Eat 唐人街外卖上线服务，协助完成外卖平台账号和基础资料上线。',
    details: ['S$220 / 次', '外卖平台账号上线'],
  },
  {
    id: 'twelveeat_delivery_ops',
    name: '12Eat 唐人街外卖代运营',
    pricing: 'monthly',
    usd: 80,
    visible: false,
    description: '12Eat 外卖平台账号代运营，维护外卖信息、菜单与基础运营配置。',
    details: ['S$80 / 月', '外卖平台账号管理'],
  },
  {
    id: 'grab_foodpanda_ops',
    name: 'Grab / Foodpanda',
    pricing: 'monthly',
    usd: 300,
    visible: false,
    description: '本地外卖平台管理，协助菜单、活动和页面基础维护。',
    details: ['S$300 / 月', 'Grab / Foodpanda 账号管理'],
  },
  {
    id: 'youtube_ops',
    name: 'YouTube',
    pricing: 'monthly',
    usd: 800,
    visible: false,
    description: '视频内容制作与发布，帮助商家把门店体验、产品和服务做成可沉淀的视频内容。',
    details: ['S$800 / 月', '视频内容制作与发布'],
  },
  {
    id: 'short_video_six',
    name: '视频制作（6 条）',
    pricing: 'one_time',
    usd: 600,
    visible: false,
    description: '6 条短视频内容制作，可用于当月社媒发布、活动预热或平台店铺素材。',
    details: ['S$600 / 次', '交付 6 条短视频'],
  },
  {
    id: 'onsite_photo',
    name: '现场拍摄服务 On-site Photography',
    pricing: 'one_time',
    usd: 300,
    visible: false,
    description: '专业摄影到店采集菜品、环境、服务与门店素材，并提供视频剪辑支持。',
    details: ['S$300 / 次', '专业摄影，素材采集，视频剪辑'],
  },
  {
    id: 'influencer_visit',
    name: '博主探店服务',
    pricing: 'one_time',
    usd: 1500,
    visible: false,
    description: '12 个博主探店：6 个 2k+ 粉丝、4 个 4k+、2 个 1w+。',
    details: ['S$1,500 / 套', '包含探店流程对接与发布跟进'],
  },
]

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter · AI Staff Hiring Plan',
    monthlyUsd: 0,
    annualUsd: 5200,
    billingCycle: 'yearly',
    description: 'Hiring AI staff for Social Media Marketing',
    oneLiner: 'Deploy an AI Marketing Crew for merchants to manage up to 4 social platforms with customer-managed materials and AI-generated content.',
    teamConfig: 'Branding Researcher · Instagram Copywriter · Facebook Copywriter · TikTok Copywriter · Google Map Copywriter',
    suitableFor: 'Merchants that need a 12-month AI staff license for core social-media content, scheduling, Google Map review support, analytics and reports.',
    services: [
      'Deploy an AI Marketing Crew for up to 4 social media platforms: Instagram, Facebook, TikTok and Google Map.',
      'Merchant-specific AI characters, memory and voice based on user customization.',
      'Instant online branding evaluation report for the user brand.',
      'Platform-specific multilingual social content generation.',
      'Smart scheduling of approved posts.',
      'Google Map comment monitoring and reply suggestions.',
      'Daily social media growth analytics and downloadable monthly reports.',
      'Online customer support, initial account setup, branding evaluation, company-context survey and user training.',
    ],
    baseline: 'A 12-month AI staff license for core social media marketing operations.',
    explanation: {
      positioning: 'Entry annual AI staff hiring plan',
      promise: 'Give the merchant a working AI Marketing Crew for core content, scheduling, Google Map review support and monthly reporting.',
      operations: [
        'Manage up to 4 social platforms: Instagram, Facebook, TikTok and Google Map.',
        'Generate platform-specific multilingual posts from merchant-provided materials and brand context.',
        'Schedule reviewed and approved posts.',
        'Monitor Google Map comments and provide reply suggestions.',
        'Provide daily growth analytics and downloadable monthly reports.',
      ],
      reporting: 'Daily analytics and monthly downloadable reports.',
      bestFor: [
        'Merchants starting with core social channels.',
        'Teams that want customer-managed publishing materials with AI-generated content.',
        'Brands that need setup, onboarding support and training for a 12-month license.',
      ],
    },
    includes: [
      '12-month license',
      'Up to 4 social media platforms: Instagram, Facebook, TikTok and Google Map',
      'Branding Researcher, Instagram Copywriter, Facebook Copywriter, TikTok Copywriter and Google Map Copywriter',
      'Branding evaluation report',
      'Platform-specific multilingual content generation',
      'Smart scheduling after user review and approval',
      'Google Map comment monitoring and reply suggestions',
      'Daily growth analytics and monthly reports',
      'Usage cap: up to 150 posts/month',
      'Initial account setup, customer support, fine-tuning and training',
    ],
  },
  {
    id: 'essential',
    name: 'Essential · AI Staff Hiring Plan',
    monthlyUsd: 0,
    annualUsd: 10600,
    billingCycle: 'yearly',
    description: 'Hiring AI staff for Social Media Marketing',
    oneLiner: 'Deploy an AI Marketing Crew for up to 4 platforms with content, videos, asset tagging, image generation and reporting.',
    teamConfig: 'Image Designer · Video Maker · Branding Researcher · Instagram Copywriter · Facebook Copywriter · TikTok Copywriter · Google Map Copywriter',
    suitableFor: 'Merchants that need a fuller 12-month AI staff setup for content, videos, brand context planning, asset management and monthly reporting.',
    services: [
      'Deploy an AI Marketing Crew for up to 4 platforms: Instagram, Facebook, TikTok and Google Map.',
      'Merchant-specific AI characters, memory and voice based on user customization.',
      'Branding evaluation report and merchant-owner survey for brand context, brand briefing, branding strategy and marketing strategies.',
      'Platform-specific multilingual content generation.',
      'Smart scheduling of approved posts.',
      'Smart tagging and download support for user branding assets.',
      'AI image generation and refining, with AI video creation under token limits.',
      'Google Map comment monitoring and reply suggestions.',
      'Daily social media growth analytics and downloadable monthly reports.',
      'Online customer support, account setup, fine-tuning and training.',
    ],
    baseline: 'A 12-month AI staff license for content, video, brand context and reporting workflows.',
    explanation: {
      positioning: 'Core annual AI staff hiring plan',
      promise: 'Give the merchant a richer AI Marketing Crew with design, video, brand context, asset management and reporting support.',
      operations: [
        'Manage up to 4 social platforms with merchant-managed materials and AI-generated content and videos.',
        'Plan brand context through owner surveys, brand briefing, branding strategy and marketing strategy setup.',
        'Generate multilingual content tailored to Instagram, TikTok and Google Business Profile.',
        'Support smart scheduling, asset tagging, image generation and token-limited AI video creation.',
        'Monitor Google Map comments and provide reply suggestions.',
      ],
      reporting: 'Daily analytics and monthly downloadable reports.',
      bestFor: [
        'Merchants that need content plus visuals and video.',
        'Brands that need structured brand context before ongoing publishing.',
        'Teams that want a fuller AI crew but still focus on core platforms.',
      ],
    },
    includes: [
      '12-month license',
      'Up to 4 social media platforms: Instagram, Facebook, TikTok and Google Map',
      'Image Designer, Video Maker, Branding Researcher and platform copywriters',
      'Branding evaluation, owner survey, brand briefing, branding strategy and marketing strategy setup',
      'Platform-specific multilingual content generation',
      'Smart scheduling after user review and approval',
      'Smart tagging of branding assets with download features',
      'AI image generation and refining, with AI video creation under token limits',
      'Google Map comment monitoring and reply suggestions',
      'Daily growth analytics and monthly reports',
      'Usage cap: up to 180 posts/month and 150 videos/month',
      'Initial account setup, customer support, fine-tuning and training',
    ],
  },
  {
    id: 'booster',
    name: 'Booster · AI Staff Hiring Plan',
    monthlyUsd: 0,
    annualUsd: 16800,
    billingCycle: 'yearly',
    description: 'Hiring AI staff for Social Media Marketing',
    oneLiner: 'Deploy an AI Marketing Crew for up to 8 platforms, including Xiaohongshu, YouTube, Twitter/X and Meituan Dianping operations.',
    teamConfig: 'Image Designer · Video Maker · Branding Researcher · Instagram Copywriter · Facebook Copywriter · TikTok Copywriter · Google Map Copywriter · Xiaohongshu Copywriter · Twitter Copywriter · YouTube Copywriter · Meituan Dianping Copywriter',
    suitableFor: 'Merchants that need broader channel coverage, image/video generation without limits, Xiaohongshu and Meituan Dianping automation support.',
    services: [
      'Deploy an AI Marketing Crew for up to 8 social platforms: Instagram, TikTok, Facebook, Google Map, Meituan Dianping, Xiaohongshu, YouTube and Twitter/X.',
      'Merchant-specific AI characters, memory and voice based on user customization.',
      'Branding evaluation report and merchant-owner survey for brand context, brand briefing, branding strategy and marketing strategies.',
      'Platform-specific multilingual content generation.',
      'Smart scheduling of approved posts.',
      'AI image generation and refining, with AI video creation without limitation.',
      'Xiaohongshu content generation for user review and approval.',
      'Meituan Dianping automation operations, including brand decoration, content posting, comment monitoring and promotion setting.',
      'Google Map comment monitoring and reply suggestions.',
      'Daily social media growth analytics and downloadable monthly reports.',
      'Online customer support, account setup, fine-tuning and training.',
    ],
    baseline: 'A 12-month AI staff license for broader multi-platform social media marketing operations.',
    explanation: {
      positioning: 'Expanded annual AI staff hiring plan',
      promise: 'Give the merchant a broader AI Marketing Crew for up to 8 platforms, richer creative generation and Chinese-platform operations.',
      operations: [
        'Cover Instagram, TikTok, Facebook, Google Map, Meituan Dianping, Xiaohongshu, YouTube and Twitter/X based on customer preference.',
        'Generate multilingual platform-specific content and videos from merchant-managed materials.',
        'Support AI image generation and refining with AI video creation without limitation.',
        'Generate Xiaohongshu content for user review and approval.',
        'Support Meituan Dianping brand decoration, content posting, comment monitoring and promotion setting.',
      ],
      reporting: 'Daily analytics and monthly downloadable reports.',
      bestFor: [
        'Merchants that want wider social platform coverage.',
        'Brands that need Xiaohongshu and Meituan Dianping support.',
        'Teams that need heavier image and video generation capacity.',
      ],
    },
    includes: [
      '12-month license',
      'Up to 8 platforms: Instagram, TikTok, Facebook, Google Map, Meituan Dianping, Xiaohongshu, YouTube and Twitter/X',
      'Image Designer, Video Maker, Branding Researcher and platform copywriters',
      'Branding evaluation, owner survey, brand briefing, branding strategy and marketing strategy setup',
      'Platform-specific multilingual content generation',
      'Smart scheduling after user review and approval',
      'AI image generation and refining, with AI video creation without limitation',
      'Xiaohongshu content generation for review and approval',
      'Meituan Dianping automation operations',
      'Google Map comment monitoring and reply suggestions',
      'Daily growth analytics and monthly reports',
      'Usage cap: up to 240 posts/month and 240 videos/month',
      'Initial account setup, customer support, fine-tuning and training',
    ],
  },
]

export const SUBSCRIPTION_ADDONS: AddonItem[] = [
  {
    id: 'video_generation_tokens',
    name: 'Video Generation Token Pack',
    pricing: 'one_time',
    usd: 200,
    description: 'Token pack for up to 24 video generations.',
    details: ['S$200 / unit', 'Minimum 1 unit', 'Maximum 20 units', 'Each unit supports up to 24 video generations'],
  },
]

export const BILLABLE_SUBSCRIPTION_ADDONS: AddonItem[] = [
  ...SUBSCRIPTION_ADDONS,
  ...MONTHLY_SERVICE_ADDONS,
]

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    key: 'channels',
    label: 'Platform coverage',
    values: {
      starter: 'Instagram + Facebook + TikTok + Google Map',
      essential: 'Instagram + Facebook + TikTok + Google Map',
      booster: 'Instagram + TikTok + Facebook + Google Map + Meituan Dianping + Xiaohongshu + YouTube + Twitter/X',
    },
  },
  {
    key: 'team',
    label: 'AI staff configuration',
    values: {
      starter: 'Branding Researcher + Instagram/Facebook/TikTok/Google Map Copywriters',
      essential: 'Image Designer + Video Maker + Branding Researcher + Instagram/Facebook/TikTok/Google Map Copywriters',
      booster: 'Expanded creative, research and platform copywriter crew for up to 8 platforms',
    },
  },
  {
    key: 'frequency',
    label: 'Usage caps',
    values: {
      starter: 'Up to 150 posts/month',
      essential: 'Up to 180 posts/month and 150 videos/month',
      booster: 'Up to 240 posts/month and 240 videos/month',
    },
  },
  {
    key: 'metrics',
    label: 'Core service focus',
    values: {
      starter: 'Core content generation, scheduling, Google Map comment support and monthly reports',
      essential: 'Brand context planning, asset tagging, image/video creation and monthly reports',
      booster: 'Wider platform coverage, Xiaohongshu, Meituan Dianping operations and higher creative capacity',
    },
  },
]

export const ALLOWED_DURATIONS = [12] as const

export function getAllowedDurationsForPlan(planId: string): readonly number[] {
  if (planId === 'starter' || planId === 'essential' || planId === 'booster') return [12]
  return ALLOWED_DURATIONS
}

export const DEFAULT_SUBSCRIPTION_TERMS_VERSION = 'AMC-SMSA-v1.12'

type PlanOperationConfig = {
  platformCoverage: string[]
  monthlyContentQuota: number
  publishingFreq: { platforms: Record<string, { postsPerMonth: number }> }
}

export const PLAN_OPERATION_CONFIG: Record<PlanId, PlanOperationConfig> = {
  starter: {
    platformCoverage: ['instagram', 'facebook', 'tiktok', 'google_business'],
    monthlyContentQuota: 150,
    publishingFreq: {
      platforms: {
        instagram: { postsPerMonth: 8 },
        facebook: { postsPerMonth: 6 },
        tiktok: { postsPerMonth: 6 },
        google_business: { postsPerMonth: 2 },
      },
    },
  },
  essential: {
    platformCoverage: ['instagram', 'facebook', 'tiktok', 'google_business'],
    monthlyContentQuota: 180,
    publishingFreq: {
      platforms: {
        instagram: { postsPerMonth: 12 },
        facebook: { postsPerMonth: 8 },
        tiktok: { postsPerMonth: 8 },
        google_business: { postsPerMonth: 2 },
      },
    },
  },
  booster: {
    platformCoverage: ['instagram', 'tiktok', 'facebook', 'google_business', 'meituan_dianping', 'xiaohongshu', 'youtube', 'twitter'],
    monthlyContentQuota: 240,
    publishingFreq: {
      platforms: {
        instagram: { postsPerMonth: 12 },
        tiktok: { postsPerMonth: 12 },
        facebook: { postsPerMonth: 12 },
        google_business: { postsPerMonth: 2 },
        meituan_dianping: { postsPerMonth: 8 },
        xiaohongshu: { postsPerMonth: 12 },
        youtube: { postsPerMonth: 4 },
        twitter: { postsPerMonth: 8 },
      },
    },
  },
}

export function getPlanOperationConfig(planId: string): PlanOperationConfig | null {
  if (planId === 'starter' || planId === 'essential' || planId === 'booster') {
    return PLAN_OPERATION_CONFIG[planId]
  }
  return null
}

export function getPlanPlatformCoverage(planId: string): string[] {
  return [...(getPlanOperationConfig(planId)?.platformCoverage ?? [])]
}

export function getPlanMonthlyContentQuota(planId: string): number {
  return getPlanOperationConfig(planId)?.monthlyContentQuota ?? 0
}

export function getPlanPublishingFreq(planId: string) {
  const config = getPlanOperationConfig(planId)
  return config ? structuredClone(config.publishingFreq) : null
}

export function normalizeAddonQuantity(addonId: string, quantity: unknown): number {
  const parsed = typeof quantity === 'number' && Number.isFinite(quantity)
    ? quantity
    : Number.isFinite(Number(quantity))
      ? Number(quantity)
      : 1
  const whole = Math.floor(parsed)
  if (normalizeSubscriptionAddonId(addonId) === 'video_generation_tokens') {
    return Math.min(20, Math.max(1, whole))
  }
  return Math.max(0, whole)
}

export function normalizeSubscriptionAddonId(addonId: string): string {
  return addonId === 'video_generation_scripts' ? 'video_generation_tokens' : addonId
}

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

  const normalizedAddonQuantities = Object.entries(addonQuantities || {}).reduce<Record<string, number>>((acc, [id, quantity]) => {
    const normalizedId = normalizeSubscriptionAddonId(id)
    acc[normalizedId] = Math.max(acc[normalizedId] || 0, Number(quantity) || 0)
    return acc
  }, {})
  const uniqueAddonIds = Array.from(new Set(addonIds.map(normalizeSubscriptionAddonId)))

  const selectedAddons = uniqueAddonIds
    .map((id) => BILLABLE_SUBSCRIPTION_ADDONS.find((a) => a.id === id))
    .filter((v): v is AddonItem => Boolean(v))

  const billedMonths = durationMonths
  const recurringAddonsUsd = selectedAddons
    .filter((a) => a.pricing === 'monthly')
    .reduce((sum, a) => {
      const qty = normalizedAddonQuantities[a.id] ?? 1
      return sum + a.usd * qty
    }, 0)
  const oneTimeAddonsUsd = selectedAddons
    .filter((a) => a.pricing === 'one_time')
    .reduce((sum, a) => {
      const qty = normalizeAddonQuantity(a.id, normalizedAddonQuantities[a.id] ?? 1)
      return sum + a.usd * qty
    }, 0)
  const annualBaseUsd = plan.annualUsd ?? (plan.promoMonthlyUsd ?? plan.monthlyUsd) * 12
  const monthlyBaseUsd = Math.round((annualBaseUsd / 12) * 100) / 100
  const recurringSubtotalUsd = annualBaseUsd * (durationMonths / 12) + recurringAddonsUsd * durationMonths
  const recurringAfterDiscountUsd = recurringSubtotalUsd
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
