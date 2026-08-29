import type { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  generateGrowthResearchReportForBrand,
} from '@/lib/growthDataCenter'
import {
  fetchPromotionStrategyMarketCalendar,
  matchPromotionStrategyCreativeBatch,
} from '@/lib/promotion-strategy/clients'
import type { PublishingFreq } from '@/lib/brandContextBuilder'
import {
  getPlanMonthlyContentQuota,
  getPlanPlatformCoverage,
  getPlanPublishingFreq,
  SUBSCRIPTION_PLANS,
} from '@/lib/subscription/catalog'
import { getSubscriptionOperationsPolicy } from '@/lib/subscription/policy'
import { callLLM } from '@/lib/llmRouter'
import { getPromptTemplate, renderPromptTemplate } from '@/lib/promptTemplates'
import { writeAuditLog } from '@/lib/audit'
import { skuLibraryForLLM } from '@/lib/sku-library/service'
import {
  minimumCompleteCalendarMonthValue,
} from '@/lib/brand-plan/calendarRecovery'
import type { CalendarCreativeMatchStatus } from '@/lib/brand-plan/calendarCreativeMatching'
import { resolveCalendarCreativeCandidateWithRetry } from '@/lib/brand-plan/calendarCreativeMatching'
import { resolveInspirationCreativeId } from '@/lib/brand-plan/inspirationCreativeLink'
import { syncConfirmedCalendarItemsToDrafts } from '@/lib/brand-plan/calendarSync'

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
  inspirationCreativeId?: string
  inspirationSourceTitle?: string
  inspirationSourceSummary?: string
  creativeMechanism?: string
  sampleVideoUrl?: string
  sampleOriginalUrl?: string
  sampleThumbnailUrl?: string
  sampleSourcePlatform?: string
  materialRequirements?: string[]
  contentLibraryGap?: string
  scriptSource?: 'inspiration' | 'generated_from_idea' | 'merchant'
  creativeMatchStatus?: CalendarCreativeMatchStatus
  videoScript?: CalendarVideoScriptData
}

type CalendarVideoScriptData = {
  opening?: string
  shots?: string[]
  voiceover?: string[]
  subtitles?: string[]
  closing?: string
  source?: 'inspiration' | 'generated_from_idea' | 'merchant'
}

export type BrandPlanWorkspaceData = {
  researchReport?: {
    snapshotId?: string
    generatedAt: string
    summary: string
    dataSources: string[]
    sourceSystem?: 'amc-growth' | 'amc-kanban'
    growthJobId?: string
    growthBrandKey?: string
    reportTier?: string
    reportPath?: string
    reportMarkdown?: string
    reportContent?: string
    pdfReportPath?: string
    pdfDownloadPath?: string
    pdfDownloadUrl?: string
    coverageScore?: number | null
    sourceCoverage?: Record<string, unknown>
    sourcePayload?: Record<string, unknown>
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
    strategyPrinciples?: string[]
    platformStrategy?: Array<{
      platform: string
      role: string
      contentApproach: string
      customerAction: string
    }>
    contentPillars?: string[]
    quarterlyFocus: Array<{ quarter: string; focus: string; campaigns: string[]; year?: number; startMonth?: string; endMonth?: string; periodLabel?: string }>
    quarterlyPlans?: Array<{
      quarter: string
      year?: number
      startMonth?: string
      endMonth?: string
      periodLabel?: string
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
    year?: number
    startMonth?: string
    endMonth?: string
    periodLabel?: string
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
  presentationTheme?: BrandMarketingPlanPresentationTheme
}

export type BrandMarketingPlanPresentationTheme = {
  generatedAt: string
  colorSourceKey: string
  paletteId: string
  paletteName: string
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  muted: string
  decoration: 'editorial' | 'service' | 'festival' | 'fresh' | 'premium'
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
  | 'generate_annual_strategy'
  | 'generate_next_quarter_plan'
  | 'generate_publishing_calendar'
  | 'generate_publishing_calendar_item'
  | 'regenerate_calendar_item'
  | 'rewrite_calendar_item_details'
  | 'ensure_presentation_theme'

type BrandPlanBrand = NonNullable<Awaited<ReturnType<typeof loadBrandPlanBrand>>>

export async function loadBrandPlanBrand(brandId: string) {
  return prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      knowledge: true,
      owners: {
        select: {
          role: true,
          user: {
            select: {
              email: true,
              nickname: true,
            },
          },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      },
      subscriptions: {
        select: {
          planId: true,
          planName: true,
          selectedAddons: true,
          status: true,
          contractStartDate: true,
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
      gameConfig: {
        select: {
          title: true,
          description: true,
          templateType: true,
          taskPhotoEnabled: true,
          taskReviewEnabled: true,
          taskGoogleMapsEnabled: true,
          taskXiaohongshuEnabled: true,
          taskInstagramEnabled: true,
          maxSpinsPerUserDay: true,
          activityRounds: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
            },
            orderBy: { startsAt: 'asc' },
            take: 8,
          },
        },
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

type BrandPlanResearchReport = NonNullable<BrandPlanWorkspaceData['researchReport']>

export async function runBrandPlanAction(input: {
  brandId: string
  action: BrandPlanAction
  body?: Record<string, unknown>
}) {
  const brand = await loadBrandPlanBrand(input.brandId)
  if (!brand) throw new BrandPlanError('brand_not_found', 404)
  const current = readMarketingSolutionWorkspace(brand)
  let latestInterview = serializeMerchantInterview(brand.brandPlanInterviews[0])
  let extraPayload: Record<string, unknown> = {}

  let next = current
  if (input.action === 'generate_research_report') {
    const researchReport = await saveResearchReport(brand.id, await buildGrowthResearchReport(brand))
    next = {
      ...current,
      researchReport,
    }
  } else if (input.action === 'save_merchant_interview') {
    if (!isGrowthResearchReport(current.researchReport)) {
      throw new BrandPlanError('growth_research_report_required', 409)
    }
    const report = current.researchReport
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
      period: marketingPlanPeriod(annualPlan),
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
  } else if (input.action === 'generate_annual_strategy') {
    const annualPlan = await buildAnnualMarketingStrategyOnly(brand, current, latestInterview)
    next = { ...current, annualPlan }
    await saveMarketingSolutionVersion({
      brandId: brand.id,
      kind: 'ANNUAL',
      period: marketingPlanPeriod(annualPlan),
      input: {
        ...buildMarketingPlanInput(brand, current, latestInterview),
        subscriptionStrategy: annualPlan.subscriptionStrategy,
        generationStep: 'annual_strategy',
      },
      output: annualPlan,
      researchSnapshotId: annualPlan.researchSnapshotId || current.researchReport?.snapshotId,
      generationMode: annualPlan.generationMode || 'LLM',
      llmProvider: annualPlan.llmProvider,
      llmModel: annualPlan.llmModel,
      llmError: annualPlan.llmError,
    })
  } else if (input.action === 'generate_next_quarter_plan') {
    const annualPlan = await buildNextQuarterMarketingPlan(brand, current, latestInterview)
    next = { ...current, annualPlan }
    await saveMarketingSolutionVersion({
      brandId: brand.id,
      kind: 'ANNUAL',
      period: marketingPlanPeriod(annualPlan),
      input: {
        ...buildMarketingPlanInput(brand, current, latestInterview),
        subscriptionStrategy: annualPlan.subscriptionStrategy,
        generationStep: 'quarter',
      },
      output: annualPlan,
      researchSnapshotId: annualPlan.researchSnapshotId || current.researchReport?.snapshotId,
      generationMode: annualPlan.generationMode || 'LLM',
      llmProvider: annualPlan.llmProvider,
      llmModel: annualPlan.llmModel,
      llmError: annualPlan.llmError,
    })
  } else if (input.action === 'generate_publishing_calendar') {
    requireQuarterPlan(current)
    const month = clampSchedulableCalendarMonth(normalizeMonth(input.body?.month))
    const publishingFreqOverride = normalizePublishingFreq(input.body?.publishingFreqOverride)
    const monthItems = await buildPublishingMonth(brand, month, latestInterview, current, publishingFreqOverride)
    const annualPlan = publishingFreqOverride
      ? applyPublishingFrequencyOverride(current.annualPlan, publishingFreqOverride)
      : current.annualPlan
    next = {
      ...current,
      annualPlan,
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
    await syncConfirmedCalendarItemsToDrafts(brand.id, month, monthItems)
    await saveMarketingSolutionVersion({
      brandId: brand.id,
      kind: 'CALENDAR',
      period: month,
      input: buildMarketingPlanInput(brand, current, latestInterview, input.body),
      output: { month, items: monthItems },
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'AMC_CONTENT_ASSISTED',
    })
  } else if (input.action === 'generate_publishing_calendar_item') {
    requireQuarterPlan(current)
    const month = clampSchedulableCalendarMonth(normalizeMonth(input.body?.month))
    const itemIndex = Math.max(0, Number(input.body?.itemIndex) || 0)
    const publishingFreqOverride = normalizePublishingFreq(input.body?.publishingFreqOverride)
    const usedCreativeIds = stringList(input.body?.usedCreativeIds)
    const item = await buildPublishingCalendarItemByIndex(brand, month, latestInterview, current, publishingFreqOverride, itemIndex, usedCreativeIds)
    next = current
    extraPayload = { calendarItem: item, month, itemIndex }
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
    await syncConfirmedCalendarItemsToDrafts(brand.id, month, monthItems)
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
  } else if (input.action === 'rewrite_calendar_item_details') {
    requireQuarterPlan(current)
    const month = clampSchedulableCalendarMonth(normalizeMonth(input.body?.month))
    const item = objectValue(input.body?.item) as BrandPlanCalendarItem
    if (!text(item.id)) throw new BrandPlanError('calendar_item_not_found', 404)
    const rewritten = await rewriteCalendarItemDetailsWithLLM(brand, current, item)
    next = current
    extraPayload = { calendarItem: rewritten, month }
  } else if (input.action === 'ensure_presentation_theme') {
    requireAnnualPlan(current)
    next = {
      ...current,
      presentationTheme: ensurePresentationTheme(brand, current),
    }
  } else {
    throw new BrandPlanError('invalid_brand_plan_action', 400)
  }

  const persistedPublishingFreq = input.action === 'generate_publishing_calendar'
    ? normalizePublishingFreq(input.body?.publishingFreqOverride)
    : input.action === 'save_workspace_patch' && text(input.body?.target) === 'publishing_freq'
      ? normalizePublishingFreq(input.body?.value ?? input.body?.publishingFreqOverride)
      : null

  await prisma.brandKnowledge.upsert({
    where: { brandId: brand.id },
    update: {
      marketingSolution: next as Prisma.InputJsonValue,
      researchReport: next.researchReport ? next.researchReport as Prisma.InputJsonValue : undefined,
      publishingFreq: persistedPublishingFreq ? persistedPublishingFreq as Prisma.InputJsonValue : undefined,
    },
    create: {
      brandId: brand.id,
      negPrompts: [],
      marketingSolution: next as Prisma.InputJsonValue,
      researchReport: next.researchReport ? next.researchReport as Prisma.InputJsonValue : undefined,
      publishingFreq: persistedPublishingFreq ? persistedPublishingFreq as Prisma.InputJsonValue : undefined,
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
    ...extraPayload,
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
  const result = objectValue(job.result)
  const reportVersions = objectValue(job.report_versions)
  const advancedReport = objectValue(reportVersions.advanced)
  const initialReport = objectValue(reportVersions.initial)
  const selectedReport = Object.keys(advancedReport).length ? advancedReport : initialReport
  const selectedReportResult = objectValue(selectedReport.result)
  const sourceCoverage = objectValue(job.source_coverage)
  const coverageScore = typeof job.coverage_score === 'number'
    ? job.coverage_score
    : typeof result.coverage_score === 'number'
      ? result.coverage_score
      : null
  const coverageItems = Object.entries(sourceCoverage)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
  const reportMarkdown = text(job.latest_report_markdown) || text(job.latest_report_content) || text(selectedReport.report_content)
  if (!reportMarkdown) {
    throw new BrandPlanError('growth_research_report_missing', 502)
  }
  const pdfReportPath = text(job.latest_report_pdf_path) || text(selectedReport.pdf_report_path) || text(selectedReportResult.pdf_report_path)
  const pdfDownloadPath = text(job.latest_report_pdf_download_path) || text(selectedReport.pdf_download_path) || text(selectedReportResult.pdf_download_path)
  const reportPaths = [
    text(job.latest_report_path),
    text(selectedReport.report_path),
    text(job.advanced_report_path),
    text(job.initial_report_path),
    text(result.advanced_report_path),
    text(result.report_path),
  ].filter(Boolean)
  const reportTier = text(job.latest_report_tier) || text(selectedReport.tier) || (reportPaths[0]?.includes('deep') ? 'advanced' : 'initial')
  const reportSummary = extractGrowthReportSummary(reportMarkdown, brand.name)
  const growthIssues = uniqueStrings([
    ...extractGrowthReportBullets(reportMarkdown, ['数据缺口', '下一步采集计划']),
    coverageScore !== null && coverageScore < 70 ? `公开资料覆盖度约 ${coverageScore}，建议补齐缺失平台资料。` : '',
    text(job.status) === 'needs_review' ? 'Growth 调研结果需要主理人复核后再用于重要决策。' : '',
  ].filter(Boolean))
  const growthPoints = uniqueStrings([
    ...extractGrowthReportBullets(reportMarkdown, ['提升建议', '立即执行', '30 天提升', '60-90 天提升']),
    '根据 Growth 品牌摸底报告补齐 Google Maps、官网、社交媒体和本地搜索的关键资料。',
  ]).slice(0, 10)
  const missingQuestions = uniqueStrings([
    ...extractGrowthReportBullets(reportMarkdown, ['数据缺口', '数据来源与缺口']),
    '请主理人查看 Growth 报告全文，确认是否有平台资料缺失或竞品判断需要修正。',
  ]).slice(0, 10)
  const sourcePayload = {
    jobId: job.job_id,
    status: job.status,
    progress: job.progress,
    brandKey: text(result.brand_key || selectedReportResult.brand_key),
    reportTier,
    reportPath: reportPaths[0] || '',
    reportVersionId: text(selectedReport.report_version_id),
    pdfReportPath,
    pdfDownloadPath,
    result,
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceSystem: 'amc-growth',
    growthJobId: text(job.job_id),
    growthBrandKey: text(result.brand_key || selectedReportResult.brand_key),
    reportTier,
    reportPath: reportPaths[0] || '',
    reportMarkdown,
    pdfReportPath,
    pdfDownloadPath,
    pdfDownloadUrl: growthDownloadUrl(pdfDownloadPath),
    coverageScore,
    sourceCoverage,
    sourcePayload,
    summary: reportSummary || [
      `${brand.name} 的品牌摸底报告已由 AMC-Growth 生成。`,
      coverageScore !== null ? `公开资料覆盖度：${coverageScore}。` : '',
      reportPaths.length ? `报告路径：${reportPaths[0]}` : '',
    ].filter(Boolean).join(' '),
    dataSources: uniqueStrings([
      'AMC-Growth 品牌摸底调研',
      reportTier ? `Growth ${reportTier} report` : '',
      reportPaths[0] ? `Growth report: ${reportPaths[0]}` : '',
      ...coverageItems.map((item) => `Growth ${item}`),
    ]),
    brandImage: text(result.report_name || selectedReportResult.report_name) || `${brand.name} 的线上品牌摸底报告`,
    marketingStatus: text(result.assessment_status)
      ? `Growth 调研状态：${text(result.assessment_status)}。`
      : `Growth 调研状态：${text(job.status) || 'completed'}。`,
    marketAnalysis: [
      text(result.market || selectedReportResult.market || job.market),
      text(result.category || selectedReportResult.category),
      coverageScore !== null ? `覆盖度 ${coverageScore}` : '',
    ].filter(Boolean).join(' / ') || '详见 AMC-Growth 品牌摸底报告正文。',
    competitors: extractGrowthReportTableNames(reportMarkdown, '竞品候选'),
    issues: growthIssues.length ? growthIssues : ['详见 AMC-Growth 品牌摸底报告的数据缺口与下一步采集计划。'],
    growthPoints,
    missingQuestions,
  }
}

function extractGrowthReportSummary(markdown: string, brandName: string) {
  if (!markdown) return ''
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const firstBodyLine = lines.find((line) =>
    !line.startsWith('---') &&
    !line.startsWith('#') &&
    !line.startsWith('|') &&
    !line.startsWith('- ') &&
    !line.includes(': ') &&
    line.length > 12
  )
  return firstBodyLine || `${brandName} 的 AMC-Growth 品牌摸底报告已生成。`
}

function growthDownloadUrl(pathValue: string) {
  if (!pathValue) return ''
  if (/^https?:\/\//i.test(pathValue)) return pathValue
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  const baseUrl = (process.env.AMC_GROWTH_API_URL || (isProd ? 'https://amc-growth.onrender.com' : 'http://localhost:4188')).replace(/\/$/, '')
  return `${baseUrl}${pathValue.startsWith('/') ? pathValue : `/${pathValue}`}`
}

function extractGrowthReportBullets(markdown: string, sectionKeywords: string[]) {
  if (!markdown) return []
  const lines = markdown.split('\n')
  const results: string[] = []
  let active = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/^#{2,4}\s+/.test(line)) {
      active = sectionKeywords.some((keyword) => line.includes(keyword))
      continue
    }
    if (!active) continue
    const ordered = line.match(/^\d+\.\s+(.+)/)
    const unordered = line.match(/^[-*]\s+(.+)/)
    const value = text(ordered?.[1] || unordered?.[1])
    if (value && !value.includes('暂无数据')) results.push(value)
  }
  return uniqueStrings(results)
}

function extractGrowthReportTableNames(markdown: string, sectionKeyword: string) {
  if (!markdown) return []
  const lines = markdown.split('\n')
  const results: string[] = []
  let active = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/^#{2,4}\s+/.test(line)) {
      active = line.includes(sectionKeyword)
      continue
    }
    if (!active || !line.startsWith('|') || line.includes('---')) continue
    const cells = line.split('|').map((item) => item.trim()).filter(Boolean)
    const name = cells[0]
    if (name && !['竞品候选', '暂无数据'].includes(name)) results.push(name)
  }
  return uniqueStrings(results).slice(0, 8)
}

function isGrowthResearchReport(report: BrandPlanWorkspaceData['researchReport']): report is BrandPlanResearchReport {
  return Boolean(report && (
    report.sourceSystem === 'amc-growth' ||
    report.dataSources?.includes('AMC-Growth 品牌摸底调研') ||
    report.dataSources?.includes('AMC-Growth 数据调研')
  ))
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
      source: isGrowthResearchReport(report) ? 'amc-growth' : 'amc-kanban',
      sourceVersion: report.generatedAt,
      sourcePayload: report.sourcePayload ? report.sourcePayload as Prisma.InputJsonValue : undefined,
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
      period: marketingPlanPeriod(annualPlan),
      input: { target, editedAt: new Date().toISOString() },
      output: annualPlan,
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'MANUAL_EDIT',
    })
    return { ...current, annualPlan }
  }

  if (target === 'publishing_freq') {
    const publishingFreq = normalizePublishingFreq(value ?? body?.publishingFreqOverride)
    if (!publishingFreq) throw new BrandPlanError('invalid_publishing_freq', 400)
    const annualPlan = applyPublishingFrequencyOverride(current.annualPlan, publishingFreq)
    await saveMarketingSolutionVersion({
      brandId,
      kind: 'ANNUAL',
      period: annualPlan ? marketingPlanPeriod(annualPlan) : 'publishing_frequency',
      input: { target, editedAt: new Date().toISOString() },
      output: { publishingFreq, annualPlan },
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
      period: quarterPlan.periodLabel || quarterPlan.quarter,
      input: { target, editedAt: new Date().toISOString() },
      output: quarterPlan,
      researchSnapshotId: current.researchReport?.snapshotId,
      generationMode: 'MANUAL_EDIT',
    })
    return { ...current, quarterlyPlans }
  }

  if (target === 'calendar_month') {
    const month = clampSchedulableCalendarMonth(normalizeMonth(body?.month))
    const existingItems = current.publishingCalendar?.months?.[month] || []
    const existingById = new Map<string, BrandPlanCalendarItem>()
    existingItems.forEach((item) => {
      const id = text(item.id)
      if (id) existingById.set(id, item)
    })
    const incomingItems = arrayValue(value) as NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]
    const mergedItems = incomingItems.map((item) => {
      const existing = existingById.get(text(item.id))
      return {
        ...(existing || {}),
        ...item,
        status: text(item.status) || existing?.status || '已生成',
      }
    })
    const items = clampCalendarItemsToMinimumDate(
      mergedItems
    )
    const publishingCalendar = {
      generatedAt: new Date().toISOString(),
      generationMode: 'AMC_CONTENT_ASSISTED' as const,
      months: {
        ...(current.publishingCalendar?.months || {}),
        [month]: items,
      },
    }
    await syncCalendarMaterialRequirements(brandId, month, items)
    await syncConfirmedCalendarItemsToDrafts(brandId, month, items)
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
  const marketContext = await buildMarketingPlanMarketContext(brand, fallback.quarterlyPlans || [])
  const input = {
    ...buildMarketingPlanInput(brand, current, interview),
    subscriptionStrategy: fallback.subscriptionStrategy,
    marketCalendar: marketContext.marketCalendar,
    storeActivities: marketContext.storeActivities,
    planningWindow: {
      rule: '只规划有效周期：从用户订阅计划后的第一个完整自然月开始，连续规划未来四个三个月周期，不要补全年自然季度。',
      quarters: (fallback.quarterlyPlans || []).map((item) => ({
        quarter: item.quarter,
        year: item.year,
        startMonth: item.startMonth,
        endMonth: item.endMonth,
        periodLabel: item.periodLabel,
        months: item.monthlyFocus.map((month) => month.month),
        focus: item.focus,
      })),
    },
  }
  const strategyLlm = await callMarketingPlanLLM('annual_strategy', input)
  await writeMarketingPlanBusinessLog({
    brand,
    scope: 'annual',
    input,
    llm: strategyLlm,
    fallbackUsed: false,
  })
  if (!strategyLlm.value) {
    console.warn('[brand-plan] marketing_plan LLM returned no valid JSON; not saving annual plan.', {
      provider: strategyLlm.provider,
      modelName: strategyLlm.modelName,
      error: strategyLlm.error || 'llm_returned_invalid_json',
    })
    throw new BrandPlanError('marketing_plan_llm_failed', 502)
  }
  const strategyPlan = normalizeAnnualMarketingStrategy(strategyLlm.value, fallback, strategyLlm)
  const quarterlyPlans: NonNullable<NonNullable<BrandPlanWorkspaceData['annualPlan']>['quarterlyPlans']> = []
  for (const fallbackQuarter of fallback.quarterlyPlans || []) {
    const quarterInput = {
      ...input,
      annualStrategy: {
        goal: strategyPlan.goal,
        theme: strategyPlan.theme,
        strategyPrinciples: strategyPlan.strategyPrinciples,
        platformStrategy: strategyPlan.platformStrategy,
        contentPillars: strategyPlan.contentPillars,
        metrics: strategyPlan.metrics,
        researchFocus: strategyPlan.researchFocus,
      },
      currentQuarter: {
        quarter: fallbackQuarter.quarter,
        year: fallbackQuarter.year,
        startMonth: fallbackQuarter.startMonth,
        endMonth: fallbackQuarter.endMonth,
        periodLabel: fallbackQuarter.periodLabel,
        months: fallbackQuarter.monthlyFocus.map((month) => month.month),
      },
      previousQuarterPlans: quarterlyPlans,
    }
    const quarterLlm = await callMarketingPlanLLM('quarter', quarterInput)
    await writeMarketingPlanBusinessLog({
      brand,
      scope: 'quarter',
      input: quarterInput,
      llm: quarterLlm,
      fallbackUsed: false,
    })
    if (!quarterLlm.value) {
      console.warn('[brand-plan] quarter marketing_plan LLM returned no valid JSON; not saving partial plan.', {
        quarter: fallbackQuarter.quarter,
        provider: quarterLlm.provider,
        modelName: quarterLlm.modelName,
        error: quarterLlm.error || 'llm_returned_invalid_json',
      })
      throw new BrandPlanError('marketing_plan_llm_failed', 502)
    }
    const [quarterPlan] = normalizeAnnualQuarterlyPlans([quarterLlm.value], [fallbackQuarter])
    if (!quarterPlan) throw new BrandPlanError('marketing_plan_llm_failed', 502)
    quarterlyPlans.push(quarterPlan)
  }
  return normalizeAnnualMarketingStrategy({
    ...strategyLlm.value,
    quarterlyPlans,
  }, fallback, strategyLlm)
}

async function buildAnnualMarketingStrategyOnly(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null
): Promise<NonNullable<BrandPlanWorkspaceData['annualPlan']>> {
  const fallback = await buildRuleAnnualMarketingSolution(brand, current, interview)
  const marketContext = await buildMarketingPlanMarketContext(brand, fallback.quarterlyPlans || [])
  const input = {
    ...buildMarketingPlanInput(brand, current, interview),
    subscriptionStrategy: fallback.subscriptionStrategy,
    marketCalendar: marketContext.marketCalendar,
    storeActivities: marketContext.storeActivities,
    planningWindow: {
      rule: '只规划有效周期：从用户订阅计划后的第一个完整自然月开始，连续规划未来四个三个月周期，不要补全年自然季度。',
      quarters: (fallback.quarterlyPlans || []).map((item) => ({
        quarter: item.quarter,
        year: item.year,
        startMonth: item.startMonth,
        endMonth: item.endMonth,
        periodLabel: item.periodLabel,
        months: item.monthlyFocus.map((month) => month.month),
        focus: item.focus,
      })),
    },
  }
  const strategyLlm = await callMarketingPlanLLM('annual_strategy', input)
  await writeMarketingPlanBusinessLog({
    brand,
    scope: 'annual',
    input,
    llm: strategyLlm,
    fallbackUsed: false,
  })
  if (!strategyLlm.value) throw new BrandPlanError('marketing_plan_llm_failed', 502)
  const plan = normalizeAnnualMarketingStrategy(strategyLlm.value, fallback, strategyLlm)
  return {
    ...plan,
    quarterlyFocus: annualQuarterPlaceholders(fallback),
    quarterlyPlans: [],
  }
}

async function buildNextQuarterMarketingPlan(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null
): Promise<NonNullable<BrandPlanWorkspaceData['annualPlan']>> {
  if (!current.annualPlan) throw new BrandPlanError('annual_plan_required', 409)
  const fallback = await buildRuleAnnualMarketingSolution(brand, current, interview)
  const existingQuarters = current.annualPlan.quarterlyPlans || []
  const targetQuarter = (fallback.quarterlyPlans || []).find((candidate) =>
    !existingQuarters.some((existing) => existing.startMonth === candidate.startMonth)
  )
  if (!targetQuarter) return current.annualPlan
  const marketContext = await buildMarketingPlanMarketContext(brand, fallback.quarterlyPlans || [])
  const baseInput = {
    ...buildMarketingPlanInput(brand, current, interview),
    subscriptionStrategy: current.annualPlan.subscriptionStrategy || fallback.subscriptionStrategy,
    marketCalendar: marketContext.marketCalendar,
    storeActivities: marketContext.storeActivities,
    planningWindow: {
      rule: '只规划有效周期：从用户订阅计划后的第一个完整自然月开始，连续规划未来四个三个月周期，不要补全年自然季度。',
      quarters: (fallback.quarterlyPlans || []).map((item) => ({
        quarter: item.quarter,
        year: item.year,
        startMonth: item.startMonth,
        endMonth: item.endMonth,
        periodLabel: item.periodLabel,
        months: item.monthlyFocus.map((month) => month.month),
        focus: item.focus,
      })),
    },
  }
  const quarterInput = {
    ...baseInput,
    annualStrategy: {
      goal: current.annualPlan.goal,
      theme: current.annualPlan.theme,
      strategyPrinciples: current.annualPlan.strategyPrinciples,
      platformStrategy: current.annualPlan.platformStrategy,
      contentPillars: current.annualPlan.contentPillars,
      metrics: current.annualPlan.metrics,
      researchFocus: current.annualPlan.researchFocus,
    },
    currentQuarter: {
      quarter: targetQuarter.quarter,
      year: targetQuarter.year,
      startMonth: targetQuarter.startMonth,
      endMonth: targetQuarter.endMonth,
      periodLabel: targetQuarter.periodLabel,
      months: targetQuarter.monthlyFocus.map((month) => month.month),
    },
    previousQuarterPlans: existingQuarters,
  }
  const quarterLlm = await callMarketingPlanLLM('quarter', quarterInput)
  await writeMarketingPlanBusinessLog({
    brand,
    scope: 'quarter',
    input: quarterInput,
    llm: quarterLlm,
    fallbackUsed: false,
  })
  if (!quarterLlm.value) throw new BrandPlanError('marketing_plan_llm_failed', 502)
  const [quarterPlan] = normalizeAnnualQuarterlyPlans([quarterLlm.value], [targetQuarter])
  if (!quarterPlan) throw new BrandPlanError('marketing_plan_llm_failed', 502)
  const fallbackOrder = new Map((fallback.quarterlyPlans || []).map((item, index) => [item.startMonth, index]))
  const quarterlyPlans = [
    ...existingQuarters.filter((item) => item.startMonth !== quarterPlan.startMonth),
    quarterPlan,
  ].sort((a, b) => (fallbackOrder.get(a.startMonth || '') ?? 99) - (fallbackOrder.get(b.startMonth || '') ?? 99))
  return {
    ...current.annualPlan,
    generatedAt: new Date().toISOString(),
    quarterlyPlans,
    quarterlyFocus: (fallback.quarterlyPlans || []).map((fallbackQuarter) => {
      const generated = quarterlyPlans.find((item) => item.startMonth === fallbackQuarter.startMonth)
      return generated
        ? {
            quarter: generated.quarter,
            year: generated.year,
            startMonth: generated.startMonth,
            endMonth: generated.endMonth,
            periodLabel: generated.periodLabel,
            focus: generated.focus,
            campaigns: generated.campaigns,
          }
        : {
            quarter: fallbackQuarter.quarter,
            year: fallbackQuarter.year,
            startMonth: fallbackQuarter.startMonth,
            endMonth: fallbackQuarter.endMonth,
            periodLabel: fallbackQuarter.periodLabel,
            focus: '待生成季度计划',
            campaigns: [],
          }
    }),
    generationMode: 'LLM',
    llmProvider: quarterLlm.provider || current.annualPlan.llmProvider,
    llmModel: quarterLlm.modelName || current.annualPlan.llmModel,
    llmError: undefined,
  }
}

function annualQuarterPlaceholders(fallback: NonNullable<BrandPlanWorkspaceData['annualPlan']>) {
  return (fallback.quarterlyPlans || []).map((item) => ({
    quarter: item.quarter,
    year: item.year,
    startMonth: item.startMonth,
    endMonth: item.endMonth,
    periodLabel: item.periodLabel,
    focus: '待生成季度计划',
    campaigns: [],
  }))
}

async function buildRuleAnnualMarketingSolution(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  interview: BrandPlanMerchantInterview | null
): Promise<NonNullable<BrandPlanWorkspaceData['annualPlan']>> {
  const planningQuarters = planningQuarterSequence(subscriptionPlanningStartDate(brand))
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
    const [startYear, startMonthNumber] = planningQuarter.startMonth.split('-').map(Number)
    const monthlyFocus = [0, 1, 2].map((offset) => {
      const date = new Date(startYear, startMonthNumber - 1 + offset, 1)
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
      year: planningQuarter.year,
      startMonth: planningQuarter.startMonth,
      endMonth: planningQuarter.endMonth,
      periodLabel: planningQuarter.periodLabel,
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
    strategyPrinciples: [
      '让顾客找得到、看得懂、愿意来。',
      '先用真实资料和门店内容建立信任，再推动收藏、咨询、路线、预约或下单。',
      '每个平台承担不同任务，不把同一篇内容简单复制到所有平台。',
    ],
    platformStrategy: defaultPlatformStrategy(platformCoverage),
    contentPillars: ['招牌产品', '真实门店/制作过程', '顾客评价/信任证明', '附近到店理由', '菜单/价格/服务解释'],
    quarterlyFocus: quarterlyPlans.map((item) => ({
      quarter: item.quarter,
      year: item.year,
      startMonth: item.startMonth,
      endMonth: item.endMonth,
      periodLabel: item.periodLabel,
      focus: item.focus,
      campaigns: item.campaigns,
    })),
    quarterlyPlans,
    metrics: ['路线点击', '电话/私信咨询', '预订/下单点击', '内容发布完成率', '顾客评价与收藏'],
    subscriptionStrategy,
    ...(researchFocus ? { researchFocus } : {}),
    ...(current.researchReport?.snapshotId ? { researchSnapshotId: current.researchReport.snapshotId } : {}),
    generationMode: 'RULE_FALLBACK',
  }
}

async function buildPublishingMonth(
  brand: BrandPlanBrand,
  month: string,
  interview: BrandPlanMerchantInterview | null,
  current: BrandPlanWorkspaceData,
  publishingFreqOverride?: unknown
): Promise<NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]> {
  const products = primaryProducts(brand, { available: false })
  const interviewFocus = interviewMaterialText(interview)
  const subscriptionStrategy = await buildSubscriptionStrategy(brand)
  const overridePublishingFreq = normalizePublishingFreq(publishingFreqOverride)
  const overrideMonthlyQuota = sumMonthlyPosts(overridePublishingFreq)
  const schedule = buildMonthlyPublishingSchedule(
    month,
    overridePublishingFreq || subscriptionStrategy.publishingFreq || brand.knowledge?.publishingFreq,
    subscriptionStrategy.platformCoverage,
    overrideMonthlyQuota || subscriptionStrategy.monthlyContentQuota
  )
  const promotionPoints = buildCalendarPromotionPoints({
    brand,
    current,
    month,
    products,
    interviewFocus,
    schedule,
  })
  const usedCreativeIds = new Set(recentCalendarCreativeIds(current, month))
  const creativePool = await requestCalendarCreativePool(brand, current, promotionPoints)

  const items = await mapWithConcurrency(schedule, 1, async (slot, index) => {
    const promotionPoint = assignPromotionPointToSlot(promotionPoints, slot, index)
    const product = products[index % Math.max(1, products.length)] || promotionPoint?.sellingPoint || '招牌产品'
    const itemId = `${month}-${String(index + 1).padStart(2, '0')}-${slot.platform.slug}`
    let candidate = selectCalendarCreativeCandidate(creativePool.creativeCandidates, promotionPoint.id, slot.platform.slug, index, usedCreativeIds)
    let itemCreativePool = creativePool
    if (!candidate) {
      itemCreativePool = await requestCalendarCreativePool(brand, current, [promotionPoint], itemId)
      candidate = selectCalendarCreativeCandidate(itemCreativePool.creativeCandidates, promotionPoint.id, slot.platform.slug, index, usedCreativeIds)
    }
    const candidateCreativeId = calendarInspirationCreativeId(candidate)
    if (candidateCreativeId) usedCreativeIds.add(candidateCreativeId)
    const creativeMatchStatus = (candidate ? 'matched' : 'no_candidate_after_retry') as BrandPlanCalendarItem['creativeMatchStatus']
    const sampleLinks = calendarSampleLinks(candidate)
    const inspirationSource = calendarInspirationSource(candidate)
    return withCalendarScriptFields({
      id: itemId,
      date: slot.date,
      title: calendarItemTitle({
        brand,
        product,
        promotionPoint,
        platformSlug: slot.platform.slug,
        candidate,
        index,
      }),
      platform: slot.platform.label,
      platformSlug: slot.platform.slug,
      contentType: calendarContentType(candidate, index),
      product,
      planning: calendarPlanningText({
        brand,
        product,
        promotionPoint,
        platformSlug: slot.platform.slug,
        candidate,
        interviewFocus,
        index,
      }),
      sampleHit: '',
      status: '已生成',
      selectedCreativeCandidateId: text(candidate?.creativeCandidateId),
      creativeMechanism: calendarCreativeMechanism({ brand, product, promotionPoint, platformSlug: slot.platform.slug, candidate, index }),
      matchedTags: stringList(candidate?.matchedTags),
      matchedInspirations: stringList(candidate?.matchedInspirations),
      inspirationCreativeId: candidateCreativeId,
      inspirationSourceTitle: inspirationSource.title,
      inspirationSourceSummary: inspirationSource.summary,
      sampleVideoUrl: sampleLinks.videoUrl,
      sampleOriginalUrl: sampleLinks.originalUrl,
      sampleThumbnailUrl: sampleLinks.thumbnailUrl,
      sampleSourcePlatform: sampleLinks.platform,
      materialRequirements: calendarMaterialRequirements(product, candidate),
      scriptSource: (hasCalendarSourceShots(candidate) ? 'inspiration' : 'generated_from_idea') as BrandPlanCalendarItem['scriptSource'],
      creativeMatchStatus,
      contentLibraryGap: candidate
        ? calendarContentGap(itemCreativePool.contentLibraryGaps, promotionPoint.id, candidate)
        : calendarIndependentCreativeGap(itemCreativePool.missingPromotionPoints, promotionPoint.id),
    })
  })
  requireValidCalendarInspirationIdentity(items)
  return items
}

async function buildPublishingCalendarItemByIndex(
  brand: BrandPlanBrand,
  month: string,
  interview: BrandPlanMerchantInterview | null,
  current: BrandPlanWorkspaceData,
  publishingFreqOverride: PublishingFreq | null,
  itemIndex: number,
  excludedCreativeIds: string[] = []
): Promise<BrandPlanCalendarItem> {
  const products = primaryProducts(brand, { available: false })
  const interviewFocus = interviewMaterialText(interview)
  const subscriptionStrategy = await buildSubscriptionStrategy(brand)
  const overrideMonthlyQuota = sumMonthlyPosts(publishingFreqOverride)
  const schedule = buildMonthlyPublishingSchedule(
    month,
    publishingFreqOverride || subscriptionStrategy.publishingFreq || brand.knowledge?.publishingFreq,
    subscriptionStrategy.platformCoverage,
    overrideMonthlyQuota || subscriptionStrategy.monthlyContentQuota
  )
  const slot = schedule[itemIndex]
  if (!slot) throw new BrandPlanError('calendar_item_not_found', 404)
  const promotionPoints = buildCalendarPromotionPoints({
    brand,
    current,
    month,
    products,
    interviewFocus,
    schedule,
  })
  const promotionPoint = assignPromotionPointToSlot(promotionPoints, slot, itemIndex)
  const product = products[itemIndex % Math.max(1, products.length)] || promotionPoint?.sellingPoint || '招牌产品'
  const itemId = `${month}-${String(itemIndex + 1).padStart(2, '0')}-${slot.platform.slug}`
  const usedCreativeIds = new Set([
    ...recentCalendarCreativeIds(current, month),
    ...excludedCreativeIds,
  ])
  const match = await resolveCalendarCreativeCandidateWithRetry({
    requestPool: (refreshPublicationId) => requestCalendarCreativePool(brand, current, [promotionPoint], refreshPublicationId),
    selectCandidate: (pool) => selectCalendarCreativeCandidate(pool.creativeCandidates, promotionPoint.id, slot.platform.slug, itemIndex, usedCreativeIds),
    initialRefreshPublicationId: itemId,
    retryRefreshPublicationId: `${itemId}:retry`,
  })
  const pool = match.pool
  const candidate = match.candidate
  const sampleLinks = calendarSampleLinks(candidate)
  const inspirationSource = calendarInspirationSource(candidate)
  const candidateCreativeId = calendarInspirationCreativeId(candidate)
  const draft: BrandPlanCalendarItem = withCalendarScriptFields({
    id: itemId,
    date: slot.date,
    title: calendarItemTitle({
      brand,
      product,
      promotionPoint,
      platformSlug: slot.platform.slug,
      candidate,
      index: itemIndex,
    }),
    platform: slot.platform.label,
    platformSlug: slot.platform.slug,
    contentType: calendarContentType(candidate, itemIndex),
    product,
    planning: calendarPlanningText({
      brand,
      product,
      promotionPoint,
      platformSlug: slot.platform.slug,
      candidate,
      interviewFocus,
      index: itemIndex,
    }),
    sampleHit: '',
    status: '待确认',
    selectedCreativeCandidateId: text(candidate?.creativeCandidateId),
    creativeMechanism: calendarCreativeMechanism({ brand, product, promotionPoint, platformSlug: slot.platform.slug, candidate, index: itemIndex }),
    matchedTags: stringList(candidate?.matchedTags),
    matchedInspirations: stringList(candidate?.matchedInspirations),
    inspirationCreativeId: candidateCreativeId,
    inspirationSourceTitle: inspirationSource.title,
    inspirationSourceSummary: inspirationSource.summary,
    sampleVideoUrl: sampleLinks.videoUrl,
    sampleOriginalUrl: sampleLinks.originalUrl,
    sampleThumbnailUrl: sampleLinks.thumbnailUrl,
    sampleSourcePlatform: sampleLinks.platform,
    materialRequirements: calendarMaterialRequirements(product, candidate),
    scriptSource: (hasCalendarSourceShots(candidate) ? 'inspiration' : 'generated_from_idea') as BrandPlanCalendarItem['scriptSource'],
    creativeMatchStatus: match.status,
    contentLibraryGap: candidate
      ? calendarContentGap(pool.contentLibraryGaps, promotionPoint.id, candidate)
      : calendarIndependentCreativeGap(pool.missingPromotionPoints, promotionPoint.id),
  })
  requireValidCalendarInspirationIdentity([draft])
  return draft
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
  const match = await resolveCalendarCreativeCandidateWithRetry({
    requestPool: (refreshPublicationId) => requestCalendarCreativePool(brand, current, [point], refreshPublicationId),
    selectCandidate: (pool) => selectCalendarCreativeCandidate(pool.creativeCandidates, point.id, platform, 0),
    initialRefreshPublicationId: item.id,
    retryRefreshPublicationId: `${item.id}:retry`,
  })
  const pool = match.pool
  const candidate = match.candidate
  const sampleLinks = calendarSampleLinks(candidate)
  const inspirationSource = calendarInspirationSource(candidate)
  const replacement: BrandPlanCalendarItem = withCalendarScriptFields({
    ...item,
    date: clampCalendarDateToMinimum(item.date),
    title: calendarItemTitle({
      brand,
      product: item.product,
      promotionPoint: point,
      platformSlug: platform,
      candidate,
      index: 0,
    }),
    contentType: calendarContentType(candidate, 0),
    planning: calendarPlanningText({
      brand,
      product: item.product,
      promotionPoint: point,
      platformSlug: platform,
      candidate,
      interviewFocus: '',
      index: 0,
    }),
    sampleHit: '',
    selectedCreativeCandidateId: text(candidate?.creativeCandidateId),
    creativeMechanism: calendarCreativeMechanism({ brand, product: item.product, promotionPoint: point, platformSlug: platform, candidate, index: 0 }),
    matchedTags: stringList(candidate?.matchedTags),
    matchedInspirations: stringList(candidate?.matchedInspirations),
    inspirationCreativeId: calendarInspirationCreativeId(candidate),
    inspirationSourceTitle: inspirationSource.title,
    inspirationSourceSummary: inspirationSource.summary,
    sampleVideoUrl: sampleLinks.videoUrl,
    sampleOriginalUrl: sampleLinks.originalUrl,
    sampleThumbnailUrl: sampleLinks.thumbnailUrl,
    sampleSourcePlatform: sampleLinks.platform,
    materialRequirements: calendarMaterialRequirements(item.product, candidate),
    scriptSource: (hasCalendarSourceShots(candidate) ? 'inspiration' : 'generated_from_idea') as BrandPlanCalendarItem['scriptSource'],
    creativeMatchStatus: match.status,
    contentLibraryGap: candidate
      ? calendarContentGap(pool.contentLibraryGaps, point.id, candidate)
      : calendarIndependentCreativeGap(pool.missingPromotionPoints, point.id),
  })
  requireValidCalendarInspirationIdentity([replacement])
  return replacement
}

function assignPromotionPointToSlot(
  promotionPoints: CalendarPromotionPoint[],
  slot: { platform: { slug: string } },
  index: number
) {
  const matching = promotionPoints.filter((point) =>
    !point.platforms.length || point.platforms.map(normalizePlatformSlug).includes(normalizePlatformSlug(slot.platform.slug))
  )
  const pool = matching.length ? matching : promotionPoints
  if (!pool.length) {
    return {
      id: `fallback_${index}`,
      goal: '提升本地顾客认知和行动',
      sellingPoint: '招牌产品或核心服务',
      customerAction: '收藏、咨询、点击路线、预订或下单',
      expectedPublishCount: 1,
      platforms: [slot.platform.slug],
      targetPublishWindow: { start: '', end: '' },
    }
  }
  const weighted = pool.flatMap((point) => Array.from({ length: Math.max(1, point.expectedPublishCount) }, () => point))
  return weighted[index % Math.max(1, weighted.length)]
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
  const quarterPlan = findPlanForMonth(input.current.quarterlyPlans || [], input.month)
    || input.current.quarterlyPlans?.find((plan) => plan.quarter === quarter)
  const annualQuarterPlan = findPlanForMonth(input.current.annualPlan?.quarterlyPlans || [], input.month)
    || input.current.annualPlan?.quarterlyPlans?.find((plan) => plan.quarter === quarter)
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

function findPlanForMonth<T extends { startMonth?: string; endMonth?: string }>(plans: T[], month: string) {
  return plans.find((plan) =>
    plan.startMonth && plan.endMonth && month >= plan.startMonth && month <= plan.endMonth
  )
}

async function requestCalendarCreativePool(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  promotionPoints: CalendarPromotionPoint[],
  refreshPublicationId?: string
) {
  let result: Awaited<ReturnType<typeof matchPromotionStrategyCreativeBatch>>
  try {
    result = await matchPromotionStrategyCreativeBatch({
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
      requirePersistedCreative: true,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('[brand-plan] Content creative matching failed', {
      brandId: brand.id,
      promotionPointIds: promotionPoints.map((point) => point.id),
      reason,
    })
    throw new BrandPlanError('calendar_content_match_failed', 502, { reason })
  }

  const creativeCandidates = (Array.isArray(result.creativeCandidates) ? result.creativeCandidates : [])
    .filter((candidate) => Boolean(calendarInspirationCreativeId(candidate)))
  const missingPromotionPoints = promotionPoints
    .filter((point) => !creativeCandidates.some((candidate) => text(candidate.promotionPointId) === point.id))
    .map((point) => {
      const match = (Array.isArray(result.matches) ? result.matches : [])
        .map((item) => objectValue(item))
        .find((item) => text(item.promotionPointId) === point.id)
      const allGaps = (Array.isArray(result.contentLibraryGaps) ? result.contentLibraryGaps : [])
        .map((gap) => objectValue(gap))
      const explicitPointGaps = allGaps.filter((gap) => text(gap.promotionPointId) === point.id)
      const pointGaps = explicitPointGaps.length
        ? explicitPointGaps
        : allGaps.filter((gap) => !text(gap.promotionPointId))
      const pointGapReasons = uniqueStrings([
        ...stringList(match?.gapReasons),
        ...pointGaps.map((gap) => text(gap.reason)).filter(Boolean),
      ])
      const candidateCount = Number(match?.candidateCount)
      const returnedCount = pointGaps.reduce((sum, gap) => sum + Math.max(0, Number(gap.returnedCount || 0)), 0)
      const rankedCount = pointGaps.reduce((sum, gap) => sum + Math.max(0, Number(gap.rankedCount || 0)), 0)
      const persistedRankedCount = pointGaps.reduce((sum, gap) => sum + Math.max(0, Number(gap.persistedRankedCount || 0)), 0)
      return {
        id: point.id,
        name: point.sellingPoint,
        goal: point.goal,
        platforms: point.platforms,
        expectedPublishCount: point.expectedPublishCount,
        candidateCount: Number.isFinite(candidateCount) ? candidateCount : 0,
        returnedCount,
        rankedCount,
        persistedRankedCount,
        gapReasons: pointGapReasons,
      }
    })
  if (missingPromotionPoints.length) {
    console.warn('[brand-plan] calendar creative pool has item-level gaps', {
      missingPromotionPoints,
      contentMatchRequestId: text(result.contentMatchRequestId),
    })
  }
  return { ...result, creativeCandidates, missingPromotionPoints }
}

function selectCalendarCreativeCandidate(
  candidates: Array<Record<string, unknown>>,
  promotionPointId: string,
  platform: string,
  index: number,
  excludedCreativeIds: Set<string> = new Set()
) {
  const pointCandidates = candidates.filter((candidate) => {
    if (text(candidate.promotionPointId) !== promotionPointId) return false
    const creativeId = calendarInspirationCreativeId(candidate)
    return !creativeId || !excludedCreativeIds.has(creativeId)
  })
  const platformCandidates = pointCandidates.filter((candidate) => {
    const sourcePlatform = text(objectValue(candidate.sourceVideo).platform || objectValue(candidate.sourcePost).platform)
    return !sourcePlatform || normalizePlatformSlug(sourcePlatform) === normalizePlatformSlug(platform)
  })
  const pool = platformCandidates.length ? platformCandidates : pointCandidates
  if (!pool.length) return null
  return pool[index % pool.length]
}

function recentCalendarCreativeIds(current: BrandPlanWorkspaceData, month: string) {
  const ids: string[] = []
  const targetIndex = monthSortIndex(month)
  const months = current.publishingCalendar?.months || {}
  Object.entries(months).forEach(([calendarMonth, items]) => {
    const distance = targetIndex - monthSortIndex(calendarMonth)
    if (distance < 0 || distance > 2) return
    items.forEach((item) => {
      const creativeId = text(item.inspirationCreativeId) || resolveInspirationCreativeId(item)
      if (creativeId) ids.push(creativeId)
    })
  })
  return uniqueStrings(ids)
}

function monthSortIndex(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) return 0
  return year * 12 + monthNumber
}

type CalendarCopyContext = {
  brand: BrandPlanBrand
  product: string
  promotionPoint: CalendarPromotionPoint
  platformSlug: string
  candidate?: Record<string, unknown> | null
  interviewFocus?: string
  index: number
}

function cleanCalendarText(value: string, fallback: string) {
  const cleaned = value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#@][\w\u4e00-\u9fff-]+/g, '')
    .replace(/\b[\w-]+\.(mp4|mov|jpg|jpeg|png|webp)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[|｜]+/g, ' ')
    .replace(/[。.!！?？]+$/g, '')
    .trim()
  return cleaned || fallback
}

function brandDisplayName(brand: BrandPlanBrand) {
  return cleanCalendarText(text(brand.name), '本店')
}

function productDisplayName(product: string) {
  return cleanCalendarText(product, '招牌产品')
}

function productMention(brandName: string, product: string) {
  if (product !== '招牌产品' && brandName.includes(product)) return '这一锅'
  return product
}

function calendarItemTitle(input: Omit<CalendarCopyContext, 'interviewFocus'>) {
  const brandName = brandDisplayName(input.brand)
  const product = productMention(brandName, productDisplayName(input.product))
  const inspirationSource = calendarInspirationSource(input.candidate || null)
  const sourceTitle = cleanCalendarText(inspirationSource.title || inspirationSource.summary, '')
  if (sourceTitle) return sourceTitle.slice(0, 30)
  const isRestaurant = text(input.brand.industry).toLowerCase().includes('restaurant') || text(input.brand.industry).toLowerCase().includes('f&b')
  const titleSets: Record<string, string[]> = {
    tiktok: [
      `${brandName}${product}，先看鱼肉`,
      `想吃重口味，先看${brandName}这锅`,
      `${brandName}上桌前，先拍这3个画面`,
    ],
    instagram: [
      `${brandName}的${product}，适合约朋友来吃`,
      `这组图，把${brandName}拍得更想点`,
      `${brandName}今晚主推：${product}`,
    ],
    facebook: [
      `${brandName}本周想推这锅`,
      `约朋友吃烤鱼，可以看这一份`,
      `${brandName}上新一组到店照`,
    ],
    xiaohongshu: [
      `在新加坡想吃${product}，先收藏这家`,
      `${brandName}点单笔记：${product}怎么拍`,
      `朋友聚餐想吃烤鱼，可以看这锅`,
    ],
    google_business: [
      `${brandName}本周推荐：${product}`,
      `到店前先看这份${product}`,
      `${product}上桌照，给顾客一个到店理由`,
    ],
  }
  const fallback = isRestaurant
    ? `${brandName}的${product}，给顾客一个到店理由`
    : `${brandName}的${product}，给顾客一个选择理由`
  const pool = titleSets[normalizePlatformSlug(input.platformSlug)] || [fallback]
  return cleanCalendarText(pool[input.index % pool.length], fallback).slice(0, 30)
}

function calendarContentType(candidate: Record<string, unknown> | null, index: number) {
  const format = text(candidate?.contentFormat).toLowerCase()
  if (format.includes('video')) return '短视频'
  if (format.includes('carousel') || format.includes('image') || format.includes('post')) return '图文'
  return index % 2 === 0 ? '短视频' : '图文'
}

function calendarHookText(input: CalendarCopyContext) {
  const product = productDisplayName(input.product)
  const platform = normalizePlatformSlug(input.platformSlug)
  if (platform === 'tiktok') return `前三秒先给热气、鱼肉和夹菜动作，不要先拍门头。`
  if (platform === 'instagram') return `首图放整锅和夹起鱼肉的近景，让人一眼知道卖点。`
  if (platform === 'facebook') return `先写适合几个人来吃，再放一张整锅图。`
  if (platform === 'xiaohongshu') return `开头先写适合谁来吃，再讲口味和点单理由。`
  if (platform === 'google_business') return `第一句直接说本周推荐${product}，配清楚门店图。`
  return `开头先给${product}的真实画面，再讲为什么值得来试。`
}

function calendarPlanningText(input: CalendarCopyContext) {
  const product = productDisplayName(input.product)
  const candidate = input.candidate || null
  const angle = cleanCalendarText(text(candidate?.contentAngle) || text(candidate?.recommendationReason), '')
  const customerAction = cleanCalendarText(input.promotionPoint.customerAction, '收藏、咨询、点击路线、预订或下单')
  const shots = calendarReplicationShots(input)
  const voiceover = calendarScriptLines(input, 'voiceover').slice(0, 3)
  const subtitles = calendarScriptLines(input, 'subtitles').slice(0, 3)
  const mechanism = calendarCreativeMechanism(input)
  const inspirationSource = calendarInspirationSource(candidate)
  const hasSourceShots = hasCalendarSourceShots(candidate)
  return [
    inspirationSource.title ? `灵感主题：${inspirationSource.title}` : '',
    inspirationSource.summary ? `灵感核心：${inspirationSource.summary}` : '',
    `内容创意：${mechanism}`,
    `开场：${calendarHookText(input)}`,
    shots.length ? `${hasSourceShots ? '分镜脚本' : '拍摄建议'}：\n${shots.map((shot, index) => `${index + 1}. ${shot}`).join('\n')}` : '',
    voiceover.length ? `口播方向：${voiceover.join(' / ')}` : '',
    subtitles.length ? `字幕方向：${subtitles.join(' / ')}` : '',
    angle ? `拍摄重点：${adaptCalendarScriptText(angle, input)}。` : '',
    input.interviewFocus ? `可带一句主理人原话：${cleanCalendarText(input.interviewFocus, '')}。` : '',
    `收尾：引导顾客${customerAction}。`,
  ].filter(Boolean).join('\n')
}

function calendarCreativeMechanism(input: CalendarCopyContext) {
  const product = productDisplayName(input.product)
  const brandName = brandDisplayName(input.brand)
  const candidate = input.candidate || null
  const textBlob = [
    text(candidate?.contentAngle),
    text(candidate?.recommendationReason),
    stringList(candidate?.matchedTags).join(' '),
    stringList(candidate?.matchedInspirations).join(' '),
    text(candidate?.contentFormat),
  ].join(' ').toLowerCase()
  const platform = normalizePlatformSlug(input.platformSlug)
  const variants = platform === 'xiaohongshu'
    ? [
        `写成本地吃饭收藏笔记：先点明适合谁来，再讲${product}口味、分量、地址和避坑提醒。`,
        `做一条朋友聚餐决策笔记：从人数、口味、预算和拍照画面判断${brandName}适不适合。`,
        `做口味选择题：把鲜椒、青花椒或配菜差异拍清楚，让第一次来的顾客会点。`,
      ]
    : platform === 'google_business'
      ? [
          `做门店更新：用一张清楚的${product}主图，加营业信息、地址和本周推荐理由。`,
          `做到店前信息补齐：拍门头、菜单、${product}和座位环境，让顾客少问一步。`,
          `做路线内容：先拍附近地标和门店入口，再接上桌画面，让顾客知道怎么来。`,
        ]
      : [
          `先拍${product}最有食欲的一秒，再切到上桌、夹起、门店环境和行动入口。`,
          `用“今天想吃重口味吗”开场，接${product}出锅、配菜和朋友分食画面。`,
          `做一个到店小故事：从走进${brandName}、点${product}、等上桌到第一口反应。`,
          `做点单选择题：先抛“第一次来怎么点”，再用 2-3 个镜头讲清${product}和搭配菜。`,
          `让人看到出品过程：从备菜、下锅、上桌到老板推荐，把${product}的锅气和细节拍出来。`,
        ]
  if (/price|\\$|人均|价格|套餐/.test(textBlob) && input.index % 3 === 0) {
    return `用菜单和分量先给判断：拍清${product}适合几个人吃、怎么搭配更稳，价格必须以门店确认为准。`
  }
  return variants[input.index % variants.length]
}

function hasCalendarSourceShots(candidate: Record<string, unknown> | null) {
  const script = objectValue(candidate?.scriptContent)
  return Array.isArray(script.shots) && script.shots.length > 0
}

function calendarReplicationShots(input: CalendarCopyContext) {
  const script = objectValue(input.candidate?.scriptContent)
  const sourceShots = Array.isArray(script.shots) ? script.shots : []
  const adapted = sourceShots
    .map((shot, index) => {
      const item = objectValue(shot)
      const label = cleanCalendarText(text(item.label), `镜头 ${index + 1}`)
      const instruction = adaptCalendarScriptText(text(item.instruction), input)
      return instruction ? `${label}：${instruction}` : ''
    })
    .filter(Boolean)
  if (adapted.length) return adapted
  const product = productDisplayName(input.product)
  const customerAction = cleanCalendarText(input.promotionPoint.customerAction, '收藏、咨询、点击路线、预订或下单')
  const mechanism = calendarCreativeMechanism(input)
  const platform = normalizePlatformSlug(input.platformSlug)
  if (platform === 'google_business') {
    return [
      `0-3s：拍清${product}主体和店内真实环境，第一眼说明这是门店更新。`,
      `4-10s：补门头、地址动线或服务过程，让顾客知道怎么到店和如何咨询。`,
      `11-18s：围绕“${mechanism}”拍一个具体信息点，避免只做氛围镜头。`,
      `结尾：用营业信息、电话、地址或路线引导顾客${customerAction}。`,
    ]
  }
  if (platform === 'xiaohongshu') {
    return [
      `0-3s：先拍${product}最能判断口味和分量的画面，配一句真实种草理由。`,
      `4-10s：按“${mechanism}”拆成 2 个决策点，分别拍菜品细节和用餐场景。`,
      `11-18s：补地址、适合人群或点单建议，帮助收藏后能照着来。`,
      `结尾：引导顾客${customerAction}。`,
    ]
  }
  return [
    `0-3s：先拍${product}最有识别度的一秒，直接承接标题里的钩子。`,
    `4-10s：把“${mechanism}”拍成一个真实过程，不空拍门头或泛环境。`,
    `11-18s：补顾客会关心的分量、口味、服务或到店信息。`,
    `结尾：用清楚的行动入口引导顾客${customerAction}。`,
  ]
}

function calendarScriptLines(input: CalendarCopyContext, key: 'voiceover' | 'subtitles') {
  const candidate = input.candidate || null
  const script = objectValue(candidate?.scriptContent)
  return stringList(script[key])
    .map((line) => adaptCalendarScriptText(line, input))
    .filter(Boolean)
}

function adaptCalendarScriptText(value: string, input: CalendarCopyContext) {
  const brandName = brandDisplayName(input.brand)
  const product = productDisplayName(input.product)
  const sourceVideo = objectValue(input.candidate?.sourceVideo)
  const sourcePost = objectValue(input.candidate?.sourcePost)
  const sourceTitle = cleanCalendarText(text(sourceVideo.title || sourcePost.title), '')
  let cleaned = cleanCalendarText(value, '')
  if (sourceTitle) cleaned = cleaned.replace(new RegExp(escapeCalendarRegExp(sourceTitle), 'gi'), brandName)
  cleaned = cleaned
    .replace(/\b(Bao Specialty Cafe|Bao Specialty|DAILY|the cafe|this cafe|the store)\b/gi, brandName)
    .replace(/\b(breakfast|afternoon tea|bakery|pastry|bao|coffee|snack)\b/gi, product)
    .replace(/原视频|参考视频|参考内容|样板爆品/g, '这条创意')
    .trim()
  return cleaned || `围绕${product}拍真实出品、服务过程和顾客会关心的细节`
}

function escapeCalendarRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function calendarSampleLinks(candidate: Record<string, unknown> | null) {
  const sourceVideo = objectValue(candidate?.sourceVideo)
  const sourcePost = objectValue(candidate?.sourcePost)
  return {
    videoUrl: text(sourceVideo.videoUrl || sourceVideo.mediaUrl || sourceVideo.uploadedVideoUrl),
    originalUrl: text(sourceVideo.sourceUrl || sourcePost.sourceUrl),
    thumbnailUrl: text(sourceVideo.thumbnailUrl || sourcePost.coverUrl),
    platform: text(sourceVideo.platform || sourcePost.platform),
  }
}

function calendarInspirationSource(candidate: Record<string, unknown> | null) {
  const sourceVideo = objectValue(candidate?.sourceVideo)
  const sourcePost = objectValue(candidate?.sourcePost)
  const script = objectValue(candidate?.scriptContent)
  return {
    title: cleanCalendarText(text(sourceVideo.title || sourcePost.title || script.title), ''),
    summary: cleanCalendarText(text(candidate?.contentAngle || script.opening || script.body || candidate?.recommendationReason), ''),
  }
}

function calendarInspirationCreativeId(candidate: Record<string, unknown> | null) {
  const explicitCreativeId = text(candidate?.inspirationCreativeId)
  if (/^cre_[A-Za-z0-9_-]+$/.test(explicitCreativeId)) return explicitCreativeId
  const sampleLinks = calendarSampleLinks(candidate)
  const mediaCreativeId = resolveInspirationCreativeId({
    sampleVideoUrl: sampleLinks.videoUrl,
    sampleThumbnailUrl: sampleLinks.thumbnailUrl,
  })
  if (mediaCreativeId) return mediaCreativeId
  const creativeId = stringList(candidate?.matchedCreatives).find((value) => value.startsWith('cre_'))
  if (creativeId) return creativeId
  return undefined
}

function requireValidCalendarInspirationIdentity(items: BrandPlanCalendarItem[]) {
  const itemIds = new Map<string, number>()
  for (const item of items) itemIds.set(item.id, (itemIds.get(item.id) || 0) + 1)
  const duplicateIds = [...itemIds.entries()].filter(([, count]) => count > 1).map(([id]) => id)
  if (duplicateIds.length) {
    console.warn('[brand-plan] calendar item id validation failed', { duplicateIds })
    throw new BrandPlanError('calendar_inspiration_identity_invalid', 502, { duplicateIds })
  }
  const sourceAnchoredItems = items.filter((item) =>
    Boolean(item.inspirationCreativeId || item.inspirationSourceTitle || item.inspirationSourceSummary || item.sampleVideoUrl || item.sampleOriginalUrl)
  )
  if (!sourceAnchoredItems.length) return
  const issues = sourceAnchoredItems.flatMap((item) => {
    const actualCreativeId = text(item.inspirationCreativeId)
    if (!actualCreativeId) return [{ code: 'missing_creative_id', itemId: item.id }]
    if (!/^cre_[A-Za-z0-9_-]+$/.test(actualCreativeId)) {
      return [{ code: 'invalid_creative_id', itemId: item.id, actualCreativeId }]
    }
    const expectedCreativeId = resolveInspirationCreativeId(item)
    if (expectedCreativeId && expectedCreativeId !== actualCreativeId) {
      return [{ code: 'media_creative_mismatch', itemId: item.id, expectedCreativeId, actualCreativeId }]
    }
    return []
  })
  if (!issues.length) return
  console.warn('[brand-plan] calendar inspiration identity validation failed', {
    itemCount: sourceAnchoredItems.length,
    issues,
  })
  throw new BrandPlanError('calendar_inspiration_identity_invalid', 502)
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

function calendarIndependentCreativeGap(
  missingPromotionPoints: Array<Record<string, unknown>>,
  promotionPointId: string
) {
  const missing = missingPromotionPoints.find((point) => text(point.id) === promotionPointId)
  const reasons = stringList(missing?.gapReasons)
  return [
    'Content 灵感库批量匹配和单条重试都没有匹配到可靠可引用灵感，已按平台规则生成原创 brief。',
    reasons.length ? `原因：${reasons.join('、')}` : '',
    '可在主理人 review 时补充参考灵感或素材。',
  ].filter(Boolean).join('\n')
}

async function rewriteCalendarItemDetailsWithLLM(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData,
  item: BrandPlanCalendarItem
): Promise<BrandPlanCalendarItem> {
  const brandName = brandDisplayName(brand)
  const productCatalog = skuLibraryForLLM(brand.knowledge?.menuItems, 30)
  const approvedPricePhrases = productCatalogPricePhrases(productCatalog)
  const payload = {
    brand: {
      name: brandName,
      industry: brand.industry || 'Restaurant / F&B',
      market: text(brand.knowledge?.market || brand.location) || 'Singapore',
      address: text(brand.address),
      description: cleanCalendarText(text(brand.description || brand.knowledge?.summary), ''),
    },
    strategy: {
      goal: current.annualPlan?.goal || current.researchReport?.summary || '',
      platformStrategy: current.annualPlan?.platformStrategy || [],
      contentPillars: current.annualPlan?.contentPillars || current.quarterlyPlans?.flatMap((plan) => plan.contentDirections || []) || [],
      productCatalog,
      priceUseRule: '商品库中明确提供的价格可以用于创意和点单判断；没有明确来源的具体价格不得编造。需要价格但缺少来源时，把“主理人确认/补充价格”写入 materialRequirements。',
    },
    item: {
      id: item.id,
      date: item.date,
      platform: item.platform,
      platformSlug: item.platformSlug,
      contentType: item.contentType,
      product: item.product,
      title: item.title,
      contentIdea: item.planning,
      materialRequirements: item.materialRequirements || [],
      inspirationCreativeId: item.inspirationCreativeId,
      inspirationSourceTitle: item.inspirationSourceTitle,
      inspirationSourceSummary: item.inspirationSourceSummary,
      matchedTags: item.matchedTags || [],
      matchedInspirations: item.matchedInspirations || [],
      scriptSource: item.scriptSource,
    },
  }
  const prompt = [
    '你是 AMC 的本地商家内容策划总监。用户刚修改了一条内容创意，请基于用户当前内容重写这条创意的详细执行内容。',
    '只返回 JSON 对象，不要 Markdown，不要解释。字段必须包含 title, planning, materialRequirements。',
    'title：保留用户创意方向，写成当前品牌、当前商品和当前平台可用的中文标题。',
    'planning：输出可直接给拍摄/运营执行的详细内容。短视频必须包含“开场：”“分镜脚本：”“收尾：”；只有输入中已有明确口播/字幕，或用户创意明确要求口播/字幕时，才包含“口播方向：”“字幕方向：”。如果需要口播/字幕但无法确定具体文案，只写“口播方向：根据内容做口播”或“字幕方向：根据内容做字幕”，不要硬编固定文案。图文必须包含画面结构、首图/正文重点和行动引导。',
    'materialRequirements：3-6 条素材需求，具体到画面、门店信息或主理人需要补充确认的内容。',
    '不要编造价格、优惠、赠品、暗号、隐藏福利、出示本条、排名、销量或到店人数。没有来源的价格/活动只写入素材需求让主理人确认。',
    '不要写原视频、参考视频、参考内容、样板爆品、复刻目标、文件名或其他品牌名。',
    `输入 JSON：${JSON.stringify(payload)}`,
  ].join('\n\n')
  const result = await callLLM('marketing_plan', prompt, 1200, {
    temperature: 0.35,
    jsonMode: true,
    deadlineMs: 60000,
    attemptTimeoutMs: [55000],
    maxAttempts: 1,
    allowDefaultFallback: false,
    allowAnyFallback: false,
    allowSystemFallback: false,
  })
  const parsed = objectValue(parseJsonValue(result.text))
  const title = cleanReviewedCalendarTitle(text(parsed.title), item.title, brandName, approvedPricePhrases)
  const planning = sanitizeCalendarRewritePlanning(
    cleanReviewedCalendarText(text(parsed.planning), '', approvedPricePhrases),
    item
  )
  const materialRequirements = stringList(parsed.materialRequirements)
    .map((line) => cleanReviewedCalendarText(line, '', approvedPricePhrases))
    .filter(Boolean)
  if (!planning || !materialRequirements.length) {
    console.warn('[brand-plan] calendar item detail rewrite returned incomplete payload', {
      itemId: item.id,
      responseTextCharCount: result.text?.length || 0,
      snippet: result.text?.slice(0, 1000) || '',
    })
    throw new BrandPlanError('calendar_creative_review_llm_failed', 502)
  }
  const rewritten = withCalendarScriptFields({
    ...item,
    title,
    planning,
    materialRequirements,
    scriptSource: 'merchant' as const,
  })
  const qualityIssues = calendarCreativeQualityIssues([rewritten], approvedPricePhrases)
  if (qualityIssues.length) {
    console.warn('[brand-plan] calendar item detail rewrite failed quality gate', {
      itemId: item.id,
      qualityIssues,
    })
    throw new BrandPlanError('calendar_creative_review_llm_failed', 502)
  }
  return rewritten
}

function sanitizeCalendarRewritePlanning(planning: string, sourceItem: BrandPlanCalendarItem) {
  const lines = planning
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const sourceText = [sourceItem.planning, sourceItem.title, sourceItem.contentType].join('\n')
  const wantsVoiceover = calendarTextRequestsScriptPart(sourceText, 'voiceover')
  const wantsSubtitles = calendarTextRequestsScriptPart(sourceText, 'subtitles')
  const kept = lines.filter((line) => {
    if (line.startsWith('口播方向：')) return wantsVoiceover
    if (line.startsWith('字幕方向：')) return wantsSubtitles
    return true
  })
  const hasVoiceover = kept.some((line) => line.startsWith('口播方向：'))
  const hasSubtitles = kept.some((line) => line.startsWith('字幕方向：'))
  if (wantsVoiceover && !hasVoiceover) kept.push('口播方向：根据内容做口播')
  if (wantsSubtitles && !hasSubtitles) kept.push('字幕方向：根据内容做字幕')
  return kept.join('\n')
}

function calendarTextRequestsScriptPart(value: string, part: 'voiceover' | 'subtitles') {
  const body = cleanCalendarText(value, '')
  if (part === 'voiceover') {
    if (/不要口播|无口播|不需要口播|不用口播/.test(body)) return false
    return /口播|旁白|解说词|讲解词/.test(body)
  }
  if (/不要字幕|无字幕|不需要字幕|不用字幕/.test(body)) return false
  return /字幕|屏幕文案|画面文字|贴字|字幕条/.test(body)
}

function withCalendarScriptFields(item: BrandPlanCalendarItem): BrandPlanCalendarItem {
  if (!calendarItemIsVideo(item)) return { ...item, videoScript: undefined }
  const parsed = parseCalendarPlanningVideoScript(item.planning)
  return {
    ...item,
    videoScript: {
      ...parsed,
      source: item.scriptSource || 'generated_from_idea',
    },
  }
}

function calendarItemIsVideo(item: Pick<BrandPlanCalendarItem, 'contentType' | 'platform' | 'platformSlug' | 'planning'>) {
  const blob = [item.contentType, item.platform, item.platformSlug, item.planning].join(' ').toLowerCase()
  return /视频|短视频|video|reel|tiktok/.test(blob)
}

function parseCalendarPlanningVideoScript(planning: string): CalendarVideoScriptData {
  const lines = String(planning || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const script: CalendarVideoScriptData = {
    shots: [],
    voiceover: [],
    subtitles: [],
  }
  let section: 'shots' | null = null
  for (const line of lines) {
    if (line.startsWith('开场：')) {
      script.opening = line.replace(/^开场：/, '').trim()
      section = null
      continue
    }
    if (line.startsWith('分镜脚本：') || line.startsWith('拍摄建议：')) {
      const inline = line.replace(/^(分镜脚本|拍摄建议)：/, '').trim()
      if (inline) script.shots = [...(script.shots || []), ...splitCalendarScriptPieces(inline)]
      section = 'shots'
      continue
    }
    if (line.startsWith('口播方向：')) {
      script.voiceover = line.replace(/^口播方向：/, '').split(/\s*\/\s*/).map((item) => item.trim()).filter(Boolean)
      section = null
      continue
    }
    if (line.startsWith('字幕方向：')) {
      script.subtitles = line.replace(/^字幕方向：/, '').split(/\s*\/\s*/).map((item) => item.trim()).filter(Boolean)
      section = null
      continue
    }
    if (line.startsWith('收尾：')) {
      script.closing = line.replace(/^收尾：/, '').trim()
      section = null
      continue
    }
    if (section === 'shots' && /^\d+[.、]\s*/.test(line)) {
      script.shots = [...(script.shots || []), line.replace(/^\d+[.、]\s*/, '').trim()]
    }
  }
  return script
}

function splitCalendarScriptPieces(value: string) {
  return value
    .split(/\s*(?:\n|；|;|(?=\d+[.、]\s)|(?=\d+-\d+s)|(?=结尾：))\s*/)
    .map((item) => item.replace(/^\d+[.、]\s*/, '').trim())
    .filter(Boolean)
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results: R[] = []
  let nextIndex = 0
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
  return results
}

function cleanReviewedCalendarTitle(value: string, fallback: string, brandName: string, approvedPricePhrases: string[] = []) {
  const cleaned = cleanReviewedCalendarText(value, fallback, approvedPricePhrases)
  const safe = cleaned || fallback || `${brandName}本周内容计划`
  return safe.slice(0, 34)
}

function cleanReviewedCalendarText(value: string, fallback: string, approvedPricePhrases: string[] = []) {
  const cleaned = cleanCalendarText(value, fallback)
    .replace(/\b(Bao Specialty Cafe|Bao Specialty|DAILY|breakfast|Afternoon Tea|bakery)\b/gi, '')
    .replace(/查看原视频链接|查看参考视频|参考内容|样板爆品/g, '')
    .replace(/(?:S\$|\$|RM|¥|￥)\s?\d+(?:\.\d+)?/gi, (match) => (
      isApprovedPricePhrase(match, approvedPricePhrases) ? match : '菜单信息需门店确认'
    ))
    .replace(/人均不到菜单信息需门店确认/g, '两个人这样点更稳')
    .replace(/不到菜单信息需门店确认/g, '点单前先看这份参考')
    .replace(/菜单信息需门店确认\+?/g, '菜单信息需门店确认')
    .replace(/门店确认价\+?/g, '菜单信息需门店确认')
    .replace(/价格数字/g, '菜单信息')
    .replace(/优惠时间/g, '到店信息')
    .replace(/套餐价公开/g, '点单前先看')
    .replace(/隐藏福利|必吃|必点|天花板/g, '')
    .replace(/晚上\d+点后到店有惊喜（活动规则需门店确认）。?/g, '想吃热乎这一锅，先收藏地址。')
    .replace(/有惊喜/g, '有真实反应')
    .replace(/（惊喜）/g, '（自然反应）')
    .replace(/惊喜/g, '自然反应')
    .replace(/雨天[^，。.!！?？]*送[^，。.!！?？]*/g, '雨天到店前先确认活动规则')
    .replace(/送一碗[^，。.!！?？]*/g, '活动规则以门店确认为准')
    .replace(/到店报暗号[^，。.!！?？]*/g, '到店前先确认活动规则')
    .replace(/到店出示[^，。.!！?？]*/g, '到店前先确认活动规则')
    .replace(/赠送[^，。.!！?？]*/g, '活动权益以门店确认为准')
    .replace(/获赠[^，。.!！?？]*/g, '活动权益以门店确认为准')
    .replace(/出示本条/g, '到店前先确认活动规则')
    .replace(/优惠/g, '活动规则')
    .replace(/赠品/g, '活动权益')
    .replace(/暗号/g, '到店信息')
    .replace(/报“?推荐套餐”?免去点单烦恼/g, '按门店推荐组合点单')
    .replace(/([\u4e00-\u9fff])\s+的/g, '$1的')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

function productCatalogPricePhrases(productCatalog: ReturnType<typeof skuLibraryForLLM>) {
  const phrases: string[] = []
  for (const item of productCatalog) {
    const price = text(item.price)
    if (!price) continue
    const currency = text(item.currency) || 'S$'
    phrases.push(price)
    if (/^\$|^S\$|^RM|^¥|^￥/i.test(price)) {
      phrases.push(price)
    } else {
      phrases.push(`${currency}${price}`)
      if (currency.toUpperCase() === 'S$') phrases.push(`$${price}`)
    }
  }
  return uniqueStrings(phrases)
}

function normalizePricePhrase(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^S\$/, '$')
}

function isApprovedPricePhrase(value: string, approvedPricePhrases: string[]) {
  const normalized = normalizePricePhrase(value)
  return approvedPricePhrases.some((price) => normalizePricePhrase(price) === normalized)
}

function stripApprovedPricePhrases(value: string, approvedPricePhrases: string[]) {
  let stripped = value
  for (const price of approvedPricePhrases) {
    const normalizedPrice = normalizePricePhrase(price)
    stripped = stripped.replace(/(?:S\$|\$|RM|¥|￥)\s?\d+(?:\.\d+)?/gi, (match) => (
      normalizePricePhrase(match) === normalizedPrice ? '' : match
    ))
  }
  return stripped
}

function calendarCreativeQualityIssues(items: BrandPlanCalendarItem[], approvedPricePhrases: string[] = []) {
  const issues = new Set<string>()
  const forbidden = [
    { label: '来源说明', pattern: /保留灵感|当前灵感|适配提醒|原视频|参考内容|样板爆品|复刻目标|mp4/i },
    { label: '原始品牌或品类残留', pattern: /Bao Specialty|DAILY|breakfast|Afternoon Tea|bakery|#武冈|破酥包/i },
    { label: '未确认促销', pattern: /优惠|获赠|赠送|出示本条|暗号|隐藏福利|送一碗|雨天.*送|惊喜/i },
    { label: '未确认价格', pattern: /门店确认价|套餐价公开|[$]\s?\d/i },
    { label: '夸张口号', pattern: /天花板|必吃|必点|爆单|刷屏|引爆|全网/i },
  ]
  items.forEach((item) => {
    const body = stripApprovedPricePhrases([
      item.title,
      item.planning,
      ...(item.materialRequirements || []),
    ].join('\n'), approvedPricePhrases)
    forbidden.forEach((rule) => {
      if (rule.pattern.test(body)) issues.add(rule.label)
    })
  })
  return Array.from(issues)
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
    inspirationCreativeId: item.inspirationCreativeId,
    inspirationSourceTitle: item.inspirationSourceTitle,
    inspirationSourceSummary: item.inspirationSourceSummary,
    sampleVideoUrl: item.sampleVideoUrl,
    sampleOriginalUrl: item.sampleOriginalUrl,
    sampleThumbnailUrl: item.sampleThumbnailUrl,
    sampleSourcePlatform: item.sampleSourcePlatform,
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
  const productCatalog = skuLibraryForLLM(brand.knowledge?.menuItems, 30)
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
    storeActivities: serializeStoreActivities(brand.gameConfig),
    products: primaryProducts(brand, { available: false }),
    productCatalog,
    brandClaim: brand.knowledge?.brandClaim || null,
    merchantInterview: interview,
    researchReport: current.researchReport || null,
    subscriptionStrategy: current.annualPlan?.subscriptionStrategy || null,
    annualPlan: current.annualPlan || null,
    request: body || {},
  }
}

function compactMarketingPlanInputForLLM(input: Record<string, unknown>, scope: MarketingPlanLLMScope) {
  const brand = objectValue(input.brand)
  const researchReport = objectValue(input.researchReport)
  const subscriptionStrategy = objectValue(input.subscriptionStrategy)
  const merchantInterview = objectValue(input.merchantInterview)
  const currentQuarter = objectValue(input.currentQuarter)
  const planningWindow = objectValue(input.planningWindow)
  const planningQuarters = arrayValue(planningWindow.quarters)
    .map((item) => {
      const quarter = objectValue(item)
      return {
        quarter: text(quarter.quarter),
        year: Number(quarter.year) || undefined,
        startMonth: text(quarter.startMonth),
        endMonth: text(quarter.endMonth),
        periodLabel: text(quarter.periodLabel),
        months: arrayValue(quarter.months).map(text).filter(Boolean),
      }
    })
  const annualStrategy = objectValue(input.annualStrategy)
  const previousQuarterPlans = arrayValue(input.previousQuarterPlans)
    .map((item) => {
      const quarter = objectValue(item)
      return {
        periodLabel: text(quarter.periodLabel || quarter.quarter),
        focus: text(quarter.focus).slice(0, 120),
        campaigns: stringList(quarter.campaigns).slice(0, 3),
        promotionPoints: arrayValue(quarter.promotionPoints)
          .map((point) => text(objectValue(point).name))
          .filter(Boolean)
          .slice(0, 3),
      }
    })
    .slice(-4)
  return {
    brand: {
      id: text(brand.id),
      name: text(brand.name),
      industry: text(brand.industry),
      location: text(brand.location),
      address: text(brand.address),
      description: text(brand.description).slice(0, scope === 'quarter' ? 260 : 420),
    },
    stores: arrayValue(input.stores).slice(0, scope === 'quarter' ? 3 : 6),
    storeActivities: scope === 'quarter' ? null : input.storeActivities || null,
    products: stringList(input.products).slice(0, 8),
    productCatalog: arrayValue(input.productCatalog).slice(0, scope === 'quarter' ? 12 : 24),
    brandClaim: scope === 'quarter' ? null : input.brandClaim || null,
    merchantInterview: {
      summary: text(merchantInterview.summary).slice(0, scope === 'quarter' ? 220 : 500),
      rawNotes: text(merchantInterview.rawNotes).slice(0, scope === 'quarter' ? 360 : 900),
      answers: arrayValue(merchantInterview.answers).slice(0, scope === 'quarter' ? 4 : 8),
    },
    researchReport: {
      summary: text(researchReport.summary).slice(0, scope === 'quarter' ? 420 : 900),
      brandImage: text(researchReport.brandImage).slice(0, scope === 'quarter' ? 240 : 500),
      marketingStatus: text(researchReport.marketingStatus).slice(0, scope === 'quarter' ? 220 : 500),
      marketAnalysis: text(researchReport.marketAnalysis).slice(0, scope === 'quarter' ? 320 : 700),
      issues: stringList(researchReport.issues).slice(0, scope === 'quarter' ? 4 : 8),
      growthPoints: stringList(researchReport.growthPoints).slice(0, scope === 'quarter' ? 5 : 10),
      missingQuestions: stringList(researchReport.missingQuestions).slice(0, scope === 'quarter' ? 4 : 8),
      dataSources: scope === 'quarter' ? [] : stringList(researchReport.dataSources).slice(0, 8),
    },
    subscriptionStrategy: {
      planId: text(subscriptionStrategy.planId),
      planName: text(subscriptionStrategy.planName),
      platformCoverage: stringList(subscriptionStrategy.platformCoverage),
      monthlyContentQuota: subscriptionStrategy.monthlyContentQuota,
      publishingFreq: subscriptionStrategy.publishingFreq || null,
      includedServices: stringList(subscriptionStrategy.includedServices).slice(0, scope === 'quarter' ? 6 : 12),
    },
    planningWindow: {
      rule: text(planningWindow.rule),
      quarters: planningQuarters,
    },
    annualStrategy: scope === 'quarter'
      ? {
          goal: text(annualStrategy.goal).slice(0, 180),
          theme: text(annualStrategy.theme).slice(0, 120),
          strategyPrinciples: stringList(annualStrategy.strategyPrinciples).slice(0, 4),
          contentPillars: stringList(annualStrategy.contentPillars).slice(0, 5),
          metrics: stringList(annualStrategy.metrics).slice(0, 5),
        }
      : null,
    currentQuarter: scope === 'quarter'
      ? {
          quarter: text(currentQuarter.quarter),
          year: Number(currentQuarter.year) || undefined,
          startMonth: text(currentQuarter.startMonth),
          endMonth: text(currentQuarter.endMonth),
          periodLabel: text(currentQuarter.periodLabel),
          months: arrayValue(currentQuarter.months).map(text).filter(Boolean),
        }
      : null,
    previousQuarterPlans,
    request: input.request || {},
  }
}

async function buildMarketingPlanMarketContext(
  brand: BrandPlanBrand,
  quarters: NonNullable<BrandPlanWorkspaceData['annualPlan']>['quarterlyPlans']
) {
  const years = uniqueStrings((quarters || [])
    .map((quarter) => quarter.year ? String(quarter.year) : text(quarter.startMonth).slice(0, 4))
    .filter(Boolean))
  const market = normalizeMarketName(text(brand.location || brand.address || 'Singapore'))
  const merchantCategory = text(brand.industry || brand.knowledge?.productAssumptions || brand.description || 'Restaurant / F&B')
  const events: Array<Record<string, unknown>> = []
  const gaps: Array<Record<string, unknown>> = []
  for (const year of years.length ? years : [String(new Date().getFullYear())]) {
    const calendar = await fetchPromotionStrategyMarketCalendar({
      markets: [market],
      year,
      merchantCategory,
    }, {
      userId: 'brand-plan-generation',
      email: null,
      roles: ['SYSTEM', 'AMC_KANBAN'],
    }).catch((error: any) => ({
      ok: false,
      error: error?.message || 'market_calendar_unavailable',
      events: [],
      contentLibraryGaps: [{ reason: 'market_calendar_unavailable', year }],
    }))
    events.push(...arrayValue(calendar.events).map((event) => objectValue(event)))
    gaps.push(...arrayValue(calendar.contentLibraryGaps).map((gap) => objectValue(gap)))
  }
  return {
    marketCalendar: {
      market,
      merchantCategory,
      events: events.slice(0, 80),
      gaps,
      usageRule: '节假日只作为可选机会点；必须结合品牌数据、产品适配度、素材和门店承接能力判断是否使用。',
    },
    storeActivities: serializeStoreActivities(brand.gameConfig),
  }
}

function serializeStoreActivities(gameConfig: BrandPlanBrand['gameConfig']) {
  if (!gameConfig) {
    return {
      configured: false,
      usageRule: '没有配置店内活动时，不要生成店内活动 campaign；可用常规卖点、产品教育、信任建设或到店转化策略替代。',
      rounds: [],
    }
  }
  const rounds = arrayValue(gameConfig.activityRounds)
    .map((round) => objectValue(round))
    .map((round) => ({
      id: text(round.id),
      startsAt: dateText(round.startsAt),
      endsAt: dateText(round.endsAt),
    }))
    .filter((round) => round.startsAt && round.endsAt)
  return {
    configured: true,
    title: text(gameConfig.title),
    description: text(gameConfig.description),
    templateType: text(gameConfig.templateType),
    maxSpinsPerUserDay: positiveNumber(gameConfig.maxSpinsPerUserDay),
    enabledTasks: {
      photo: Boolean(gameConfig.taskPhotoEnabled),
      review: Boolean(gameConfig.taskReviewEnabled),
      googleMaps: Boolean(gameConfig.taskGoogleMapsEnabled),
      xiaohongshu: Boolean(gameConfig.taskXiaohongshuEnabled),
      instagram: Boolean(gameConfig.taskInstagramEnabled),
    },
    rounds,
    usageRule: rounds.length
      ? '已有有效店内活动轮次时，品牌营销方案和内容发布节奏必须配合活动窗口：提前预热、活动期间解释参与方式和到店理由、活动后复盘口碑/UGC/回访动作。'
      : '已有店内活动配置但没有有效轮次时，不要强行生成活动 campaign。',
  }
}

function normalizeMarketName(value: string) {
  const lower = value.toLowerCase()
  if (!lower || lower.includes('singapore') || lower.includes('新加坡') || lower === 'sg') return 'Singapore'
  if (lower.includes('malaysia') || lower.includes('马来西亚') || lower === 'my') return 'Malaysia'
  if (lower.includes('indonesia') || lower.includes('印尼') || lower === 'id') return 'Indonesia'
  return value || 'Singapore'
}

function dateText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  const textValue = text(value)
  if (!textValue) return ''
  const date = new Date(textValue)
  return Number.isNaN(date.getTime()) ? textValue : date.toISOString()
}

type MarketingPlanLLMScope = 'annual_strategy' | 'quarter'

async function callMarketingPlanLLM(scope: MarketingPlanLLMScope, input: Record<string, unknown>) {
  const jsonShape = scope === 'annual_strategy'
    ? {
        goal: '一句年度经营目标',
        theme: '一句年度策划主题',
        strategyPrinciples: ['原则一', '原则二', '原则三'],
        platformStrategy: [
          {
            platform: '平台名称',
            role: '该平台承担的角色',
            contentApproach: '内容打法',
            customerAction: '希望顾客采取的行动',
          },
        ],
        contentPillars: ['内容支柱一', '内容支柱二', '内容支柱三', '内容支柱四'],
        metrics: ['指标一', '指标二', '指标三', '指标四'],
        researchFocus: '承接摸底报告的一句重点',
      }
    : {
        quarter: 'Q1',
        year: 2026,
        startMonth: '2026-09',
        endMonth: '2026-11',
        periodLabel: '2026-09 至 2026-11',
        strategy: '一句季度策略',
        focus: '一句季度重点',
        promotionPoints: [
          {
            name: '推广重点一',
            rationale: '选择原因',
            targetAudience: '目标顾客',
            customerAction: '希望顾客采取的行动',
            platforms: ['平台 slug'],
            suggestedMonthlyPosts: 2,
          },
        ],
        campaigns: ['活动一', '活动二'],
        contentThemes: ['主题一', '主题二', '主题三'],
        monthlyFocus: [
          {
            month: '2026-09',
            focus: '本月重点',
            promotionPoints: ['推广重点一'],
          },
        ],
      }
  const schemaInstruction = scope === 'annual_strategy'
    ? [
      '只返回一个可被 JSON.parse 解析的 JSON 对象，不要 Markdown，不要解释，不要代码块。',
      '字段：goal, theme, strategyPrinciples, platformStrategy, contentPillars, metrics, researchFocus。',
      '数量限制：strategyPrinciples 3 条；platformStrategy 按订阅平台各 1 条；contentPillars 4 条；metrics 4 条。',
      '不要生成 quarterlyFocus 或 quarterlyPlans；季度计划会在后续步骤逐个生成。',
      '方案必须适合本地商家，围绕“让顾客找得到、看得懂、愿意来”；不得承诺流量、排名、销量或到店人数。',
      '必须读取 productCatalog：把商品/服务/套餐按热销品、高复购品、商家当下主推/主理人判断有潜力、招牌、套餐等标签归类，允许一个 SKU 同时属于多类；多类重合的 SKU 应作为品牌推广重点。',
      '如果 productCatalog 提供明确价格、适合人数、套餐内容或搭配建议，可以用于策略判断和价格感知内容方向，例如人均、几个人吃、套餐怎么点；如果没有明确价格，不得编价格。',
      '严格受 subscriptionStrategy 的平台、频次和服务范围约束；超出范围只能作为未来升级方向。',
    ].join('\n')
    : [
      '只返回一个可被 JSON.parse 解析的 JSON 对象，不要 Markdown，不要解释，不要代码块。',
      '字段必须为：quarter, year, startMonth, endMonth, periodLabel, strategy, focus, promotionPoints, campaigns, contentThemes, monthlyFocus。',
      'promotionPoints 每项含 name, rationale, targetAudience, customerAction, platforms, suggestedMonthlyPosts。',
      'monthlyFocus 每项含 month, focus, promotionPoints。',
      '数量限制：promotionPoints 必须刚好 2 项；campaigns 2 条；contentThemes 3 条；monthlyFocus 必须刚好 3 项。',
      '所有字段都用短句。不要编折扣、赠品、暗号、排队、客流、顾客评价或不存在的活动。',
      '必须参考 annualStrategy 和 previousQuarterPlans，当前季度要承接前面季度，避免重复。',
      '必须参考 productCatalog 选择具体 SKU 或套餐进入 promotionPoints/contentThemes/monthlyFocus；优先使用同时命中热销、高复购、商家主推、招牌或套餐的项目。',
      '如果 productCatalog 提供真实价格、适合人数或套餐内容，可以写入价格引导和点单判断；如果没有提供，不得写任何具体价格。',
      '内容必须按平台原生策略生成，并受订阅平台、频次和服务范围约束。',
    ].join('\n')
  const promptTemplate = await getPromptTemplate('marketing_plan_generation')
  const compactInput = compactMarketingPlanInputForLLM(input, scope)
  const compactInputJson = JSON.stringify(compactInput)
  const fallbackPrompt = [
    '你是 AMC 的本地商家品牌营销策划负责人。请基于输入生成可执行的滚动营销方案。',
    schemaInstruction,
    '写法要求：中文、短句、具体、像给门店运营团队的计划；避免 AI 腔、空泛口号和无法验证承诺。',
    '输出必须使用双引号；不要使用尾逗号；所有字符串内部如需换行请用空格代替。',
    `JSON 形状参考，只替换里面的值，不要新增外层字段：${JSON.stringify(jsonShape)}`,
    `输入 JSON：${compactInputJson}`,
  ].join('\n\n')
  const prompt = promptTemplate?.template
    ? renderPromptTemplate(promptTemplate.template, {
        schemaInstruction,
        jsonShape: JSON.stringify(jsonShape),
        inputJson: `输入 JSON：${compactInputJson}`,
      })
    : fallbackPrompt
  const promptTrace = {
    taskKey: 'marketing_plan_generation',
    promptTemplateId: promptTemplate?.id || null,
    promptTemplateUpdatedAt: promptTemplate?.updatedAt instanceof Date
      ? promptTemplate.updatedAt.toISOString()
      : promptTemplate?.updatedAt || null,
    promptCharCount: prompt.length,
    schemaInstructionCharCount: schemaInstruction.length,
    inputCharCount: JSON.stringify(input).length,
    compactInputCharCount: compactInputJson.length,
  }
  try {
    const result = await callLLM('marketing_plan', prompt, scope === 'annual_strategy' ? 1800 : 2200, {
      temperature: 0.35,
      jsonMode: true,
      deadlineMs: scope === 'annual_strategy' ? 60000 : 65000,
      attemptTimeoutMs: scope === 'annual_strategy' ? [45000, 55000] : [50000, 60000],
      maxAttempts: 2,
      allowDefaultFallback: true,
      allowAnyFallback: false,
      allowSystemFallback: false,
    })
    let value = parseJsonObject(result.text)
    let repairTrace: Record<string, unknown> | undefined
    if (!value && result.text) {
      console.warn('[brand-plan] marketing_plan invalid JSON snippet', {
        scope,
        provider: result.provider,
        modelName: result.modelName,
        snippet: result.text.slice(0, 1200),
      })
      const repair = await repairMarketingPlanJson(scope, result.text)
      value = repair.value
      repairTrace = repair.trace
    }
    return {
      provider: result.provider,
      modelName: result.modelName,
      error: result.error || (value ? undefined : `llm_returned_invalid_json:${String(result.text || '').slice(0, 160)}`),
      value,
      trace: {
        ...promptTrace,
        routeDiagnostics: result.routeDiagnostics,
        attempts: result.attempts || [],
        latencyMs: result.latencyMs,
        timedOut: result.timedOut,
        responseTextCharCount: result.text?.length || 0,
        parseStatus: value ? (repairTrace ? 'ok_after_repair' : 'ok') : 'invalid_json',
        repairTrace,
      },
    }
  } catch (error) {
    return {
      provider: '',
      modelName: '',
      error: error instanceof Error ? error.message : 'marketing_plan_llm_exception',
      value: null,
      trace: {
        ...promptTrace,
        attempts: [],
        parseStatus: 'exception',
      },
    }
  }
}

async function repairMarketingPlanJson(scope: MarketingPlanLLMScope, rawText: string) {
  const prompt = [
    '把下面内容整理成严格 JSON 对象。只返回 JSON，不要 Markdown，不要解释。',
    scope === 'annual_strategy'
      ? '必须保留或补齐字段：goal, theme, strategyPrinciples, platformStrategy, contentPillars, metrics, researchFocus。不要补季度详情。'
      : '必须保留或补齐字段：quarter, year, startMonth, endMonth, periodLabel, strategy, focus, promotionPoints, campaigns, contentThemes, monthlyFocus。',
    '如果原文里有中文引号、尾逗号、说明文字或截断内容，请修成可 JSON.parse 的对象。',
    `原文：${rawText.slice(0, 12000)}`,
  ].join('\n\n')
  try {
    const result = await callLLM('marketing_plan', prompt, scope === 'annual_strategy' ? 1600 : 1400, {
      temperature: 0,
      jsonMode: true,
      deadlineMs: 22000,
      attemptTimeoutMs: [18000],
      maxAttempts: 1,
      allowDefaultFallback: true,
      allowAnyFallback: false,
      allowSystemFallback: false,
    })
    return {
      value: parseJsonObject(result.text),
      trace: {
        provider: result.provider,
        modelName: result.modelName,
        error: result.error,
        latencyMs: result.latencyMs,
        timedOut: result.timedOut,
        attempts: result.attempts || [],
      },
    }
  } catch (error) {
    return {
      value: null,
      trace: {
        error: error instanceof Error ? error.message : 'json_repair_exception',
      },
    }
  }
}

async function writeMarketingPlanBusinessLog(input: {
  brand: BrandPlanBrand
  scope: 'annual' | 'quarter'
  input: Record<string, unknown>
  llm: {
    provider: string
    modelName: string
    error?: string
    value: Record<string, unknown> | null
    trace?: Record<string, unknown>
  }
  fallbackUsed: boolean
}) {
  const routeDiagnostics = objectValue(input.llm.trace?.routeDiagnostics)
  const attempts = arrayValue(input.llm.trace?.attempts)
  const planningWindow = objectValue(input.input.planningWindow)
  const marketCalendar = objectValue(input.input.marketCalendar)
  const storeActivities = objectValue(input.input.storeActivities)
  const subscriptionStrategy = objectValue(input.input.subscriptionStrategy)
  const status = input.llm.value
    ? 'success'
    : input.fallbackUsed
      ? 'rule_fallback'
      : 'failed'
  const reason = input.llm.value
    ? 'llm_returned_valid_json'
    : input.llm.error || 'llm_returned_no_valid_plan'

  await writeAuditLog({
    actor: { type: 'SYSTEM', name: 'brand-plan-generator' },
    action: 'BRAND_MARKETING_PLAN_GENERATION',
    resourceType: 'BusinessPathLog',
    resourceId: `brand:${input.brand.id}:marketing_plan:${input.scope}`,
    newValue: {
      businessPath: 'brand_plan.marketing_plan.generate',
      scope: input.scope,
      stage: 'llm_generation',
      status,
      reason,
      fallbackUsed: input.fallbackUsed,
      taskTag: text(routeDiagnostics.taskTag) || 'marketing_plan',
      brand: {
        id: input.brand.id,
        name: input.brand.name,
        industry: input.brand.industry,
        location: input.brand.location,
      },
      llm: {
        provider: input.llm.provider || 'none',
        modelName: input.llm.modelName || 'none',
        error: input.llm.error || null,
        parseStatus: text(input.llm.trace?.parseStatus),
        latencyMs: positiveNumber(input.llm.trace?.latencyMs),
        timedOut: Boolean(input.llm.trace?.timedOut),
        responseTextCharCount: positiveNumber(input.llm.trace?.responseTextCharCount),
        routeDiagnostics,
        attempts,
      },
      prompt: {
        taskKey: text(input.llm.trace?.taskKey) || 'marketing_plan_generation',
        promptTemplateId: text(input.llm.trace?.promptTemplateId) || null,
        promptTemplateUpdatedAt: text(input.llm.trace?.promptTemplateUpdatedAt) || null,
        promptCharCount: positiveNumber(input.llm.trace?.promptCharCount),
        schemaInstructionCharCount: positiveNumber(input.llm.trace?.schemaInstructionCharCount),
        inputCharCount: positiveNumber(input.llm.trace?.inputCharCount),
      },
      inputSummary: {
        planningQuarters: arrayValue(planningWindow.quarters).length,
        marketEvents: arrayValue(marketCalendar.events).length,
        marketGaps: arrayValue(marketCalendar.gaps).length,
        productCatalogItems: arrayValue(input.input.productCatalog).length,
        storeActivityConfigured: Boolean(storeActivities.configured),
        storeActivityRounds: arrayValue(storeActivities.rounds).length,
        subscriptionPlan: text(subscriptionStrategy.planName || subscriptionStrategy.planId),
        platforms: arrayValue(subscriptionStrategy.platformCoverage)
          .map((platform) => text(platform))
          .filter(Boolean),
      },
    },
    metadata: {
      businessPath: 'brand_plan.marketing_plan.generate',
      status,
      reason,
    },
  })
}

function normalizeAnnualMarketingStrategy(
  value: Record<string, unknown>,
  fallback: NonNullable<BrandPlanWorkspaceData['annualPlan']>,
  llm: { provider: string; modelName: string; error?: string }
) {
  return normalizeAnnualMarketingSolution(value, fallback, llm)
}

function normalizeAnnualMarketingSolution(
  value: Record<string, unknown>,
  fallback: NonNullable<BrandPlanWorkspaceData['annualPlan']>,
  llm: { provider: string; modelName: string; error?: string }
): NonNullable<BrandPlanWorkspaceData['annualPlan']> {
  const rawQuarterlyFocus = arrayValue(value.quarterlyFocus)
    .map((item) => objectValue(item))
    .map((item) => ({
      quarter: text(item.quarter) || 'Q1',
      year: Number(item.year) || undefined,
      startMonth: text(item.startMonth) || undefined,
      endMonth: text(item.endMonth) || undefined,
      periodLabel: text(item.periodLabel) || undefined,
      focus: text(item.focus),
      campaigns: stringList(item.campaigns),
    }))
    .filter((item) => item.focus)
  const quarterlyPlans = normalizeAnnualQuarterlyPlans(value.quarterlyPlans, fallback.quarterlyPlans || [])
  const quarterlyFocus = quarterlyPlans.length
    ? quarterlyPlans.map((item) => ({
      quarter: item.quarter,
      year: item.year,
      startMonth: item.startMonth,
      endMonth: item.endMonth,
      periodLabel: item.periodLabel,
      focus: item.focus,
      campaigns: item.campaigns,
    }))
    : rawQuarterlyFocus
  return {
    ...fallback,
    generatedAt: new Date().toISOString(),
    goal: text(value.goal) || fallback.goal,
    theme: text(value.theme) || fallback.theme,
    strategyPrinciples: stringList(value.strategyPrinciples).length ? stringList(value.strategyPrinciples) : fallback.strategyPrinciples,
    platformStrategy: normalizePlatformStrategy(value.platformStrategy, fallback.platformStrategy),
    contentPillars: stringList(value.contentPillars).length ? stringList(value.contentPillars) : fallback.contentPillars,
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
        year: Number(item.year) || fallbackItem?.year,
        startMonth: text(item.startMonth) || fallbackItem?.startMonth,
        endMonth: text(item.endMonth) || fallbackItem?.endMonth,
        periodLabel: text(item.periodLabel) || fallbackItem?.periodLabel || quarter,
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
  return fallback.map((fallbackItem) => {
    const parsedItem = parsedByQuarter.get(fallbackItem.quarter)
    if (!parsedItem) return fallbackItem
    return {
      ...parsedItem,
      year: fallbackItem.year,
      startMonth: fallbackItem.startMonth,
      endMonth: fallbackItem.endMonth,
      periodLabel: fallbackItem.periodLabel || parsedItem.periodLabel || parsedItem.quarter,
      monthlyFocus: parsedItem.monthlyFocus.length ? parsedItem.monthlyFocus : fallbackItem.monthlyFocus,
    }
  })
}

function normalizePlatformStrategy(
  value: unknown,
  fallback: NonNullable<BrandPlanWorkspaceData['annualPlan']>['platformStrategy']
) {
  const parsed = arrayValue(value)
    .map((item) => objectValue(item))
    .map((item) => ({
      platform: text(item.platform),
      role: text(item.role),
      contentApproach: text(item.contentApproach),
      customerAction: text(item.customerAction),
    }))
    .filter((item) => item.platform && item.role)
  return parsed.length ? parsed : fallback
}

function defaultPlatformStrategy(platforms: string[]) {
  const roleByPlatform: Record<string, { role: string; contentApproach: string; customerAction: string }> = {
    google_business: {
      role: '搜索可见和到店决策',
      contentApproach: '更新营业信息、真实照片、Offer/Event/Update、评价信任和路线/预约/订单入口。',
      customerAction: '查看路线、预约、下单、致电或查看评价',
    },
    instagram: {
      role: '视觉识别和品牌质感',
      contentApproach: '用 Reels、Stories、Carousel 展示产品场景、门店氛围、菜单解释和可收藏信息。',
      customerAction: '收藏、私信咨询、查看地址或转发给朋友',
    },
    tiktok: {
      role: '短视频发现和真实场景种草',
      contentApproach: '用竖版短视频、强开头、员工/顾客视角、制作过程和真实反应表达卖点。',
      customerAction: '记住招牌、评论互动、收藏或到店体验',
    },
    facebook: {
      role: '社区触达和老客维护',
      contentApproach: '发布实用更新、活动提醒、家庭/社区场景、评论互动和老客回访内容。',
      customerAction: '评论、分享、询问活动或带家人朋友到店',
    },
    xiaohongshu: {
      role: '中文用户搜索种草和收藏决策',
      contentApproach: '用真实体验、场景化笔记、关键词、价格/菜单/路线信息和收藏价值承接中文用户。',
      customerAction: '收藏笔记、搜索品牌、私信咨询或按路线到店',
    },
  }
  return platforms
    .map((platform) => normalizePlatformSlug(platform))
    .filter(Boolean)
    .map((platform) => ({
      platform,
      ...(roleByPlatform[platform] || {
        role: '补充触达渠道',
        contentApproach: '根据该平台用户习惯改写内容，不做一稿多发。',
        customerAction: '收藏、咨询或进入下一步了解',
      }),
    }))
}

function marketingPlanPeriod(plan: NonNullable<BrandPlanWorkspaceData['annualPlan']>) {
  const quarters = plan.quarterlyPlans || []
  const first = quarters[0]
  const last = quarters[quarters.length - 1]
  if (first?.startMonth && last?.endMonth) return `${first.startMonth}_${last.endMonth}`
  if (first?.periodLabel && last?.periodLabel) return `${first.periodLabel}_${last.periodLabel}`
  return 'brand_marketing_plan'
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

function ensurePresentationTheme(
  brand: BrandPlanBrand,
  current: BrandPlanWorkspaceData
): BrandMarketingPlanPresentationTheme {
  const colorSource = [
    text(brand.knowledge?.brandImage),
    text(current.researchReport?.brandImage),
    text(current.annualPlan?.theme),
    text(brand.name),
  ].filter(Boolean).join('|') || brand.id
  const colorSourceKey = createHash('sha256').update(colorSource).digest('hex').slice(0, 16)
  if (current.presentationTheme?.colorSourceKey === colorSourceKey) {
    return current.presentationTheme
  }

  const palettes = [
    {
      paletteId: 'fresh-local',
      paletteName: '清爽本地生活',
      primary: '#047857',
      secondary: '#0f766e',
      accent: '#f59e0b',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      muted: '#64748b',
      decoration: 'fresh' as const,
    },
    {
      paletteId: 'warm-service',
      paletteName: '温暖服务感',
      primary: '#b45309',
      secondary: '#be123c',
      accent: '#2563eb',
      background: '#fffaf5',
      surface: '#ffffff',
      text: '#1f2937',
      muted: '#78716c',
      decoration: 'service' as const,
    },
    {
      paletteId: 'premium-night',
      paletteName: '精致夜间感',
      primary: '#312e81',
      secondary: '#0f766e',
      accent: '#eab308',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#111827',
      muted: '#64748b',
      decoration: 'premium' as const,
    },
    {
      paletteId: 'festival-campaign',
      paletteName: '活动推广感',
      primary: '#dc2626',
      secondary: '#7c3aed',
      accent: '#f97316',
      background: '#fff7ed',
      surface: '#ffffff',
      text: '#1e293b',
      muted: '#64748b',
      decoration: 'festival' as const,
    },
    {
      paletteId: 'editorial-calm',
      paletteName: '清晰策划感',
      primary: '#2563eb',
      secondary: '#059669',
      accent: '#d97706',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      muted: '#64748b',
      decoration: 'editorial' as const,
    },
  ]
  const digest = createHash('sha256').update(colorSourceKey).digest('hex')
  const index = parseInt(digest.slice(0, 8), 16) % palettes.length
  return {
    generatedAt: new Date().toISOString(),
    colorSourceKey,
    ...palettes[index],
  }
}

async function buildSubscriptionStrategy(brand: BrandPlanBrand) {
  const subscriptions = Array.isArray(brand.subscriptions) ? brand.subscriptions : []
  const active = subscriptions.find((subscription: (typeof subscriptions)[number]) =>
    subscription.status === 'ACTIVE' && (!subscription.contractEndDate || subscription.contractEndDate.getTime() > Date.now())
  ) || subscriptions[0]
  const plan = active ? SUBSCRIPTION_PLANS.find((item) => item.id === active.planId) : null
  const planId = active?.planId || 'none'
  const policy = planId !== 'none' ? await getSubscriptionOperationsPolicy(planId) : null
  const platformCoverage = policy?.platformCoverage.length ? policy.platformCoverage : getPlanPlatformCoverage(planId)
  const configuredPublishingFreq = policy ? normalizePublishingFreq(policy.publishingFreq) : null
  return {
    planId,
    planName: policy?.planName || plan?.name || active?.planName || '未激活订阅',
    includedServices: policy?.includedServices.length ? policy.includedServices : plan?.services || [],
    platformCoverage,
    monthlyContentQuota: policy?.monthlyContentQuota || getPlanMonthlyContentQuota(planId),
    publishingFreq: normalizePublishingFreq(brand.knowledge?.publishingFreq) || configuredPublishingFreq || normalizePublishingFreq(getPlanPublishingFreq(planId)),
  }
}

function applyPublishingFrequencyOverride(
  annualPlan: BrandPlanWorkspaceData['annualPlan'],
  publishingFreq: PublishingFreq
): BrandPlanWorkspaceData['annualPlan'] {
  if (!annualPlan?.subscriptionStrategy) return annualPlan
  const platformCoverage = Object.keys(publishingFreq.platforms || {})
  const monthlyContentQuota = sumMonthlyPosts(publishingFreq)
  return {
    ...annualPlan,
    subscriptionStrategy: {
      ...annualPlan.subscriptionStrategy,
      platformCoverage: platformCoverage.length ? platformCoverage : annualPlan.subscriptionStrategy.platformCoverage,
      monthlyContentQuota: monthlyContentQuota || annualPlan.subscriptionStrategy.monthlyContentQuota,
      publishingFreq,
    },
  }
}

function primaryProducts(brand: BrandPlanBrand, growth: { available: boolean; menuItems?: unknown[] }) {
  const catalogProducts = skuLibraryForLLM(brand.knowledge?.menuItems, 30)
    .sort((left, right) => Number(right.priorityScore) - Number(left.priorityScore))
    .map((item) => item.name)
    .filter(Boolean)
  if (catalogProducts.length) return catalogProducts.slice(0, 4)

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

const CONTENT_PLANNING_LEAD_DAYS = 7

function datePartsInSingapore(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function minimumContentPlanDateValue(base = new Date()) {
  const parts = datePartsInSingapore(base)
  const minimum = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + CONTENT_PLANNING_LEAD_DAYS))
  const next = datePartsInSingapore(minimum)
  return `${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`
}

function clampSchedulableCalendarMonth(month: string) {
  const minimumMonth = minimumCompleteCalendarMonthValue()
  return month < minimumMonth ? minimumMonth : month
}

function clampCalendarDateToMinimum(date: string) {
  const minimumDate = minimumContentPlanDateValue()
  return date && date >= minimumDate ? date : minimumDate
}

function clampCalendarItemsToMinimumDate(items: NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]) {
  return items.map((item) => ({
    ...item,
    date: clampCalendarDateToMinimum(text(item.date)),
  }))
}

function buildMonthlyPublishingSchedule(month: string, value: unknown, fallbackPlatforms: string[] = [], monthlyQuota = 0) {
  const [year, monthNumber] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const minimumDate = minimumContentPlanDateValue()
  const minimumMonth = minimumDate.slice(0, 7)
  const minimumDayInMonth = month === minimumMonth ? Number(minimumDate.slice(8, 10)) : 1
  const publishingFreq = normalizePublishingFreq(value)
  const enabledPlatformSlugs = Object.keys(publishingFreq?.platforms || {})
  const platforms = enabledPlatformSlugs.length
    ? enabledPlatformSlugs.map((slug) => platformForSlug(slug))
    : fallbackPlatforms.length
      ? fallbackPlatforms.map((slug) => platformForSlug(slug))
      : MARKETING_PLAN_PLATFORMS
  const postCount = monthlyQuota > 0
    ? clampPostCount(monthlyQuota)
    : resolveMonthlyPostCount(publishingFreq, daysInMonth)
  const platformSlots = buildPlatformSlotSequence(platforms, postCount, publishingFreq)
  const firstDay = Math.min(daysInMonth, Math.max(minimumDayInMonth, Math.min(3, daysInMonth)))
  const lastDay = Math.max(firstDay, daysInMonth - 2)

  return Array.from({ length: postCount }, (_, index) => {
    const day = postCount === 1
      ? firstDay
      : Math.min(daysInMonth, Math.round(firstDay + ((lastDay - firstDay) * index) / (postCount - 1)))
    return {
      date: `${month}-${String(day).padStart(2, '0')}`,
      platform: platformSlots[index % Math.max(1, platformSlots.length)] || platforms[index % platforms.length],
    }
  })
}

function buildPlatformSlotSequence(
  platforms: Array<{ slug: string; label: string }>,
  postCount: number,
  publishingFreq: PublishingFreq | null
) {
  if (!platforms.length) return MARKETING_PLAN_PLATFORMS.slice(0, 1)
  const weights = new Map<string, number>()
  for (const platform of platforms) {
    const cfg = objectValue(publishingFreq?.platforms?.[platform.slug])
    const configuredWeight = positiveNumber(cfg.postsPerMonth) || positiveNumber(cfg.postsPerWeek) || positiveNumber(cfg.postsPerDay)
    if (configuredWeight > 0) weights.set(platform.slug, configuredWeight)
  }
  if (!weights.size) {
    const hasXiaohongshu = platforms.some((platform) => platform.slug === 'xiaohongshu')
    const defaults = hasXiaohongshu
      ? { instagram: 12, tiktok: 12, xiaohongshu: 12, google_business: 2 }
      : { instagram: 12, tiktok: 6, google_business: 2 }
    for (const platform of platforms) weights.set(platform.slug, defaults[platform.slug as keyof typeof defaults] || 1)
  }
  const totalWeight = Array.from(weights.values()).reduce((sum, value) => sum + value, 0) || platforms.length
  const counts = platforms.map((platform) => ({
    platform,
    count: Math.max(0, Math.floor((weights.get(platform.slug) || 1) * postCount / totalWeight)),
  }))
  let allocated = counts.reduce((sum, item) => sum + item.count, 0)
  const ranked = [...counts].sort((a, b) => (weights.get(b.platform.slug) || 1) - (weights.get(a.platform.slug) || 1))
  for (let index = 0; allocated < postCount; index += 1) {
    ranked[index % ranked.length].count += 1
    allocated += 1
  }
  const slots: Array<{ slug: string; label: string }> = []
  let cursor = 0
  while (slots.length < postCount && counts.some((item) => item.count > 0)) {
    const item = counts[cursor % counts.length]
    if (item.count > 0) {
      slots.push(item.platform)
      item.count -= 1
    }
    cursor += 1
  }
  return slots.length ? slots : platforms
}

function resolveMonthlyPostCount(publishingFreq: PublishingFreq | null, daysInMonth: number) {
  if (!publishingFreq) return 7
  const platformMonthlyTotal = Object.values(publishingFreq.platforms || {})
    .reduce((sum, cfg) => sum + positiveNumber(cfg.postsPerMonth), 0)
  if (platformMonthlyTotal > 0) return clampPostCount(platformMonthlyTotal)

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
        postsPerMonth: positiveNumber(cfg.postsPerMonth) || undefined,
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
  return Math.min(90, Math.max(1, value))
}

function sumMonthlyPosts(publishingFreq: PublishingFreq | null) {
  if (!publishingFreq) return 0
  return Object.values(publishingFreq.platforms || {})
    .reduce((sum, cfg) => sum + positiveNumber(cfg.postsPerMonth), 0)
}

function subscriptionPlanningStartDate(brand: BrandPlanBrand) {
  const subscription = Array.isArray(brand.subscriptions) ? brand.subscriptions[0] : null
  const start = subscription?.contractStartDate || subscription?.createdAt || new Date()
  return firstCompleteNaturalMonth(start)
}

function firstCompleteNaturalMonth(date: Date) {
  const source = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date()
  const monthOffset = source.getDate() <= 1 ? 0 : 1
  return new Date(source.getFullYear(), source.getMonth() + monthOffset, 1)
}

function planningQuarterSequence(startDate = new Date()) {
  return [0, 1, 2, 3].map((offset) => {
    const absoluteMonth = startDate.getMonth() + offset * 3
    const periodStart = new Date(startDate.getFullYear(), absoluteMonth, 1)
    const periodEnd = new Date(startDate.getFullYear(), absoluteMonth + 2, 1)
    const quarterIndex = Math.floor(periodStart.getMonth() / 3)
    const year = periodStart.getFullYear()
    const startMonth = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`
    const endMonth = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}`
    const quarter = `Q${quarterIndex + 1}`
    return {
      quarter,
      quarterIndex,
      year,
      startMonth,
      endMonth,
      periodLabel: `${year} ${quarter}`,
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
  const parsed = parseJsonValue(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
}

function parseJsonValue(value: unknown): unknown | null {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return null
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  for (const candidate of jsonObjectCandidates(cleaned)) {
    const parsed = tryParseJsonValue(candidate) ?? tryParseJsonValue(repairLooseJson(candidate))
    if (parsed) return parsed
  }
  return null
}

function jsonObjectCandidates(value: string) {
  const candidates = [value]
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())
  const firstBrace = value.indexOf('{')
  const lastBrace = value.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(value.slice(firstBrace, lastBrace + 1))
  const firstBracket = value.indexOf('[')
  const lastBracket = value.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) candidates.push(value.slice(firstBracket, lastBracket + 1))
  return uniqueStrings(candidates)
}

function tryParseJsonValue(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function repairLooseJson(value: string) {
  return value
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/，(?=\s*["}\]])/g, ',')
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .replace(/、(?=\s*["}\]])/g, ',')
    .replace(/,\s*([}\]])/g, '$1')
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

export class BrandPlanError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>
  constructor(code: string, status = 500, details?: Record<string, unknown>) {
    super(code)
    this.code = code
    this.status = status
    this.details = details
  }
}
