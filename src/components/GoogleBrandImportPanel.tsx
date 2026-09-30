'use client'
import React, { useEffect, useState } from 'react'

type ImportResult = { source: string; observedAt: string; fieldsAdded: string[]; skuAdded: number; skuCount: number; skuNames?: string[]; missing: string[]; reviewSummary?: { sampleSize: number; totalReviewCount: number | null; averageRating: number | null; distribution: number[]; from: string | null; to: string | null; truncated: boolean; themes: { topic: string; mentions: number }[]; productMentions: {name: string; mentions: number}[] } | null }
type Receipt = { brandId: string; status: string; lastError?: string | null; result?: ImportResult | null }
type Location = { id: string; accountId: string; name: string; address: string }
const explanations: Record<string, [string, string]> = {
  GOOGLE_OAUTH_REQUIRED: ['需要连接 Google 商家授权', 'Connect Google Business authorization'],
  GOOGLE_OAUTH_REQUIRED_FOR_MENU_AND_REVIEWS: ['已读取绑定门店信息；菜单与评价需要 Google 商家读取授权。', 'Bound location information read. Menus and reviews require Google Business read authorization.'],
  GOOGLE_AUTHORIZATION_FAILED: ['Google 授权已失效或权限不足，请重新连接。', 'Google authorization expired or is unavailable. Reconnect the account.'],
  GOOGLE_LOCATION_SELECTION_REQUIRED: ['请选择此品牌对应的 Google 门店。', 'Select the Google location for this brand.'],
  GOOGLE_ACCOUNT_SELECTION_REQUIRED: ['此品牌绑定了多个 Google 账号，请在账号设置中明确绑定。', 'Multiple Google accounts are bound. Choose the intended binding in account settings.'],
  GOOGLE_BOUND_ACCOUNT_READ_FAILED: ['暂时无法读取已绑定账号，请检查账号连接后重试。', 'Unable to read the bound account. Check its connection and retry.'],
  MENU_NOT_AVAILABLE_OR_NOT_AUTHORIZED: ['Google 未开放该门店菜单，或当前授权不支持读取。', 'Google menu data is unavailable for this location or authorization.'],
  MENU_READ_UNAVAILABLE: ['菜单读取失败，可重试。', 'Menu retrieval failed. Retry is available.'],
  NO_VERIFIED_SKU_RETURNED: ['没有取得商家维护的菜单或 SKU；不会从评价推测商品。', 'No merchant-maintained menu or SKUs returned. Products are not inferred from reviews.'],
  REVIEWS_READ_UNAVAILABLE: ['当前无法读取顾客评价。', 'Customer reviews are currently unavailable.'],
}
export default function GoogleBrandImportPanel({ brandId, english = false }: { brandId: string; english?: boolean }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [selected, setSelected] = useState('')
  const tr = (zh: string, en: string) => english ? en : zh
  const explain = (code: string) => explanations[code]?.[english ? 1 : 0] || tr('同步暂未完成，请检查配置后重试。', 'Sync is not complete. Check configuration and retry.')
  const endpoint = `/api/brands/${encodeURIComponent(brandId)}/google-import`
  useEffect(() => {
    const abort = new AbortController()
    setReceipt(null); setLocations([]); setSelected(''); setError(''); setBusy(false)
    const read = async () => {
      try { const r = await fetch(endpoint, { signal: abort.signal, cache: 'no-store' }); if (!r.ok) return; const v = await r.json(); if (!abort.signal.aborted && v.brandId === brandId) setReceipt(v) } catch { /* next poll retries */ }
    }
    void read()
    const timer = setInterval(() => void read(), 5000)
    return () => { abort.abort(); clearInterval(timer) }
  }, [endpoint, brandId])
  const current = receipt?.brandId === brandId ? receipt : null
  const result = current?.result
  const review = result?.reviewSummary
  const summary = review && Array.isArray(review.distribution) && Array.isArray(review.themes) && Array.isArray(review.productMentions) ? review : null
  async function submit(choose = false) {
    setBusy(true); setError('')
    try {
      const location = choose ? locations.find(l => `${l.accountId}/${l.id}` === selected) : null
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(location ? { accountId: location.accountId, locationId: location.id } : {}) })
      const v = await r.json(); if (!r.ok) throw new Error(v.error)
      setReceipt({ brandId, status: 'PENDING' })
    } catch (e) { setError(explain(e instanceof Error ? e.message : '')) } finally { setBusy(false) }
  }
  async function loadLocations() {
    setBusy(true); setError('')
    try { const r = await fetch(`${endpoint}?locations=1`); const v = await r.json(); if (!r.ok) throw new Error(v.error); setLocations(v.locations || []); if (!v.locations?.length) setError(tr('此授权没有可用门店。', 'No locations are available under this authorization.')) }
    catch (e) { setError(explain(e instanceof Error ? e.message : '')) } finally { setBusy(false) }
  }
  const status = ({ PENDING: tr('等待同步', 'Queued'), RUNNING: tr('正在补充资料', 'Enriching profile'), COMPLETE: tr('已同步', 'Synced'), PARTIAL: tr('已补充可获取资料', 'Available information imported'), NEEDS_ATTENTION: tr('需要检查配置', 'Check configuration'), NOT_STARTED: tr('配置账号后自动同步', 'Syncs automatically after account setup') } as Record<string, string>)[current?.status || 'NOT_STARTED']
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" aria-label="Google business information">
    <h3 className="font-bold text-sm">{tr('Google 商家资料', 'Google business information')}</h3>
    <p className="text-xs">{tr('连接 Google 商家账号后，自动补充门店、菜单和顾客反馈。保留已有资料。', 'After connecting Google Business, location data, menus and customer feedback are imported automatically. Existing information is preserved.')}</p>
    <p role="status" className="text-xs font-semibold">{status}</p>
    {current?.lastError && <p className="text-xs">{explain(current.lastError)}</p>}
    {result && <div className="text-xs space-y-2">
      <p>{tr('资料来源', 'Source')}: {result.source === 'google_business_profile' ? 'Google Business Profile' : 'PostFast · Google'} · {new Date(result.observedAt).toLocaleString()}</p>
      <p>{tr('新增 SKU', 'New SKUs')}: {result.skuAdded} · {tr('当前目录', 'Current catalog')}: {result.skuCount}</p>
      <p>{tr('本次补充字段', 'Fields added')}: {result.fieldsAdded.length ? result.fieldsAdded.map(f => ({ address: tr('地址', 'Address'), phone: tr('电话', 'Phone'), website: tr('网站', 'Website'), description: tr('商家介绍', 'Business description'), googlePlaceId: tr('Google 门店标识', 'Google location'), googleLocationName: tr('Google 门店名称', 'Google location name'), googleBusinessUrl: tr('Google 商家主页', 'Google business page'), menuItems: tr('菜单', 'Menu'), businessHours: tr('营业时间', 'Opening hours') } as Record<string, string>)[f] || f).join(', ') : tr('无新增，保留已有资料', 'No additions; existing data preserved')}</p>
      {!!result.skuNames?.length && <details><summary>{tr('查看商品目录', 'View product catalog')}</summary><ul className="list-disc pl-4">{result.skuNames.map(name => <li key={name}>{name}</li>)}</ul></details>}
      {summary && <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800 space-y-1">
        <h4 className="font-semibold">{tr('顾客评价摘要', 'Customer review summary')}</h4>
        <p>{tr('本次样本', 'Sample')}: {summary.sampleSize} / {summary.totalReviewCount ?? '—'} · {tr('平均评分', 'Average rating')}: {summary.averageRating ?? '—'}</p>
        <p>{tr('评分分布（1–5 星）', 'Rating distribution (1–5 stars)')}: {summary.distribution.join(' / ')}</p>
        {summary.from && <p>{summary.from.slice(0, 10)} – {summary.to?.slice(0, 10)}</p>}
        {summary.themes.map(t => <p key={t.topic}>{({ food: tr('菜品口味', 'Food'), service: tr('服务', 'Service'), value: tr('价格', 'Value'), waiting: tr('等候', 'Waiting'), environment: tr('环境', 'Environment') } as Record<string, string>)[t.topic]}: {t.mentions} {tr('次提及', 'mentions')}</p>)}
        {summary.productMentions.map(p => <p key={p.name}>{p.name}: {p.mentions} {tr('次提及', 'mentions')}</p>)}
        <p>{tr('统计最近最多 50 条评价；提及不代表赞扬，不作为商家承诺。', 'Based on up to 50 recent reviews. Mentions do not imply praise or merchant promises.')}</p>
      </div>}
      {result.missing.map(code => <p key={code}>{explain(code)}</p>)}
    </div>}
    <div className="flex gap-2 flex-wrap">
      <button type="button" disabled={busy || current?.status === 'RUNNING' || current?.status === 'PENDING'} onClick={() => void submit()} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-xs disabled:opacity-50">{tr('重新同步', 'Sync again')}</button>
      <button type="button" disabled={busy} onClick={() => void loadLocations()} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">{tr('选择授权门店', 'Choose authorized location')}</button>
    </div>
    {locations.length > 0 && <div className="flex flex-col gap-2">
      <select aria-label={tr('授权门店', 'Authorized location')} value={selected} onChange={e => setSelected(e.target.value)} className="w-full border rounded-lg p-2 bg-transparent text-xs"><option value="">{tr('请选择此品牌的门店', 'Choose this brand’s location')}</option>{locations.map(l => <option key={`${l.accountId}/${l.id}`} value={`${l.accountId}/${l.id}`}>{l.name} · {l.address}</option>)}</select>
      <button type="button" disabled={busy || !selected} onClick={() => void submit(true)} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">{tr('绑定并自动补充', 'Bind and import')}</button>
    </div>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </section>
}
