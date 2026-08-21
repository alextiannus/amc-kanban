'use client'

import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  X, ChevronLeft, Save,
  Settings, BookOpen, Loader2,
  RefreshCw, FileText, Store, Utensils,
  Edit3, Plus,
  Users, Goal, Target, HelpCircle
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
    metrics: string[]
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

type GrowthSyncStatus = {
  status: 'NOT_QUEUED' | 'PENDING' | 'PROCESSING' | 'CONFLICT' | 'SYNCED'
  pendingPaths: string[]
  attempts: number
  nextRetryAt: string | null
  errorCode: string | null
  errorMessage: string | null
  conflicts: Array<{ path: string; code: string; kanban_value: unknown; growth_value: unknown }>
  lastSyncedAt: string | null
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
  if (code === 'brand_plan_update_required') return '请先生成年度营销方案。'
  if (code === 'annual_plan_required') return '请先生成年度营销方案。'
  if (code === 'quarter_plan_required') return '请先生成季度营销方案。'
  return code || '营销方案操作失败，请重试'
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
  const [growthSyncStatus, setGrowthSyncStatus] = useState<GrowthSyncStatus | null>(null)

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
  const [planGenerating, setPlanGenerating] = useState<'research' | 'interview' | 'annual' | 'quarter' | 'calendar' | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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

  const loadGrowthSyncStatus = async () => {
    try {
      const res = await fetch(`/api/brands/${brandId}/growth-sync`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json() as GrowthSyncStatus
        setGrowthSyncStatus(data)
        return data
      }
    } catch (error) {
      console.error('Failed to load Growth sync status:', error)
    }
    return null
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
      // 1. Fetch brand metadata for details (description, location, address, etc.)
      const resBrand = await fetch(`/api/brands/${brandId}`)
      if (resBrand.ok) {
        const dataBrand = await resBrand.json()
        setDraftName(dataBrand.name || '')
        setDraftDesc(dataBrand.description || '')
        setDraftLocation(dataBrand.location || '')
        setBrandSettings(dataBrand)
        // Always reset logo — don't keep brand A's logo if brand B has none
        setLogoPreview(dataBrand.logoUrl || null)
        // Always reset contact fields — prevents A's address from showing on B
        setDraftAddress(dataBrand.address || '')
        setDraftPhone(dataBrand.phone || '')
        setDraftWebsite(dataBrand.website || '')
      } else {
        // Fetch failed — ensure all brand meta fields are cleared
        setDraftName(''); setDraftDesc(''); setDraftLocation('')
        setDraftAddress(''); setDraftPhone(''); setDraftWebsite('')
        setLogoPreview(null)
      }

      // 2. Fetch brand knowledge (all sections)
      const resKnowledge = await fetch(`/api/brands/${brandId}/knowledge`)
      if (resKnowledge.ok) {
        const k = await resKnowledge.json()
        // Section 1 — brand plan / tone
        setLocalBrandTone(k.brandTone || '')
        setDraftAudience(k.audienceAssumptions || '')
        setDraftProduct(k.productAssumptions || '')
        // Section 2 — business info
        // Always set (not conditionally): if brand B has no hours, clear the field
        if (typeof k.businessHours === 'string') setDraftBusinessHours(k.businessHours)
        else if (k.businessHours && typeof k.businessHours === 'object') setDraftBusinessHours(JSON.stringify(k.businessHours, null, 2))
        else setDraftBusinessHours('')
        setDraftReservationUrl(k.reservationUrl || '')
        setDraftOrderingUrl(k.orderingUrl || '')
        setDraftStores(Array.isArray(k.stores) ? k.stores : [])
        // Section 3 — knowledge base
        setDraftMarket(k.market || '')
        setDraftDistrict(k.district || '')
        setDraftMenuItems(Array.isArray(k.menuItems) ? k.menuItems : [])
        // Section 4 — local creative identity & publishing frequency
        setCreativeIdentity({
          brandVoice: k.brandVoice || '',
          brandImage: k.brandImage || '',
          promotionFocus: k.promotionFocus || '',
        })
      } else {
        // No knowledge record for this brand — reset every section to empty defaults
        setLocalBrandTone('')
        setDraftAudience(''); setDraftProduct('')
        setDraftBusinessHours(''); setDraftReservationUrl(''); setDraftOrderingUrl(''); setDraftStores([])
        setDraftMarket(''); setDraftDistrict('')
        setDraftMenuItems([])
        setCreativeIdentity({ brandVoice: '', brandImage: '', promotionFocus: '' })
      }

      // 3. Fetch subscription
      const resSub = await fetch(`/api/brands/${brandId}/subscription`)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile()
    void loadAllConfig()
    void loadBrandPlanWorkspace()
    void loadIdentity()
    void loadGrowthSyncStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  useEffect(() => {
    if (!growthSyncStatus || !['PENDING', 'PROCESSING'].includes(growthSyncStatus.status)) return
    const timer = window.setInterval(() => {
      void loadGrowthSyncStatus()
      void loadIdentity()
    }, 5000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, growthSyncStatus?.status])

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
      await loadGrowthSyncStatus()
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
        await loadGrowthSyncStatus()
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

  const handleGenerateResearchReport = async () => {
    setPlanGenerating('research')
    try {
      const nextPlan = await runBrandPlanAction('generate_research_report', '品牌摸底报告已生成')
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
      await runBrandPlanAction('generate_annual_plan', '年度营销方案已生成')
    } finally {
      setPlanGenerating(null)
    }
  }

  const handleGenerateQuarterPlan = async () => {
    setPlanGenerating('quarter')
    try {
      await runBrandPlanAction('generate_quarter_plan', '季度营销方案已生成')
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
    setDraftStores([...draftStores, { storeId: createStoreId(), name: '', address: '' }])
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
  const currentQuarter = `Q${Math.floor(new Date().getMonth() / 3) + 1}`
  const currentQuarterPlan = brandPlanData.quarterlyPlans?.find(item => item.quarter === currentQuarter) || brandPlanData.quarterlyPlans?.[0]
  const currentCalendarItems = brandPlanData.publishingCalendar?.months?.[calendarMonth] || []
  const sourceStatusItems = [
    { label: '数据调研', value: report ? '已生成' : '待生成' },
    { label: '品牌主张', value: merchantInterviewRequired ? '需完成' : '已记录' },
    { label: '营销方案输入', value: brandPlanUpdated ? '已具备' : '待完善' },
    { label: '年度营销方案', value: annualPlan ? '已生成' : '待生成' },
    { label: '发布日历', value: currentCalendarItems.length ? `${currentCalendarItems.length} 条` : '待生成' },
  ]

  const reportModal = showResearchReport && (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => setShowResearchReport(false)} />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">品牌摸底报告</h3>
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
            <h3 className="text-sm font-black text-slate-900 dark:text-white">品牌主张访谈与记录</h3>
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
          {interview?.answers?.length ? (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs font-black text-slate-900 dark:text-white">已保存访谈产出</p>
              <div className="mt-3 space-y-3">
                {interview.answers.map(item => (
                  <div key={item.question}>
                    <p className="text-xs font-bold text-slate-500">{item.question}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{item.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
            <button type="button" onClick={openEditableBrandContext} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-extrabold text-white dark:bg-white dark:text-slate-900">
              <BookOpen className="h-3.5 w-3.5" /> 编辑品牌计划与门店
            </button>
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
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">先沉淀品牌信息、门店信息、品牌主张、数据调研和订阅策略，再由 AMC-Kanban 生成年度营销方案、季度营销方案和可执行的发布日历。</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {sourceStatusItems.map(item => (
                  <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                    <p className="text-[10px] font-bold text-slate-400">{item.label}</p>
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
              <button type="button" onClick={openEditableBrandContext} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
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
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">数据调研摸底报告</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">同步 amc-growth 和现有品牌资料，先生成我们已经知道什么、还缺什么。</p>
                </div>
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-950 dark:text-slate-300">{report?.summary || '尚未生成摸底报告。'}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={handleGenerateResearchReport} disabled={Boolean(planGenerating)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'research' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} 生成品牌摸底报告
                </button>
                <button type="button" onClick={() => setShowResearchReport(true)} disabled={!report} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">查看摸底报告</button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">品牌主张访谈与记录</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">提供主理人访谈指南；可参考摸底报告，访谈后记录老板原话和关键判断。</p>
                </div>
                <HelpCircle className="h-5 w-5 text-amber-500" />
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                {interview?.summary || (merchantInterviewRequired ? '需要完成品牌主张访谈。系统提供访谈指南；主理人完成访谈后，在这里保存品牌主张。' : '系统提供访谈指南；主理人完成访谈后，在这里保存品牌主张。')}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={openMerchantInterviewPanel} disabled={Boolean(planGenerating)} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  <Users className="h-3.5 w-3.5" /> 访谈指南与记录
                </button>
                <button type="button" onClick={openMerchantInterviewPanel} disabled={!interview} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">查看访谈产出</button>
              </div>
            </div>
          </section>

          <section id="marketing-solution-inputs" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Section 2</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">营销方案输入</h3>
                <p className="mt-1 text-xs text-slate-500">汇总品牌信息、门店信息、品牌主张、数据调研和订阅策略。</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                { title: '品牌定位', value: identityText('targetAudience', draftAudience) || parsedBrandPositioning || '待确认目标客群和消费场景。' },
                { title: '品牌形象', value: identityText('brandImage', creativeIdentity.brandImage) || report?.brandImage || '待整理视觉与内容呈现方向。' },
                { title: '品牌声音', value: identityText('brandVoice', creativeIdentity.brandVoice) || identityText('brandTone', activeBrandTone) || '亲切、具体、接地气。' },
                { title: '核心产品/服务', value: primaryProductList().join('、') || '待从菜单/SKU 中确认。' },
                { title: '目标人群', value: identityText('targetAudience', draftAudience) || '附近上班族、居民、家庭客等需老板确认。' },
                { title: '推广点', value: identityText('promotionFocus', creativeIdentity.promotionFocus) || report?.growthPoints.join('；') || '招牌、位置、价格、环境、服务和活动。' },
              ].map(item => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs font-black text-slate-900 dark:text-white">{item.title}</p>
                  <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-purple-600">Section 3</p>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">年度营销方案</h3>
                </div>
                <button type="button" onClick={handleGenerateAnnualPlan} disabled={Boolean(planGenerating)} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'annual' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Goal className="h-3.5 w-3.5" />} 生成年度营销方案
                </button>
              </div>
              {annualPlan ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{annualPlan.theme}</p>
                  <p className="text-xs text-slate-500">{annualPlan.goal}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {annualPlan.quarterlyFocus.map(item => (
                      <div key={item.quarter} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100">{item.quarter}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.focus}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="mt-4 text-xs text-slate-500">由 AMC-Kanban 读取五块输入，生成年度市场目标和四个季度重点。</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Section 3</p>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">季度营销方案</h3>
                </div>
                <button type="button" onClick={handleGenerateQuarterPlan} disabled={Boolean(planGenerating) || !annualPlan} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'quarter' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />} 生成季度营销方案
                </button>
              </div>
              {currentQuarterPlan ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{currentQuarterPlan.quarter} · {currentQuarterPlan.objective}</p>
                  <div className="space-y-2">
                    {currentQuarterPlan.monthlyFocus.map(item => (
                      <div key={item.month} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                        <span className="w-16 text-xs font-black text-indigo-600">{item.month}</span>
                        <span className="text-xs text-slate-600 dark:text-slate-300">{item.focus}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="mt-4 text-xs text-slate-500">从年度营销方案拆出当前季度目标、每月重点和内容方向。</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Section 4</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">发布日历</h3>
                <p className="mt-1 text-xs text-slate-500">逐月向后查看每日内容策划和样板爆品。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">上个月</button>
                <input type="month" value={calendarMonth} onChange={event => setCalendarMonth(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-950" />
                <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">下个月</button>
                <button type="button" onClick={handleGeneratePublishingCalendar} disabled={Boolean(planGenerating) || !currentQuarterPlan} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  {planGenerating === 'calendar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} 生成季度内容发布日历
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
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.planning}</p>
                  {item.materialRequirements?.length ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">素材要求：{item.materialRequirements.join('；')}</p>
                  ) : null}
                  <div className="mt-3 rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                    <span className="font-black text-rose-600">样板爆品：</span>{item.sampleHit}
                  </div>
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

      {reportModal}
      {interviewModal}
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
