'use client'
import React, { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Check, Clock, Edit2 } from 'lucide-react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// Platform pill colors
const PLATFORM_COLORS: Record<string, string> = {
  'IG': 'bg-pink-100 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800/50',
  '小红书': 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50',
  'TikTok': 'bg-slate-900 text-white border-slate-700',
  'Google': 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
  '全平台': 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
}

const STATUS_COLORS: Record<string, string> = {
  'done': 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400',
  'pending': 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400',
  'scheduled': 'bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400',
}

// Mock event data keyed by day-of-month (for May 2025 demo)
const MOCK_EVENTS: Record<number, { platform: string, title: string, status: 'done' | 'pending' | 'scheduled', time: string }[]> = {
  3: [{ platform: 'IG', title: '周末龙虾特价', status: 'done', time: '11:00' }],
  5: [{ platform: '小红书', title: '新品探店笔记', status: 'done', time: '19:00' }],
  8: [{ platform: 'IG', title: '午市套餐优惠', status: 'done', time: '10:00' }, { platform: '小红书', title: '午市套餐优惠', status: 'done', time: '10:15' }],
  12: [{ platform: 'TikTok', title: '餐厅环境 VLOG', status: 'done', time: '18:00' }],
  15: [{ platform: 'Google', title: '差评回复跟进', status: 'done', time: '09:30' }],
  18: [{ platform: 'IG', title: '母亲节预热海报', status: 'pending', time: '今天' }, { platform: '小红书', title: '母亲节预热', status: 'scheduled', time: '20:00' }],
  20: [{ platform: '全平台', title: '母亲节大促推送', status: 'scheduled', time: '10:00' }],
  23: [{ platform: 'TikTok', title: '周末海鲜特价短视频', status: 'scheduled', time: '18:00' }],
  25: [{ platform: 'IG', title: '万圣节预热 (AI 提案)', status: 'scheduled', time: '12:00' }],
  28: [{ platform: '小红书', title: '月末好物推荐', status: 'scheduled', time: '19:00' }],
}

export default function DashboardCalendar() {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())

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
  const selectedEvents = selectedDay ? (MOCK_EVENTS[selectedDay] || []) : []

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-36 space-y-6">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">发布日历</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">AI 员工内容排期与执行状态</p>
        </div>
        <button className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm shadow-emerald-500/20">
          <Plus className="w-4 h-4" /> 新增排期
        </button>
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
            const events = day ? (MOCK_EVENTS[day] || []) : []
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
                      {events.length > 2 && (
                        <span className="text-[9px] font-black text-slate-400">+{events.length - 1}</span>
                      )}
                    </div>
                    {/* Event pills */}
                    <div className="space-y-1">
                      {events.slice(0, 2).map((ev, i) => (
                        <div key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border truncate ${PLATFORM_COLORS[ev.platform] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {ev.platform} · {ev.title.length > 8 ? ev.title.slice(0, 8) + '…' : ev.title}
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
            <button className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 hover:underline">
              <Plus className="w-3.5 h-3.5" /> 添加任务
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
              <Clock className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">当天无排期内容</p>
              <p className="text-xs mt-1">AI 员工将根据节日和内容策略自动提案</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {selectedEvents.map((ev, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl border ${PLATFORM_COLORS[ev.platform] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {ev.platform}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">{ev.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{ev.time}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[ev.status]}`}>
                      {ev.status === 'done' ? '已发布' : ev.status === 'pending' ? '待审核' : '已排期'}
                    </span>
                    {ev.status === 'pending' && (
                      <button className="flex items-center gap-1 text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-xl transition-colors">
                        <Check className="w-3 h-3" /> 批准
                      </button>
                    )}
                    <button className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
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

    </div>
  )
}
