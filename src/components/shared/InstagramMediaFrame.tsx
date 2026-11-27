'use client'

import { useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'

const ratios = [
  { label: '4:5', width: 4, height: 5 },
  { label: '9:16', width: 9, height: 16 },
  { label: '1:1', width: 1, height: 1 },
] as const

export default function InstagramMediaFrame({ children, maxHeight }: { children: ReactNode; maxHeight: string }) {
  const { t } = useI18n()
  const [ratio, setRatio] = useState<(typeof ratios)[number]>(ratios[0])

  return (
    <div data-instagram-preview className="w-full min-w-0">
      <label className="flex flex-wrap items-center justify-center gap-2 px-2 pb-2 text-xs font-medium">
        {t('预览比例', 'Preview ratio')}
        <select
          value={ratio.label}
          onChange={event => setRatio(ratios.find(item => item.label === event.target.value) ?? ratios[0])}
          className="min-h-9 rounded-md border border-slate-400 bg-white px-2 text-sm text-slate-900"
        >
          {ratios.map(({ label }) => <option key={label}>{label}</option>)}
        </select>
      </label>
      <div
        data-preview-ratio={ratio.label}
        className="relative mx-auto overflow-hidden bg-black"
        style={{
          width: `min(100%, calc(${maxHeight} * ${ratio.width / ratio.height}))`,
          aspectRatio: `${ratio.width} / ${ratio.height}`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
