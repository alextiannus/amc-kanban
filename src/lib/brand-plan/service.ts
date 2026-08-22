import type { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  ensureGrowthMerchantForBrand,
  generateGrowthResearchReportForBrand,
  readGrowthMerchantData,
} from '@/lib/growthDataCenter'
import { matchPromotionStrategyCreativeBatch } from '@/lib/promotion-strategy/clients'
import type { PublishingFreq } from '@/lib/brandContextBuilder'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'
import { getSubscriptionOperationsPolicy } from '@/lib/subscription/policy'
import { callLLM } from '@/lib/llmRouter'

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
  selectedCreativeCandidateId?: string
  materialRequirements?: string[]
  contentLibraryGap?: string
}

export type BrandPlanWorkspaceData = {
  researchReport?: {
    snapshotId?: string
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
    quarterlyPlans?: Array<{
      quarter: string
      strategy: string
      focus: string
      promotionPoints: Array<{
        name: string
        rationale: string
        targetAudience: string
        customerAction: string
        platforms: string[]
        suggestedMonthlyPosts: number
      }>
      campaigns: string[]
      contentThemes: string[]
      monthlyFocus: Array<{ month: string; focus: string; promotionPoints: string[] }>
    }>
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
    researchSnapshotId?: string
    generationMode?: 'LLM' | 'RULE_FALLBACK'
    llmProvider?: string
    llmModel?: string
    llmError?: string
  }
  quarterlyPlans?: Array<{
    quarter: string
    generatedAt: string
    objective: string
    monthlyFocus: Array<{ month: string; focus: string }>
    contentDirections: string[]
    promotionPoints?: Array<{
      name: string
      rationale: string
      customerAction: string
      platforms: string[]
      suggestedMonthlyPosts: number
    }>
    researchSnapshotId?: string
    generationMode?: 'LLM' | 'RULE_FALLBACK'
    llmProvider?: string
    llmModel?: string
    llmError?: string
  }>
  publishingCalendar?: {
    generatedAt: string
    months: Record<string, BrandPlanCalendarItem[]>
    generationMode?: 'AMC_CONTENT_ASSISTED' | 'RULE_FALLBACK'
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
  | 'save_workspace_patch'
  | 'generate_annual_plan'
  | 'generate_quarter_plan'
  | 'generate_publishing_calendar'
  | 'regenerate_calendar_item'

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
    const researchReport = await saveResearchReport(brand.id, await buildGrowthResearchReport(brand))
    next = {
      ...current,
      researchReport,
    }
  } else if (input.action === 'save_merchant_interview') {
    const report = current.researchReport || await saveResearchReport(brand.id, await buildResearchReport(brand))
    latestInterview = await saveMerchantInterview(brand.id, input.body, report)
    next = { ...current, researchReport: report }
  } else if (input.action === 'save_workspace_patch') {
    next = await saveWorkspacePatch(brand.id, current, input.body)
  } else if (input.action === 'generate_annual_plan') {
    const annualPlan = await buildAnnualMarketingSolution(brand, current, latestInterview)
    next = { ...current, annualPlan }
    await saveMarketingSolutionVersion({
      brandId: brand.id,
      kind: 'ANNUAL',
      period: String(new Date().getFullYear()),
      input: {
        ...buildMarketingPlanInput(brand, current, latestInterview),
        subscriptionStrategy: annualPlan.subscriptionStrategy,
      },
      output: annualPlan,
      researchSnapshotId: annualPlan.researchSnapshotId || current.researchReport?.snapshotId,
      generationMode: annualPlan.generationMode || 'LLM',
      llmProvider: annualPlan.llmProvider,
      llmModel: annualPlan.llmModel,
      llmError: annualPlan.llmError,
    })
  } else if (input.action === 'generate_quarter_plan') {
    requireAnnualPlan(current)
    const quarterPlan = await buildQuarterMarketingSolution(brand, current, latestInterview, input.body)
    next = {
      ...current,
      quarterlyPlans: [
        ...(current.quarterlyPlans || []).filter((item) => item.quarter !== quarterPlan.quarter),
        quarterPlan,
      ],
    }
    await saveMarketingSolutionVersion({
      brandId: brand.id,
      kind: 'QUARTERLY',
      period: quarterPlan.quarter,
      input: buildMarketingPlanInput(brand, current, latestInterview, input.body),
      output: quarterPlan,
      researchSnapshotId: quarterPlan.researchSnapshotId || current.researchReport?.snapshotId,
      generationMode: quarterPlan.generationMode || 'LLM',
      llmProvider: quarterPlan.llmProvider,
      llmModel: quarterPlan.llmModel,
      llmError: quarterPlan.llmError,
    })
  } else if (input.action === 'generate_publishing_calendar') {
    requireQuarterPlan(current)
    const month = normalizeMonth(input.body?.month)
    const monthItems = await buildPublishingMonth(brand, month, latestInterview, current)
    next = {
      ...current,
      publishingCalendar: {
        generatedAt: new Date().toISOString(),
        generationMode: 'AMC_CONTENT_ASSISTED',
        months: {
          ...(current.publishingCalendar?.months || {}),
          [month]: monthItems,
        },
      },
    }
    await syncCalendarMaterialRequirements(brand.id, month, monthItems)
    await saveMarketingSolutionVersion({
      brandId: brand.id,
      kind: 'CALENDAR',
      period: month,
      input: buildMarketingPlanInput(brand, current, latestInterview, input.body),
      output: { month, items: monthItems },
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'AMC_CONTENT_ASSISTED',
    })
  } else if (input.action === 'regenerate_calendar_item') {
    requireQuarterPlan(current)
    const month = normalizeMonth(input.body?.month)
    const itemId = text(input.body?.itemId)
    const existingItems = current.publishingCalendar?.months?.[month] || []
    const targetItem = existingItems.find((item) => item.id === itemId)
    if (!targetItem) throw new BrandPlanError('calendar_item_not_found', 404)
    const replacement = await regeneratePublishingCalendarItem(brand, month, targetItem, latestInterview, current)
    const monthItems = existingItems.map((item) => item.id === itemId ? replacement : item)
    next = {
      ...current,
      publishingCalendar: {
        generatedAt: new Date().toISOString(),
        generationMode: 'AMC_CONTENT_ASSISTED',
        months: {
          ...(current.publishingCalendar?.months || {}),
          [month]: monthItems,
        },
      },
    }
    await syncCalendarMaterialRequirements(brand.id, month, monthItems)
    await saveMarketingSolutionVersion({
      brandId: brand.id,
      kind: 'CALENDAR',
      period: month,
      input: {
        ...buildMarketingPlanInput(brand, current, latestInterview, input.body),
        refreshItemId: itemId,
      },
      output: { month, refreshedItem: replacement },
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'AMC_CONTENT_ASSISTED',
    })
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

async function buildGrowthResearchReport(brand: BrandPlanBrand): Promise<NonNullable<BrandPlanWorkspaceData['researchReport']>> {
  const job = await generateGrowthResearchReportForBrand(brand)
  if (text(job.status) === 'failed') {
    throw new BrandPlanError('growth_research_failed', 502)
  }
  if (!['completed', 'needs_review'].includes(text(job.status))) {
    throw new BrandPlanError('growth_research_still_running', 409)
  }
  const localReport = await buildResearchReport(brand)
  const result = objectValue(job.result)
  const sourceCoverage = objectValue(job.source_coverage)
  const coverageScore = typeof job.coverage_score === 'number'
    ? job.coverage_score
    : typeof result.coverage_score === 'number'
      ? result.coverage_score
      : null
  const coverageItems = Object.entries(sourceCoverage)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
  const reportPaths = [
    text(job.advanced_report_path),
    text(job.initial_report_path),
    text(result.advanced_report_path),
    text(result.report_path),
  ].filter(Boolean)
  const growthIssues = [
    coverageScore !== null && coverageScore < 70 ? `公开资料覆盖度约 ${coverageScore}，建议补齐缺失平台资料。` : '',
    text(job.status) === 'needs_review' ? 'Growth 调研结果需要主理人复核后再用于重要决策。' : '',
  ].filter(Boolean)

  return {
    ...localReport,
    generatedAt: new Date().toISOString(),
    summary: [
      `${brand.name} 的品牌摸底报告已由 AMC-Growth 调研生成，并回写到 AMC-Kanban。`,
      coverageScore !== null ? `本次公开资料覆盖度：${coverageScore}。` : '',
      reportPaths.length ? `Growth 报告路径：${reportPaths[0]}` : '',
    ].filter(Boolean).join(' '),
    dataSources: uniqueStrings([
      'AMC-Growth 品牌摸底调研',
      ...localReport.dataSources,
      ...coverageItems.map((item) => `Growth ${item}`),
    ]),
    marketingStatus: text(result.assessment_status)
      ? `Growth 调研状态：${text(result.assessment_status)}。${localReport.marketingStatus}`
      : localReport.marketingStatus,
    marketAnalysis: localReport.marketAnalysis,
    issues: uniqueStrings([...growthIssues, ...localReport.issues]),
    growthPoints: localReport.growthPoints,
    missingQuestions: uniqueStrings([
      ...localReport.missingQuestions,
      reportPaths.length ? '请主理人查看 Growth 报告全文，确认是否有平台资料缺失或竞品判断需要修正。' : '',
    ]),
  }
}

async function saveResearchReport(
  brandId: string,
  report: NonNullable<BrandPlanWorkspaceData['researchReport']>
): Promise<NonNullable<BrandPlanWorkspaceData['researchReport']>> {
  const reportForSnapshot = { ...report }
  delete reportForSnapshot.snapshotId
  const dataHash = hashJson(reportForSnapshot)
  const existing = await prisma.brandGrowthResearchSnapshot.findFirst({
    where: { brandId, dataHash },
    orderBy: { generatedAt: 'desc' },
    select: { id: true },
  })
  const snapshot = existing || await prisma.brandGrowthResearchSnapshot.create({
    data: {
      brandId,
      source: report.dataSources.includes('AMC-Growth 数据调研') ? 'amc-growth' : 'amc-kanban',
      sourceVersion: report.generatedAt,
      report: reportForSnapshot as Prisma.InputJsonValue,
      dataHash,
    },
    select: { id: true },
  })
  const persistedReport = { ...reportForSnapshot, snapshotId: snapshot.id }
  await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: { researchReport: persistedReport as Prisma.InputJsonValue },
    create: { brandId, negPrompts: [], researchReport: persistedReport as Prisma.InputJsonValue },
  })
  return persistedReport
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

async function saveWorkspacePatch(
  brandId: string,
  current: BrandPlanWorkspaceData,
  body: Record<string, unknown> | undefined
): Promise<BrandPlanWorkspaceData> {
  const target = text(body?.target)
  const value = body?.value
  if (!target) throw new BrandPlanError('workspace_patch_target_required', 400)

  if (target === 'research_report') {
    const report = normalizeResearchReport(value)
    if (!report) throw new BrandPlanError('invalid_research_report', 400)
    const savedReport = await saveResearchReport(brandId, {
      ...report,
      generatedAt: report.generatedAt || new Date().toISOString(),
    })
    return { ...current, researchReport: savedReport }
  }

  if (target === 'annual_plan') {
    const annualPlan = objectValue(value) as NonNullable<BrandPlanWorkspaceData['annualPlan']>
    if (!annualPlan.goal && !annualPlan.theme) throw new BrandPlanError('invalid_annual_plan', 400)
    await saveMarketingSolutionVersion({
      brandId,
      kind: 'ANNUAL',
      period: String(new Date().getFullYear()),
      input: { target, editedAt: new Date().toISOString() },
      output: annualPlan,
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'MANUAL_EDIT',
    })
    return { ...current, annualPlan }
  }

  if (target === 'quarter_plan') {
    const quarterPlan = objectValue(value) as NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number]
    if (!/^Q[1-4]$/.test(text(quarterPlan.quarter))) throw new BrandPlanError('invalid_quarter_plan', 400)
    const quarterlyPlans = [
      ...(current.quarterlyPlans || []).filter((item) => item.quarter !== quarterPlan.quarter),
      quarterPlan,
    ]
    await saveMarketingSolutionVersion({
      brandId,
      kind: 'QUARTERLY',
      period: quarterPlan.quarter,
      input: { target, editedAt: new Date().toISOString() },
      output: quarterPlan,
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'MANUAL_EDIT',
    })
    return { ...current, quarterlyPlans }
  }

  if (target === 'calendar_month') {
    const month = normalizeMonth(body?.month)
    const items = arrayValue(value) as NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]
    if (!items.length) throw new BrandPlanError('invalid_calendar_month', 400)
    const publishingCalendar = {
      generatedAt: new Date().toISOString(),
      generationMode: 'AMC_CONTENT_ASSISTED' as const,
      months: {
        ...(current.publishingCalendar?.months || {}),
        [month]: items,
      },
    }
    await syncCalendarMaterialRequirements(brandId, month, items)
    await saveMarketingSolutionVersion({
      brandId,
      kind: 'CALENDAR',
      period: month,
      input: { target, month, editedAt: new Date().toISOString() },
      output: { month, items },
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'MANUAL_EDIT',
    })
    return { ...current, publishingCalendar }
  }

  throw new BrandPlanError('invalid_workspace_patch_target', 400)
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

async function buildAnnualMarketingSolution(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null
): Promise<NonNullable<BrandPlanWorkspaceData['annualPlan']>> {
  const fallback = await buildRuleAnnualMarketingSolution(brand, current, interview)
  const input = {
    ...buildMarketingPlanInput(brand, current, interview),
    subscriptionStrategy: fallback.subscriptionStrategy,
    planningWindow: {
      rule: '如果当前季度剩余不到一个月，则从下一季度开始；否则从当前季度开始。连续规划未来四个季度。',
      quarters: (fallback.quarterlyPlans || []).map((item) => ({
        quarter: item.quarter,
        months: item.monthlyFocus.map((month) => month.month),
        focus: item.focus,
      })),
    },
  }
  const llm = await callMarketingPlanLLM('annual', input)
  if (!llm.value) {
    return {
      ...fallback,
      generationMode: 'RULE_FALLBACK',
      llmProvider: llm.provider,
      llmModel: llm.modelName,
      llmError: llm.error,
    }
  }
  return normalizeAnnualMarketingSolution(llm.value, fallback, llm)
}

async function buildRuleAnnualMarketingSolution(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null
): Promise<NonNullable<BrandPlanWorkspaceData['annualPlan']>> {
  const planningQuarters = planningQuarterSequence()
  const products = primaryProducts(brand, { available: false })
  const interviewFocus = interviewMaterialText(interview)
  const subscriptionStrategy = await buildSubscriptionStrategy(brand)
  const researchFocus = current.researchReport?.growthPoints?.[0] || current.researchReport?.summary || ''
  const theme = text(brand.knowledge?.promotionFocus) || products[0] || interviewFocus || '稳定提升本地顾客认知和到店转化'
  const platformCoverage = subscriptionStrategy.platformCoverage
  const basePoints = uniqueStrings([
    ...products,
    ...stringList(current.researchReport?.growthPoints),
    text(brand.knowledge?.promotionFocus),
    interviewFocus,
  ]).slice(0, 6)
  const promotionPointNames = basePoints.length ? basePoints : ['招牌产品', '门店位置和便利性', '真实顾客评价', '节日活动']
  const quarterTemplates = [
    {
      quarter: 'Q1',
      strategy: '先把顾客第一次看到品牌时需要判断的信息讲清楚，建立可信线上门面。',
      focus: '整理基础资料、建立招牌认知',
      campaigns: ['新年/开年主题', '招牌产品教育', '门店位置与营业信息强化'],
      contentThemes: ['招牌是什么', '为什么值得来', '怎么到店/怎么预订'],
    },
    {
      quarter: 'Q2',
      strategy: '把主推产品放进真实消费场景里，推动收藏、咨询和到店。',
      focus: '放大主推产品和消费场景',
      campaigns: ['家庭/朋友聚餐', '工作餐或日常复购', '顾客评价内容'],
      contentThemes: ['适合谁来吃/使用', '人均和套餐', '顾客真实反馈'],
    },
    {
      quarter: 'Q3',
      strategy: '围绕复购、预订、外卖或路线点击优化转化入口，让内容更接近生意结果。',
      focus: '优化转化入口和复购活动',
      campaigns: ['套餐/会员', '外卖或预订转化', '商圈合作'],
      contentThemes: ['限时理由', '下单/预订入口', '附近顾客行动提示'],
    },
    {
      quarter: 'Q4',
      strategy: '抓住节日和年末场景，把全年积累的口碑、招牌和活动沉淀成强记忆点。',
      focus: '节日节点和年度口碑沉淀',
      campaigns: ['节日活动', '年度招牌回顾', '老顾客召回'],
      contentThemes: ['节日聚会', '年度人气产品', '感谢老顾客'],
    },
  ]
  const quarterlyPlans = planningQuarters.map((planningQuarter, sequenceIndex) => {
    const quarterPlan = quarterTemplates[planningQuarter.quarterIndex]
    const quarterProducts = promotionPointNames.slice(0, 4)
    const monthlyFocus = [0, 1, 2].map((offset) => {
      const date = new Date(planningQuarter.year, planningQuarter.quarterIndex * 3 + offset, 1)
      const point = quarterProducts[offset % Math.max(1, quarterProducts.length)]
      return {
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        focus: offset === 0
          ? `确认并集中讲清楚“${point}”的卖点和素材。`
          : offset === 1
            ? `围绕“${point}”做连续场景内容和活动承接。`
            : `复盘本季度内容表现，强化“${point}”的转化入口。`,
        promotionPoints: quarterProducts.slice(0, 3),
      }
    })
    return {
      ...quarterPlan,
      quarter: planningQuarter.quarter,
      promotionPoints: quarterProducts.map((point, index) => ({
        name: point,
        rationale: index === 0 && sequenceIndex === 0 ? '优先承接当前阶段最需要讲清楚的核心产品/服务认知。' : '作为季度内容的辅助转化理由。',
        targetAudience: index % 2 === 0 ? '附近本地顾客和回头客' : '第一次看到品牌的新客',
        customerAction: '收藏、咨询、点击路线、预订或下单',
        platforms: platformCoverage,
        suggestedMonthlyPosts: Math.max(1, Math.round(subscriptionStrategy.monthlyContentQuota / Math.max(1, quarterProducts.length))),
      })),
      monthlyFocus,
    }
  })
  return {
    generatedAt: new Date().toISOString(),
    goal: interviewFocus
      ? `未来四个季度围绕主理人确认的经营重点，结合订阅服务范围，让附近顾客持续看见、看懂并愿意行动。`
      : `未来四个季度结合订阅服务范围，让附近顾客持续看见、看懂并愿意行动。`,
    theme,
    quarterlyFocus: quarterlyPlans.map((item) => ({ quarter: item.quarter, focus: item.focus, campaigns: item.campaigns })),
    quarterlyPlans,
    metrics: ['路线点击', '电话/私信咨询', '预订/下单点击', '内容发布完成率', '顾客评价与收藏'],
    subscriptionStrategy,
    ...(researchFocus ? { researchFocus } : {}),
    ...(current.researchReport?.snapshotId ? { researchSnapshotId: current.researchReport.snapshotId } : {}),
    generationMode: 'RULE_FALLBACK',
  }
}

async function buildQuarterMarketingSolution(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null,
  body?: Record<string, unknown>
): Promise<NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number]> {
  const fallback = buildRuleQuarterMarketingSolution(brand, current, interview, body)
  const llm = await callMarketingPlanLLM('quarter', buildMarketingPlanInput(brand, current, interview, body))
  if (!llm.value) {
    return {
      ...fallback,
      generationMode: 'RULE_FALLBACK',
      llmProvider: llm.provider,
      llmModel: llm.modelName,
      llmError: llm.error,
    }
  }
  return normalizeQuarterMarketingSolution(llm.value, fallback, llm)
}

function buildRuleQuarterMarketingSolution(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null,
  body?: Record<string, unknown>
): NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number] {
  const now = new Date()
  const requestedQuarter = text(body?.quarter)
  const quarterIndex = requestedQuarter.match(/^Q[1-4]$/) ? Number(requestedQuarter.slice(1)) - 1 : Math.floor(now.getMonth() / 3)
  const quarter = `Q${quarterIndex + 1}`
  const annualQuarterPlan = current.annualPlan?.quarterlyPlans?.find((item) => item.quarter === quarter)
  const annualQuarterFocus = current.annualPlan?.quarterlyFocus.find((item) => item.quarter === quarter)
  const monthStart = quarterIndex * 3
  const monthlyFocus = [0, 1, 2].map((offset) => {
    const date = new Date(now.getFullYear(), monthStart + offset, 1)
    const annualMonth = annualQuarterPlan?.monthlyFocus?.[offset]
    return {
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      focus: annualMonth?.focus || (offset === 0 ? '确认主推产品和内容素材' : offset === 1 ? '集中发布活动与场景内容' : '复盘数据并强化转化入口'),
    }
  })
  const annualPromotionDirections = (annualQuarterPlan?.promotionPoints || []).map((point) =>
    `围绕“${point.name}”做内容：${point.rationale || annualQuarterPlan?.strategy || '讲清楚卖点和顾客行动理由'}；行动目标：${point.customerAction}。`
  )
  return {
    quarter,
    generatedAt: new Date().toISOString(),
    objective: annualQuarterPlan?.strategy || annualQuarterFocus?.focus || '把年度方向拆成季度可执行节奏。',
    monthlyFocus,
    contentDirections: [
      ...annualPromotionDirections,
      ...(annualQuarterPlan?.contentThemes || []).map((item) => `季度内容主题：${item}`),
      ...primaryProducts(brand, { available: false }).slice(0, 3).map((item) => `围绕“${item}”做真实场景、卖点解释和顾客行动引导。`),
      interviewMaterialText(interview) ? `结合主理人访谈确认内容：${interviewMaterialText(interview)}` : '',
    ].filter(Boolean),
    promotionPoints: annualQuarterPlan?.promotionPoints?.map((point) => ({
      name: point.name,
      rationale: point.rationale,
      customerAction: point.customerAction,
      platforms: point.platforms,
      suggestedMonthlyPosts: point.suggestedMonthlyPosts,
    })),
    ...(current.researchReport?.snapshotId ? { researchSnapshotId: current.researchReport.snapshotId } : {}),
    generationMode: 'RULE_FALLBACK',
  }
}

async function buildPublishingMonth(
  brand: BrandPlanBrand,
  month: string,
  interview: BrandPlanMerchantInterview | null,
  current: BrandPlanWorkspaceData
): Promise<NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]> {
  const products = primaryProducts(brand, { available: false })
  const interviewFocus = interviewMaterialText(interview)
  const subscriptionStrategy = current.annualPlan?.subscriptionStrategy || await buildSubscriptionStrategy(brand)
  const schedule = buildMonthlyPublishingSchedule(
    month,
    subscriptionStrategy.publishingFreq || brand.knowledge?.publishingFreq,
    subscriptionStrategy.platformCoverage
  )
  const promotionPoints = buildCalendarPromotionPoints({
    brand,
    current,
    month,
    products,
    interviewFocus,
    schedule,
  })
  const creativePool = await requestCalendarCreativePool(brand, current, promotionPoints)

  return schedule.map((slot, index) => {
    const product = products[index % Math.max(1, products.length)] || '招牌产品'
    const promotionPoint = promotionPoints[index % Math.max(1, promotionPoints.length)]
    const candidate = selectCalendarCreativeCandidate(creativePool.creativeCandidates, promotionPoint.id, slot.platform.slug, index)
    return {
      id: `${month}-${String(index + 1).padStart(2, '0')}-${slot.platform.slug}`,
      date: slot.date,
      title: calendarItemTitle(product, candidate),
      platform: slot.platform.label,
      platformSlug: slot.platform.slug,
      contentType: calendarContentType(candidate, index),
      product,
      planning: calendarPlanningText(product, candidate, interviewFocus),
      sampleHit: calendarSampleHit(product, candidate),
      status: '待确认',
      selectedCreativeCandidateId: text(candidate?.creativeCandidateId),
      matchedTags: stringList(candidate?.matchedTags),
      matchedInspirations: stringList(candidate?.matchedInspirations),
      materialRequirements: calendarMaterialRequirements(product, candidate),
      contentLibraryGap: calendarContentGap(creativePool.contentLibraryGaps, promotionPoint.id, candidate),
    }
  })
}

async function regeneratePublishingCalendarItem(
  brand: BrandPlanBrand,
  _month: string,
  item: BrandPlanCalendarItem,
  _interview: BrandPlanMerchantInterview | null,
  current: BrandPlanWorkspaceData
): Promise<BrandPlanCalendarItem> {
  const platform = item.platformSlug || normalizePlatformSlug(item.platform)
  const point = {
    id: item.id,
    goal: current.annualPlan?.goal || current.researchReport?.summary || '提升本地顾客认知和行动',
    sellingPoint: item.product,
    customerAction: '收藏、咨询、点击路线、预订或下单',
    expectedPublishCount: 1,
    platforms: [platform],
    targetPublishWindow: { start: item.date, end: item.date },
  }
  const pool = await requestCalendarCreativePool(brand, current, [point], item.id)
  const candidate = selectCalendarCreativeCandidate(pool.creativeCandidates, point.id, platform, 0)
  if (!candidate) {
    return {
      ...item,
      selectedCreativeCandidateId: undefined,
      materialRequirements: [`补充“${item.product}”真实门店画面或顾客场景素材。`],
      contentLibraryGap: 'amc-content 暂不可用，已保留人工素材要求。',
    }
  }
  return {
    ...item,
    title: calendarItemTitle(item.product, candidate),
    contentType: calendarContentType(candidate, 0),
    planning: calendarPlanningText(item.product, candidate, ''),
    sampleHit: calendarSampleHit(item.product, candidate),
    selectedCreativeCandidateId: text(candidate.creativeCandidateId),
    matchedTags: stringList(candidate.matchedTags),
    matchedInspirations: stringList(candidate.matchedInspirations),
    materialRequirements: calendarMaterialRequirements(item.product, candidate),
    contentLibraryGap: calendarContentGap(pool.contentLibraryGaps, point.id, candidate),
  }
}

type CalendarPromotionPoint = {
  id: string
  goal: string
  sellingPoint: string
  customerAction: string
  expectedPublishCount: number
  platforms: string[]
  targetPublishWindow: { start: string; end: string }
}

function buildCalendarPromotionPoints(input: {
  brand: BrandPlanBrand
  current: BrandPlanWorkspaceData
  month: string
  products: string[]
  interviewFocus: string
  schedule: Array<{ date: string; platform: { slug: string; label: string } }>
}): CalendarPromotionPoint[] {
  const quarter = quarterForMonth(input.month)
  const quarterPlan = input.current.quarterlyPlans?.find((plan) => plan.quarter === quarter)
  const annualQuarterPlan = input.current.annualPlan?.quarterlyPlans?.find((plan) => plan.quarter === quarter)
  const structuredPoints = [
    ...(quarterPlan?.promotionPoints || []),
    ...(annualQuarterPlan?.promotionPoints || []).map((point) => ({
      name: point.name,
      rationale: point.rationale,
      customerAction: point.customerAction,
      platforms: point.platforms,
      suggestedMonthlyPosts: point.suggestedMonthlyPosts,
    })),
  ].filter((point) => point.name)
  if (structuredPoints.length) {
    const scheduledPlatforms = uniqueStrings(input.schedule.map((slot) => slot.platform.slug))
    const visiblePoints = structuredPoints.slice(0, Math.max(3, Math.min(8, input.schedule.length)))
    return visiblePoints.map((point, index) => {
      const pointPlatforms = uniqueStrings(point.platforms).filter((platform) => scheduledPlatforms.includes(platform))
      const assignedSlots = input.schedule.filter((slot, slotIndex) => {
        const platformMatch = !pointPlatforms.length || pointPlatforms.includes(slot.platform.slug)
        return slotIndex % visiblePoints.length === index && platformMatch
      })
      const fallbackSlots = assignedSlots.length ? assignedSlots : input.schedule.filter((_, slotIndex) => slotIndex % visiblePoints.length === index)
      const dates = fallbackSlots.map((slot) => slot.date)
      return {
        id: `bp_${input.month.replace('-', '')}_${index + 1}`,
        goal: point.rationale || quarterPlan?.objective || annualQuarterPlan?.strategy || input.current.annualPlan?.goal || '提升本地顾客认知和行动',
        sellingPoint: point.name,
        customerAction: point.customerAction || '收藏、咨询、点击路线、预订或下单',
        expectedPublishCount: Math.max(1, point.suggestedMonthlyPosts || fallbackSlots.length),
        platforms: uniqueStrings((pointPlatforms.length ? pointPlatforms : fallbackSlots.map((slot) => slot.platform.slug))),
        targetPublishWindow: {
          start: dates[0] || `${input.month}-01`,
          end: dates[dates.length - 1] || `${input.month}-28`,
        },
      }
    })
  }
  const directions = quarterPlan?.contentDirections || []
  const sourcePoints = [
    ...input.products,
    ...stringList(input.current.researchReport?.growthPoints).map((item) => item.replace(/^围绕“(.+?)”.*$/, '$1')),
    ...directions.map((item) => item.replace(/^围绕“(.+?)”.*$/, '$1')),
    ...(annualQuarterPlan?.contentThemes || []),
    input.interviewFocus,
    text(input.brand.knowledge?.promotionFocus),
  ]
    .map((item) => item.replace(/[。.!！]$/, '').trim())
    .filter(Boolean)
  const uniquePoints = uniqueStrings(sourcePoints).slice(0, Math.max(3, Math.min(8, input.schedule.length)))
  const fallback = uniquePoints.length ? uniquePoints : ['招牌产品或核心服务', '到店理由', '真实信任内容']
  return fallback.map((sellingPoint, index) => {
    const assignedSlots = input.schedule.filter((_, slotIndex) => slotIndex % fallback.length === index)
    const dates = assignedSlots.map((slot) => slot.date)
    return {
      id: `bp_${input.month.replace('-', '')}_${index + 1}`,
      goal: index === 0
        ? input.current.annualPlan?.goal || input.current.researchReport?.summary || '提升本地顾客认知和行动'
        : `让顾客更具体地理解“${sellingPoint}”并愿意行动`,
      sellingPoint,
      customerAction: '收藏、咨询、点击路线、预订或下单',
      expectedPublishCount: Math.max(1, assignedSlots.length),
      platforms: uniqueStrings(assignedSlots.map((slot) => slot.platform.slug)),
      targetPublishWindow: {
        start: dates[0] || `${input.month}-01`,
        end: dates[dates.length - 1] || `${input.month}-28`,
      },
    }
  })
}

function quarterForMonth(month: string) {
  const [, monthNumber] = month.split('-').map(Number)
  const index = Number.isFinite(monthNumber) ? Math.floor((monthNumber - 1) / 3) : Math.floor(new Date().getMonth() / 3)
  return `Q${Math.min(4, Math.max(1, index + 1))}`
}

async function requestCalendarCreativePool(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  promotionPoints: CalendarPromotionPoint[],
  refreshPublicationId?: string
) {
  try {
    return await matchPromotionStrategyCreativeBatch({
      merchantId: brand.id,
      merchantName: brand.name,
      merchantCategory: brand.industry || 'Restaurant / F&B',
      market: text(brand.knowledge?.market || brand.location) || 'Singapore',
      promotionPlanScope: 'marketing_plan_calendar',
      promotionGoal: current.annualPlan?.goal || current.researchReport?.summary || '提升本地顾客认知和行动',
      refreshMode: refreshPublicationId ? 'single_day_creative' : 'full_candidate_pool',
      targetRefreshPublicationId: refreshPublicationId,
      promotionPoints: promotionPoints.map((point) => ({
        promotionPointId: point.id,
        promotionGoal: point.goal,
        sellingPoint: point.sellingPoint,
        customerAction: point.customerAction,
        expectedPublishCount: point.expectedPublishCount,
        requestedCandidateCount: point.expectedPublishCount + 3,
        platforms: point.platforms,
        targetPublishWindow: point.targetPublishWindow,
      })),
      assetContext: { existingAssets: [] },
      serviceScope: { source: 'brand_plan', owner: 'amc-kanban' },
    })
  } catch {
    return {
      contentMatchRequestId: `failed_${Date.now()}`,
      libraryVersions: {},
      matches: [],
      creativeCandidates: [],
      contentLibraryGaps: promotionPoints.map((point) => ({
        promotionPointId: point.id,
        reason: 'amc_content_unavailable',
      })),
      candidateAssetNeeds: [],
      candidateStoreVisitNeeds: [],
      candidateMaterialPrintNeeds: [],
    }
  }
}

function selectCalendarCreativeCandidate(
  candidates: Array<Record<string, unknown>>,
  promotionPointId: string,
  platform: string,
  index: number
) {
  const pointCandidates = candidates.filter((candidate) => text(candidate.promotionPointId) === promotionPointId)
  const platformCandidates = pointCandidates.filter((candidate) => {
    const sourcePlatform = text(objectValue(candidate.sourceVideo).platform || objectValue(candidate.sourcePost).platform)
    return !sourcePlatform || normalizePlatformSlug(sourcePlatform) === normalizePlatformSlug(platform)
  })
  const pool = platformCandidates.length ? platformCandidates : pointCandidates
  if (!pool.length) return null
  return pool[index % pool.length]
}

function calendarItemTitle(product: string, candidate: Record<string, unknown> | null) {
  const script = objectValue(candidate?.scriptContent)
  return text(script.title) || text(objectValue(candidate?.sourcePost).title) || text(objectValue(candidate?.sourceVideo).title) || `${product} 的到店理由`
}

function calendarContentType(candidate: Record<string, unknown> | null, index: number) {
  const format = text(candidate?.contentFormat).toLowerCase()
  if (format.includes('video')) return '短视频'
  if (format.includes('carousel') || format.includes('image') || format.includes('post')) return '图文'
  return index % 2 === 0 ? '短视频' : '图文'
}

function calendarPlanningText(product: string, candidate: Record<string, unknown> | null, interviewFocus: string) {
  const script = objectValue(candidate?.scriptContent)
  const angle = text(candidate?.contentAngle) || text(candidate?.recommendationReason)
  const cta = text(script.cta) || '引导收藏、咨询、路线点击、预订或下单'
  return [
    angle || `用真实门店画面说明“${product}”为什么值得来试。`,
    cta,
    interviewFocus ? `参考主理人访谈：${interviewFocus}` : '',
  ].filter(Boolean).join(' ')
}

function calendarSampleHit(product: string, candidate: Record<string, unknown> | null) {
  const script = objectValue(candidate?.scriptContent)
  const opening = text(script.opening)
  const title = text(script.title) || text(objectValue(candidate?.sourcePost).title) || `附近想吃点稳的，就点这份 ${product}`
  return opening ? `标题：${title}。开头：${opening}` : `标题：${title}。开头：别只看菜单，先看这份为什么常被点。`
}

function calendarMaterialRequirements(product: string, candidate: Record<string, unknown> | null) {
  const assetNeeds = stringList(candidate?.assetNeeds)
  return assetNeeds.length ? assetNeeds : [`补充“${product}”真实门店画面或顾客场景素材。`]
}

function calendarContentGap(
  gaps: Array<Record<string, unknown>>,
  promotionPointId: string,
  candidate: Record<string, unknown> | null
) {
  if (!candidate) return 'amc-content 未返回可用候选，需要补充标签、脚本或素材模板。'
  return gaps.some((gap) => text(gap.promotionPointId) === promotionPointId)
    ? 'amc-content 内容库存在缺口，当前使用可用候选并保留补库提醒。'
    : undefined
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

function buildMarketingPlanInput(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null,
  body?: Record<string, unknown>
) {
  return {
    brand: {
      id: brand.id,
      name: brand.name,
      industry: brand.industry,
      location: brand.location,
      address: brand.address,
      description: brand.description,
    },
    stores: arrayValue(brand.knowledge?.stores),
    products: primaryProducts(brand, { available: false }),
    brandClaim: brand.knowledge?.brandClaim || null,
    merchantInterview: interview,
    researchReport: current.researchReport || null,
    subscriptionStrategy: current.annualPlan?.subscriptionStrategy || null,
    annualPlan: current.annualPlan || null,
    request: body || {},
  }
}

async function callMarketingPlanLLM(scope: 'annual' | 'quarter', input: Record<string, unknown>) {
  const schemaInstruction = scope === 'annual'
    ? `返回 JSON 对象，字段必须为：goal(string), theme(string), quarterlyFocus(array，每项含 quarter/focus/campaigns), quarterlyPlans(array，必须含连续四个季度；quarter 取 Q1-Q4；每项含 quarter, strategy, focus, promotionPoints, campaigns, contentThemes, monthlyFocus。promotionPoints 每项含 name, rationale, targetAudience, customerAction, platforms, suggestedMonthlyPosts；monthlyFocus 每项含 month, focus, promotionPoints), metrics(array), researchFocus(string)。`
    : `返回 JSON 对象，字段必须为：quarter(string, Q1-Q4), objective(string), monthlyFocus(array，每项含 month/focus), contentDirections(array), promotionPoints(array，每项含 name/rationale/customerAction/platforms/suggestedMonthlyPosts)。`
  const prompt = [
    '你是 AMC-Kanban 的本地商家营销方案策划师。',
    '请基于输入里的品牌信息、门店信息、品牌主张、Growth 数据调研、订阅运营策略，生成可执行的营销方案。',
    '要求：接地气，适合普通餐饮/本地服务老板；不要写空泛品牌大词；必须受订阅平台和发布频次约束；不要虚构不存在的产品或门店。',
    '品牌营销方案必须能直接支撑季度方案和月度发布日历：每个季度都要写清楚推广策略、重点推广点、适用平台、建议发布次数、顾客行动和月度拆解。',
    '如果输入里有 planningWindow.quarters，必须按该顺序和月份生成未来四个季度；不要默认从 Q1 开始。',
    schemaInstruction,
    '只输出合法 JSON，不要 Markdown，不要解释。',
    JSON.stringify(input),
  ].join('\n\n')
  const result = await callLLM('marketing_plan', prompt, scope === 'annual' ? 4200 : 2200, {
    temperature: 0.35,
    jsonMode: true,
    deadlineMs: 45000,
    attemptTimeoutMs: [20000, 25000],
    maxAttempts: 2,
  })
  return {
    provider: result.provider,
    modelName: result.modelName,
    error: result.error,
    value: parseJsonObject(result.text),
  }
}

function normalizeAnnualMarketingSolution(
  value: Record<string, unknown>,
  fallback: NonNullable<BrandPlanWorkspaceData['annualPlan']>,
  llm: { provider: string; modelName: string; error?: string }
): NonNullable<BrandPlanWorkspaceData['annualPlan']> {
  const quarterlyFocus = arrayValue(value.quarterlyFocus)
    .map((item) => objectValue(item))
    .map((item) => ({
      quarter: text(item.quarter) || 'Q1',
      focus: text(item.focus),
      campaigns: stringList(item.campaigns),
    }))
    .filter((item) => item.focus)
  const quarterlyPlans = normalizeAnnualQuarterlyPlans(value.quarterlyPlans, fallback.quarterlyPlans || [])
  return {
    ...fallback,
    generatedAt: new Date().toISOString(),
    goal: text(value.goal) || fallback.goal,
    theme: text(value.theme) || fallback.theme,
    quarterlyFocus: quarterlyFocus.length ? quarterlyFocus : fallback.quarterlyFocus,
    quarterlyPlans: quarterlyPlans.length ? quarterlyPlans : fallback.quarterlyPlans,
    metrics: stringList(value.metrics).length ? stringList(value.metrics) : fallback.metrics,
    researchFocus: text(value.researchFocus) || fallback.researchFocus,
    generationMode: 'LLM',
    llmProvider: llm.provider,
    llmModel: llm.modelName,
  }
}

function normalizeAnnualQuarterlyPlans(
  value: unknown,
  fallback: NonNullable<BrandPlanWorkspaceData['annualPlan']>['quarterlyPlans']
): NonNullable<NonNullable<BrandPlanWorkspaceData['annualPlan']>['quarterlyPlans']> {
  const fallbackByQuarter = new Map((fallback || []).map((item) => [item.quarter, item]))
  const parsed = arrayValue(value)
    .map((item) => objectValue(item))
    .map((item) => {
      const quarter = text(item.quarter)
      const fallbackItem = fallbackByQuarter.get(quarter)
      const promotionPoints = arrayValue(item.promotionPoints)
        .map((point) => objectValue(point))
        .map((point) => ({
          name: text(point.name),
          rationale: text(point.rationale),
          targetAudience: text(point.targetAudience),
          customerAction: text(point.customerAction) || '收藏、咨询、点击路线、预订或下单',
          platforms: stringList(point.platforms),
          suggestedMonthlyPosts: clampPostCount(Number(point.suggestedMonthlyPosts) || 1),
        }))
        .filter((point) => point.name)
      const monthlyFocus = arrayValue(item.monthlyFocus)
        .map((month) => objectValue(month))
        .map((month) => ({
          month: text(month.month),
          focus: text(month.focus),
          promotionPoints: stringList(month.promotionPoints),
        }))
        .filter((month) => month.month && month.focus)
      return {
        quarter,
        strategy: text(item.strategy) || fallbackItem?.strategy || '',
        focus: text(item.focus) || fallbackItem?.focus || '',
        promotionPoints: promotionPoints.length ? promotionPoints : fallbackItem?.promotionPoints || [],
        campaigns: stringList(item.campaigns).length ? stringList(item.campaigns) : fallbackItem?.campaigns || [],
        contentThemes: stringList(item.contentThemes).length ? stringList(item.contentThemes) : fallbackItem?.contentThemes || [],
        monthlyFocus: monthlyFocus.length ? monthlyFocus : fallbackItem?.monthlyFocus || [],
      }
    })
    .filter((item) => /^Q[1-4]$/.test(item.quarter) && item.focus)
  if (!fallback?.length) return parsed
  const parsedByQuarter = new Map(parsed.map((item) => [item.quarter, item]))
  return fallback.map((fallbackItem) => parsedByQuarter.get(fallbackItem.quarter) || fallbackItem)
}

function normalizeQuarterMarketingSolution(
  value: Record<string, unknown>,
  fallback: NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number],
  llm: { provider: string; modelName: string; error?: string }
): NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number] {
  const monthlyFocus = arrayValue(value.monthlyFocus)
    .map((item) => objectValue(item))
    .map((item) => ({ month: text(item.month), focus: text(item.focus) }))
    .filter((item) => item.month && item.focus)
  const promotionPoints = arrayValue(value.promotionPoints)
    .map((item) => objectValue(item))
    .map((item) => ({
      name: text(item.name),
      rationale: text(item.rationale),
      customerAction: text(item.customerAction) || '收藏、咨询、点击路线、预订或下单',
      platforms: stringList(item.platforms),
      suggestedMonthlyPosts: clampPostCount(Number(item.suggestedMonthlyPosts) || 1),
    }))
    .filter((item) => item.name)
  return {
    ...fallback,
    generatedAt: new Date().toISOString(),
    quarter: text(value.quarter) || fallback.quarter,
    objective: text(value.objective) || fallback.objective,
    monthlyFocus: monthlyFocus.length ? monthlyFocus : fallback.monthlyFocus,
    contentDirections: stringList(value.contentDirections).length ? stringList(value.contentDirections) : fallback.contentDirections,
    promotionPoints: promotionPoints.length ? promotionPoints : fallback.promotionPoints,
    generationMode: 'LLM',
    llmProvider: llm.provider,
    llmModel: llm.modelName,
  }
}

async function saveMarketingSolutionVersion(input: {
  brandId: string
  kind: 'ANNUAL' | 'QUARTERLY' | 'CALENDAR'
  period: string
  input: unknown
  output: unknown
  researchSnapshotId?: string
  generationMode: 'LLM' | 'RULE_FALLBACK' | 'AMC_CONTENT_ASSISTED' | 'MANUAL_EDIT'
  llmProvider?: string
  llmModel?: string
  llmError?: string
}) {
  const previous = await prisma.brandMarketingSolution.findFirst({
    where: { brandId: input.brandId, kind: input.kind, period: input.period },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  return prisma.brandMarketingSolution.create({
    data: {
      brandId: input.brandId,
      kind: input.kind,
      period: input.period,
      version: (previous?.version || 0) + 1,
      input: input.input as Prisma.InputJsonValue,
      output: input.output as Prisma.InputJsonValue,
      generationMode: input.generationMode,
      llmProvider: input.llmProvider,
      llmModel: input.llmModel,
      llmError: input.llmError,
      researchSnapshotId: input.researchSnapshotId,
    },
  })
}

function requireAnnualPlan(current: BrandPlanWorkspaceData) {
  if (!current.annualPlan) throw new BrandPlanError('annual_plan_required', 409)
}

function requireQuarterPlan(current: BrandPlanWorkspaceData) {
  if (!current.quarterlyPlans?.length && !current.annualPlan?.quarterlyPlans?.length) {
    throw new BrandPlanError('quarter_plan_required', 409)
  }
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

async function buildSubscriptionStrategy(brand: BrandPlanBrand) {
  const subscriptions = Array.isArray(brand.subscriptions) ? brand.subscriptions : []
  const active = subscriptions.find((subscription: (typeof subscriptions)[number]) =>
    subscription.status === 'ACTIVE' && (!subscription.contractEndDate || subscription.contractEndDate.getTime() > Date.now())
  ) || subscriptions[0]
  const plan = active ? SUBSCRIPTION_PLANS.find((item) => item.id === active.planId) : null
  const planId = active?.planId || 'none'
  const policy = planId !== 'none' ? await getSubscriptionOperationsPolicy(planId) : null
  const platformCoverage = policy?.platformCoverage.length ? policy.platformCoverage : platformCoverageForPlan(planId)
  const configuredPublishingFreq = policy ? normalizePublishingFreq(policy.publishingFreq) : null
  return {
    planId,
    planName: policy?.planName || plan?.name || active?.planName || '未激活订阅',
    includedServices: policy?.includedServices.length ? policy.includedServices : plan?.services || [],
    platformCoverage,
    monthlyContentQuota: policy?.monthlyContentQuota || monthlyContentQuotaForPlan(planId),
    publishingFreq: normalizePublishingFreq(brand.knowledge?.publishingFreq) || configuredPublishingFreq || publishingFreqForPlan(planId, platformCoverage),
  }
}

function platformCoverageForPlan(planId: string) {
  if (planId === 'essential') return ['instagram', 'tiktok', 'google_business']
  if (planId === 'booster') return ['instagram', 'tiktok', 'xiaohongshu', 'google_business']
  return []
}

function monthlyContentQuotaForPlan(planId: string) {
  if (planId === 'essential') return 12
  if (planId === 'booster') return 24
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

function planningQuarterSequence(now = new Date()) {
  const currentQuarterIndex = Math.floor(now.getMonth() / 3)
  const nextQuarterStart = new Date(now.getFullYear(), (currentQuarterIndex + 1) * 3, 1)
  const remainingMs = nextQuarterStart.getTime() - now.getTime()
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000
  const startOffset = remainingMs < oneMonthMs ? 1 : 0
  return [0, 1, 2, 3].map((offset) => {
    const absoluteQuarter = currentQuarterIndex + startOffset + offset
    const quarterIndex = absoluteQuarter % 4
    return {
      quarter: `Q${quarterIndex + 1}`,
      quarterIndex,
      year: now.getFullYear() + Math.floor(absoluteQuarter / 4),
    }
  })
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean)
  return []
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return null
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return objectValue(JSON.parse(cleaned))
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return objectValue(JSON.parse(match[0]))
    } catch {
      return null
    }
  }
}

function hashJson(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
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
