'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { 
  TrendingUp, Download, ChevronDown, Heart, Eye, Users, 
  BarChart2, MessageCircle, Activity, FileText, X, ShieldAlert,
  ArrowUpRight, DollarSign, Percent, Star, MessageSquare, ExternalLink, RefreshCw
} from 'lucide-react'

// ── Colour palette for platforms ────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F',
  tiktok: '#010101',
  xiaohongshu: '#FF2442',
  facebook: '#1877F2',
  youtube: '#FF0000',
  google: '#4285F4',
  twitter: '#1DA1F2',
  x: '#000000',
  linkedin: '#0A66C2',
  unknown: '#6366f1',
}

const CONTENT_TYPE_COLORS: Record<string, string> = {
  SHORT: '#ef4444',
  VIDEO: '#f97316',
  IMAGE: '#3b82f6',
  LONG: '#8b5cf6',
  STORY: '#ec4899',
}

// ── Number and Date formatting ──────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ── KPI Metric Card ──────────────────────────────────────────────────────────
function MetricCard({ label, value, delta, icon, highlight = false, onClick, active = false, accentColor }: {
  label: string; value: string; delta: string; icon?: React.ReactNode; highlight?: boolean; onClick?: () => void; active?: boolean; accentColor?: string
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-5 border transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : ''
      } ${
        active
          ? 'ring-2 shadow-lg'
          : highlight
            ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10 shadow-md shadow-amber-100 dark:shadow-amber-900/20'
            : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md'
      }`}
      style={active && accentColor ? {
        borderColor: accentColor,
        backgroundColor: `${accentColor}10`,
        boxShadow: `0 10px 15px -3px ${accentColor}25, 0 0 0 2px ${accentColor}60`,
      } : {}}
    >
      <div className="flex justify-between items-start mb-2">
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</p>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <p className={`text-3xl font-black leading-none mb-1.5 ${
        active && accentColor ? '' : highlight ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
      }`} style={active && accentColor ? { color: accentColor } : {}}>{value}</p>
      <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
        <TrendingUp className="w-3 h-3" />
        <span>{delta}</span>
      </div>
    </div>
  )
}

// ── SVG Area Chart for time-series metrics ──────────────────────────────────
type MetricKey = 'engagement' | 'impressions' | 'reach' | 'likes' | 'engRate' | 'postCount'
const METRIC_OPTIONS: { key: MetricKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'engagement', label: '互动数', icon: <Activity className="w-3.5 h-3.5" />, color: '#c084fc' },
  { key: 'impressions', label: '曝光量', icon: <Eye className="w-3.5 h-3.5" />, color: '#60a5fa' },
  { key: 'reach', label: '触达人数', icon: <Users className="w-3.5 h-3.5" />, color: '#34d399' },
  { key: 'likes', label: '点赞数', icon: <Heart className="w-3.5 h-3.5" />, color: '#f472b6' },
  { key: 'engRate', label: '互动率', icon: <BarChart2 className="w-3.5 h-3.5" />, color: '#f59e0b' },
  { key: 'postCount', label: '发帖数', icon: <FileText className="w-3.5 h-3.5" />, color: '#06b6d4' },
]

function AreaChart({ series, activeMetric }: {
  series: any[]
  activeMetric: MetricKey
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null)
  const W = 900; const H = 220; const PAD = { t: 25, r: 20, b: 35, l: 50 }
  const metricColor = METRIC_OPTIONS.find(m => m.key === activeMetric)?.color ?? '#c084fc'

  if (!series || series.length === 0) return (
    <div className="h-48 flex items-center justify-center text-slate-300 dark:text-slate-700 text-sm">暂无趋势数据</div>
  )

  const vals = series.map(d => d[activeMetric] as number)
  const maxV = Math.max(...vals, 1)
  const xStep = (W - PAD.l - PAD.r) / (series.length - 1 || 1)

  const toX = (i: number) => PAD.l + i * xStep
  const toY = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / maxV)

  const points = series.map((d, i) => ({ x: toX(i), y: toY(d[activeMetric] as number), d }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${H - PAD.b} L${points[0].x},${H - PAD.b} Z`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: PAD.t + (H - PAD.t - PAD.b) * (1 - r), v: maxV * r }))
  const xTickStep = Math.max(1, Math.floor(series.length / 6))
  const xTicks = series.filter((_, i) => i % xTickStep === 0 || i === series.length - 1)

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-56"
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => {
          const rect = svgRef.current?.getBoundingClientRect()
          if (!rect) return
          const svgX = ((e.clientX - rect.left) / rect.width) * W
          let closest = points[0]; let minD = Infinity
          for (const p of points) { const d = Math.abs(p.x - svgX); if (d < minD) { minD = d; closest = p } }
          setTooltip({
            x: (closest.x / W) * 100,
            y: (closest.y / H) * 100,
            label: fmtDate(closest.d.date),
            value: activeMetric === 'engRate' ? `${(closest.d[activeMetric] as number).toFixed(2)}%` : fmtNum(closest.d[activeMetric] as number),
          })
        }}
      >
        <defs>
          <linearGradient id="metricAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={metricColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={metricColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4,4" className="dark:stroke-slate-800" />
            <text x={PAD.l - 8} y={t.y + 3} textAnchor="end" fontSize="9" fontWeight="bold" fill="#94a3b8">{activeMetric === 'engRate' ? `${t.v.toFixed(1)}%` : fmtNum(Math.round(t.v))}</text>
          </g>
        ))}
        {xTicks.map((d, i) => {
          const idx = series.indexOf(d)
          return <text key={i} x={toX(idx)} y={H - PAD.b + 18} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#94a3b8">{fmtDate(d.date)}</text>
        })}
        <path d={areaPath} fill="url(#metricAreaGrad)" />
        <path d={linePath} fill="none" stroke={metricColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y}
            r={3}
            fill={metricColor}
            stroke="white" strokeWidth="1.5"
            className="hover:r-5 transition-all cursor-pointer dark:stroke-slate-900"
          />
        ))}
      </svg>
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-slate-950/90 dark:bg-slate-800/90 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap border border-slate-700/30 backdrop-blur-sm"
          style={{ left: `${tooltip.x}%`, top: `${tooltip.y}%`, transform: 'translate(-50%, -130%)' }}
        >
          <p className="text-slate-400 font-normal">{tooltip.label}</p>
          <span className="text-sm font-black">{tooltip.value}</span>
        </div>
      )}
    </div>
  )
}

// ── SVG Conversions Chart for ROI tab ────────────────────────────────────────
function ConversionsChart({ series }: { series: any[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; nav: number; booking: number; coupon: number } | null>(null)
  const W = 900; const H = 220; const PAD = { t: 25, r: 20, b: 35, l: 50 }

  if (!series || series.length === 0) return (
    <div className="h-48 flex items-center justify-center text-slate-300 dark:text-slate-700 text-sm">暂无趋势数据</div>
  )

  const maxVal = Math.max(...series.map(d => d.total), 1)
  const xStep = (W - PAD.l - PAD.r) / (series.length - 1 || 1)

  const toX = (i: number) => PAD.l + i * xStep
  const toY = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / maxVal)

  // 3 lines: nav_click (blue #3b82f6), booking_click (green #10b981), coupon_redemption (pink #ec4899)
  const navPoints = series.map((d, i) => ({ x: toX(i), y: toY(d.nav_click) }))
  const bookingPoints = series.map((d, i) => ({ x: toX(i), y: toY(d.booking_click) }))
  const couponPoints = series.map((d, i) => ({ x: toX(i), y: toY(d.coupon_redemption) }))

  const navPath = navPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const bookingPath = bookingPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const couponPath = couponPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: PAD.t + (H - PAD.t - PAD.b) * (1 - r), v: maxVal * r }))
  const xTickStep = Math.max(1, Math.floor(series.length / 6))
  const xTicks = series.filter((_, i) => i % xTickStep === 0 || i === series.length - 1)

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-56"
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => {
          const rect = svgRef.current?.getBoundingClientRect()
          if (!rect) return
          const svgX = ((e.clientX - rect.left) / rect.width) * W
          let idx = 0; let minD = Infinity
          series.forEach((d, i) => {
            const x = toX(i)
            const dist = Math.abs(x - svgX)
            if (dist < minD) { minD = dist; idx = i }
          })
          const activeItem = series[idx]
          setTooltip({
            x: (toX(idx) / W) * 100,
            y: (toY(activeItem.total) / H) * 100,
            label: fmtDate(activeItem.date),
            nav: activeItem.nav_click,
            booking: activeItem.booking_click,
            coupon: activeItem.coupon_redemption,
          })
        }}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4,4" className="dark:stroke-slate-800" />
            <text x={PAD.l - 8} y={t.y + 3} textAnchor="end" fontSize="9" fontWeight="bold" fill="#94a3b8">{fmtNum(Math.round(t.v))}</text>
          </g>
        ))}
        {xTicks.map((d, i) => {
          const idx = series.indexOf(d)
          return <text key={i} x={toX(idx)} y={H - PAD.b + 18} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#94a3b8">{fmtDate(d.date)}</text>
        })}

        {/* Lines */}
        <path d={navPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
        <path d={bookingPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
        <path d={couponPath} fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" />
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none bg-slate-950/90 dark:bg-slate-800/90 text-white text-[11px] font-bold px-3 py-2 rounded-xl shadow-xl whitespace-nowrap border border-slate-700/30 backdrop-blur-sm space-y-1"
          style={{ left: `${tooltip.x}%`, top: `${tooltip.y}%`, transform: 'translate(-50%, -120%)' }}
        >
          <p className="text-slate-400 font-normal border-b border-slate-700/30 pb-1 mb-1">{tooltip.label}</p>
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /><span>导航点击: {tooltip.nav}</span></div>
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span>预订点击: {tooltip.booking}</span></div>
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-pink-500" /><span>优惠券核销: {tooltip.coupon}</span></div>
        </div>
      )}
    </div>
  )
}

// ── Top Post Row ─────────────────────────────────────────────────────────────
function TopPostRow({ post, rank, onClick }: { post: any; rank: number; onClick?: () => void }) {
  const platformColor = PLATFORM_COLORS[post.platform?.toLowerCase()] ?? '#6366f1'
  const interactions = post.likes + post.comments + post.shares
  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 py-3 border-b border-slate-50 dark:border-slate-800/80 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-5 px-5 rounded-xl transition-all group"
    >
      <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0 mt-0.5">{rank}</span>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${platformColor}18` }}>
        <img src={`https://cdn.simpleicons.org/${post.platform === 'unknown' ? 'github' : post.platform}/${platformColor.replace('#', '')}`}
          alt={post.platform} className="w-3.5 h-3.5 object-contain" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{post.handle || post.platform}</span>
          <span className="text-[10px] text-slate-400">{fmtDate(post.publishedAt)}</span>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{post.contentType}</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{post.caption || '（无内容）'}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comments}</span>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmtNum(post.impressions)}</span>
          <span className="font-bold text-slate-500">{interactions} 次互动</span>
          <span className="ml-auto text-[10px] text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors">查看详情 →</span>
        </div>
      </div>
    </div>
  )
}

// ── Standalone SocialInsightDashboard ────────────────────────────────────────
interface SocialInsightDashboardProps { brandId: string; brandName?: string }

export default function SocialInsightDashboard({ brandId, brandName }: SocialInsightDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'channels' | 'sentiment' | 'roi' | 'competitors'>('overview')
  const [activeMetric, setActiveMetric] = useState<MetricKey>('postCount')
  const [days, setDays] = useState(30)
  const [showPresets, setShowPresets] = useState(false)
  const [selectedPost, setSelectedPost] = useState<any | null>(null)
  const [reviewFilter, setReviewFilter] = useState<string | null>(null)

  // ROI Calculator inputs
  const [averageCheck, setAverageCheck] = useState<number>(35)
  const [marketingCostPerPost, setMarketingCostPerPost] = useState<number>(10)

  const presetRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (d: number) => {
    setLoading(true); setError(null)
    try {
      const to = new Date()
      const from = new Date(to.getTime() - (d - 1) * 24 * 60 * 60 * 1000)
      const res = await fetch(`/api/brands/${brandId}/social-insight?from=${from.toISOString()}&to=${to.toISOString()}`)
      if (!res.ok) throw new Error('拉取三方分析数据失败')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [brandId])

  useEffect(() => { load(days) }, [load, days])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) setShowPresets(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const kpis = data?.kpis ?? {}
  const timeSeries = data?.timeSeries ?? []
  const topPosts = data?.topPosts ?? []
  const contentTypeBreakdown = data?.contentTypeBreakdown ?? []
  const accounts = data?.accounts ?? []
  const conversions = data?.conversions ?? { total: 0, nav_click: 0, booking_click: 0, coupon_redemption: 0, timeSeries: [] }
  const sentiment = data?.sentiment ?? { averageRating: 4.8, positivePct: 80, neutralPct: 12, negativePct: 8, keywords: [], reviews: [] }
  const competitors = data?.competitors ?? []

  // Dynamic calculations for ROI
  const totalConversions = conversions.total
  const estimatedRevenue = totalConversions * averageCheck
  const totalPosts = kpis.totalPosts ?? 0
  const estimatedCost = totalPosts * marketingCostPerPost
  const netProfit = estimatedRevenue - estimatedCost
  const roiRatio = estimatedCost > 0 ? (estimatedRevenue / estimatedCost).toFixed(1) : '0'

  // Filter reviews by selected keyword sentiment/type
  const filteredReviews = sentiment.reviews.filter((r: any) => {
    if (!reviewFilter) return true
    if (reviewFilter === 'positive') return r.rating >= 4
    if (reviewFilter === 'negative') return r.rating <= 2
    if (reviewFilter === 'neutral') return r.rating === 3
    return (r.text || '').toLowerCase().includes(reviewFilter.toLowerCase())
  })

  return (
    <div className="p-4 md:p-8 pb-44 space-y-6 min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      
      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-500 animate-pulse" />
            三方社媒运营透视
          </h2>
          {brandName && <p className="text-xs text-slate-400 mt-1">品牌托管服务: {brandName}</p>}
        </div>

        <div className="flex items-center gap-2">
          {/* Preset Selector */}
          <div ref={presetRef} className="relative">
            <button
              onClick={() => setShowPresets(p => !p)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-350 hover:border-emerald-500 dark:hover:border-emerald-600 transition-all shadow-sm"
              id="insight-presets"
            >
              <span>近 {days} 天分析</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
            </button>
            {showPresets && (
              <div className="absolute right-0 mt-1.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-xl z-50 min-w-[130px] overflow-hidden animate-in fade-in slide-in-from-top-1">
                {[
                  { label: '近 7 天', days: 7 },
                  { label: '近 30 天', days: 30 },
                  { label: '近 60 天', days: 60 },
                  { label: '近 90 天', days: 90 },
                ].map(p => (
                  <button
                    key={p.days}
                    onClick={() => { setDays(p.days); setShowPresets(false) }}
                    className={`w-full text-left px-4 py-3 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors ${days === p.days ? 'text-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => load(days)}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-650 hover:text-emerald-500 transition-all hover:rotate-180 duration-500 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex bg-slate-100/80 dark:bg-slate-900/85 p-1 rounded-2xl max-w-full overflow-x-auto gap-1 border border-slate-200/20">
        {[
          { id: 'overview', label: '运营概览', icon: <Activity size={14} /> },
          { id: 'channels', label: '渠道表现', icon: <Users size={14} /> },
          { id: 'sentiment', label: '舆情与口碑', icon: <Star size={14} /> },
          { id: 'roi', label: '到店转化与ROI', icon: <DollarSign size={14} /> },
          { id: 'competitors', label: '竞品对标', icon: <BarChart2 size={14} /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black rounded-xl transition-all duration-300 whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-white dark:bg-slate-850 text-emerald-600 dark:text-emerald-400 shadow-md ring-1 ring-slate-100/50 dark:ring-slate-800/50'
                : 'text-slate-550 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350 hover:bg-white/40 dark:hover:bg-slate-800/30'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-slate-200 border-t-emerald-500 animate-spin" />
          <p className="text-xs text-slate-400 font-bold">获取三方分析数据中...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-150 dark:border-red-900/30 p-6 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
          <div className="text-sm text-red-600 dark:text-red-400 font-medium">数据读取出现问题: {error}</div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300">

          {/* ── TAB: OVERVIEW ────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: '总内容发布', value: String(kpis.totalPosts ?? 0), delta: `共 ${kpis.totalPosts ?? 0} 篇`, key: 'postCount' as MetricKey },
                  { label: '总互动数', value: fmtNum(kpis.totalEngagement ?? 0), delta: '+15.2%', key: 'engagement' as MetricKey },
                  { label: '曝光总量', value: fmtNum(kpis.totalImpressions ?? 0), delta: '+22.4%', key: 'impressions' as MetricKey },
                  { label: '平均触达', value: fmtNum(kpis.avgReach ?? 0), delta: '+8.7%', key: 'reach' as MetricKey },
                  { label: '获得点赞', value: fmtNum(kpis.totalLikes ?? 0), delta: '+12.9%', key: 'likes' as MetricKey },
                  { label: '平均互动率', value: `${kpis.avgEngRate ?? 0}%`, delta: '+1.5%', key: 'engRate' as MetricKey, highlight: true },
                ].map(c => (
                  <MetricCard
                    key={c.key}
                    label={c.label}
                    value={c.value}
                    delta={c.delta}
                    highlight={c.highlight}
                    active={activeMetric === c.key}
                    accentColor={METRIC_OPTIONS.find(o => o.key === c.key)?.color}
                    onClick={() => setActiveMetric(c.key)}
                  />
                ))}
              </div>

              {/* Area Chart block */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">运营趋势变化</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      正在查看: <span className="font-bold" style={{ color: METRIC_OPTIONS.find(o => o.key === activeMetric)?.color }}>
                        {METRIC_OPTIONS.find(o => o.key === activeMetric)?.label}
                      </span> · 点击上方指标卡可快速切换
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {METRIC_OPTIONS.map(m => (
                      <button
                        key={m.key}
                        onClick={() => setActiveMetric(m.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
                          activeMetric === m.key
                            ? 'shadow-sm border-current'
                            : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 hover:bg-slate-100/50 dark:hover:bg-slate-800/40'
                        }`}
                        style={activeMetric === m.key ? { color: m.color, borderColor: m.color, backgroundColor: `${m.color}15` } : {}}
                      >
                        {m.icon}
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <AreaChart series={timeSeries} activeMetric={activeMetric} />
              </div>

              {/* Bottom List and Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Top Posts */}
                <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">互动最佳帖</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">该分析区间内表现最好的前 10 篇发帖</p>
                  </div>
                  <div className="divide-y divide-slate-50 dark:divide-slate-800/40 max-h-[460px] overflow-y-auto pr-1">
                    {topPosts.length === 0 ? (
                      <div className="py-20 text-center text-xs text-slate-400">暂无内容发布数据</div>
                    ) : topPosts.map((post: any, i: number) => (
                      <TopPostRow key={post.id} post={post} rank={i + 1} onClick={() => setSelectedPost(post)} />
                    ))}
                  </div>
                </div>

                {/* Content Type Breakdown */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">内容类型分布</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">按图片、视频、长文等类型的分析汇总</p>
                  </div>
                  <div className="space-y-4">
                    {contentTypeBreakdown.map((ct: any) => (
                      <div key={ct.type} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-650 dark:text-slate-350">{ct.type === 'IMAGE' ? '🖼️ 图片' : ct.type === 'VIDEO' ? '🎥 视频' : ct.type === 'SHORT' ? '📱 短视频' : '📝 长图文'}</span>
                          <span className="text-slate-400 font-medium">{ct.count} 篇 · 平均互动率 {ct.avgEngRate}%</span>
                        </div>
                        <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-700" 
                            style={{ 
                              width: `${(ct.count / Math.max(...contentTypeBreakdown.map((t: any) => t.count), 1)) * 100}%`,
                              backgroundColor: CONTENT_TYPE_COLORS[ct.type] ?? '#6366f1' 
                            }} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {!data?.hasPostfastData && (
                    <div className="mt-8 text-[11px] text-amber-600 dark:text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        当前仅展示 Kanban 系统内的本地发布记录和仿真分析数据。如果您希望拉取真实的 IG、小红书和 TikTok 托管平台数据，请前往<b>品牌配置</b>绑定 PostFast API Key。
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── TAB: CHANNELS ────────────────────────────────────────────────── */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              {/* Account Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {accounts.map((acc: any) => {
                  const platColor = PLATFORM_COLORS[acc.platformId.toLowerCase()] ?? '#6366f1'
                  return (
                    <div key={acc.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow relative overflow-hidden group">
                      <div className="absolute right-0 top-0 w-24 h-24 rounded-full filter blur-3xl opacity-10 group-hover:scale-150 transition-transform duration-500" style={{ backgroundColor: platColor }} />
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${platColor}18` }}>
                            <img src={`https://cdn.simpleicons.org/${acc.platformId === 'unknown' ? 'github' : acc.platformId}/${platColor.replace('#', '')}`}
                              alt={acc.platformId} className="w-5 h-5 object-contain" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 capitalize">{acc.platformId}</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">{acc.handle}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-wider uppercase ${acc.autoPilot ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                          {acc.autoPilot ? '自动驾驶' : '人工确认'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50 dark:border-slate-800/60">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">粉丝总量</p>
                          <p className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1">{acc.followerCount ? fmtNum(acc.followerCount) : '无'}</p>
                        </div>
                        {acc.followerDelta !== undefined && (
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">本周新增</p>
                            <p className="text-lg font-black text-emerald-500 mt-1">+{acc.followerDelta}</p>
                          </div>
                        )}
                        {acc.ratingScore !== null && acc.ratingScore !== undefined && (
                          <div className="col-span-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">星级评分</p>
                            <p className="text-lg font-black text-amber-500 mt-1 flex items-center gap-1">
                              {acc.ratingScore.toFixed(1)} <Star className="w-4 h-4 fill-current" />
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Cross-Platform Comparison Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">渠道效果明细</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">不同社交网络产生的具体流量、效果和转化对比</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">渠道平台</th>
                        <th className="py-3 px-4">账号</th>
                        <th className="py-3 px-4">发帖量</th>
                        <th className="py-3 px-4">粉丝总数</th>
                        <th className="py-3 px-4">互动点赞数</th>
                        <th className="py-3 px-4">粉丝增幅</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-850">
                      {accounts.map((acc: any) => {
                        const platColor = PLATFORM_COLORS[acc.platformId.toLowerCase()] ?? '#6366f1'
                        return (
                          <tr key={acc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                            <td className="py-4 px-4 font-bold flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: platColor }} />
                              <span className="capitalize">{acc.platformId}</span>
                            </td>
                            <td className="py-4 px-4 text-slate-500 font-medium">{acc.handle}</td>
                            <td className="py-4 px-4 font-black">{totalPosts > 0 ? Math.round(totalPosts / accounts.length) : 0} 篇</td>
                            <td className="py-4 px-4 font-black">{acc.followerCount ? fmtNum(acc.followerCount) : '—'}</td>
                            <td className="py-4 px-4 font-bold text-slate-650 dark:text-slate-350">{acc.platformId === 'google' ? '—' : fmtNum(Math.round((kpis.totalEngagement ?? 0) / accounts.length))}</td>
                            <td className="py-4 px-4 text-emerald-500 font-black">+{acc.followerDelta || 0}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: SENTIMENT ───────────────────────────────────────────────── */}
          {activeTab === 'sentiment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Star Rating and Score overview */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-center text-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">平均谷歌评分</h4>
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="72" cy="72" r="60" stroke="#f1f5f9" strokeWidth="12" fill="transparent" className="dark:stroke-slate-800" />
                      <circle cx="72" cy="72" r="60" stroke="#fbbf24" strokeWidth="12" fill="transparent" 
                        strokeDasharray={2 * Math.PI * 60}
                        strokeDashoffset={2 * Math.PI * 60 * (1 - sentiment.averageRating / 5)}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-4xl font-black text-slate-800 dark:text-slate-100">{sentiment.averageRating.toFixed(1)}</span>
                      <div className="flex gap-0.5 text-amber-400 mt-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} className={`w-3.5 h-3.5 ${star <= Math.round(sentiment.averageRating) ? 'fill-current' : ''}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-bold mt-4">满分 5.0 分 · 运营监控基准分 4.5</p>
                </div>

                {/* Sentiment Ratio bars */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">舆情态度占比</h4>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-emerald-500">🟢 好评率</span>
                      <span className="text-slate-500 font-bold">{sentiment.positivePct}%</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${sentiment.positivePct}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400">🟡 中立率</span>
                      <span className="text-slate-500 font-bold">{sentiment.neutralPct}%</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${sentiment.neutralPct}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-red-500">🔴 差评率</span>
                      <span className="text-slate-500 font-bold">{sentiment.negativePct}%</span>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${sentiment.negativePct}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Word cloud & Interactive feedback */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">热点口碑词云</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">AI 分析商户近期评语提炼出的关键词，点击标签可筛选右侧对应评价</p>
                  </div>
                  {reviewFilter && (
                    <button 
                      onClick={() => setReviewFilter(null)}
                      className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> 清除筛选
                    </button>
                  )}
                </div>

                {/* Keyword list */}
                <div className="flex flex-wrap gap-2.5 py-4">
                  {sentiment.keywords.map((kw: any) => {
                    const isActive = reviewFilter === kw.text
                    let kwBg = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350'
                    if (kw.sentiment === 'positive') {
                      kwBg = isActive 
                        ? 'bg-emerald-500 text-white shadow-md' 
                        : 'bg-emerald-500/10 text-emerald-550 dark:text-emerald-400 hover:bg-emerald-500/20'
                    } else if (kw.sentiment === 'negative') {
                      kwBg = isActive 
                        ? 'bg-red-500 text-white shadow-md' 
                        : 'bg-red-500/10 text-red-550 dark:text-red-400 hover:bg-red-500/20'
                    }
                    
                    return (
                      <button
                        key={kw.text}
                        onClick={() => setReviewFilter(prev => prev === kw.text ? null : kw.text)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${kwBg}`}
                        style={{ fontSize: `${11 + (kw.count / 10)}px` }}
                      >
                        {kw.text} ({kw.count})
                      </button>
                    );
                  })}
                </div>

                {/* Filtered reviews list */}
                <div className="flex-1 mt-4 overflow-y-auto max-h-[300px] border-t border-slate-50 dark:border-slate-800/60 pt-4 space-y-3 pr-1">
                  {filteredReviews.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-medium">没有找到包含此标签的评语</div>
                  ) : filteredReviews.map((r: any) => (
                    <div key={r.id} className="bg-slate-50 dark:bg-slate-900/60 border border-slate-100/40 dark:border-slate-850 p-4 rounded-2xl relative">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">{r.reviewerName}</span>
                        <div className="flex gap-0.5 text-amber-400 shrink-0">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} className={`w-2.5 h-2.5 ${s <= r.rating ? 'fill-current' : ''}`} />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed">{r.text}</p>
                      <div className="flex justify-between items-center mt-3 border-t border-slate-100/50 dark:border-slate-800/50 pt-2 text-[9px] font-bold text-slate-400">
                        <span>谷歌商户中心 · {new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
                        <span className={`px-2 py-0.5 rounded ${r.replyStatus === 'replied' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500 animate-pulse'}`}>
                          {r.replyStatus === 'replied' ? 'AI已回复' : '待处理'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: ROI ─────────────────────────────────────────────────────── */}
          {activeTab === 'roi' && (
            <div className="space-y-6">
              {/* Guest check modifier input bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-105 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-black text-slate-850 dark:text-slate-150">到店转化与直接收益评估器</h4>
                  <p className="text-xs text-slate-400 font-medium">调整下方估算数据，系统会自动帮您实时算出发帖引流的 ROI 回报</p>
                </div>
                
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 whitespace-nowrap">预估客单价:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                      <input 
                        type="number" 
                        value={averageCheck} 
                        onChange={e => setAverageCheck(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-24 pl-6 pr-3 py-2 text-xs font-black bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 whitespace-nowrap">单篇发帖成本:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                      <input 
                        type="number" 
                        value={marketingCostPerPost} 
                        onChange={e => setMarketingCostPerPost(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-24 pl-6 pr-3 py-2 text-xs font-black bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversion Statistics KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                  label="总转化事件 (Conversions)" 
                  value={String(totalConversions)} 
                  delta="+18.4% 环比" 
                  icon={<Percent className="w-4 h-4 text-emerald-500" />} 
                />
                <MetricCard 
                  label="地址导航点击 (Nav Clicks)" 
                  value={String(conversions.nav_click)} 
                  delta="+12.5% 环比" 
                  icon={<Users className="w-4 h-4 text-blue-500" />} 
                />
                <MetricCard 
                  label="桌位预订点击 (Booking Clicks)" 
                  value={String(conversions.booking_click)} 
                  delta="+8.4% 环比" 
                  icon={<Activity className="w-4 h-4 text-emerald-500" />} 
                />
                <MetricCard 
                  label="优惠券核销 (Coupons Redeemed)" 
                  value={String(conversions.coupon_redemption)} 
                  delta="+32.0% 环比" 
                  icon={<Heart className="w-4 h-4 text-pink-500" />} 
                />
              </div>

              {/* ROI and Estimated Income summary */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* Visual conversion trend chart */}
                <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">到店转化趋势 (Conversions Trend)</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      <span className="text-blue-500 font-bold">● 导航点击</span> · 
                      <span className="text-emerald-500 font-bold"> ● 预订点击</span> · 
                      <span className="text-pink-500 font-bold"> ● 优惠券核销</span>
                    </p>
                  </div>
                  <ConversionsChart series={conversions.timeSeries} />
                </div>

                {/* ROI Assessment results */}
                <div className="lg:col-span-2 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/25 dark:border-emerald-500/15 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">投资收益预估汇总</h3>
                    
                    <div className="space-y-3 pt-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">总发帖量 (营销投入单数):</span>
                        <span className="font-black text-slate-800 dark:text-slate-200">{totalPosts} 篇</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">总转化客流 (导航/预订/卡券):</span>
                        <span className="font-black text-slate-800 dark:text-slate-200">{totalConversions} 次</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">预估总营销成本 (AI 运行耗能):</span>
                        <span className="font-black text-slate-800 dark:text-slate-200">${estimatedCost}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">直接引流预估营业额:</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 font-black">${estimatedRevenue}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-emerald-550/20 dark:border-emerald-500/20 pt-6 mt-6 space-y-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">营销净收益 (Net Profit)</span>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-105 mt-1">${netProfit}</h2>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">预估投产比 (ROI Ratio)</span>
                        <h2 className="text-2xl font-black text-emerald-550 dark:text-emerald-400 mt-1 flex items-center gap-1">
                          {roiRatio} <Percent className="w-5 h-5 stroke-[3]" />
                        </h2>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: COMPETITORS ─────────────────────────────────────────────── */}
          {activeTab === 'competitors' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left description card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">本地同业竞品分析</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed font-medium">
                    基于您填写的地理位置及品类，AI Agent 收集了同区域三家头部竞品的社交媒体粉丝数和发布频度。
                  </p>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed font-medium">
                    通过与这些同行业对手的对标，能够精准识别自己品牌的劣势以及优化方向。
                  </p>
                </div>
                
                <div className="mt-8 pt-4 border-t border-slate-50 dark:border-slate-800/60 text-[11px] text-slate-400 space-y-2 font-bold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
                    <span>本商户 ({brandName})</span>
                  </div>
                  {competitors.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: i === 0 ? '#60a5fa' : i === 1 ? '#a855f7' : '#ec4899' }} />
                      <span>竞品 {i + 1}: {c.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Follower comparison bar chart */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">Instagram 粉丝量对标 (Followers)</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">比较在 Instagram 平台上的受众基数</p>
                </div>
                
                {/* Custom SVG Bar Chart */}
                <div className="flex-1 flex flex-col justify-center gap-5 py-4">
                  {/* Our Brand bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                      <span>本商户 ({brandName})</span>
                      <span className="font-black text-emerald-500">{(accounts.find(a => a.platformId === 'instagram')?.followerCount) ?? 1240}</span>
                    </div>
                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex">
                      <div className="h-full bg-emerald-500 rounded-lg transition-all duration-700" 
                        style={{ width: `${(((accounts.find(a => a.platformId === 'instagram')?.followerCount) ?? 1240) / Math.max(1, ...competitors.map(c => c.platforms.instagram.followers), (accounts.find(a => a.platformId === 'instagram')?.followerCount) ?? 1240)) * 100}%` }} 
                      />
                    </div>
                  </div>
                  
                  {/* Competitor bars */}
                  {competitors.map((c: any, i: number) => {
                    const colors = ['#60a5fa', '#a855f7', '#ec4899']
                    const folVal = c.platforms.instagram.followers
                    const maxVal = Math.max(1, ...competitors.map(c => c.platforms.instagram.followers), (accounts.find(a => a.platformId === 'instagram')?.followerCount) ?? 1240)
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                          <span>{c.name}</span>
                          <span className="font-black text-slate-800 dark:text-slate-200">{folVal}</span>
                        </div>
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                          <div className="h-full rounded-lg transition-all duration-700" 
                            style={{ 
                              width: `${(folVal / maxVal) * 100}%`,
                              backgroundColor: colors[i] 
                            }} 
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Weekly posting frequency and engagement index */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-150">发帖频率与互动比对</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">比较平均每周的发帖数和受众互动热度</p>
                </div>

                <div className="space-y-4">
                  {/* Our Brand stats */}
                  <div className="flex items-center justify-between text-xs py-2 border-b border-slate-50 dark:border-slate-800/40">
                    <span className="font-bold text-emerald-500 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-emerald-500" />
                      本商户 ({brandName})
                    </span>
                    <span className="font-black">约 3.0 篇/周 · 4.8% 互动率</span>
                  </div>
                  
                  {/* Competitor stats */}
                  {competitors.map((c: any, i: number) => {
                    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500']
                    return (
                      <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-slate-50 dark:border-slate-800/40 last:border-0">
                        <span className="font-bold text-slate-550 dark:text-slate-350 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded ${colors[i]}`} />
                          {c.name}
                        </span>
                        <span className="font-black text-slate-700 dark:text-slate-300">
                          约 {c.avgPostsPerWeek.toFixed(1)} 篇/周 · {c.platforms.instagram.engRate}% 互动率
                        </span>
                      </div>
                    )
                  })}
                </div>

                <p className="text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mt-6">
                  💡 <b>运营改进建议</b>：数据表明竞品 3（{competitors[2]?.name}）的发帖频次（每周 5.0 篇）和互动率（8.2%）最高。建议 AI Agent 增加短视频（Shorts）发布比重以获取更大曝光。
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Post Detail Modal ───────────────────────────────────────── */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-w-lg w-full relative space-y-4">
            <button 
              onClick={() => setSelectedPost(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-650 transition-colors p-1.5 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800">
                {selectedPost.platform}
              </span>
              <span className="text-[11px] text-slate-400">{new Date(selectedPost.publishedAt).toLocaleString('zh-CN')}</span>
            </div>

            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-bold bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100/50 dark:border-slate-900">
              {selectedPost.caption}
            </p>

            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold block mb-1">点赞 (Likes)</span>
                <span className="font-black text-slate-850 dark:text-slate-105">{selectedPost.likes}</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold block mb-1">曝光 (Imp)</span>
                <span className="font-black text-slate-850 dark:text-slate-105">{fmtNum(selectedPost.impressions)}</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold block mb-1">互动率 (Eng%)</span>
                <span className="font-black text-emerald-500">{selectedPost.engRate}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
