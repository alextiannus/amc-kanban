import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  ensureGrowthMerchantForBrand,
  readGrowthMerchantData,
} from '@/lib/growthDataCenter'
import { matchPromotionStrategyCreativeCandidates } from '@/lib/promotion-strategy/clients'
import type { PublishingFreq } from '@/lib/brandContextBuilder'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'

type BrandPlanCalendarItem = {
  id: string
  date: string
  title: string
  platform: string
  platformSlug: string
  contentType: string
  product: string
  planning: string
  sampleHit: string
  status: string
  matchedTags?: string[]
  matchedInspirations?: string[]
  materialRequirements?: string[]
  contentLibraryGap?: string
}

export type BrandPlanWorkspaceData = {
  researchReport?: {
    generatedAt: string
    summary: string
    dataSources: string[]
    brandImage: string
    marketingStatus: string
    marketAnalysis: string
    competitors: string[]
    issues: string[]
    growthPoints: string[]
    missingQuestions: string[]
  }
  annualPlan?: {
    generatedAt: string
    goal: string
    theme: string
    quarterlyFocus: Array<{ quarter: string; focus: string; campaigns: string[] }>
    metrics: string[]
    subscriptionStrategy?: {
      planId: string
      planName: string
      includedServices: string[]
      platformCoverage: string[]
      monthlyContentQuota: number
      publishingFreq: PublishingFreq | null
    }
    researchFocus?: string
  }
  quarterlyPlans?: Array<{
    quarter: string
    generatedAt: string
    objective: string
    monthlyFocus: Array<{ month: string; focus: string }>
    contentDirections: string[]
  }>
  publishingCalendar?: {
    generatedAt: string
    months: Record<string, BrandPlanCalendarItem[]>
  }
}

export type BrandPlanMerchantInterview = {
  id: string
  completedAt: string
  answers: Array<{ question: string; answer: string }>
  summary: string
  rawNotes: string
}

type BrandPlanAction =
  | 'generate_research_report'
  | 'save_merchant_interview'
  | 'generate_annual_plan'
  | 'generate_quarter_plan'
  | 'generate_publishing_calendar'

type BrandPlanBrand = NonNullable<Awaited<ReturnType<typeof loadBrandPlanBrand>>>

export async function loadBrandPlanBrand(brandId: string) {
  return prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      knowledge: true,
      subscriptions: {
        select: {
          planId: true,
          planName: true,
          selectedAddons: true,
          status: true,
          contractEndDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      accounts: {
        select: {
          id: true,
          platformId: true,
          handle: true,
          displayName: true,
          profileUrl: true,
          followerCount: true,
          ratingScore: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
      brandPlanInterviews: {
        select: {
          id: true,
          rawNotes: true,
          answers: true,
          summary: true,
          completedAt: true,
        },
        orderBy: { completedAt: 'desc' },
        take: 1,
      },
    },
  })
}

export async function getBrandPlan(brandId: string) {
  const brand = await loadBrandPlanBrand(brandId)
  if (!brand) return null
  const marketingSolution = readMarketingSolutionWorkspace(brand)
  const merchantInterview = serializeMerchantInterview(brand.brandPlanInterviews[0])
  return {
    brand: serializeBrandSummary(brand),
    marketingSolution,
    brandPlan: marketingSolution,
    merchantInterview,
    merchantInterviewRequired: !merchantInterview,
    merchantInterviewGuideline: buildMerchantInterviewGuideline(marketingSolution.researchReport),
  }
}

export async function runBrandPlanAction(input: {
  brandId: string
  action: BrandPlanAction
  body?: Record<string, unknown>
}) {
  const brand = await loadBrandPlanBrand(input.brandId)
  if (!brand) throw new BrandPlanError('brand_not_found', 404)
  const current = readMarketingSolutionWorkspace(brand)
  let latestInterview = serializeMerchantInterview(brand.brandPlanInterviews[0])

  let next = current
  if (input.action === 'generate_research_report') {
    const researchReport = await buildResearchReport(brand)
    next = {
      ...current,
      researchReport,
    }
    await saveResearchReport(brand.id, researchReport)
  } else if (input.action === 'save_merchant_interview') {
    const report = current.researchReport || await buildResearchReport(brand)
    latestInterview = await saveMerchantInterview(brand.id, input.body, report)
    next = { ...current, researchReport: report }
  } else if (input.action === 'generate_annual_plan') {
    next = { ...current, annualPlan: buildAnnualMarketingSolution(brand, current, latestInterview) }
  } else if (input.action === 'generate_quarter_plan') {
    requireAnnualPlan(current)
    const quarterPlan = buildQuarterMarketingSolution(brand, current, latestInterview, input.body)
    next = {
      ...current,
      quarterlyPlans: [
        ...(current.quarterlyPlans || []).filter((item) => item.quarter !== quarterPlan.quarter),
        quarterPlan,
      ],
    }
  } else if (input.action === 'generate_publishing_calendar') {
    requireQuarterPlan(current)
    const month = normalizeMonth(input.body?.month)
    const monthItems = await buildPublishingMonth(brand, month, latestInterview, current)
    next = {
      ...current,
      publishingCalendar: {
        generatedAt: new Date().toISOString(),
        months: {
          ...(current.publishingCalendar?.months || {}),
          [month]: monthItems,
        },
      },
    }
    await syncCalendarMaterialRequirements(brand.id, month, monthItems)
  } else {
    throw new BrandPlanError('invalid_brand_plan_action', 400)
  }

  await prisma.brandKnowledge.upsert({
    where: { brandId: brand.id },
    update: {
      marketingSolution: next as Prisma.InputJsonValue,
      researchReport: next.researchReport ? next.researchReport as Prisma.InputJsonValue : undefined,
    },
    create: {
      brandId: brand.id,
      negPrompts: [],
      marketingSolution: next as Prisma.InputJsonValue,
      researchReport: next.researchReport ? next.researchReport as Prisma.InputJsonValue : undefined,
    },
  })

  return {
    ok: true,
    action: input.action,
    brand: serializeBrandSummary(brand),
    marketingSolution: next,
    brandPlan: next,
    merchantInterview: latestInterview,
    merchantInterviewRequired: !latestInterview,
    merchantInterviewGuideline: buildMerchantInterviewGuideline(next.researchReport),
  }
}

async function buildResearchReport(brand: BrandPlanBrand): Promise<NonNullable<BrandPlanWorkspaceData['researchReport']>> {
  const growth = await readGrowthFacts(brand)
  const products = primaryProducts(brand, growth)
  const competitors = stringList(brand.knowledge?.competitors)
  const accounts: Array<{ platformId: string; ratingScore: number | null }> = brand.accounts || []
  const googleRating = accounts.find((account) => isGooglePlatform(account.platformId))?.ratingScore ?? null
  const stores = arrayValue(brand.knowledge?.stores)
  const hasConversionLink = Boolean(brand.knowledge?.reservationUrl || brand.knowledge?.orderingUrl || arrayValue(brand.knowledge?.deliveryUrls).length)
  const issues = [
    !brand.knowledge?.businessHours ? '营业时间不完整，影响搜索和到店决策。' : '',
    !hasConversionLink ? '预订、下单或外卖承接入口还不清楚。' : '',
    !brand.knowledge?.audienceAssumptions ? '目标客群需要商家确认，避免内容泛泛而谈。' : '',
    !brand.knowledge?.promotionFocus ? '长期推广重点还没有沉淀成稳定表达。' : '',
  ].filter(Boolean)

  const growthPoints = [
    products[0] ? `围绕“${products[0]}”建立稳定主推内容。` : '先明确一个最值得主推的产品或服务。',
    stores.length > 1 ? '利用多门店覆盖不同商圈和消费场景。' : '强化门店位置、路线和附近消费场景。',
    googleRating ? `Google 评分 ${googleRating.toFixed(1)} 可作为信任背书。` : '补充顾客评价、真实照片和门店体验作为信任内容。',
    accounts.length ? '把已有社媒阵地统一到同一套品牌表达。' : '先补齐官方社媒阵地，建立顾客可追踪入口。',
  ]

  return {
    generatedAt: new Date().toISOString(),
    summary: `${brand.name} 当前资料已覆盖基础品牌与门店信息，下一步需要确认主推产品、顾客来店原因和近期经营目标。`,
    dataSources: [
      'AMC-Kanban 品牌资料',
      'BrandKnowledge 门店与推广字段',
      growth.available ? 'AMC-Growth 数据调研' : '',
      accounts.length ? '已绑定社媒账号' : '',
    ].filter(Boolean),
    brandImage: text(brand.knowledge?.brandImage) || text(growth.positioning) || '待根据数据调研和商家确认整理。',
    marketingStatus: text(brand.knowledge?.promotionFocus) || text(growth.growthPlan) || '已有基础推广字段，缺少可执行的年度、季度和月度营销方案拆解。',
    marketAnalysis: [brand.knowledge?.market, brand.knowledge?.district, growth.market].map(text).filter(Boolean).join(' / ') || '待补充市场、商圈和消费场景判断。',
    competitors,
    issues: issues.length ? issues : ['资料基础完整，建议重点校准主推产品、客群和内容风格。'],
    growthPoints,
    missingQuestions: [
      '老板最想让顾客记住什么？',
      '如果只能主推一个产品或服务，应该先推哪个？',
      '客人一般为什么选择这家店，而不是附近其他店？',
      '最近三个月最想提升新客、回头客、外卖、预订还是客单价？',
      '哪些话不要说，哪些产品暂时不要主推？',
    ],
  }
}

async function saveResearchReport(
  brandId: string,
  report: NonNullable<BrandPlanWorkspaceData['researchReport']>
) {
  await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: { researchReport: report as Prisma.InputJsonValue },
    create: { brandId, negPrompts: [], researchReport: report as Prisma.InputJsonValue },
  })
}

async function saveMerchantInterview(
  brandId: string,
  body: Record<string, unknown> | undefined,
  report: NonNullable<BrandPlanWorkspaceData['researchReport']>
): Promise<BrandPlanMerchantInterview> {
  const rawNotes = text(body?.rawNotes)
  const answers = arrayValue(body?.answers)
    .map((item) => objectValue(item))
    .map((item) => ({
      question: text(item.question),
      answer: text(item.answer),
    }))
    .filter((item) => item.question && item.answer)
  if (!rawNotes && !answers.length) {
    throw new BrandPlanError('merchant_interview_required', 400)
  }
  const saved = await prisma.brandPlanInterview.create({
    data: {
      brandId,
      rawNotes: rawNotes || answers.map((item) => `${item.question}\n${item.answer}`).join('\n\n'),
      answers: answers.length ? answers as Prisma.InputJsonValue : undefined,
      summary: text(body?.summary) || `已记录品牌主张访谈，后续营销方案会结合 ${report.missingQuestions.length || 0} 个待确认点。`,
    },
    select: {
      id: true,
      rawNotes: true,
      answers: true,
      summary: true,
      completedAt: true,
    },
  })
  const interview = serializeMerchantInterview(saved)
  if (!interview) throw new BrandPlanError('merchant_interview_required', 400)
  await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: { brandClaim: buildBrandClaimFromInterview(interview) as Prisma.InputJsonValue },
    create: {
      brandId,
      negPrompts: [],
      brandClaim: buildBrandClaimFromInterview(interview) as Prisma.InputJsonValue,
    },
  })
  return interview
}

function buildMerchantInterviewGuideline(report?: BrandPlanWorkspaceData['researchReport']) {
  return {
    title: '品牌主张访谈指南',
    principle: '不要问品牌大词，只问老板每天能回答的具体生意判断。',
    questions: report?.missingQuestions?.length ? report.missingQuestions : [
      '客人一般为什么来你店？',
      '店里最值得推荐的 3 个产品是什么？',
      '如果只能主推一个，你最想先推哪个？',
      '你觉得附近客人为什么会选你，而不是别家？',
      '最近三个月最想提升新客、回头客、外卖、预订还是客单价？',
      '有哪些话不要说，哪些产品暂时不要主推？',
    ],
    output: [
      '记录老板原话，不需要润色成品牌话术。',
      '标注主推产品、客人来店原因、近期经营目标和禁用表达。',
      '访谈记录保存后，会长期沉淀为商家主张，作为生成营销方案的材料。',
    ],
  }
}

function buildBrandClaimFromInterview(interview: BrandPlanMerchantInterview) {
  return {
    source: 'principal_interview',
    interviewId: interview.id,
    updatedAt: interview.completedAt,
    summary: interview.summary,
    rawNotes: interview.rawNotes,
    answers: interview.answers,
  }
}

function buildAnnualMarketingSolution(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null
): NonNullable<BrandPlanWorkspaceData['annualPlan']> {
  const year = new Date().getFullYear()
  const products = primaryProducts(brand, { available: false })
  const interviewFocus = interviewMaterialText(interview)
  const subscriptionStrategy = buildSubscriptionStrategy(brand)
  const researchFocus = current.researchReport?.growthPoints?.[0] || current.researchReport?.summary || ''
  const theme = text(brand.knowledge?.promotionFocus) || products[0] || interviewFocus || '稳定提升本地顾客认知和到店转化'
  return {
    generatedAt: new Date().toISOString(),
    goal: interviewFocus
      ? `${year} 年围绕主理人确认的经营重点，结合订阅服务范围，让附近顾客持续看见、看懂并愿意行动。`
      : `${year} 年结合订阅服务范围，让附近顾客持续看见、看懂并愿意行动。`,
    theme,
    quarterlyFocus: [
      { quarter: 'Q1', focus: '整理基础资料、建立招牌认知', campaigns: ['新年/开年主题', '招牌产品教育', '门店位置与营业信息强化'] },
      { quarter: 'Q2', focus: '放大主推产品和消费场景', campaigns: ['家庭/朋友聚餐', '工作餐或日常复购', '顾客评价内容'] },
      { quarter: 'Q3', focus: '优化转化入口和复购活动', campaigns: ['套餐/会员', '外卖或预订转化', '商圈合作'] },
      { quarter: 'Q4', focus: '节日节点和年度口碑沉淀', campaigns: ['节日活动', '年度招牌回顾', '老顾客召回'] },
    ],
    metrics: ['路线点击', '电话/私信咨询', '预订/下单点击', '内容发布完成率', '顾客评价与收藏'],
    subscriptionStrategy,
    ...(researchFocus ? { researchFocus } : {}),
  }
}

function buildQuarterMarketingSolution(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null,
  body?: Record<string, unknown>
): NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number] {
  const now = new Date()
  const requestedQuarter = text(body?.quarter)
  const quarterIndex = requestedQuarter.match(/^Q[1-4]$/) ? Number(requestedQuarter.slice(1)) - 1 : Math.floor(now.getMonth() / 3)
  const quarter = `Q${quarterIndex + 1}`
  const monthStart = quarterIndex * 3
  const monthlyFocus = [0, 1, 2].map((offset) => {
    const date = new Date(now.getFullYear(), monthStart + offset, 1)
    return {
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      focus: offset === 0 ? '确认主推产品和内容素材' : offset === 1 ? '集中发布活动与场景内容' : '复盘数据并强化转化入口',
    }
  })
  return {
    quarter,
    generatedAt: new Date().toISOString(),
    objective: current.annualPlan?.quarterlyFocus.find((item) => item.quarter === quarter)?.focus || '把年度方向拆成季度可执行节奏。',
    monthlyFocus,
    contentDirections: [
      ...primaryProducts(brand, { available: false }).slice(0, 3).map((item) => `围绕“${item}”做真实场景、卖点解释和顾客行动引导。`),
      interviewMaterialText(interview) ? `结合主理人访谈确认内容：${interviewMaterialText(interview)}` : '',
    ].filter(Boolean),
  }
}

function buildPublishingMonth(
  brand: BrandPlanBrand,
  month: string,
  interview: BrandPlanMerchantInterview | null,
  current: BrandPlanWorkspaceData
): Promise<NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]> {
  const products = primaryProducts(brand, { available: false })
  const interviewFocus = interviewMaterialText(interview)
  const subscriptionStrategy = current.annualPlan?.subscriptionStrategy || buildSubscriptionStrategy(brand)
  const schedule = buildMonthlyPublishingSchedule(
    month,
    subscriptionStrategy.publishingFreq || brand.knowledge?.publishingFreq,
    subscriptionStrategy.platformCoverage
  )
  return Promise.all(schedule.map(async (slot, index) => {
    const product = products[index % Math.max(1, products.length)] || '招牌产品'
    const item = {
      id: `${month}-${String(index + 1).padStart(2, '0')}-${slot.platform.slug}`,
      date: slot.date,
      title: `${product} 的到店理由`,
      platform: slot.platform.label,
      platformSlug: slot.platform.slug,
      contentType: index % 2 === 0 ? '短视频' : '图文',
      product,
      planning: `用真实门店画面说明“${product}”为什么值得来试，并加入路线/预订/下单动作。${interviewFocus ? `参考主理人访谈：${interviewFocus}` : ''}`,
      sampleHit: `标题：附近想吃点稳的，就点这份 ${product}。开头：别只看菜单，先看这份为什么常被点。`,
      status: '待确认',
    }
    return enrichCalendarItemFromContentLibrary(brand, item, current)
  }))
}

async function enrichCalendarItemFromContentLibrary(
  brand: BrandPlanBrand,
  item: BrandPlanCalendarItem,
  current: BrandPlanWorkspaceData
): Promise<BrandPlanCalendarItem> {
  try {
    const match = await matchPromotionStrategyCreativeCandidates({
      merchantId: brand.id,
      merchantName: brand.name,
      merchantCategory: brand.industry || 'Restaurant / F&B',
      market: text(brand.knowledge?.market || brand.location) || 'Singapore',
      promotionPlanScope: 'marketing_plan_calendar',
      promotionPointId: item.id,
      promotionGoal: current.annualPlan?.goal || current.researchReport?.summary || '提升本地顾客认知和行动',
      sellingPoint: item.product,
      customerAction: '收藏、咨询、点击路线、预订或下单',
      requestedCandidateCount: 3,
      targetPublishWindow: { start: item.date, end: item.date },
      refreshMode: 'full_candidate_pool',
      platforms: [item.platformSlug],
      assetContext: { existingAssets: [] },
      serviceScope: { source: 'brand_plan' },
    })
    const candidate = Array.isArray(match.creativeCandidates) ? match.creativeCandidates[0] : null
    return {
      ...item,
      matchedTags: stringList(candidate?.matchedTags),
      matchedInspirations: stringList(candidate?.matchedInspirations),
      materialRequirements: stringList(candidate?.assetNeeds).length
        ? stringList(candidate?.assetNeeds)
        : [`补充“${item.product}”真实门店画面或顾客场景素材。`],
      contentLibraryGap: Array.isArray(match.contentLibraryGaps) && match.contentLibraryGaps.length
        ? 'amc-content 内容库存在缺口，需要补充标签、脚本或素材模板。'
        : undefined,
    }
  } catch {
    return {
      ...item,
      materialRequirements: [`补充“${item.product}”真实门店画面或顾客场景素材。`],
      contentLibraryGap: 'amc-content 暂不可用，已保留人工素材要求。',
    }
  }
}

async function syncCalendarMaterialRequirements(
  brandId: string,
  month: string,
  items: BrandPlanCalendarItem[]
) {
  const remotePlanId = `brand_plan_calendar_${month}`
  const desiredItemIds = items.map((item) => item.id)
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.materialRequirement.updateMany({
      where: {
        brandId,
        remotePlanId,
        remotePlanItemId: { notIn: desiredItemIds },
        requirementKey: 'brand-plan-calendar:primary',
      },
      data: { required: false },
    })
    for (const item of items) {
      await tx.materialRequirement.upsert({
        where: {
          brandId_remotePlanItemId_requirementKey: {
            brandId,
            remotePlanItemId: item.id,
            requirementKey: 'brand-plan-calendar:primary',
          },
        },
        create: {
          brandId,
          remotePlanId,
          remotePlanVersion: 1,
          remotePlanItemId: item.id,
          requirementKey: 'brand-plan-calendar:primary',
          specification: materialRequirementSpecification(item),
          dueAt: new Date(item.date),
        },
        update: {
          remotePlanId,
          remotePlanVersion: 1,
          required: true,
          specification: materialRequirementSpecification(item),
          dueAt: new Date(item.date),
        },
      })
    }
  })
}

function materialRequirementSpecification(item: BrandPlanCalendarItem) {
  return {
    subject: item.product,
    scene: item.materialRequirements?.join('；') || item.planning,
    platform: item.platformSlug,
    platformLabel: item.platform,
    contentType: item.contentType,
    contentTitle: item.title,
    sampleHit: item.sampleHit,
    matchedTags: item.matchedTags || [],
    matchedInspirations: item.matchedInspirations || [],
    source: 'brand_plan_publishing_calendar',
    quantity: 1,
    aspectRatio: item.contentType === '短视频' ? '9:16' : '1:1',
  }
}

function requireAnnualPlan(current: BrandPlanWorkspaceData) {
  if (!current.annualPlan) throw new BrandPlanError('annual_plan_required', 409)
}

function requireQuarterPlan(current: BrandPlanWorkspaceData) {
  if (!current.quarterlyPlans?.length) throw new BrandPlanError('quarter_plan_required', 409)
}

function serializeMerchantInterview(value: {
  id: string
  rawNotes: string
  answers: Prisma.JsonValue | null
  summary: string | null
  completedAt: Date
} | null | undefined): BrandPlanMerchantInterview | null {
  if (!value) return null
  const rawNotes = text(value.rawNotes)
  const answers = arrayValue(value.answers)
    .map((item) => objectValue(item))
    .map((item) => ({ question: text(item.question), answer: text(item.answer) }))
    .filter((item) => item.question && item.answer)
  if (!rawNotes && !answers.length) return null
  return {
    id: value.id,
    rawNotes,
    answers: answers.length ? answers : rawNotes ? [{ question: '主理人访谈记录', answer: rawNotes }] : [],
    summary: text(value.summary) || '品牌主张访谈记录已保存，可作为后续营销方案材料。',
    completedAt: value.completedAt.toISOString(),
  }
}

function interviewMaterialText(interview: BrandPlanMerchantInterview | null) {
  if (!interview) return ''
  const answerText = interview.answers.map((item) => item.answer).join('；')
  return (interview.rawNotes || answerText).replace(/\s+/g, ' ').slice(0, 120)
}

async function readGrowthFacts(brand: BrandPlanBrand) {
  try {
    const growthBrandKey = await ensureGrowthMerchantForBrand(brand)
    const data = await readGrowthMerchantData(growthBrandKey)
    return {
      available: true,
      market: text(data?.profile?.market || data?.profile?.area),
      positioning: text(data?.brandStory?.positioning || data?.profile?.diagnosis),
      growthPlan: text(data?.growthPlan?.summary || data?.growthPlan?.implementation_scope),
      menuItems: arrayValue(data?.brandStory?.signature_dishes),
    }
  } catch {
    return { available: false }
  }
}

function serializeBrandSummary(brand: BrandPlanBrand) {
  return {
    id: brand.id,
    name: brand.name,
    location: brand.location,
  }
}

function readMarketingSolutionWorkspace(brand: BrandPlanBrand): BrandPlanWorkspaceData {
  const legacyWorkspace = normalizeBrandPlan(brand.knowledge?.brandPlan)
  const marketingSolution = normalizeBrandPlan(brand.knowledge?.marketingSolution)
  const researchReport = normalizeResearchReport(brand.knowledge?.researchReport) || legacyWorkspace.researchReport
  return {
    ...legacyWorkspace,
    ...marketingSolution,
    ...(researchReport ? { researchReport } : {}),
  }
}

function normalizeResearchReport(value: unknown): BrandPlanWorkspaceData['researchReport'] | undefined {
  const obj = objectValue(value)
  if (!Object.keys(obj).length) return undefined
  return obj as NonNullable<BrandPlanWorkspaceData['researchReport']>
}

function normalizeBrandPlan(value: unknown): BrandPlanWorkspaceData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as BrandPlanWorkspaceData
}

function buildSubscriptionStrategy(brand: BrandPlanBrand) {
  const subscriptions = Array.isArray(brand.subscriptions) ? brand.subscriptions : []
  const active = subscriptions.find((subscription: (typeof subscriptions)[number]) =>
    subscription.status === 'ACTIVE' && (!subscription.contractEndDate || subscription.contractEndDate.getTime() > Date.now())
  ) || subscriptions[0]
  const plan = active ? SUBSCRIPTION_PLANS.find((item) => item.id === active.planId) : null
  const planId = active?.planId || 'none'
  const platformCoverage = platformCoverageForPlan(planId)
  return {
    planId,
    planName: plan?.name || active?.planName || '未激活订阅',
    includedServices: plan?.services || [],
    platformCoverage,
    monthlyContentQuota: monthlyContentQuotaForPlan(planId),
    publishingFreq: normalizePublishingFreq(brand.knowledge?.publishingFreq) || publishingFreqForPlan(planId, platformCoverage),
  }
}

function platformCoverageForPlan(planId: string) {
  if (planId === 'starter') return ['instagram', 'facebook', 'tiktok', 'google_business']
  if (planId === 'essential') return ['instagram', 'facebook', 'tiktok', 'xiaohongshu', 'google_business']
  if (planId === 'advanced') return ['instagram', 'facebook', 'tiktok', 'xiaohongshu', 'google_business', 'ads', 'wechat', 'whatsapp']
  return []
}

function monthlyContentQuotaForPlan(planId: string) {
  if (planId === 'starter') return 30
  if (planId === 'essential') return 28
  if (planId === 'advanced') return 38
  return 0
}

function publishingFreqForPlan(planId: string, platforms: string[]): PublishingFreq | null {
  const monthlyQuota = monthlyContentQuotaForPlan(planId)
  if (!monthlyQuota || !platforms.length) return null
  return {
    platforms: Object.fromEntries(platforms.map((platform) => [
      platform,
      { postsPerWeek: Math.max(1, Math.round((monthlyQuota / platforms.length) * 7 / 30)) },
    ])),
  }
}

function primaryProducts(brand: BrandPlanBrand, growth: { available: boolean; menuItems?: unknown[] }) {
  const menuProducts = arrayValue(brand.knowledge?.menuItems)
    .map((item) => objectValue(item))
    .map((item) => text(item.name || item.title))
    .filter(Boolean)
  if (menuProducts.length) return menuProducts.slice(0, 4)

  const growthProducts = arrayValue(growth.menuItems)
    .map((item) => typeof item === 'string' ? item : text(objectValue(item).name || objectValue(item).title))
    .filter(Boolean)
  if (growthProducts.length) return growthProducts.slice(0, 4)

  return text(brand.knowledge?.productAssumptions || brand.knowledge?.promotionFocus || brand.description)
    .split(/[\n,，;；、]/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4)
}

function normalizeMonth(value: unknown) {
  const textValue = text(value)
  if (/^\d{4}-\d{2}$/.test(textValue)) return textValue
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const MARKETING_PLAN_PLATFORMS = [
  { slug: 'instagram', label: 'Instagram' },
  { slug: 'tiktok', label: 'TikTok' },
  { slug: 'google_business', label: 'Google Business' },
  { slug: 'xiaohongshu', label: 'Xiaohongshu' },
]

function buildMonthlyPublishingSchedule(month: string, value: unknown, fallbackPlatforms: string[] = []) {
  const [year, monthNumber] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const publishingFreq = normalizePublishingFreq(value)
  const enabledPlatformSlugs = Object.keys(publishingFreq?.platforms || {})
  const platforms = enabledPlatformSlugs.length
    ? enabledPlatformSlugs.map((slug) => platformForSlug(slug))
    : fallbackPlatforms.length
      ? fallbackPlatforms.map((slug) => platformForSlug(slug))
      : MARKETING_PLAN_PLATFORMS
  const postCount = resolveMonthlyPostCount(publishingFreq, daysInMonth)
  const firstDay = Math.min(3, daysInMonth)
  const lastDay = Math.max(firstDay, daysInMonth - 2)

  return Array.from({ length: postCount }, (_, index) => {
    const day = postCount === 1
      ? firstDay
      : Math.min(daysInMonth, Math.round(firstDay + ((lastDay - firstDay) * index) / (postCount - 1)))
    return {
      date: `${month}-${String(day).padStart(2, '0')}`,
      platform: platforms[index % platforms.length],
    }
  })
}

function resolveMonthlyPostCount(publishingFreq: PublishingFreq | null, daysInMonth: number) {
  if (!publishingFreq) return 7
  const platformWeeklyTotal = Object.values(publishingFreq.platforms || {})
    .reduce((sum, cfg) => sum + positiveNumber(cfg.postsPerWeek), 0)
  if (platformWeeklyTotal > 0) return clampPostCount(Math.ceil(platformWeeklyTotal * daysInMonth / 7))

  const platformDailyTotal = Object.values(publishingFreq.platforms || {})
    .reduce((sum, cfg) => sum + positiveNumber(cfg.postsPerDay), 0)
  if (platformDailyTotal > 0) return clampPostCount(Math.ceil(platformDailyTotal * daysInMonth))

  const globalDaily = positiveNumber(publishingFreq.postsPerDay)
  if (globalDaily > 0) return clampPostCount(Math.ceil(globalDaily * daysInMonth))

  return 7
}

function normalizePublishingFreq(value: unknown): PublishingFreq | null {
  const obj = objectValue(value)
  const platforms = objectValue(obj.platforms)
  const normalizedPlatforms = Object.fromEntries(
    Object.entries(platforms)
      .map(([slug, cfg]) => ({ slug: normalizePlatformSlug(slug), cfg: objectValue(cfg) }))
      .filter((item) => Boolean(item.slug))
      .map(({ slug, cfg }) => [slug, {
        postsPerDay: positiveNumber(cfg.postsPerDay) || undefined,
        postsPerWeek: positiveNumber(cfg.postsPerWeek) || undefined,
        preferredHours: arrayValue(cfg.preferredHours).map((hour) => Number(hour)).filter((hour) => Number.isFinite(hour)),
      }])
  )
  const normalized: PublishingFreq = {
    postsPerDay: positiveNumber(obj.postsPerDay) || undefined,
    platforms: normalizedPlatforms,
  }
  return normalized.postsPerDay || Object.keys(normalizedPlatforms).length ? normalized : null
}

function platformForSlug(slug: string) {
  const normalized = normalizePlatformSlug(slug)
  return MARKETING_PLAN_PLATFORMS.find((item) => item.slug === normalized) || {
    slug: normalized || slug,
    label: slug.split(/[_-]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
  }
}

function normalizePlatformSlug(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'google' || normalized === 'google_business_profile' || normalized === 'google_my_business') return 'google_business'
  if (normalized === 'xhs' || normalized === 'little_red_book') return 'xiaohongshu'
  return normalized
}

function positiveNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

function clampPostCount(value: number) {
  return Math.min(31, Math.max(1, value))
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean)
  return []
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isGooglePlatform(platform: string) {
  return ['google', 'google_maps', 'gbp', 'gmb', 'google_business_profile'].includes(platform.toLowerCase())
}

export class BrandPlanError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}
