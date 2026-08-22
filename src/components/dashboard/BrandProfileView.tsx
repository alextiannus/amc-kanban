'use client'

import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  X, ChevronLeft, Save,
  Settings, BookOpen, Loader2,
  RefreshCw, FileText, Store, Utensils,
  Edit3, Plus,
  Users, Goal, HelpCircle,
  MapPin, Music2, WalletCards
} from 'lucide-react'
import { motion } from 'framer-motion'
import type {
  BrandIdentityFieldKey,
  BrandIdentitySnapshot,
} from '@/lib/brandIdentity'

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

type StoreEntitlements = {
  storeLimit: number
  multiStoreAddonQuantity: number
}

type BrandPlanWorkspaceData = {
  researchReport?: {
    generatedAt: string
    summary: string
    dataSources: string[]
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
      materialRequirements?: string[]
      contentLibraryGap?: string
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

type EditableAiContent =
  | { target: 'research_report'; title: string; value: NonNullable<BrandPlanWorkspaceData['researchReport']> }
  | { target: 'annual_plan'; title: string; value: NonNullable<BrandPlanWorkspaceData['annualPlan']> }
  | { target: 'quarter_plan'; title: string; value: NonNullable<NonNullable<BrandPlanWorkspaceData['quarterlyPlans']>[number]> }
  | { target: 'calendar_month'; title: string; month: string; value: NonNullable<BrandPlanWorkspaceData['publishingCalendar']>['months'][string] }

type EditableSocialAccount = SocialAccountSummary & {
  loginUsername?: string | null
  loginPassword?: string | null
}


function createStoreId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `store_${crypto.randomUUID()}`
  }
  return `store_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function brandPlanErrorMessage(error: unknown) {
  const code = typeof error === 'string' ? error : ''
  if (code === 'merchant_interview_required') return '请先填写并保存品牌主张访谈。'
  if (code === 'brand_plan_update_required') return '请先生成品牌营销方案。'
  if (code === 'annual_plan_required') return '请先生成品牌营销方案。'
  if (code === 'quarter_plan_required') return '请先生成包含季度明细的品牌营销方案。'
  if (code === 'growth_research_still_running') return 'AMC-Growth 调研仍在进行中，请稍后再次读取报告。'
  if (code === 'growth_research_failed') return 'AMC-Growth 调研生成失败，请检查 Growth 服务或稍后重试。'
  if (code === 'growth_research_create_failed') return '未能触发 AMC-Growth 摸底调研，请检查 Growth 服务。'
  return code || '营销方案操作失败，请重试'
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

  // Local Brand States (fetched on mount/change, used if props are not passed)
  const [localBrandTone, setLocalBrandTone] = useState('')
  const [localSubscriptionPlan, setLocalSubscriptionPlan] = useState('未激活订阅')
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
  const [draftMenuItems, setDraftMenuItems] = useState<Array<Record<string, unknown>>>([])
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
      setTimeout(() => setToast(null), 3000)
    }
  }

  // Profile Markdown (embedded editor & growth parsing)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMarkdown, setProfileMarkdown] = useState('')
  const [brandPlanData, setBrandPlanData] = useState<BrandPlanWorkspaceData>({})
  const [merchantInterview, setMerchantInterview] = useState<MerchantInterviewRecord | null>(null)
  const [merchantInterviewRequired, setMerchantInterviewRequired] = useState(true)
  const [showResearchReport, setShowResearchReport] = useState(false)
  const [showInterviewReport, setShowInterviewReport] = useState(false)
  const [interviewDraftNotes, setInterviewDraftNotes] = useState('')
  const [editingAiContent, setEditingAiContent] = useState<EditableAiContent | null>(null)
  const [editingAiJson, setEditingAiJson] = useState('')
  const [planGenerating, setPlanGenerating] = useState<'research' | 'interview' | 'annual' | 'quarter' | 'calendar' | string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    // Pick the first month of the next quarter if the current quarter has <30 days left
    const now = new Date()
    const currentMonth = now.getMonth() // 0-indexed
    const currentQuarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2 // 0-indexed last month of this quarter
    const quarterEnd = new Date(now.getFullYear(), currentQuarterEndMonth + 1, 0) // last day of the quarter
    const daysLeft = Math.floor((quarterEnd.getTime() - now.getTime()) / 86400000)
    const startMonth = daysLeft >= 30
      ? now
      : new Date(now.getFullYear(), currentQuarterEndMonth + 1, 1) // first month of next quarter
    return `${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, '0')}`
  })

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
      setIdentitySnapshot(await res.json())
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
      setBrandPlanData(marketingSolution && typeof marketingSolution === 'object' && !Array.isArray(marketingSolution) ? marketingSolution : {})
      setMerchantInterview(data.merchantInterview || null)
      setMerchantInterviewRequired(data.merchantInterviewRequired !== false)
    } catch (error) {
      console.error('Failed to load brand plan workspace:', error)
    }
  }

  const loadAllConfig = async () => {
    try {
      // Fire all 3 fetches in parallel
      const [resBrand, resKnowledge, resSub] = await Promise.all([
        fetch(`/api/brands/${brandId}`),
        fetch(`/api/brands/${brandId}/knowledge`),
        fetch(`/api/brands/${brandId}/subscription`),
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
        setLocalBrandTone(k.brandTone || '')
        setDraftAudience(k.audienceAssumptions || '')
        setDraftProduct(k.productAssumptions || '')
        if (typeof k.businessHours === 'string') setDraftBusinessHours(k.businessHours)
        else if (k.businessHours && typeof k.businessHours === 'object') setDraftBusinessHours(JSON.stringify(k.businessHours, null, 2))
        else setDraftBusinessHours('')
        setDraftReservationUrl(k.reservationUrl || '')
        setDraftOrderingUrl(k.orderingUrl || '')
        setDraftStores(Array.isArray(k.stores) ? k.stores : [])
        setDraftMarket(k.market || '')
        setDraftDistrict(k.district || '')
        setDraftMenuItems(Array.isArray(k.menuItems) ? k.menuItems : [])
        setDraftMenuText(Array.isArray(k.menuItems) ? k.menuItems.map((item: Record<string, unknown>) => String(item.name || item.title || '').trim()).filter(Boolean).join('\n') : '')
        setDraftCompetitorsText(Array.isArray(k.competitors) ? k.competitors.join('\n') : '')
        setCreativeIdentity({
          brandVoice: k.brandVoice || '',
          brandImage: k.brandImage || '',
          promotionFocus: k.promotionFocus || '',
        })
      } else {
        setLocalBrandTone('')
        setDraftAudience(''); setDraftProduct('')
        setDraftBusinessHours(''); setDraftReservationUrl(''); setDraftOrderingUrl(''); setDraftStores([])
        setDraftMarket(''); setDraftDistrict('')
        setDraftMenuItems([])
        setDraftMenuText('')
        setDraftCompetitorsText('')
        setCreativeIdentity({ brandVoice: '', brandImage: '', promotionFocus: '' })
      }

      // 3. Subscription
      if (resSub.ok) {
        const dataSub = await resSub.json()
        setLocalSubscriptionPlan(dataSub.plan_name === 'NONE' ? '未激活订阅' : dataSub.plan_name)
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

  const runBrandPlanAction = async (
    action: string,
    successMsg: string,
    body: Record<string, unknown> = {}
  ) => {
    const res = await fetch(`/api/brands/${brandId}/brand-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToastVal(brandPlanErrorMessage(data.error), 'error')
      return null
    }
    const marketingSolution = data.marketingSolution || data.brandPlan
    if (marketingSolution && typeof marketingSolution === 'object') {
      setBrandPlanData(marketingSolution)
    }
    setMerchantInterview(data.merchantInterview || null)
    setMerchantInterviewRequired(data.merchantInterviewRequired !== false)
    showToastVal(successMsg, 'success')
    await loadAllConfig()
    await loadIdentity()
    return data as { brandPlan: BrandPlanWorkspaceData; marketingSolution?: BrandPlanWorkspaceData; merchantInterview?: MerchantInterviewRecord | null }
  }

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
      const menuItems = textLines(draftMenuText).map((name, index) => {
        const existing = draftMenuItems[index] || {}
        return { ...existing, name }
      })
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
          menuItems,
        }),
      })
      if (!knowledgeRes.ok) throw new Error('brand_knowledge_save_failed')

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

      showToastVal('品牌计划内容已保存', 'success')
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
    const menuProducts = draftMenuItems.map((item) => String(item?.name || item?.title || '').trim()).filter(Boolean)
    if (menuProducts.length) return menuProducts.slice(0, 4)
    const sellingPoints = identityList('sellingPoints', [])
    if (sellingPoints.length) return sellingPoints.slice(0, 4)
    return (draftProduct || creativeIdentity.promotionFocus || draftDesc)
      .split(/[\n,，;；、]/)
      .map(item => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 4)
  }

  const handleViewResearchReport = async () => {
    if (report) {
      setShowResearchReport(true)
      return
    }
    // No local report — fetch from Growth
    setPlanGenerating('research')
    try {
      const nextPlan = await runBrandPlanAction('generate_research_report', '品牌调研报告已获取')
      if ((nextPlan?.marketingSolution || nextPlan?.brandPlan)?.researchReport) setShowResearchReport(true)
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
        summary: '主理人已记录商家主张，可用于生成后续营销方案。',
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
    try {
      await runBrandPlanAction('generate_annual_plan', '品牌营销方案已生成')
    } finally {
      setPlanGenerating(null)
    }
  }

  const addMonths = (month: string, offset: number) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const date = new Date(year, monthNumber - 1 + offset, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  const handleGeneratePublishingCalendar = async () => {
    setPlanGenerating('calendar')
    try {
      await runBrandPlanAction('generate_publishing_calendar', '季度内容发布日历已生成', { month: calendarMonth })
    } finally {
      setPlanGenerating(null)
    }
  }

  const handleRegenerateCalendarItem = async (itemId?: string) => {
    if (!itemId) return
    const loadingKey = `calendar_item:${itemId}`
    setPlanGenerating(loadingKey)
    try {
      await runBrandPlanAction('regenerate_calendar_item', '该条发布创意已重新生成', { month: calendarMonth, itemId })
    } finally {
      setPlanGenerating(null)
    }
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
  const interview = merchantInterview
  const annualPlan = brandPlanData.annualPlan
  const brandPlanUpdated = Boolean(brandPlanData.researchReport || merchantInterview)
  const selectedCalendarQuarter = quarterForMonthValue(calendarMonth)
  const annualQuarterPlans = annualPlan?.quarterlyPlans || []
  const currentAnnualQuarterPlan = annualQuarterPlans.find(item => item.quarter === selectedCalendarQuarter)
  const currentQuarterPlan = brandPlanData.quarterlyPlans?.find(item => item.quarter === selectedCalendarQuarter)
  const calendarQuarterReady = Boolean(currentQuarterPlan || currentAnnualQuarterPlan)
  const currentCalendarItems = brandPlanData.publishingCalendar?.months?.[calendarMonth] || []
  const socialAccounts: SocialAccountSummary[] = Array.isArray(brandSettings?.accounts) ? brandSettings.accounts : []
  const postfastSyncedAt = typeof brandSettings?.postfastSyncedAt === 'string' ? brandSettings.postfastSyncedAt : null
  const sourceStatusItems = [
    { label: '数据调研', value: report ? '已生成' : '待生成', status: report ? 'ready' : 'pending' },
    { label: '社交媒体渠道', value: socialAccounts.length ? `${socialAccounts.length} 个账号` : '待同步', status: socialAccounts.length ? 'ready' : 'pending' },
    { label: '品牌主张', value: merchantInterviewRequired ? '需完成' : '已记录', status: merchantInterviewRequired ? 'pending' : 'ready' },
    { label: '营销方案输入', value: brandPlanUpdated ? '已具备' : '待完善', status: brandPlanUpdated ? 'ready' : 'warning' },
    { label: '品牌营销方案', value: annualPlan ? (annualQuarterPlans.length ? `已生成 · ${annualQuarterPlans.length}季` : '已生成') : '待生成', status: annualPlan ? 'ready' : 'pending' },
    { label: '发布日历', value: currentCalendarItems.length ? `${currentCalendarItems.length} 条` : '待生成', status: currentCalendarItems.length ? 'ready' : 'pending' },
  ]

  const reportModal = showResearchReport && (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => setShowResearchReport(false)} />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">品牌调研报告</h3>
            <p className="mt-1 text-xs text-slate-400">{report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : '尚未生成'}</p>
          </div>
          <button type="button" onClick={() => setShowResearchReport(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
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
            <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">不要问品牌大词，只问老板每天能回答的具体生意判断。记录老板原话，后面由系统整理成品牌计划。</p>
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
              <p className="truncate text-[11px] font-semibold text-slate-400">{draftLocation || draftMarket || '品牌计划工作台'}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={handleOpenSettings} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-extrabold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Settings className="h-3.5 w-3.5" /> 品牌配置
            </button>
            <button type="button" onClick={openPlanEditor} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-extrabold text-white dark:bg-white dark:text-slate-900">
              <BookOpen className="h-3.5 w-3.5" /> 编辑品牌计划与门店
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
                <h2 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">品牌计划与营销方案</h2>
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
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="grid gap-3 text-sm">
                  {[
                    ['品牌名称', draftName || brand.name],
                    ['品牌介绍', draftDesc || '待补充'],
                    ['联系电话', draftPhone || '待补充'],
                    ['官网链接', draftWebsite || '待补充'],
                    ['所在市场', [draftMarket, draftDistrict].filter(Boolean).join(' / ') || draftLocation || '待补充'],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[86px_1fr] gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-400">{label}</span>
                      <span className="break-words text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-200">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
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
                    <div key={store.storeId || index} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
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
                    <p className="mb-2 text-xs font-black text-slate-500">SKU / 菜单列表</p>
                    <div className="flex flex-wrap gap-2">
                      {draftMenuItems.slice(0, 12).map((item, index) => (
                        <span key={`${String(item.name || item.title || 'sku')}-${index}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {String(item.name || item.title || `SKU ${index + 1}`)}
                        </span>
                      ))}
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
                      <div key={account.id} className="flex min-w-[220px] max-w-full flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950 sm:max-w-[320px]">
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
            {/* 数据调研报告 — compact row */}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <FileText className="h-4 w-4 shrink-0 text-blue-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 dark:text-white">数据调研报告</p>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-slate-500">{report ? report.summary : '尚未获取调研报告'}</p>
              </div>
              <button
                type="button"
                onClick={handleViewResearchReport}
                disabled={Boolean(planGenerating)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
              >
                {planGenerating === 'research' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                品牌调研报告
              </button>
            </div>
            {/* 品牌主张访谈 — compact row */}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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

          {/* Section 2: 营销方案输入 — 系统逻辑，不在页面展示 */}



          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-purple-600">Section 2</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">品牌营销方案</h3>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={handleGenerateAnnualPlan} disabled={Boolean(planGenerating)} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'annual' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Goal className="h-3.5 w-3.5" />} {annualPlan ? '重新生成营销方案' : '生成品牌营销方案'}
                </button>
                <button type="button" onClick={() => annualPlan && openAiContentEditor({ target: 'annual_plan', title: '编辑品牌营销方案', value: annualPlan })} disabled={!annualPlan || Boolean(planGenerating)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">
                  编辑
                </button>
              </div>
            </div>
            {annualPlan ? (
              <div className="mt-4 space-y-4">
                {/* Annual overview */}
                <div className="rounded-xl bg-gradient-to-br from-purple-50 to-slate-50 p-4 dark:from-purple-950/20 dark:to-slate-950">
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
                </div>
                {/* Quarter tabs */}
                {annualQuarterPlans.length ? (
                  <QuarterPlanTabs
                    annualQuarterPlans={annualQuarterPlans}
                    quarterlyPlans={brandPlanData.quarterlyPlans || []}
                    planGenerating={planGenerating}
                    onGenerateQuarter={async (quarter) => {
                      setPlanGenerating('quarter')
                      try {
                        await runBrandPlanAction('generate_quarter_plan', `${quarter} 季度营销方案已生成`, { quarter })
                      } finally {
                        setPlanGenerating(null)
                      }
                    }}
                    onEditQuarter={(quarterPlan) => openAiContentEditor({ target: 'quarter_plan', title: `${quarterPlan.quarter} 季度营销方案`, value: quarterPlan })}
                  />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {annualPlan.quarterlyFocus.map(item => (
                      <div key={item.quarter} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100">{item.quarter}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.focus}</p>
                        {item.campaigns.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.campaigns.map(c => <span key={c} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-950 dark:text-purple-200">{c}</span>)}
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
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">尚未生成品牌营销方案</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">通过 LLM 读取品牌信息、调研报告、访谈记录和订阅运营策略，生成包含四个季度推广策略、推广点和月度内容方向的全年计划。</p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Section 4</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">发布日历</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">上个月</button>
                <input type="month" value={calendarMonth} onChange={event => setCalendarMonth(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950" />
                <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">下个月</button>
                <button type="button" onClick={handleGeneratePublishingCalendar} disabled={Boolean(planGenerating) || !calendarQuarterReady} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'calendar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} 生成季度内容发布日历
                </button>
                <button type="button" onClick={() => openAiContentEditor({ target: 'calendar_month', title: `${calendarMonth} 发布日历`, month: calendarMonth, value: currentCalendarItems })} disabled={!currentCalendarItems.length || Boolean(planGenerating)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">
                  编辑
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {currentCalendarItems.length ? currentCalendarItems.map((item, index) => (
                <div key={item.id || `${item.date}-${item.platformSlug || item.platform}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-black text-white dark:bg-white dark:text-slate-900">{item.date.slice(5)}</span>
                    <span className="text-[10px] font-bold text-slate-400">{item.platform} · {item.contentType}</span>
                  </div>
                  <h4 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{item.title}</h4>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.planning}</p>
                  {item.materialRequirements?.length ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">素材要求：{item.materialRequirements.join('；')}</p>
                  ) : null}
                  <div className="mt-3 rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                    <span className="font-black text-rose-600">样板爆品：</span>{item.sampleHit}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRegenerateCalendarItem(item.id)}
                    disabled={Boolean(planGenerating) || !item.id}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {planGenerating === `calendar_item:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} 单独重新生成这条创意
                  </button>
                </div>
              )) : (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">当前月份还没有发布策划。请选择月份后生成内容发布日历。</div>
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
                <h3 className="text-sm font-black text-slate-900 dark:text-white">编辑品牌计划内容</h3>
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
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">SKU / 菜单列表</span>
                  <textarea value={draftMenuText} onChange={event => setDraftMenuText(event.target.value)} rows={5} placeholder="每行一个产品或服务" className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300">竞品列表</span>
                  <textarea value={draftCompetitorsText} onChange={event => setDraftCompetitorsText(event.target.value)} rows={5} placeholder="每行一个竞品" className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
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
                <p className="mt-1 text-xs text-slate-400">保存后回写当前品牌计划版本</p>
              </div>
              <button type="button" onClick={() => setEditingAiContent(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <textarea
                value={editingAiJson}
                onChange={event => setEditingAiJson(event.target.value)}
                spellCheck={false}
                className="min-h-[520px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
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
        <div className={`fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold text-white shadow-lg ${
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

type StandaloneQuarterPlan = {
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
}

function QuarterPlanTabs({
  annualQuarterPlans,
  quarterlyPlans,
  planGenerating,
  onGenerateQuarter,
  onEditQuarter,
}: {
  annualQuarterPlans: AnnualQuarterPlan[]
  quarterlyPlans: StandaloneQuarterPlan[]
  planGenerating: string | null
  onGenerateQuarter: (quarter: string) => Promise<void>
  onEditQuarter: (plan: StandaloneQuarterPlan) => void
}) {
  const [activeQuarter, setActiveQuarter] = useState(annualQuarterPlans[0]?.quarter || 'Q1')
  const activeAnnual = annualQuarterPlans.find(q => q.quarter === activeQuarter)
  const activeStandalone = quarterlyPlans.find(q => q.quarter === activeQuarter)

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
            {q.quarter}
          </button>
        ))}
      </div>

      {activeAnnual && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          {/* Quarter header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-purple-600">{activeAnnual.quarter}</p>
              <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{activeAnnual.focus}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{activeAnnual.strategy}</p>
            </div>
            {activeAnnual.campaigns.length ? (
              <div className="flex shrink-0 flex-col items-end gap-1">
                {activeAnnual.campaigns.slice(0, 3).map(c => (
                  <span key={c} className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">{c}</span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Promotion points */}
          {activeAnnual.promotionPoints.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">推广点</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeAnnual.promotionPoints.map(point => (
                  <div key={point.name} className="rounded-lg border border-white bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-black text-slate-800 dark:text-slate-100">{point.name}</span>
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-200">
                        {point.suggestedMonthlyPosts} 次/月
                      </span>
                      {point.platforms.slice(0, 3).map(platform => (
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
          {activeAnnual.monthlyFocus.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">月度计划</p>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {activeAnnual.monthlyFocus.map(month => (
                  <div key={month.month} className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                    <p className="text-[10px] font-black text-purple-600">{month.month}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{month.focus}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Standalone quarter plan or generate CTA */}
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            {activeStandalone ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">独立季度方案</p>
                  <button
                    type="button"
                    onClick={() => onEditQuarter(activeStandalone)}
                    className="text-[10px] font-bold text-purple-600 hover:text-purple-700"
                  >
                    编辑
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{activeStandalone.objective}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onGenerateQuarter(activeAnnual.quarter)}
                disabled={Boolean(planGenerating)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-50 disabled:opacity-60 dark:border-purple-900 dark:bg-slate-900 dark:text-purple-300"
              >
                {planGenerating === 'quarter' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                深化生成 {activeAnnual.quarter} 季度方案
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
