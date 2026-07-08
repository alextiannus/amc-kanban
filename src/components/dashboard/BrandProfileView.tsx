'use client'

import React, { useState, useRef } from 'react'
import {
  X, ChevronLeft, Sparkles, MapPin, Zap, ZapOff, Save,
  Settings, BookOpen, CreditCard, Utensils, Edit3, Check,
  Plus, Trash2, ExternalLink, Upload, Camera, ArrowRight,
  ShieldCheck, Package, Loader2, RefreshCw
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  autoPilot: boolean
  logoUrl?: string | null
}

interface Props {
  brand: Brand
  brandTone: string
  setBrandTone: (v: string) => void
  slangDict: Record<string, string>
  setSlangDict: (v: Record<string, string>) => void
  subscriptionPlan: string
  addons: { veo3: boolean; dubco: boolean }
  onClose: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onOpenSettings: () => void    // opens BrandSettingsPanel modal
  onOpenKnowledge: () => void   // opens BrandKnowledgePanel modal
  subscriptionHref: string
}

type Tab = 'story' | 'social' | 'context' | 'subscription'

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BrandProfileView({
  brand,
  brandTone,
  setBrandTone,
  slangDict,
  setSlangDict,
  subscriptionPlan,
  addons,
  onClose,
  showToast,
  onOpenSettings,
  onOpenKnowledge,
  subscriptionHref,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('story')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Inline brand info editing
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(brand.name)
  const [draftDesc, setDraftDesc] = useState(brand.description || '')
  const [draftLocation, setDraftLocation] = useState(brand.location || '')

  // Logo upload
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Slang form
  const [newTerm, setNewTerm] = useState('')
  const [newMeaning, setNewMeaning] = useState('')

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSyncGrowth = async () => {
    setSyncing(true)
    setSyncStatus('正在同步...')
    try {
      const res = await fetch(`/api/brands/${brand.id}/sync-growth`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setSyncStatus('同步成功')
        showToast(`品牌分析同步成功 (${data.merchantName || data.merchantId})`, 'success')
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
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setLogoPreview(previewUrl)
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/brands/${brand.id}/logo`, { method: 'POST', body: form })
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
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
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
    if (!brand.id) return
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${brand.id}/knowledge`, {
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
    { id: 'social', label: '社交账号', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'context', label: '品牌上下文', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'subscription', label: '订阅计划', icon: <CreditCard className="w-3.5 h-3.5" /> },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="fixed inset-0 z-40 bg-[#f7f9fb] dark:bg-slate-950 flex flex-col overflow-hidden"
    >
      {/* ── Hero Header ───────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-amber-400 via-orange-400 to-amber-500 dark:from-amber-600 dark:via-orange-600 dark:to-amber-700 pt-12 pb-6 px-5 flex-shrink-0">
        {/* Back button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-bold transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          返回
        </button>

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
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 px-4">
        <div className="flex overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
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
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">品牌简介</label>
                  <textarea
                    value={draftDesc}
                    onChange={e => setDraftDesc(e.target.value)}
                    rows={3}
                    className="w-full text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    placeholder="描述您的品牌故事、特色与价值主张…"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">门店位置</label>
                  <input
                    value={draftLocation}
                    onChange={e => setDraftLocation(e.target.value)}
                    className="w-full text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="例如: Singapore, Clarke Quay"
                  />
                </div>
                <button
                  onClick={handleSaveBrandInfo}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-2.5 rounded-xl active:scale-95 transition-all shadow-sm shadow-amber-500/20 cursor-pointer disabled:opacity-60"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  保存品牌信息
                </button>
              </div>

              {/* Brand Voice Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">AI 品牌语气</h3>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">语气风格描述</label>
                  <textarea
                    value={brandTone}
                    onChange={e => setBrandTone(e.target.value)}
                    rows={3}
                    className="w-full text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    placeholder="例如: 轻松幽默、带有新加坡本地风格，善用 Singlish 俚语，对食客亲切友好…"
                  />
                </div>

                {/* Slang Dictionary */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-2">本地俚语词典</label>
                  {Object.keys(slangDict).length > 0 ? (
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 mb-2">
                      {Object.entries(slangDict).map(([term, def]) => (
                        <div key={term} className="flex items-center justify-between px-3 py-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-700 dark:text-slate-200 shrink-0">"{term}"</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-slate-600 dark:text-slate-400 truncate">{def}</span>
                          </div>
                          <button
                            onClick={() => {
                              const next = { ...slangDict }
                              delete next[term]
                              setSlangDict(next)
                            }}
                            className="ml-2 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic mb-2">尚未添加俚语词条</p>
                  )}
                  {/* Add slang */}
                  <div className="flex gap-2">
                    <input
                      value={newTerm}
                      onChange={e => setNewTerm(e.target.value)}
                      placeholder="俚语（如 Bojio）"
                      className="flex-1 text-[11px] px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <input
                      value={newMeaning}
                      onChange={e => setNewMeaning(e.target.value)}
                      placeholder="含义（如：不邀请）"
                      onKeyDown={e => e.key === 'Enter' && handleAddSlang()}
                      className="flex-1 text-[11px] px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <button
                      onClick={handleAddSlang}
                      className="px-2.5 bg-amber-500 text-white rounded-lg flex items-center justify-center cursor-pointer hover:bg-amber-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveVoice}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-2.5 rounded-xl active:scale-95 transition-all shadow-sm shadow-amber-500/20 cursor-pointer disabled:opacity-60"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  保存语气设定
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'social' && (
            <motion.div
              key="social"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="p-4 space-y-3 pb-10"
            >
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                配置各社交平台的 API 凭证与授权信息，让 AI 可以自动发布内容。
              </p>

              {/* Platform cards */}
              {[
                {
                  name: 'PostFast',
                  desc: '自动发布至 Instagram、Facebook 等主流平台',
                  color: 'from-indigo-500 to-purple-600',
                  icon: (
                    <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  ),
                },
                {
                  name: 'Google Business',
                  desc: '管理 Google Maps 商家主页、评论与 OAuth',
                  color: 'from-red-500 to-orange-500',
                  icon: (
                    <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                      <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748z" />
                    </svg>
                  ),
                },
                {
                  name: 'Lark / 飞书',
                  desc: '连接飞书机器人，接收运营通知与老板提醒',
                  color: 'from-sky-500 to-blue-600',
                  icon: (
                    <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                    </svg>
                  ),
                },
              ].map(platform => (
                <div
                  key={platform.name}
                  className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm"
                >
                  <div className={`bg-gradient-to-r ${platform.color} p-4 flex items-center gap-3`}>
                    <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      {platform.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white">{platform.name}</h4>
                      <p className="text-[10px] text-white/75 mt-0.5">{platform.desc}</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <button
                      onClick={onOpenSettings}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      配置 {platform.name}
                      <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-400" />
                    </button>
                  </div>
                </div>
              ))}

              <p className="text-[10px] text-slate-400 text-center pt-2">
                点击任意平台卡片中的「配置」按钮，进入完整的集成设置面板
              </p>
            </motion.div>
          )}

          {activeTab === 'context' && (
            <motion.div
              key="context"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="p-4 space-y-4 pb-10"
            >
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                品牌上下文是 AI 创作内容的核心知识库，包含菜单信息、价格、营业时间、品牌故事与门店配置。
              </p>

              {/* Context card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-violet-500 to-indigo-600 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">品牌知识库</h4>
                    <p className="text-[10px] text-white/75 mt-0.5">菜单、价格、营业时间、品牌故事</p>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {['菜单与价格信息', '营业时间', '特色菜品故事', '门店地址与交通', '品牌创始故事', '节日营销素材'].map(item => (
                      <div key={item} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={onOpenKnowledge}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-violet-500 hover:bg-violet-600 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95 shadow-sm shadow-violet-500/20"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    查看与编辑品牌上下文
                    <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                  </button>
                  <button
                    onClick={handleSyncGrowth}
                    disabled={syncing}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95 border border-slate-200/60 dark:border-slate-700/60 disabled:opacity-50"
                  >
                    {syncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-slate-450" />
                    )}
                    {syncStatus || '从 AMC-growth 同步分析'}
                  </button>
                </div>
              </div>

              {/* Store config card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">门店配置</h4>
                    <p className="text-[10px] text-white/75 mt-0.5">多门店地址、营业时间与 Google 配置</p>
                  </div>
                </div>
                <div className="p-3">
                  <button
                    onClick={onOpenKnowledge}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 py-2.5 rounded-xl transition-all cursor-pointer active:scale-95"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    配置门店信息
                    <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-400" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'subscription' && (
            <motion.div
              key="subscription"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="p-4 space-y-4 pb-10"
            >
              {/* Current plan */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">当前订阅套餐</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-100">{subscriptionPlan}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">AI Marketing Crew 代运营服务</p>
                  </div>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    subscriptionPlan !== '未激活订阅' ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                    <ShieldCheck className={`w-6 h-6 ${subscriptionPlan !== '未激活订阅' ? 'text-emerald-500' : 'text-slate-300'}`} />
                  </div>
                </div>
              </div>

              {/* Add-ons */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">增值服务 Add-ons</h3>
                <div className="space-y-2.5">
                  {[
                    { key: 'veo3', label: 'Veo3 视频生成', desc: 'AI 自动生成短视频内容', active: addons.veo3 },
                    { key: 'dubco', label: 'Dub.co 多语言配音', desc: 'AI 视频自动多语言配音', active: addons.dubco },
                  ].map(addon => (
                    <div key={addon.key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${addon.active ? 'bg-amber-100' : 'bg-slate-200 dark:bg-slate-700'}`}>
                          <Package className={`w-4 h-4 ${addon.active ? 'text-amber-500' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{addon.label}</p>
                          <p className="text-[10px] text-slate-400">{addon.desc}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${addon.active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}>
                        {addon.active ? '已开通' : '未开通'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manage subscription link */}
              <a
                href={subscriptionHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-md shadow-indigo-500/20 cursor-pointer group"
              >
                <div>
                  <p className="text-sm font-black text-white">管理订阅计划</p>
                  <p className="text-[11px] text-white/70 mt-0.5">查看套餐详情、升级方案或续费</p>
                </div>
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-white/30 transition-colors">
                  <ExternalLink className="w-4 h-4 text-white" />
                </div>
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
