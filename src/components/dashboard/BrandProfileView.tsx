'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  X, ChevronLeft, Sparkles, MapPin, Zap, Save,
  Settings, BookOpen, ExternalLink, Package, Loader2,
  RefreshCw, FileText, CheckCircle2, Store, Utensils,
  Camera, Edit3, Check, Plus, Trash2, ArrowRight
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
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('story')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Local Brand States (fetched on mount/change)
  const [brandTone, setBrandTone] = useState('')
  const [slangDict, setSlangDict] = useState<Record<string, string>>({})
  const [subscriptionPlan, setSubscriptionPlan] = useState('未激活订阅')
  const [addons, setAddons] = useState({ veo3: false, dubco: false })
  const [showSettings, setShowSettings] = useState(false)
  const [brandSettings, setBrandSettings] = useState<Record<string, unknown> | null>(null)

  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showContextModal, setShowContextModal] = useState(false)

  // Inline brand info editing
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(brand?.name || '')
  const [draftDesc, setDraftDesc] = useState(brand?.description || '')
  const [draftLocation, setDraftLocation] = useState(brand?.location || '')

  // Logo upload
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(brand?.logoUrl || null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Slang form
  const [newTerm, setNewTerm] = useState('')
  const [newMeaning, setNewMeaning] = useState('')

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Profile Markdown (embedded editor & growth parsing)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileMarkdown, setProfileMarkdown] = useState('')
  const [profileViewMode, setProfileViewMode] = useState<'edit' | 'preview'>('preview')

  const brandId = brand?.id

  const loadProfile = async () => {
    if (!brandId) return
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
    if (!brandId) return
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
        setBrandTone(dataKnowledge.brandTone || '')
        setSlangDict(dataKnowledge.slangDict || {})
      }

      // 3. Fetch subscription
      const resSub = await fetch(`/api/brands/${brandId}/subscription`)
      if (resSub.ok) {
        const dataSub = await resSub.json()
        setSubscriptionPlan(dataSub.plan_name === 'NONE' ? '未激活订阅' : dataSub.plan_name)
        setAddons({
          veo3: !!dataSub.selectedAddons?.veo3,
          dubco: !!dataSub.selectedAddons?.dubco,
        })
      }
    } catch (e) {
      console.error('Failed to load brand configuration:', e)
    }
  }

  useEffect(() => {
    if (brandId) {
      void loadProfile()
      void loadAllConfig()
    }
  }, [brandId])

  const handleSaveProfile = async (nextMarkdown?: string) => {
    if (!brandId) return
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
        showToast('保存品牌 Profile 失败，请重试', 'error')
        return
      }
      const data = await res.json()
      const serverMarkdown = typeof data?.markdown === 'string' ? data.markdown : markdown
      setProfileMarkdown(serverMarkdown)
      setProfileSaved(true)
      showToast('品牌 Profile 已保存', 'success')
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (e) {
      console.error(e)
      showToast('保存品牌 Profile 失败，请检查网络', 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleRefreshProfile = async () => {
    if (!brandId) return
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile?refresh=1`)
      if (!res.ok) {
        showToast('刷新 Profile 失败，请稍后再试', 'error')
        return
      }
      const data = await res.json()
      const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
      setProfileMarkdown(markdown)
      showToast('品牌自动部分刷新成功', 'success')
    } catch (e) {
      console.error(e)
      showToast('刷新 Profile 失败，请检查网络', 'error')
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

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSyncGrowth = async () => {
    if (!brandId) return
    setSyncing(true)
    setSyncStatus('正在同步...')
    try {
      const res = await fetch(`/api/brands/${brandId}/sync-growth`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncStatus('同步成功')
        showToast(`品牌分析同步成功 (${data.merchantName || data.merchantId})`, 'success')
        void loadProfile() // Refresh local copy of profile markdown
        setTimeout(() => setSyncStatus(null), 3000)
      } else {
        setSyncStatus('同步失败')
        showToast(data.error || '同步失败，未找到匹配的 Growth 商家分析', 'error')
        setTimeout(() => setSyncStatus(null), 5000)
      }
    } catch (e) {
      console.error(e)
      setSyncStatus('同步失败')
      showToast('网络请求失败', 'error')
      setTimeout(() => setSyncStatus(null), 5000)
    } finally {
      setSyncing(false)
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!brandId) return
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
        showToast('品牌 Logo 已更新', 'success')
      } else {
        showToast('Logo 上传失败', 'error')
      }
    } catch {
      showToast('Logo 上传失败', 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSaveBrandInfo = async () => {
    if (!brandId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, description: draftDesc, location: draftLocation }),
      })
      if (res.ok) {
        showToast('品牌信息已保存', 'success')
        setEditingName(false)
      } else {
        showToast('保存失败，请重试', 'error')
      }
    } catch {
      showToast('网络错误，保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveVoice = async () => {
    if (!brandId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/knowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandTone, slangDict }),
      })
      if (res.ok) {
        showToast('品牌语气与术语已保存', 'success')
      } else {
        showToast('保存失败，请重试', 'error')
      }
    } catch {
      showToast('网络错误，保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddSlang = () => {
    const term = newTerm.trim()
    const meaning = newMeaning.trim()
    if (!term || !meaning) return
    setSlangDict({ ...slangDict, [term]: meaning })
    setNewTerm('')
    setNewMeaning('')
  }

  // ── Tabs config ─────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'story', label: '品牌故事', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'growth', label: '分析与增长计划', icon: <RefreshCw className="w-3.5 h-3.5" /> },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────

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

  const subscriptionHref = `/profile/principal/brands/${brand.id}/billing`

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 bg-[#f7f9fb] dark:bg-slate-955 overflow-y-auto relative h-full"
    >
      {/* ── Hero Header ───────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-amber-400 via-orange-400 to-amber-500 dark:from-amber-600 dark:via-orange-600 dark:to-amber-700 pt-12 pb-6 px-5 flex-shrink-0">
        {/* Back button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </button>
        )}

        {/* Logo + Info Row */}
        <div className="flex items-end gap-4 mt-2">
          {/* Brand Logo (clickable to upload) */}
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-2xl bg-white shadow-lg overflow-hidden flex items-center justify-center cursor-pointer group"
              onClick={() => logoInputRef.current?.click()}
              title="点击更换 Logo"
            >
              {logoPreview || brand.logoUrl ? (
                <img
                  src={logoPreview || brand.logoUrl!}
                  alt={brand.name}
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.svg' }}
                />
              ) : (
                <Utensils className="w-8 h-8 text-amber-400" />
              )}
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                {uploadingLogo ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </div>
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </div>

          {/* Brand Name + Meta */}
          <div className="flex-1 min-w-0 pb-1">
            {editingName ? (
              <div className="space-y-1.5">
                <input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  className="bg-white/20 text-white placeholder-white/60 text-base font-black rounded-xl px-3 py-1.5 w-full outline-none border border-white/30 focus:border-white"
                  placeholder="品牌名称"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={handleSaveBrandInfo}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1 bg-white text-amber-600 font-bold text-[11px] px-3 py-1.5 rounded-xl active:scale-95 transition-all cursor-pointer"
                  >
                    {saving ? <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    保存
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="px-3 py-1.5 rounded-xl bg-white/20 text-white font-bold text-[11px] cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-white truncate">{draftName}</h1>
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1 text-white/70 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {draftLocation && (
                    <span className="flex items-center gap-1 text-white/80 text-[11px] font-medium">
                      <MapPin className="w-3 h-3" />{draftLocation}
                    </span>
                  )}
                  <PlanBadge plan={subscriptionPlan} />
                  {brand.autoPilot && (
                    <span className="flex items-center gap-1 text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full">
                      <Zap className="w-2.5 h-2.5" />Auto-Pilot
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Description preview */}
        {!editingName && draftDesc && (
          <p className="text-white/75 text-[11px] mt-3 leading-relaxed line-clamp-2">{draftDesc}</p>
        )}
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 px-4 flex items-center justify-between">
        <div className="flex overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-400 dark:text-slate-505 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pr-1 flex-shrink-0 py-2">
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 border border-slate-200/50 dark:border-slate-700/50 transition-all cursor-pointer active:scale-95"
          >
            <Settings className="w-3.5 h-3.5 text-slate-455" />
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
              className="p-4 space-y-4 pb-10"
            >
              {/* Brand Info Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">品牌基本信息</h3>
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
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">品牌语气与声调 (Tone of Voice)</h3>
                  <button
                    onClick={handleSaveVoice}
                    disabled={saving}
                    className="flex items-center gap-1 text-[11px] font-bold text-amber-500 hover:text-amber-600 cursor-pointer active:scale-95 transition-transform"
                  >
                    <Save className="w-3.5 h-3.5" />
                    保存声调
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">语气设定描写 (Tone Description)</label>
                  <textarea
                    value={brandTone}
                    onChange={(e) => setBrandTone(e.target.value)}
                    placeholder="例如：专业但亲切的咖啡烘焙工坊语气，多使用第一人称‘我们’，注重传达品质与匠心..."
                    className="w-full min-h-[90px] text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  />
                </div>

                {/* Local Slang Dict */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">本地俚语词典 (Slang Dict)</label>
                    <span className="text-[9px] text-slate-400">供 AI 写手合理插入本地化口语表达</span>
                  </div>

                  {Object.keys(slangDict).length > 0 && (
                    <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800">
                      {Object.entries(slangDict).map(([term, meaning]) => (
                        <div
                          key={term}
                          className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm"
                        >
                          <div className="min-w-0 pr-1.5">
                            <span className="text-[11px] font-bold text-slate-800 dark:text-white block truncate">{term}</span>
                            <span className="text-[9px] text-slate-400 block truncate">{meaning}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = { ...slangDict }
                              delete next[term]
                              setSlangDict(next)
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

          {activeTab === 'growth' && (
            <motion.div
              key="growth"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="p-4 space-y-4 pb-10"
            >
              {/* AMC Growth Sync Controller */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-850 dark:text-white">🚀 战略诊断与增长计划同步</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">从 amc-growth 系统一键拉取并同步最新的商家诊断、商业计划与执行大纲</p>
                  </div>
                  <button
                    onClick={handleSyncGrowth}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-slate-900 text-white hover:bg-black dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 active:scale-95 transition-all cursor-pointer shadow-md"
                  >
                    {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {syncStatus || '同步最新分析'}
                  </button>
                </div>
              </div>

              {growthContext ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">品牌核心战略诊断与定位</h3>
                  <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed overflow-x-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{growthContext}</ReactMarkdown>
                  </div>
                </div>
              ) : null}

              {growthPlan ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">智能增长执行路径与大纲</h3>
                  <div className="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed overflow-x-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{growthPlan}</ReactMarkdown>
                  </div>
                </div>
              ) : null}

              {!growthContext && !growthPlan && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 shadow-sm text-center">
                  <div className="max-w-xs mx-auto space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-500">暂无增长计划快照</p>
                    <p className="text-[10px] text-slate-400">
                      点击“同步最新分析”按钮，从 AMC Growth 获取此品牌的最新战略诊断与执行大纲。
                    </p>
                  </div>
                </div>
              )}
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
              className="relative w-full max-w-lg bg-slate-50 dark:bg-slate-950 shadow-2xl flex flex-col h-full z-10 border-l border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">⚙️ 品牌平台与集成配置</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">管理社交平台授权、第三方 API 凭证与多门店设置</p>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-colors"
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
                          onClick={() => setShowSettings(true)}
                          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-350 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200/50 dark:border-slate-700/50 py-2 rounded-xl transition-all cursor-pointer active:scale-95"
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
                      onClick={() => setShowSettings(true)}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-350 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-200/50 dark:border-slate-700/50 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      配置门店详细信息
                      <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-450" />
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
                    <PlanBadge plan={subscriptionPlan} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'veo3', label: 'Veo3 视频生成', active: addons.veo3 },
                      { key: 'dubco', label: 'Dub.co 多语言配音', active: addons.dubco },
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
                    href={subscriptionHref}
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
              className="relative w-full max-w-2xl bg-slate-50 dark:bg-slate-950 shadow-2xl flex flex-col h-full z-10 border-l border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">📚 品牌推广核心预读上下文</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">此 Profile Markdown 是供 AI Copywriter 创作时预读的，仅保留有价值 of 品牌设定与语境</p>
                </div>
                <button
                  onClick={() => setShowContextModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
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
                          ? 'bg-white dark:bg-slate-950 text-slate-800 dark:text-white shadow-sm'
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
                      className="flex-1 w-full min-h-[380px] p-4 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-750 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
                    />
                  ) : (
                    <div className="flex-1 w-full min-h-[380px] p-4 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 overflow-y-auto prose prose-slate dark:prose-invert max-w-none leading-relaxed">
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

      {showSettings && brand?.id && (
        <BrandSettingsPanel
          brandId={brand.id}
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
