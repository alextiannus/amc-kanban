'use client'

import { useEffect, useState } from 'react'

type Entitlements = {
  store_limit: number
  subscription_store_limit: number
  manual_store_limit: number | null
  configured_store_count: number
}

export default function StoreEntitlementsEditor({ brandId }: { brandId: string }) {
  const [data, setData] = useState<Entitlements | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const endpoint = `/api/admin/brands/${brandId}/store-entitlements`

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    setNotice('')
    fetch(endpoint, { signal: controller.signal }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '读取门店额度失败')
      setData(result)
      setDraft(result.manual_store_limit === null ? '' : String(result.manual_store_limit))
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [endpoint, reload])

  async function save(value: number | null) {
    setError('')
    setNotice('')
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 2147483647)) {
      setError('请输入正整数门店总数')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manualStoreLimit: value }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '保存门店额度失败')
      setData(result)
      setDraft(result.manual_store_limit === null ? '' : String(result.manual_store_limit))
      setNotice(`已保存，当前支持 ${result.store_limit} 家门店`)
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存门店额度失败')
    } finally { setSaving(false) }
  }

  return <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="门店额度">
    <h3 className="text-sm font-bold">门店额度</h3>
    {data ? <>
      <p className="text-xs text-slate-500">已有 {data.configured_store_count} 家 · 订阅支持 {data.subscription_store_limit} 家 · 管理员授权 {data.manual_store_limit === null ? '未设置' : `${data.manual_store_limit} 家`} · 当前可用 {data.store_limit} 家</p>
      <label className="block text-xs">管理员授权总门店数
        <input aria-label="管理员授权总门店数" type="number" min={1} max={2147483647} step={1} value={draft} disabled={saving}
          onChange={event => setDraft(event.target.value)} placeholder="例如：3 表示总共支持 3 家"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" />
      </label>
      <p className="text-xs text-slate-500">独立保存，不改变订阅费用；已购买的更高门店额度继续有效。</p>
      {data.configured_store_count > data.store_limit && <p className="text-xs text-amber-600">已有门店超出当前额度，可以修改或减少，新增前需增加额度。</p>}
      <div className="flex gap-3">
        <button type="button" disabled={saving || !draft.trim()} onClick={() => save(Number(draft))} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50">{saving ? '保存中…' : '保存门店额度'}</button>
        <button type="button" disabled={saving || data.manual_store_limit === null} onClick={() => save(null)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">清除授权，恢复订阅额度</button>
      </div>
    </> : !error && <p className="text-xs">正在读取门店额度…</p>}
    {error && <p role="alert" className="text-xs text-red-600">{error} {!data && <button type="button" onClick={() => setReload(n => n + 1)}>重试</button>}</p>}
    {notice && <p role="status" className="text-xs text-emerald-600">{notice}</p>}
  </section>
}
