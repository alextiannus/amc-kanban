'use client'

import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  X, ChevronLeft, Save,
  Settings, BookOpen, Loader2,
  RefreshCw, FileText, Store, Utensils,
  Edit3, Plus, Pin, Sparkles,
  Users, Goal, HelpCircle,
  MapPin, Music2, ExternalLink, WalletCards, Download
} from 'lucide-react'
import { motion } from 'framer-motion'
import type {
  BrandIdentityFieldKey,
  BrandIdentitySnapshot,
} from '@/lib/brandIdentity'
import { brandPlanEditorIdentityValues } from '@/lib/brandPlanEditorIdentity'
import { resolveInspirationCreativeId } from '@/lib/brand-plan/inspirationCreativeLink'
import { calendarCreativeErrorMessage } from '@/lib/brand-plan/errorMessages'
import {
  createSkuId,
  formatSkuPrice,
  normalizeSkuLibrary,
  serializeSkuLibraryItem,
  skuBadges,
  sortSkuLibrary,
  validateSkuLibrary,
  type SkuLibraryItem,
} from '@/lib/sku-library/service'
import { getPlanPublishingFreq } from '@/lib/subscription/catalog'

// ─── Types ────────────────────────────────────────────────────────────────────

import { BrandSettingsPanel } from './BrandSettingsPanel'

interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  address?: string | null
  autoPilot?: boolean
  logoUrl?: string | null
  phone?: string | null
  website?: string | null
}

type BrandUpdate = {
  id: string
  name: string
  location?: string
} & Record<string, unknown>

interface Props {
  brand?: Brand
  onUpdate?: (updated: BrandUpdate) => void
  onClose?: () => void
  brandTone?: string
  setBrandTone?: React.Dispatch<React.SetStateAction<string>>
  slangDict?: Record<string, string>
  setSlangDict?: React.Dispatch<React.SetStateAction<Record<string, string>>>
  subscriptionPlan?: string
  addons?: { veo3: boolean; dubco: boolean }
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void
  onOpenSettings?: () => void
  onOpenKnowledge?: () => void
  subscriptionHref?: string
}

type StoreInfo = {
  storeId: string
  name: string
  address: string
  timezone?: string
  latitude?: number | null
  longitude?: number | null
  googlePlaceId?: string
  isPrimary?: boolean
  status?: string
  phone?: string
  businessHours?: string
  reservationUrl?: string
  orderingUrl?: string
}

type ProductServiceItem = SkuLibraryItem

type StoreEntitlements = {
  storeLimit: number
  multiStoreAddonQuantity: number
}

type BrandPlanWorkspaceData = {
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
    reportHtmlPath?: string
    reportHtmlUrl?: string
    reportContent?: string
    reportMarkdown?: string
    pdfReportPath?: string
    pdfDownloadPath?: string
    pdfDownloadUrl?: string
    reportVersionId?: string
    reportTemplateVersion?: string
    viewerUrl?: string
    markdownDownloadPath?: string
    jsonDownloadPath?: string
    structuredReport?: Record<string, unknown>
    freshness?: Record<string, unknown>
    coverageScore?: number | null
    sourceCoverage?: Record<string, unknown>
    sourcePayload?: Record<string, unknown>
    brandImage: string
    marketingStatus?: string
    marketAnalysis: string
    competitors: string[]
    issues: string[]
    growthPoints: string[]
    missingQuestions: string[]
  }
  annualPlan?: {
    generatedAt: string
    planningStartMonth?: string
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
        targetAudience?: string
        customerAction: string
        platforms: string[]
        suggestedMonthlyPosts: number
      }>
      campaigns: string[]
      contentThemes: string[]
      monthlyFocus: Array<{ month: string; focus: string; promotionPoints: string[] }>
    }>
    metrics: string[]
    generationMode?: string
    llmProvider?: string
    llmModel?: string
    llmError?: string
    subscriptionStrategy?: {
      planId: string
      planName: string
      includedServices: string[]
      platformCoverage: string[]
      monthlyContentQuota: number
      publishingFreq: {
        postsPerDay?: number
        platforms?: Record<string, {
          postsPerDay?: number
          postsPerWeek?: number
          postsPerMonth?: number
          preferredHours?: number[]
        }>
      } | null
    }
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
  }>
  publishingCalendar?: {
    generatedAt: string
    months: Record<string, Array<{
      id?: string
      date: string
      title: string
      platform: string
      platformSlug?: string
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
      sampleVideoUrl?: string
      sampleOriginalUrl?: string
      sampleThumbnailUrl?: string
      sampleSourcePlatform?: string
      materialRequirements?: string[]
      contentLibraryGap?: string
      scriptSource?: 'inspiration' | 'generated_from_idea' | 'merchant'
      creativeMatchStatus?: 'matched' | 'no_candidate_after_retry'
      videoScript?: CalendarVideoScriptPayload
    }>>
  }
}

type MerchantInterviewRecord = {
  id: string
  completedAt: string
  answers: Array<{ question: string; answer: string }>
  summary: string
  rawNotes: string
}

type BrandSettings = Record<string, unknown> & {
  address?: string | null
  phone?: string | null
  website?: string | null
  logoUrl?: string | null
  postfastSyncedAt?: string | null
  accounts?: Array<{
    id: string
    platformId: string
    handle: string
    displayName?: string | null
    profileUrl?: string | null
    followerCount?: number | null
    ratingScore?: number | null
    autoPilot?: boolean
  }>
}

type SocialAccountSummary = NonNullable<BrandSettings['accounts']>[number]

type SubscriptionSummary = {
  planId?: string
  planName?: string
  contractStart?: string | null
  publishingFrequencyPlan?: {
    platforms?: Record<string, { postsPerMonth?: number }>
  } | null
}

type EditableAiContent =
  | { target: 'research_report'; title: string; value: NonNullable<BrandPlanWorkspaceData['researchReport']> }
  | { target: 'annual_plan'; title: string; value: NonNullable<BrandPlanWorkspaceData['annualPlan']> }
  | { target: 'quarter_plan'; title: string; value: NonNullable<NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number]> }
  | { target: 'calendar_month'; title: string; month: string; value: NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string] }

type EditableSocialAccount = SocialAccountSummary & {
  loginUsername?: string | null
  loginPassword?: string | null
}

type PublishingScheduleDraft = Record<string, number>

const PUBLISHING_PLATFORM_OPTIONS = [
  { slug: 'instagram', label: 'Instagram' },
  { slug: 'facebook', label: 'Facebook' },
  { slug: 'tiktok', label: 'TikTok' },
  { slug: 'google_business', label: 'Google Business' },
  { slug: 'xiaohongshu', label: '小红书' },
  { slug: 'youtube', label: 'YouTube' },
  { slug: 'twitter', label: 'Twitter / X' },
  { slug: 'meituan_dianping', label: 'Meituan Dianping' },
]

function defaultPublishingScheduleForPlan(planId?: string): PublishingScheduleDraft {
  const freq = planId ? getPlanPublishingFreq(planId) : null
  return Object.fromEntries(
    Object.entries(freq?.platforms || {}).map(([platform, config]) => [
      platform,
      Math.max(0, Math.floor(Number(config.postsPerMonth || 0))),
    ])
  )
}

function planIdFromLabel(value?: string) {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('booster')) return 'booster'
  if (normalized.includes('essential')) return 'essential'
  if (normalized.includes('starter')) return 'starter'
  return ''
}

function shouldIgnoreEditableSurfaceClick(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select, label'))
}

function publishingScheduleFromStrategy(strategy?: NonNullable<BrandPlanWorkspaceData['annualPlan']>['subscriptionStrategy']): PublishingScheduleDraft {
  const platforms = strategy?.publishingFreq?.platforms || {}
  const fromFreq = Object.fromEntries(
    Object.entries(platforms)
      .map(([platform, cfg]) => [normalizeSchedulePlatform(platform), Math.max(0, Math.floor(Number(cfg.postsPerMonth || 0)))])
      .filter(([, count]) => Number(count) > 0)
  ) as PublishingScheduleDraft
  return Object.keys(fromFreq).length
    ? fromFreq
    : defaultPublishingScheduleForPlan(strategy?.planId)
}

function normalizeSchedulePlatform(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'google' || normalized === 'google_business_profile' || normalized === 'google_my_business') return 'google_business'
  if (normalized === 'xhs' || normalized === 'little_red_book') return 'xiaohongshu'
  return normalized
}

function publishingScheduleTotal(schedule: PublishingScheduleDraft) {
  return Object.values(schedule).reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value || 0))), 0)
}

function publishingFreqPayload(schedule: PublishingScheduleDraft) {
  return {
    platforms: Object.fromEntries(
      Object.entries(schedule)
        .map(([platform, count]) => [normalizeSchedulePlatform(platform), Math.max(0, Math.floor(Number(count || 0)))])
        .filter(([, count]) => Number(count) > 0)
        .map(([platform, count]) => [platform, { postsPerMonth: count }])
    ),
  }
}

type CalendarVideoScript = {
  opening: string
  shots: string[]
  shotLabel: '分镜' | '建议'
  voiceover: string[]
  subtitles: string[]
  closing: string
}

type CalendarVideoScriptPayload = {
  opening?: string
  shots?: string[]
  voiceover?: string[]
  subtitles?: string[]
  closing?: string
  source?: 'inspiration' | 'generated_from_idea' | 'merchant'
}

function isCalendarVideoItem(item: { contentType?: string; platform?: string; platformSlug?: string; planning?: string }) {
  const textBlob = [
    item.contentType,
    item.platform,
    item.platformSlug,
    item.planning,
  ].join(' ').toLowerCase()
  return /视频|短视频|video|reel|tiktok/.test(textBlob)
}

function parseCalendarVideoScript(planning?: string): CalendarVideoScript {
  const lines = String(planning || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const script: CalendarVideoScript = {
    opening: '',
    shots: [],
    shotLabel: '分镜',
    voiceover: [],
    subtitles: [],
    closing: '',
  }
  let section: 'shots' | null = null
  for (const line of lines) {
    const timelineShots = extractTimelineShots(line)
    if (line.startsWith('开场：')) {
      script.opening = line.replace(/^开场：/, '').trim()
      section = null
      continue
    }
    if (line.startsWith('分镜脚本：') || line.startsWith('拍摄建议：')) {
      script.shotLabel = line.startsWith('拍摄建议：') ? '建议' : '分镜'
      const inline = line.replace(/^(分镜脚本|拍摄建议)：/, '').trim()
      if (inline) script.shots.push(...(extractTimelineShots(inline).length ? extractTimelineShots(inline) : splitScriptPieces(inline)))
      section = 'shots'
      continue
    }
    if (line.startsWith('口播方向：')) {
      script.voiceover = line
        .replace(/^口播方向：/, '')
        .split(/\s*\/\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
      section = null
      continue
    }
    if (line.startsWith('字幕方向：')) {
      script.subtitles = line
        .replace(/^字幕方向：/, '')
        .split(/\s*\/\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
      section = null
      continue
    }
    if (line.startsWith('收尾：')) {
      script.closing = line.replace(/^收尾：/, '').trim()
      section = null
      continue
    }
    if (section === 'shots' && /^\d+[.、]\s*/.test(line)) {
      script.shots.push(line.replace(/^\d+[.、]\s*/, '').trim())
      continue
    }
    if (timelineShots.length) {
      script.shots.push(...timelineShots)
    }
  }
  script.shots = Array.from(new Set(script.shots.map((shot) => shot.trim()).filter(Boolean)))
  return script
}

function calendarVideoScriptForItem(item: { planning?: string; scriptSource?: string; videoScript?: CalendarVideoScriptPayload }): CalendarVideoScript {
  if (!item.videoScript) return parseCalendarVideoScript(item.planning)
  return {
    opening: item.videoScript.opening || '',
    shots: Array.isArray(item.videoScript.shots) ? item.videoScript.shots.filter(Boolean) : [],
    shotLabel: item.videoScript.source === 'inspiration' || item.scriptSource === 'inspiration' ? '分镜' : '建议',
    voiceover: Array.isArray(item.videoScript.voiceover) ? item.videoScript.voiceover.filter(Boolean) : [],
    subtitles: Array.isArray(item.videoScript.subtitles) ? item.videoScript.subtitles.filter(Boolean) : [],
    closing: item.videoScript.closing || '',
  }
}

function extractTimelineShots(value: string) {
  const text = value.trim()
  if (!text) return []
  const matches = Array.from(text.matchAll(/(?:^|[\s。；;，,])((?:(?:\d{1,2}(?:-\d{1,2})?(?:秒|s))|(?:第?\d+镜)|(?:镜头\s*\d+)|(?:分镜\s*\d+))[:：][\s\S]*?)(?=(?:[\s。；;，,](?:(?:\d{1,2}(?:-\d{1,2})?(?:秒|s))|(?:第?\d+镜)|(?:镜头\s*\d+)|(?:分镜\s*\d+))[:：])|$)/gi))
  return matches
    .map((match) => match[1].replace(/[。；;，,\s]+$/, '').trim())
    .filter(Boolean)
}

function splitScriptPieces(value: string) {
  return value
    .split(/\s*(?:\n+|[；;]\s*|\s+\/\s+)\s*/)
    .map((item) => item.replace(/^\d+[.、]\s*/, '').trim())
    .filter(Boolean)
}

const CONTENT_PLANNING_LEAD_DAYS = 7

function formatLocalDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatLocalMonthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function minimumContentPlanDate() {
  const today = new Date()
  const minimum = new Date(today.getFullYear(), today.getMonth(), today.getDate() + CONTENT_PLANNING_LEAD_DAYS)
  return formatLocalDateValue(minimum)
}

function minimumContentPlanMonthValue() {
  const today = new Date()
  const fullMonthStart = new Date(today.getFullYear(), today.getMonth() + (today.getDate() <= 1 ? 0 : 1), 1)
  const fullMonth = formatLocalMonthValue(fullMonthStart)
  const leadMonth = minimumContentPlanDate().slice(0, 7)
  return fullMonth < leadMonth ? leadMonth : fullMonth
}

function firstSchedulableDateInMonth(month: string) {
  const minimumDate = minimumContentPlanDate()
  const monthStart = `${month}-01`
  return monthStart < minimumDate && month === minimumDate.slice(0, 7) ? minimumDate : monthStart
}

function firstCompleteNaturalMonthValue(dateValue?: string | null) {
  const source = dateValue ? new Date(dateValue) : new Date()
  const safeDate = Number.isNaN(source.getTime()) ? new Date() : source
  const monthOffset = safeDate.getDate() <= 1 ? 0 : 1
  const start = new Date(safeDate.getFullYear(), safeDate.getMonth() + monthOffset, 1)
  const naturalMonth = formatLocalMonthValue(start)
  const minimumMonth = minimumContentPlanMonthValue()
  return naturalMonth < minimumMonth ? minimumMonth : naturalMonth
}

function isMonthInPlan(month: string, plan: { startMonth?: string; endMonth?: string; quarter?: string }) {
  return Boolean(plan.startMonth && plan.endMonth && month >= plan.startMonth && month <= plan.endMonth)
}


function createStoreId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `store_${crypto.randomUUID()}`
  }
  return `store_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function brandPlanErrorMessage(error: unknown) {
  const calendarMessage = calendarCreativeErrorMessage(error)
  if (calendarMessage) return calendarMessage
  const response = error && typeof error === 'object' && !Array.isArray(error) ? error as Record<string, unknown> : {}
  const code = typeof error === 'string' ? error : typeof response.error === 'string' ? response.error : ''
  if (code === 'merchant_interview_required') return '请先填写并保存品牌主张访谈。'
  if (code === 'brand_plan_update_required') return '请先生成营销计划。'
  if (code === 'annual_plan_required') return '请先生成营销计划。'
  if (code === 'quarter_plan_required') return '请先补齐季度计划。'
  if (code === 'growth_research_report_required') return '请先完成客观数据调研报告 V3，再保存访谈记录。'
  if (code === 'growth_research_report_missing') return '客观数据调研任务已完成，但报告正文没有保存下来，请稍后重试。'
  if (code === 'growth_research_v3_missing') return 'Growth 已完成任务，但没有返回 V3 结构化报告，请稍后重试。'
  if (code === 'growth_research_still_running') return '客观数据调研报告 V3 还在整理，请稍后再看。'
  if (code === 'growth_research_failed') return '客观数据调研报告 V3 没有生成成功，请稍后重试。'
  if (code === 'growth_research_create_failed') return '客观数据调研没有启动成功，请稍后重试。'
  if (code.startsWith('marketing_plan_llm_failed')) return '营销计划没有生成成功，请检查模型配置后重试。'
  if (code === 'calendar_creative_review_llm_failed') return '内容创意审核没有生成成功，请检查模型配置后重试。'
  if (code === 'calendar_creative_review_rejected') return '内容创意审核认为部分灵感不适合直接使用，请补充素材或重新生成。'
  if (code === 'calendar_creative_candidate_missing') return '没有找到可用的内容创意候选，请先补充或重新同步 amc-content。'
  return code || '操作失败，请重试'
}

function statusDotClass(status: 'ready' | 'warning' | 'pending') {
  if (status === 'ready') return 'bg-emerald-500 shadow-emerald-500/30'
  if (status === 'warning') return 'bg-amber-400 shadow-amber-400/30'
  return 'bg-rose-500 shadow-rose-500/30'
}

function textLines(value: string) {
  return value
    .split(/\n+/)
    .map(item => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function quarterForMonthValue(month: string) {
  const monthNumber = Number(month.split('-')[1])
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) return 'Q1'
  return `Q${Math.floor((monthNumber - 1) / 3) + 1}`
}

function socialPlatformLabel(platformId: string) {
  const key = platformId.toLowerCase()
  const labels: Record<string, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    xhs: '小红书',
    xiaohongshu: '小红书',
    google: 'Google Map',
    google_maps: 'Google Map',
    google_business: 'Google Business',
    google_business_profile: 'Google Business',
    facebook: 'Facebook',
    fb: 'Facebook',
    yelp: 'Yelp',
  }
  return labels[key] || platformId
}

function socialPlatformLogo(platformId: string) {
  const key = platformId.toLowerCase()
  if (key.includes('instagram')) return <span className="text-[11px] font-black leading-none">IG</span>
  if (key.includes('tiktok')) return <Music2 className="h-4 w-4" />
  if (key.includes('google')) return <MapPin className="h-4 w-4" />
  if (key === 'facebook' || key === 'fb') return <span className="text-sm font-black leading-none">f</span>
  if (key === 'xhs' || key === 'xiaohongshu') return <span className="text-[11px] font-black leading-none">小红书</span>
  return <span className="text-xs font-black leading-none">{socialPlatformLabel(platformId).slice(0, 2)}</span>
}

function socialPlatformColor(platformId: string) {
  const key = platformId.toLowerCase()
  if (key.includes('instagram')) return 'bg-pink-50 text-pink-600 border-pink-100 dark:bg-pink-950/30 dark:text-pink-200 dark:border-pink-900'
  if (key.includes('tiktok')) return 'bg-slate-950 text-white border-slate-800 dark:bg-white dark:text-slate-950 dark:border-white'
  if (key.includes('google')) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900'
  if (key === 'xhs' || key === 'xiaohongshu') return 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900'
  if (key === 'facebook' || key === 'fb') return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900'
  return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
}

function calendarPlatformAccent(platformId: string) {
  const key = platformId.toLowerCase()
  if (key.includes('instagram')) return 'border-l-pink-500'
  if (key.includes('tiktok')) return 'border-l-slate-950 dark:border-l-white'
  if (key.includes('google')) return 'border-l-emerald-500'
  if (key === 'xhs' || key === 'xiaohongshu') return 'border-l-red-500'
  if (key === 'facebook' || key === 'fb') return 'border-l-blue-500'
  return 'border-l-slate-400'
}

// ─── Plan badge helper ────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const isActive = plan !== '未激活订阅'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
      isActive
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-slate-100 text-slate-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
      {plan}
    </span>
  )
}

export default function BrandProfileView(props: Props) {
  if (!props.brand?.id) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 text-center">
        <div className="max-w-sm">
          <Store className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-400">暂无选定品牌</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">请先在左上角切换或选择一个品牌进行代运营配置。</p>
        </div>
      </div>
    )
  }

  return <BrandProfileContent {...props} brand={props.brand} />
}

function BrandProfileContent({
  brand,
  onUpdate,
  onClose,
  brandTone,
  subscriptionPlan,
  showToast,
  onOpenSettings,
}: Props & { brand: Brand }) {
  const brandId = brand.id
  const growthResearchDownloadHref = `/api/brands/${encodeURIComponent(brandId)}/research-report`

  // Local Brand States (fetched on mount/change, used if props are not passed)
  const [localBrandTone, setLocalBrandTone] = useState('')
  const [localSubscriptionPlan, setLocalSubscriptionPlan] = useState('未激活订阅')
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary>({})
  const [storeEntitlements, setStoreEntitlements] = useState<StoreEntitlements>({ storeLimit: 1, multiStoreAddonQuantity: 0 })
  const [showSettings, setShowSettings] = useState(false)
  const [brandSettings, setBrandSettings] = useState<BrandSettings | null>(null)

  const [showContextModal, setShowContextModal] = useState(false)
  const [identitySnapshot, setIdentitySnapshot] = useState<BrandIdentitySnapshot | null>(null)
  const [postfastSyncing, setPostfastSyncing] = useState(false)
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [planEditorSaving, setPlanEditorSaving] = useState(false)
  const [editingSocialAccount, setEditingSocialAccount] = useState<EditableSocialAccount | null>(null)
  const [socialAccountSaving, setSocialAccountSaving] = useState(false)

  // Controlled vs Uncontrolled logic
  const activeBrandTone = brandTone !== undefined ? brandTone : localBrandTone
  const activeSubscriptionPlan = subscriptionPlan !== undefined ? subscriptionPlan : localSubscriptionPlan

  // Section 1: Brand Plan extras
  const [draftAudience, setDraftAudience] = useState('')
  const [draftProduct, setDraftProduct] = useState('')

  // Section 2: Business Info
  const [draftBusinessHours, setDraftBusinessHours] = useState('')
  const [draftReservationUrl, setDraftReservationUrl] = useState('')
  const [draftOrderingUrl, setDraftOrderingUrl] = useState('')
  const [draftStores, setDraftStores] = useState<StoreInfo[]>([])

  // Section 3: Knowledge Base
  const [draftMarket, setDraftMarket] = useState('')
  const [draftDistrict, setDraftDistrict] = useState('')
  const [draftMenuItems, setDraftMenuItems] = useState<ProductServiceItem[]>([])
  const [draftMenuText, setDraftMenuText] = useState('')
  const [draftCompetitorsText, setDraftCompetitorsText] = useState('')

  // Kanban-owned evergreen creative identity, separate from the marketing solution workspace.
  const [creativeIdentity, setCreativeIdentity] = useState({ brandVoice: '', brandImage: '', promotionFocus: '' })

  const [draftName, setDraftName] = useState(brand.name || '')
  const [draftDesc, setDraftDesc] = useState(brand.description || '')
  const [draftLocation, setDraftLocation] = useState(brand.location || '')
  const [draftAddress, setDraftAddress] = useState(brand.address || '')
  const [draftPhone, setDraftPhone] = useState(brand.phone || '')
  const [draftWebsite, setDraftWebsite] = useState(brand.website || '')

  // Logo upload
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(brand.logoUrl || null)

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToastVal = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (showToast) {
      showToast(message, type)
    } else {
      setToast({ message, type })
      setTimeout(() => setToast(null), type === 'error' ? 12000 : 3000)
    }
  }

  // Profile Markdown (embedded editor & growth parsing)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMarkdown, setProfileMarkdown] = useState('')
  const [brandPlanData, setBrandPlanData] = useState<BrandPlanWorkspaceData>({})
  const [publishingScheduleDraft, setPublishingScheduleDraft] = useState<PublishingScheduleDraft>({})
  const [publishingScheduleSaveState, setPublishingScheduleSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const publishingScheduleSaveReadyRef = useRef(false)
  const publishingScheduleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [merchantInterview, setMerchantInterview] = useState<MerchantInterviewRecord | null>(null)
  const [merchantInterviewRequired, setMerchantInterviewRequired] = useState(true)
  const [showResearchReport, setShowResearchReport] = useState(false)
  const [showInterviewReport, setShowInterviewReport] = useState(false)
  const [interviewDraftNotes, setInterviewDraftNotes] = useState('')
  const [editingAiContent, setEditingAiContent] = useState<EditableAiContent | null>(null)
  const [editingAiJson, setEditingAiJson] = useState('')
  const [planGenerating, setPlanGenerating] = useState<'research' | 'interview' | 'annual' | 'quarter' | 'calendar' | string | null>(null)
  const [annualGenerationStep, setAnnualGenerationStep] = useState('')
  const [planningStartMonth, setPlanningStartMonth] = useState(() => firstCompleteNaturalMonthValue())
  const [calendarGenerationProgress, setCalendarGenerationProgress] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    return firstCompleteNaturalMonthValue()
  })
  const [calendarPlatformFilter, setCalendarPlatformFilter] = useState('all')
  const planningStartMonthInitializedRef = useRef('')
  const calendarMonthInitializedRef = useRef('')

  useEffect(() => {
    const minimumMonth = minimumContentPlanMonthValue()
    if (calendarMonth < minimumMonth) setCalendarMonth(minimumMonth)
  }, [calendarMonth])

  useEffect(() => {
    const fromStrategy = publishingScheduleFromStrategy(brandPlanData.annualPlan?.subscriptionStrategy)
    const fromSubscription = publishingScheduleFromStrategy({
      planId: subscriptionSummary.planId || planIdFromLabel(activeSubscriptionPlan),
      planName: subscriptionSummary.planName || activeSubscriptionPlan,
      includedServices: [],
      platformCoverage: Object.keys(subscriptionSummary.publishingFrequencyPlan?.platforms || {}),
      monthlyContentQuota: 0,
      publishingFreq: subscriptionSummary.publishingFrequencyPlan || null,
    })
    publishingScheduleSaveReadyRef.current = false
    setPublishingScheduleSaveState('idle')
    setPublishingScheduleDraft(Object.keys(fromStrategy).length
      ? fromStrategy
      : Object.keys(fromSubscription).length
        ? fromSubscription
        : defaultPublishingScheduleForPlan(planIdFromLabel(activeSubscriptionPlan)))
  }, [brandId, brandPlanData.annualPlan?.subscriptionStrategy, activeSubscriptionPlan, subscriptionSummary])

  const loadProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile`)
      if (!res.ok) return
      const data = await res.json()
      const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
      setProfileMarkdown(markdown)
    } catch (e) {
      console.error('Failed to load brand profile markdown:', e)
    } finally {
      setProfileLoading(false)
    }
  }

  const loadIdentity = async () => {
    try {
      const res = await fetch(`/api/brands/${brandId}/identity`)
      if (!res.ok) throw new Error('无法读取品牌定位')
      const snapshot = await res.json() as BrandIdentitySnapshot
      setIdentitySnapshot(snapshot)

      // These fields are owned by /identity. In particular, Growth-backed edits may
      // live in the pending overlay before the legacy BrandKnowledge columns catch up.
      // Hydrating the editor from /knowledge made a successful save look empty again.
      const editorIdentity = brandPlanEditorIdentityValues(snapshot)
      setLocalBrandTone(editorIdentity.brandTone)
      setDraftAudience(editorIdentity.targetAudience)
      setDraftProduct(editorIdentity.sellingPointsText)
      setCreativeIdentity(editorIdentity.creativeIdentity)
    } catch (error) {
      console.error('Failed to load brand identity:', error)
      setIdentitySnapshot(null)
    } finally {
    }
  }


  const loadBrandPlanWorkspace = async () => {
    try {
      const res = await fetch(`/api/brands/${brandId}/brand-plan`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const marketingSolution = data.marketingSolution || data.brandPlan
      const workspace = marketingSolution && typeof marketingSolution === 'object' && !Array.isArray(marketingSolution)
        ? marketingSolution as BrandPlanWorkspaceData
        : {}
      setBrandPlanData(workspace)
      if (workspace.annualPlan?.planningStartMonth) {
        setPlanningStartMonth(workspace.annualPlan.planningStartMonth)
        planningStartMonthInitializedRef.current = brandId
      }
      setMerchantInterview(data.merchantInterview || null)
      setMerchantInterviewRequired(data.merchantInterviewRequired !== false)
    } catch (error) {
      console.error('Failed to load brand plan workspace:', error)
    }
  }

  const loadAllConfig = async () => {
    try {
      // Fire all 3 fetches in parallel
      const [resBrand, resKnowledge, resSub, resSku] = await Promise.all([
        fetch(`/api/brands/${brandId}`),
        fetch(`/api/brands/${brandId}/knowledge`),
        fetch(`/api/brands/${brandId}/subscription`),
        fetch(`/api/brands/${brandId}/sku-library`),
      ])

      // 1. Brand metadata
      if (resBrand.ok) {
        const dataBrand = await resBrand.json()
        setDraftName(dataBrand.name || '')
        setDraftDesc(dataBrand.description || '')
        setDraftLocation(dataBrand.location || '')
        setBrandSettings(dataBrand)
        setLogoPreview(dataBrand.logoUrl || null)
        setDraftAddress(dataBrand.address || '')
        setDraftPhone(dataBrand.phone || '')
        setDraftWebsite(dataBrand.website || '')
      } else {
        setDraftName(''); setDraftDesc(''); setDraftLocation('')
        setDraftAddress(''); setDraftPhone(''); setDraftWebsite('')
        setLogoPreview(null)
      }

      // 2. Brand knowledge
      if (resKnowledge.ok) {
        const k = await resKnowledge.json()
        if (typeof k.businessHours === 'string') setDraftBusinessHours(k.businessHours)
        else if (k.businessHours && typeof k.businessHours === 'object') setDraftBusinessHours(JSON.stringify(k.businessHours, null, 2))
        else setDraftBusinessHours('')
        setDraftReservationUrl(k.reservationUrl || '')
        setDraftOrderingUrl(k.orderingUrl || '')
        setDraftStores(Array.isArray(k.stores) ? k.stores : [])
        setDraftMarket(k.market || '')
        setDraftDistrict(k.district || '')
        setDraftCompetitorsText(Array.isArray(k.competitors) ? k.competitors.join('\n') : '')
      } else {
        setDraftBusinessHours(''); setDraftReservationUrl(''); setDraftOrderingUrl(''); setDraftStores([])
        setDraftMarket(''); setDraftDistrict('')
        setDraftMenuItems([])
        setDraftMenuText('')
        setDraftCompetitorsText('')
      }

      if (resSku.ok) {
        const sku = await resSku.json()
        const catalog = normalizeSkuLibrary(sku.items)
        setDraftMenuItems(catalog)
        setDraftMenuText(catalog.map(item => item.name).filter(Boolean).join('\n'))
      } else {
        setDraftMenuItems([])
        setDraftMenuText('')
      }

      // 3. Subscription
      if (resSub.ok) {
        const dataSub = await resSub.json()
        setLocalSubscriptionPlan(dataSub.plan_name === 'NONE' ? '未激活订阅' : dataSub.plan_name)
        setSubscriptionSummary({
          planId: dataSub.plan_id,
          planName: dataSub.plan_name,
          contractStart: dataSub.contract_start,
          publishingFrequencyPlan: dataSub.operations_strategy?.publishingFreq || dataSub.operations_strategy?.publishingFrequencyPlan || null,
        })
        if (dataSub.contract_start && calendarMonthInitializedRef.current !== brandId) {
          setCalendarMonth(firstCompleteNaturalMonthValue(dataSub.contract_start))
          calendarMonthInitializedRef.current = brandId
        }
        if (dataSub.contract_start && planningStartMonthInitializedRef.current !== brandId) {
          setPlanningStartMonth(firstCompleteNaturalMonthValue(dataSub.contract_start))
          planningStartMonthInitializedRef.current = brandId
        }
        setStoreEntitlements({
          storeLimit: typeof dataSub.store_limit === 'number' ? Math.max(1, dataSub.store_limit) : 1,
          multiStoreAddonQuantity: typeof dataSub.multi_store_addon_quantity === 'number' ? Math.max(0, dataSub.multi_store_addon_quantity) : 0,
        })
      }
    } catch (e) {
      console.error('Failed to load brand configuration:', e)
    }
  }

  useEffect(() => {
    void Promise.all([
      loadProfile(),
      loadAllConfig(),
      loadBrandPlanWorkspace(),
      loadIdentity(),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])


  const handleSaveProfile = async (nextMarkdown?: string) => {
    const markdown = (nextMarkdown ?? profileMarkdown).trim()
    if (!markdown) return

    setProfileSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      })
      if (!res.ok) {
        showToastVal('保存品牌 Profile 失败，请重试', 'error')
        return
      }
      const data = await res.json()
      const serverMarkdown = typeof data?.markdown === 'string' ? data.markdown : markdown
      setProfileMarkdown(serverMarkdown)
      showToastVal('品牌 Profile 已保存', 'success')
      if (data.brand && onUpdate) {
        onUpdate(data.brand)
      }
      await loadAllConfig()
    } catch (e) {
      console.error(e)
      showToastVal('保存品牌 Profile 失败，请检查网络', 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  const buildEditableBrandContextMarkdown = () => {
    const storeLines = draftStores.length
      ? draftStores
          .filter((s) => s.name || s.address)
          .map((s, index) => [
            `### ${s.name || `门店 ${index + 1}`}`,
            s.storeId ? `<!-- AMC:STORE_ID:${s.storeId} -->` : '',
            s.address ? `- 地址：${s.address}` : '',
            s.phone ? `- 电话：${s.phone}` : '',
            s.businessHours ? `- 营业时间：${s.businessHours}` : '',
            s.reservationUrl ? `- 订座链接：${s.reservationUrl}` : '',
            s.orderingUrl ? `- 下单链接：${s.orderingUrl}` : '',
          ].filter(Boolean).join('\n'))
          .join('\n\n')
      : [
          draftAddress ? `- 主门店地址：${draftAddress}` : '',
          draftPhone ? `- 联系电话：${draftPhone}` : '',
          draftWebsite ? `- 品牌网站：${draftWebsite}` : '',
          draftBusinessHours ? `- 营业时间：${draftBusinessHours}` : '',
          draftReservationUrl ? `- 订座链接：${draftReservationUrl}` : '',
          draftOrderingUrl ? `- 下单链接：${draftOrderingUrl}` : '',
        ].filter(Boolean).join('\n') || '（暂未填写）'

    return `# ${draftName || brand.name} 品牌上下文

## 品牌介绍
${draftDesc || '（暂未填写）'}

## 经营信息
${storeLines}
`
  }

  const openEditableBrandContext = () => {
    setProfileMarkdown(buildEditableBrandContextMarkdown())
    setShowContextModal(true)
  }

  const openPlanEditor = () => {
    if (!draftStores.length && (draftName || draftAddress || draftPhone || draftBusinessHours || draftReservationUrl || draftOrderingUrl)) {
      setDraftStores([{
        storeId: 'primary',
        name: draftName,
        address: draftAddress,
        phone: draftPhone,
        businessHours: draftBusinessHours,
        reservationUrl: draftReservationUrl,
        orderingUrl: draftOrderingUrl,
      }])
    }
    setShowPlanEditor(true)
  }

  const extractBlock = (markdownStr: string, startTag: string, endTag: string): string => {
    const startIdx = markdownStr.indexOf(startTag)
    const endIdx = markdownStr.indexOf(endTag)
    if (startIdx >= 0 && endIdx > startIdx) {
      return markdownStr.slice(startIdx + startTag.length, endIdx).trim()
    }
    return ''
  }

  // Helper to extract nested section blocks from growthContext markdown
  const extractSubBlock = (text: string, header: string): string => {
    const idx = text.indexOf(header)
    if (idx === -1) return ''
    const startIdx = idx + header.length
    const remaining = text.slice(startIdx)
    const nextHeadingIdx = remaining.search(/\n(###|##)\s/)
    if (nextHeadingIdx !== -1) {
      return remaining.slice(0, nextHeadingIdx).trim()
    }
    return remaining.trim()
  }

  // Parse brand plan sections from synced AMC-Growth markdown
  const brandStoryRaw = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:BRAND_STORY:START -->',
    '<!-- AMC:BRAND_PROFILE:BRAND_STORY:END -->'
  )
  const parsedBrandPositioning = extractSubBlock(brandStoryRaw, '### 12.3 品牌定位')

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setLogoPreview(previewUrl)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/brands/${brandId}/logo`, { method: 'POST', body: form })
      if (res.ok) {
        showToastVal('品牌 Logo 已更新', 'success')
      } else {
        showToastVal('Logo 上传失败', 'error')
      }
    } catch {
      showToastVal('Logo 上传失败', 'error')
    }
  }

  type BrandPlanActionResult = {
    brandPlan: BrandPlanWorkspaceData
    marketingSolution?: BrandPlanWorkspaceData
    calendarItem?: NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string][number]
    merchantInterview?: MerchantInterviewRecord | null
    merchantInterviewRequired?: boolean
  }

  const postBrandPlanAction = async (
    action: string,
    body: Record<string, unknown> = {}
  ) => {
    const res = await fetch(`/api/brands/${brandId}/brand-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToastVal(brandPlanErrorMessage(data), 'error')
      return null
    }
    return data as BrandPlanActionResult
  }

  const runBrandPlanAction = async (
    action: string,
    successMsg: string,
    body: Record<string, unknown> = {}
  ) => {
    const data = await postBrandPlanAction(action, body)
    if (!data) return null
    const marketingSolution = data.marketingSolution || data.brandPlan
    if (marketingSolution && typeof marketingSolution === 'object') {
      setBrandPlanData(marketingSolution)
    }
    setMerchantInterview(data.merchantInterview || null)
    setMerchantInterviewRequired(data.merchantInterviewRequired !== false)
    showToastVal(successMsg, 'success')
    await loadAllConfig()
    await loadIdentity()
    return data
  }

  useEffect(() => {
    if (!Object.keys(publishingScheduleDraft).length) return
    if (!publishingScheduleSaveReadyRef.current) {
      publishingScheduleSaveReadyRef.current = true
      return
    }
    if (publishingScheduleSaveTimerRef.current) clearTimeout(publishingScheduleSaveTimerRef.current)
    setPublishingScheduleSaveState('saving')
    publishingScheduleSaveTimerRef.current = setTimeout(async () => {
      const data = await postBrandPlanAction('save_workspace_patch', {
        target: 'publishing_freq',
        value: publishingFreqPayload(publishingScheduleDraft),
      })
      if (!data) {
        setPublishingScheduleSaveState('error')
        return
      }
      const marketingSolution = data.marketingSolution || data.brandPlan
      if (marketingSolution && typeof marketingSolution === 'object') {
        setBrandPlanData(marketingSolution)
      }
      setPublishingScheduleSaveState('saved')
    }, 600)
    return () => {
      if (publishingScheduleSaveTimerRef.current) clearTimeout(publishingScheduleSaveTimerRef.current)
    }
  }, [publishingScheduleDraft, brandId])

  const openAiContentEditor = (content: EditableAiContent) => {
    setEditingAiContent(content)
    setEditingAiJson(JSON.stringify(content.value, null, 2))
  }

  const handleSaveAiContent = async () => {
    if (!editingAiContent) return
    let value: unknown
    try {
      value = JSON.parse(editingAiJson)
    } catch {
      showToastVal('JSON 格式不正确，请检查逗号和引号。', 'error')
      return
    }
    setPlanGenerating(`edit:${editingAiContent.target}`)
    try {
      const body: Record<string, unknown> = {
        target: editingAiContent.target,
        value,
      }
      if (editingAiContent.target === 'calendar_month') body.month = editingAiContent.month
      const data = await runBrandPlanAction('save_workspace_patch', '已保存并回写当前版本', body)
      if (data) setEditingAiContent(null)
    } finally {
      setPlanGenerating(null)
    }
  }

  const updateEditingAnnualPlan = (
    updater: (draft: NonNullable<BrandPlanWorkspaceData['annualPlan']>) => NonNullable<BrandPlanWorkspaceData['annualPlan']>
  ) => {
    setEditingAiJson(current => {
      const draft = parseAnnualPlanDraft(current)
      if (!draft) return current
      return JSON.stringify(updater(draft), null, 2)
    })
  }

  const saveIdentityField = async (field: BrandIdentityFieldKey, value: unknown) => {
    const current = identityField(field)
    const res = await fetch(`/api/brands/${brandId}/identity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field,
        value,
        expectedVersion: current?.version ?? 0,
      }),
    })
    if (!res.ok && res.status !== 202) {
      const data = await res.json().catch(() => ({}))
      throw new Error(typeof data?.error === 'string' ? data.error : `identity_save_failed:${field}`)
    }
  }

  const handleSavePlanEditor = async () => {
    setPlanEditorSaving(true)
    try {
      const normalizedStores = draftStores
        .map(store => ({
          ...store,
          name: String(store.name || '').trim(),
          address: String(store.address || '').trim(),
          phone: String(store.phone || '').trim(),
          businessHours: String(store.businessHours || '').trim(),
          reservationUrl: String(store.reservationUrl || '').trim(),
          orderingUrl: String(store.orderingUrl || '').trim(),
        }))
        .filter(store => store.name || store.address || store.phone || store.businessHours || store.reservationUrl || store.orderingUrl)
      const menuItems = draftMenuItems.length
        ? draftMenuItems.map(serializeSkuLibraryItem).filter(item => item.name)
        : textLines(draftMenuText).map(name => serializeSkuLibraryItem({ id: createSkuId(), type: 'single', name }))
      const skuIssues = validateSkuLibrary(menuItems)
      if (skuIssues.length) {
        showToastVal(`${skuIssues[0].message}，请将名称、价格、人数和卖点分别填写`, 'error')
        return
      }
      const settingsRes = await fetch(`/api/brands/${brandId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          description: draftDesc,
          location: draftLocation,
          address: draftAddress,
          phone: draftPhone,
          website: draftWebsite,
        }),
      })
      if (!settingsRes.ok) throw new Error('brand_settings_save_failed')

      const knowledgeRes = await fetch(`/api/brands/${brandId}/knowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessHours: draftBusinessHours,
          reservationUrl: draftReservationUrl,
          orderingUrl: draftOrderingUrl,
          stores: normalizedStores,
          market: draftMarket,
          district: draftDistrict,
          competitors: textLines(draftCompetitorsText),
        }),
      })
      if (!knowledgeRes.ok) throw new Error('brand_knowledge_save_failed')

      const skuRes = await fetch(`/api/brands/${brandId}/sku-library`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: menuItems }),
      })
      if (!skuRes.ok) throw new Error('sku_library_save_failed')

      const sellingPoints = textLines(draftProduct)
      const identitySaves: Array<Promise<void>> = [
        saveIdentityField('brandVoice', creativeIdentity.brandVoice),
        saveIdentityField('brandImage', creativeIdentity.brandImage),
        saveIdentityField('promotionFocus', creativeIdentity.promotionFocus),
      ]
      if (activeBrandTone.trim()) identitySaves.push(saveIdentityField('brandTone', activeBrandTone))
      if (draftAudience.trim()) identitySaves.push(saveIdentityField('targetAudience', draftAudience))
      if (sellingPoints.length) identitySaves.push(saveIdentityField('sellingPoints', sellingPoints))
      await Promise.all(identitySaves)

      showToastVal('品牌策划内容已保存', 'success')
      setShowPlanEditor(false)
      await loadProfile()
      await loadAllConfig()
      await loadIdentity()
      await loadBrandPlanWorkspace()
    } catch (error) {
      console.error('Failed to save brand plan editor:', error)
      showToastVal('保存失败，请检查字段后重试', 'error')
    } finally {
      setPlanEditorSaving(false)
    }
  }

  const updateDraftStore = (index: number, patch: Partial<StoreInfo>) => {
    setDraftStores(current => current.map((store, itemIndex) => itemIndex === index ? { ...store, ...patch } : store))
  }

  const removeDraftStore = (index: number) => {
    setDraftStores(current => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const addProductServiceItem = (type: ProductServiceItem['type'] = 'single') => {
    setDraftMenuItems(current => [
      ...current,
      {
        id: createSkuId(),
        type,
        name: '',
        currency: 'S$',
        price: '',
        description: '',
        tags: [],
      },
    ])
  }

  const updateProductServiceItem = (index: number, patch: Partial<ProductServiceItem>) => {
    setDraftMenuItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  const removeProductServiceItem = (index: number) => {
    setDraftMenuItems(current => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleSaveSocialAccount = async () => {
    if (!editingSocialAccount) return
    setSocialAccountSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/accounts/${editingSocialAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: editingSocialAccount.handle,
          displayName: editingSocialAccount.displayName,
          profileUrl: editingSocialAccount.profileUrl,
          autoPilot: editingSocialAccount.autoPilot,
        }),
      })
      if (!res.ok) throw new Error('social_account_save_failed')
      showToastVal('社交媒体账号已保存', 'success')
      setEditingSocialAccount(null)
      await loadAllConfig()
    } catch (error) {
      console.error('Failed to save social account:', error)
      showToastVal('社交媒体账号保存失败', 'error')
    } finally {
      setSocialAccountSaving(false)
    }
  }

  const primaryProductList = () => {
    const menuProducts = priorityMenuItems.map((item) => String(item?.name || '').trim()).filter(Boolean)
    if (menuProducts.length) return menuProducts.slice(0, 4)
    const sellingPoints = identityList('sellingPoints', [])
    if (sellingPoints.length) return sellingPoints.slice(0, 4)
    return (draftProduct || creativeIdentity.promotionFocus || draftDesc)
      .split(/[\n,，;；、]/)
      .map(item => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 4)
  }

  const handleGenerateResearchReport = async () => {
    setPlanGenerating('research')
    try {
      const nextPlan = await runBrandPlanAction('generate_research_report', '客观数据调研报告 V3 已生成')
      if ((nextPlan?.marketingSolution || nextPlan?.brandPlan)?.researchReport) setShowResearchReport(true)
      await loadBrandPlanWorkspace()
    } finally {
      setPlanGenerating(null)
    }
  }

  const handleGenerateInterviewReport = async () => {
    if (!interviewDraftNotes.trim()) {
      showToastVal('请先填写访谈记录，再保存。', 'info')
      return
    }
    setPlanGenerating('interview')
    try {
      const nextPlan = await runBrandPlanAction('save_merchant_interview', '品牌主张访谈已保存', {
        rawNotes: interviewDraftNotes,
        summary: '主理人已记录商家主张，可用于后续营销计划。',
      })
      if (nextPlan?.merchantInterview) setShowInterviewReport(true)
    } finally {
      setPlanGenerating(null)
    }
  }

  const openMerchantInterviewPanel = () => {
    setInterviewDraftNotes(interview?.rawNotes || interview?.answers?.map(item => `${item.question}\n${item.answer}`).join('\n\n') || '')
    setShowInterviewReport(true)
  }

  const handleGenerateAnnualPlan = async () => {
    setPlanGenerating('annual')
    setAnnualGenerationStep('正在生成整体策略')
    const generationBody = { planningStartMonth }
    try {
      const strategyResult = await runBrandPlanAction('generate_annual_strategy', '整体策略已生成', generationBody)
      if (!strategyResult) return
      await loadBrandPlanWorkspace()
      for (let index = 0; index < 4; index += 1) {
        setAnnualGenerationStep(`正在生成第 ${index + 1} 个季度计划`)
        const result = await runBrandPlanAction('generate_next_quarter_plan', `第 ${index + 1} 个季度计划已生成`, generationBody)
        if (!result) return
        await loadBrandPlanWorkspace()
      }
      showToastVal('营销计划已生成', 'success')
    } finally {
      setPlanGenerating(null)
      setAnnualGenerationStep('')
    }
  }

  const addMonths = (month: string, offset: number) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const date = new Date(year, monthNumber - 1 + offset, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  const handleGeneratePublishingCalendar = async () => {
    if (publishingScheduleTotal(publishingScheduleDraft) < 1) {
      showToastVal('请至少保留 1 条月度发布内容。', 'info')
      return
    }
    const minimumMonth = minimumContentPlanMonthValue()
    if (calendarMonth < minimumMonth) {
      setCalendarMonth(minimumMonth)
      showToastVal(`内容计划需至少提前 ${CONTENT_PLANNING_LEAD_DAYS} 天安排，已切换到可排期月份。`, 'info')
      return
    }
    setPlanGenerating('calendar')
    setCalendarGenerationProgress('')
    try {
      const publishingFreqOverride = publishingFreqPayload(publishingScheduleDraft)
      const total = publishingScheduleTotal(publishingScheduleDraft)
      const confirmedItems = currentCalendarItems.filter(item => item.status === '已确认')
      let visibleItems = [...confirmedItems]
      const applyVisibleItems = (items: NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]) => {
        setBrandPlanData(current => ({
          ...current,
          publishingCalendar: {
            generatedAt: current.publishingCalendar?.generatedAt || new Date().toISOString(),
            generationMode: 'AMC_CONTENT_ASSISTED',
            months: {
              ...(current.publishingCalendar?.months || {}),
              [calendarMonth]: items,
            },
          },
        }))
      }
      applyVisibleItems(visibleItems)
      await postBrandPlanAction('save_workspace_patch', {
        target: 'calendar_month',
        month: calendarMonth,
        value: visibleItems,
      })
      let failedCount = 0
      for (let index = 0; index < total; index += 1) {
        setCalendarGenerationProgress(`正在生成第 ${index + 1} / ${total} 条`)
        const data = await postBrandPlanAction('generate_publishing_calendar_item', {
          month: calendarMonth,
          itemIndex: index,
          publishingFreqOverride,
          usedCreativeIds: visibleItems.map(item => item.inspirationCreativeId || resolveInspirationCreativeId(item)).filter(Boolean),
        })
        if (!data?.calendarItem) {
          failedCount += 1
          continue
        }
        if (confirmedItems.some(item => item.id === data.calendarItem?.id)) continue
        visibleItems = [
          ...visibleItems.filter(item => item.id !== data.calendarItem?.id),
          data.calendarItem,
        ]
        applyVisibleItems(visibleItems)
      }
      await runBrandPlanAction('save_workspace_patch', '内容计划已生成', {
        target: 'calendar_month',
        month: calendarMonth,
        value: visibleItems,
      })
      await loadBrandPlanWorkspace()
      if (failedCount) showToastVal(`内容计划已生成，${failedCount} 条暂未生成成功。`, 'info')
    } finally {
      setPlanGenerating(null)
      setCalendarGenerationProgress('')
    }
  }

  const handleRegenerateCalendarItem = async (itemId?: string) => {
    if (!itemId) return
    const loadingKey = `calendar_item:${itemId}`
    setPlanGenerating(loadingKey)
    try {
      await runBrandPlanAction('regenerate_calendar_item', '该条发布创意已重新生成', { month: calendarMonth, itemId })
      await loadBrandPlanWorkspace()
    } finally {
      setPlanGenerating(null)
    }
  }

  const handleRewriteCalendarItemDetails = async (
    item: NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string][number],
    index: number
  ) => {
    if (!item?.id) return
    const loadingKey = `calendar_rewrite:${item.id}`
    setPlanGenerating(loadingKey)
    try {
      const data = await postBrandPlanAction('rewrite_calendar_item_details', {
        month: calendarMonth,
        item,
      })
      if (!data?.calendarItem) return
      handleUpdateCalendarItem(item.id, index, data.calendarItem)
      showToastVal('已根据内容创意重写详情', 'success')
    } finally {
      setPlanGenerating(null)
    }
  }

  const updateCalendarMonthItems = (
    updater: (items: NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]) => NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string]
  ) => {
    setBrandPlanData((current) => {
      const existing = current.publishingCalendar?.months?.[calendarMonth] || []
      const nextItems = updater(existing)
      return {
        ...current,
        publishingCalendar: {
          generatedAt: current.publishingCalendar?.generatedAt || new Date().toISOString(),
          months: {
            ...(current.publishingCalendar?.months || {}),
            [calendarMonth]: nextItems,
          },
        },
      }
    })
  }

  const handleAddCalendarItem = () => {
    const minimumMonth = minimumContentPlanMonthValue()
    if (calendarMonth < minimumMonth) {
      setCalendarMonth(minimumMonth)
      showToastVal(`内容计划需至少提前 ${CONTENT_PLANNING_LEAD_DAYS} 天安排，已切换到可排期月份。`, 'info')
      return
    }
    const platform = activePublishingPlatforms[0] || PUBLISHING_PLATFORM_OPTIONS[0]
    updateCalendarMonthItems((items) => [
      ...items,
      {
        id: `${calendarMonth}-manual-${Date.now()}`,
        date: firstSchedulableDateInMonth(calendarMonth),
        title: '新增内容策划',
        platform: platform.label,
        platformSlug: platform.slug,
        contentType: '图文',
        product: '待填写推广点',
        planning: '写清楚拍什么、怎么拍、发布后要引导顾客做什么。',
        sampleHit: '',
        status: '待确认',
        matchedTags: [],
        matchedInspirations: [],
        materialRequirements: [],
      },
    ])
  }

  const handleUpdateCalendarItem = (
    itemId: string | undefined,
    index: number,
    patch: Record<string, unknown>
  ) => {
    updateCalendarMonthItems((items) => items.map((item, itemIndex) =>
      (item.id && item.id === itemId) || itemIndex === index
        ? { ...item, ...patch }
        : item
    ))
  }

  const handleDeleteCalendarItem = (itemId: string | undefined, index: number) => {
    updateCalendarMonthItems((items) => items.filter((item, itemIndex) =>
      !((item.id && item.id === itemId) || itemIndex === index)
    ))
  }

  const handleSaveCalendarMonth = async () => {
    setPlanGenerating('calendar_save')
    try {
      await runBrandPlanAction('save_workspace_patch', '内容计划已保存', {
        target: 'calendar_month',
        month: calendarMonth,
        value: currentCalendarItems,
      })
      await loadBrandPlanWorkspace()
    } finally {
      setPlanGenerating(null)
    }
  }

  const handleDownloadMaterialRequirements = () => {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const rows = currentCalendarItems
      .slice()
      .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')))
      .map((item, index) => {
        const videoScript = calendarVideoScriptForItem(item)
        const sourceUrl = item.sampleVideoUrl || item.sampleOriginalUrl || ''
        const sourceTitle = item.inspirationSourceTitle || item.sampleSourcePlatform || ''
        const videoScriptHtml = isCalendarVideoItem(item) && (videoScript.opening || videoScript.shots.length || videoScript.voiceover.length || videoScript.subtitles.length || videoScript.closing)
          ? `
            <div class="script">
              <p><strong>视频分镜与脚本：</strong></p>
              ${sourceTitle ? `<p><span>原创意：</span>${escapeHtml(sourceTitle)}</p>` : ''}
              ${item.inspirationSourceSummary ? `<p><span>参考重点：</span>${escapeHtml(item.inspirationSourceSummary)}</p>` : ''}
              ${sourceUrl ? `<p><span>来源：</span><a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a></p>` : ''}
              ${videoScript.opening ? `<p><span>开场：</span>${escapeHtml(videoScript.opening)}</p>` : ''}
              ${videoScript.shots.length ? `<ol>${videoScript.shots.map((shot) => `<li>${escapeHtml(shot)}</li>`).join('')}</ol>` : ''}
              ${videoScript.voiceover.length ? `<p><span>口播：</span>${escapeHtml(videoScript.voiceover.join(' / '))}</p>` : ''}
              ${videoScript.subtitles.length ? `<p><span>字幕：</span>${escapeHtml(videoScript.subtitles.join(' / '))}</p>` : ''}
              ${videoScript.closing ? `<p><span>收尾：</span>${escapeHtml(videoScript.closing)}</p>` : ''}
            </div>
          `
          : ''
        const shotRequirements = videoScript.shots.map((shot, shotIndex) => `${videoScript.shotLabel} ${shotIndex + 1}：${shot}`)
        const requirementLines = item.materialRequirements?.length
          ? [...item.materialRequirements, ...shotRequirements]
          : shotRequirements.length
            ? shotRequirements
            : [item.planning || '请按创意说明采集可用于发布的图片或视频素材。']
        const requirements = requirementLines.length
          ? requirementLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
          : `<li>${escapeHtml(item.planning || '请按创意说明采集可用于发布的图片或视频素材。')}</li>`
        return `
          <section class="creative">
            <div class="meta">#${index + 1} · ${escapeHtml(item.date)} · ${escapeHtml(item.platform || item.platformSlug)} · ${escapeHtml(item.contentType)}</div>
            <h2>${escapeHtml(item.title || '内容创意')}</h2>
            <p><strong>主题：</strong>${escapeHtml(item.product || '待填写')}</p>
            <p><strong>创意说明：</strong>${escapeHtml(item.planning || '待填写')}</p>
            ${videoScriptHtml}
            <p><strong>素材需求：</strong></p>
            <ul>${requirements}</ul>
          </section>
        `
      }).join('')
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(calendarMonth)} 素材采集需求</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #111827; line-height: 1.55; }
    header { border-bottom: 2px solid #111827; margin-bottom: 20px; padding-bottom: 12px; }
    h1 { font-size: 24px; margin: 0 0 6px; }
    .sub { color: #475569; font-size: 13px; }
    .creative { break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 0 0 14px; }
    .meta { color: #be123c; font-size: 12px; font-weight: 700; margin-bottom: 6px; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    p { margin: 6px 0; }
    .script { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 10px 0; padding: 10px 12px; }
    .script span { color: #475569; font-weight: 700; }
    ol { margin: 6px 0 0 20px; padding: 0; }
    ul { margin: 6px 0 0 20px; padding: 0; }
    li { margin: 4px 0; white-space: pre-wrap; }
    @media print { body { margin: 18mm; } .creative { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(brand?.name || '品牌')} ${escapeHtml(calendarMonth)} 素材采集需求</h1>
    <div class="sub">按内容创意整理，共 ${currentCalendarItems.length} 条。采集完成后可在素材库选择对应创意上传。</div>
  </header>
  ${rows || '<p>这个月份暂无内容创意。</p>'}
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${brand?.name || 'brand'}-${calendarMonth}-素材采集需求.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      setShowSettings(true)
    }
  }

  const storeSlotCount = Math.max(draftStores.length, draftAddress.trim() ? 1 : 0)
  const configuredStoreCount = Math.max(draftStores.filter((store) => store.name || store.address).length, draftAddress.trim() ? 1 : 0)
  const storeLimit = storeEntitlements.storeLimit
  const storeLimitText = `${configuredStoreCount}/${storeLimit}`
  const priorityMenuItems = sortSkuLibrary(draftMenuItems)
  const handleAddStore = () => {
    if (storeSlotCount >= storeLimit) {
      showToastVal(`当前套餐最多支持 ${storeLimit} 家门店。请先购买多门店支持后再添加。`, 'info')
      return
    }
    const currentStores = draftStores.length
      ? draftStores
      : [{
          storeId: 'primary',
          name: draftName,
          address: draftAddress,
          phone: draftPhone,
          businessHours: draftBusinessHours,
          reservationUrl: draftReservationUrl,
          orderingUrl: draftOrderingUrl,
        }]
    setDraftStores([...currentStores, { storeId: createStoreId(), name: '', address: '' }])
    setShowPlanEditor(true)
  }

  const handleSyncPostfastAccounts = async () => {
    if (postfastSyncing) return
    setPostfastSyncing(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/sync-postfast`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToastVal(data?.error || 'PostFast 账号同步失败，请检查 API Key 配置。', 'error')
        return
      }
      showToastVal(`已从 PostFast 同步 ${data.accountCount ?? 0} 个社交媒体账号`, 'success')
      await loadAllConfig()
    } catch (error) {
      console.error('Failed to sync PostFast accounts:', error)
      showToastVal('PostFast 账号同步失败，请稍后重试。', 'error')
    } finally {
      setPostfastSyncing(false)
    }
  }
  const identityField = (field: BrandIdentityFieldKey) => identitySnapshot?.fields[field]
  const identityText = (field: BrandIdentityFieldKey, fallback = '') => {
    const value = identityField(field)?.value
    return typeof value === 'string' ? value : fallback
  }
  const identityList = (field: BrandIdentityFieldKey, fallback: string[] = []) => {
    const value = identityField(field)?.value
    return Array.isArray(value) ? value : fallback
  }
  const report = brandPlanData.researchReport
  const growthResearchReportHref = `/dashboard/brands/${encodeURIComponent(brandId)}/research-report`
  const growthReportMarkdown = report?.reportMarkdown || report?.reportContent || ''
  const interview = merchantInterview
  const annualPlan = brandPlanData.annualPlan
  const editingAnnualPlanDraft = editingAiContent?.target === 'annual_plan' ? parseAnnualPlanDraft(editingAiJson) : null
  const brandPlanUpdated = Boolean(brandPlanData.researchReport || merchantInterview)
  const selectedCalendarQuarter = quarterForMonthValue(calendarMonth)
  const annualQuarterPlans = Array.isArray(annualPlan?.quarterlyPlans) ? annualPlan.quarterlyPlans : []
  const currentAnnualQuarterPlan = annualQuarterPlans.find(item => isMonthInPlan(calendarMonth, item))
    || annualQuarterPlans.find(item => item.quarter === selectedCalendarQuarter)
  const currentQuarterPlan = Array.isArray(brandPlanData.quarterlyPlans)
    ? brandPlanData.quarterlyPlans.find(item => isMonthInPlan(calendarMonth, item))
      || brandPlanData.quarterlyPlans.find(item => item.quarter === selectedCalendarQuarter)
    : undefined
  const calendarQuarterReady = Boolean(currentQuarterPlan || currentAnnualQuarterPlan)
  const minimumCalendarDate = minimumContentPlanDate()
  const minimumCalendarMonth = minimumContentPlanMonthValue()
  const canGoPreviousCalendarMonth = addMonths(calendarMonth, -1) >= minimumCalendarMonth
  const currentCalendarItems = brandPlanData.publishingCalendar?.months?.[calendarMonth] || []
  const currentCalendarItemsWithIndex = currentCalendarItems.map((item, index) => ({ item, index }))
  const calendarPlatformCounts = currentCalendarItems.reduce<Record<string, number>>((acc, item) => {
    const slug = normalizeSchedulePlatform(item.platformSlug || item.platform || '')
    acc[slug] = (acc[slug] || 0) + 1
    return acc
  }, {})
  const calendarFilterPlatforms = PUBLISHING_PLATFORM_OPTIONS.filter((platform) => calendarPlatformCounts[platform.slug])
  const filteredCalendarItems = calendarPlatformFilter === 'all'
    ? currentCalendarItemsWithIndex
    : currentCalendarItemsWithIndex.filter(({ item }) => normalizeSchedulePlatform(item.platformSlug || item.platform || '') === calendarPlatformFilter)
  const activePublishingPlatforms = PUBLISHING_PLATFORM_OPTIONS.filter((platform) =>
    publishingScheduleDraft[platform.slug] !== undefined ||
    annualPlan?.subscriptionStrategy?.platformCoverage?.includes(platform.slug)
  )
  const publishingScheduleCount = publishingScheduleTotal(publishingScheduleDraft)
  const socialAccounts: SocialAccountSummary[] = Array.isArray(brandSettings?.accounts) ? brandSettings.accounts : []
  const postfastSyncedAt = typeof brandSettings?.postfastSyncedAt === 'string' ? brandSettings.postfastSyncedAt : null
  const sourceStatusItems = [
    { label: '客观数据调研', value: report ? '已完成' : '待完成', status: report ? 'ready' : 'pending' },
    { label: '社交媒体渠道', value: socialAccounts.length ? `${socialAccounts.length} 个账号` : '待同步', status: socialAccounts.length ? 'ready' : 'pending' },
    { label: '品牌主张', value: merchantInterviewRequired ? '需完成' : '已记录', status: merchantInterviewRequired ? 'pending' : 'ready' },
    { label: '计划资料', value: brandPlanUpdated ? '可用' : '待补', status: brandPlanUpdated ? 'ready' : 'warning' },
    { label: '营销计划', value: annualPlan ? (annualQuarterPlans.length ? `${annualQuarterPlans.length}季` : '已完成') : '待生成', status: annualPlan ? 'ready' : 'pending' },
    { label: '内容计划', value: currentCalendarItems.length ? `${currentCalendarItems.length} 条` : '待生成', status: currentCalendarItems.length ? 'ready' : 'pending' },
  ]

  const reportModal = showResearchReport && (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => setShowResearchReport(false)} />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">客观数据调研报告 V3</h3>
            <p className="mt-1 text-xs text-slate-400">{report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : '尚未生成'}</p>
          </div>
          <button type="button" onClick={() => setShowResearchReport(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          {report?.sourceSystem === 'amc-growth' ? (
            <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
              <p className="font-black">AMC-Growth 报告</p>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <span>Job: {report.growthJobId || '未记录'}</span>
                <span>Tier: {report.reportTier || '未记录'}</span>
                <span className="sm:col-span-2">Path: {report.reportPath || '未记录'}</span>
                <span className="sm:col-span-2">PDF: {report.pdfDownloadPath || report.pdfReportPath || '未记录'}</span>
                {typeof report.coverageScore === 'number' ? <span>Coverage: {report.coverageScore}</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(report.pdfDownloadPath || report.pdfReportPath) ? (
                  <a href={`${growthResearchDownloadHref}?format=pdf`} className="inline-flex rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white">下载 PDF</a>
                ) : null}
                <a href={`${growthResearchDownloadHref}?format=markdown`} className="inline-flex rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-[11px] font-black text-blue-700">下载 Markdown</a>
                {report.structuredReport ? (
                  <a href={`${growthResearchDownloadHref}?format=json`} className="inline-flex rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-[11px] font-black text-blue-700">下载 JSON</a>
                ) : null}
              </div>
            </section>
          ) : null}
          {growthReportMarkdown ? (
            <section>
              <h4 className="mb-2 text-xs font-black text-slate-500">AMC-Growth Markdown 报告正文</h4>
              <pre className="max-h-[70vh] whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{growthReportMarkdown}</pre>
            </section>
          ) : (
            <>
              <p className="rounded-xl bg-slate-50 p-4 text-slate-700 dark:bg-slate-950 dark:text-slate-200">{report?.summary || '暂无报告。'}</p>
              {[
                ['数据来源', report?.dataSources || []],
                ['竞品情况', report?.competitors || []],
                ['问题发现', report?.issues || []],
                ['增长点发现', report?.growthPoints || []],
                ['需要老板确认', report?.missingQuestions || []],
              ].map(([title, items]) => (
                <section key={title as string}>
                  <h4 className="mb-2 text-xs font-black text-slate-500">{title as string}</h4>
                  <ul className="space-y-2">
                    {(items as string[]).length ? (items as string[]).map(item => <li key={item} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">{item}</li>) : <li className="text-xs text-slate-400">暂无</li>}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )

  const interviewGuidelineQuestions = report?.missingQuestions?.length ? report.missingQuestions : [
    '客人一般为什么来你店？',
    '店里最值得推荐的 3 个产品是什么？',
    '如果只能主推一个，你最想先推哪个？',
    '你觉得附近客人为什么会选你，而不是别家？',
    '最近三个月最想提升新客、回头客、外卖、预订还是客单价？',
    '有哪些话不要说，哪些产品暂时不要主推？',
  ]

  const interviewModal = showInterviewReport && (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => setShowInterviewReport(false)} />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">品牌主张访谈</h3>
            <p className="mt-1 text-xs text-slate-400">{interview?.completedAt ? `上次记录：${new Date(interview.completedAt).toLocaleString()}` : '请按指南访谈后保存记录'}</p>
          </div>
          <button type="button" onClick={() => setShowInterviewReport(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="text-xs font-black text-amber-800 dark:text-amber-200">访谈原则</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">不要问品牌大词，只问老板每天能回答的具体生意判断。尽量记原话，后面再整理成品牌策划。</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-black text-slate-900 dark:text-white">建议确认的问题</p>
            <ul className="mt-3 space-y-2">
              {interviewGuidelineQuestions.map(question => (
                <li key={question} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">{question}</li>
              ))}
            </ul>
          </div>
          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-900 dark:text-white">访谈记录</span>
            <textarea
              value={interviewDraftNotes}
              onChange={event => setInterviewDraftNotes(event.target.value)}
              rows={10}
              placeholder="把主理人的访谈内容记录在这里。可以是原话、要点、禁用表达、主推产品、近期目标等。"
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-amber-400/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

        </div>
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <button type="button" onClick={handleGenerateInterviewReport} disabled={planGenerating === 'interview'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-white disabled:opacity-60">
            {planGenerating === 'interview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存访谈记录
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.2 }}
      className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[#f7f9fb] dark:bg-slate-950"
    >
      <div className="flex-shrink-0 border-b border-slate-100 bg-white px-5 py-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onClose && (
              <button onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800" title="返回">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={() => logoInputRef.current?.click()} className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" title="点击上传 Logo">
              {logoPreview || brand.logoUrl ? (
                <Image
                  src={logoPreview || brand.logoUrl!}
                  alt={draftName}
                  width={32}
                  height={32}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : <Utensils className="h-4 w-4 text-slate-400" />}
            </button>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-black text-slate-900 dark:text-white">{draftName || brand.name}</h1>
                <PlanBadge plan={activeSubscriptionPlan} />
              </div>
              <p className="truncate text-[11px] font-semibold text-slate-400">{draftLocation || draftMarket || '品牌策划工作台'}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={handleOpenSettings} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-extrabold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Settings className="h-3.5 w-3.5" /> 品牌配置
            </button>
            <button type="button" onClick={openPlanEditor} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-extrabold text-white dark:bg-white dark:text-slate-900">
              <BookOpen className="h-3.5 w-3.5" /> 编辑品牌策划与门店
            </button>
            <a href="/dashboard/service-check" className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-extrabold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50">
              <WalletCards className="h-3.5 w-3.5" /> 管理订阅服务
            </a>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-6 p-5 pb-16">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Marketing Solution Workspace</p>
                <h2 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">品牌策划</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {sourceStatusItems.map(item => (
                  <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full shadow-sm ${statusDotClass(item.status as 'ready' | 'warning' | 'pending')}`} />
                      <p className="truncate text-[10px] font-bold text-slate-400">{item.label}</p>
                    </div>
                    <p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="brand-info" className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Section 1</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">品牌信息</h3>
              </div>
              <button type="button" onClick={openPlanEditor} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                <Edit3 className="h-3.5 w-3.5" /> 编辑基础资料
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  if (!shouldIgnoreEditableSurfaceClick(event.target)) openPlanEditor()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openPlanEditor()
                  }
                }}
                className="group min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
                title="点击编辑品牌基础资料"
              >
                <div className="grid min-w-0 gap-3 text-sm">
                  {[
                    ['品牌名称', draftName || brand.name],
                    ['品牌介绍', draftDesc || '待补充'],
                    ['联系电话', draftPhone || '待补充'],
                    ['官网链接', draftWebsite || '待补充'],
                    ['所在市场', [draftMarket, draftDistrict].filter(Boolean).join(' / ') || draftLocation || '待补充'],
                  ].map(([label, value]) => (
                    <div key={label} className="grid min-w-0 grid-cols-[86px_minmax(0,1fr)] gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-400">{label}</span>
                      <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-200">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  if (!shouldIgnoreEditableSurfaceClick(event.target)) openPlanEditor()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openPlanEditor()
                  }
                }}
                className="group min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
                title="点击编辑门店和 SKU"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">门店设置</h4>
                    <p className="mt-1 text-xs font-semibold text-slate-400">当前套餐门店额度：{storeLimitText} 家</p>
                  </div>
                  <button type="button" onClick={handleAddStore} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 dark:border-slate-700 dark:text-slate-200">
                    <Plus className="h-3.5 w-3.5" /> 添加门店
                  </button>
                </div>
                <div className="space-y-3">
                  {(draftStores.length ? draftStores : [{ storeId: 'primary', name: draftName, address: draftAddress, phone: draftPhone, businessHours: draftBusinessHours, reservationUrl: draftReservationUrl, orderingUrl: draftOrderingUrl }]).map((store, index) => (
                    <div key={store.storeId || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3 transition group-hover:border-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:group-hover:border-blue-900/60">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black text-slate-800 dark:text-slate-100">{store.name || `门店 ${index + 1}`}</p>
                          <p className="mt-1 text-xs text-slate-500">{store.address || '地址待补充'}</p>
                        </div>
                        {index === 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">主门店</span>}
                      </div>
                      <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3">
                        <span>电话：{store.phone || '待补充'}</span>
                        <span>营业：{store.businessHours || '待补充'}</span>
                        <span>转化：{store.reservationUrl ? '订座' : store.orderingUrl ? '下单' : '待补充'}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {draftMenuItems.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-500">商品和服务库</p>
                      <span className="text-[10px] font-bold text-slate-400">{draftMenuItems.length} 项</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {priorityMenuItems.slice(0, 8).map((item, index) => {
                        const badges = skuBadges(item)
                        const price = formatSkuPrice(item)
                        const nameNeedsReview = validateSkuLibrary([item]).some(issue => issue.field === 'name')
                        return (
                          <div key={`${item.id || item.name}-${index}`} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-start justify-between gap-2">
                              <p title={nameNeedsReview ? undefined : item.name} className={`line-clamp-2 min-w-0 flex-1 break-words text-[11px] font-black ${nameNeedsReview ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>
                                {nameNeedsReview ? '该商品名称包含混合内容，请编辑修正' : item.name || `SKU ${index + 1}`}
                              </p>
                              {price ? <span className="shrink-0 text-[11px] font-black text-emerald-600">{price}</span> : null}
                            </div>
                            {badges.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {badges.slice(0, 3).map(badge => (
                                  <span key={badge} className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{badge}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">社交媒体渠道</h4>
                  {postfastSyncedAt ? <span className="text-[10px] font-semibold text-slate-400">{new Date(postfastSyncedAt).toLocaleDateString()}</span> : null}
                </div>
                <button
                  type="button"
                  onClick={handleSyncPostfastAccounts}
                  disabled={postfastSyncing}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:border-blue-300 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
                >
                  {postfastSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  同步账号
                </button>
              </div>

              {socialAccounts.length ? (
                <div className="flex flex-wrap gap-2">
                  {socialAccounts.map((account) => {
                    const displayName = account.displayName || account.handle || socialPlatformLabel(account.platformId)
                    return (
                      <div
                        key={account.id}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          if (!shouldIgnoreEditableSurfaceClick(event.target)) setEditingSocialAccount(account)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setEditingSocialAccount(account)
                          }
                        }}
                        className="flex cursor-pointer min-w-[220px] max-w-full flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-blue-200 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-800 dark:hover:bg-slate-900 sm:max-w-[320px]"
                        title="点击编辑社交媒体账号"
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${socialPlatformColor(account.platformId)}`}>
                          {socialPlatformLogo(account.platformId)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{socialPlatformLabel(account.platformId)}</p>
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${account.autoPilot ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                              {account.autoPilot ? '自动' : '审核'}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{account.handle ? `@${account.handle.replace(/^@/, '')}` : displayName}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold text-slate-500">
                          {typeof account.followerCount === 'number' && <span>粉丝：{account.followerCount.toLocaleString()}</span>}
                          {typeof account.ratingScore === 'number' && <span>评分：{account.ratingScore.toFixed(1)}</span>}
                          {account.profileUrl && (
                            <a href={account.profileUrl} target="_blank" rel="noreferrer" className="font-bold text-blue-600 hover:text-blue-700">
                              主页
                            </a>
                          )}
                          <button type="button" onClick={() => setEditingSocialAccount(account)} className="font-bold text-slate-700 hover:text-blue-600 dark:text-slate-200">编辑</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                  尚未同步账号
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            {/* 客观数据调研报告 V3 compact row */}
            <div
              role="button"
              tabIndex={0}
              onClick={(event) => {
                if (!shouldIgnoreEditableSurfaceClick(event.target) && report) openAiContentEditor({ target: 'research_report', title: '编辑客观数据调研报告 V3', value: report })
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && report) {
                  event.preventDefault()
                  openAiContentEditor({ target: 'research_report', title: '编辑客观数据调研报告 V3', value: report })
                }
              }}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
              title={report ? '点击编辑客观数据调研报告 V3' : '尚未生成客观数据调研报告 V3'}
            >
              <FileText className="h-4 w-4 shrink-0 text-blue-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 dark:text-white">客观数据调研报告 V3</p>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-slate-500">{report ? report.summary : '尚未获取调研报告'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGenerateResearchReport}
                  disabled={Boolean(planGenerating)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {planGenerating === 'research' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {report ? '重新生成' : '生成报告'}
                </button>
                <a
                  href={report ? growthResearchReportHref : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!report || Boolean(planGenerating)}
                  title="查看 Growth 最新 V3 原报告"
                  className={`rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300 ${!report || planGenerating ? 'pointer-events-none opacity-40' : ''}`}
                >
                  查看
                </a>
              </div>
            </div>
            {/* 品牌主张访谈 compact row */}
            <div
              role="button"
              tabIndex={0}
              onClick={(event) => {
                if (!shouldIgnoreEditableSurfaceClick(event.target)) openMerchantInterviewPanel()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openMerchantInterviewPanel()
                }
              }}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-amber-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-800"
              title="点击记录品牌主张访谈"
            >
              <HelpCircle className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 dark:text-white">品牌主张访谈</p>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-slate-500">
                  {interview?.summary || '未完成访谈，点击右侧按钮开始'}
                </p>
              </div>
              <button
                type="button"
                onClick={openMerchantInterviewPanel}
                disabled={Boolean(planGenerating)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <Users className="h-3 w-3" /> 访谈指南与记录
              </button>
            </div>
          </section>

          {/* Section 2: plan input, not rendered */}



          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-purple-600">Section 2</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">营销计划</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <span className="whitespace-nowrap">开始月份</span>
                  <input
                    type="month"
                    value={planningStartMonth}
                    onChange={(event) => setPlanningStartMonth(event.target.value)}
                    disabled={Boolean(planGenerating)}
                    className="w-[118px] bg-transparent text-xs font-black text-slate-900 outline-none disabled:opacity-60 dark:text-white"
                  />
                </label>
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  {annualPlan?.generatedAt ? `生成时间：${new Date(annualPlan.generatedAt).toLocaleString()}` : '尚未生成'}
                  {annualPlan?.planningStartMonth ? ` · 起始：${annualPlan.planningStartMonth}` : ''}
                </span>
                <button type="button" onClick={handleGenerateAnnualPlan} disabled={Boolean(planGenerating)} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'annual' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Goal className="h-3.5 w-3.5" />} {planGenerating === 'annual' && annualGenerationStep ? annualGenerationStep : annualPlan ? '重新生成计划' : '生成营销计划'}
                </button>
                <button type="button" onClick={() => annualPlan && openAiContentEditor({ target: 'annual_plan', title: '编辑营销计划', value: annualPlan })} disabled={!annualPlan || Boolean(planGenerating)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">
                  编辑
                </button>
                <a href={`/dashboard/brands/${brandId}/marketing-plan`} target="_blank" rel="noreferrer" aria-disabled={!annualPlan} className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700 ${annualPlan ? 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800' : 'pointer-events-none text-slate-300 dark:text-slate-600'}`}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看完整计划
                </a>
              </div>
            </div>
            {annualPlan ? (
              <div className="mt-4 space-y-4">
                {/* Annual overview */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    if (!shouldIgnoreEditableSurfaceClick(event.target)) openAiContentEditor({ target: 'annual_plan', title: '编辑营销计划', value: annualPlan })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openAiContentEditor({ target: 'annual_plan', title: '编辑营销计划', value: annualPlan })
                    }
                  }}
                  className="cursor-pointer rounded-xl bg-gradient-to-br from-purple-50 to-slate-50 p-4 transition hover:ring-2 hover:ring-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:from-purple-950/20 dark:to-slate-950 dark:hover:ring-purple-900/60"
                  title="编辑营销计划"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{annualPlan.theme}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{annualPlan.goal}</p>
                    </div>
                    {annualPlan.metrics?.length ? (
                      <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
                        {annualPlan.metrics.length} 项指标
                      </span>
                    ) : null}
                  </div>
                  {annualPlan.metrics?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {annualPlan.metrics.map(metric => (
                        <span key={metric} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-300">{metric}</span>
                      ))}
                    </div>
                  ) : null}
                  {safeArray(annualPlan.strategyPrinciples).length || safeArray(annualPlan.contentPillars).length ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {safeArray(annualPlan.strategyPrinciples).length ? (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">策略原则</p>
                          <ul className="mt-2 space-y-1.5">
                            {safeArray(annualPlan.strategyPrinciples).map(item => (
                              <li key={item} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {safeArray(annualPlan.contentPillars).length ? (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">内容支柱</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {safeArray(annualPlan.contentPillars).map(item => (
                              <span key={item} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{item}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {safeArray(annualPlan.platformStrategy).length ? (
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">平台分工</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {safeArray(annualPlan.platformStrategy).map(item => (
                          <div key={`${item.platform}-${item.role}`} className="rounded-lg bg-white p-3 text-xs dark:bg-slate-900">
                            <p className="font-black text-slate-800 dark:text-slate-100">{item.platform}：{item.role}</p>
                            <p className="mt-1 leading-relaxed text-slate-500">{item.contentApproach}</p>
                            {item.customerAction ? <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">行动：{item.customerAction}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {annualPlan.llmError ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                      这次没有生成完整计划，已保留一版基础内容。请检查模型配置后重新生成。
                    </p>
                  ) : null}
                </div>
                {/* Quarter tabs */}
                {annualQuarterPlans.length ? (
                  <QuarterPlanTabs
                    annualQuarterPlans={annualQuarterPlans}
                    onEditQuarter={(quarterPlan) => openAiContentEditor({ target: 'annual_plan', title: '编辑营销计划', value: annualPlan })}
                  />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {(Array.isArray(annualPlan.quarterlyFocus) ? annualPlan.quarterlyFocus : []).map(item => (
                      <div
                        key={item.quarter}
                        role="button"
                        tabIndex={0}
                        onClick={() => openAiContentEditor({ target: 'annual_plan', title: '编辑营销计划', value: annualPlan })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openAiContentEditor({ target: 'annual_plan', title: '编辑营销计划', value: annualPlan })
                          }
                        }}
                        className="cursor-pointer rounded-xl bg-slate-50 p-3 transition hover:ring-2 hover:ring-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:bg-slate-950 dark:hover:ring-purple-900/60"
                        title="编辑营销计划"
                      >
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100">{quarterDisplayLabel(item)}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.focus}</p>
                        {safeArray(item.campaigns).length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {safeArray(item.campaigns).map(c => <span key={c} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-950 dark:text-purple-200">{c}</span>)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-purple-200 bg-purple-50/50 p-6 text-center dark:border-purple-900 dark:bg-purple-950/10">
                <Goal className="mx-auto mb-3 h-8 w-8 text-purple-300" />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">还没有营销计划</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">先整理全年方向，再拆到每个季度和每个月。</p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Section 4</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">内容计划</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}
                  disabled={!canGoPreviousCalendarMonth}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:border-slate-800 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                >
                  上个月
                </button>
                <input
                  type="month"
                  value={calendarMonth}
                  min={minimumCalendarMonth}
                  onChange={event => setCalendarMonth(event.target.value < minimumCalendarMonth ? minimumCalendarMonth : event.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">下个月</button>
                <button type="button" onClick={handleGeneratePublishingCalendar} disabled={Boolean(planGenerating) || !calendarQuarterReady} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'calendar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} {calendarGenerationProgress || '生成内容计划'}
                </button>
                <button type="button" onClick={handleAddCalendarItem} disabled={Boolean(planGenerating)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200">
                  <Plus className="h-3.5 w-3.5" /> 新增
                </button>
                <button type="button" onClick={handleSaveCalendarMonth} disabled={Boolean(planGenerating)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                  {planGenerating === 'calendar_save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存
                </button>
                <button type="button" onClick={handleDownloadMaterialRequirements} disabled={!currentCalendarItems.length} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                  <Download className="h-3.5 w-3.5" /> 下载素材采集需求
                </button>
                <button type="button" onClick={() => openAiContentEditor({ target: 'calendar_month', title: `${calendarMonth} 内容计划`, month: calendarMonth, value: currentCalendarItems })} disabled={!currentCalendarItems.length || Boolean(planGenerating)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">
                  高级编辑
                </button>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100">发布节奏</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">按当前订阅服务带出，改完后可重新生成。</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-black">
                  <span className="text-rose-600">合计 {publishingScheduleCount} 条/月</span>
                  {publishingScheduleSaveState === 'saving' ? <span className="text-slate-400">保存中...</span> : null}
                  {publishingScheduleSaveState === 'saved' ? <span className="text-emerald-600">已自动保存</span> : null}
                  {publishingScheduleSaveState === 'error' ? <span className="text-rose-600">保存失败</span> : null}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(activePublishingPlatforms.length ? activePublishingPlatforms : PUBLISHING_PLATFORM_OPTIONS.slice(0, 3)).map((platform) => (
                  <label key={platform.slug} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs dark:bg-slate-900">
                    <span className="font-bold text-slate-600 dark:text-slate-300">{platform.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={publishingScheduleDraft[platform.slug] ?? 0}
                      onChange={(event) => {
                        const count = Math.max(0, Math.min(60, Math.floor(Number(event.target.value || 0))))
                        setPublishingScheduleDraft((current) => ({ ...current, [platform.slug]: count }))
                      }}
                      className="h-8 w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 text-right text-xs font-black text-slate-800 focus:border-rose-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                ))}
              </div>
            </div>
            {currentCalendarItems.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarPlatformFilter('all')}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-black transition ${
                    calendarPlatformFilter === 'all'
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  全部 {currentCalendarItems.length}
                </button>
                {calendarFilterPlatforms.map((platform) => (
                  <button
                    key={platform.slug}
                    type="button"
                    onClick={() => setCalendarPlatformFilter(platform.slug)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-black transition ${
                      calendarPlatformFilter === platform.slug
                        ? socialPlatformColor(platform.slug)
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full border ${socialPlatformColor(platform.slug)}`} />
                    {platform.label} {calendarPlatformCounts[platform.slug] || 0}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredCalendarItems.length ? filteredCalendarItems.map(({ item, index }) => {
                const platformSlug = normalizeSchedulePlatform(item.platformSlug || item.platform || '')
                const inspirationCreativeId = resolveInspirationCreativeId(item)
                const videoSourceUrl = item.sampleVideoUrl || item.sampleOriginalUrl || ''
                const videoSourceTitle = item.inspirationSourceTitle || item.sampleSourcePlatform || ''
                const videoScript = calendarVideoScriptForItem(item)
                const hasVideoScript = isCalendarVideoItem(item) && Boolean(
                  videoScript.opening ||
                  videoScript.shots.length ||
                  videoScript.voiceover.length ||
                  videoScript.subtitles.length ||
                  videoScript.closing
                )
                const isPinned = item.status === '已确认'
                return (
                <div key={item.id || `${item.date}-${item.platformSlug || item.platform}-${index}`} className={`rounded-xl border border-l-4 border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 ${calendarPlatformAccent(platformSlug)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={item.date}
                        onChange={(event) => {
                          handleUpdateCalendarItem(item.id, index, { date: event.target.value })
                        }}
                        onBlur={(event) => {
                          const rawDate = event.target.value.trim()
                          const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= minimumCalendarDate ? rawDate : minimumCalendarDate
                          if (nextDate !== rawDate) {
                            showToastVal(`内容计划需至少提前 ${CONTENT_PLANNING_LEAD_DAYS} 天安排。`, 'info')
                            handleUpdateCalendarItem(item.id, index, { date: nextDate })
                          }
                        }}
                        placeholder="YYYY-MM-DD"
                        className="w-36 rounded-lg bg-slate-900 px-2 py-1 text-center text-[11px] font-black text-white outline-none dark:bg-white dark:text-slate-900"
                      />
                      <select
                        value={item.platformSlug || normalizeSchedulePlatform(item.platform || '')}
                        onChange={(event) => {
                          const platform = PUBLISHING_PLATFORM_OPTIONS.find(option => option.slug === event.target.value)
                          handleUpdateCalendarItem(item.id, index, { platformSlug: event.target.value, platform: platform?.label || event.target.value })
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                      >
                        {PUBLISHING_PLATFORM_OPTIONS.map(platform => <option key={platform.slug} value={platform.slug}>{platform.label}</option>)}
                      </select>
                      <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black ${socialPlatformColor(platformSlug)}`}>
                        {socialPlatformLogo(platformSlug)}
                        {socialPlatformLabel(platformSlug)}
                      </span>
                      {item.creativeMatchStatus === 'no_candidate_after_retry' ? (
                        <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                          未找到灵感 · 平台规则原创
                        </span>
                      ) : null}
                      <select
                        value={item.contentType}
                        onChange={(event) => handleUpdateCalendarItem(item.id, index, { contentType: event.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="图文">图文</option>
                        <option value="短视频">短视频</option>
                        <option value="评论回复">评论回复</option>
                      </select>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateCalendarItem(item.id, index, { status: isPinned ? '待确认' : '已确认' })}
                        disabled={Boolean(planGenerating)}
                        aria-label={isPinned ? '取消固定这个创意' : '固定这个创意'}
                        title={isPinned ? '已固定，点击取消' : '未固定，点击固定'}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-50 ${
                          isPinned
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                            : 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                        }`}
                      >
                        <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerateCalendarItem(item.id)}
                        disabled={Boolean(planGenerating) || !item.id}
                        aria-label="重做这一条"
                        title="重做这一条"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {planGenerating === `calendar_item:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCalendarItem(item.id, index)}
                        disabled={Boolean(planGenerating)}
                        aria-label="删除这条内容计划"
                        title="删除"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-900 dark:hover:text-rose-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <input
                    value={item.title}
                    onChange={(event) => handleUpdateCalendarItem(item.id, index, { title: event.target.value })}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900 outline-none focus:border-rose-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    value={item.product}
                    onChange={(event) => handleUpdateCalendarItem(item.id, index, { product: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 outline-none focus:border-rose-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                  <div className="relative mt-2">
                    <textarea
                      value={item.planning}
                      onChange={(event) => handleUpdateCalendarItem(item.id, index, { planning: event.target.value })}
                      rows={7}
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 pb-11 text-xs leading-relaxed text-slate-600 outline-none focus:border-rose-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleRewriteCalendarItemDetails(item, index)}
                      disabled={Boolean(planGenerating) || !item.planning?.trim()}
                      aria-label="根据内容创意重写详情"
                      title="根据内容创意重写详情"
                      className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200"
                    >
                      {planGenerating === `calendar_rewrite:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {item.materialRequirements?.length ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">素材要求：{item.materialRequirements.join('；')}</p>
                  ) : null}
                  {hasVideoScript ? (
                    <details open className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-[11px] text-slate-700 open:space-y-2 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-slate-200">
                      <summary className="cursor-pointer font-black text-indigo-700 dark:text-indigo-200">
                        {videoScript.shotLabel === '分镜' ? '详细分镜' : '拍摄建议'} · {videoScript.shots.length || 1} 个镜头
                      </summary>
                      {videoSourceTitle ? (
                        <p className="leading-relaxed"><span className="font-black text-slate-500 dark:text-slate-400">原创意：</span>{videoSourceTitle}</p>
                      ) : null}
                      {item.inspirationSourceSummary ? (
                        <p className="leading-relaxed"><span className="font-black text-slate-500 dark:text-slate-400">参考重点：</span>{item.inspirationSourceSummary}</p>
                      ) : null}
                      {videoSourceUrl ? (
                        <a
                          href={videoSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md text-[11px] font-black text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-200"
                        >
                          <ExternalLink className="h-3 w-3" />
                          查看原创意
                        </a>
                      ) : null}
                      {videoScript.opening ? (
                        <p className="leading-relaxed"><span className="font-black text-slate-500 dark:text-slate-400">开场：</span>{videoScript.opening}</p>
                      ) : null}
                      {videoScript.shots.length ? (
                        <ol className="space-y-1.5">
                          {videoScript.shots.map((shot, shotIndex) => (
                            <li
                              key={`${item.id || index}-shot-${shotIndex}`}
                              className="rounded-md border border-white/80 bg-white px-2 py-1.5 leading-relaxed shadow-sm dark:border-slate-800 dark:bg-slate-900"
                            >
                              <span className="mb-0.5 block text-[10px] font-black text-indigo-500 dark:text-indigo-300">{videoScript.shotLabel === '分镜' ? '镜头' : '建议'} {shotIndex + 1}</span>
                              {shot}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      {videoScript.voiceover.length ? (
                        <p className="leading-relaxed"><span className="font-black text-slate-500 dark:text-slate-400">口播：</span>{videoScript.voiceover.join(' / ')}</p>
                      ) : null}
                      {videoScript.subtitles.length ? (
                        <p className="leading-relaxed"><span className="font-black text-slate-500 dark:text-slate-400">字幕：</span>{videoScript.subtitles.join(' / ')}</p>
                      ) : null}
                      {videoScript.closing ? (
                        <p className="leading-relaxed"><span className="font-black text-slate-500 dark:text-slate-400">收尾：</span>{videoScript.closing}</p>
                      ) : null}
                    </details>
                  ) : null}
                  {inspirationCreativeId ? (
                    <a
                      href={`/admin/inspiration-creatives/${encodeURIComponent(inspirationCreativeId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <ExternalLink className="h-3 w-3" />
                      灵感来源
                    </a>
                  ) : null}
                  {!inspirationCreativeId && (item.sampleVideoUrl || item.sampleOriginalUrl) ? (
                    <a
                      href={item.sampleVideoUrl || item.sampleOriginalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <ExternalLink className="h-3 w-3" />
                      原始来源
                    </a>
                  ) : null}
                </div>
                )
              }) : (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
                  {currentCalendarItems.length ? '这个平台暂时没有内容计划。' : '这个月还没有内容计划。可以生成一版，也可以先手动加一条。'}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {showContextModal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowContextModal(false)} />
          <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">品牌上下文 Markdown</h3>
                <p className="mt-1 text-xs text-slate-400">编辑品牌介绍和经营信息；保存后会回写结构化字段。</p>
              </div>
              <button type="button" onClick={() => setShowContextModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <textarea value={profileMarkdown} onChange={event => setProfileMarkdown(event.target.value)} className="min-h-[520px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
              <button type="button" onClick={() => handleSaveProfile()} disabled={profileSaving || profileLoading || !profileMarkdown.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900">
                {profileSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 保存中…</> : <><Save className="h-3.5 w-3.5" /> 保存品牌上下文</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlanEditor && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPlanEditor(false)} />
          <div className="relative z-10 flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">编辑品牌策划内容</h3>
                <p className="mt-1 text-xs text-slate-400">保存后会回写品牌资料、门店信息、SKU 和营销输入材料</p>
              </div>
              <button type="button" onClick={() => setShowPlanEditor(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <section className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">品牌名称</span>
                  <input value={draftName} onChange={event => setDraftName(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">所在市场 / 区域</span>
                  <input value={draftLocation} onChange={event => setDraftLocation(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">品牌介绍</span>
                  <textarea value={draftDesc} onChange={event => setDraftDesc(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">联系电话</span>
                  <input value={draftPhone} onChange={event => setDraftPhone(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">官网链接</span>
                  <input value={draftWebsite} onChange={event => setDraftWebsite(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">主地址</span>
                  <input value={draftAddress} onChange={event => setDraftAddress(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">门店信息</h4>
                  <button type="button" onClick={handleAddStore} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold dark:border-slate-700">添加门店</button>
                </div>
                {(draftStores.length ? draftStores : [{ storeId: 'primary', name: draftName, address: draftAddress, phone: draftPhone, businessHours: draftBusinessHours, reservationUrl: draftReservationUrl, orderingUrl: draftOrderingUrl }]).map((store, index) => (
                  <div key={store.storeId || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-700 dark:text-slate-200">门店 {index + 1}</p>
                      {draftStores.length > 1 && <button type="button" onClick={() => removeDraftStore(index)} className="text-xs font-bold text-rose-500">删除</button>}
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input value={store.name || ''} onChange={event => updateDraftStore(index, { name: event.target.value })} placeholder="店铺名称" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                      <input value={store.phone || ''} onChange={event => updateDraftStore(index, { phone: event.target.value })} placeholder="联系方式" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                      <input value={store.address || ''} onChange={event => updateDraftStore(index, { address: event.target.value })} placeholder="营业地址" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-2" />
                      <input value={store.businessHours || ''} onChange={event => updateDraftStore(index, { businessHours: event.target.value })} placeholder="营业时间" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                      <input value={store.reservationUrl || ''} onChange={event => updateDraftStore(index, { reservationUrl: event.target.value })} placeholder="预定链接" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                      <input value={store.orderingUrl || ''} onChange={event => updateDraftStore(index, { orderingUrl: event.target.value })} placeholder="下单 / 配送链接" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-2" />
                    </div>
                  </div>
                ))}
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">市场</span>
                  <input value={draftMarket} onChange={event => setDraftMarket(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">商圈</span>
                  <input value={draftDistrict} onChange={event => setDraftDistrict(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">竞品列表</span>
                  <textarea value={draftCompetitorsText} onChange={event => setDraftCompetitorsText(event.target.value)} rows={5} placeholder="每行一个竞品" className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
              </section>

              <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white">商品和服务库</h4>
                    <p className="mt-1 text-xs text-slate-400">用于营销方案和内容创作调用价格、套餐、招牌、热销、高复购和商家主推判断。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => addProductServiceItem('single')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-900">添加单品</button>
                    <button type="button" onClick={() => addProductServiceItem('bundle')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-900">添加套餐</button>
                    <button type="button" onClick={() => addProductServiceItem('service')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-900">添加服务</button>
                  </div>
                </div>
                {draftMenuItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                    还没有商品或服务。先添加招牌菜、套餐或主推服务，AI 才能写出具体价格和点单引导。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {draftMenuItems.map((item, index) => (
                      <div key={item.id || index} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-xs font-black text-slate-700 dark:text-slate-200">SKU {index + 1}</p>
                          <button type="button" onClick={() => removeProductServiceItem(index)} className="text-xs font-bold text-rose-500">删除</button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-[120px_1fr_120px_120px]">
                          <select
                            value={item.type || 'single'}
                            onChange={event => updateProductServiceItem(index, { type: event.target.value as ProductServiceItem['type'] })}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="single">单品</option>
                            <option value="bundle">套餐</option>
                            <option value="service">服务</option>
                          </select>
                          <input maxLength={80} value={item.name} onChange={event => updateProductServiceItem(index, { name: event.target.value })} placeholder="名称，例如 铁锅炖大鹅" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                          <input maxLength={40} value={item.price || ''} onChange={event => updateProductServiceItem(index, { price: event.target.value })} placeholder="价格，例如 38 / 200" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                          <input maxLength={40} value={item.serves || ''} onChange={event => updateProductServiceItem(index, { serves: event.target.value })} placeholder="适合人数" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                          <input maxLength={500} value={item.bundleItems || ''} onChange={event => updateProductServiceItem(index, { bundleItems: event.target.value })} placeholder="套餐内容 / 搭配建议" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 md:col-span-2" />
                          <input maxLength={2000} value={item.imageUrl || ''} onChange={event => updateProductServiceItem(index, { imageUrl: event.target.value })} placeholder="图片 URL" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 md:col-span-2" />
                          <textarea maxLength={2000} value={item.description || ''} onChange={event => updateProductServiceItem(index, { description: event.target.value })} rows={2} placeholder="卖点、分量、适合场景，例如 $200 够几个人吃、$30/人能吃到什么" className="resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 md:col-span-4" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={Boolean(item.isHotSeller)} onChange={event => updateProductServiceItem(index, { isHotSeller: event.target.checked })} /> 热销品</label>
                          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={Boolean(item.isHighRepeat)} onChange={event => updateProductServiceItem(index, { isHighRepeat: event.target.checked })} /> 高复购品</label>
                          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={Boolean(item.isMerchantPick)} onChange={event => updateProductServiceItem(index, { isMerchantPick: event.target.checked })} /> 商家主推 / 有潜力</label>
                          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={Boolean(item.isSignature)} onChange={event => updateProductServiceItem(index, { isSignature: event.target.checked })} /> 招牌</label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">目标人群</span>
                  <textarea value={draftAudience} onChange={event => setDraftAudience(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">核心卖点</span>
                  <textarea value={draftProduct} onChange={event => setDraftProduct(event.target.value)} rows={3} placeholder="每行一个卖点" className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">品牌语气</span>
                  <textarea value={activeBrandTone} onChange={event => setLocalBrandTone(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">品牌声音</span>
                  <textarea value={creativeIdentity.brandVoice} onChange={event => setCreativeIdentity(current => ({ ...current, brandVoice: event.target.value }))} rows={3} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">品牌形象</span>
                  <textarea value={creativeIdentity.brandImage} onChange={event => setCreativeIdentity(current => ({ ...current, brandImage: event.target.value }))} rows={3} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">推广点</span>
                  <textarea value={creativeIdentity.promotionFocus} onChange={event => setCreativeIdentity(current => ({ ...current, promotionFocus: event.target.value }))} rows={3} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
              </section>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
              <button type="button" onClick={() => { setShowPlanEditor(false); openEditableBrandContext() }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">高级 Markdown 编辑</button>
              <button type="button" onClick={handleSavePlanEditor} disabled={planEditorSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900">
                {planEditorSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 保存中…</> : <><Save className="h-3.5 w-3.5" /> 保存全部内容</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportModal}
      {interviewModal}
      {editingAiContent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingAiContent(null)} />
          <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{editingAiContent.title}</h3>
                <p className="mt-1 text-xs text-slate-400">保存后回写当前品牌策划版本</p>
              </div>
              <button type="button" onClick={() => setEditingAiContent(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {editingAnnualPlanDraft ? (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-black text-slate-500">计划主题</span>
                    <input
                      value={editingAnnualPlanDraft.theme || ''}
                      onChange={event => updateEditingAnnualPlan(draft => ({ ...draft, theme: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-black text-slate-500">年度目标</span>
                    <textarea
                      value={editingAnnualPlanDraft.goal || ''}
                      onChange={event => updateEditingAnnualPlan(draft => ({ ...draft, goal: event.target.value }))}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-black text-slate-500">策略原则</span>
                      <textarea
                        value={listToLines(editingAnnualPlanDraft.strategyPrinciples)}
                        onChange={event => updateEditingAnnualPlan(draft => ({ ...draft, strategyPrinciples: linesToList(event.target.value) }))}
                        rows={5}
                        className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-black text-slate-500">内容支柱</span>
                      <textarea
                        value={listToLines(editingAnnualPlanDraft.contentPillars)}
                        onChange={event => updateEditingAnnualPlan(draft => ({ ...draft, contentPillars: linesToList(event.target.value) }))}
                        rows={5}
                        className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-black text-slate-500">验收指标</span>
                    <textarea
                      value={listToLines(editingAnnualPlanDraft.metrics)}
                      onChange={event => updateEditingAnnualPlan(draft => ({ ...draft, metrics: linesToList(event.target.value) }))}
                      rows={4}
                      className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  {safeArray(editingAnnualPlanDraft.platformStrategy).length ? (
                    <div>
                      <p className="text-xs font-black text-slate-500">平台分工</p>
                      <div className="mt-2 space-y-2">
                        {safeArray(editingAnnualPlanDraft.platformStrategy).map((platform, index) => (
                          <div key={`${platform.platform}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                            <div className="grid gap-2 md:grid-cols-2">
                              <input
                                value={platform.role || ''}
                                onChange={event => updateEditingAnnualPlan(draft => {
                                  const next = safeArray(draft.platformStrategy).map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item)
                                  return { ...draft, platformStrategy: next }
                                })}
                                placeholder={`${platform.platform} 角色`}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-900"
                              />
                              <input
                                value={platform.customerAction || ''}
                                onChange={event => updateEditingAnnualPlan(draft => {
                                  const next = safeArray(draft.platformStrategy).map((item, itemIndex) => itemIndex === index ? { ...item, customerAction: event.target.value } : item)
                                  return { ...draft, platformStrategy: next }
                                })}
                                placeholder="顾客行动"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                              />
                            </div>
                            <textarea
                              value={platform.contentApproach || ''}
                              onChange={event => updateEditingAnnualPlan(draft => {
                                const next = safeArray(draft.platformStrategy).map((item, itemIndex) => itemIndex === index ? { ...item, contentApproach: event.target.value } : item)
                                return { ...draft, platformStrategy: next }
                              })}
                              rows={2}
                              placeholder="内容打法"
                              className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {safeArray(editingAnnualPlanDraft.quarterlyPlans).length ? (
                    <div>
                      <p className="text-xs font-black text-slate-500">季度计划</p>
                      <div className="mt-2 space-y-3">
                        {safeArray(editingAnnualPlanDraft.quarterlyPlans).map((quarter, index) => (
                          <div key={`${quarter.periodLabel || quarter.quarter}-${index}`} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                            <p className="text-xs font-black text-purple-600">{quarterDisplayLabel(quarter)}</p>
                            <input
                              value={quarter.focus || ''}
                              onChange={event => updateEditingAnnualPlan(draft => {
                                const next = safeArray(draft.quarterlyPlans).map((item, itemIndex) => itemIndex === index ? { ...item, focus: event.target.value } : item)
                                return { ...draft, quarterlyPlans: next }
                              })}
                              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                            <textarea
                              value={quarter.strategy || ''}
                              onChange={event => updateEditingAnnualPlan(draft => {
                                const next = safeArray(draft.quarterlyPlans).map((item, itemIndex) => itemIndex === index ? { ...item, strategy: event.target.value } : item)
                                return { ...draft, quarterlyPlans: next }
                              })}
                              rows={2}
                              className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <textarea
                                value={listToLines(quarter.campaigns)}
                                onChange={event => updateEditingAnnualPlan(draft => {
                                  const next = safeArray(draft.quarterlyPlans).map((item, itemIndex) => itemIndex === index ? { ...item, campaigns: linesToList(event.target.value) } : item)
                                  return { ...draft, quarterlyPlans: next }
                                })}
                                rows={3}
                                placeholder="Campaign，每行一个"
                                className="resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              />
                              <textarea
                                value={listToLines(quarter.contentThemes)}
                                onChange={event => updateEditingAnnualPlan(draft => {
                                  const next = safeArray(draft.quarterlyPlans).map((item, itemIndex) => itemIndex === index ? { ...item, contentThemes: linesToList(event.target.value) } : item)
                                  return { ...draft, quarterlyPlans: next }
                                })}
                                rows={3}
                                placeholder="内容主题，每行一个"
                                className="resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <textarea
                  value={editingAiJson}
                  onChange={event => setEditingAiJson(event.target.value)}
                  spellCheck={false}
                  className="min-h-[520px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              )}
              <button
                type="button"
                onClick={handleSaveAiContent}
                disabled={Boolean(planGenerating)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                {String(planGenerating).startsWith('edit:') ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 保存中…</> : <><Save className="h-3.5 w-3.5" /> 保存并回写</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {editingSocialAccount && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingSocialAccount(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">编辑社交媒体账号</h3>
                <p className="mt-1 text-xs text-slate-400">{socialPlatformLabel(editingSocialAccount.platformId)}</p>
              </div>
              <button type="button" onClick={() => setEditingSocialAccount(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-600 dark:text-slate-300">账号 handle</span>
                <input value={editingSocialAccount.handle || ''} onChange={event => setEditingSocialAccount(current => current ? { ...current, handle: event.target.value } : current)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-600 dark:text-slate-300">展示名称</span>
                <input value={editingSocialAccount.displayName || ''} onChange={event => setEditingSocialAccount(current => current ? { ...current, displayName: event.target.value } : current)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-600 dark:text-slate-300">主页链接</span>
                <input value={editingSocialAccount.profileUrl || ''} onChange={event => setEditingSocialAccount(current => current ? { ...current, profileUrl: event.target.value } : current)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                <span className="text-xs font-black text-slate-700 dark:text-slate-200">自动发布</span>
                <input type="checkbox" checked={Boolean(editingSocialAccount.autoPilot)} onChange={event => setEditingSocialAccount(current => current ? { ...current, autoPilot: event.target.checked } : current)} className="h-4 w-4" />
              </label>
            </div>
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <button type="button" onClick={handleSaveSocialAccount} disabled={socialAccountSaving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900">
                {socialAccountSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> 保存中…</> : <><Save className="h-3.5 w-3.5" /> 保存账号</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={`fixed left-1/2 top-4 z-50 flex max-w-[min(92vw,760px)] -translate-x-1/2 items-center gap-2 whitespace-pre-line rounded-xl border px-4 py-2.5 text-left text-xs font-bold leading-5 text-white shadow-lg ${
          toast.type === 'success' ? 'border-emerald-400 bg-emerald-500' : toast.type === 'error' ? 'border-rose-400 bg-rose-500' : 'border-slate-700 bg-slate-800'
        }`}>
          {toast.message}
        </div>
      )}
      {showSettings && (
        <BrandSettingsPanel
          brandId={brandId}
          open={showSettings}
          onClose={() => {
            setShowSettings(false)
            void loadAllConfig()
          }}
          initialSettings={brandSettings ?? undefined}
        />
      )}
    </motion.div>
  )

}

// ─── QuarterPlanTabs ──────────────────────────────────────────────────────────

type AnnualQuarterPlan = {
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
    targetAudience?: string
    customerAction: string
    platforms: string[]
    suggestedMonthlyPosts: number
  }>
  campaigns: string[]
  contentThemes: string[]
  monthlyFocus: Array<{ month: string; focus: string; promotionPoints: string[] }>
}

function quarterDisplayLabel(quarter: { quarter: string; periodLabel?: string; startMonth?: string; endMonth?: string }) {
  if (quarter.periodLabel) return quarter.periodLabel
  if (quarter.startMonth && quarter.endMonth) return `${quarter.quarter} · ${quarter.startMonth} 至 ${quarter.endMonth}`
  return quarter.quarter
}

function safeArray<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : []
}

function parseAnnualPlanDraft(json: string): NonNullable<BrandPlanWorkspaceData['annualPlan']> | null {
  try {
    const value = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as NonNullable<BrandPlanWorkspaceData['annualPlan']>
      : null
  } catch {
    return null
  }
}

function linesToList(value: string) {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

function listToLines(value: string[] | undefined | null) {
  return safeArray(value).join('\n')
}

function QuarterPlanTabs({
  annualQuarterPlans,
  onEditQuarter,
}: {
  annualQuarterPlans: AnnualQuarterPlan[]
  onEditQuarter: (plan: AnnualQuarterPlan) => void
}) {
  const [activeQuarter, setActiveQuarter] = useState(annualQuarterPlans[0]?.quarter || 'Q1')
  const annualQuarterKey = annualQuarterPlans.map(q => `${q.periodLabel || q.quarter}:${q.startMonth || ''}`).join('|')
  useEffect(() => {
    if (!annualQuarterPlans.length) return
    setActiveQuarter(current => annualQuarterPlans.some(q => q.quarter === current) ? current : annualQuarterPlans[0].quarter)
  }, [annualQuarterKey, annualQuarterPlans])
  const activeAnnual = annualQuarterPlans.find(q => q.quarter === activeQuarter)

  return (
    <div>
      {/* Quarter tab strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {annualQuarterPlans.map(q => (
          <button
            key={q.quarter}
            type="button"
            onClick={() => setActiveQuarter(q.quarter)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${
              activeQuarter === q.quarter
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {quarterDisplayLabel(q)}
          </button>
        ))}
      </div>

      {activeAnnual && (
        <div
          role="button"
          tabIndex={0}
          onClick={(event) => {
            if (!shouldIgnoreEditableSurfaceClick(event.target)) onEditQuarter(activeAnnual)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onEditQuarter(activeAnnual)
            }
          }}
          className="mt-3 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-purple-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-purple-900"
        >
          {/* Quarter header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-purple-600">{quarterDisplayLabel(activeAnnual)}</p>
              <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{activeAnnual.focus}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{activeAnnual.strategy}</p>
            </div>
            {safeArray(activeAnnual.campaigns).length ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                {safeArray(activeAnnual.campaigns).slice(0, 3).map(c => (
                  <span key={c} className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">{c}</span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Promotion points */}
          {safeArray(activeAnnual.promotionPoints).length ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">推广点</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {safeArray(activeAnnual.promotionPoints).map(point => (
                  <div key={point.name} className="rounded-lg border border-white bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-black text-slate-800 dark:text-slate-100">{point.name}</span>
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-200">
                        {point.suggestedMonthlyPosts} 次/月
                      </span>
                      {safeArray(point.platforms).slice(0, 3).map(platform => (
                        <span key={platform} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          {platform}
                        </span>
                      ))}
                    </div>
                    {point.rationale && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{point.rationale}</p>
                    )}
                    {point.customerAction && (
                      <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">目标行动：{point.customerAction}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Monthly focus */}
          {safeArray(activeAnnual.monthlyFocus).length ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">月度计划</p>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {safeArray(activeAnnual.monthlyFocus).map(month => (
                  <div key={month.month} className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                    <p className="text-[10px] font-black text-purple-600">{month.month}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{month.focus}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

        </div>
      )}
    </div>
  )
}
