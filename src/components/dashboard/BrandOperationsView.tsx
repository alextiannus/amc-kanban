'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Search, Send, Store, X } from 'lucide-react'
import { fetchOperationsJson, OperationsRequestError } from '@/lib/brand-operations/client'
import { useI18n } from '@/lib/i18n'
import type { listOperations } from '@/lib/brand-operations/service'

type Data = Awaited<ReturnType<typeof listOperations>>
type Row = Data['rows'][number]
const statuses: Record<string, [string, string]> = {
  ACTIVE: ['生效中', 'Active'], PENDING: ['待激活', 'Pending'], EXPIRED: ['已到期', 'Expired'],
  CANCELLED: ['已取消', 'Cancelled'], FAILED: ['失败', 'Failed'], UPCOMING: ['未开始', 'Upcoming'],
}
function AssignmentDialog({ row, candidates, onClose, onSaved, en }: {
  row: Row; candidates: Data['candidates']; onClose: () => void; onSaved: () => void; en: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  const options = candidates.filter(p => !row.owners.some(o => o.id === p.id))
  const save = async () => {
    if (!selected || saving) return
    setSaving(true); setError('')
    try {
      await fetchOperationsJson(`/api/brand-operations/${encodeURIComponent(row.id)}/principal`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ principalId: selected, expectedVersion: row.assignmentVersion }),
      }, { en })
      onSaved()
    } catch (e) {
      setConflict(e instanceof OperationsRequestError && e.refreshBeforeWrite)
      setError(e instanceof Error ? e.message : (en ? 'Network error. Refresh before retrying.' : '网络错误，请刷新确认状态后重试'))
    }
    finally { setSaving(false) }
  }
  return <dialog ref={dialog} onCancel={e => { if (saving) e.preventDefault(); else onClose() }} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white" aria-labelledby="assignment-title">
    <div className="flex items-center justify-between gap-4"><h2 id="assignment-title" className="text-lg font-bold">{en ? 'Change brand principal' : '更换品牌主理人'}</h2><button aria-label={en ? 'Close' : '关闭'} disabled={saving} onClick={onClose}><X size={20} /></button></div>
    <p className="mt-4 font-semibold">{row.name}</p>
    <p className="mt-2 text-sm text-slate-500">{en ? 'Current: ' : '当前主理人：'}{row.principals.map(p => p.nickname || p.email).join('、') || (en ? 'Unassigned' : '未分配')}</p>
    <label className="mt-5 block text-sm font-medium" htmlFor="principal-select">{en ? 'New principal' : '新主理人'}</label>
    <select id="principal-select" className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent p-3 dark:border-slate-600" value={selected} disabled={saving || conflict} onChange={e => setSelected(e.target.value)}>
      <option value="">{en ? 'Select a principal' : '请选择主理人'}</option>
      {options.map(p => <option key={p.id} value={p.id}>{p.nickname || p.email} · {p.email}</option>)}
    </select>
    {!options.length && <p className="mt-2 text-sm text-amber-700">{en ? 'No eligible active principals. Configure user roles first.' : '没有可选的启用主理人，请先在用户管理配置角色。'}</p>}
    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{en ? 'Saving replaces all current principal assignments and revokes their direct principal access. Owner, other member and inherited access remain unchanged.' : '保存后将替换全部现任主理人，并撤销其直接主理人授权。品牌主、其他成员和独立继承权限保持不变。'}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    <div className="mt-6 flex justify-end gap-3">
      <button disabled={saving} className="rounded-lg border px-4 py-2 text-sm" onClick={onClose}>{en ? 'Cancel' : '取消'}</button>
      {conflict ? <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={onSaved}>{en ? 'Refresh list' : '刷新列表'}</button> : <button disabled={!selected || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={() => void save()}>{saving ? (en ? 'Saving…' : '保存中…') : (en ? 'Save assignment' : '保存变更')}</button>}
    </div>
  </dialog>
}

export default function BrandOperationsView() {
  const { language } = useI18n()
  const en = language === 'en'
  const t = (zh: string, english: string) => en ? english : zh
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [principal, setPrincipal] = useState('')
  const [principalOptions, setPrincipalOptions] = useState<Data['principalOptions']>([])
  const [sort, setSort] = useState('expiry')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<Row | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ q, status, principalId: principal, sort, page: String(page) })
        const body = await fetchOperationsJson<Data>(`/api/brand-operations?${params}`, { signal: abort.signal, cache: 'no-store' }, { en })
        if (abort.signal.aborted) return
        setData(body)
        setPrincipalOptions(previous => {
          const selected = previous.find(p => p.id === principal)
          return selected && !body.principalOptions.some(p => p.id === principal) ? [...body.principalOptions, selected] : body.principalOptions
        })
      } catch (e) { if (!abort.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : 'Unable to load brand operations') } }
      finally { if (!abort.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); abort.abort() }
  }, [q, status, principal, sort, page, refresh, en])
  const date = (value: Date | string | null | undefined, withTime = false) => value ? new Intl.DateTimeFormat(en ? 'en-SG' : 'zh-CN', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(new Date(value)) : t('未设置', 'Not set')
  const selectClass = 'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900'
  return <section className="h-full overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950 md:p-8">
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold tracking-widest text-blue-600">{t('主理人工作区', 'PRINCIPAL WORKSPACE')}</p><h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{t('品牌运营看板', 'Brand Operations')}</h1><p className="mt-2 text-sm text-slate-500">{t('跟进订阅、品牌负责人和本月发布进度', 'Track subscriptions, brand ownership and monthly publishing.')}</p></div>
        <button onClick={() => setRefresh(v => v + 1)} disabled={loading} className={`${selectClass} inline-flex items-center gap-2 disabled:opacity-50`}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{t('刷新', 'Refresh')}</button>
      </header>
      {data && !error && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { title: t('订阅品牌', 'Subscribed brands'), value: data.summary.brands, icon: Store },
          { title: t('生效中', 'Active subscriptions'), value: data.summary.active, icon: CheckCircle2 },
          { title: t('30 天内到期', 'Expiring in 30 days'), value: data.summary.expiring, icon: CalendarClock },
          { title: t('本月发布次数', 'Published this month'), value: data.summary.monthlyPublished, icon: Send },
        ].map(card => <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-2 text-sm text-slate-500"><span>{card.title}</span><card.icon size={17} /></div><p className="mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{card.value.toLocaleString()}</p></div>)}
      </div>}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <label className="relative min-w-56 flex-1"><span className="sr-only">{t('搜索品牌或负责人', 'Search brands or people')}</span><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input className={`${selectClass} w-full pl-9`} placeholder={t('搜索品牌、位置、品牌主或主理人', 'Search brand, location or people')} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} /></label>
          <select aria-label={t('订阅状态', 'Subscription status')} className={selectClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">{t('全部订阅状态', 'All statuses')}</option>{Object.entries(statuses).map(([key, labels]) => <option key={key} value={key}>{labels[en ? 1 : 0]}</option>)}</select>
          <select aria-label={t('主理人筛选', 'Filter principal')} className={selectClass} value={principal} onChange={e => { setPrincipal(e.target.value); setPage(1) }}><option value="">{t('全部主理人', 'All principals')}</option><option value="unassigned">{t('未分配', 'Unassigned')}</option>{principalOptions.map(p => <option value={p.id} key={p.id}>{p.nickname || p.email}</option>)}</select>
          <select aria-label={t('排序', 'Sort')} className={selectClass} value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}><option value="expiry">{t('合约到期：由近到远', 'Contract expiry: earliest first')}</option><option value="published">{t('本月发布：由多到少', 'Monthly posts: most first')}</option><option value="name">{t('品牌名称', 'Brand name')}</option></select>
        </div>
        {error ? <div role="alert" className="p-12 text-center"><p className="text-red-600">{error}</p><button onClick={() => setRefresh(v => v + 1)} className="mt-4 text-blue-600">{t('重试', 'Try again')}</button></div> : loading ? <div role="status" className="p-16 text-center text-slate-500">{t('正在加载品牌运营数据…', 'Loading brand operations…')}</div> : !data?.rows.length ? <div className="p-16 text-center text-slate-500">{t('没有符合条件的订阅品牌', 'No subscribed brands match these filters')}</div> : <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950/40"><tr>{[t('品牌', 'Brand'), t('订阅套餐', 'Subscription'), t('合约结束时间', 'Contract end'), t('品牌主', 'Brand owner'), t('品牌主理人', 'Principal'), t('本月发布次数', 'Monthly posts'), t('最近发布', 'Last published')].map(label => <th scope="col" className="px-5 py-4 font-medium" key={label}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.rows.map(row => <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
              <td className="max-w-64 px-5 py-5"><p className="font-semibold text-slate-900 dark:text-white">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.location || '—'}{row.status === 'PAUSED' ? t(' · 已暂停', ' · Paused') : ''}</p></td>
              <td className="px-5 py-5"><p className="font-medium">{row.subscription.planName}</p><span className={`mt-2 inline-block rounded-md px-2 py-1 text-xs ${row.subscription.effectiveStatus === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>{statuses[row.subscription.effectiveStatus]?.[en ? 1 : 0] || row.subscription.effectiveStatus}</span>{row.subscription.feeWaived && <span className="ml-2 text-xs text-slate-500">{t('费用豁免', 'Fee waived')}</span>}</td>
              <td className="whitespace-nowrap px-5 py-5"><p className={row.subscription.effectiveStatus === 'EXPIRED' ? 'text-red-600' : ''}>{date(row.subscription.contractEndDate)}</p><p className="mt-1 text-xs text-slate-400">{t('开始：', 'From: ')}{date(row.subscription.contractStartDate)}</p></td>
              <td className="px-5 py-5">{row.owners.length ? row.owners.map(p => <div key={p.id} className="py-1"><p>{p.nickname || p.email}</p>{p.nickname && <p className="text-xs text-slate-400">{p.email}</p>}</div>) : <span className="text-slate-400">{t('未设置', 'Not set')}</span>}</td>
              <td className="px-5 py-5">{row.principals.length ? row.principals.map(p => <p key={p.id} title={p.email}>{p.nickname || p.email}</p>) : <span className="text-amber-700">{t('未分配', 'Unassigned')}</span>}{data.canManage && <button className="mt-2 block text-xs font-medium text-blue-600 hover:underline" onClick={() => setEditing(row)} aria-label={`${t('更换主理人：', 'Change principal: ')}${row.name}`}>{t('更换主理人', 'Change principal')}</button>}</td>
              <td className="px-5 py-5"><span className={`text-xl font-semibold tabular-nums ${row.monthlyPublished ? 'text-slate-900 dark:text-white' : 'text-amber-600'}`}>{row.monthlyPublished}</span></td>
              <td className="whitespace-nowrap px-5 py-5 text-xs text-slate-500">{row.lastPublishedAt ? date(row.lastPublishedAt, true) : t('暂无发布', 'No posts yet')}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {data && !loading && !error && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 dark:border-slate-800"><span>{t(`共 ${data.total} 个品牌 · 第 ${data.page} / ${Math.max(1, Math.ceil(data.total / data.pageSize))} 页`, `${data.total} brands · Page ${data.page} / ${Math.max(1, Math.ceil(data.total / data.pageSize))}`)}</span><div className="flex gap-2"><button aria-label={t('上一页', 'Previous page')} className="rounded-lg border p-2 disabled:opacity-30" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={16} /></button><button aria-label={t('下一页', 'Next page')} className="rounded-lg border p-2 disabled:opacity-30" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}><ChevronRight size={16} /></button></div></footer>}
      </div>
      <p className="text-xs leading-6 text-slate-500">{data ? `${date(data.period.start)} — ${date(data.period.end, true)} · Asia/Singapore。` : ''}{t('本月发布次数按成功发布记录统计；各平台独立记录分别计数，含人工补录。排期、失败和草稿编辑不计入。汇总卡片显示当前授权范围内全部订阅品牌，筛选仅影响列表。', 'Counts successful publication records, including manually recorded posts. Separate platform records count separately. Scheduled, failed and edited drafts are excluded. Summary cards cover all accessible subscribed brands; filters apply to the list.')}</p>
    </div>
    {editing && data && <AssignmentDialog key={editing.id} row={editing} candidates={data.candidates} en={en} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefresh(v => v + 1) }} />}
  </section>
}
