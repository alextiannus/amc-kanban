'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Check, X, TrendingUp, TrendingDown, AlertCircle, Star,
  Calendar, Zap, Shield, BarChart2, ChevronDown, Store, Settings, Bot, ExternalLink
} from 'lucide-react'
import { BrandSettingsPanel } from './BrandSettingsPanel'
import BrandKanbanLane from '../BrandKanbanLane'

// ── AgentAvatar: img with graceful initials fallback (no "加载失败" box) ─────
function AgentAvatar({ src, initials, themeColor }: { src: string; initials: string; themeColor?: string | null }) {
  const [failed, setFailed] = React.useState(false)
  if (failed) return <>{initials}</>
  return (
    <img
      src={src}
      alt="Avatar"
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

// ── Action Card (豆腐块 — no swipe, desktop-friendly) ──────────────────────
function ActionCard({ id, type, title, description, platform, onApprove, onReject }: {
  id: string, type: 'urgent' | 'review', title: string, description: string,
  platform?: string, onApprove: (id: string) => void, onReject: (id: string) => void
}) {
  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
      style={{ borderLeftWidth: '3px', borderLeftColor: type === 'urgent' ? '#ef4444' : '#f59e0b' }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center ${type === 'urgent' ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-500'}`}>
            {type === 'urgent' ? <AlertCircle className="w-5 h-5" /> : <Star className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {platform && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{platform}</span>}
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${type === 'urgent' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                {type === 'urgent' ? '紧急处理' : '待审核'}
              </span>
            </div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 leading-snug">{title}</h3>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 mb-4">{description}</p>
        <div className="flex gap-2">
          <button
            onClick={() => onReject(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 text-xs font-bold border border-slate-100 dark:border-slate-700 hover:border-red-100 dark:hover:border-red-900/40 transition-all"
          >
            <X className="w-3.5 h-3.5" /> 忽略
          </button>
          <button
            onClick={() => onApprove(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-500/20"
          >
            <Check className="w-3.5 h-3.5" /> {type === 'urgent' ? '一键回复' : '确认发布'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Platform Catalog ──────────────────────────────────────────────────
const ALL_PLATFORMS = [
  { id: 'instagram',   name: 'Instagram',   icon: 'https://cdn.simpleicons.org/instagram/E4405F',      metric: '粉丝',   unit: '' },
  { id: 'xiaohongshu', name: '小红书',      icon: 'https://cdn.simpleicons.org/xiaohongshu/FF2442',   metric: '粉丝',   unit: '' },
  { id: 'tiktok',      name: 'TikTok',      icon: 'https://cdn.simpleicons.org/tiktok/000000',        metric: '粉丝',   unit: '', iconDark: 'https://cdn.simpleicons.org/tiktok/ffffff' },
  { id: 'google',      name: 'Google',      icon: 'https://cdn.simpleicons.org/google/4285F4',        metric: '评分',   unit: '★' },
  { id: 'facebook',    name: 'Facebook',    icon: 'https://cdn.simpleicons.org/facebook/1877F2',      metric: '粉丝',   unit: '' },
  { id: 'youtube',     name: 'YouTube',     icon: 'https://cdn.simpleicons.org/youtube/FF0000',       metric: '订阅',   unit: '' },
  { id: 'x',           name: 'X (Twitter)', icon: 'https://cdn.simpleicons.org/x/000000',            metric: '粉丝',   unit: '', iconDark: 'https://cdn.simpleicons.org/x/ffffff' },
  { id: 'yelp',        name: 'Yelp',        icon: 'https://cdn.simpleicons.org/yelp/FF1A1A',          metric: '评分',   unit: '★' },
  { id: 'linkedin',    name: 'LinkedIn',    icon: 'https://cdn.simpleicons.org/linkedin/0A66C2',      metric: '连接',   unit: '' },
  { id: 'pinterest',   name: 'Pinterest',   icon: 'https://cdn.simpleicons.org/pinterest/BD081C',    metric: '粉丝',   unit: '' },
  { id: 'weibo',       name: '微博',        icon: 'https://cdn.simpleicons.org/sinaweibo/E6162D',    metric: '粉丝',   unit: '' },
  { id: 'wechat',      name: '微信公众号',   icon: 'https://cdn.simpleicons.org/wechat/07C160',       metric: '订阅',   unit: '' },
  { id: 'snapchat',    name: 'Snapchat',    icon: 'https://cdn.simpleicons.org/snapchat/FFFC00',      metric: '粉丝',   unit: '' },
  { id: 'tripadvisor', name: 'TripAdvisor', icon: 'https://cdn.simpleicons.org/tripadvisor/34E0A1',  metric: '评分',   unit: '★' },
]

interface ConnectedAccount {
  uid: string          // unique instance id (allows multiple of same platform)
  platformId: string
  handle: string       // @username or account label
  profileUrl?: string  // public profile page
  value: string        // metric value
  delta: string
  deltaPositive: boolean
}

// ── KPI Tofu Card (小豆腐块 compact) ───────────────────────────────────
function PlatformLogo({ icon, name, size = 20 }: { icon: string; name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt={name}
      width={size}
      height={size}
      className="object-contain"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
}

function KpiCard({ account }: { account: ConnectedAccount }) {
  const platform = ALL_PLATFORMS.find(p => p.id === account.platformId)
  if (!platform) return null
  // Extract a hex color from the icon URL for tinting
  const colorMatch = platform.icon.match(/\/([A-Fa-f0-9]{6})$/)
  const tint = colorMatch ? `#${colorMatch[1]}` : '#6366f1'
  const inner = (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl p-4 border shadow-sm transition-all flex flex-col gap-3 min-w-0 relative overflow-hidden ${
      account.profileUrl
        ? 'border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer group'
        : 'border-slate-100 dark:border-slate-800'
    }`}>
      {/* Subtle tinted top bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: tint }} />
      {account.profileUrl && (
        <ExternalLink className="absolute top-3.5 right-3.5 w-3 h-3 text-slate-300 dark:text-slate-600 group-hover:text-blue-400 transition-colors" />
      )}
      <div className="flex items-center gap-3">
        {/* Bigger logo with platform-tinted background */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform overflow-hidden border border-white dark:border-slate-700 shadow-sm"
          style={{ background: `${tint}18` }}
        >
          <PlatformLogo icon={platform.icon} name={platform.name} size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200 truncate pr-5">{account.handle || platform.name}</p>
          <p className="text-[10px] text-slate-400 truncate">{platform.name}</p>
        </div>
      </div>
      <div>
        <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-none">{account.value}</p>
        <div className={`flex items-center gap-0.5 text-[10px] font-bold mt-1 ${account.deltaPositive ? 'text-emerald-500' : 'text-red-500'}`}>
          {account.deltaPositive ? <TrendingUp className="w-3 h-3 flex-shrink-0" /> : <TrendingDown className="w-3 h-3 flex-shrink-0" />}
          <span>{account.delta}</span>
          <span className="text-slate-400 font-medium ml-1">{platform.metric}</span>
        </div>
      </div>
    </div>
  )
  if (account.profileUrl) {
    return (
      <a href={account.profileUrl} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    )
  }
  return inner
}

// ── Add Account Modal — two-step: pick platform → fill credentials ──────────
function AddAccountModal({ brandId, onDone, onClose, isAdmin }: {
  brandId: string
  onDone: () => void
  onClose: () => void
  isAdmin?: boolean
}) {
  const [step, setStep] = useState<'pick' | 'form'>('pick')
  const [selectedPlatform, setSelectedPlatform] = useState<typeof ALL_PLATFORMS[0] | null>(null)
  const [form, setForm] = useState({ handle: '', profileUrl: '', loginUsername: '', loginPassword: '' })
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const handlePick = (p: typeof ALL_PLATFORMS[0]) => {
    setSelectedPlatform(p)
    setForm({ handle: '', profileUrl: '', loginUsername: '', loginPassword: '' })
    setStep('form')
  }

  const handleSubmit = async () => {
    if (!form.handle.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/brands/${brandId}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformId: selectedPlatform!.id,
          handle: form.handle.trim(),
          profileUrl: form.profileUrl.trim() || null,
          loginUsername: form.loginUsername.trim() || null,
          loginPassword: form.loginPassword || null,
        }),
      })
      onDone()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          {step === 'form' && (
            <button onClick={() => setStep('pick')} className="mr-3 w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              ←
            </button>
          )}
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex-1">
            {step === 'pick' ? '选择平台' : `添加 ${selectedPlatform?.name} 账号`}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Platform grid */}
        {step === 'pick' && (
          <div className="overflow-y-auto p-6 pt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
            {ALL_PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => handlePick(p)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all group active:scale-95"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform border border-slate-100 dark:border-slate-700">
                  <PlatformLogo icon={p.icon} name={p.name} size={22} />
                </div>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 text-center leading-tight">{p.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Credential form */}
        {step === 'form' && selectedPlatform && (
          <div className="overflow-y-auto p-6 space-y-4">
            {/* Platform badge */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700">
                <PlatformLogo icon={selectedPlatform.icon} name={selectedPlatform.name} size={20} />
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedPlatform.name}</span>
            </div>

            {/* Handle */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">账号 Handle *</label>
              <input
                value={form.handle}
                onChange={e => setForm(p => ({ ...p, handle: e.target.value }))}
                placeholder={`@${selectedPlatform.name.toLowerCase()} 用户名`}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                id="add-account-handle"
              />
            </div>

            {/* Profile URL */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">主页链接</label>
              <input
                type="url"
                value={form.profileUrl}
                onChange={e => setForm(p => ({ ...p, profileUrl: e.target.value }))}
                placeholder={`https://${selectedPlatform.id}.com/...`}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                id="add-account-profile-url"
              />
            </div>

            {/* Login credentials */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">登录凭证（Admin 可查看）</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">登录账号 / 邮箱</label>
                  <input
                    value={form.loginUsername}
                    onChange={e => setForm(p => ({ ...p, loginUsername: e.target.value }))}
                    placeholder="login@example.com"
                    className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    id="add-account-login"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">密码</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.loginPassword}
                      onChange={e => setForm(p => ({ ...p, loginPassword: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      id="add-account-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-bold"
                    >
                      {showPw ? '隐藏' : '显示'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!form.handle.trim() || saving}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-blue-500/20"
              id="add-account-submit"
            >
              {saving ? '保存中…' : '保存账号'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Activity Tofu Card (豆腐块战报) ─────────────────────────────────────────
type ActivityStatus = 'done' | 'pending' | 'scheduled'

const STATUS_META: Record<ActivityStatus, { label: string; cls: string }> = {
  done: { label: '已发布', cls: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' },
  pending: { label: '待审核', cls: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' },
  scheduled: { label: '已排期', cls: 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' },
}

function ActivityCard({ icon, label, sub, time, status, actionLabel, onAction }: {
  icon: React.ReactNode
  label: string
  sub?: string
  time: string
  status?: ActivityStatus
  actionLabel?: string
  onAction?: () => void
}) {
  const meta = status ? STATUS_META[status] : null
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm px-4 py-3 flex items-center gap-3 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700 transition-all group">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 ${
        status === 'done' ? 'bg-emerald-50 dark:bg-emerald-900/20' :
        status === 'pending' ? 'bg-amber-50 dark:bg-amber-900/20' :
        status === 'scheduled' ? 'bg-indigo-50 dark:bg-indigo-900/20' :
        'bg-slate-100 dark:bg-slate-800'
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug truncate">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{time}</span>
        {meta && (
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
        )}
        {actionLabel && onAction && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction() }}
            className="text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg transition-colors shadow-sm shadow-emerald-500/20"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Conversion Card ─────────────────────────────────────────────────────────
function ConversionCard({ label, value, sub, progress, color }: { label: string, value: string, sub: string, progress: number, color: string }) {
  const isEmpty = value === '0' || value === '' || Number(value) === 0
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-3xl font-black leading-none mb-1 ${
        isEmpty ? 'text-slate-200 dark:text-slate-700' : 'text-slate-800 dark:text-slate-100'
      }`}>
        {isEmpty ? '—' : value}
      </p>
      <p className="text-[11px] text-slate-400 mb-3">{sub}</p>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ── Brand Switcher ───────────────────────────────────────────────────────────
interface Brand { id: string; name: string; location?: string }

function BrandSwitcher({ brands, activeBrand, onChange }: {
  brands: Brand[]
  activeBrand: Brand
  onChange: (b: Brand) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Even with 1 brand, show a non-interactive label so user knows which brand they're on
  if (brands.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 truncate max-w-[140px]">
        <Store size={11} className="flex-shrink-0" />
        <span className="truncate">{activeBrand.name}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all max-w-[160px]"
      >
        <Store size={11} className="flex-shrink-0 text-blue-500" />
        <span className="truncate">{activeBrand.name}</span>
        <ChevronDown size={11} className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden min-w-[200px]">
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">切换品牌</p>
          </div>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => { onChange(b); setOpen(false) }}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                activeBrand.id === b.id ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
              }`}
            >
              <Store size={13} className={`flex-shrink-0 ${activeBrand.id === b.id ? 'text-blue-500' : 'text-slate-400'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold truncate ${activeBrand.id === b.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'}`}>{b.name}</p>
                {b.location && <p className="text-[10px] text-slate-400 truncate">{b.location}</p>}
              </div>
              {activeBrand.id === b.id && <Check size={12} className="flex-shrink-0 text-blue-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
interface Brand { id: string; name: string; location?: string }

interface DashboardHomeProps {
  brand?: Brand
  activeBrandId?: string
  onActiveBrandIdChange?: (id: string) => void
}

// Map API ActionItem → local display shape
function toCardType(apiType: string, priority: string): 'urgent' | 'review' {
  if (apiType === 'sentiment_alert' || priority === 'urgent') return 'urgent'
  return 'review'
}

function fmtFollower(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function normalizeDashboardPlatformId(platformId: string): string {
  const p = String(platformId ?? '').toLowerCase().trim()
  if (
    p === 'google' ||
    p === 'gbp' ||
    p === 'gmb' ||
    p === 'google_maps' ||
    p === 'googlemaps' ||
    p === 'google_business_profile' ||
    p === 'googlebusinessprofile' ||
    p === 'google_my_business' ||
    p === 'googlemybusiness'
  ) {
    return 'google'
  }
  return p
}

export default function DashboardHome({ brand: propBrand, activeBrandId, onActiveBrandIdChange }: DashboardHomeProps) {
  // ── Brand list from API ──────────────────────────────────────────────────
  const [brandList, setBrandList] = useState<Brand[]>([])
  const [activeBrand, setActiveBrand] = useState<Brand | null>(propBrand ?? null)
  const [brandLoading, setBrandLoading] = useState(true)

  useEffect(() => {
    fetch('/api/brands')
      .then(r => r.ok ? r.json() : [])
      .then((list: any[]) => {
        const mapped = list.map(b => ({ id: b.id, name: b.name, location: b.location }))
        setBrandList(mapped)
        if (mapped.length === 0) return
        if (activeBrandId) {
          const target = mapped.find(b => b.id === activeBrandId)
          if (target) {
            setActiveBrand(target)
            return
          }
        }
        if (!activeBrand) {
          setActiveBrand(mapped[0])
          onActiveBrandIdChange?.(mapped[0].id)
        }
      })
      .catch(console.error)
      .finally(() => setBrandLoading(false))
  }, [])

  useEffect(() => {
    // If parent passes a default brand, only apply it when no persisted/selected brand is active.
    if (propBrand && !activeBrandId) setActiveBrand(propBrand)
  }, [propBrand?.id, activeBrandId])

  useEffect(() => {
    if (!activeBrandId || brandList.length === 0) return
    const target = brandList.find(b => b.id === activeBrandId)
    if (target && target.id !== activeBrand?.id) setActiveBrand(target)
  }, [activeBrandId, brandList, activeBrand?.id])

  // ── Brand detail (accounts, action items) ───────────────────────────────
  const [brandDetail, setBrandDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/brands/${id}`)
      if (r.ok) setBrandDetail(await r.json())
    } finally { setDetailLoading(false) }
  }, [])

  // Brand settings (integration credentials status)
  const [brandSettings, setBrandSettings] = useState<any>(null)
  const loadSettings = useCallback(async (id: string) => {
    const r = await fetch(`/api/brands/${id}/settings`)
    if (r.ok) setBrandSettings(await r.json())
  }, [])

  // Brand agents
  const [brandAgents, setBrandAgents] = useState<any[]>([])
  const loadAgents = useCallback(async (id: string) => {
    const r = await fetch(`/api/brands/${id}/agents`)
    if (r.ok) setBrandAgents(await r.json())
  }, [])

  useEffect(() => {
    if (activeBrand?.id) {
      // Clear stale data immediately so the UI doesn't show the previous brand's content
      setBrandDetail(null)
      setBrandSettings(null)
      setBrandAgents([])
      setDismissedIds(new Set())
      setAutoPilot(false)
      // Load new brand data
      loadDetail(activeBrand.id)
      loadSettings(activeBrand.id)
      loadAgents(activeBrand.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id])

  // Derive data from brandDetail or fall back to empty
  const apiActionItems: any[] = brandDetail?.actionItems ?? []
  const apiAccounts: any[] = brandDetail?.accounts ?? []
  const apiAutoPilot: boolean = brandDetail?.autoPilot ?? false
  const weekConversions: any[] = brandDetail?.weekConversions ?? []
  const recentDrafts: any[] = brandDetail?.recentDrafts ?? []
  const operationsReport: any = brandDetail?.operationsReport
  const pendingReviewCount: number = brandDetail?._count?.contents ?? 0
  const postfastSync: { ok: boolean; error?: string } | undefined = brandDetail?.postfastSync

  // ── Local UI state ───────────────────────────────────────────────────────
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [autoPilot, setAutoPilot] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Sync autoPilot from DB
  useEffect(() => { setAutoPilot(apiAutoPilot) }, [apiAutoPilot])

  // Visible action items = pending and not locally dismissed
  const pendingItems = apiActionItems.filter(i => !dismissedIds.has(i.id))

  // Convert API accounts → ConnectedAccount shape, dedup google by platformId
  const seenPlatforms = new Set<string>()
  const connectedAccounts: ConnectedAccount[] = apiAccounts
    .sort((a: any, b: any) => {
      // For google: prefer the one with ratingScore to surface first
      if (a.platformId === 'google' && b.platformId === 'google') {
        return (b.ratingScore ?? 0) - (a.ratingScore ?? 0)
      }
      return 0
    })
    .filter((a: any) => {
      const pid = normalizeDashboardPlatformId(a.platformId)
      // For google, only show the first (highest-rated) entry
      if (pid === 'google') {
        if (seenPlatforms.has('google')) return false
        seenPlatforms.add('google')
      }
      return true
    })
    .map((a: any) => ({
      uid: a.id,
      platformId: normalizeDashboardPlatformId(a.platformId),
      handle: a.handle,
      profileUrl: a.profileUrl ?? undefined,
      value: a.ratingScore ? `${a.ratingScore}★` : fmtFollower(a.followerCount),
      delta: a.followerDelta != null
        ? `${a.followerDelta >= 0 ? '+' : ''}${a.followerDelta}`
        : '—',
      deltaPositive: (a.followerDelta ?? 0) >= 0 && !(a.ratingScore && a.followerDelta < 0),
    }))

  // ── Approve / Reject ─────────────────────────────────────────────────────
  const approve = async (id: string) => {
    setDismissedIds(p => new Set([...p, id]))
    if (activeBrand?.id) {
      await fetch(`/api/brands/${activeBrand.id}/actions/${id}/approve`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      loadDetail(activeBrand.id)
    }
  }
  const reject = async (id: string) => {
    setDismissedIds(p => new Set([...p, id]))
    if (activeBrand?.id) {
      await fetch(`/api/brands/${activeBrand.id}/actions/${id}/reject`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      loadDetail(activeBrand.id)
    }
  }

  // ── AutoPilot toggle ──────────────────────────────────────────────────────
  const toggleAutoPilot = async () => {
    const next = !autoPilot
    setAutoPilot(next)
    if (activeBrand?.id) {
      await fetch(`/api/brands/${activeBrand.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoPilot: next }) })
    }
  }


  // ── Add account ───────────────────────────────────────────────────────────
  const onAccountAdded = () => { if (activeBrand?.id) loadDetail(activeBrand.id) }

  // ── Conversion stats ─────────────────────────────────────────────────────
  const countConv = (type: string) => weekConversions
    .filter(c => c.type === type)
    .reduce((s, c) => s + (c._count?.id ?? 0), 0)
  const navClicks = countConv('nav_click')
  const bookingClicks = countConv('booking_click')
  const couponRedemptions = countConv('coupon_redemption')
  const maxConv = Math.max(navClicks, bookingClicks, couponRedemptions, 1)

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (brandLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
          <p className="text-xs text-slate-400 font-medium">加载品牌数据…</p>
        </div>
      </div>
    )
  }
  if (!activeBrand) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4 min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Store className="w-8 h-8 text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">暂无品牌</p>
          <p className="text-xs text-slate-400 mt-1">请先让 Agent 初始化品牌，或手动创建</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 pb-44 space-y-6">

      {/* ── Brand Header Card ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Gradient accent strip */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        {/* Top bar: brand name + controls */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 px-6 pt-5 pb-4 border-b border-slate-50 dark:border-slate-800/80">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-500/20">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 leading-tight">{activeBrand.name}</h2>
                {brandList.length > 1 && (
                  <div className="relative group">
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="切换品牌"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <div className="absolute left-0 mt-1 w-52 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden hidden group-hover:block z-50">
                      <div className="px-3 pt-2.5 pb-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">切换品牌</p>
                      </div>
                      {brandList.map(b => (
                        <button
                          key={b.id}
                          onClick={() => {
                            setActiveBrand(b)
                            onActiveBrandIdChange?.(b.id)
                          }}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                            activeBrand.id === b.id ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <Store size={13} className={`flex-shrink-0 ${activeBrand.id === b.id ? 'text-blue-500' : 'text-slate-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold truncate ${activeBrand.id === b.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'}`}>{b.name}</p>
                            {b.location && <p className="text-[10px] text-slate-400 truncate">{b.location}</p>}
                          </div>
                          {activeBrand.id === b.id && <Check size={12} className="flex-shrink-0 text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeBrand.location && (
                  <span className="text-sm text-slate-400 font-medium hidden sm:inline">· {activeBrand.location}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
            <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 px-2.5 py-1.5 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">AI 在线</span>
            </div>
            {pendingReviewCount > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 px-2.5 py-1.5 rounded-xl">
                <Zap className="w-3 h-3 text-blue-500" />
                <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400">{pendingReviewCount} 待审核</span>
              </div>
            )}
            {pendingItems.some(i => i.priority === 'urgent' || i.type === 'sentiment_alert') && (
              <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 px-2.5 py-1.5 rounded-xl">
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-[11px] font-bold text-red-700 dark:text-red-400">
                  {pendingItems.filter(i => i.priority === 'urgent' || i.type === 'sentiment_alert').length} 差评
                </span>
              </div>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10"
              title="集成配置"
            >
              <Settings className="w-3 h-3" />
              配置
            </button>
          </div>
        </div>

        {/* Brand profile body */}
        <div className="px-6 py-5">
          {brandDetail?.description ? (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4 max-w-3xl">
              {brandDetail.description}
            </p>
          ) : (
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-3 p-3.5 mb-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-left hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 group transition-all"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors flex-shrink-0">
                <Store className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <div>

              {postfastSync && !postfastSync.ok && (
                <div className="mx-6 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                  PostFast 账号同步失败，可能导致 Google Business 未显示。请在集成配置中更新 PostFast API Key 后重试。
                </div>
              )}
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">添加品牌介绍</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">品牌故事、特色、定位等信息</p>
              </div>
            </button>
          )}

          {(activeBrand.location || brandDetail?.website || brandDetail?.phone || brandDetail?.address) && (
            <div className="flex flex-wrap gap-2">
              {activeBrand.location && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                  📍 {activeBrand.location}
                </span>
              )}
              {brandDetail?.address && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                  🏢 {brandDetail.address}
                </span>
              )}
              {brandDetail?.website && (
                <a href={brandDetail.website} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 px-2.5 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors truncate max-w-[200px]">
                  🌐 {brandDetail.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {brandDetail?.phone && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                  📞 {brandDetail.phone}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Grid ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart2 className="w-4 h-4" /> 账号资产配置
          </h3>
          <button
            onClick={() => setShowAddAccount(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-800/50 px-3 py-1.5 rounded-xl transition-all"
          >
            <span className="text-base leading-none font-black">+</span> 添加新账号
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {connectedAccounts.map(acc => (
            <KpiCard key={acc.uid} account={acc} />
          ))}
        </div>
      </section>

      {/* ── AI 序列行 ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Header: label + iOS-style toggle */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50 dark:border-slate-800">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Bot className="w-3 h-3" /> AI 序列
            {brandAgents.length > 0 && (
              <span className="text-[10px] font-normal normal-case tracking-normal text-slate-300 dark:text-slate-600 ml-1">
                {brandAgents.length} 人在线
              </span>
            )}
          </p>
          {/* iOS-style toggle switch */}
          <button
            onClick={toggleAutoPilot}
            className="flex items-center gap-2.5 group"
            title={autoPilot ? '当前：自动驾驶 — 点击切换为老板审批' : '当前：老板审批 — 点击切换为自动驾驶'}
          >
            <span className={`text-[11px] font-bold tracking-wide transition-colors ${autoPilot ? 'text-indigo-500 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {autoPilot ? '自动驾驶' : '老板审批'}
            </span>
            <div
              className={`relative rounded-full transition-colors duration-300 flex-shrink-0 ${autoPilot ? 'bg-indigo-500' : 'bg-amber-400'}`}
              style={{ width: '36px', height: '20px' }}
            >
              <div
                className="absolute top-0.5 bg-white rounded-full shadow-sm transition-all duration-300"
                style={{ width: '16px', height: '16px', left: autoPilot ? '18px' : '2px' }}
              />
            </div>
          </button>
        </div>
        {/* Agent cards */}
        <div className="p-4">
          {brandAgents.length > 0 ? (
            <div className="flex gap-6 overflow-x-auto pb-3 -mx-0.5 px-0.5">
              {brandAgents.map((ba: any) => {
                const agent = ba.agent
                if (!agent) return null
                return (
                  <div
                    key={ba.id}
                    style={agent.themeColor ? { borderColor: agent.themeColor } : undefined}
                    className="group bg-white dark:bg-slate-900 border rounded-3xl p-6 flex-shrink-0 w-56 cursor-default transition-all duration-300 relative border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm hover:shadow-md"
                  >
                    {/* Online dot */}
                    <div className="absolute top-6 right-6 flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full ${
                        ba.active
                          ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse'
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`} />
                    </div>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-4 mb-5 pr-8">
                      <div
                        style={agent.themeColor ? { backgroundColor: `${agent.themeColor}20`, color: agent.themeColor } : undefined}
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-bold overflow-hidden border border-white dark:border-slate-700 shadow-sm flex-shrink-0 ${!agent.themeColor ? 'bg-slate-200 text-slate-600' : ''}`}
                      >
                        {agent.avatar
                          ? <AgentAvatar src={agent.avatar} initials={(agent.nickname || agent.email || '?').substring(0, 2).toUpperCase()} themeColor={agent.themeColor} />
                          : (agent.nickname || agent.email || '?').substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-slate-800 dark:text-slate-100 truncate text-lg">{agent.nickname || agent.email?.split('@')[0]}</h3>
                        <p className="text-xs font-medium text-slate-400 truncate">{agent.email}</p>
                      </div>
                    </div>

                    {/* WORKFLOW badge + insights */}
                    {agent.insights && (
                      <div className="mb-2">
                        <span className="text-[10px] uppercase font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded flex w-fit mb-2">Workflow</span>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{agent.insights}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 py-1 text-slate-300 dark:text-slate-700">
              <Bot className="w-4 h-4" />
              <span className="text-xs">暂无 AI 员工连接，Agent 初始化后将自动出现</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Pending Action Items (豆腐块) ────────────────────────────── */}
      {pendingItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" /> 待处理事项
            </h3>
            <span className="text-[10px] font-black text-white bg-amber-500 px-2.5 py-0.5 rounded-full">{pendingItems.length} NEW</span>
          </div>
          <div className="space-y-3">
            {pendingItems.map(item => (
              <ActionCard
                key={item.id}
                id={item.id}
                type={toCardType(item.type, item.priority)}
                platform={item.account?.platformId ?? item.type}
                title={item.title}
                description={item.description}
                onApprove={approve}
                onReject={reject}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── AI 活动战报 — 品牌泳道工作看板 ──────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            AI 活动战报
          </h3>
        </div>
        {activeBrand ? (
          <BrandKanbanLane brandId={activeBrand.id} />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2.5 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
            <Zap className="w-8 h-8 text-slate-200 dark:text-slate-700" />
            <p className="text-sm font-bold text-slate-400">请先选择品牌</p>
          </div>
        )}
      </section>

      {/* ── ROI / Conversion tracking ───────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> 本周转化跟踪
          </h3>
          <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-full">by AI Agent · 7d</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ConversionCard
            label="导航点击"
            value={String(navClicks)}
            sub="来自 IG / TikTok 帖子"
            progress={Math.round((navClicks / Math.max(maxConv, 1)) * 100)}
            color="bg-pink-400"
          />
          <ConversionCard
            label="预订链接点击"
            value={String(bookingClicks)}
            sub="来自小红书、Google"
            progress={Math.round((bookingClicks / Math.max(maxConv, 1)) * 100)}
            color="bg-emerald-400"
          />
          <ConversionCard
            label="折扣码核销"
            value={String(couponRedemptions)}
            sub="整体折扣码使用"
            progress={Math.round((couponRedemptions / Math.max(maxConv, 1)) * 100)}
            color="bg-indigo-400"
          />
        </div>
      </section>

      {/* ── Brand Operations Report (PostFast) ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-500" /> 品牌运营报告（优先）
          </h3>
          <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-full">PostFast · 近7天</span>
        </div>

        {!operationsReport ? (
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-xs text-slate-500 dark:text-slate-400">
            暂无可用运营报告数据。请先确认 PostFast 已连接并有已发布内容。
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ConversionCard
                label="已发布内容"
                value={String(operationsReport.publishedCount ?? 0)}
                sub="近7天"
                progress={100}
                color="bg-indigo-400"
              />
              <ConversionCard
                label="总互动"
                value={String(operationsReport.engagement?.interactions ?? 0)}
                sub="点赞+评论+分享"
                progress={100}
                color="bg-blue-400"
              />
              <ConversionCard
                label="总曝光"
                value={String(operationsReport.engagement?.impressions ?? 0)}
                sub="impressions"
                progress={100}
                color="bg-violet-400"
              />
              <ConversionCard
                label="互动率"
                value={`${operationsReport.engagement?.interactionRate ?? 0}%`}
                sub="互动 / 曝光"
                progress={100}
                color="bg-emerald-400"
              />
            </div>

            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Top 内容表现
              </div>
              {(operationsReport.topPosts ?? []).length === 0 ? (
                <div className="p-4 text-xs text-slate-500 dark:text-slate-400">暂无已发布内容可分析。</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(operationsReport.topPosts ?? []).map((post: any) => (
                    <div key={post.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="mt-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 px-2 py-0.5 rounded-full">
                        {post.platform}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 line-clamp-2">{post.caption || '无文案'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          互动 {post.interactions ?? 0} · 曝光 {post.impressions ?? 0}
                        </p>
                      </div>
                      {post.postUrl && (
                        <a
                          href={post.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                        >
                          查看帖子
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="pt-2 pb-4 text-center">
        <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
          Powered by Immedi.AI
        </p>
      </div>

      {/* ── Add Account Modal ──────────────────────────────────────────── */}
      {showAddAccount && activeBrand?.id && (
        <AddAccountModal
          brandId={activeBrand.id}
          onDone={onAccountAdded}
          onClose={() => setShowAddAccount(false)}
        />
      )}

      {/* ── Brand Settings Modal (集成配置) ────────────────────────────── */}
      {activeBrand?.id && (
        <BrandSettingsPanel
          brandId={activeBrand.id}
          open={showSettings}
          onClose={() => setShowSettings(false)}
          initialSettings={brandSettings}
        />
      )}

    </div>
  )
}
