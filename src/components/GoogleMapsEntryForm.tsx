'use client'
import { useEffect, useState } from 'react'

export default function GoogleMapsEntryForm({ brandId, english = false }: { brandId: string; english?: boolean }) {
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const endpoint = `/api/brands/${encodeURIComponent(brandId)}/google-map`
  useEffect(() => {
    const controller = new AbortController()
    setUrl(''); setSaved(''); setMessage('')
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) return
      const data = await response.json()
      if (!controller.signal.aborted && data.brandId === brandId) { setUrl(data.mapsUrl || ''); setSaved(data.mapsUrl || '') }
    }).catch(() => undefined)
    return () => controller.abort()
  }, [endpoint, brandId])
  async function save() {
    setBusy(true); setMessage(''); setFailed(false)
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapsUrl: url }) })
      if (!response.ok) throw new Error('SAVE_FAILED')
      const data = await response.json()
      setSaved(data.mapsUrl); setUrl(data.mapsUrl)
      setMessage(english ? 'Map saved. Your activity page will show this location.' : '地图已保存，活动页将显示这家门店。')
      window.dispatchEvent(new CustomEvent('amc:brand-accounts-changed', { detail: { brandId } }))
    } catch { setFailed(true); setMessage(english ? 'Unable to save. Check the Google Maps link and try again.' : '保存失败，请检查 Google Maps 链接后重试。') }
    finally { setBusy(false) }
  }
  return <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <label htmlFor={`google-map-${brandId}`} className="block text-sm font-semibold">{english ? 'Google Maps location link' : 'Google Maps 门店链接'}</label>
    <p className="text-xs leading-5 text-slate-500">{english ? 'Paste the confirmed location’s Maps link. No social account connection is needed to display it.' : '粘贴已确认门店的 Google Maps 链接，即可展示地图入口，无需绑定 Google 账号。'}</p>
    <input id={`google-map-${brandId}`} type="url" value={url} onChange={event => setUrl(event.target.value)} disabled={busy} placeholder="https://www.google.com/maps/..." className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void save()} disabled={busy || !url.trim() || url === saved} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? (english ? 'Saving…' : '保存中…') : (english ? 'Save map link' : '保存地图入口')}</button>
      {saved && <a href={saved} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600">{english ? 'Open saved location' : '查看已保存门店'}</a>}
    </div>
    {message && <p role={failed ? 'alert' : 'status'} className={`text-xs ${failed ? 'text-red-600' : 'text-emerald-700'}`}>{message}</p>}
  </div>
}
