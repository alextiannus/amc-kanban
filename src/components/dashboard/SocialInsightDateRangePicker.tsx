'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown, X } from 'lucide-react'
import { DayPicker, TZDate, type DateRange } from '@daypicker/react'
import { zhCN } from '@daypicker/react/locale'
import '@daypicker/react/style.css'

export type SocialInsightDateRange = { from: string; to: string }

type Props = {
  value: SocialInsightDateRange
  timeZone: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (value: SocialInsightDateRange) => void
}

function parseDateOnly(value: string, timeZone: string): TZDate {
  const [year, month, day] = value.split('-').map(Number)
  return new TZDate(year, month - 1, day, timeZone)
}

function dateOnly(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function pretty(value: string) {
  const [year, month, day] = value.split('-')
  return `${year}/${month}/${day}`
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
}

export default function SocialInsightDateRangePicker({ value, timeZone, open, onOpenChange, onApply }: Props) {
  const committedRange = useMemo<DateRange>(() => ({
    from: parseDateOnly(value.from, timeZone),
    to: parseDateOnly(value.to, timeZone),
  }), [timeZone, value.from, value.to])
  const [draft, setDraft] = useState<DateRange>(committedRange)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const sync = () => setMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (open) setDraft(committedRange)
  }, [committedRange, open])

  const selectedDays = daysBetween(value.from, value.to)
  const nowInBrandZone = new TZDate(Date.now(), timeZone)
  const preset = [7, 30, 60, 90].includes(selectedDays) && value.to === dateOnly(nowInBrandZone, timeZone)
    ? `近 ${selectedDays} 天分析`
    : `${pretty(value.from)} - ${pretty(value.to)}`
  const today = nowInBrandZone

  const applyDraft = () => {
    if (!draft.from || !draft.to) return
    onApply({ from: dateOnly(draft.from, timeZone), to: dateOnly(draft.to, timeZone) })
    onOpenChange(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarDays className="h-4 w-4 text-emerald-500" />
        <span className="max-w-[180px] truncate">{preset}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="选择分析日期范围"
          className="fixed inset-x-3 top-20 z-[100] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-[690px] md:max-h-none md:overflow-visible"
        >
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">选择日期范围</p>
              <p className="mt-1 text-[11px] text-slate-400">{pretty(value.from)} 至 {pretty(value.to)} · {timeZone}</p>
            </div>
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="关闭日期选择">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3 grid grid-cols-4 gap-2">
            {[7, 30, 60, 90].map((days) => (
              <button
                type="button"
                key={days}
                onClick={() => {
                  const to = new TZDate(Date.now(), timeZone)
                  const from = new TZDate(to.getFullYear(), to.getMonth(), to.getDate() - days + 1, timeZone)
                  setDraft({ from, to })
                }}
                className="rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-emerald-950/30"
              >
                近 {days} 天
              </button>
            ))}
          </div>

          <div className="social-insight-calendar flex justify-center overflow-x-auto">
            <DayPicker
              mode="range"
              selected={draft}
              onSelect={(next) => next && setDraft(next)}
              resetOnSelect
              numberOfMonths={mobile ? 1 : 2}
              pagedNavigation={!mobile}
              defaultMonth={draft.from}
              disabled={{ after: today }}
              timeZone={timeZone}
              locale={zhCN}
              showOutsideDays
              fixedWeeks
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="text-[11px] font-medium text-slate-400">
              {draft.from ? pretty(dateOnly(draft.from, timeZone)) : '请选择开始日期'}
              {' - '}
              {draft.to ? pretty(dateOnly(draft.to, timeZone)) : '请选择结束日期'}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300">取消</button>
              <button type="button" disabled={!draft.from || !draft.to} onClick={applyDraft} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40">
                <Check className="h-3.5 w-3.5" /> 应用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
