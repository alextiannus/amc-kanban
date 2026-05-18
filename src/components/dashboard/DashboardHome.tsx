'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Check, X, TrendingUp, TrendingDown, AlertCircle, Star, MessageSquare,
  Calendar, ChevronRight, Zap, Shield, BarChart2, ChevronDown, Store
} from 'lucide-react'
import { BrandSettingsPanel } from './BrandSettingsPanel'

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
  const inner = (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group cursor-pointer flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-50 dark:bg-slate-800 flex-shrink-0 group-hover:scale-110 transition-transform overflow-hidden border border-slate-100 dark:border-slate-700">
          <PlatformLogo icon={platform.icon} name={platform.name} size={16} />
        </div>
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate leading-tight">{account.handle || platform.name}</p>
      </div>
      <p className="text-xl font-black text-slate-900 dark:text-slate-100 leading-none">{account.value}</p>
      <div className={`flex items-center gap-0.5 text-[10px] font-bold ${account.deltaPositive ? 'text-emerald-500' : 'text-red-500'}`}>
        {account.deltaPositive ? <TrendingUp className="w-3 h-3 flex-shrink-0" /> : <TrendingDown className="w-3 h-3 flex-shrink-0" />}
        <span>{account.delta}</span>
        <span className="text-slate-400 font-medium ml-1">{platform.metric}</span>
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
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 flex items-start gap-3 hover:shadow-md transition-shadow group cursor-pointer">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex-shrink-0 group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 leading-snug">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {meta && (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
          )}
          <span className="text-[10px] text-slate-400 font-medium">{time}</span>
        </div>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={(e) => { e.stopPropagation(); onAction() }}
          className="flex-shrink-0 text-[11px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl transition-colors self-center shadow-sm shadow-emerald-500/20"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// ── Conversion Card ─────────────────────────────────────────────────────────
function ConversionCard({ label, value, sub, progress, color }: { label: string, value: string, sub: string, progress: number, color: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      <div className="mt-3 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${progress}%` }} />
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

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (brands.length <= 1) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-all"
      >
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        切换
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden min-w-[180px]">
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => { onChange(b); setOpen(false) }}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                activeBrand.id === b.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              <Store size={13} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{b.name}</p>
                {b.location && <p className="text-[10px] text-slate-400">{b.location}</p>}
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

export default function DashboardHome({ brand: propBrand }: DashboardHomeProps) {
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
        if (!activeBrand && mapped.length > 0) setActiveBrand(mapped[0])
      })
      .catch(console.error)
      .finally(() => setBrandLoading(false))
  }, [])

  useEffect(() => { if (propBrand) setActiveBrand(propBrand) }, [propBrand?.id])

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
      loadDetail(activeBrand.id)
      loadSettings(activeBrand.id)
      loadAgents(activeBrand.id)
    }
  }, [activeBrand?.id, loadDetail, loadSettings, loadAgents])

  // Derive data from brandDetail or fall back to empty
  const apiActionItems: any[] = brandDetail?.actionItems ?? []
  const apiAccounts: any[] = brandDetail?.accounts ?? []
  const apiAutoPilot: boolean = brandDetail?.autoPilot ?? false
  const weekConversions: any[] = brandDetail?.weekConversions ?? []

  // ── Local UI state ───────────────────────────────────────────────────────
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [autoPilot, setAutoPilot] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)

  // Sync autoPilot from DB
  useEffect(() => { setAutoPilot(apiAutoPilot) }, [apiAutoPilot])

  // Visible action items = pending and not locally dismissed
  const pendingItems = apiActionItems.filter(i => !dismissedIds.has(i.id))

  // Convert API accounts → ConnectedAccount shape
  const connectedAccounts: ConnectedAccount[] = apiAccounts.map(a => ({
    uid: a.id,
    platformId: a.platformId,
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
  // Handled inside AddAccountModal — reload detail on done
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
      <div className="p-8 flex items-center justify-center">
        <div className="text-sm text-slate-400 animate-pulse">加载品牌数据中…</div>
      </div>
    )
  }
  if (!activeBrand) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-4">
        <Store className="w-10 h-10 text-slate-300" />
        <p className="text-sm text-slate-500">暂无品牌，请先创建品牌</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-36 space-y-8">

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex-1">
            {/* Brand name + location + switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">{activeBrand.name}</h2>
              {activeBrand.location && (
                <span className="text-sm font-medium text-slate-400">· {activeBrand.location}</span>
              )}
              <BrandSwitcher brands={brandList} activeBrand={activeBrand} onChange={setActiveBrand} />
            </div>
            {brandDetail?.description
              ? <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{brandDetail.description}</p>
              : <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">AI 员工实时运营状态总览</p>
            }

            {/* Agent avatars row */}
            {brandAgents.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">协作 Agent</span>
                {brandAgents.map(ba => (
                  <div
                    key={ba.id}
                    title={ba.agent?.nickname || ba.agent?.email}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 ring-2 ring-white dark:ring-slate-900 overflow-hidden"
                    style={{ background: ba.agent?.themeColor || '#6366f1' }}
                  >
                    {ba.agent?.avatar
                      ? <img src={ba.agent.avatar} alt="" className="w-full h-full object-cover" />
                      : (ba.agent?.nickname || ba.agent?.email || '?').charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            )}

            {/* Brand settings panel — collapsible, embedded in brand card */}
            {activeBrand.id && (
              <BrandSettingsPanel
                brandId={activeBrand.id}
                initialSettings={brandSettings}
              />
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
            <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 px-3 py-1.5 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">AI 在线</span>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 px-3 py-1.5 rounded-xl">
              <Zap className="w-3 h-3 text-blue-500" />
              <span className="text-xs font-bold text-blue-700 dark:text-blue-400">今日 3 条待发</span>
            </div>
            {pendingItems.some(i => i.priority === 'urgent' || i.type === 'sentiment_alert') && (
              <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 px-3 py-1.5 rounded-xl">
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-xs font-bold text-red-700 dark:text-red-400">
                  {pendingItems.filter(i => i.priority === 'urgent' || i.type === 'sentiment_alert').length} 条差评待处理
                </span>
              </div>
            )}
            {/* Autopilot toggle */}
            <button
              onClick={toggleAutoPilot}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                autoPilot
                  ? 'bg-indigo-500 border-indigo-400 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-600'
              }`}
            >
              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all ${autoPilot ? 'bg-white border-white/50' : 'border-slate-300 dark:border-slate-600'}`} />
              {autoPilot ? '自动驾驶已开启' : '开启自动驾驶'}
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart2 className="w-4 h-4" /> 账号资产监控
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

      {/* ── AI 今日战报 (豆腐块) ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" /> AI 今日战报
          </h3>
          <button className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1">
            查看全部 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActivityCard
            icon={<Check className="w-4 h-4 text-emerald-500" />}
            label="已发布 (IG): 午市套餐优惠"
            sub="Instagram · 图文帖"
            time="今天 10:00"
            status="done"
          />
          <ActivityCard
            icon={<Check className="w-4 h-4 text-emerald-500" />}
            label="已发布 (小红书): 午市套餐优惠"
            sub="小红书 · 笔记"
            time="今天 10:15"
            status="done"
          />
          <ActivityCard
            icon={<Calendar className="w-4 h-4 text-indigo-500" />}
            label="计划中 (TikTok): 周末海鲜特价"
            sub="TikTok · 短视频 · 明晚 6PM"
            time="明晚排期"
            status="scheduled"
          />
          <ActivityCard
            icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
            label="待审核 (IG): 母亲节预热海报"
            sub="Instagram · 图文帖"
            time="刚刚"
            status="pending"
            actionLabel="立即审核"
            onAction={() => {}}
          />
          <ActivityCard
            icon={<MessageSquare className="w-4 h-4 text-blue-500" />}
            label="已自动回复私信 3 条"
            sub="关于营业时间与订位询问"
            time="今日"
          />
          <ActivityCard
            icon={<Star className="w-4 h-4 text-amber-500" />}
            label="监控到差评，等待您处理"
            sub="Google Maps · 2 星评价"
            time="14:32"
            status="pending"
            actionLabel="查看回复"
            onAction={() => {}}
          />
        </div>
      </section>

      {/* ── ROI / Conversion tracking ───────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> 本周转化跟踪
          </h3>
          <span className="text-[10px] font-bold text-slate-400">by AI Agent</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ConversionCard
            label="导航点击"
            value={String(navClicks)}
            sub="来自 IG / TikTok 帖子"
            progress={Math.round((navClicks / maxConv) * 100)}
            color="bg-pink-400"
          />
          <ConversionCard
            label="预订链接点击"
            value={String(bookingClicks)}
            sub="来自小红书、Google"
            progress={Math.round((bookingClicks / maxConv) * 100)}
            color="bg-emerald-400"
          />
          <ConversionCard
            label="折扣码核销"
            value={String(couponRedemptions)}
            sub="整体折扣码使用"
            progress={Math.round((couponRedemptions / maxConv) * 100)}
            color="bg-indigo-400"
          />
        </div>
      </section>

      {/* ── Add Account Modal ──────────────────────────────────────────── */}
      {showAddAccount && activeBrand?.id && (
        <AddAccountModal
          brandId={activeBrand.id}
          onDone={onAccountAdded}
          onClose={() => setShowAddAccount(false)}
        />
      )}

    </div>
  )
}
