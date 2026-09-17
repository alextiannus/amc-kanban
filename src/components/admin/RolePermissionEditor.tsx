'use client'
import { useEffect, useState, useImperativeHandle, type Ref } from 'react'
import { ACTION_LABELS, type PermissionModule } from '@/lib/role-permissions/contract'

type Snapshot = { policies: Record<string, string[]>; versions: Record<string, number>; modules: PermissionModule[]; contentReady: boolean }
export type PermissionEditorHandle = { save: () => Promise<boolean> }
export default function RolePermissionEditor({ role, affectedUsers, system = 'all', search, onDirtyChange, onSavingChange, onSaved, onCancel, editorRef }: {
  role: string; affectedUsers?: number; system?: string; search?: string; onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void; onCancel?: () => void; onSavingChange?: (saving: boolean) => void; editorRef?: Ref<PermissionEditorHandle>
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [grants, setGrants] = useState<string[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [conflict, setConflict] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setSnapshot(null); setError(''); setMessage(''); setConflict(false)
    fetch('/api/admin/role-permissions', { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error)
      if (!controller.signal.aborted) { setSnapshot(data); setGrants(data.policies[role] || []) }
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [role, revision])
  const baseline = snapshot?.policies[role] || []
  const added = grants.filter(k => !baseline.includes(k)), removed = baseline.filter(k => !grants.includes(k))
  const dirty = snapshot !== null && added.length + removed.length > 0
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useImperativeHandle(editorRef, () => ({ save }))
  function toggle(module: PermissionModule, action: string, checked: boolean) {
    setMessage('')
    setGrants(previous => {
      const next = new Set(previous), key = `${module.id}.${action}`
      if (checked) { next.add(key); next.add(`${module.id}.read`) }
      else { next.delete(key); if (action === 'read') module.actions.forEach(a => next.delete(`${module.id}.${a}`)) }
      return [...next]
    })
  }
  function permissionLabel(key: string) {
    const module = snapshot?.modules.find(m => m.actions.some(a => `${m.id}.${a}` === key))
    const action = module?.actions.find(a => `${module.id}.${a}` === key)
    return module && action ? `${module.label} · ${ACTION_LABELS[action] || action}` : key
  }
  async function save() {
    if (!snapshot || saving || conflict || !snapshot.contentReady) return false
    setSaving(true); onSavingChange?.(true); setError(''); setMessage('')
    try {
      const r = await fetch(`/api/admin/role-permissions/${role}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grants, expectedVersion: snapshot.versions[role] }) })
      const data = await r.json()
      if (!r.ok) { if (r.status === 409) setConflict(true); throw new Error(data.error) }
      setSnapshot({ ...snapshot, policies: { ...snapshot.policies, [role]: data.grants }, versions: { ...snapshot.versions, [role]: data.version } })
      setGrants(data.grants); setMessage(`已保存，影响 ${data.affectedUsers} 个账号。后续请求按新权限执行。`)
      onDirtyChange?.(false); onSaved?.(); return true
    } catch (e) { setError((e as Error).message); return false } finally { setSaving(false); onSavingChange?.(false) }
  }
  const visible = snapshot?.modules.filter(m => (system === 'all' || m.system === system) && `${m.label} ${m.system}`.toLowerCase().includes((search ?? query).toLowerCase())) || []
  return <section id="role-permission-editor" className="rounded-xl border border-blue-200 bg-white p-4 dark:bg-slate-900 space-y-3">
    <h3 className="font-bold">编辑功能权限 · Kanban 与 Content</h3>
    <p className="text-xs text-slate-500">修改影响该角色全部账号{affectedUsers === undefined ? '' : `（当前组 ${affectedUsers} 人）`}。多角色取并集，品牌授权独立限制。编辑显示全部可配置模块，不受查看状态筛选影响。</p>
    {error && <div role="alert" className="text-sm text-red-600">{error}{conflict && <button type="button" className="ml-3 underline" onClick={() => { if (window.confirm('重新加载将放弃本次未保存修改，是否继续？')) { onDirtyChange?.(false); setRevision(v => v + 1) } }}>重新加载最新权限</button>}</div>}
    {message && <div role="status" className="text-sm text-green-700">{message}</div>}
    {!snapshot ? <p className="text-sm">{error ? <button onClick={() => setRevision(v => v + 1)}>重新加载权限</button> : '加载权限…'}</p> : <>
      {!snapshot.contentReady && <p className="text-amber-700 text-sm">Content 未就绪或版本不匹配，暂不能保存。</p>}
      {search === undefined && <input aria-label="搜索权限模块" placeholder="搜索模块" value={query} onChange={e => setQuery(e.target.value)} className="border rounded-lg px-3 py-2 w-full" />}
      {!visible.length && <p>没有符合搜索条件的模块。</p>}
      {(['kanban', 'content'] as const).filter(s => visible.some(m => m.system === s)).map(s => <div key={s}>
        <h4 className="font-semibold mb-2">{s === 'kanban' ? 'Kanban' : 'Content'}</h4>
        {visible.filter(m => m.system === s).map(m => <fieldset key={m.id} disabled={saving} className="border-t py-3">
          <legend className="font-medium text-sm">{m.label} <span className="text-xs text-slate-500">· {m.scope}</span></legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">{m.actions.map(action => <label key={action} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={grants.includes(`${m.id}.${action}`)} onChange={e => toggle(m, action, e.target.checked)} />{ACTION_LABELS[action] || action}</label>)}</div>
        </fieldset>)}
      </div>)}
      <p className="text-xs text-slate-500">Growth、待开放菜单及管理员系统配置不可配置。</p>
      <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t pt-3 space-y-2">
        <p className="text-sm">新增 {added.length} 项，撤销 {removed.length} 项 · 版本 {snapshot.versions[role]}</p>
        {dirty && <details className="text-xs"><summary>查看变更明细</summary>{[...added.map(k => `＋ ${permissionLabel(k)}`), ...removed.map(k => `－ ${permissionLabel(k)}`)].map(k => <div key={k}>{k}</div>)}</details>}
        <button disabled={saving || conflict || !snapshot.contentReady || !dirty} onClick={save} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-40">{saving ? '保存中…' : '保存权限'}</button>
        <button disabled={saving} onClick={() => { setGrants(baseline); setError(''); setMessage(''); onDirtyChange?.(false); onCancel?.() }} className="px-4 py-2">取消修改</button>
      </div>
    </>}
  </section>
}
