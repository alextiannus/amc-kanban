'use client'

import { useEffect, useState } from 'react'
import { fetchOperationsJson } from '@/lib/brand-operations/client'
import type { getPrincipalTeam } from '@/lib/brand-operations/service'

type Team = Awaited<ReturnType<typeof getPrincipalTeam>>
export default function BrandPrincipalEditor({ brandId, principalId, disabled, onChange, onReset }: {
  brandId: string; principalId?: string; disabled: boolean
  onChange: (id: string, version: string) => void; onReset: () => void
}) {
  const endpoint = `/api/admin/brands/${encodeURIComponent(brandId)}/principal`
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    void fetchOperationsJson<Team>(endpoint, { signal: abort.signal, cache: 'no-store' }).then(data => {
      if (!abort.signal.aborted) setTeam(data)
    }).catch(e => { if (!abort.signal.aborted) setError(e.message) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [endpoint, reload])
  function refreshTeam() {
    onReset(); setLoading(true); setTeam(null); setError(''); setReload(v => v + 1)
  }
  const currentId = team?.current.length === 1 ? team.current[0].id : ''
  return <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 dark:border-blue-900 dark:bg-blue-950/20" aria-label="品牌运营主理人指派">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">品牌主理人 · 运营负责人</h3><button type="button" disabled={disabled || loading} onClick={refreshTeam} className="text-xs text-blue-600 disabled:opacity-40">刷新团队</button></div>
    <p className="text-xs text-slate-500">负责该品牌日常运营与客户问题对接。仅可从已保存的团队中选择启用的人类成员；品牌主（客户/业主）不能作为运营主理人。</p>
    <p className="text-sm">当前负责人：{loading ? '加载中…' : team ? team.current.map(p => p.nickname || p.email).join('、') || '未指派' : '暂不可用'}</p>
    <select aria-label="选择品牌主理人" value={principalId ?? currentId} disabled={loading || disabled || !team} onChange={e => { if (team) onChange(e.target.value, team.version) }} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="" disabled>选择团队成员</option>{team?.candidates.map(p => <option key={p.id} value={p.id}>{p.nickname || p.email} · {p.email}</option>)}</select>
    {team && !team.candidates.length && <p className="text-xs text-amber-700">暂无可选成员，请先在下方团队名单添加人类成员并保存品牌，再重新打开。</p>}
    <p className="text-xs text-slate-500">选择后点击底部“保存修改”确认。更换后原主理人保留为普通团队成员。</p>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </section>
}
