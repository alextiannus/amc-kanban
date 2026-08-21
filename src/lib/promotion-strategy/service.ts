/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import type { PlanningActor } from '@/lib/growthPlanning'
import {
  fetchPromotionStrategyMarketCalendar,
  matchPromotionStrategyCreativeCandidates,
} from './clients'

type PromotionPoint = {
  id: string
  goal: string
  sellingPoint: string
  customerAction: string
  targetPlatforms: string[]
  requestedCandidateCount: number
  targetPublishWindow: { start: string; end: string }
}

export async function generatePromotionStrategyPlan(input: {
  brand: any
  knowledge: Record<string, any>
  actor: PlanningActor
  body: Record<string, any>
}) {
    const { brand, knowledge, actor, body } = input
    const now = new Date()
    const year = Number(body.year || now.getFullYear())
    const month = normalizeMonth(body.month, now)
    const market = normalizeMarket(stringValue(body.market) || knowledge.market || brand.location || 'Singapore')
    const category = stringValue(body.merchantCategory) || inferCategory(brand, knowledge)
    const goal = stringValue(body.goal) || knowledge.promotionFocus || '提升本月到店咨询和预约转化'
    const sellingPoints = splitSellingPoints(body.sellingPoints || knowledge.promotionFocus || brand.description || '')
    const servicePlanId = normalizeServicePlan(body.servicePlanId)
    const platforms = normalizePlatforms(body.platforms)

    const [calendar, assets] = await Promise.all([
      fetchPromotionStrategyMarketCalendar({ markets: [market], year, merchantCategory: category }, actor).catch((error: any) => ({
        ok: false,
        error: error?.message || 'market_calendar_unavailable',
        events: [],
        contentLibraryGaps: [{ reason: 'market_calendar_unavailable' }],
      })),
      prisma.mediaAsset.findMany({
        where: { brandId: brand.id },
        select: { id: true, url: true, mimeType: true, aiTags: true, aiCategory: true, aiCaption: true },
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
    ])

    const promotionPoints = buildPromotionPoints({
      month,
      goal,
      sellingPoints,
      platforms,
      servicePlanId,
      marketEvents: Array.isArray(calendar.events) ? calendar.events : [],
    })

    const matches = []
    for (const point of promotionPoints) {
      const match = await matchPromotionStrategyCreativeCandidates({
        merchantId: brand.id,
        merchantName: brand.name,
        merchantCategory: category,
        market,
        promotionPlanScope: 'monthly',
        promotionPointId: point.id,
        promotionGoal: point.goal,
        sellingPoint: point.sellingPoint,
        customerAction: point.customerAction,
        requestedCandidateCount: point.requestedCandidateCount,
        targetPublishWindow: point.targetPublishWindow,
        refreshMode: body.refreshPromotionPointId === point.id ? 'promotion_point_refresh' : 'full_candidate_pool',
        platforms: point.targetPlatforms,
        assetContext: {
          existingAssets: assets.map((asset: any) => ({
            id: asset.id,
            mimeType: asset.mimeType,
            tags: asset.aiTags,
            category: asset.aiCategory,
            caption: asset.aiCaption,
          })),
        },
        serviceScope: { planId: servicePlanId },
      }).catch((error: any) => ({
        contentMatchRequestId: `failed_${point.id}`,
        libraryVersions: {},
        creativeCandidates: [],
        contentLibraryGaps: [{ promotionPointId: point.id, reason: error?.message || 'amc_content_unavailable' }],
        candidateAssetNeeds: [],
        candidateStoreVisitNeeds: [],
        candidateMaterialPrintNeeds: [],
      }))
      matches.push({ point, match })
    }

    return assemblePlan({
      brand,
      knowledge,
      month,
      year,
      market,
      category,
      goal,
      servicePlanId,
      calendar,
      promotionPoints,
      matches,
    })
}

function assemblePlan(input: {
  brand: any
  knowledge: Record<string, any>
  month: string
  year: number
  market: string
  category: string
  goal: string
  servicePlanId: string
  calendar: any
  promotionPoints: PromotionPoint[]
  matches: Array<{ point: PromotionPoint; match: any }>
}) {
  const publicationDrafts = input.matches.flatMap(({ point, match }, pointIndex) => {
    const candidates = Array.isArray(match.creativeCandidates) ? match.creativeCandidates : []
    const selected = candidates[0]
    const publishDate = dateInMonth(input.month, 3 + pointIndex * 6)
    const backupDate = dateInMonth(input.month, 5 + pointIndex * 6)
    if (!selected) {
      return [{
        publicationId: `pub_${point.id}_gap`,
        promotionPointId: point.id,
        selectedCreativeCandidateId: null,
        plannedPublishDate: publishDate,
        backupPublishDate: backupDate,
        platform: point.targetPlatforms[0] || 'tiktok',
        contentFormat: 'manual_planning_required',
        contentAngle: point.sellingPoint,
        customerAction: point.customerAction,
        matchedTags: [],
        matchedInspirations: [],
        matchedCreatives: [],
        assetNeeds: [`需要为“${point.sellingPoint}”补充正式内容库创意或人工策划`],
        storeVisitNeeds: [],
        materialNeeds: [],
        libraryGap: { reason: 'no_creative_candidate_selected', details: match.contentLibraryGaps || [] },
        kanbanSelectionReason: 'amc-content 未返回可用候选；Kanban 保留该推广点并标记缺口，等待补库或人工刷新。',
        kanbanRankingScore: 0,
        ownerReviewStatus: 'needs_refresh',
        brandConfirmationStatus: 'not_submitted',
      }]
    }
    return [{
      publicationId: `pub_${point.id}_${selected.creativeCandidateId || pointIndex}`,
      promotionPointId: point.id,
      selectedCreativeCandidateId: selected.creativeCandidateId,
      plannedPublishDate: publishDate,
      backupPublishDate: backupDate,
      platform: point.targetPlatforms[0] || 'tiktok',
      contentFormat: selected.contentFormat,
      contentAngle: selected.contentAngle,
      customerAction: selected.customerAction || point.customerAction,
      matchedTags: selected.matchedTags || [],
      matchedInspirations: selected.matchedInspirations || [],
      matchedCreatives: selected.matchedCreatives || [],
      assetNeeds: selected.assetNeeds || [],
      storeVisitNeeds: selected.storeVisitNeeds || [],
      materialNeeds: selected.materialNeeds || [],
      sourceVideo: selected.sourceVideo || null,
      sourcePost: selected.sourcePost || null,
      scriptContent: selected.scriptContent || null,
      recommendationReason: selected.recommendationReason || '',
      libraryGap: selected.libraryGap || {},
      kanbanSelectionReason: `优先选择该候选，因为它最贴近“${point.sellingPoint}”，且能服务“${point.goal}”。`,
      kanbanRankingScore: Math.max(60, 96 - pointIndex * 7),
      ownerReviewStatus: 'owner_reviewing',
      brandConfirmationStatus: 'not_submitted',
    }]
  })

  const allCandidates = input.matches.flatMap(({ match }) => Array.isArray(match.creativeCandidates) ? match.creativeCandidates : [])
  const allGaps = input.matches.flatMap(({ match }) => Array.isArray(match.contentLibraryGaps) ? match.contentLibraryGaps : [])
  return {
    id: `plan_${input.brand.id}_${input.month.replace('-', '')}`,
    version: 1,
    state: 'owner_reviewing',
    ownerReviewStatus: 'owner_reviewing',
    brandConfirmationStatus: 'not_submitted',
    generatedAt: new Date().toISOString(),
    brand: { id: input.brand.id, name: input.brand.name },
    market: input.market,
    merchantCategory: input.category,
    servicePlanId: input.servicePlanId,
    annualGoals: [{
      goalId: 'annual_local_growth',
      goalName: '让更多附近顾客持续看到、理解并愿意到店',
      businessMetric: 'store_visits_and_booking_requests',
      target: '按月提升有效咨询、路线点击、预约和到店反馈',
      rationale: '本地生活商家的第一印象集中发生在手机端，需要稳定把卖点转成顾客动作。',
    }],
    quarterlyThemes: buildQuarterlyThemes(input.calendar, input.category),
    monthlyPromotionPlan: [{
      month: input.month,
      monthGoal: input.goal,
      primarySellingPoints: input.promotionPoints.map((point) => point.sellingPoint),
      campaigns: buildCampaigns(input.calendar, input.month),
      weeklyThemes: input.promotionPoints.map((point, index) => ({ week: index + 1, theme: point.sellingPoint, customerAction: point.customerAction })),
      customerActions: [...new Set(input.promotionPoints.map((point) => point.customerAction))],
      promotionPoints: input.promotionPoints,
    }],
    amcContentCreativeCandidateRequests: input.promotionPoints.map((point) => ({
      promotionPointId: point.id,
      promotionGoal: point.goal,
      sellingPoint: point.sellingPoint,
      requestedCandidateCount: point.requestedCandidateCount,
      targetPlatforms: point.targetPlatforms,
      targetPublishWindow: point.targetPublishWindow,
    })),
    amcContentCreativeCandidates: allCandidates,
    monthlyPublicationPlanDrafts: publicationDrafts,
    contentLibraryGaps: allGaps,
    assetCollectionRequests: buildAssetRequests(publicationDrafts),
    storeVisitRequests: publicationDrafts.filter((item: any) => item.storeVisitNeeds?.length).map((item: any) => ({
      requestId: `visit_${item.publicationId}`,
      sourcePublicationIds: [item.publicationId],
      visitObjective: item.storeVisitNeeds.join('；'),
      reviewStatus: 'pending_review',
    })),
    materialRequests: publicationDrafts.filter((item: any) => item.materialNeeds?.length).map((item: any) => ({
      requestId: `mat_${item.publicationId}`,
      sourcePublicationIds: [item.publicationId],
      materials: item.materialNeeds,
      reviewStatus: 'pending_review',
    })),
    publicationPlanReview: {
      reviewerId: null,
      reviewStatus: 'owner_reviewing',
      fullRetryCount: 0,
      singleDayRefreshes: [],
      notes: '主理人可查看每条候选的原视频/原 post、脚本、素材需求和推荐理由后再保存。',
    },
  }
}

function buildPromotionPoints(input: {
  month: string
  goal: string
  sellingPoints: string[]
  platforms: string[]
  servicePlanId: string
  marketEvents: any[]
}): PromotionPoint[] {
  const limit = input.servicePlanId === 'essential' ? 4 : 6
  const points = input.sellingPoints.slice(0, Math.min(limit, Math.max(3, input.sellingPoints.length)))
  const fallback = points.length ? points : ['招牌产品或核心服务', '到店理由', '真实信任内容']
  return fallback.map((sellingPoint, index) => ({
    id: `pp_${input.month.replace('-', '')}_${index + 1}`,
    goal: index === 0 ? input.goal : goalForPoint(sellingPoint),
    sellingPoint,
    customerAction: actionForPoint(sellingPoint),
    targetPlatforms: rotatePlatforms(input.platforms, index),
    requestedCandidateCount: input.servicePlanId === 'essential' ? 3 : 5,
    targetPublishWindow: { start: dateInMonth(input.month, 1 + index * 6), end: dateInMonth(input.month, 6 + index * 6) },
  }))
}

function buildQuarterlyThemes(calendar: any, category: string) {
  const events = Array.isArray(calendar.events) ? calendar.events : []
  return ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, index) => {
    const quarterEvents = events.filter((event: any) => Math.floor((Number(String(event.date).slice(5, 7)) - 1) / 3) === index)
    return {
      quarter,
      theme: quarterEvents[0]?.name ? `${quarterEvents[0].name} 前后的本地消费节点` : `${category} 的稳定到店转化`,
      keyCampaigns: quarterEvents.slice(0, 3).map((event: any) => event.name),
      reviewMetric: ['路线点击', '咨询数', '预约数', '到店反馈', '发布完成率'],
    }
  })
}

function buildCampaigns(calendar: any, month: string) {
  const events = Array.isArray(calendar.events) ? calendar.events : []
  return events
    .filter((event: any) => String(event.date || '').startsWith(`${month}-`))
    .slice(0, 4)
    .map((event: any) => ({
      campaignId: `campaign_${String(event.date).replaceAll('-', '')}`,
      name: event.name,
      date: event.date,
      campaignFit: event.merchant_category_fit || 'general',
      suggestedUse: '作为活动窗口或内容切入点，具体优惠和承接方式需商家确认。',
    }))
}

function buildAssetRequests(publicationDrafts: any[]) {
  return publicationDrafts.map((item) => ({
    requestId: `asset_${item.publicationId}`,
    sourcePublicationIds: [item.publicationId],
    assetType: item.contentFormat === 'short_video' ? 'video' : 'photo',
    description: (item.assetNeeds || []).join('；') || `补充 ${item.contentAngle} 所需素材`,
    requiredBy: item.backupPublishDate || item.plannedPublishDate,
    owner: '主理人/商家/拍摄',
    status: 'open',
  }))
}

export function serializePromotionStrategyKnowledge(value: any) {
  return {
    market: value?.market || '',
    district: value?.district || '',
    promotionFocus: value?.promotionFocus || '',
    audienceAssumptions: value?.audienceAssumptions || '',
    productAssumptions: value?.productAssumptions || '',
    brandTone: value?.brandTone || '',
    menuItems: Array.isArray(value?.menuItems) ? value.menuItems : [],
    stores: Array.isArray(value?.stores) ? value.stores : [],
  }
}

function splitSellingPoints(value: unknown) {
  const text = Array.isArray(value) ? value.join('\n') : String(value || '')
  return text
    .split(/[\n,，;；、]/)
    .map((item) => item.replace(/^(核心卖点|卖点|重点|主推)[:：]/, '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

function inferCategory(brand: any, knowledge: Record<string, any>) {
  const text = `${brand.description || ''} ${knowledge.productAssumptions || ''} ${knowledge.promotionFocus || ''}`.toLowerCase()
  if (/beauty|美容|美甲|hair|spa/.test(text)) return 'Beauty / Wellness'
  if (/retail|零售|shop|store/.test(text)) return 'Retail'
  return 'Restaurant / F&B'
}

function normalizeServicePlan(value: unknown) {
  const plan = String(value || '').trim().toLowerCase()
  return ['essential', 'booster'].includes(plan) ? plan : 'essential'
}

function normalizePlatforms(value: unknown) {
  const platforms = Array.isArray(value) ? value.map(stringValue).filter(Boolean) : []
  return platforms.length ? platforms : ['tiktok', 'instagram', 'google_business']
}

function rotatePlatforms(platforms: string[], index: number) {
  const first = platforms[index % platforms.length]
  return [first, ...platforms.filter((platform) => platform !== first)]
}

function normalizeMarket(value: string) {
  const text = value.trim().toLowerCase()
  if (!text || text.includes('singapore') || text === 'sg') return 'Singapore'
  if (text.includes('malaysia') || text === 'my') return 'Malaysia'
  if (text.includes('indonesia') || text === 'id') return 'Indonesia'
  return value.trim()
}

function normalizeMonth(value: unknown, now: Date) {
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}$/.test(text)) return text
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function dateInMonth(month: string, day: number) {
  const [year, monthText] = month.split('-').map(Number)
  const last = new Date(year, monthText, 0).getDate()
  return `${month}-${String(Math.min(last, Math.max(1, day))).padStart(2, '0')}`
}

function goalForPoint(value: string) {
  if (/套餐|优惠|活动|offer|promo/i.test(value)) return '把活动或套餐讲清楚，推动顾客咨询、预约或到店'
  if (/评价|案例|信任|老板|过程/i.test(value)) return '补强信任，让顾客更放心做决定'
  return '让顾客看懂本月主推卖点并产生行动'
}

function actionForPoint(value: string) {
  if (/套餐|优惠|活动|offer|promo/i.test(value)) return '发消息咨询、预约或到店报活动'
  if (/地址|路线|附近|门店/i.test(value)) return '点击路线或查看门店信息'
  return '收藏、发消息咨询或到店体验'
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
