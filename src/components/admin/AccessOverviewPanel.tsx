'use client'

import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { ROLE_LABELS, ROLES, STATE_LABELS, type AccessEntry, type Overview, type State } from '@/lib/access-overview/types'
import RolePermissionEditor, { type PermissionEditorHandle } from './RolePermissionEditor'
import { groupAccessEntries, matchesAccessGroup, type ModuleGroup } from '@/lib/access-overview/presentation'
import type { AppRole } from '@/lib/permissions'

type Props = {
  users: { id: string; email: string; nickname: string | null }[]
  initialUserId?: string
  initialRole?: string
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

function Modal({ children, title, onClose, drawer = false }: { children: ReactNode; title: string; onClose: () => void; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { previous?.focus() } }, [])
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); onClose() }} className={`bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-200 backdrop:bg-black/30 p-5 ${drawer ? 'fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-lg' : 'rounded-xl w-[min(95vw,440px)]'}`}>
    <div className="flex items-center justify-between mb-4"><h2 className="font-bold">{title}</h2><button aria-label="关闭对话框" onClick={onClose} className="rounded border px-3 py-1">关闭</button></div>{children}
  </dialog>
}
function Checks({ entry }: { entry: AccessEntry }) {
  return <div className="flex flex-wrap gap-2 text-xs"><span>菜单 <Badge state={entry.menu.state} /></span><span>页面 <Badge state={entry.page.state} /></span></div>
}
function Operations({ entry }: { entry: AccessEntry }) {
  return <div className="flex flex-wrap gap-1.5">{entry.operations.length ? entry.operations.map((op, i) => <span key={`${op.actionId || op.label}:${i}`} title={op.reason} className={`rounded border px-2 py-1 text-xs ${tones[op.state]}`}>{op.label}：{STATE_LABELS[op.state]}</span>) : <span className="text-xs text-slate-500">{entry.page.state === 'unknown' ? '操作未核实' : '操作不适用'}</span>}</div>
}
function ModuleRow({ group, query, onDetail }: { group: ModuleGroup; query: string; onDetail: (entry: AccessEntry) => void }) {
  const [expanded, setExpanded] = useState(false)
  const searching = Boolean(query.trim())
  const open = expanded || searching
  const entry = group.primary
  const abnormal = group.entries.filter(e => [e.status, ...e.operations.map(op => op.state)].some(s => ['unknown', 'conflict'].includes(s)))
  return <article className="border-t border-slate-200 dark:border-slate-700" aria-label={group.label}>
    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(140px,1fr)_210px_minmax(240px,2fr)_minmax(160px,1fr)] lg:items-start">
      <div><button className="text-left font-semibold text-sm" aria-expanded={open} onClick={() => setExpanded(!expanded)}>{open ? '▾' : '▸'} {group.label}</button><p className="text-[11px] text-slate-500 mt-1">{group.fixed ? '固定入口' : '功能模块'} · {group.entries.length} 个入口{searching ? ' · 搜索已展开' : ''}</p></div>
      <Checks entry={entry} /><Operations entry={entry} />
      <div className="text-xs leading-5"><p>{entry.scope}</p>{entry.page.state !== 'allowed' && <p className="text-slate-500">{entry.page.reason}</p>}{abnormal.length > 0 && <p className="text-amber-700">{abnormal.length} 个入口存在冲突或未核实</p>}<button className="text-blue-600 underline" onClick={() => onDetail(entry)}>完整原因</button></div>
    </div>
    {open && <div className="mx-3 mb-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 space-y-3">{group.entries.map(child => <div key={child.id} className="border-l-2 border-slate-200 pl-3 space-y-1">
      <button className="text-sm text-blue-700 text-left" onClick={() => onDetail(child)}>{child.system === 'kanban' ? 'Kanban' : 'Content'} / {child.label}</button><Checks entry={child} /><Operations entry={child} />
      <p className="text-xs text-slate-500">{child.page.reason}</p>{child.href && <p className="text-xs break-all text-slate-500">{child.href}</p>}{child.aliases?.map(alias => <p key={alias} className="text-xs break-all text-slate-500">旧地址：{alias}（同一入口规则）</p>)}
    </div>)}</div>}
  </article>
}
export default function AccessOverviewPanel({ users, initialUserId, initialRole }: Props) {
  const [mode, setMode] = useState<'roles' | 'user' | 'compare'>(initialUserId ? 'user' : 'roles')
  const [userId, setUserId] = useState(initialUserId || '')
  const [userSearch, setUserSearch] = useState('')
  const [role, setRole] = useState<string>(initialRole || 'AMC_PRINCIPAL')
  const [roleSearch, setRoleSearch] = useState('')
  const [compareRoles, setCompareRoles] = useState<string[]>([...ROLES])
  const [brandId, setBrandId] = useState('')
  const [query, setQuery] = useState('')
  const [system, setSystem] = useState('all')
  const [filter, setFilter] = useState('all')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<{ run: () => void } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [notice, setNotice] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const editor = useRef<PermissionEditorHandle>(null)
  const replay = useRef(false)
  const [resource, setResource] = useState<{ key: string; data?: Overview; error?: string } | null>(null)
  const [selection, setSelection] = useState<{ entry: AccessEntry; label: string } | null>(null)
  const requestKey = JSON.stringify([mode === 'user' ? 'user' : 'roles', userId, brandId, revision])
  const current = resource?.key === requestKey ? resource : null
  const data = current?.data, error = current?.error
  const loading = !(mode === 'user' && !userId) && !current
  function navigate(run: () => void) {
    if (saving) { setNotice('正在保存权限，请稍候。'); return }
    if (dirty) { setLeaveError(''); setPending({ run }); return }
    setEditing(false); setSelection(null); run()
  }
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const outside = (event: MouseEvent) => {
      if (replay.current || root.current?.contains(event.target as Node)) return
      const target = (event.target as Element).closest?.('a,button,[role="tab"]') as HTMLElement | null
      if (!target) return
      event.preventDefault(); event.stopPropagation()
      if (saving) { setNotice('正在保存权限，请稍候。'); return }
      setLeaveError(''); setPending({ run: () => { replay.current = true; target.click(); replay.current = false } })
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', outside, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', outside, true) }
  }, [dirty, saving])
  useEffect(() => {
    const controller = new AbortController()
    if (mode === 'user' && !userId) return () => controller.abort()
    const endpoint = mode !== 'user' ? '/api/admin/access-overview' : `/api/admin/users/${encodeURIComponent(userId)}/access-overview${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''}`
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '权限信息读取失败')
      if (!controller.signal.aborted) setResource({ key: requestKey, data: payload })
    }).catch(err => { if (!controller.signal.aborted) setResource({ key: requestKey, error: err.message || '网络异常，请重试' }) })
    return () => controller.abort()
  }, [mode, userId, brandId, requestKey])
  const labelFor = (id: string) => data?.roleCatalog?.find(item => item.id === id)?.name || ROLE_LABELS[id] || id
  const selectedDefinition = data?.roleCatalog?.find(item => item.id === role)
  const roleGroups = useMemo(() => Object.fromEntries((data?.roles || ROLES).map(value => [value, groupAccessEntries(data?.matrix?.[value] || [])])) as Record<string, ModuleGroup[]>, [data])
  const groups = mode === 'user' ? groupAccessEntries(data?.entries || []) : (roleGroups[mode === 'compare' ? (compareRoles[0] || 'ADMIN') : role] || [])
  const visible = groups.filter(group => mode !== 'compare' ? matchesAccessGroup(group, system, query, filter) : compareRoles.some(value => {
    const other = roleGroups[value]?.find(g => g.id === group.id)
    return other && matchesAccessGroup(other, system, query, filter)
  }))
  const matchedUsers = users.filter(user => `${user.email} ${user.nickname || ''}`.toLowerCase().includes(userSearch.toLowerCase()) || user.id === userId)
  function saved() { setDirty(false); setEditing(false); setSelection(null); setRevision(v => v + 1); setNotice('权限已保存，已重新查询当前规则。') }
  function detail(entry: AccessEntry, label = mode === 'user' ? '当前账号' : labelFor(role)) { setSelection({ entry, label }) }
  function renderGroups(items: ModuleGroup[]) {
    if (mode === 'compare') return <div className="max-h-[65vh] overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">五角色权限对比</caption><thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800"><tr><th className="sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 p-3 min-w-40">功能模块</th>{compareRoles.map(value => <th key={value} className="p-3 whitespace-nowrap">{labelFor(value)}</th>)}</tr></thead><tbody>{items.map(group => <tr key={group.id} className="border-t"><th className="sticky left-0 z-10 bg-white dark:bg-slate-900 p-3">{group.label}</th>{compareRoles.map(value => { const other = roleGroups[value]?.find(g => g.id === group.id); return <td key={value} className="p-3 min-w-32">{other ? <button className="text-left space-y-1" onClick={() => detail(other.primary, labelFor(value))}><Checks entry={other.primary} /><span className="block">{other.primary.operations.filter(op => ['allowed', 'conditional'].includes(op.state)).length}/{other.primary.operations.length} 项操作允许或有条件</span>{other.entries.some(e => ['unknown', 'conflict'].includes(e.status)) && <span className="text-amber-700">存在异常入口</span>}</button> : '未核实'}</td> })}</tr>)}</tbody></table></div>
    return <><div className="hidden lg:grid lg:grid-cols-[minmax(140px,1fr)_210px_minmax(240px,2fr)_minmax(160px,1fr)] gap-3 px-3 py-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800"><span>功能模块 / 子页面</span><span>菜单 / 页面</span><span>操作权限</span><span>数据范围与限制</span></div>{items.map(group => <ModuleRow key={group.id} group={group} query={query} onDetail={entry => detail(entry)} />)}</>
  }
  return <div ref={root} className="space-y-3 text-slate-800 dark:text-slate-200">
    <div className="flex flex-wrap items-center gap-2">{([['roles', '按角色看功能'], ['user', '账号权限诊断'], ['compare', '角色对比']] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => navigate(() => setMode(value))} className={`rounded-lg px-3 py-2 text-sm ${mode === value ? 'bg-blue-600 text-white' : 'border border-slate-200'}`}>{label}</button>)}<button disabled={loading} onClick={() => navigate(() => { setRevision(v => v + 1); setNotice('') })} className="ml-auto flex gap-1 items-center text-xs border rounded-lg px-3 py-2"><RefreshCw size={14} />刷新权限</button></div>
    {mode === 'roles' && <div className="flex flex-wrap items-center gap-2">{ROLES.map(value => <button key={value} aria-pressed={role === value} onClick={() => { if (value !== role) navigate(() => { setRole(value); setNotice('') }) }} className={`rounded-full px-4 py-1.5 text-sm border ${role === value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>{labelFor(value)}</button>)}<span className="ml-auto">{role === 'ADMIN' ? <span className="text-xs text-slate-500">系统固定权限</span> : <button disabled={editing || loading || !data} onClick={() => { setEditing(true); setSelection(null); setNotice('') }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">编辑此角色权限</button>}</span></div>}
    {mode === 'roles' && <div className="flex flex-wrap items-center gap-2"><input aria-label="搜索自定义角色" placeholder="搜索自定义角色" value={roleSearch} onChange={e => setRoleSearch(e.target.value)} className="border rounded p-2 text-sm bg-transparent"/><select aria-label="选择自定义角色" className="border rounded p-2 text-sm dark:bg-slate-900" value={selectedDefinition && !selectedDefinition.builtIn ? role : ''} onChange={e => { if(e.target.value) navigate(() => setRole(e.target.value)) }}><option value="">选择自定义角色</option>{data?.roleCatalog?.filter(r => !r.builtIn && (r.id === role || r.name.toLowerCase().includes(roleSearch.toLowerCase()))).map(r => <option key={r.id} value={r.id}>{r.name}{!r.enabled && '（已停用）'}</option>)}</select>{selectedDefinition && !selectedDefinition.enabled && <span className="text-sm text-amber-700">角色已停用，不参与授权；仍可编辑保存的配置。</span>}</div>}
    {mode === 'compare' && <details className="text-sm"><summary>选择对比角色（最多 5 个）</summary><div className="flex flex-wrap gap-3 p-2">{(data?.roles || ROLES).map(id => <label key={id}><input type="checkbox" checked={compareRoles.includes(id)} disabled={!compareRoles.includes(id) && compareRoles.length >= 5} onChange={e => setCompareRoles(previous => e.target.checked ? [...previous, id] : previous.filter(value => value !== id))}/>{labelFor(id)}</label>)}</div></details>}
    {mode === 'user' && <div className="flex flex-wrap gap-2"><input aria-label="搜索账号" className="border rounded-lg p-2 text-sm bg-transparent" placeholder="姓名或邮箱" value={userSearch} onChange={e => setUserSearch(e.target.value)} /><select aria-label="选择账号" className="border rounded-lg p-2 text-sm max-w-full dark:bg-slate-900" value={userId} onChange={e => { setUserId(e.target.value); setBrandId(''); setSelection(null) }}><option value="">请选择账号</option>{matchedUsers.map(user => <option key={user.id} value={user.id}>{user.nickname || user.email} · {user.email}</option>)}</select></div>}
    <div className="flex flex-wrap items-center gap-2"><select aria-label="筛选系统" value={system} onChange={e => setSystem(e.target.value)} className="border rounded-lg p-2 text-sm dark:bg-slate-900"><option value="all">全部系统</option><option value="kanban">Kanban</option><option value="content">Content</option></select><label className="flex items-center gap-2 border rounded-lg px-2"><Search size={14} /><input aria-label="搜索菜单" placeholder="搜索模块、子页面或地址" value={query} onChange={e => setQuery(e.target.value)} className="bg-transparent py-2 text-sm w-52 max-w-full outline-none" /></label><select aria-label="筛选状态" disabled={editing} value={filter} onChange={e => setFilter(e.target.value)} className="border rounded-lg p-2 text-sm dark:bg-slate-900"><option value="all">全部状态</option><option value="available">可访问（含条件）</option><option value="denied">禁止</option><option value="conditional">有条件</option><option value="anomaly">异常（冲突 / 未核实）</option></select>{!editing && data && <span className="text-xs text-slate-500">{system === 'all' ? '全部系统' : system === 'kanban' ? 'Kanban' : 'Content'}{query ? ` · 搜索“${query}”` : ''} · {visible.filter(g => !g.fixed).length} 个功能模块 / {visible.filter(g => g.fixed && !g.comingSoon).length} 个固定入口 / {visible.filter(g => g.comingSoon).length} 项待开放</span>}</div>
    <p className="text-xs text-slate-500">{mode === 'user' ? '结合当前账号与所选品牌计算；这里只查看，不修改个人授权。' : '角色规则；有条件的功能仍需账号具备品牌授权。'}</p>
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}<button className="ml-3 underline" onClick={() => setRevision(v => v + 1)}>重试</button></div>}
    {loading && <p role="status" className="py-6 text-sm text-slate-500">正在读取最新角色与授权关系…</p>}
    {mode === 'user' && !userId && <p className="p-6 text-sm">选择账号后查看实际权限及限制原因。</p>}
    {data?.content.state === 'unavailable' && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Content 未核实：{data.content.reason}。Kanban 结果仍可查看。</p>}
    {data?.user && <section aria-label="账号授权信息" className="border rounded-lg p-3 text-sm space-y-2"><p className="font-semibold">{data.user.nickname || data.user.email} · {data.user.email} · {data.user.status}</p><p>已分配角色：{(data.user.assignedRoleIds || data.user.roles).map(r => labelFor(r) + (data.roleCatalog?.find(item => item.id === r)?.enabled === false ? '（已停用）' : '')).join('、') || '无角色'}</p><p>有效角色：{data.user.roles.map(r => labelFor(r)).join('、') || '无角色'}</p>{[...data.user.roles].sort().join() !== [...data.user.menuRoles].sort().join() && <p className="text-amber-700">菜单角色：{data.user.menuRoles.map(r => labelFor(r)).join('、') || '无角色'}；与服务端角色不同，按各自规则计算。</p>}<label>品牌 <select aria-label="选择品牌" className="border rounded p-1 max-w-full dark:bg-slate-900" value={brandId} onChange={e => { setBrandId(e.target.value); setSelection(null) }}><option value="">未选择品牌（查看条件）</option>{data.brands?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}{brandId && !data.brands?.some(b => b.id === brandId) && <option value={brandId}>授权已失效，请重新选择</option>}</select></label>{!data.brands?.length && <p className="text-xs">当前没有有效可访问品牌。</p>}{brandId && <p className="text-xs">授权来源：{data.brands?.find(b => b.id === brandId)?.sources.join('；') || '授权已失效'}</p>}<details className="text-xs"><summary>角色与全部品牌授权来源</summary>{data.user.roleSources.map(s => <p key={s}>{s}</p>)}{data.brands?.map(b => <p key={b.id}>{b.name}：{b.sources.join('；')}</p>)}</details></section>}
    {editing ? <RolePermissionEditor key={role} role={role} system={system} search={query} onDirtyChange={setDirty} onSavingChange={setSaving} onSaved={saved} onCancel={() => { setDirty(false); setEditing(false) }} editorRef={editor} /> : data && <>
      {(['kanban', 'content'] as const).map(s => { const items = visible.filter(g => g.system === s && !g.comingSoon); return items.length > 0 && <details key={s} open className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-700"><summary className="cursor-pointer px-3 py-2 bg-slate-100 dark:bg-slate-800 text-sm font-bold">{s === 'kanban' ? 'Kanban' : 'Content'} · {items.length} 项</summary>{renderGroups(items.filter(g => !g.fixed))}{items.some(g => g.fixed) && <details open={Boolean(query) || undefined}><summary className="px-3 py-2 text-xs cursor-pointer">固定入口（{items.filter(g => g.fixed).length}）</summary>{renderGroups(items.filter(g => g.fixed))}</details>}</details> })}
      {visible.some(g => g.comingSoon) && <details open={Boolean(query) || undefined} className="border rounded-xl"><summary className="p-3 text-sm cursor-pointer">待开放（{visible.filter(g => g.comingSoon).length}）</summary>{renderGroups(visible.filter(g => g.comingSoon))}</details>}
      {!visible.length && <p className="p-8 text-center text-sm text-slate-500">没有符合筛选条件的模块或入口。</p>}
    </>}
    {data && <details className="text-xs text-slate-500"><summary className="cursor-pointer">查询详情 · {new Date(data.generatedAt).toLocaleString()}</summary><p className="mt-2">{data.evidence}</p><p>Kanban {data.ruleVersion} · Content {data.content.ruleVersion || '未核实'}</p><p>角色策略版本：{Object.entries(data.policyVersions || {}).map(([key, version]) => `${labelFor(key)} ${version}`).join(' · ') || '未返回'}</p></details>}
    {selection && <Modal title={`${selection.label} · 权限详情`} drawer onClose={() => setSelection(null)}><EntryDetail entry={selection.entry} /></Modal>}
    {pending && <Modal title="存在未保存的权限修改" onClose={() => { if (!leaving) setPending(null) }}><p className="text-sm mb-4">保存后继续，或放弃本次修改。</p>{leaveError && <p role="alert" className="text-red-600 text-sm mb-3">{leaveError}</p>}<div className="flex flex-wrap gap-2"><button disabled={leaving} className="rounded bg-blue-600 text-white px-3 py-2" onClick={async () => { setLeaving(true); const ok = await editor.current?.save(); setLeaving(false); if (ok) { const run = pending.run; setPending(null); setDirty(false); setEditing(false); run() } else setLeaveError('保存未完成，请返回编辑区处理错误。修改仍已保留。') }}>保存并继续</button><button disabled={leaving} className="border rounded px-3 py-2" onClick={() => { const run = pending.run; setPending(null); setDirty(false); setEditing(false); run() }}>放弃修改</button><button disabled={leaving} className="border rounded px-3 py-2" onClick={() => setPending(null)}>继续编辑</button></div></Modal>}
  </div>
}
