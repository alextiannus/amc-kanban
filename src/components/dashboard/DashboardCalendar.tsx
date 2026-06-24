'use client'
import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, Sparkles } from 'lucide-react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// Platform pill colors
const PLATFORM_COLORS: Record<string, string> = {
  'IG': 'bg-pink-100 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800/50',
  '小红书': 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50',
  'TikTok': 'bg-slate-900 text-white border-slate-700',
  'Google': 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
  'Facebook': 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
  'YouTube': 'bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50',
  'X': 'bg-slate-800 dark:bg-slate-700 text-white border-slate-700',
  'Yelp': 'bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50',
  'LinkedIn': 'bg-sky-100 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800/50',
  'Pinterest': 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50',
  '微博': 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/50',
  '微信公众号': 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
  'Snapchat': 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/50',
  'TripAdvisor': 'bg-teal-100 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800/50',
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
    youtube: 'YouTube',
    yt: 'YouTube',
    x: 'X',
    twitter: 'X',
    yelp: 'Yelp',
    linkedin: 'LinkedIn',
    pinterest: 'Pinterest',
    weibo: '微博',
    微博: '微博',
    wechat: '微信公众号',
    weixin: '微信公众号',
    微信公众号: '微信公众号',
    snapchat: 'Snapchat',
    tripadvisor: 'TripAdvisor',
    task: '任务',
    任务: '任务',
    all: '全平台',
    '全平台': '全平台',
  }

  return aliasMap[key] ?? platform
}

const STATUS_COLORS: Record<string, string> = {
  'done': 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400',
  'pending': 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400',
  'scheduled': 'bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400',
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
      
      // Reload events to show updated caption/status
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
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
    setSelectedDay(null)
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const isToday = (d: number) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  const eventsByDay = events.reduce<Record<number, CalendarEvent[]>>((acc, event) => {
    const day = new Date(event.scheduledAt).getDate()
    acc[day] = acc[day] || []
    acc[day].push(event)
    return acc
  }, {})
  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] || []) : []
  const formatTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-36 space-y-6">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">发布日历</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">AI 员工内容排期与执行状态</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">

        {/* Month Navigator */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
            {viewYear} 年 {MONTHS[viewMonth]}
          </h3>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Weekday Labels */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[11px] font-bold text-slate-400 uppercase py-2.5">
              {d}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-50 dark:divide-slate-800/60">
          {cells.map((day, idx) => {
            const dayEvents = day ? (eventsByDay[day] || []) : []
            const selected = day === selectedDay
            const todayCell = day ? isToday(day) : false

            return (
              <div
                key={idx}
                onClick={() => day && setSelectedDay(day)}
                className={`min-h-[80px] md:min-h-[100px] p-2 cursor-pointer transition-colors
                  ${day ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'bg-slate-50/50 dark:bg-slate-900/50'}
                  ${selected ? 'bg-emerald-50 dark:bg-emerald-900/10 ring-2 ring-inset ring-emerald-400 dark:ring-emerald-600' : ''}`}
              >
                {day && (
                  <>
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                        ${todayCell ? 'bg-emerald-500 text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                        {day}
                      </span>
                      {dayEvents.length > 2 && (
                        <span className="text-[9px] font-black text-slate-400">+{dayEvents.length - 1}</span>
                      )}
                    </div>
                    {/* Event pills */}
                    <div className="space-y-1">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <div key={ev.id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border truncate ${PLATFORM_COLORS[normalizePlatformLabel(ev.platform)] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {normalizePlatformLabel(ev.platform)} · {ev.title.length > 8 ? ev.title.slice(0, 8) + '…' : ev.title}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDay && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
              {viewMonth + 1}月{selectedDay}日 的排期
            </h3>
          </div>
          {loading && (
            <div className="p-6 text-sm text-slate-400 border-b border-slate-50 dark:border-slate-800/60">正在加载排期...</div>
          )}
          {selectedEvents.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
              <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">当天无排期内容</p>
              <p className="text-xs mt-1">设置任务截止时间或内容发布时间后，这里会自动显示</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {selectedEvents.map((ev) => (
                <div key={ev.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl border ${PLATFORM_COLORS[normalizePlatformLabel(ev.platform)] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {normalizePlatformLabel(ev.platform)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">{ev.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{ev.brandName} · {formatTime(ev.time)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {(!ev.id.startsWith('task_') && ev.status !== 'done') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAIWrite(ev.brandId, ev.id)
                        }}
                        disabled={triggeringId === ev.id}
                        className="inline-flex items-center gap-1.5 text-[11px] font-black bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl border border-indigo-500 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 fill-white/10" />
                        {triggeringId === ev.id ? '创作中...' : 'AI 创作'}
                      </button>
                    )}
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[ev.status]}`}>
                      {ev.status === 'done' ? '已发布' : ev.status === 'pending' ? '待审核' : '已排期'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${cls.split(' ')[0]}`} />
            <span className="text-xs text-slate-400 font-medium">
              {status === 'done' ? '已发布' : status === 'pending' ? '待审核' : '已排期'}
            </span>
          </div>
        ))}
      </div>

      {!loading && error && (
        <div className="px-1 text-xs text-rose-500 font-medium">{error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="px-1 text-xs text-slate-400 font-medium">本月还没有排期内容，先设置任务截止时间或内容发布时间。</div>
      )}

    </div>
  )
}
