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
  const [canManage, setCanManage] = useState(false)
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState('all')
  const [overageOnly, setOverageOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/amc-credit/brands', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '无法载入 AMC Credit 用量')
      setRows(payload.rows || []); setCanManage(Boolean(payload.canManage))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法载入 AMC Credit 用量')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => rows.filter(row => {
    if (query && !row.brandName.toLowerCase().includes(query.toLowerCase())) return false
    if (plan !== 'all' && row.planId !== plan) return false
    if (overageOnly && row.overage <= 0) return false
    return true
  }), [rows, query, plan, overageOnly])

  const update = async (row: CreditRow, patch: Partial<Pick<CreditRow, 'includedCredit' | 'allowOverage' | 'allowNightlyOverage'>>) => {
    setSaving(row.brandId); setError('')
    try {
      const response = await fetch('/api/amc-credit/brands', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brandId: row.brandId, cycleAllowance: patch.includedCredit, allowOverage: patch.allowOverage, allowNightlyOverage: patch.allowNightlyOverage, reason: 'AMC Credit overview update' }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '保存失败')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
    finally { setSaving(null) }
  }

  return <div className="p-4 md:p-8 space-y-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2"><Coins className="text-indigo-500" size={22}/><h1 className="text-xl font-black text-slate-900 dark:text-white">AMC Credit 用量</h1></div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">每个品牌一行查看本账期额度、使用量与超额状态。</p>
      </div>
      <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200"><RefreshCw size={15}/>刷新</button>
    </div>

    <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3"><Search size={15} className="text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索品牌" className="w-full bg-transparent py-2 text-sm outline-none"/></label>
      <label className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 text-sm"><SlidersHorizontal size={15}/><select value={plan} onChange={event => setPlan(event.target.value)} className="bg-transparent py-2 outline-none"><option value="all">全部 Package</option><option value="starter">Starter</option><option value="essential">Essential</option><option value="booster">Booster</option></select></label>
      <label className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 text-sm"><input type="checkbox" checked={overageOnly} onChange={event => setOverageOnly(event.target.checked)}/>仅看超额</label>
    </div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table className="min-w-[1100px] w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/70 text-left text-xs uppercase tracking-wide text-slate-500"><tr>
          {['品牌','Package','本期额度','已使用','已预留','剩余','超额','使用率','允许超额','账期结束'].map(label => <th key={label} className="px-4 py-3">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(row => <tr key={row.brandId} className={row.overage > 0 ? 'bg-amber-50/70 dark:bg-amber-950/10' : ''}>
            <td className="px-4 py-4 font-bold text-slate-900 dark:text-white">{row.brandName}</td>
            <td className="px-4 py-4 capitalize">{row.planId}</td>
            <td className="px-4 py-4">{canManage ? <input aria-label={`${row.brandName} 本期额度`} type="number" min={0} defaultValue={row.includedCredit} disabled={saving === row.brandId} onBlur={event => { const value = Number(event.target.value); if (!Number.isInteger(value) || value === row.includedCredit) return; if (value < row.includedCredit && !window.confirm(`确认将 ${row.brandName} 的本期额度从 ${row.includedCredit} 调低为 ${value}？`)) { event.currentTarget.value = String(row.includedCredit); return } void update(row, { includedCredit: value }) }} className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1"/> : row.includedCredit.toLocaleString()}</td>
            <td className="px-4 py-4">{row.used.toLocaleString()}</td><td className="px-4 py-4">{row.reserved.toLocaleString()}</td><td className="px-4 py-4">{row.remaining.toLocaleString()}</td>
            <td className={`px-4 py-4 font-bold ${row.overage > 0 ? 'text-amber-600' : ''}`}>{row.overage.toLocaleString()}</td>
            <td className="px-4 py-4"><div className="w-28"><div className="mb-1 flex justify-between text-xs"><span>{row.usagePercent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${row.overage > 0 ? 'bg-amber-500' : row.usagePercent >= 80 ? 'bg-orange-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, row.usagePercent)}%` }}/></div></div></td>
            <td className="px-4 py-4"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={row.allowOverage} disabled={!canManage || saving === row.brandId} onChange={event => { const next = event.target.checked; if (!next && !window.confirm(`确认关闭 ${row.brandName} 的超额使用？新的付费任务可能无法启动。`)) return; void update(row, { allowOverage: next }) }}/><span>{row.allowOverage ? '允许' : '不允许'}</span></label></td>
            <td className="px-4 py-4 whitespace-nowrap">{new Date(row.cycleEnd).toLocaleDateString('zh-CN')}</td>
          </tr>)}
          {!loading && !filtered.length && <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">没有符合条件的品牌</td></tr>}
          {loading && <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">正在载入 AMC Credit 用量…</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
}
