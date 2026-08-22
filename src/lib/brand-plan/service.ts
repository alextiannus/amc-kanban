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
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/catalog'
import { getSubscriptionOperationsPolicy } from '@/lib/subscription/policy'
import { callLLM } from '@/lib/llmRouter'
import { getPromptTemplate, renderPromptTemplate } from '@/lib/promptTemplates'

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
  sampleVideoUrl?: string
  sampleOriginalUrl?: string
  sampleThumbnailUrl?: string
  sampleSourcePlatform?: string
  materialRequirements?: string[]
  contentLibraryGap?: string
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
  | 'generate_publishing_calendar'
  | 'regenerate_calendar_item'
  | 'ensure_presentation_theme'

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
  } else if (input.action === 'generate_publishing_calendar') {
    requireQuarterPlan(current)
    const month = normalizeMonth(input.body?.month)
    const monthItems = await buildPublishingMonth(brand, month, latestInterview, current, input.body?.publishingFreqOverride)
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
  } else if (input.action === 'ensure_presentation_theme') {
    requireAnnualPlan(current)
    next = {
      ...current,
      presentationTheme: ensurePresentationTheme(brand, current),
    }
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
    const month = normalizeMonth(body?.month)
    const items = arrayValue(value) as NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]
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
  const llm = await callMarketingPlanLLM('annual', input)
  if (!llm.value) {
    throw new BrandPlanError('marketing_plan_llm_failed', 502)
  }
  return normalizeAnnualMarketingSolution(llm.value, fallback, llm)
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
  const creativePool = await requestCalendarCreativePool(brand, current, promotionPoints)

  return schedule.map((slot, index) => {
    const promotionPoint = assignPromotionPointToSlot(promotionPoints, slot, index)
    const product = promotionPoint?.sellingPoint || products[index % Math.max(1, products.length)] || '招牌产品'
    const candidate = selectCalendarCreativeCandidate(creativePool.creativeCandidates, promotionPoint.id, slot.platform.slug, index)
    const sampleLinks = calendarSampleLinks(candidate)
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
      sampleVideoUrl: sampleLinks.videoUrl,
      sampleOriginalUrl: sampleLinks.originalUrl,
      sampleThumbnailUrl: sampleLinks.thumbnailUrl,
      sampleSourcePlatform: sampleLinks.platform,
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
  const sampleLinks = calendarSampleLinks(candidate)
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
    sampleVideoUrl: sampleLinks.videoUrl,
    sampleOriginalUrl: sampleLinks.originalUrl,
    sampleThumbnailUrl: sampleLinks.thumbnailUrl,
    sampleSourcePlatform: sampleLinks.platform,
    materialRequirements: calendarMaterialRequirements(item.product, candidate),
    contentLibraryGap: calendarContentGap(pool.contentLibraryGaps, point.id, candidate),
  }
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
    brandClaim: brand.knowledge?.brandClaim || null,
    merchantInterview: interview,
    researchReport: current.researchReport || null,
    subscriptionStrategy: current.annualPlan?.subscriptionStrategy || null,
    annualPlan: current.annualPlan || null,
    request: body || {},
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

async function callMarketingPlanLLM(scope: 'annual' | 'quarter', input: Record<string, unknown>) {
  const schemaInstruction = scope === 'annual'
    ? [
      '返回 JSON 对象，字段必须为：goal(string), theme(string), strategyPrinciples(array), platformStrategy(array), contentPillars(array), quarterlyFocus(array，每项含 quarter, year, startMonth, endMonth, periodLabel, focus, campaigns), quarterlyPlans(array，必须且只能含 planningWindow.quarters 中连续四个有效周期；每项含 quarter, year, startMonth, endMonth, periodLabel, strategy, focus, promotionPoints, campaigns, contentThemes, monthlyFocus。promotionPoints 每项含 name, rationale, targetAudience, customerAction, platforms, suggestedMonthlyPosts；monthlyFocus 每项含 month, focus, promotionPoints), metrics(array), researchFocus(string)。',
      'strategyPrinciples 必须用 3-5 条中文短句清晰说明本方案的顶层判断，让用户能一眼看到为什么这样规划，例如“让顾客找得到、看得懂、愿意来”“先补足信任，再推动到店动作”。',
      'platformStrategy 每项必须含 platform, role, contentApproach, customerAction，用来清楚展示每个平台在 AMC 方案里的分工。',
      'contentPillars 必须列出 4-7 个内容支柱，让用户能看到后续内容创建会围绕什么持续展开。',
      '字段含义要求：goal/theme/strategy/focus 必须体现 AMC 本地商家逻辑：让顾客找得到、看得懂、愿意来；不要写泛泛品牌口号。',
      'quarterlyPlans[].promotionPoints 必须把每个平台的角色说清楚：Google Business/Profile 负责搜索可见、营业信息、路线/预约/订单和评价信任；Instagram 负责视觉识别、Reels/Stories/Carousel 展示产品场景；TikTok 负责短视频发现、真实人物/员工/顾客视角和平台原生表达；Facebook 负责社区感、老客触达、本地活动和实用更新；小红书负责中文用户搜索种草、真实体验、场景化笔记和收藏决策。',
      'quarterlyPlans[].contentThemes 必须包含可执行内容支柱，例如招牌产品、真实门店/制作过程、顾客评价/信任证明、附近到店理由、季节/节日/店内互动、菜单/价格/服务解释；不要一稿多发。',
      'campaigns 可以为空数组；只有当节假日/店内活动与品牌数据和执行条件匹配时才写入。若 storeActivities 有有效 rounds，monthlyFocus 和 campaigns 必须体现内容发布如何配合活动窗口：提前预热、活动期间解释参与方式和到店理由、活动后复盘口碑/UGC/回访动作。',
      'metrics 只能使用本地商家可观察指标，例如路线点击、电话/WhatsApp/DM 咨询、预约/订单入口点击、评论数量与质量、收藏/分享、发布完成率、活动参与记录、素材补齐率；不要保证流量、排名、销售额或到店人数。',
      '所有建议必须受 subscriptionStrategy 的平台、频次和服务范围约束；超出范围只能写成未来升级方向，不要当作当前订阅交付。',
    ].join('\n')
    : `返回 JSON 对象，字段必须为：quarter(string, Q1-Q4), year(number), startMonth(string), endMonth(string), periodLabel(string), objective(string), monthlyFocus(array，每项含 month/focus), contentDirections(array), promotionPoints(array，每项含 name/rationale/customerAction/platforms/suggestedMonthlyPosts)。内容必须按平台原生策略生成，并受订阅平台、频次和服务范围约束。`
  const promptTemplate = await getPromptTemplate('marketing_plan_generation')
  const prompt = renderPromptTemplate(promptTemplate?.template || '', {
    schemaInstruction,
    inputJson: JSON.stringify(input),
  })
  try {
    const result = await callLLM('marketing_plan', prompt, scope === 'annual' ? 4200 : 2200, {
      temperature: 0.35,
      jsonMode: true,
      deadlineMs: 45000,
      attemptTimeoutMs: [20000, 25000],
      maxAttempts: 2,
      allowDefaultFallback: false,
      allowSystemFallback: false,
    })
    return {
      provider: result.provider,
      modelName: result.modelName,
      error: result.error,
      value: parseJsonObject(result.text),
    }
  } catch (error) {
    return {
      provider: '',
      modelName: '',
      error: error instanceof Error ? error.message : 'marketing_plan_llm_exception',
      value: null,
    }
  }
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
  if (planId === 'essential') return 20
  if (planId === 'booster') return 38
  return 0
}

function publishingFreqForPlan(planId: string, platforms: string[]): PublishingFreq | null {
  if (!platforms.length) return null
  const monthlyByPlan = planId === 'booster'
    ? { instagram: 12, tiktok: 12, xiaohongshu: 12, google_business: 2 }
    : planId === 'essential'
      ? { instagram: 12, tiktok: 6, google_business: 2 }
      : {}
  const normalizedPlatforms = platforms.map(normalizePlatformSlug).filter(Boolean)
  const configuredTotal = normalizedPlatforms.reduce((sum, platform) =>
    sum + (monthlyByPlan[platform as keyof typeof monthlyByPlan] || 0), 0)
  if (!configuredTotal) return null
  return {
    platforms: Object.fromEntries(normalizedPlatforms.map((platform) => [
      platform,
      { postsPerMonth: monthlyByPlan[platform as keyof typeof monthlyByPlan] || 1 },
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

function buildMonthlyPublishingSchedule(month: string, value: unknown, fallbackPlatforms: string[] = [], monthlyQuota = 0) {
  const [year, monthNumber] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
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
  const firstDay = Math.min(3, daysInMonth)
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

export class BrandPlanError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}
