'use client'

import { useState } from 'react'
import { Film, Image, Video } from 'lucide-react'
import { SHORT_VIDEO_LIMIT, shortVideoDurationOutsideRange, type MediaPickerFilter } from '@/lib/shortVideoCarousel'

type MediaType = 'image' | 'video' | 'shortVideos'

export function DraftMediaType({ filter, shortVideos, disabled, english, onChange }: {
  filter: MediaPickerFilter; shortVideos: boolean; disabled?: boolean; english: boolean
  onChange: (type: MediaType) => void
}) {
  const choices = [
    { type: 'image', Icon: Image, label: english ? 'Photos' : '图片' },
    { type: 'video', Icon: Video, label: english ? 'Video' : '视频' },
    { type: 'shortVideos', Icon: Film, label: english ? 'Multi-clip video (Live)' : '多段视频（Live 视频图）' },
  ] as const
  return <div role="group" aria-label={english ? 'Media type' : '媒体类型'} className="flex flex-wrap gap-2">
    {choices.map(({ type, Icon, label }) => {
      const active = (shortVideos ? 'shortVideos' : filter) === type
      return <button key={type} type="button" aria-pressed={active} disabled={disabled} onClick={() => onChange(type)}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50 ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700'}`}>
        <Icon size={15} aria-hidden="true" />{label}
      </button>
    })}
  </div>
}

export function ShortVideoSummary({ count, english }: { count: number; english: boolean }) {
  return <p role="status" className="text-xs text-slate-600 dark:text-slate-300">
    {english
      ? `${count}/${SHORT_VIDEO_LIMIT} selected · Instagram carousel · 3–5 seconds recommended per clip`
      : `已选 ${count}/${SHORT_VIDEO_LIMIT} · Instagram 轮播 · 建议每段 3–5 秒`}
  </p>
}

export function useShortVideoDurations() {
  const [durations, setDurations] = useState<Record<string, number>>({})
  function recordDuration(url: string, seconds: number) {
    if (Number.isFinite(seconds)) setDurations(current => current[url] === seconds ? current : { ...current, [url]: seconds })
  }
  return { durations, recordDuration }
}

export function ShortVideoClipLabel({ index, seconds, english }: { index: number; seconds?: number; english: boolean }) {
  const warning = shortVideoDurationOutsideRange(seconds)
  return <span className={`block text-xs ${warning ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}`}>
    {english ? `Clip ${index + 1}` : `第 ${index + 1} 段`}{typeof seconds === 'number' && ` · ${Number(seconds.toFixed(2))}${english ? 's' : ' 秒'}`}
    {warning && (english ? ' · Recommended 3–5s' : ' · 建议 3–5 秒')}
  </span>
}
