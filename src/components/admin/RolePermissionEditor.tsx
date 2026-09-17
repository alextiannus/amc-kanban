'use client'
import { useEffect, useState } from 'react'
import { ACTION_LABELS, type PermissionModule } from '@/lib/role-permissions/contract'
type Snapshot = { policies: Record<string, string[]>; versions: Record<string, number>; modules: PermissionModule[]; contentReady: boolean }
export default function RolePermissionEditor({ role, affectedUsers }: { role: string; affectedUsers: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [grants, setGrants] = useState<string[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setSnapshot(null); setError(''); setMessage('')
    fetch('/api/admin/role-permissions', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error)
      setSnapshot(data); setGrants(data.policies[role] || [])
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [role])
  const baseline = snapshot?.policies[role] || []
  const added = grants.filter(k => !baseline.includes(k)), removed = baseline.filter(k => !grants.includes(k))
  function toggle(module: PermissionModule, action: string, checked: boolean) {
    setMessage('')
    setGrants(previous => {
      const next = new Set(previous), key = `${module.id}.${action}`
      if (checked) { next.add(key); next.add(`${module.id}.read`) }
      else { next.delete(key); if (action === 'read') module.actions.forEach(a => next.delete(`${module.id}.${a}`)) }
      return [...next]
    })
  }
  async function save() {
    if (!snapshot) return
    setSaving(true); setError(''); setMessage('')
    try {
      const r = await fetch(`/api/admin/role-permissions/${role}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grants, expectedVersion: snapshot.versions[role] }) })
      const data = await r.json(); if (!r.ok) throw new Error(data.error)
      setSnapshot({ ...snapshot, policies: { ...snapshot.policies, [role]: data.grants }, versions: { ...snapshot.versions, [role]: data.version } })
      setGrants(data.grants); setMessage(`已保存，影响 ${data.affectedUsers} 个账号。后续请求按新权限执行。`)
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <section id="role-permission-editor" className="rounded-xl border border-slate-200 bg-white p-5 dark:bg-slate-900 dark:border-slate-700 space-y-4">
    <h3 className="font-bold">功能权限 · Kanban 与 Content</h3>
    <p className="text-sm text-slate-500">修改统一影响该角色的全部账号（当前组 {affectedUsers} 人）。多角色取并集，其他角色仍允许时账号会保留该权限。品牌授权独立限制，平台共享库保持共享。</p>
    {error && <div role="alert" className="text-sm text-red-600">{error}</div>}
    {message && <div role="status" className="text-sm text-green-700">{message}</div>}
    {!snapshot ? <p className="text-sm">{error ? '权限未加载；切换角色可重新加载。' : '加载权限…'}</p> : <>
      {!snapshot.contentReady && <p className="text-amber-700 text-sm">Content 未就绪或版本不匹配，暂不能保存。</p>}
      <input aria-label="搜索权限模块" placeholder="搜索模块" value={query} onChange={e => setQuery(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />
      {(['kanban', 'content'] as const).map(system => <div key={system}>
        <h4 className="font-semibold mb-2">{system === 'kanban' ? 'Kanban' : 'Content'}</h4>
        {snapshot.modules.filter(m => m.system === system && m.label.toLowerCase().includes(query.toLowerCase())).map(m => <fieldset key={m.id} disabled={saving} className="border-t py-3">
          <legend className="font-medium text-sm">{m.label} <span className="text-xs text-slate-500">· {m.scope}</span></legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">{m.actions.map(action => <label key={action} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={grants.includes(`${m.id}.${action}`)} onChange={e => toggle(m, action, e.target.checked)} />{ACTION_LABELS[action] || action}</label>)}</div>
        </fieldset>)}
      </div>)}
      <p className="text-xs text-slate-500">Growth、待开放菜单及管理员系统配置不可配置。</p>
      <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t pt-3 space-y-2">
        <p className="text-sm">新增 {added.length} 项，撤销 {removed.length} 项 · 版本 {snapshot.versions[role]}</p>
        {(added.length > 0 || removed.length > 0) && <details className="text-xs"><summary>查看变更明细</summary>{[...added.map(k => `＋ ${k}`), ...removed.map(k => `－ ${k}`)].map(k => <div key={k}>{k}</div>)}</details>}
        <button disabled={saving || !snapshot.contentReady || added.length + removed.length === 0} onClick={save} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-40">{saving ? '保存中…' : '保存权限'}</button>
        <button disabled={saving} onClick={() => { setGrants(baseline); setError(''); setMessage('') }} className="px-4 py-2">取消修改</button>
      </div>
    </>}
  </section>
}
