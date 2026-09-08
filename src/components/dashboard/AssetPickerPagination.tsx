'use client'

import { useI18n } from '@/lib/i18n'

export default function AssetPickerPagination({ picker }: {
  picker: { page: number; total: number; totalPages: number; loading: boolean; error: boolean; setPage: (page: number) => void; reload: () => void }
}) {
  const { t } = useI18n()
  if (picker.loading) return <p role="status" className="py-2 text-center text-xs text-slate-500">{t('正在加载素材…', 'Loading assets…')}</p>
  if (picker.error) return (
    <div role="alert" className="flex items-center justify-center gap-2 py-2 text-xs text-rose-600">
      {t('素材加载失败', 'Failed to load assets')}
      <button type="button" onClick={picker.reload} className="font-bold underline">{t('重试', 'Retry')}</button>
    </div>
  )
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500">
      <span>{t(`共 ${picker.total} 个 · 第 ${picker.page}/${picker.totalPages} 页`, `${picker.total} assets · Page ${picker.page}/${picker.totalPages}`)}</span>
      <div className="flex gap-2">
        <button type="button" disabled={picker.page <= 1} onClick={() => picker.setPage(picker.page - 1)} className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">{t('上一页', 'Previous')}</button>
        <button type="button" disabled={picker.page >= picker.totalPages} onClick={() => picker.setPage(picker.page + 1)} className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">{t('下一页', 'Next')}</button>
      </div>
    </div>
  )
}
