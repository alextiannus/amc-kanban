'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  X, ChevronLeft, Sparkles, MapPin, Zap, Save,
  Settings, BookOpen, ExternalLink, Package, Loader2,
  RefreshCw, FileText, CheckCircle2, Store, Utensils,
  Camera, Edit3, Check, Plus, Trash2, ArrowRight,
  Star, Users
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
          <p className="text-xs text-slate-400 dark:text-slate-555 mt-1">请先在左上角切换或选择一个品牌进行代运营配置。</p>
        </div>
      </div>
    )
  }

  const brandId = brand.id

  const [activeTab, setActiveTab] = useState<Tab>('story')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Presentation states
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

  // ── Presentation Styles Builder ──────────────────────────────────────────────

  const storySlides = [
    {
      id: 'mission',
      emoji: '🏮',
      label: '品牌故事 & 使命',
      headline: draftName,
      body: draftDesc || '暂无品牌介绍。请点击下方“展开编辑品牌故事设定”补充品牌核心定位。',
      gradient: 'from-orange-500 via-red-500 to-rose-600',
      glowColor: 'rgba(234,88,12,0.18)',
      icon: Sparkles
    },
    {
      id: 'tone',
      emoji: '✨',
      label: 'AI 品牌声调',
      headline: '品牌个性与表达语气',
      body: activeBrandTone || '暂无语气风格设定。请点击下方“展开编辑品牌故事设定”完善语气声调设定。',
      gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
      glowColor: 'rgba(16,185,129,0.18)',
      icon: Star
    },
    {
      id: 'slang',
      emoji: '🎯',
      label: '本地俚语词典',
      headline: `已录入 ${Object.keys(activeSlangDict).length} 个本地词条`,
      body: Object.keys(activeSlangDict).length > 0 
        ? `核心口语表达：${Object.keys(activeSlangDict).slice(0, 10).join(' · ')}`
        : '尚未配置俚语词条。添加俚语可帮助 AI Copywriter 自动生成极富本地烟火气的宣传内容。',
      gradient: 'from-purple-500 via-indigo-500 to-violet-600',
      glowColor: 'rgba(139,92,246,0.18)',
      icon: Users
    },
    {
      id: 'location',
      emoji: '📍',
      label: '地理位置定位',
      headline: draftLocation || '尚未配置主理区域',
      body: draftLocation 
        ? `品牌主要运营与内容生成的地理语境已被定位在：${draftLocation}`
        : '暂无区域定位。完善主理区域可让 AI 更好地了解受众特征与地段优势。',
      gradient: 'from-cyan-500 via-sky-500 to-blue-600',
      glowColor: 'rgba(14,165,233,0.18)',
      icon: MapPin
    }
  ]

  const getGrowthSlideGradient = (index: number) => {
    const gradients = [
      'from-indigo-500 via-purple-500 to-indigo-600',
      'from-rose-500 via-red-500 to-rose-600',
      'from-amber-500 via-orange-500 to-amber-600',
      'from-emerald-500 via-teal-500 to-emerald-600',
      'from-teal-500 via-cyan-500 to-teal-600',
      'from-cyan-500 via-blue-500 to-cyan-600',
      'from-pink-500 via-rose-500 to-pink-600',
      'from-purple-500 via-violet-500 to-purple-600',
      'from-violet-500 via-fuchsia-500 to-violet-600',
      'from-slate-600 via-slate-700 to-slate-800',
    ]
    return gradients[index % gradients.length]
  }

  const getGrowthSlideGlow = (index: number) => {
    const glows = [
      'rgba(99,102,241,0.18)',
      'rgba(239,68,68,0.18)',
      'rgba(245,158,11,0.18)',
      'rgba(16,185,129,0.18)',
      'rgba(20,184,166,0.18)',
      'rgba(6,182,212,0.18)',
      'rgba(236,72,153,0.18)',
      'rgba(139,92,246,0.18)',
      'rgba(168,85,247,0.18)',
      'rgba(75,85,99,0.18)',
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
        <ul className="list-disc list-inside space-y-2.5 mt-3 text-xs md:text-[13px] text-white/90 font-medium leading-relaxed">
          {lines.map((line, idx) => {
            const cleanLine = line.replace(/^[-*\d+.\s]+/, '')
            return <li key={idx} className="line-clamp-2">{cleanLine}</li>
          })}
        </ul>
      )
    }
    return (
      <p className="text-xs md:text-[13px] text-white/90 font-medium leading-relaxed line-clamp-6 mt-3">
        {content}
      </p>
    )
  }

  const tabs = [
    { id: 'story', label: '品牌故事', icon: null },
    { id: 'growth', label: '分析与增长计划', icon: null },
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
                  ? 'bg-white dark:bg-slate-900 text-slate-850 dark:text-white shadow-sm'
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
              className="p-5 space-y-6 pb-12 max-w-5xl mx-auto w-full"
            >
              {/* Header Title */}
              <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-3">
                <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-500 animate-pulse" />
                  品牌故事设定大盘 (Brand Profile Grid)
                </h4>
              </div>

              {/* ── SINGLE PAGE GRID LAYOUT (Story) ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                {storySlides.map((slide) => (
                  <div
                    key={slide.id}
                    className="w-full min-h-[220px] rounded-2xl overflow-hidden relative select-none border border-slate-200/55 dark:border-slate-850 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                    style={{
                      boxShadow: `0 12px 30px -10px ${slide.glowColor}`
                    }}
                  >
                    {/* Backdrop Gradient Container */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient}`} />
                    <div className="absolute inset-0 opacity-[0.05]"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                    />
                    <div className="absolute -top-12 -right-12 w-36 h-36 bg-white/10 rounded-full blur-2xl" />

                    {/* Foreground Text Content */}
                    <div className="relative z-10 p-6 flex flex-col justify-between h-full text-white min-h-[220px]">
                      <div>
                        <div className="flex items-center justify-between mb-3.5">
                          <span className="text-3xl leading-none">{slide.emoji}</span>
                          <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white">
                            {React.createElement(slide.icon, { size: 10 })}
                            {slide.label}
                          </div>
                        </div>
                        <h2 className="text-sm font-extrabold tracking-wide leading-snug drop-shadow-sm border-b border-white/15 pb-2">
                          {slide.headline}
                        </h2>
                      </div>

                      <p className="text-xs text-white/90 font-medium leading-relaxed mt-3 drop-shadow-sm line-clamp-4">
                        {slide.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Toggle Editor Panel Trigger */}
              <div className="pt-2 w-full">
                <button
                  onClick={() => setShowStoryEditor(!showStoryEditor)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 text-xs font-black text-slate-700 dark:text-slate-200 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] cursor-pointer"
                >
                  {showStoryEditor ? '✨ 收起品牌故事配置表单' : '✏️ 展开编辑品牌故事设定 (包含调性与俚语)'}
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
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">品牌简介 (Description)</label>
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

          {activeTab === 'growth' && (
            <motion.div
              key="growth"
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
                    <p className="text-[10px] text-slate-400 mt-0.5">同步查看最新的定位诊断与执行规划，所有分析结果将展开呈现在单页上</p>
                  </div>
                  <button
                    onClick={handleSyncGrowth}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 active:scale-95 transition-all cursor-pointer shadow-md"
                  >
                    {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {syncStatus || '一键同步最新分析'}
                  </button>
                </div>
              </div>

              {/* ── SINGLE PAGE GRID LAYOUT (Growth) ── */}
              {presentationSlides.length > 0 ? (
                <div className="space-y-4 w-full">
                  <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-3">
                    <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-500 animate-pulse" />
                      增长诊断卡片大盘 (Growth Overview)
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    {presentationSlides.map((slide, idx) => (
                      <div
                        key={idx}
                        className="w-full min-h-[220px] rounded-2xl overflow-hidden relative select-none border border-slate-200/55 dark:border-slate-850 shadow-md flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]"
                        style={{
                          boxShadow: `0 12px 30px -10px ${getGrowthSlideGlow(idx)}`
                        }}
                      >
                        {/* Backdrop Gradient Container */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${getGrowthSlideGradient(idx)}`} />
                        <div className="absolute inset-0 opacity-[0.05]"
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
                        />
                        <div className="absolute -top-12 -right-12 w-36 h-36 bg-white/10 rounded-full blur-2xl" />

                        {/* Foreground Content Container */}
                        <div className="relative z-10 p-6 flex flex-col justify-between h-full text-white min-h-[220px]">
                          <div>
                            <div className="flex items-center justify-between mb-3.5">
                              <span className="text-3xl leading-none">
                                {getGrowthSlideEmoji(slide.title)}
                              </span>
                              <span className="bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white">
                                Section {idx + 1}
                              </span>
                            </div>
                            <h3 className="text-sm font-extrabold tracking-wide border-b border-white/15 pb-2 drop-shadow-sm">
                              {slide.title}
                            </h3>
                          </div>

                          <div className="flex-1 overflow-y-auto min-h-0 pr-1 mt-3 scrollbar-thin scrollbar-thumb-white/20">
                            {formatSlideContent(slide.content)}
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
                    <p className="text-xs font-bold text-slate-505">暂无分析数据与幻灯片</p>
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
                        className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between"
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
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-850 p-0.5">
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
                      className="flex-1 w-full min-h-[380px] p-4 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-700 text-slate-755 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
                    />
                  ) : (
                    <div className="flex-1 w-full min-h-[380px] p-4 rounded-xl text-xs bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 overflow-y-auto prose prose-slate dark:prose-invert max-w-none leading-relaxed">
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
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold text-white transition-all animate-in fade-in slide-in-from-top-4 duration-350 ${
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
