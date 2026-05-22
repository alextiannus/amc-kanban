'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { TrendingUp, Download, ChevronDown, Heart, Eye, Users, BarChart2, MessageCircle, Activity, FileText, X } from 'lucide-react'
import PostDetailModal from './PostDetailModal'

// ── Colour palette for platforms ────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F', tiktok: '#010101', xiaohongshu: '#FF2442',
  facebook: '#1877F2', youtube: '#FF0000', google: '#4285F4',
  twitter: '#1DA1F2', x: '#000000', linkedin: '#0A66C2', unknown: '#6366f1',
}

const CONTENT_TYPE_COLORS: Record<string, string> = {
  SHORT: '#ef4444', VIDEO: '#f97316', IMAGE: '#3b82f6',
  LONG: '#8b5cf6', STORY: '#ec4899',
}

// ── Small helpers ────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── KPI Metric Card ──────────────────────────────────────────────────────────
function MetricCard({ label, value, delta, highlight = false, onClick, active = false }: {
  label: string; value: string; delta: string; highlight?: boolean; onClick?: () => void; active?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-5 border transition-all ${
        onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : ''
      } ${
        active ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''
      } ${
        highlight
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/10 shadow-md shadow-amber-100 dark:shadow-amber-900/20'
          : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md'
      }`}
    >
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-3xl font-black leading-none mb-1.5 ${highlight ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
        <TrendingUp className="w-3 h-3" />
        <span>{delta}</span>
      </div>
    </div>
  )
}

// ── SVG Area Chart ───────────────────────────────────────────────────────────
type MetricKey = 'engagement' | 'impressions' | 'reach' | 'likes' | 'engRate' | 'postCount'
const METRIC_OPTIONS: { key: MetricKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'engagement', label: 'Engagement', icon: <Activity className="w-3.5 h-3.5" />, color: '#c084fc' },
  { key: 'impressions', label: 'Impressions', icon: <Eye className="w-3.5 h-3.5" />, color: '#60a5fa' },
  { key: 'reach', label: 'Reach', icon: <Users className="w-3.5 h-3.5" />, color: '#34d399' },
  { key: 'likes', label: 'Likes', icon: <Heart className="w-3.5 h-3.5" />, color: '#f472b6' },
  { key: 'engRate', label: 'Eng. Rate', icon: <BarChart2 className="w-3.5 h-3.5" />, color: '#f59e0b' },
  { key: 'postCount', label: 'Posts', icon: <FileText className="w-3.5 h-3.5" />, color: '#06b6d4' },
]

function AreaChart({ series, activeMetric, activeDate, onPointClick }: {
  series: { date: string; engagement: number; impressions: number; reach: number; likes: number; engRate: number; postCount?: number }[]
  activeMetric: MetricKey
  activeDate?: string | null
  onPointClick?: (date: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null)
  const W = 900; const H = 200; const PAD = { t: 20, r: 20, b: 30, l: 40 }
  const metricColor = METRIC_OPTIONS.find(m => m.key === activeMetric)?.color ?? '#c084fc'

  if (series.length === 0) return (
    <div className="h-48 flex items-center justify-center text-slate-300 dark:text-slate-700 text-sm">暂无数据</div>
  )

  const vals = series.map(d => d[activeMetric] as number)
  const maxV = Math.max(...vals, 1)
  const xStep = (W - PAD.l - PAD.r) / (series.length - 1 || 1)

  const toX = (i: number) => PAD.l + i * xStep
  const toY = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / maxV)

  const points = series.map((d, i) => ({ x: toX(i), y: toY(d[activeMetric] as number), d }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${H - PAD.b} L${points[0].x},${H - PAD.b} Z`

  // Y-axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: PAD.t + (H - PAD.t - PAD.b) * (1 - r), v: maxV * r }))

  // X-axis labels (show ~6 evenly spaced)
  const xTickStep = Math.max(1, Math.floor(series.length / 6))
  const xTicks = series.filter((_, i) => i % xTickStep === 0 || i === series.length - 1)

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: '200px' }}
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
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={metricColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={metricColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4,4" />
            <text x={PAD.l - 6} y={t.y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtNum(Math.round(t.v))}</text>
          </g>
        ))}
        {/* X-axis labels */}
        {xTicks.map((d, i) => {
          const idx = series.indexOf(d)
          return <text key={i} x={toX(idx)} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">{fmtDate(d.date)}</text>
        })}
        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke={metricColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y}
            r={activeDate === p.d.date ? 6 : 3}
            fill={activeDate === p.d.date ? '#2563eb' : metricColor}
            stroke="white" strokeWidth="1.5"
            className="cursor-pointer hover:r-5 transition-all"
            onClick={() => onPointClick?.(p.d.date)}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </svg>
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
          style={{ left: `${tooltip.x}%`, top: `${tooltip.y}%`, transform: 'translate(-50%, -130%)' }}
        >
          <p className="text-slate-300 font-normal">{tooltip.label}</p>
          {tooltip.value}
        </div>
      )}
    </div>
  )
}

// ── Content Type Bar Chart ───────────────────────────────────────────────────
function ContentTypeChart({ data, activeType, onTypeClick }: {
  data: { type: string; count: number }[]
  activeType?: string | null
  onTypeClick?: (t: string) => void
}) {
  if (data.length === 0) return <div className="h-40 flex items-center justify-center text-slate-300 dark:text-slate-700 text-sm">暂无数据</div>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="space-y-3">
      {data.map(d => {
        const isActive = activeType === d.type
        return (
          <div key={d.type} onClick={() => onTypeClick?.(d.type)}
            className={`flex items-center gap-3 rounded-xl p-1 -mx-1 cursor-pointer transition-all ${
              isActive ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-600' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-14 text-right shrink-0">{d.type}</span>
            <div className="flex-1 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg transition-all duration-700"
                style={{ width: `${(d.count / max) * 100}%`, backgroundColor: CONTENT_TYPE_COLORS[d.type] ?? '#6366f1', opacity: activeType && !isActive ? 0.4 : 1 }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 w-8 shrink-0">{d.count}</span>
          </div>
        )
      })}
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
      className="flex items-start gap-3 py-3 border-b border-slate-50 dark:border-slate-800/80 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 -mx-5 px-5 rounded-xl transition-colors group"
    >
      <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-black text-slate-500 shrink-0 mt-0.5">{rank}</span>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${platformColor}20` }}>
        <img src={`https://cdn.simpleicons.org/${post.platform === 'unknown' ? 'github' : post.platform}/${platformColor.replace('#', '')}`}
          alt={post.platform} className="w-3.5 h-3.5 object-contain" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{post.handle || post.platform}</span>
          <span className="text-[10px] text-slate-400">{fmtDate(post.publishedAt)}</span>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{post.contentType}</span>
          {(post.status === 'draft' || post.status === 'pending_review') && (
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
              post.status === 'pending_review' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            }`}>{post.status === 'pending_review' ? '待审核' : '草稿'}</span>
          )}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{post.caption || '（无文案）'}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comments}</span>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmtNum(post.impressions)}</span>
          <span className="font-bold text-slate-500">{interactions} total</span>
          <span className="ml-auto text-[10px] text-slate-300 dark:text-slate-600 group-hover:text-blue-400 transition-colors">点击查看 →</span>
        </div>
      </div>
    </div>
  )
}

// ── Date Range Picker ────────────────────────────────────────────────────────
const PRESETS = [
  { label: '7天', days: 7 },
  { label: '30天', days: 30 },
  { label: '60天', days: 60 },
  { label: '90天', days: 90 },
]

// ── Main Component ───────────────────────────────────────────────────────────
interface BrandAnalyticsDashboardProps { brandId: string; brandName?: string }

export default function BrandAnalyticsDashboard({ brandId, brandName }: BrandAnalyticsDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeMetric, setActiveMetric] = useState<MetricKey>('postCount')
  const [topSort, setTopSort] = useState<'engagement' | 'impressions' | 'recent'>('recent')
  const [showPresets, setShowPresets] = useState(false)
  const [days, setDays] = useState(30)
  const [activeDate, setActiveDate] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [selectedPost, setSelectedPost] = useState<any | null>(null)
  const postsRef = useRef<HTMLDivElement>(null)
  const presetRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (d: number) => {
    setLoading(true); setError(null)
    try {
      const to = new Date()
      const from = new Date(to.getTime() - (d - 1) * 24 * 60 * 60 * 1000)
      const res = await fetch(`/api/brands/${brandId}/analytics?from=${from.toISOString()}&to=${to.toISOString()}`)
      if (!res.ok) throw new Error('Failed to load analytics')
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
  const allPosts: any[] = data?.allPosts ?? data?.topPosts ?? []

  // ── Client-side filtering ────────────────────────────────────────────────
  const filteredPosts = allPosts.filter((p: any) => {
    if (activeDate && p.publishedAt.slice(0, 10) !== activeDate) return false
    if (activeType && p.contentType !== activeType) return false
    return true
  }).sort((a: any, b: any) => {
    if (topSort === 'impressions') return b.impressions - a.impressions
    if (topSort === 'engagement') return (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  })

  const hasFilter = !!activeDate || !!activeType
  const contentTypeBreakdown = data?.contentTypeBreakdown ?? []
  const prevFrom = new Date(Date.now() - (days * 2 - 1) * 24 * 60 * 60 * 1000)
  const prevTo = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const clearFilters = () => { setActiveDate(null); setActiveType(null) }
  const scrollToPosts = () => postsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const handleKpiClick = () => { clearFilters(); setTimeout(scrollToPosts, 50) }

  return (
    <div className="p-4 md:p-8 pb-44 space-y-6 min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">品牌数据分析</h2>
          {brandName && <p className="text-xs text-slate-400 mt-0.5">{brandName}</p>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range preset */}
          <div ref={presetRef} className="relative">
            <button
              onClick={() => setShowPresets(p => !p)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-600 transition-all shadow-sm"
              id="analytics-date-range"
            >
              <span>近{days}天</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
            </button>
            {showPresets && (
              <div className="absolute left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-xl z-50 min-w-[120px] overflow-hidden">
                {PRESETS.map(p => (
                  <button
                    key={p.days}
                    onClick={() => { setDays(p.days); setShowPresets(false) }}
                    className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${days === p.days ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export button */}
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm"
            id="analytics-export"
            onClick={() => {
              if (!data) return
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = `analytics-${brandId}.json`; a.click()
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Previous period label */}
      <p className="text-[11px] text-slate-400 -mt-3">
        vs prev. period: {fmtDate(prevFrom.toISOString())} – {fmtDate(prevTo.toISOString())}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-7 h-7 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 p-6 text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : (
        <>
          {/* ── KPI Cards ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Total Posts" value={String(kpis.totalPosts ?? 0)} delta={`共 ${kpis.totalPosts ?? 0} 篇`} onClick={handleKpiClick} />
            <MetricCard label="Total Engagement" value={fmtNum(kpis.totalEngagement ?? 0)} delta="+100%" onClick={handleKpiClick} />
            <MetricCard label="Total Impressions" value={fmtNum(kpis.totalImpressions ?? 0)} delta="+100%" onClick={handleKpiClick} />
            <MetricCard label="Average Reach" value={fmtNum(kpis.avgReach ?? 0)} delta="+100%" onClick={handleKpiClick} />
            <MetricCard label="Total Likes" value={fmtNum(kpis.totalLikes ?? 0)} delta="+100%" onClick={handleKpiClick} />
            <MetricCard label="Avg. Eng. Rate" value={`${kpis.avgEngRate ?? 0}%`} delta="+100%" highlight onClick={handleKpiClick} />
          </div>

          {/* ── Performance Over Time ─────────────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
              <div className="flex-1">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Performance Over Time</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">View trends and patterns in your social media metrics</p>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {METRIC_OPTIONS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setActiveMetric(m.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                      activeMetric === m.key
                        ? 'border-current shadow-sm'
                        : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                    style={activeMetric === m.key ? { color: m.color, borderColor: m.color, backgroundColor: `${m.color}15` } : {}}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <AreaChart
              series={timeSeries}
              activeMetric={activeMetric}
              activeDate={activeDate}
              onPointClick={date => {
                setActiveDate(prev => prev === date ? null : date)
                setTimeout(scrollToPosts, 80)
              }}
            />
          </div>

          {/* ── Bottom two columns ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Top Posts */}
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="flex items-start justify-between px-5 py-4 border-b border-slate-50 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Top Posts</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Your best performing posts in the selected period</p>
                </div>
                <div className="relative">
                  <select
                    value={topSort}
                    onChange={e => setTopSort(e.target.value as any)}
                    className="appearance-none pl-3 pr-8 py-1.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer"
                    id="analytics-top-posts-sort"
                  >
                    <option value="recent">最新</option>
                    <option value="engagement">Engagement</option>
                    <option value="impressions">Impressions</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="px-5 divide-y divide-slate-50 dark:divide-slate-800/80 max-h-[500px] overflow-y-auto">
                {filteredPosts.slice(0, 10).length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">暂无内容记录</div>
                ) : filteredPosts.slice(0, 10).map((post: any, i: number) => (
                  <TopPostRow key={post.id} post={post} rank={i + 1} onClick={() => setSelectedPost(post)} />
                ))}
              </div>
            </div>

            {/* Content Type Breakdown */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50 dark:border-slate-800">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Content Type Breakdown</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Performance by content format</p>
              </div>
              <div className="p-5">
                <ContentTypeChart
                  data={contentTypeBreakdown}
                  activeType={activeType}
                  onTypeClick={t => {
                    setActiveType(prev => prev === t ? null : t)
                    setTimeout(scrollToPosts, 80)
                  }}
                />

                {/* Color legend */}
                {contentTypeBreakdown.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {contentTypeBreakdown.map((d: any) => (
                      <div key={d.type} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CONTENT_TYPE_COLORS[d.type] ?? '#6366f1' }} />
                          <span className="font-bold text-slate-600 dark:text-slate-300">{d.type}</span>
                        </div>
                        <span className="text-slate-400">{d.count} 篇 · {d.avgEngRate}% eng</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* No postfast notice */}
                {!data?.hasPostfastData && (
                  <p className="mt-4 text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                    连接 PostFast 可获得完整的互动数据。当前仅展示本地草稿记录。
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Filtered Posts Section ────────────────────────────────── */}
      {hasFilter && !loading && (
        <div ref={postsRef} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                {activeDate ? `${fmtDate(activeDate)} 的内容` : activeType ? `${activeType} 类型内容` : '筛选结果'}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{filteredPosts.length} 条记录 · 点击卡片查看详情</p>
            </div>
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" /> 清除筛选
            </button>
          </div>
          <div className="px-5 divide-y divide-slate-50 dark:divide-slate-800/80 max-h-[600px] overflow-y-auto">
            {filteredPosts.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">该筛选条件下暂无内容</div>
            ) : filteredPosts.map((post: any, i: number) => (
              <TopPostRow key={post.id} post={post} rank={i + 1} onClick={() => setSelectedPost(post)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Post Detail Modal ───────────────────────────────────────── */}
      {selectedPost && <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </div>
  )
}
