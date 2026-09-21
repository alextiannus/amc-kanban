'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Search, Send, Store } from 'lucide-react'
import { fetchOperationsJson } from '@/lib/brand-operations/client'
import { countryLabel } from '@/lib/brand-operations/country'
import { useI18n } from '@/lib/i18n'
import type { listOperations } from '@/lib/brand-operations/service'

type Data = Awaited<ReturnType<typeof listOperations>>
const statuses: Record<string, [string, string]> = {
  ACTIVE: ['生效中', 'Active'], PENDING: ['待激活', 'Pending'], EXPIRED: ['已到期', 'Expired'],
  CANCELLED: ['已取消', 'Cancelled'], FAILED: ['失败', 'Failed'], UPCOMING: ['未开始', 'Upcoming'],
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
          <label className="relative min-w-56 flex-1"><span className="sr-only">{t('搜索品牌或负责人', 'Search brands or people')}</span><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input className={`${selectClass} w-full pl-9`} placeholder={t('搜索品牌、位置或主理人', 'Search brand, location or people')} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} /></label>
          <select aria-label={t('订阅状态', 'Subscription status')} className={selectClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">{t('全部订阅状态', 'All statuses')}</option>{Object.entries(statuses).map(([key, labels]) => <option key={key} value={key}>{labels[en ? 1 : 0]}</option>)}</select>
          <select aria-label={t('主理人筛选', 'Filter principal')} className={selectClass} value={principal} onChange={e => { setPrincipal(e.target.value); setPage(1) }}><option value="">{t('全部主理人', 'All principals')}</option><option value="unassigned">{t('未分配', 'Unassigned')}</option>{principalOptions.map(p => <option value={p.id} key={p.id}>{p.nickname || p.email}</option>)}</select>
          <select aria-label={t('排序', 'Sort')} className={selectClass} value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}><option value="expiry">{t('合约到期：由近到远', 'Contract expiry: earliest first')}</option><option value="published">{t('本月发布：由多到少', 'Monthly posts: most first')}</option><option value="name">{t('品牌名称', 'Brand name')}</option></select>
        </div>
        {error ? <div role="alert" className="p-12 text-center"><p className="text-red-600">{error}</p><button onClick={() => setRefresh(v => v + 1)} className="mt-4 text-blue-600">{t('重试', 'Try again')}</button></div> : loading ? <div role="status" className="p-16 text-center text-slate-500">{t('正在加载品牌运营数据…', 'Loading brand operations…')}</div> : !data?.rows.length ? <div className="p-16 text-center text-slate-500">{t('没有符合条件的订阅品牌', 'No subscribed brands match these filters')}</div> : <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] whitespace-nowrap text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950/40"><tr>{[t('品牌', 'Brand'), t('订阅套餐', 'Subscription'), t('合约结束时间', 'Contract end'), t('品牌主理人', 'Principal'), t('本月发布次数', 'Monthly posts'), t('最近发布', 'Last published')].map(label => <th scope="col" className="px-4 py-3 font-medium" key={label}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.rows.map(row => <tr key={row.id} className="cursor-pointer hover:bg-blue-50/60 focus-within:bg-blue-50/60 dark:hover:bg-slate-800/40 dark:focus-within:bg-slate-800/40" onClick={event => {
              if ((event.target as HTMLElement).closest('a, button, input, select') || window.getSelection()?.toString()) return
              event.currentTarget.querySelector<HTMLAnchorElement>('a[data-brand-link]')?.click()
            }}>
              <td className="px-4 py-3"><div className="flex items-center gap-2"><a data-brand-link href={data.canManage ? `/admin?tab=brands&brandId=${encodeURIComponent(row.id)}&returnTo=managementOverview` : `/board?tab=dashboard&brandId=${encodeURIComponent(row.id)}&returnTo=managementOverview`} aria-label={`${t('编辑品牌：', 'Edit brand: ')}${row.name}`} className="max-w-56 truncate rounded font-semibold text-slate-900 hover:text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:text-white" title={row.name}>{row.name}</a><span className="shrink-0 text-xs text-slate-500">{countryLabel(row.location, en)}</span></div></td>
              <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="max-w-40 truncate font-medium" title={row.subscription.planName}>{row.subscription.planName}</span><span className={`rounded-md px-2 py-1 text-xs ${row.subscription.effectiveStatus === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>{statuses[row.subscription.effectiveStatus]?.[en ? 1 : 0] || row.subscription.effectiveStatus}</span></div></td>
              <td className={`px-4 py-3 tabular-nums ${row.subscription.effectiveStatus === 'EXPIRED' ? 'text-red-600' : ''}`} title={`${t('开始：', 'From: ')}${date(row.subscription.contractStartDate)}`}>{date(row.subscription.contractEndDate)}</td>
              <td className="px-4 py-3"><span className="block max-w-40 truncate" title={row.principals.map(p => [p.nickname, p.email].filter(Boolean).join(' · ')).join('; ')}>{row.principals.map(p => p.nickname || p.email).join('、') || t('未分配', 'Unassigned')}</span></td>
              <td className="px-4 py-3"><span className={`text-base font-semibold tabular-nums ${row.monthlyPublished ? 'text-slate-900 dark:text-white' : 'text-amber-600'}`}>{row.monthlyPublished}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{row.lastPublishedAt ? date(row.lastPublishedAt, true) : t('暂无发布', 'No posts yet')}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {data && !loading && !error && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 dark:border-slate-800"><span>{t(`共 ${data.total} 个品牌 · 第 ${data.page} / ${Math.max(1, Math.ceil(data.total / data.pageSize))} 页`, `${data.total} brands · Page ${data.page} / ${Math.max(1, Math.ceil(data.total / data.pageSize))}`)}</span><div className="flex gap-2"><button aria-label={t('上一页', 'Previous page')} className="rounded-lg border p-2 disabled:opacity-30" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={16} /></button><button aria-label={t('下一页', 'Next page')} className="rounded-lg border p-2 disabled:opacity-30" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}><ChevronRight size={16} /></button></div></footer>}
      </div>
      <p className="text-xs leading-6 text-slate-500">{data ? `${date(data.period.start)} — ${date(data.period.end, true)} · Asia/Singapore。` : ''}{t('本月发布次数按成功发布记录统计；各平台独立记录分别计数，含人工补录。排期、失败和草稿编辑不计入。汇总卡片显示当前授权范围内全部订阅品牌，筛选仅影响列表。', 'Counts successful publication records, including manually recorded posts. Separate platform records count separately. Scheduled, failed and edited drafts are excluded. Summary cards cover all accessible subscribed brands; filters apply to the list.')}</p>
    </div>
  </section>
}
