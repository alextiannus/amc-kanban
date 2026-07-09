'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  X, ChevronLeft, Sparkles, MapPin, Zap, Save,
  Settings, BookOpen, ExternalLink, Package, Loader2,
  RefreshCw, FileText, CheckCircle2, Store, Utensils,
  Camera, Edit3, Check, Plus, Trash2, ArrowRight,
  Star, Users, ChevronRight, Goal, Target, HelpCircle, Trophy,
  Bookmark, Compass
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ─── Types ────────────────────────────────────────────────────────────────────

import { BrandSettingsPanel } from './BrandSettingsPanel'

interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  autoPilot?: boolean
  logoUrl?: string | null
}

interface Props {
  brand?: Brand
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

type Tab = 'story' | 'growth' | 'config' | 'context'

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

export default function BrandProfileView({
  brand,
  onClose,
  brandTone,
  setBrandTone,
  slangDict,
  setSlangDict,
  subscriptionPlan,
  addons,
  showToast,
  onOpenSettings,
  onOpenKnowledge,
  subscriptionHref,
}: Props) {
  // Early return if no brand or brand.id is provided, placed at the top to satisfy TypeScript compiler
  if (!brand || !brand.id) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-955 text-center">
        <div className="max-w-sm">
          <Store className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-400">暂无选定品牌</p>
          <p className="text-xs text-slate-400 dark:text-slate-505 mt-1">请先在左上角切换或选择一个品牌进行代运营配置。</p>
        </div>
      </div>
    )
  }

  const brandId = brand.id

  const [activeTab, setActiveTab] = useState<Tab>('story')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncingAccounts, setSyncingAccounts] = useState(false)
  const [syncAccountsStatus, setSyncAccountsStatus] = useState<string | null>(null)

  // Layout presentation states
  const [showStoryEditor, setShowStoryEditor] = useState(false)
  const [showDetailedReport, setShowDetailedReport] = useState(false)

  // Local Brand States (fetched on mount/change, used if props are not passed)
  const [localBrandTone, setLocalBrandTone] = useState('')
  const [localSlangDict, setLocalSlangDict] = useState<Record<string, string>>({})
  const [localSubscriptionPlan, setLocalSubscriptionPlan] = useState('未激活订阅')
  const [localAddons, setLocalAddons] = useState({ veo3: false, dubco: false })
  const [showSettings, setShowSettings] = useState(false)
  const [brandSettings, setBrandSettings] = useState<Record<string, unknown> | null>(null)

  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showContextModal, setShowContextModal] = useState(false)

  // Controlled vs Uncontrolled logic
  const activeBrandTone = brandTone !== undefined ? brandTone : localBrandTone
  const activeSlangDict = slangDict !== undefined ? slangDict : localSlangDict
  const activeSubscriptionPlan = subscriptionPlan !== undefined ? subscriptionPlan : localSubscriptionPlan
  const activeAddons = addons !== undefined ? addons : localAddons

  const setBrandToneVal = setBrandTone || setLocalBrandTone
  const setSlangDictVal = setSlangDict || setLocalSlangDict

  // Inline brand info editing
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(brand.name || '')
  const [draftDesc, setDraftDesc] = useState(brand.description || '')
  const [draftLocation, setDraftLocation] = useState(brand.location || '')

  // Logo upload
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(brand.logoUrl || null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Slang form
  const [newTerm, setNewTerm] = useState('')
  const [newMeaning, setNewMeaning] = useState('')

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
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileMarkdown, setProfileMarkdown] = useState('')
  const [profileViewMode, setProfileViewMode] = useState<'edit' | 'preview'>('preview')

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
        if (dataBrand.logoUrl) {
          setLogoPreview(dataBrand.logoUrl)
        }
      }

      // 2. Fetch brand knowledge (tone & slang)
      const resKnowledge = await fetch(`/api/brands/${brandId}/knowledge`)
      if (resKnowledge.ok) {
        const dataKnowledge = await resKnowledge.json()
        setLocalBrandTone(dataKnowledge.brandTone || '')
        setLocalSlangDict(dataKnowledge.slangDict || {})
      }

      // 3. Fetch subscription
      const resSub = await fetch(`/api/brands/${brandId}/subscription`)
      if (resSub.ok) {
        const dataSub = await resSub.json()
        setLocalSubscriptionPlan(dataSub.plan_name === 'NONE' ? '未激活订阅' : dataSub.plan_name)
        setLocalAddons({
          veo3: !!dataSub.selectedAddons?.veo3,
          dubco: !!dataSub.selectedAddons?.dubco,
        })
      }
    } catch (e) {
      console.error('Failed to load brand configuration:', e)
    }
  }

  useEffect(() => {
    void loadProfile()
    void loadAllConfig()
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
      setProfileSaved(true)
      showToastVal('品牌 Profile 已保存', 'success')
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (e) {
      console.error(e)
      showToastVal('保存品牌 Profile 失败，请检查网络', 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleRefreshProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile?refresh=1`)
      if (!res.ok) {
        showToastVal('刷新 Profile 失败，请稍后再试', 'error')
        return
      }
      const data = await res.json()
      const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
      setProfileMarkdown(markdown)
      showToastVal('品牌自动部分刷新成功', 'success')
    } catch (e) {
      console.error(e)
      showToastVal('刷新 Profile 失败，请检查网络', 'error')
    } finally {
      setProfileLoading(false)
    }
  }

  const extractBlock = (markdownStr: string, startTag: string, endTag: string): string => {
    const startIdx = markdownStr.indexOf(startTag)
    const endIdx = markdownStr.indexOf(endTag)
    if (startIdx >= 0 && endIdx > startIdx) {
      return markdownStr.slice(startIdx + startTag.length, endIdx).trim()
    }
    return ''
  }

  const growthContext = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:START -->',
    '<!-- AMC:BRAND_PROFILE:GROWTH_CONTEXT:END -->'
  )

  const growthPlan = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:START -->',
    '<!-- AMC:BRAND_PROFILE:GROWTH_PLAN:END -->'
  )

  const presentationSlidesRaw = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:START -->',
    '<!-- AMC:BRAND_PROFILE:PRESENTATION_SLIDES:END -->'
  )

  let presentationSlides: Array<{ title: string; content: string }> = []
  if (presentationSlidesRaw) {
    try {
      presentationSlides = JSON.parse(presentationSlidesRaw)
    } catch (e) {
      console.error('Failed to parse synced presentation slides:', e)
    }
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

  // Parse deep brand context from synced AMC-Growth markdown
  const parsedTargets = extractSubBlock(growthContext, '### 8.2 老板目标')
  const parsedPainPoints = extractSubBlock(growthContext, '### 8.3 当前痛点')
  const parsedProductAssumptions = extractSubBlock(growthContext, '### 8.4 核心产品假设')
  const parsedAudienceAssumptions = extractSubBlock(growthContext, '### 8.5 主要客群假设')

  // Parse brand story sections from synced AMC-Growth markdown
  const brandStoryRaw = extractBlock(
    profileMarkdown,
    '<!-- AMC:BRAND_PROFILE:BRAND_STORY:START -->',
    '<!-- AMC:BRAND_PROFILE:BRAND_STORY:END -->'
  )
  const parsedBrandStoryText = extractSubBlock(brandStoryRaw, '### 12.1 品牌故事')
  const parsedStoresInfo = extractSubBlock(brandStoryRaw, '### 12.2 门店信息')
  const parsedBrandPositioning = extractSubBlock(brandStoryRaw, '### 12.3 品牌定位')
  const parsedSignatureDishes = extractSubBlock(brandStoryRaw, '### 12.4 招牌菜')
  const parsedDiningGuide = extractSubBlock(brandStoryRaw, '### 12.5 用餐攻略')

  // Parse platform stats safely
  const accounts = (brandSettings?.accounts as any[]) || []
  const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followerCount || 0), 0)
  const googleAccount = accounts.find(acc => ['google', 'google_maps', 'gbp', 'gmb', 'google_business_profile'].includes(acc.platformId.toLowerCase()))
  const googleRating = googleAccount?.ratingScore || null
  const hasRealData = totalFollowers > 0 || googleRating !== null

  const cleanBrandStoryText = (text: string): string => {
    if (!text) return ''
    const sentences = text.split(/([。！？；.!?;\n])/)
    const result: string[] = []
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i]
      if (!s) continue
      const lower = s.toLowerCase()
      const isSystemInfo =
        lower.includes('订阅服务') ||
        lower.includes('starter plan') ||
        lower.includes('essential plan') ||
        lower.includes('pro plan') ||
        lower.includes('本文保留') ||
        lower.includes('实际执行') ||
        lower.includes('范围落地') ||
        lower.includes('升级探讨') ||
        lower.includes('代更新')
      if (isSystemInfo) {
        if (i + 1 < sentences.length && /^[。！？；.!?;\n]/.test(sentences[i + 1])) {
          i++
        }
        continue
      }
      result.push(s)
    }
    return result.join('').trim().replace(/\n+/g, '\n').replace(/^\s+|\s+$/g, '')
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSyncGrowth = async () => {
    setSyncing(true)
    setSyncStatus('正在同步...')
    try {
      const res = await fetch(`/api/brands/${brandId}/sync-growth`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncStatus('同步成功')
        showToastVal(`品牌分析同步成功 (${data.merchantName || data.merchantId})`, 'success')
        void loadProfile() // Refresh local copy of profile markdown
        void loadAllConfig()
        setTimeout(() => setSyncStatus(null), 3000)
      } else {
        setSyncStatus('同步失败')
        showToastVal(data.error || '同步失败，未找到匹配 hometown 的 Growth 商家分析', 'error')
        setTimeout(() => setSyncStatus(null), 5000)
      }
    } catch (e) {
      console.error(e)
      setSyncStatus('同步失败')
      showToastVal('网络请求失败', 'error')
      setTimeout(() => setSyncStatus(null), 5000)
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAccounts = async () => {
    setSyncingAccounts(true)
    setSyncAccountsStatus('正在同步...')
    try {
      const res = await fetch(`/api/brands/${brandId}/sync-postfast`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncAccountsStatus('同步成功')
        showToastVal(`已成功同步 ${data.accountCount || 0} 个社交媒体账号和发布数据！`, 'success')
        void loadAllConfig() // Refresh settings and accounts
        setTimeout(() => setSyncAccountsStatus(null), 3000)
      } else {
        setSyncAccountsStatus('同步失败')
        showToastVal(data.error || '同步账号失败', 'error')
        setTimeout(() => setSyncAccountsStatus(null), 5000)
      }
    } catch (e) {
      console.error(e)
      setSyncAccountsStatus('同步失败')
      showToastVal('同步请求失败，请检查网络连接', 'error')
      setTimeout(() => setSyncAccountsStatus(null), 5000)
    } finally {
      setSyncingAccounts(false)
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setLogoPreview(previewUrl)
    setUploadingLogo(true)
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
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSaveBrandInfo = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, description: draftDesc, location: draftLocation }),
      })
      if (res.ok) {
        showToastVal('品牌信息已保存', 'success')
        setEditingName(false)
      } else {
        showToastVal('保存失败，请重试', 'error')
      }
    } catch {
      showToastVal('网络错误，保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveVoice = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/knowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandTone: activeBrandTone, slangDict: activeSlangDict }),
      })
      if (res.ok) {
        showToastVal('品牌语气与术语已保存', 'success')
      } else {
        showToastVal('保存失败，请重试', 'error')
      }
    } catch {
      showToastVal('网络错误，保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddSlang = () => {
    const term = newTerm.trim()
    const meaning = newMeaning.trim()
    if (!term || !meaning) return
    setSlangDictVal({ ...activeSlangDict, [term]: meaning })
    setNewTerm('')
    setNewMeaning('')
  }

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      setShowSettings(true)
    }
  }

  // ── Growth Slide Color Map helpers ──────────────────────────────────────────

  const getGrowthSlideGradient = (index: number) => {
    const gradients = [
      'from-indigo-650 via-purple-600 to-indigo-800',
      'from-rose-600 via-red-500 to-rose-700',
      'from-amber-600 via-orange-500 to-amber-700',
      'from-emerald-600 via-teal-500 to-emerald-700',
      'from-teal-600 via-cyan-500 to-teal-700',
      'from-cyan-600 via-blue-500 to-cyan-700',
      'from-pink-600 via-rose-500 to-pink-700',
      'from-purple-600 via-violet-500 to-purple-700',
      'from-violet-600 via-fuchsia-500 to-violet-700',
      'from-slate-700 via-slate-800 to-slate-900',
    ]
    return gradients[index % gradients.length]
  }

  const getGrowthSlideGlow = (index: number) => {
    const glows = [
      'rgba(99,102,241,0.22)',
      'rgba(239,68,68,0.22)',
      'rgba(245,158,11,0.22)',
      'rgba(16,185,129,0.22)',
      'rgba(20,184,166,0.22)',
      'rgba(6,182,212,0.22)',
      'rgba(236,72,153,0.22)',
      'rgba(139,92,246,0.22)',
      'rgba(168,85,247,0.22)',
      'rgba(75,85,99,0.22)',
    ]
    return glows[index % glows.length]
  }

  const getGrowthSlideEmoji = (title: string) => {
    if (title.includes('当前') || title.includes('判断')) return '🔍'
    if (title.includes('问题') || title.includes('痛点')) return '⚠️'
    if (title.includes('机会') || title.includes('优势')) return '💡'
    if (title.includes('30天') || title.includes('验证')) return '📅'
    if (title.includes('90天') || title.includes('增长')) return '📈'
    if (title.includes('180天') || title.includes('品牌')) return '🏆'
    if (title.includes('指标') || title.includes('成功')) return '📊'
    if (title.includes('内容') || title.includes('方向')) return '✍️'
    if (title.includes('下一步') || title.includes('行动')) return '🏁'
    return '🚀'
  }

  const formatSlideContent = (content: string) => {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.some(l => l.startsWith('-') || l.startsWith('*') || l.match(/^\d+\./))) {
      return (
        <ul className="list-disc list-inside space-y-3.5 mt-3.5 text-xs md:text-sm text-white/95 font-medium leading-relaxed">
          {lines.map((line, idx) => {
            const cleanLine = line.replace(/^[-*\d+.\s]+/, '')
            return <li key={idx} className="drop-shadow-sm">{cleanLine}</li>
          })}
        </ul>
      )
    }
    return (
      <p className="text-xs md:text-sm text-white/95 font-medium leading-relaxed drop-shadow-sm mt-3.5">
        {content}
      </p>
    )
  }

  const tabs = [
    { id: 'story', label: '品牌故事', icon: null },
    { id: 'context', label: '品牌上下文', icon: null },
  ] as const

  const activeSubscriptionHref = subscriptionHref || `/profile/principal/brands/${brandId}/billing`

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 bg-[#f7f9fb] dark:bg-slate-955 overflow-y-auto relative h-full"
    >
      {/* ── Unified Top Navigation Navbar (Consolidated Header) ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-3.5 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 transition-colors cursor-pointer"
              title="返回"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          
          <div className="flex items-center gap-2">
            {/* Logo in Navbar */}
            <div 
              className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200/50 dark:bg-slate-800 dark:border-slate-700 overflow-hidden flex items-center justify-center cursor-pointer group relative"
              onClick={() => logoInputRef.current?.click()}
              title="点击上传 Logo"
            >
              {logoPreview || brand.logoUrl ? (
                <img
                  src={logoPreview || brand.logoUrl!}
                  alt={draftName}
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.svg' }}
                />
              ) : (
                <Utensils className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />

            {/* Name & Badges */}
            <div className="flex items-center gap-1.5">
              {editingName ? (
                <div className="flex items-center gap-1">
                  <input
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 text-slate-855 dark:text-white text-xs font-black rounded-lg px-2 py-1 outline-none border border-slate-200 dark:border-slate-700 focus:border-amber-400"
                    placeholder="品牌名称"
                  />
                  <button
                    onClick={handleSaveBrandInfo}
                    disabled={saving}
                    className="p-1 bg-amber-500 text-white rounded-lg hover:bg-amber-655 cursor-pointer active:scale-95 transition-all"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="p-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 dark:bg-slate-750 dark:text-slate-350 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-black text-slate-855 dark:text-white truncate max-w-[120px] md:max-w-[200px]">{draftName}</h1>
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-0.5 text-slate-400 hover:text-slate-655 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}

              {draftLocation && (
                <span className="hidden md:flex items-center gap-0.5 text-slate-400 text-[10px] font-bold">
                  <MapPin className="w-2.5 h-2.5" />{draftLocation}
                </span>
              )}
              <PlanBadge plan={activeSubscriptionPlan} />
              {brand.autoPilot && (
                <span className="flex items-center gap-0.5 text-[9px] font-black bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                  <Zap className="w-2.5 h-2.5 animate-pulse" />托管
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation buttons */}
        <div className="flex rounded-xl bg-slate-50 dark:bg-slate-855 p-0.5 border border-slate-200/50 dark:border-slate-800">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-855 dark:text-white shadow-sm'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-650 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200/50 dark:border-slate-700/50 transition-all cursor-pointer active:scale-95"
          >
            <Settings className="w-3.5 h-3.5 text-slate-450" />
            品牌配置
          </button>
          <button
            onClick={() => {
              setShowContextModal(true)
              void loadProfile()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <BookOpen className="w-3.5 h-3.5" />
            品牌上下文
          </button>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'story' && (
            <motion.div
              key="story"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="p-6 space-y-8 pb-16 max-w-5xl mx-auto w-full"
            >
              {/* ── 1. PREMIUM HERO BANNER (Official Landing Style) ── */}
              <div className="w-full rounded-3xl overflow-hidden relative border border-slate-200/40 dark:border-slate-800 shadow-xl bg-slate-900 text-white min-h-[280px] p-8 md:p-10 flex flex-col justify-between">
                {/* Visual Background spotlight & Gridlines to look like premium landing page */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                <div className="absolute top-0 right-0 w-[400px] h-[300px] bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-gradient-to-tr from-rose-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />

                {/* Hero Metadata Info */}
                <div className="relative z-10 flex flex-col gap-1 max-w-lg mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center shadow-lg flex-shrink-0">
                      {logoPreview || brand.logoUrl ? (
                        <img
                          src={logoPreview || brand.logoUrl!}
                          alt={draftName}
                          className="w-full h-full object-contain"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.svg' }}
                        />
                      ) : (
                        <Utensils className="w-6 h-6 text-white/90" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-black tracking-wide flex items-center gap-1.5 drop-shadow-md">
                        {draftName}
                        <span className="text-[10px] text-white/60 font-medium">官方品牌主页</span>
                      </h2>
                      {draftLocation && (
                        <span className="flex items-center gap-0.5 text-white/80 text-[10px] font-bold">
                          <MapPin className="w-3 h-3 text-amber-400" />{draftLocation}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[20px] md:text-[24px] font-black leading-tight tracking-wide drop-shadow-md bg-gradient-to-r from-amber-300 via-orange-200 to-white bg-clip-text text-transparent mt-2">
                    “传承经典美味，主理本地生活印记”
                  </p>
                </div>

                {/* Main Story Description block */}
                <div className="relative z-10 w-full bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-inner flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1">
                    <span className="text-[9px] font-black text-amber-450 uppercase tracking-widest block mb-1">Brand Vision & Story</span>
                    <p className="text-xs md:text-sm text-white/90 font-medium leading-relaxed max-w-3xl">
                      {parsedBrandStoryText || cleanBrandStoryText(draftDesc) || '暂无品牌故事介绍。请点击下方展开编辑，补充品牌使命与故事，供 AI 写文案使用。'}
                    </p>
                  </div>
                  {showStoryEditor ? null : (
                    <button
                      onClick={() => setShowStoryEditor(true)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-black text-white flex-shrink-0 transition-all cursor-pointer active:scale-95"
                    >
                      编辑设定
                    </button>
                  )}
                </div>
              </div>

              {/* ── 2. BRAND STATS SHOWCASE BAR (SaaS Homepage style) ── */}
              {hasRealData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">社媒粉丝总量</span>
                      <span className="text-sm font-extrabold text-slate-805 dark:text-white">
                        {totalFollowers > 0 ? `${totalFollowers.toLocaleString()}+` : '暂无数据'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-955/40 text-amber-500 flex items-center justify-center flex-shrink-0">
                      <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">谷歌主页评分</span>
                      <span className="text-sm font-extrabold text-slate-805 dark:text-white">
                        {googleRating !== null ? `⭐ ${googleRating.toFixed(1)} / 5.0` : '⭐⭐⭐⭐⭐'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center flex-shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">绑定运营门店</span>
                      <span className="text-sm font-extrabold text-slate-805 dark:text-white">
                        {draftLocation ? `📍 双门店联营` : `📍 单店主理`}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-955/40 text-rose-500 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">托管驾驶级别</span>
                      <span className="text-sm font-extrabold text-slate-805 dark:text-white">
                        {brand.autoPilot ? '🤖 智能托管 (L4)' : '✍️ 辅助生成 (L1)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Synced Brand Story Details ── */}
              {(parsedBrandStoryText || parsedBrandPositioning || parsedSignatureDishes || parsedStoresInfo || parsedDiningGuide) && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 pl-1">
                    <span className="w-1.5 h-3.5 bg-amber-500 rounded-full" />
                    品牌故事讲述 (Brand Story & Content)
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    {/* Brand Story Description Card (Full Width Span) */}
                    {parsedBrandStoryText && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3 md:col-span-2">
                        <h4 className="text-xs font-black text-slate-805 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <BookOpen className="w-4 h-4 text-amber-500" /> 品牌故事 (Brand Story)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-650 dark:text-slate-350">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedBrandStoryText}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Brand Positioning Card */}
                    {parsedBrandPositioning && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-805 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Bookmark className="w-4 h-4 text-amber-500" /> 品牌定位 (Brand Positioning)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-650 dark:text-slate-350">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedBrandPositioning}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Dining Guide Card */}
                    {parsedDiningGuide && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-805 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Compass className="w-4 h-4 text-amber-500" /> 用餐攻略 (Dining Guide)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-650 dark:text-slate-350">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedDiningGuide}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Signature Dishes Card */}
                    {parsedSignatureDishes && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-805 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Utensils className="w-4 h-4 text-amber-500" /> 招牌菜 (Signature Dishes)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-650 dark:text-slate-350">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedSignatureDishes}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Stores Info Card */}
                    {parsedStoresInfo && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-3">
                        <h4 className="text-xs font-black text-slate-805 dark:text-white uppercase flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
                          <Store className="w-4 h-4 text-amber-500" /> 门店信息 (Stores Info)
                        </h4>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs md:text-sm leading-relaxed text-slate-650 dark:text-slate-350">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedStoresInfo}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 3. SUBGRID A: BRAND IDENTITY & TARGETS ── */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 pl-1">
                  <span className="w-1.5 h-3.5 bg-amber-500 rounded-full" />
                  品牌声调与客群画像 (Core Positioning)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                  {/* Card 1: AI Tone */}
                  <div className="rounded-2xl overflow-hidden relative border border-slate-200/55 dark:border-slate-850 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                    style={{ boxShadow: '0 10px 25px -8px rgba(16,185,129,0.15)' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600" />
                    <div className="absolute inset-0 opacity-[0.05]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                    />
                    <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/10 rounded-full blur-2xl" />

                    <div className="relative z-10 p-5 flex flex-col justify-between h-full text-white min-h-[200px]">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl leading-none">✨</span>
                          <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider text-white">AI 品牌声调</span>
                        </div>
                        <h4 className="text-xs font-black tracking-wide border-b border-white/15 pb-1">表达风格与语气建议</h4>
                      </div>
                      <p className="text-[11px] text-white/90 font-medium leading-relaxed mt-2 line-clamp-5">
                        {activeBrandTone || '尚未配置语气风格设定。请点击下方“展开编辑品牌故事设定”补充风格设定。'}
                      </p>
                    </div>
                  </div>

                  {/* Card 2: Target Audience */}
                  <div className="rounded-2xl overflow-hidden relative border border-slate-200/55 dark:border-slate-855 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                    style={{ boxShadow: '0 10px 25px -8px rgba(99,102,241,0.15)' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-blue-500 to-indigo-650" />
                    <div className="absolute inset-0 opacity-[0.05]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                    />
                    <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/10 rounded-full blur-2xl" />

                    <div className="relative z-10 p-5 flex flex-col justify-between h-full text-white min-h-[200px]">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl leading-none">👥</span>
                          <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider text-white">目标客群画像</span>
                        </div>
                        <h4 className="text-xs font-black tracking-wide border-b border-white/15 pb-1">主要客群分析与需求假设</h4>
                      </div>
                      <p className="text-[11px] text-white/90 font-medium leading-relaxed mt-2 line-clamp-5">
                        {parsedAudienceAssumptions || '暂无目标客群画像假设。请在“分析与增长计划”中同步以拉取 AMC-Growth 的商家画像。'}
                      </p>
                    </div>
                  </div>

                  {/* Card 3: Founder Vision */}
                  <div className="rounded-2xl overflow-hidden relative border border-slate-200/55 dark:border-slate-850 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                    style={{ boxShadow: '0 10px 25px -8px rgba(245,158,11,0.15)' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600" />
                    <div className="absolute inset-0 opacity-[0.05]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                    />
                    <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/10 rounded-full blur-2xl" />

                    <div className="relative z-10 p-5 flex flex-col justify-between h-full text-white min-h-[200px]">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl leading-none">🎯</span>
                          <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider text-white">发展目标期望</span>
                        </div>
                        <h4 className="text-xs font-black tracking-wide border-b border-white/15 pb-1">主理人的商业抱负与战略目标</h4>
                      </div>
                      <p className="text-[11px] text-white/90 font-medium leading-relaxed mt-2 line-clamp-5">
                        {parsedTargets || '暂无战略目标数据。请在“分析与增长计划”中同步以拉取 AMC-Growth 的主理人抱负。'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 4. SUBGRID B: COMPETITIVE EDGE & VOCABULARY ── */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 pl-1">
                  <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full" />
                  竞争优势与特征库 (Brand Identity)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                  {/* Card 4: Product Advantages */}
                  <div className="rounded-2xl overflow-hidden relative border border-slate-200/55 dark:border-slate-850 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                    style={{ boxShadow: '0 10px 25px -8px rgba(244,63,94,0.15)' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500 via-pink-500 to-rose-600" />
                    <div className="absolute inset-0 opacity-[0.05]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                    />
                    <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/10 rounded-full blur-2xl" />

                    <div className="relative z-10 p-5 flex flex-col justify-between h-full text-white min-h-[200px]">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl leading-none">💎</span>
                          <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider text-white">优势核心卖点</span>
                        </div>
                        <h4 className="text-xs font-black tracking-wide border-b border-white/15 pb-1">品牌特色核心产品假设</h4>
                      </div>
                      <p className="text-[11px] text-white/90 font-medium leading-relaxed mt-2 line-clamp-5">
                        {parsedProductAssumptions || '暂无核心竞争力假设。请在“分析与增长计划”中同步以拉取 AMC-Growth 的商家核心定位。'}
                      </p>
                    </div>
                  </div>

                  {/* Card 5: Local Slangs */}
                  <div className="rounded-2xl overflow-hidden relative border border-slate-200/55 dark:border-slate-855 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                    style={{ boxShadow: '0 10px 25px -8px rgba(139,92,246,0.15)' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-indigo-500 to-violet-600" />
                    <div className="absolute inset-0 opacity-[0.05]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                    />
                    <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/10 rounded-full blur-2xl" />

                    <div className="relative z-10 p-5 flex flex-col justify-between h-full text-white min-h-[200px]">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl leading-none">🎯</span>
                          <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider text-white">本地俚语词汇</span>
                        </div>
                        <h4 className="text-xs font-black tracking-wide border-b border-white/15 pb-1">已录入 {Object.keys(activeSlangDict).length} 个本地短语</h4>
                      </div>
                      <p className="text-[11px] text-white/90 font-medium leading-relaxed mt-2 line-clamp-5">
                        {Object.keys(activeSlangDict).length > 0 
                          ? `常用俚语词条：${Object.keys(activeSlangDict).slice(0, 10).join(' · ')}。点击下方“展开编辑”表单可以继续新增专属短语。`
                          : '尚未配置俚语词条。添加俚语可帮助 AI Copywriter 自动生成极富本地烟火气的宣传内容。'}
                      </p>
                    </div>
                  </div>

                  {/* Card 6: Geographic Location */}
                  <div className="rounded-2xl overflow-hidden relative border border-slate-200/55 dark:border-slate-855 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                    style={{ boxShadow: '0 10px 25px -8px rgba(75,85,99,0.15)' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700" />
                    <div className="absolute inset-0 opacity-[0.05]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                    />
                    <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/10 rounded-full blur-2xl" />

                    <div className="relative z-10 p-5 flex flex-col justify-between h-full text-white min-h-[200px]">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl leading-none">📍</span>
                          <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider text-white">运营地理定位</span>
                        </div>
                        <h4 className="text-xs font-black tracking-wide border-b border-white/15 pb-1">主理区域语境</h4>
                      </div>
                      <p className="text-[11px] text-white/90 font-medium leading-relaxed mt-2 line-clamp-5">
                        {draftLocation 
                          ? `主要运营与内容生成的地理语境已被定位在：${draftLocation}。这可以让 AI 更好地了解受众特征与地段优势。`
                          : '暂无地理区域定位。完善主理区域可以帮助 AI 构建本地社区的信任连接。'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 5. OFFICIAL SOCIAL MEDIA CHANNELS (Official Website style) ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pl-1 pr-1">
                  <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-3.5 bg-rose-500 rounded-full" />
                    官方自媒体运营阵地 (Official Channels)
                  </h3>
                  <button
                    onClick={handleSyncAccounts}
                    disabled={syncingAccounts}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 active:scale-95 transition-all cursor-pointer shadow-sm"
                  >
                    {syncingAccounts ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {syncAccountsStatus || '同步账号'}
                  </button>
                </div>

                {accounts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                    {accounts.map((acc) => {
                      const platformColors: Record<string, string> = {
                        instagram: 'from-pink-500 to-rose-500',
                        facebook: 'from-blue-600 to-indigo-700',
                        tiktok: 'from-slate-800 to-black dark:from-slate-900 dark:to-black',
                        google: 'from-red-500 to-amber-500',
                        google_maps: 'from-emerald-500 to-teal-600',
                        gbp: 'from-red-500 to-amber-500',
                        gmb: 'from-red-500 to-amber-500',
                      }
                      const color = platformColors[acc.platformId.toLowerCase()] || 'from-slate-600 to-slate-805'

                      return (
                        <a
                          key={acc.id}
                          href={acc.profileUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex items-center justify-between hover:border-slate-350 dark:hover:border-slate-700 transition-all hover:scale-[1.01] group cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${color} text-white flex items-center justify-center font-black text-[9px] uppercase tracking-wider`}>
                              {acc.platformId.slice(0, 3)}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-extrabold text-slate-800 dark:text-white block truncate group-hover:text-amber-500 transition-colors">
                                {acc.displayName || acc.handle}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">@{acc.handle}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {acc.followerCount !== null && (
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                {acc.followerCount.toLocaleString()} 粉丝
                              </span>
                            )}
                            <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                          </div>
                        </a>
                      )
                    })}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-sm text-center">
                    <p className="text-xs text-slate-400 italic">暂无绑定的社交媒体账号，请点击右上角“同步账号”拉取已配置账号或进入配置。</p>
                  </div>
                )}
              </div>

              {/* Toggle Editor Panel Trigger */}
              <div className="pt-4 w-full">
                <button
                  onClick={() => setShowStoryEditor(!showStoryEditor)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 text-xs font-black text-slate-700 dark:text-slate-200 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] cursor-pointer"
                >
                  {showStoryEditor ? '✨ 收起品牌故事配置表单' : '✏️ 展开编辑品牌故事设定 (名称、简介、俚语及声调)'}
                </button>
              </div>

              {/* Expandable Editor Fields */}
              <AnimatePresence>
                {showStoryEditor && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-4 w-full"
                  >
                    {/* Brand Info Form Card */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                      <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">编辑基础信息</h3>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">品牌名称</label>
                        <input
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          className="w-full text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="品牌名称"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">品牌简介与故事使命 (Description)</label>
                        <textarea
                          value={draftDesc}
                          onChange={e => setDraftDesc(e.target.value)}
                          className="w-full min-h-[90px] text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                          placeholder="简短描述该品牌的故事与主营业务..."
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">主理区域 (Location)</label>
                        <input
                          value={draftLocation}
                          onChange={e => setDraftLocation(e.target.value)}
                          className="w-full text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="例如: Yishun, Singapore"
                        />
                      </div>
                      <button
                        onClick={handleSaveBrandInfo}
                        disabled={saving}
                        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer active:scale-95 transition-all"
                      >
                        {saving ? <div className="w-3.5 h-3.5 border-2 border-white dark:border-slate-900 border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        保存品牌基本信息
                      </button>
                    </div>

                    {/* Tone Configuration Card */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                        <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">编辑 AI 品牌声调 (Tone of Voice)</h3>
                        <button
                          onClick={handleSaveVoice}
                          disabled={saving}
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-500 hover:text-amber-600 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Save className="w-3.5 h-3.5" />
                          保存声调设定
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">语气设定描写 (Tone Description)</label>
                        <textarea
                          value={brandTone}
                          onChange={(e) => setBrandToneVal(e.target.value)}
                          placeholder="例如：专业但亲切的咖啡烘焙工坊语气，多使用第一人称‘我们’，注重传达品质与匠心..."
                          className="w-full min-h-[90px] text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200/70 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                        />
                      </div>

                      {/* Local Slang Dict */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">本地俚语词典 (Slang Dict)</label>
                          <span className="text-[9px] text-slate-400">供 AI 写手合理插入本地化口语表达</span>
                        </div>

                        {Object.keys(activeSlangDict).length > 0 && (
                          <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                            {Object.entries(activeSlangDict).map(([term, meaning]) => (
                              <div
                                key={term}
                                className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm"
                              >
                                <div className="min-w-0 pr-1.5">
                                  <span className="text-[11px] font-bold text-slate-805 dark:text-white block truncate">"{term}"</span>
                                  <span className="text-[9px] text-slate-400 block truncate">{meaning}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = { ...activeSlangDict }
                                    delete next[term]
                                    setSlangDictVal(next)
                                  }}
                                  className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/30 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-850 p-2 rounded-xl border border-dashed border-slate-250 dark:border-slate-700">
                          <input
                            value={newTerm}
                            onChange={(e) => setNewTerm(e.target.value)}
                            placeholder="词语 (如: Lah)"
                            className="w-1/3 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <input
                            value={newMeaning}
                            onChange={(e) => setNewMeaning(e.target.value)}
                            placeholder="解释 (如: 强调语气词)"
                            className="flex-1 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <button
                            type="button"
                            onClick={handleAddSlang}
                            className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white active:scale-95 transition-all"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'context' && (
            <motion.div
              key="context"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="p-5 space-y-6 pb-12 max-w-5xl mx-auto w-full"
            >
              {/* AMC Growth Sync Controller */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 w-full">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-855 dark:text-white">🚀 战略诊断与增长计划</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">垂直滚动贴合展示。每一个 Slide 垂直排列，使用滚轮或 Page Down 即可顺滑翻页</p>
                  </div>
                  <button
                    onClick={handleSyncGrowth}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 active:scale-95 transition-all cursor-pointer shadow-md"
                  >
                    {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {syncStatus || '一键同步品牌故事与上下文'}
                  </button>
                </div>
              </div>

              {/* ── VERTICAL SCROLL-SNAP KEYNOTE PLAYER ── */}
              {presentationSlides.length > 0 ? (
                <div className="space-y-4 w-full">
                  <div className="flex items-center justify-between px-1 text-[10px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-indigo-500 animate-pulse" />
                      垂直滚动幻灯片大屏 (每一个 Page Down 为一页)
                    </span>
                    <span>共 {presentationSlides.length} 页</span>
                  </div>

                  {/* Scroll-Snap Container (Hidden scrollbars, mandatory snap alignments) */}
                  <div className="w-full h-[450px] md:h-[520px] overflow-y-auto scroll-smooth snap-y snap-mandatory scrollbar-none rounded-3xl border border-slate-200/50 dark:border-slate-800 shadow-xl bg-slate-900">
                    {presentationSlides.map((slide, idx) => (
                      <div
                        key={idx}
                        className="w-full h-full flex-shrink-0 snap-start snap-always relative overflow-hidden flex flex-col justify-between transition-all duration-300"
                      >
                        {/* Backdrop Gradient for each card */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${getGrowthSlideGradient(idx)}`} />
                        <div className="absolute inset-0 opacity-[0.05]"
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                        />
                        <div className="absolute -top-12 -right-12 w-64 h-64 bg-white/10 rounded-full blur-3xl" />

                        {/* Slide Content layout */}
                        <div className="relative z-10 p-8 md:p-12 flex flex-col justify-between h-full text-white w-full">
                          {/* Slide Title */}
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-4xl md:text-5xl leading-none">
                                {getGrowthSlideEmoji(slide.title)}
                              </span>
                              <span className="bg-white/20 backdrop-blur-md px-3.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider text-white">
                                Page {idx + 1} / {presentationSlides.length}
                              </span>
                            </div>
                            <h3 className="text-lg md:text-xl font-black tracking-wide leading-snug drop-shadow-md border-b border-white/15 pb-2.5 max-w-4xl">
                              {slide.title}
                            </h3>
                          </div>

                          {/* Body markdown */}
                          <div className="flex-1 overflow-y-auto min-h-0 pr-1 mt-4 scrollbar-thin scrollbar-thumb-white/20 max-w-4xl">
                            {formatSlideContent(slide.content)}
                          </div>

                          {/* Footer help indicator inside each page down slide */}
                          <div className="mt-3 flex items-center justify-between text-[9px] text-white/50 font-bold border-t border-white/10 pt-2 flex-shrink-0">
                            <span>AMC GROWTH 智能诊断分析报告</span>
                            {idx < presentationSlides.length - 1 ? (
                              <span className="flex items-center gap-1">往下滑动切换至下一页 ↓</span>
                            ) : (
                              <span>演示完毕 🏁</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 shadow-sm text-center w-full">
                  <div className="max-w-xs mx-auto space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-555">暂无分析数据与幻灯片</p>
                    <p className="text-[10px] text-slate-400">
                      点击“一键同步最新分析”按钮，从 AMC Growth 智能系统拉取该品牌的专属战略诊断、行动大纲和报告大盘。
                    </p>
                  </div>
                </div>
              )}

              {/* Toggle Detailed Prose Report Trigger */}
              {(growthContext || growthPlan) && (
                <div className="w-full pt-2">
                  <button
                    onClick={() => setShowDetailedReport(!showDetailedReport)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 text-xs font-black text-slate-700 dark:text-slate-200 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-855 active:scale-[0.98] cursor-pointer"
                  >
                    {showDetailedReport ? '📊 收起战略诊断报告原文' : '📄 展开查看战略诊断与执行规划全文'}
                  </button>
                </div>
              )}

              {/* Expandable Diagnostic Prose */}
              <AnimatePresence>
                {showDetailedReport && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-4 w-full"
                  >
                    {growthContext ? (
                      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                        <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">
                          📋 品牌核心战略诊断与定位 (Detailed Diagnosis)
                        </h3>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{growthContext}</ReactMarkdown>
                        </div>
                      </div>
                    ) : null}

                    {growthPlan ? (
                      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                        <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">
                          🚀 智能增长执行路径与大纲 (Detailed Growth Plan)
                        </h3>
                        <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{growthPlan}</ReactMarkdown>
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Brand Config Drawer/Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfigModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-slate-50 dark:bg-slate-955 shadow-2xl flex flex-col h-full z-10 border-l border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">⚙️ 品牌平台与集成配置</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">管理社交平台授权、第三方 API 凭证与多门店设置</p>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-655 dark:hover:text-slate-205 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-10">
                {/* Connected Accounts Snapshot */}
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-805 dark:text-white">📊 已绑定账号资产快照</span>
                  </div>
                  {brandSettings?.accounts && (brandSettings.accounts as any[]).length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {(brandSettings.accounts as any[]).map((acc) => (
                        <div key={acc.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-[10px] tracking-wide bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                              {acc.platformId.toUpperCase()}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{acc.displayName || acc.handle}</span>
                            <span className="text-slate-400 text-[10px]">@{acc.handle}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-550 dark:text-slate-400 font-bold">
                            {acc.followerCount !== null ? (
                              <span>{acc.followerCount.toLocaleString()} 粉丝</span>
                            ) : (
                              <span className="text-slate-350 dark:text-slate-600">暂无数据</span>
                            )}
                            {acc.autoPilot && (
                              <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[9px] font-black px-1.5 py-0.2 rounded-full">
                                托管中
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">暂无绑定的社交媒体账号，请在下方点击配置按钮进入平台绑定。</p>
                  )}
                </div>

                {/* Social Platform Integration Cards */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">集成第三方平台</h3>
                  {[
                    {
                      name: 'PostFast',
                      desc: '自动发布至 Instagram、Facebook 等主流平台',
                      color: 'from-indigo-500 to-purple-600',
                      icon: (
                        <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204 0.013-3.583 0.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                        </svg>
                      ),
                    },
                    {
                      name: 'Google Business',
                      desc: '管理 Google Maps 商家主页、评论与 OAuth 凭证',
                      color: 'from-red-500 to-orange-500',
                      icon: (
                        <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                          <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748z" />
                        </svg>
                      ),
                    },
                  ].map(platform => (
                    <div
                      key={platform.name}
                      className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm"
                    >
                      <div className={`bg-gradient-to-r ${platform.color} p-3.5 flex items-center gap-3`}>
                        <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                          {platform.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white">{platform.name}</h4>
                          <p className="text-[10px] text-white/75 mt-0.5">{platform.desc}</p>
                        </div>
                      </div>
                      <div className="p-3">
                        <button
                          onClick={handleOpenSettings}
                          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-655 dark:text-slate-350 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200/50 dark:border-slate-700/50 py-2 rounded-xl transition-all cursor-pointer active:scale-95"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          配置 {platform.name}
                          <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-450" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Store Configuration */}
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">门店与多地址配置</h4>
                      <p className="text-[10px] text-white/75 mt-0.5">管理多门店地址、营业时间与 Google 映射配置</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <button
                      onClick={handleOpenSettings}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-655 dark:text-slate-355 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200/50 dark:border-slate-700/50 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      配置门店详细信息
                      <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-455" />
                    </button>
                  </div>
                </div>

                {/* Subscription & Add-ons */}
                <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">订阅套餐 & 增值计划</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">AI Marketing Crew 订阅方案与增值应用状态</p>
                    </div>
                    <PlanBadge plan={activeSubscriptionPlan} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'veo3', label: 'Veo3 视频生成', active: activeAddons.veo3 },
                      { key: 'dubco', label: 'Dub.co 多语言配音', active: activeAddons.dubco },
                    ].map(addon => (
                      <div
                        key={addon.key}
                        className="p-2.5 bg-slate-50 dark:bg-slate-855 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-1.5">
                          <Package className={`w-3.5 h-3.5 ${addon.active ? 'text-amber-500' : 'text-slate-400'}`} />
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-355">{addon.label}</span>
                        </div>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${addon.active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}`}>
                          {addon.active ? '开通' : '未开'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <a
                    href={activeSubscriptionHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-md shadow-indigo-500/10 cursor-pointer group text-xs text-white font-bold"
                  >
                    <span>管理订阅方案与升级服务</span>
                    <ExternalLink className="w-3.5 h-3.5 text-white" />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Brand Context Drawer/Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showContextModal && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowContextModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-2xl bg-slate-50 dark:bg-slate-955 shadow-2xl flex flex-col h-full z-10 border-l border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-black text-slate-805 dark:text-white">📚 品牌推广核心预读上下文</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">此 Profile Markdown 是供 AI Copywriter 创作时预读的，仅保留有价值的品牌设定与语境</p>
                </div>
                <button
                  onClick={() => setShowContextModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-655 dark:hover:text-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-3 min-h-0 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between flex-shrink-0">
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-855 p-0.5">
                    <button
                      type="button"
                      onClick={() => setProfileViewMode('edit')}
                      className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                        profileViewMode === 'edit'
                          ? 'bg-white dark:bg-slate-905 text-slate-800 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      编辑内容
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileViewMode('preview')}
                      className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${
                        profileViewMode === 'preview'
                          ? 'bg-white dark:bg-slate-955 text-slate-800 dark:text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      格式预览
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshProfile}
                    disabled={profileLoading || profileSaving}
                    className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 flex items-center gap-1 cursor-pointer"
                  >
                    {profileLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    刷新系统快照
                  </button>
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  {profileLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                      <p className="text-xs text-slate-400">正在载入品牌上下文 Markdown...</p>
                    </div>
                  ) : profileViewMode === 'edit' ? (
                    <textarea
                      value={profileMarkdown}
                      onChange={(e) => setProfileMarkdown(e.target.value)}
                      placeholder="# 品牌名称..."
                      className="flex-1 w-full min-h-[380px] p-4 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
                    />
                  ) : (
                    <div className="flex-1 w-full min-h-[380px] p-4 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200/70 text-slate-700 dark:text-slate-200 overflow-y-auto prose prose-slate dark:prose-invert max-w-none leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {profileMarkdown || '（暂无内容）'}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveProfile()}
                  disabled={profileSaving || profileLoading || !profileMarkdown.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer active:scale-95 transition-all flex-shrink-0"
                >
                  {profileSaving ? (
                    <><Loader2 size={13} className="animate-spin" /> 保存中…</>
                  ) : profileSaved ? (
                    <><CheckCircle2 size={13} className="text-emerald-400" /> 上下文已成功保存</>
                  ) : (
                    <><Save size={13} /> 保存品牌上下文 Markdown</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold text-white transition-all animate-in fade-in slide-in-from-top-4 duration-355 ${
          toast.type === 'success' ? 'bg-emerald-500 border-emerald-400' :
          toast.type === 'error' ? 'bg-rose-500 border-rose-400' :
          'bg-slate-800 border-slate-700'
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
