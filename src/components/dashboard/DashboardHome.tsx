'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Check, X, TrendingUp, TrendingDown, AlertCircle, Star,
  Zap, BarChart2, ChevronDown, Store, Settings, Bot, ExternalLink, FileText,
  Users, UserPlus, Shield, Archive, UserMinus, RefreshCw
} from 'lucide-react'
import { BrandSettingsPanel } from './BrandSettingsPanel'
import { BrandKnowledgePanel } from './BrandKnowledgePanel'
import BrandKanbanLane from '../BrandKanbanLane'
import { useSearchParams, useRouter } from 'next/navigation'
import { fmtFollower, normalizeDashboardPlatformId, toCardType } from './dashboardHomeUtils'
import { ActionCard, AgentAvatar } from './DashboardHomeCards'

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

interface DashboardActionItem {
  id: string
  priority?: string | null
  type?: string | null
  title?: string | null
  description?: string | null
}

interface DashboardAccount {
  id: string
  platformId: string
  handle: string
  profileUrl?: string | null
  ratingScore?: number | null
  followerCount?: number | null
  followerDelta?: number | null
}

interface DashboardAgentRecord {
  id: string
  active?: boolean
  agent?: {
    themeColor?: string | null
    avatar?: string | null
    nickname?: string | null
    email?: string | null
    insights?: string | null
  } | null
}

interface DashboardDetail {
  status?: string
  actionItems?: DashboardActionItem[]
  accounts?: DashboardAccount[]
  autoPilot?: boolean
  recentDrafts?: unknown[]
  _count?: { contents?: number }
  postfastSync?: { ok: boolean; error?: string }
  description?: string
  website?: string
  phone?: string
  address?: string
}

interface BrandMemberRecord {
  id: string
  role: 'owner' | 'collaborator'
  userId: string
  user: {
    id: string
    email: string
    nickname?: string | null
    type: string
    role: string
  }
}

interface DashboardSettingsData {
  [key: string]: unknown
}

// ── KPI Tofu Card (小豆腐块 compact) ───────────────────────────────────
function PlatformLogo({ icon, iconDark, name, size = 20 }: { icon: string; iconDark?: string; name: string; size?: number }) {
  const [srcIndex, setSrcIndex] = useState(0)
  const fallbackColorMatch = icon.match(/\/([A-Fa-f0-9]{6})$/)
  const fallbackBg = fallbackColorMatch ? `#${fallbackColorMatch[1]}` : '#4B5563'
  const fallbackGlyph = name.trim().slice(0, 1).toUpperCase()
  const fallbackSvg = React.useMemo(() => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" rx="${Math.max(6, Math.floor(size * 0.3))}" fill="${fallbackBg}" />
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(10, Math.floor(size * 0.48))}" font-weight="700" fill="#ffffff">${fallbackGlyph}</text>
      </svg>
    `.trim()
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  }, [fallbackBg, fallbackGlyph, size])

  const candidates = React.useMemo(() => {
    const uniq = Array.from(new Set([icon, iconDark, fallbackSvg].filter(Boolean) as string[]))
    return uniq
  }, [icon, iconDark, fallbackSvg])

  useEffect(() => {
    queueMicrotask(() => setSrcIndex(0))
  }, [icon, iconDark, name, fallbackSvg])

  const fallback = (
    <span
      aria-label={name}
      title={name}
      className="inline-flex items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 font-black"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size * 0.45)) }}
    >
      {fallbackGlyph}
    </span>
  )

  if (!candidates[srcIndex]) return fallback

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[srcIndex]}
      alt={name}
      width={size}
      height={size}
      className="object-contain"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setSrcIndex((i) => i + 1)}
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
          <PlatformLogo icon={platform.icon} iconDark={platform.iconDark} name={platform.name} size={24} />
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
  void isAdmin
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
                  <PlatformLogo icon={p.icon} iconDark={p.iconDark} name={p.name} size={22} />
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
                <PlatformLogo icon={selectedPlatform.icon} iconDark={selectedPlatform.iconDark} name={selectedPlatform.name} size={20} />
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

void ActivityCard
void ConversionCard
void BrandSwitcher

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
        isEmpty ? 'text-slate-300 dark:text-slate-700' : 'text-slate-800 dark:text-slate-100'
      }`}>
        {value}
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

export default function DashboardHome({ brand: propBrand, activeBrandId, onActiveBrandIdChange }: DashboardHomeProps) {
  void activeBrandId
  void onActiveBrandIdChange
  // ── Brand: driven entirely by the parent (KanbanBoard top-bar switcher) ──
  // No internal brand state — propBrand IS the activeBrand.
  // KanbanBoard remounts this component (via key prop) whenever the brand changes.
  const activeBrand = propBrand ?? null
  const brandLoading = false

  // ── Brand detail (accounts, action items) ───────────────────────────────

  const [brandDetail, setBrandDetail] = useState<DashboardDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  void detailLoading

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/brands/${id}`)
      if (r.ok) setBrandDetail(await r.json())
    } finally { setDetailLoading(false) }
  }, [])

  // Brand settings (integration credentials status)
  const [brandSettings, setBrandSettings] = useState<DashboardSettingsData | null>(null)
  const loadSettings = useCallback(async (id: string) => {
          const r = await fetch(`/api/brands/${id}/settings`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          })
    if (r.ok) setBrandSettings(await r.json())
  }, [])

  // Brand agents
  const [brandAgents, setBrandAgents] = useState<DashboardAgentRecord[]>([])
  const loadAgents = useCallback(async (id: string) => {
    const r = await fetch(`/api/brands/${id}/agents`)
    if (r.ok) setBrandAgents(await r.json())
  }, [])

  const [brandMembers, setBrandMembers] = useState<BrandMemberRecord[]>([])
  const [brandMembersLoading, setBrandMembersLoading] = useState(false)
  const [brandMembersVisible, setBrandMembersVisible] = useState(false)
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<'owner' | 'collaborator'>('collaborator')
  const [memberSaving, setMemberSaving] = useState(false)
  const [archivingBrand, setArchivingBrand] = useState(false)

  const loadBrandMembers = useCallback(async (id: string) => {
    setBrandMembersLoading(true)
    try {
      const r = await fetch(`/api/brands/${id}/owners`)
      if (r.ok) {
        setBrandMembers(await r.json())
        setBrandMembersVisible(true)
      } else {
        setBrandMembers([])
        setBrandMembersVisible(false)
      }
    } finally {
      setBrandMembersLoading(false)
    }
  }, [])

  // ── Local UI state ───────────────────────────────────────────────────────
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [autoPilot, setAutoPilot] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showKnowledge, setShowKnowledge] = useState(false)

  useEffect(() => {
    if (activeBrand?.id) {
      queueMicrotask(() => {
        // Clear stale data immediately so the UI doesn't show the previous brand's content
        setBrandDetail(null)
        setBrandSettings(null)
        setBrandAgents([])
        setBrandMembers([])
        setBrandMembersVisible(false)
        setDismissedIds(new Set())
        setAutoPilot(false)
        // Load new brand data
        loadDetail(activeBrand.id)
        loadSettings(activeBrand.id)
        loadAgents(activeBrand.id)
        loadBrandMembers(activeBrand.id)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id])

  // Derive data from brandDetail or fall back to empty
  const apiActionItems: DashboardActionItem[] = brandDetail?.actionItems ?? []
  const apiAccounts: DashboardAccount[] = brandDetail?.accounts ?? []
  const apiAutoPilot: boolean = brandDetail?.autoPilot ?? false
  const recentDrafts: unknown[] = brandDetail?.recentDrafts ?? []
  void recentDrafts
  const pendingReviewCount: number = brandDetail?._count?.contents ?? 0
  const postfastSync: { ok: boolean; error?: string } | undefined = brandDetail?.postfastSync

  const searchParams = useSearchParams()
  const router = useRouter()
  void router

  useEffect(() => {
    if (searchParams && searchParams.get('google_success') === 'true') {
      void (async () => {
        setShowSettings(true)
        const newUrl = window.location.pathname
        window.history.replaceState({}, '', newUrl)
      })()
    }
  }, [searchParams])

  // Sync autoPilot from DB
  useEffect(() => { queueMicrotask(() => setAutoPilot(apiAutoPilot)) }, [apiAutoPilot])

  // Visible action items = pending and not locally dismissed
  const pendingItems = apiActionItems.filter(i => !dismissedIds.has(i.id))

  // Convert API accounts → ConnectedAccount shape, dedup google by platformId
  const seenPlatforms = new Set<string>()
  const connectedAccounts: ConnectedAccount[] = apiAccounts
    .sort((a, b) => {
      // For google: prefer the one with ratingScore to surface first
      if (a.platformId === 'google' && b.platformId === 'google') {
        return (b.ratingScore ?? 0) - (a.ratingScore ?? 0)
      }
      return 0
    })
    .filter((a) => {
      const pid = normalizeDashboardPlatformId(a.platformId)
      // For google, only show the first (highest-rated) entry
      if (pid === 'google') {
        if (seenPlatforms.has('google')) return false
        seenPlatforms.add('google')
      }
      return true
    })
    .map((a) => ({
      uid: a.id,
      platformId: normalizeDashboardPlatformId(a.platformId),
      handle: a.handle,
      profileUrl: a.profileUrl ?? undefined,
      value: a.ratingScore ? `${a.ratingScore}★` : fmtFollower(a.followerCount),
      delta: a.followerDelta != null
        ? `${a.followerDelta >= 0 ? '+' : ''}${a.followerDelta}`
        : '—',
      deltaPositive: (a.followerDelta ?? 0) >= 0 && !(a.ratingScore && (a.followerDelta ?? 0) < 0),
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

  const saveBrandMember = async () => {
    if (!activeBrand?.id) return
    if (!newMemberEmail.trim()) {
      alert('请输入成员邮箱')
      return
    }
    setMemberSaving(true)
    try {
      const res = await fetch(`/api/brands/${activeBrand.id}/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newMemberEmail.trim(), role: newMemberRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '添加品牌成员失败')
        return
      }
      setNewMemberEmail('')
      setNewMemberRole('collaborator')
      await loadBrandMembers(activeBrand.id)
    } finally {
      setMemberSaving(false)
    }
  }

  const updateBrandMemberRole = async (member: BrandMemberRecord, nextRole: 'owner' | 'collaborator') => {
    if (!activeBrand?.id) return
    const res = await fetch(`/api/brands/${activeBrand.id}/owners/${member.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.error || '更新成员角色失败')
      return
    }
    await loadBrandMembers(activeBrand.id)
  }

  const removeBrandMember = async (member: BrandMemberRecord) => {
    if (!activeBrand?.id) return
    if (!confirm(`确认移除 ${member.user.email} 吗？`)) return
    const res = await fetch(`/api/brands/${activeBrand.id}/owners/${member.userId}`, {
      method: 'DELETE',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(data.error || '移除成员失败')
      return
    }
    await loadBrandMembers(activeBrand.id)
  }

  const archiveBrand = async () => {
    if (!activeBrand?.id) return
    if (!confirm(`确认归档品牌「${activeBrand.name}」？归档后将从活跃品牌列表隐藏。`)) return
    setArchivingBrand(true)
    try {
      const res = await fetch(`/api/brands/${activeBrand.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || '归档品牌失败')
        return
      }
      window.location.href = '/board'
    } finally {
      setArchivingBrand(false)
    }
  }


  // ── Add account ───────────────────────────────────────────────────────────
  const onAccountAdded = () => { if (activeBrand?.id) loadDetail(activeBrand.id) }



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
            <button
              onClick={() => setShowKnowledge(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10"
              title="品牌知识库"
            >
              <FileText className="w-3 h-3" />
              知识库
            </button>
          </div>
        </div>

        {/* Brand profile body */}
        <div className="px-6 py-5">
          {postfastSync && !postfastSync.ok && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>PostFast 账号同步失败，可能导致 Google Business 未显示。请在集成配置中更新 PostFast API Key 后重试。</span>
            </div>
          )}

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
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">添加品牌介绍</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">品牌故事、特色、定位等信息</p>
              </div>
            </button>
          )}

          <div className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">品牌成员</p>
                {brandMembersLoading && <span className="text-xs text-slate-400">加载中...</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadBrandMembers(activeBrand.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <RefreshCw className="w-3 h-3" /> 刷新
                </button>
                <button
                  onClick={archiveBrand}
                  disabled={archivingBrand}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50"
                >
                  <Archive className="w-3 h-3" /> {archivingBrand ? '归档中...' : '归档品牌'}
                </button>
              </div>
            </div>

            {brandMembersVisible ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="md:col-span-2">
                    <input
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      placeholder="输入成员邮箱，例如 teammate@example.com"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value as 'owner' | 'collaborator')}
                      className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                    >
                      <option value="collaborator">collaborator</option>
                      <option value="owner">owner</option>
                    </select>
                    <button
                      onClick={saveBrandMember}
                      disabled={memberSaving}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {brandMembers.length > 0 ? brandMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{member.user.email}</p>
                          {member.role === 'owner' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-400">
                              <Shield className="w-3 h-3" /> owner
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
                              collaborator
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{member.user.nickname || member.user.id}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={member.role}
                          onChange={(e) => updateBrandMemberRole(member, e.target.value as 'owner' | 'collaborator')}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
                        >
                          <option value="owner">owner</option>
                          <option value="collaborator">collaborator</option>
                        </select>
                        <button
                          onClick={() => removeBrandMember(member)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                          <UserMinus className="w-3.5 h-3.5" /> 移除
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-400 text-center">
                      暂无品牌成员
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">当前账号没有品牌成员管理权限，或品牌成员信息暂不可用。</p>
            )}
          </div>

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
              {brandAgents.map((ba) => {
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
                platform={item.type ?? 'unknown'}
                title={item.title ?? 'Untitled action'}
                description={item.description ?? ''}
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

      {/* ROI / Conversion tracking removed as requested */}



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
          initialSettings={brandSettings ?? undefined}
        />
      )}

      {/* ── Brand Knowledge Modal (品牌知识库) ─────────────────────────── */}
      {activeBrand?.id && (
        <BrandKnowledgePanel
          brandId={activeBrand.id}
          open={showKnowledge}
          onClose={() => setShowKnowledge(false)}
          initialSettings={brandSettings ?? undefined}
        />
      )}

    </div>
  )
}
