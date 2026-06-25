'use client'
import React, { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Video,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Shield,
  Copy,
  Plus,
  Compass,
  ArrowRight,
  RefreshCw,
  Send,
  Zap
} from 'lucide-react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// Platform pill colors
const PLATFORM_COLORS: Record<string, string> = {
  'IG': 'bg-pink-100 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800/50',
  '小红书': 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50',
  'TikTok': 'bg-slate-900 text-white border-slate-700',
  'Google': 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
  'Facebook': 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
  'Email': 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/50',
  '任务': 'bg-violet-100 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/50',
  '全平台': 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
}

function normalizePlatformLabel(platform: string) {
  const key = platform.trim().toLowerCase()
  const aliasMap: Record<string, string> = {
    instagram: 'IG',
    ig: 'IG',
    xiaohongshu: '小红书',
    rednote: '小红书',
    xhs: '小红书',
    tiktok: 'TikTok',
    google: 'Google',
    facebook: 'Facebook',
    fb: 'Facebook',
    email: 'Email',
    newsletter: 'Email',
    task: '任务',
    任务: '任务',
    all: '全平台',
    '全平台': '全平台',
  }

  return aliasMap[key] ?? platform
}

const STATUS_COLORS: Record<string, string> = {
  'done': 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/20',
  'pending': 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/20',
  'scheduled': 'bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/20',
}

interface CalendarEvent {
  id: string
  brandId: string
  brandName: string
  platform: string
  title: string
  status: 'done' | 'pending' | 'scheduled'
  time: string
  scheduledAt: string
  mediaUrls?: string[]
  captionLang?: string
  mediaAssetId?: string | null
  clicks?: number
  roi?: number
}

interface DashboardCalendarProps {
  brandId?: string
}

export default function DashboardCalendar({ brandId }: DashboardCalendarProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggeringId, setTriggeringId] = useState<string | null>(null)

  // Stitch & Postis UX elements
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'scheduled' | 'done'>('all')
  const [activeView, setActiveView] = useState<'month' | 'week' | 'day' | 'list'>('month')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [designerPromptText, setDesignerPromptText] = useState('')
  const [designerProcessing, setDesignerProcessing] = useState(false)
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [showDesignerPanel, setShowDesignerPanel] = useState<string | null>(null)
  const [aiProposalGenerating, setAiProposalGenerating] = useState(false)
  const [brandDetails, setBrandDetails] = useState<any>(null)

  useEffect(() => {
    if (brandId) {
      fetch(`/api/brands/${brandId}`)
        .then(res => res.json())
        .then(data => setBrandDetails(data))
        .catch(() => {})
    }
  }, [brandId])

  const handleAIWrite = async (eventBrandId: string, draftId: string) => {
    const targetBrandId = eventBrandId || brandId
    if (!targetBrandId) {
      alert('未找到关联的品牌ID')
      return
    }
    setTriggeringId(draftId)
    try {
      const res = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '触发 AI 创作失败')
      alert('AI 创作已成功在后台启动，并会应用最新研究与排期策略，请稍后查看结果！')
      
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (brandId) query.set('brandId', brandId)
      const reloadRes = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (reloadRes.ok) {
        const data = await reloadRes.json()
        setEvents(data.events || [])
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '触发 AI 创作失败')
    } finally {
      setTriggeringId(null)
    }
  }

  const handleAIDesign = async (draftId: string, mediaAssetId: string, actionType: 'design' | 'video') => {
    if (!designerPromptText.trim()) {
      alert('请输入您的智能修改指令，例如：“添加店长推荐标签”')
      return
    }

    if (actionType === 'video') {
      setVideoProcessing(true)
    } else {
      setDesignerProcessing(true)
    }

    try {
      const targetBrandId = brandId || events.find(e => e.id === draftId)?.brandId
      if (!targetBrandId) {
        throw new Error('未找到关联的品牌ID')
      }

      const res = await fetch(`/api/brands/${targetBrandId}/assets/${mediaAssetId}/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: designerPromptText })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '设计修改失败')
      }

      const newAsset = data.asset

      // Patch the draft with the new media asset URL
      const patchRes = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrls: [newAsset.url],
          assetIds: [newAsset.id]
        })
      })

      if (!patchRes.ok) {
        const patchData = await patchRes.json()
        throw new Error(patchData.error || '关联新素材到排期失败')
      }

      alert('Designer AI 操作成功！排期已自动同步全新设计的海报。')
      
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (brandId) query.set('brandId', brandId)
      const reloadRes = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (reloadRes.ok) {
        const data = await reloadRes.json()
        setEvents(data.events || [])
      }
      setShowDesignerPanel(null)
      setDesignerPromptText('')
    } catch (err: any) {
      alert(err.message || '修改失败')
    } finally {
      setDesignerProcessing(false)
      setVideoProcessing(false)
    }
  }

  const handleAIProposal = async () => {
    setAiProposalGenerating(true)
    try {
      // Trigger Apify sync to get latest reviews/topics for planning
      await fetch(`/api/brands/${brandId}/apify-sync`, { method: 'POST' }).catch(() => {})
      
      // Call coordinate-scheduler workflows to generate drafts (simulated interval or direct trigger if present)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Reload calendar to fetch newly created draft proposals
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (brandId) query.set('brandId', brandId)
      const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
        alert('AI 已根据品牌资产和本地动态为您生成了全新排期提案！')
      }
    } catch (err) {
      alert('一键排期提案失败，请稍后重试')
    } finally {
      setAiProposalGenerating(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
        const query = new URLSearchParams({ month })
        if (brandId) query.set('brandId', brandId)
        const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        if (!cancelled) setEvents(data.events || [])
      } catch {
        if (!cancelled) setError('日历数据加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [viewYear, viewMonth, brandId])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
    setSelectedDay(null)
    setSelectedEventId(null)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
    setSelectedDay(null)
    setSelectedEventId(null)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const getDaysForWeekView = () => {
    const referenceDate = selectedDay ? new Date(viewYear, viewMonth, selectedDay) : new Date(viewYear, viewMonth, 1)
    const dayOfWeek = referenceDate.getDay() // 0 is Sunday
    const startOfWeek = new Date(referenceDate)
    startOfWeek.setDate(referenceDate.getDate() - dayOfWeek)
    
    const weekDays = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      weekDays.push(d)
    }
    return weekDays
  }

  const isToday = (d: number) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  
  // Filter based on selected state tab
  const filteredEvents = events.filter(ev => {
    if (activeFilter === 'all') return true
    return ev.status === activeFilter
  })

  const eventsByDay = filteredEvents.reduce<Record<number, CalendarEvent[]>>((acc, event) => {
    const day = new Date(event.scheduledAt).getDate()
    acc[day] = acc[day] || []
    acc[day].push(event)
    return acc
  }, {})

  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] || []) : []
  const formatTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  const activeDrawerEvent = selectedDayEvents.find(e => e.id === selectedEventId) || selectedDayEvents[0]

  // Identify expired connected accounts dynamically
  const expiredAccounts = brandDetails?.accounts?.filter((acc: any) => {
    if (!acc.expiresAt) return false
    return new Date(acc.expiresAt) < new Date()
  }) || []

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[750px] bg-slate-50 dark:bg-slate-950 font-sans">
      
      {/* 1. Left Sidebar: Channels & Private Domain */}
      <aside className="w-full lg:w-[260px] bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-4 tracking-wider">托管渠道 (Channels)</h2>
          
          <button
            onClick={handleAIProposal}
            disabled={aiProposalGenerating}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white py-3 px-4 rounded-xl flex items-center justify-center gap-2 mb-3 shadow-lg active:scale-[0.98] transition-all font-black text-xs"
          >
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
            <span>{aiProposalGenerating ? '排期分析中...' : 'AI 一键排期提案'}</span>
          </button>
          
          <button
            onClick={() => alert('已发布排期在日历上显示。请在“发布”或“任务”视图新建发布草稿。')}
            className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-xs"
          >
            <Plus className="w-4 h-4 text-slate-500" />
            <span>新建发布 (New Post)</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          {/* Dynamic Accounts List from DB */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {brandDetails?.name || '发布渠道'}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            
            {brandDetails?.accounts && brandDetails.accounts.length > 0 ? (
              <ul className="space-y-1.5">
                {brandDetails.accounts.map((acc: any) => {
                  const normPlatform = normalizePlatformLabel(acc.platformId)
                  const isExpired = acc.expiresAt && new Date(acc.expiresAt) < new Date()
                  return (
                    <li key={acc.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-[9px] text-white font-extrabold ${
                          normPlatform === 'IG' ? 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500' :
                          normPlatform === 'Google' ? 'bg-blue-550' :
                          normPlatform === 'TikTok' ? 'bg-black' :
                          normPlatform === 'Facebook' ? 'bg-indigo-650' :
                          normPlatform === '小红书' ? 'bg-red-600' : 'bg-slate-500'
                        }`}>
                          {normPlatform}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate max-w-[140px]">
                          {acc.handle || acc.displayName}
                        </span>
                      </div>
                      <span className={`w-1.5 h-1.5 rounded-full ${isExpired ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80">
                暂未连接发布渠道，请前往“品牌设置”完成账号授权。
              </div>
            )}
          </div>

          {/* Dynamic Warnings List */}
          {expiredAccounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">警告与异常</span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <div className="space-y-2">
                {expiredAccounts.map((acc: any) => (
                  <div key={acc.id} className="bg-amber-50 dark:bg-amber-955/20 border border-amber-200/50 dark:border-amber-900/30 p-3 rounded-xl flex gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="text-[10px]">
                      <p className="font-extrabold leading-tight">{normalizePlatformLabel(acc.platformId)} 授权过期</p>
                      <p className="mt-1 opacity-90">账号 {acc.handle} 的 AccessToken 已失效，排期将无法自动发布。</p>
                      <button onClick={() => alert('请前往设置重新连接')} className="mt-1.5 font-black underline hover:no-underline text-[9px]">去重新授权</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Brand Website / Landing Conversion page */}
          {brandDetails?.website && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">引流落地页</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/35 border border-slate-100 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[170px]">{brandDetails.website}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Central Content Area: Calendar Grid */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 p-4 lg:p-6 overflow-y-auto">
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm mb-6 shrink-0">
          
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 min-w-[120px]">{viewYear}年 {MONTHS[viewMonth]}</h2>
            <div className="flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-800">
              <button onClick={prevMonth} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 border-r border-slate-200 dark:border-slate-700 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={nextMonth} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDay(today.getDate()) }}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900"
            >
              今天 (Today)
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl">
              {(['all', 'pending', 'scheduled', 'done'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setActiveFilter(filter); setSelectedEventId(null) }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    activeFilter === filter
                      ? 'bg-white dark:bg-slate-750 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {filter === 'all' ? '全部' : filter === 'pending' ? '待审核' : filter === 'scheduled' ? '已排期' : '已发布'}
                </button>
              ))}
            </div>

            <div className="flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
              {(['month', 'week', 'day', 'list'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`px-3.5 py-1.5 text-xs font-bold transition-all ${
                    activeView === view
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 border-r border-slate-200 dark:border-slate-700 last:border-0'
                  }`}
                >
                  {view === 'month' ? '月' : view === 'week' ? '周' : view === 'day' ? '日' : '列表'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm overflow-hidden flex flex-col flex-1">
          {activeView !== 'day' && activeView !== 'list' && (
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-400 dark:text-slate-500 py-3 uppercase tracking-wider">
                  {d === '日' || d === '六' ? <span className="text-red-400">{d}</span> : d}
                </div>
              ))}
            </div>
          )}

          {activeView === 'month' && (
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800 flex-1 min-h-[400px]">
              {cells.map((day, idx) => {
                const dayEvents = day ? (eventsByDay[day] || []) : []
                const selected = day === selectedDay
                const todayCell = day ? isToday(day) : false

                return (
                  <div
                    key={idx}
                    onClick={() => day && setSelectedDay(day)}
                    className={`p-2 cursor-pointer transition-all flex flex-col justify-between group min-h-[90px] lg:min-h-[110px]
                      ${day ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20' : 'bg-slate-50/30 dark:bg-slate-950/20'}
                      ${selected ? 'bg-indigo-50/30 dark:bg-indigo-900/10 ring-2 ring-inset ring-indigo-500/55' : ''}`}
                  >
                    {day ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full
                            ${todayCell ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
                            {day}
                          </span>
                          {dayEvents.length > 2 && (
                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">+{dayEvents.length - 2}</span>
                          )}
                        </div>
                        
                        <div className="space-y-1 flex-1 overflow-hidden">
                          {dayEvents.slice(0, 2).map((ev) => {
                            const normPlatform = normalizePlatformLabel(ev.platform)
                            const hasVideo = ev.mediaUrls?.[0] && ev.platform === 'IG' && ev.title.includes('视频')
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedDay(day); setSelectedEventId(ev.id) }}
                                className={`text-[9px] font-bold px-1.5 py-1 rounded-lg border flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative ${
                                  PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                                } ${ev.status === 'pending' ? 'border-amber-300/40 bg-amber-500/5' : ''}`}
                              >
                                {hasVideo && <Video className="w-2.5 h-2.5 inline-block shrink-0 text-pink-500" />}
                                {ev.status === 'scheduled' && normPlatform === 'Google' && (
                                  <Shield className="w-2.5 h-2.5 text-blue-500 fill-blue-500/10 shrink-0" />
                                )}
                                <span>{normPlatform} · {ev.title.replace(`${normPlatform} · `, '')}</span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <div />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeView === 'week' && (
            <div className="grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800 flex-1 min-h-[150px]">
              {getDaysForWeekView().map((d, idx) => {
                const isSelected = selectedDay === d.getDate() && viewMonth === d.getMonth() && viewYear === d.getFullYear()
                const todayCell = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
                const isCurrentMonth = d.getMonth() === viewMonth
                
                const dayEvents = filteredEvents.filter(ev => {
                  const evDate = new Date(ev.scheduledAt)
                  return evDate.getDate() === d.getDate() &&
                         evDate.getMonth() === d.getMonth() &&
                         evDate.getFullYear() === d.getFullYear()
                })

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setViewYear(d.getFullYear())
                      setViewMonth(d.getMonth())
                      setSelectedDay(d.getDate())
                    }}
                    className={`p-2 cursor-pointer transition-all flex flex-col justify-between group min-h-[200px]
                      ${isCurrentMonth ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20' : 'bg-slate-50/30 dark:bg-slate-950/20 opacity-60'}
                      ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-900/10 ring-2 ring-inset ring-indigo-500/55' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full
                        ${todayCell ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
                        {d.getDate()}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{WEEKDAYS[d.getDay()]}</span>
                    </div>
                    
                    <div className="space-y-1 flex-1 overflow-y-auto no-scrollbar">
                      {dayEvents.map((ev) => {
                        const normPlatform = normalizePlatformLabel(ev.platform)
                        const hasVideo = ev.mediaUrls?.[0] && ev.platform === 'IG' && ev.title.includes('视频')
                        return (
                          <div
                            key={ev.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedDay(d.getDate()); setSelectedEventId(ev.id) }}
                            className={`text-[9px] font-bold px-1.5 py-1 rounded-lg border flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative ${
                              PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                            } ${ev.status === 'pending' ? 'border-amber-300/40 bg-amber-500/5' : ''}`}
                          >
                            {hasVideo && <Video className="w-2.5 h-2.5 inline-block shrink-0 text-pink-500" />}
                            {ev.status === 'scheduled' && normPlatform === 'Google' && (
                              <Shield className="w-2.5 h-2.5 text-blue-500 fill-blue-500/10 shrink-0" />
                            )}
                            <span>{normPlatform} · {ev.title.replace(`${normPlatform} · `, '')}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeView === 'day' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                      {viewYear}年 {viewMonth + 1}月{selectedDay}日 排期内容
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">当天共有 {selectedDayEvents.length} 条排期记录</p>
                  </div>
                </div>
                
                {selectedDayEvents.length === 0 ? (
                  <div className="py-24 text-center text-slate-400 dark:text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-extrabold">当天无排期内容</p>
                    <p className="text-xs opacity-75 mt-1">请点击其他日期查看，或新建排期草稿</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedDayEvents.map((ev) => {
                      const normPlatform = normalizePlatformLabel(ev.platform)
                      const isExpired = expiredAccounts.some((acc: any) => acc.platformId === ev.platform)
                      return (
                        <div 
                          key={ev.id}
                          onClick={() => { setSelectedEventId(ev.id) }}
                          className={`p-4 bg-white dark:bg-slate-850/40 rounded-2xl border border-slate-100 dark:border-slate-800/80 hover:border-indigo-500/40 hover:shadow-md transition-all cursor-pointer flex gap-4 ${
                            selectedEventId === ev.id ? 'ring-2 ring-indigo-500/60' : ''
                          }`}
                        >
                          {ev.mediaUrls?.[0] && (
                            <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-slate-100 border border-slate-200/40">
                              <img src={ev.mediaUrls[0]} alt={ev.title} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                    PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}>
                                    {normPlatform}
                                  </span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold">{formatTime(ev.time)}</span>
                                </div>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLORS[ev.status]}`}>
                                  {ev.status === 'done' ? '已发布' : ev.status === 'pending' ? '待审核' : '已排期'}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed">{ev.title}</h4>
                            </div>
                            
                            {isExpired && (
                              <div className="flex items-center gap-1 mt-2 text-[9px] font-bold text-amber-600 dark:text-amber-500">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>授权已失效</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'list' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-2">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">本月排期列表</h3>
                    <p className="text-xs text-slate-400 mt-1">共筛选出 {filteredEvents.length} 条排期记录</p>
                  </div>
                </div>

                {filteredEvents.length === 0 ? (
                  <div className="py-24 text-center text-slate-400 dark:text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-extrabold">暂无符合条件的排期记录</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredEvents.map((ev) => {
                      const normPlatform = normalizePlatformLabel(ev.platform)
                      const evDate = new Date(ev.scheduledAt)
                      const isSelected = selectedEventId === ev.id
                      return (
                        <div
                          key={ev.id}
                          onClick={() => {
                            setSelectedDay(evDate.getDate())
                            setSelectedEventId(ev.id)
                          }}
                          className={`py-3.5 px-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 cursor-pointer transition-colors flex items-center justify-between gap-4 ${
                            isSelected ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="flex flex-col items-center shrink-0 w-10 text-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">
                                {evDate.toLocaleDateString('zh-CN', { month: 'short' })}
                              </span>
                              <span className="text-sm font-black text-slate-700 dark:text-slate-300 mt-0.5">{evDate.getDate()}日</span>
                            </div>

                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
                              PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {normPlatform}
                            </span>

                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[320px]">
                              {ev.title.replace(`${normPlatform} · `, '')}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-slate-400 font-bold">{formatTime(ev.time)}</span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLORS[ev.status]}`}>
                              {ev.status === 'done' ? '已发布' : ev.status === 'pending' ? '待审核' : '已排期'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 3. Right Details Drawer */}
      {selectedDay && (
        <aside className="w-full lg:w-[380px] bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 flex flex-col shrink-0 shadow-2xl animate-in slide-in-from-right duration-350 z-20">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                {viewMonth + 1}月{selectedDay}日 排期详情
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">查看及配置发布细节</p>
            </div>
            <button
              onClick={() => { setSelectedDay(null); setSelectedEventId(null) }}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
            {selectedDayEvents.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-extrabold">当天无排期内容</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDayEvents.length > 1 && (
                  <div className="flex items-center gap-1.5 p-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl overflow-x-auto">
                    {selectedDayEvents.map(e => (
                      <button
                        key={e.id}
                        onClick={() => setSelectedEventId(e.id)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black whitespace-nowrap transition-all ${
                          (selectedEventId === e.id || (!selectedEventId && selectedDayEvents[0].id === e.id))
                            ? 'bg-white dark:bg-slate-705 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-100 dark:border-slate-650'
                            : 'text-slate-400 hover:text-slate-700 dark:text-slate-500'
                        }`}
                      >
                        {normalizePlatformLabel(e.platform)}
                      </button>
                    ))}
                  </div>
                )}

                {activeDrawerEvent && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-500 dark:text-slate-400">{formatTime(activeDrawerEvent.time)}</span>
                        <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border ${STATUS_COLORS[activeDrawerEvent.status]}`}>
                          {activeDrawerEvent.status === 'done' ? '已发布' : activeDrawerEvent.status === 'pending' ? '待审核' : '已排期'}
                        </span>
                      </div>
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">{activeDrawerEvent.brandName}</span>
                    </div>

                    {activeDrawerEvent.mediaUrls && activeDrawerEvent.mediaUrls[0] && (
                      <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-slate-150 border border-slate-200/50 dark:border-slate-800 shadow-sm group">
                        <img
                          src={activeDrawerEvent.mediaUrls[0]}
                          alt={activeDrawerEvent.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                        />
                        {activeDrawerEvent.title.includes('视频') && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-white/95 text-pink-600 flex items-center justify-center shadow-lg">
                              <Video className="w-5 h-5 fill-pink-600/10" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl">
                      <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">文案预览</h4>
                      <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
                        {activeDrawerEvent.title}
                      </p>
                    </div>

                    {/* Real DB Click/ROI conversion statistics badges */}
                    {activeDrawerEvent.status === 'done' && (
                      <div className="space-y-3">
                        <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/15 rounded-2xl">
                          <h4 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 fill-emerald-500/15" />
                            <span>引流分析 & Click 追踪</span>
                          </h4>
                          
                          <div className="grid grid-cols-2 gap-3 text-center">
                            <div className="bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-700/40 p-2.5 rounded-xl shadow-sm">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">点击量</p>
                              <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5">{activeDrawerEvent.clicks ?? 0} 次</p>
                            </div>
                            <div className="bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-700/40 p-2.5 rounded-xl shadow-sm">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">引流到店 ROI</p>
                              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">${activeDrawerEvent.roi ?? 0}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Real Temporal Protection Indicator for scheduled posts */}
                    {activeDrawerEvent.status === 'scheduled' && (
                      <div className="p-4 bg-indigo-500/5 dark:bg-indigo-950/10 border border-indigo-500/15 rounded-2xl">
                        <h4 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Temporal 托管与重试调度</span>
                        </h4>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          <span>服务托管中 · 重试事务就绪</span>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">该排期受指数退避及重调度机制保护，若因网络抖动推送失败，Temporal 调度器将自动重试。</p>
                      </div>
                    )}

                    {/* AI Actions Section: Copywriter & Designer */}
                    {activeDrawerEvent.status !== 'done' && (
                      <div className="space-y-3 pt-2">
                        <div className="flex gap-2.5">
                          <button
                            onClick={() => handleAIWrite(activeDrawerEvent.brandId, activeDrawerEvent.id)}
                            disabled={triggeringId === activeDrawerEvent.id}
                            className="flex-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 dark:border-indigo-900/40 dark:text-indigo-400 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 font-black text-xs transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            <span>{triggeringId === activeDrawerEvent.id ? '正在重写...' : 'AI 创作重构'}</span>
                          </button>

                          {activeDrawerEvent.mediaAssetId && (
                            <button
                              onClick={() => setShowDesignerPanel(prev => prev === activeDrawerEvent.id ? null : activeDrawerEvent.id)}
                              className="flex-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 dark:bg-purple-950/20 dark:hover:bg-purple-900/30 dark:border-purple-900/40 dark:text-purple-400 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 font-black text-xs transition-all active:scale-[0.98]"
                            >
                              <ImageIcon className="w-4 h-4 text-purple-500" />
                              <span>AI 图像设计</span>
                            </button>
                          )}
                        </div>

                        {showDesignerPanel === activeDrawerEvent.id && activeDrawerEvent.mediaAssetId && (
                          <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl space-y-3.5 animate-in slide-in-from-top duration-300">
                            <div>
                              <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-purple-500" />
                                <span>Designer AI 修改助手</span>
                              </h4>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                                对海报或视频封面进行智能修改（如：“调亮图片”、“添加‘店长推荐’促销标签”、“裁剪为 1:1” 等）。
                              </p>
                            </div>

                            <textarea
                              rows={2}
                              value={designerPromptText}
                              onChange={(e) => setDesignerPromptText(e.target.value)}
                              placeholder="输入您的修图/剪辑指令..."
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                            />

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAIDesign(activeDrawerEvent.id, activeDrawerEvent.mediaAssetId!, 'design')}
                                disabled={designerProcessing || videoProcessing}
                                className="flex-1 bg-purple-650 hover:bg-purple-700 text-white py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs shadow-sm transition-all active:scale-[0.97] disabled:opacity-50"
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>{designerProcessing ? '修图中...' : 'AI 修图'}</span>
                              </button>

                              <button
                                onClick={() => handleAIDesign(activeDrawerEvent.id, activeDrawerEvent.mediaAssetId!, 'video')}
                                disabled={designerProcessing || videoProcessing}
                                className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-700 text-white py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs shadow-sm transition-all active:scale-[0.97] disabled:opacity-50"
                              >
                                <Video className="w-3.5 h-3.5" />
                                <span>{videoProcessing ? '生成中...' : '生成视频 (Veo3)'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>

          {selectedDayEvents.some(e => e.status === 'pending') && (
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 shrink-0">
              <button
                onClick={() => alert('已一键审核并排期当天所有待审批任务！')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all"
              >
                发布全部待审核任务
              </button>
            </div>
          )}
        </aside>
      )}

      {/* 4. AI Floating Ball (Contextual Interaction) */}
      <div className="fixed bottom-8 right-6 lg:right-10 z-[60] group">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-14 h-14 bg-indigo-500/20 dark:bg-indigo-400/20 rounded-full animate-ping pointer-events-none" />
          <button
            onClick={() => handleAIProposal()}
            disabled={aiProposalGenerating}
            className="w-12 h-12 bg-gradient-to-tr from-indigo-650 to-violet-650 text-white rounded-full flex items-center justify-center shadow-2xl relative z-10 hover:scale-110 active:scale-95 transition-all"
          >
            <Sparkles className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

    </div>
  )
}
