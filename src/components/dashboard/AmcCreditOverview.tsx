'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Coins, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'

type CreditRow = {
  brandId: string
  brandName: string
  planId: string
  includedCredit: number
  used: number
  reserved: number
  remaining: number
  overage: number
  usagePercent: number
  allowOverage: boolean
  allowNightlyOverage: boolean
  cycleEnd: string
}

export default function AmcCreditOverview() {
  const [rows, setRows] = useState<CreditRow[]>([])
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/amc-credit/brands', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '无法载入 AMC Credit 用量')
      setRows(payload.rows || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法载入 AMC Credit 用量')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => rows.filter(row => {
    if (query && !row.brandName.toLowerCase().includes(query.toLowerCase())) return false
    if (plan !== 'all' && row.planId !== plan) return false
    return true
  }), [rows, query, plan])

  return <div className="p-4 md:p-8 space-y-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2"><Coins className="text-indigo-500" size={22}/><h1 className="text-xl font-black text-slate-900 dark:text-white">AMC Credit 用量</h1></div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">所有品牌额度不限，仅记录本账期实际消耗及待结算预留。</p>
      </div>
      <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200"><RefreshCw size={15}/>刷新</button>
    </div>

    <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3"><Search size={15} className="text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索品牌" className="w-full bg-transparent py-2 text-sm outline-none"/></label>
      <label className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 text-sm"><SlidersHorizontal size={15}/><select value={plan} onChange={event => setPlan(event.target.value)} className="bg-transparent py-2 outline-none"><option value="all">全部 Package</option><option value="starter">Starter</option><option value="essential">Essential</option><option value="booster">Booster</option></select></label>
    </div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table className="min-w-[1100px] w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase tracking-wide text-slate-500"><tr>
          {['品牌','Package','额度政策','已使用','待结算预留','账期结束'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(row => <tr key={row.brandId} >
            <td className="px-4 py-4 font-bold text-slate-900 dark:text-white">{row.brandName}</td>
            <td className="px-4 py-4 capitalize">{row.planId}</td>
            <td className="px-4 py-4">不限额度</td>
            <td className="px-4 py-4">{row.used.toLocaleString()}</td>
            <td className="px-4 py-4">{row.reserved.toLocaleString()}</td>
            <td className="px-4 py-4 whitespace-nowrap">{new Date(row.cycleEnd).toLocaleDateString('zh-CN')}</td>
          </tr>)}
          {!loading && !filtered.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">没有符合条件的品牌</td></tr>}
          {loading && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">正在载入 AMC Credit 用量…</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
}
