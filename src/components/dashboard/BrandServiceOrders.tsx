'use client'
import { useEffect, useRef, useState } from 'react'
type Catalog = { id: string; name: string; price: number; pricing: string; currency: string }
export default function BrandServiceOrders({ brandId }: { brandId: string }) {
 const [data,setData] = useState<any>(null), [open,setOpen] = useState(false), [error,setError] = useState(''), [busy,setBusy] = useState(false)
 const [service,setService] = useState(''), [quantity,setQuantity] = useState(1), [months,setMonths] = useState(1), [delivery,setDelivery] = useState('')
 const pending = useRef<{ key: string; body: any } | null>(null)
 const storageKey = 'amc-service-order-pending:' + brandId
 async function load() {
  const r = await fetch(`/api/brands/${brandId}/orders`,{cache:'no-store'})
  if (r.status === 403) return
  const d = await r.json(); if (!r.ok) throw new Error(d.error || '同步状态读取失败')
  setData(d); setService(current => current || d.catalog?.[0]?.id || '')
 }
 useEffect(() => {
  pending.current = null; setData(null); setError('')
  try { const saved = sessionStorage.getItem(storageKey); if(saved) pending.current = JSON.parse(saved) } catch {}
  void load().catch(e => setError(e.message))
  const timer = setInterval(() => { void load().catch(e => setError(e.message)) },30000)
  return () => clearInterval(timer)
 },[brandId]) // eslint-disable-line react-hooks/exhaustive-deps
 const selected: Catalog | undefined = data?.catalog?.find((s: Catalog) => s.id === service)
 async function submit() {
  setBusy(true); setError('')
  try {
   if (!pending.current) pending.current = { key: crypto.randomUUID(), body: { items: [{ serviceId: service, quantity, months }], deliveryDate: delivery } }
   sessionStorage.setItem(storageKey,JSON.stringify(pending.current))
   const r = await fetch(`/api/brands/${brandId}/orders`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':pending.current.key},body:JSON.stringify(pending.current.body)})
   const result = await r.json()
   if (!r.ok) {
    if (r.status === 400 || r.status === 403 || r.status === 404) { pending.current=null; sessionStorage.removeItem(storageKey) }
    throw new Error(result.error || '提交结果待确认，请重试原订单')
   }
   pending.current=null; sessionStorage.removeItem(storageKey); await load(); setOpen(false)
  } catch(e) { setError(e instanceof Error ? e.message : '提交失败') } finally { setBusy(false) }
 }
 if (!data) return error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null
 const label = (row: any) => row.status==='SYNCED' ? '已同步' : row.status==='FAILED' ? '待处理（自动重试）' : '等待同步'
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:bg-slate-900 dark:border-slate-700">
  <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">订单与 ERP 同步</h3><p className="text-xs text-slate-500">销售人员默认为品牌主理人。服务订单提交后进入 Immedi Today 审核流程。</p></div><button onClick={()=>setOpen(!open)} disabled={!data.enabled} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-40">提交服务订单</button></div>
  {!data.enabled && <p className="mt-2 text-amber-700 text-sm">ERP 对接尚未启用</p>}
  <p className="mt-3 text-sm">主理人归属与激励：{label(data.assignment)}{data.assignment.error && <span className="ml-2 text-amber-700">{data.assignment.error}</span>}</p>
  {open && <div className="my-4 space-y-3 rounded-xl border p-4">
   {pending.current ? <p className="text-sm">上次提交结果待确认，将重试原订单，避免重复下单。</p> : <>
    <label className="block text-sm">服务<select value={service} onChange={e=>setService(e.target.value)} className="ml-2 rounded border p-2">{data.catalog.map((s: Catalog)=><option key={s.id} value={s.id}>{s.name} · SGD {s.price}{s.pricing==='monthly'?'/月':''}</option>)}</select></label>
    <label className="block text-sm">数量<input aria-label="服务数量" type="number" min="1" max="100" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} className="ml-2 w-24 rounded border p-2" /></label>
    {selected?.pricing==='monthly' && <label className="block text-sm">月数<input aria-label="服务月数" type="number" min="1" max="36" value={months} onChange={e=>setMonths(Number(e.target.value))} className="ml-2 w-24 rounded border p-2" /></label>}
    <label className="block text-sm">交付日期<input aria-label="交付日期" type="date" value={delivery} onChange={e=>setDelivery(e.target.value)} className="ml-2 rounded border p-2" /></label>
    <p className="text-sm">服务金额：SGD {((selected?.price||0)*quantity*(selected?.pricing==='monthly'?months:1)).toFixed(2)}，税费按 ERP 适用规则计算。</p>
   </>}
   <button disabled={busy} onClick={()=>void submit()} className="rounded-lg bg-emerald-600 px-3 py-2 text-white disabled:opacity-40">{busy?'提交中…':pending.current?'核对并重试原订单':'确认提交订单'}</button>
  </div>}
  {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  <ul className="mt-3 space-y-2 text-sm">{data.subscriptions.slice(0,4).map((s:any)=><li key={s.id}>{s.planName}：{s.eligible?label(s):'未确认付款或已豁免'} {s.erpReference||''}{s.error&&s.eligible&&<p className="text-amber-700">{s.error}</p>}</li>)}
  {data.orders.slice(0,8).map((o:any)=><li key={o.id}>服务订单 · {o.currency} {o.amount} · {label(o)} {o.erpReference||''}{o.error&&<p className="text-amber-700">{o.error}</p>}</li>)}</ul>
 </section>
}
