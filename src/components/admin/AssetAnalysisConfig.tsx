'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'

export default function AssetAnalysisConfig() {
  const { t } = useI18n()
  const [config, setConfig] = useState({ assetAnalysisEnabled: false })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void fetch('/api/admin/system-config').then(async res => { if (!res.ok) throw new Error('Unable to load configuration'); const data = await res.json(); setConfig({ assetAnalysisEnabled: !!data.assetAnalysisEnabled }) }).catch(e => setMessage(e.message)) }, [])
  return <section className="space-y-3 rounded-2xl border bg-white p-5 dark:bg-slate-900">
    <h3 className="font-semibold">{t('素材库图片分析', 'Asset image analysis')}</h3>
    <p className="text-sm text-slate-500">doubao-seed-2.1-turbo · {t('上传自动打标，人工确认归类', 'Automatic upload tagging, reviewed folder organization')}</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.assetAnalysisEnabled} onChange={e => setConfig(c => ({ ...c, assetAnalysisEnabled: e.target.checked }))} />{t('启用图片分析', 'Enable image analysis')}</label>
    <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={async () => {
      setBusy(true); setMessage('')
      try { const res = await fetch('/api/admin/system-config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setConfig({ assetAnalysisEnabled: !!data.assetAnalysisEnabled }); setMessage(t('配置已保存', 'Configuration saved')) } catch (e: any) { setMessage(e.message) } finally { setBusy(false) }
    }}>{t('保存图片分析配置', 'Save image analysis configuration')}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>
}
