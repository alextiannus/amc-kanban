'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { ROLE_LABELS, ROLES, STATE_LABELS, type AccessEntry, type Overview, type State } from '@/lib/access-overview/types'
import type { AppRole } from '@/lib/permissions'

type Props = {
  users: { id: string; email: string; nickname: string | null }[]
  initialUserId?: string
  initialRole?: AppRole
}
const tones: Record<State, string> = {
  allowed: 'bg-emerald-50 text-emerald-800 border-emerald-200', denied: 'bg-slate-100 text-slate-600 border-slate-200',
  conditional: 'bg-blue-50 text-blue-800 border-blue-200', comingSoon: 'bg-purple-50 text-purple-800 border-purple-200',
  conflict: 'bg-amber-50 text-amber-900 border-amber-300', unknown: 'bg-orange-50 text-orange-800 border-orange-200', na: 'bg-slate-50 text-slate-500 border-slate-100',
}
function Badge({ state }: { state: State }) { return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs ${tones[state]}`}>{STATE_LABELS[state]}</span> }
function EntryDetail({ entry }: { entry: AccessEntry }) {
  return <section aria-label="权限详情" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-sm dark:bg-slate-900 dark:border-slate-700">
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{entry.label}</h3><Badge state={entry.status} /></div>
    <p className="text-xs text-slate-500">{entry.system === 'kanban' ? 'Kanban' : 'Content'} / {entry.group}</p>
    <div className="space-y-3">{([['菜单可见', entry.menu], ['页面 / 入口', entry.page]] as const).map(([label, result]) => <div key={label}>
      <div className="flex items-center justify-between gap-2"><strong>{label}</strong><Badge state={result.state} /></div><p className="mt-1 text-xs leading-6 text-slate-500">{result.reason}</p>
    </div>)}</div>
    <div><h4 className="font-semibold">数据范围</h4><p className="mt-1 text-xs text-slate-500">{entry.scope}</p></div>
    <div><h4 className="font-semibold">操作权限</h4>{entry.operations.length ? <ul className="mt-2 space-y-3">{entry.operations.map(op => <li key={`${op.label}:${op.source}`}>
      <div className="flex items-center justify-between gap-2"><span>{op.label}</span><Badge state={op.state} /></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{op.reason}</p><code className="block break-all text-[10px] text-slate-400">{op.source}</code>
    </li>)}</ul> : <p className="mt-1 text-xs text-slate-500">{entry.page.state === 'unknown' ? '此目录项的操作权限尚未核实。' : '不适用：此目录项没有单独列出的操作。'}</p>}</div>
    {entry.notes.map(note => <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900" key={note}>{note}</p>)}
    <details className="text-xs text-slate-500"><summary className="cursor-pointer">规则来源与地址</summary><div className="mt-2 space-y-2 break-all">
      {entry.href && <code className="block">{entry.href}</code>}{entry.aliases?.map(alias => <p key={alias}>旧地址：{alias}</p>)}
      {entry.sources.map(source => <code key={source} className="block">{source}</code>)}
    </div></details>
  </section>
}

export default function AccessOverviewPanel({ users, initialUserId, initialRole }: Props) {
  const [mode, setMode] = useState<'roles' | 'user'>(initialUserId ? 'user' : 'roles')
  const [userId, setUserId] = useState(initialUserId || '')
  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<AppRole | ''>(initialRole || '')
  const [brandId, setBrandId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [revision, setRevision] = useState(0)
  const [resource, setResource] = useState<{ key: string; data?: Overview; error?: string } | null>(null)
  const [selection, setSelection] = useState<{ id: string; role?: AppRole; key: string } | null>(null)
  const requestKey = JSON.stringify([mode, userId, brandId, revision])
  const current = resource?.key === requestKey ? resource : null
  const data = current?.data
  const error = current?.error
  const loading = !(mode === 'user' && !userId) && !current

  useEffect(() => {
    const controller = new AbortController()
    if (mode === 'user' && !userId) return () => controller.abort()
    const endpoint = mode === 'roles' ? '/api/admin/access-overview'
      : `/api/admin/users/${encodeURIComponent(userId)}/access-overview${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''}`
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || '权限信息读取失败')
      if (!controller.signal.aborted) setResource({ key: requestKey, data: payload })
    }).catch(err => { if (!controller.signal.aborted) setResource({ key: requestKey, error: err.message || '网络异常，请重试' }) })
    return () => controller.abort()
  }, [mode, userId, brandId, requestKey])

  const columns = roleFilter ? [roleFilter] : ROLES
  const rows = data?.entries || data?.matrix?.ADMIN || []
  const visibleRows = rows.filter(row => {
    const matchesText = `${row.label} ${row.group} ${row.system}`.toLowerCase().includes(query.toLowerCase())
    const values = mode === 'user' ? [row] : columns.flatMap(role => data?.matrix?.[role].find(entry => entry.id === row.id) || [])
    return matchesText && (filter === 'all' || values.some(entry => filter === 'conflict' ? entry.status === 'conflict' : ['allowed', 'conditional'].includes(entry.status)))
  })
  const selectedEntry = selection?.key === requestKey ? (mode === 'user' ? data?.entries : data?.matrix?.[selection.role || 'ADMIN'])?.find(row => row.id === selection.id) : null
  const matchedUsers = useMemo(() => users.filter(user => `${user.email} ${user.nickname || ''}`.toLowerCase().includes(userSearch.toLowerCase()) || user.id === userId), [users, userSearch, userId])

  return <div className="space-y-5 text-slate-800 dark:text-slate-200">
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={18} />权限总览</h2>
      <p className="mt-2 text-xs leading-6 text-slate-600">只读查询当前规则。分别查看菜单、入口、操作与品牌范围；点击状态查看原因。不会切换账号或修改授权。</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {([['roles', '角色权限矩阵'], ['user', '账号权限诊断']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-lg border px-4 py-2 text-sm ${mode === value ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200'}`}>{label}</button>)}
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新权限</button>
    </div>
    <div className="flex flex-wrap gap-3">
      {mode === 'roles' ? <label className="text-xs">角色<select aria-label="筛选角色" className="ml-2 rounded-lg border p-2 dark:bg-slate-900" value={roleFilter} onChange={e => setRoleFilter(e.target.value as AppRole | '')}><option value="">全部五种角色</option>{ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]} ({role})</option>)}</select></label>
        : <><label className="text-xs">搜索账号<input className="ml-2 rounded-lg border p-2 dark:bg-slate-900" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="姓名或邮箱" /></label>
          <select aria-label="选择账号" className="max-w-full rounded-lg border p-2 text-sm dark:bg-slate-900" value={userId} onChange={e => { setUserId(e.target.value); setBrandId('') }}><option value="">请选择账号</option>{matchedUsers.map(user => <option key={user.id} value={user.id}>{user.nickname || user.email} · {user.email}</option>)}</select></>}
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}<button className="ml-4 underline" onClick={() => setRevision(value => value + 1)}>重试</button></div>}
    {loading && <p role="status" className="p-6 text-center text-sm text-slate-500">正在读取最新角色与授权关系…</p>}
    {!loading && mode === 'user' && !userId && <p className="p-6 text-sm text-slate-500">选择账号后，查看实际角色、授权品牌及受限原因。</p>}
    {data && <>
      <p className="text-xs leading-6 text-slate-500">{data.evidence}<br />Kanban 规则 {data.ruleVersion} · Content {data.content.ruleVersion || '未核实'} · 查询时间 {new Date(data.generatedAt).toLocaleString()}</p>
      {data.content.state === 'unavailable' && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{data.content.reason}。Kanban 结果仍可查看。</p>}
      {data.user && <section aria-label="账号授权信息" className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm">
        <p className="font-bold">{data.user.nickname || data.user.email} · {data.user.email} · {data.user.status}</p>
        <p>菜单角色：{data.user.menuRoles.map(role => ROLE_LABELS[role]).join('、') || '无角色'}<br />服务端角色：{data.user.roles.map(role => ROLE_LABELS[role]).join('、') || '无角色'}</p>
        {data.user.roleSources.map(source => <p key={source} className="text-xs text-slate-500">{source}</p>)}
        {[...data.user.roles].sort().join() !== [...data.user.menuRoles].sort().join() && <p className="text-amber-700">菜单角色与服务端角色不同，已按各自实际规则计算。</p>}
        <label>品牌范围<select aria-label="选择品牌" className="ml-2 max-w-full rounded-lg border p-2 dark:bg-slate-900" value={brandId} onChange={e => setBrandId(e.target.value)}><option value="">未选择品牌（查看条件）</option>{data.brands?.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
        {!data.brands?.length && <p className="text-xs text-slate-500">当前没有有效可访问品牌。</p>}
        {brandId && <p className="text-xs text-slate-500">授权来源：{data.brands?.find(brand => brand.id === brandId)?.sources.join('；') || '品牌授权已失效，请重新选择'}</p>}
        <details className="text-xs"><summary className="cursor-pointer">全部授权品牌及来源（{data.brands?.length || 0}）</summary><ul className="mt-2 space-y-2">{data.brands?.map(brand => <li key={brand.id}>{brand.name}：{brand.sources.join('；')}</li>)}</ul></details>
      </section>}
      <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={14} /><input aria-label="搜索菜单" className="bg-transparent py-2 text-sm outline-none" placeholder="搜索菜单、分组或系统" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select aria-label="筛选状态" className="rounded-lg border p-2 text-sm dark:bg-slate-900" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部状态</option><option value="available">仅看可用（含条件）</option><option value="conflict">仅看冲突</option></select>
        <span className="text-xs text-slate-500">{visibleRows.length} 个菜单 / 入口</span>
      </div>
      <div className={`grid gap-4 ${selectedEntry ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm"><caption className="sr-only">{mode === 'roles' ? '角色菜单权限矩阵' : '账号菜单权限'}</caption><thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="p-3">系统 / 菜单</th>{mode === 'roles' ? columns.map(role => <th className="p-3 whitespace-nowrap" key={role}>{ROLE_LABELS[role]}</th>) : <><th className="p-3">结果</th><th className="p-3">原因</th></>}</tr></thead>
            <tbody>{visibleRows.map(row => <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-3 min-w-44"><span className="block text-[10px] text-slate-500">{row.system === 'kanban' ? 'Kanban' : 'Content'} / {row.group}</span><span className="font-medium">{row.label}</span></td>
              {mode === 'roles' ? columns.map(role => { const entry = data.matrix?.[role].find(item => item.id === row.id); return <td className="p-3" key={role}>{entry && <button aria-label={`${ROLE_LABELS[role]}：${row.label}权限详情`} className="rounded-md focus:ring-2 focus:ring-blue-500" onClick={() => setSelection({ id: row.id, role, key: requestKey })}><Badge state={entry.status} /></button>}</td> })
                : <><td className="p-3"><button aria-label={`${row.label}权限详情`} onClick={() => setSelection({ id: row.id, key: requestKey })}><Badge state={row.status} /></button></td><td className="p-3 text-xs leading-6 text-slate-500">{row.page.reason}</td></>}
            </tr>)}</tbody></table>
          {!visibleRows.length && <p className="p-8 text-center text-sm text-slate-500">没有符合筛选条件的菜单。</p>}
        </div>
        {selectedEntry && <div><div className="mb-2 flex justify-between text-xs text-slate-500"><span>{selection?.role ? ROLE_LABELS[selection.role] : '当前账号'}</span><button onClick={() => setSelection(null)}>关闭详情</button></div><EntryDetail entry={selectedEntry} /></div>}
      </div>
    </>}
  </div>
}
