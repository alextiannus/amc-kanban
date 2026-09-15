'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'

/** Saves independently of caption editing. Failed saves keep publication blocked. */
export default function TiktokAigcControl({ value, readOnly, disabled, onSave, onBlockedChange }: {
  value: boolean
  readOnly: boolean
  disabled: boolean
  onSave: (value: boolean) => Promise<void>
  onBlockedChange: (blocked: boolean) => void
}) {
  const { t } = useI18n()
  const [checked, setChecked] = useState(value)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const pending = useRef(false)
  const blocked = useRef(false)
  useEffect(() => { if (!blocked.current) setChecked(value) }, [value])
  useEffect(() => () => onBlockedChange(false), [onBlockedChange])

  const save = async (next: boolean) => {
    if (pending.current || disabled || readOnly) return
    pending.current = true
    blocked.current = true
    onBlockedChange(true)
    setChecked(next)
    setSaving(true)
    setFailed(false)
    try {
      await onSave(next)
      blocked.current = false
      onBlockedChange(false)
    } catch {
      setFailed(true)
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700" data-testid="tiktok-aigc">
      <label className="flex items-center justify-between gap-3 font-medium">
        <span>{t('AI 生成的内容', 'AI-generated content')}</span>
        <span className="relative inline-flex shrink-0">
          <input type="checkbox" role="switch" checked={checked} disabled={readOnly || disabled || saving}
            onChange={(event) => void save(event.target.checked)} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
          <span aria-hidden="true" className="h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-pink-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-pink-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
        </span>
      </label>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t('开启后，发布时向 TikTok 声明该内容由 AI 生成。', 'When enabled, publishing declares to TikTok that this content is AI-generated.')}
      </p>
      {readOnly && <p className="mt-1 text-xs text-slate-500">{t('发布已开始，此设置只读。', 'Publishing has started. This setting is read-only.')}</p>}
      {saving && <p role="status" className="mt-2 text-xs">{t('正在保存…', 'Saving…')}</p>}
      {failed && <div role="alert" className="mt-2 text-xs text-red-600">
        {t('保存失败，发布已暂停。请重试；如草稿状态已变化，请刷新。', 'Save failed. Publishing is blocked. Retry, or refresh if the draft status changed.')}
        <button type="button" disabled={disabled || readOnly || saving} onClick={() => void save(checked)} className="ml-2 underline">
          {t('重试保存', 'Retry save')}
        </button>
      </div>}
    </section>
  )
}
