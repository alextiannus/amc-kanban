'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, FolderOpen, Plus, Search, X, Loader2 } from 'lucide-react'
import { MATERIAL_ROOTS, STATUS_FOLDER_KEYS } from '@/lib/asset-library/roots'
import { RootPurpose } from './MaterialDirectoryPicker'
import { useI18n } from '@/lib/i18n'
import { subtreeIds, type FolderNode } from '@/lib/asset-library/material-policy'

export type ManagedFolder = FolderNode & { systemKey?: string | null; depth: number; path: string; section: string; assetCount: number; subtreeAssetCount: number; pendingAssetCount?: number; canCreateChild: boolean; canRename: boolean; canMove: boolean; canDelete: boolean }
type Form = { action: 'create' | 'rename' | 'move' | 'delete'; folder?: ManagedFolder; name: string; parentId: string; materialClass: string; confirmed: boolean }
export default function AssetFolderManager({ brandId, createToken = 0, onChanged }: { brandId: string; createToken?: number; onChanged: (folder?: ManagedFolder) => void | Promise<void> }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false), [folders, setFolders] = useState<ManagedFolder[]>([]), [canCreate, setCanCreate] = useState(false)
  const [search, setSearch] = useState(''), [expanded, setExpanded] = useState<Set<string>>(new Set()), [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), version = useRef(0), token = useRef(createToken)
  const load = useCallback(async () => {
    const v = version.current; setLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/folders`, { cache: 'no-store' }); const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (v !== version.current) return
      setFolders(data.folders); setCanCreate(data.canCreate)
      return data.folders as ManagedFolder[]
    } finally { if (v === version.current) setLoading(false) }
  }, [brandId])
  const create = (parent?: ManagedFolder, root = 'ORIGINAL') => setForm({ action: 'create', name: '', parentId: parent?.id || '', materialClass: parent?.materialClass || root, confirmed: false })
  useEffect(() => () => { version.current++ }, [brandId])
  useEffect(() => {
    if (!createToken || token.current === createToken) return
    token.current = createToken
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) { setOpen(true); setError(''); create() } })
    return () => { cancelled = true }
  }, [createToken])
  useEffect(() => {
    if (!open) return
    const node = dialog.current; node?.showModal()
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return load().catch(e => { if (!cancelled) setError(e.message) }) })
    return () => { cancelled = true; node?.close() }
  }, [open, load])
  const submit = async () => {
    if (!form || busy) return
    const v = version.current; setBusy(true); setError('')
    try {
      const base = `/api/brands/${brandId}/folders`
      const isDelete = form.action === 'delete'
      const url = isDelete ? `${base}?folderId=${encodeURIComponent(form.folder!.id)}&revision=${form.folder!.revision}` : base
      const body = form.action === 'create' ? { name: form.name, parentId: form.parentId || null, materialClass: form.materialClass }
        : { folderId: form.folder!.id, revision: form.folder!.revision, ...(form.action === 'rename' ? { name: form.name } : { parentId: form.parentId || null }) }
      const res = await fetch(url, { method: isDelete ? 'DELETE' : form.action === 'create' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, ...(isDelete ? {} : { body: JSON.stringify(body) }) })
      const data = await res.json()
      if (v !== version.current) return
      if (!res.ok) {
        if (res.status === 409) await load()
        throw new Error(data.error || t('保存失败', 'Save failed'))
      }
      setForm(null)
      if (form.parentId) setExpanded(s => new Set([...s, form.parentId]))
      const next = await load()
      if (v === version.current) await onChanged(next?.find(f => f.id === data.folder?.id))
    } catch (e) { if (v === version.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (v === version.current) setBusy(false) }
  }
  const refreshFormVersion = () => {
    const current = folders.find(f => f.id === form?.folder?.id)
    if (current && form) setForm({ ...form, folder: current })
    setError('')
  }
  const action = (action: Form['action'], f: ManagedFolder) => { setError(''); setForm({ action, folder: f, name: f.name, parentId: f.parentId || '', materialClass: f.materialClass, confirmed: false }) }
  const excluded = form?.action === 'move' ? subtreeIds(form.folder!.id, folders) : []
  const parentOptions = folders.filter(f => f.depth < 3 && !excluded.includes(f.id) && f.materialClass === form?.materialClass && !STATUS_FOLDER_KEYS.includes(f.systemKey || ''))
  const selectedParent = folders.find(f => f.id === form?.parentId)
  const labels: Record<string, string> = { ORIGINAL: t('原始素材', 'Original'), MANUAL: t('人工加工', 'Human edited'), AI: t('AI制作成果', 'AI results'), UNCONFIRMED: t('待确认', 'Unconfirmed') }
  const renderNode = (f: ManagedFolder): React.ReactNode => {
    const children = folders.filter(child => child.parentId === f.id)
    const matches = !search || folders.filter(item => subtreeIds(f.id, folders).includes(item.id)).some(item => item.name.toLowerCase().includes(search.toLowerCase()))
    if (!matches) return null
    const isExpanded = !!search || expanded.has(f.id)
    return <li key={f.id} data-folder-id={f.id}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
        <button type="button" className="h-8 w-8 shrink-0 rounded-lg disabled:invisible" disabled={!children.length} aria-label={`${isExpanded ? t('收起', 'Collapse') : t('展开', 'Expand')} ${f.name}`} aria-expanded={isExpanded} onClick={() => setExpanded(s => { const next = new Set(s); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next })}><ChevronRight size={16} className={isExpanded ? 'rotate-90' : ''} /></button>
        <FolderOpen size={17} className={f.section === 'STANDARD' ? 'text-indigo-500' : 'text-amber-500'} />
        <span className="min-w-0 flex-1 break-words font-medium"><span>{f.name}</span> <span className="text-xs font-normal text-slate-500">({f.subtreeAssetCount}){f.materialClass !== 'UNCONFIRMED' && !!f.pendingAssetCount && ` · ${f.pendingAssetCount} 待归类`}</span></span>
        <div className="ml-auto flex w-full flex-wrap justify-end gap-1 text-xs sm:w-auto">
          {f.canCreateChild && <button disabled={busy} className="rounded border px-2 py-1.5" onClick={() => create(f)}>{t('新建子目录', 'Add child')}</button>}
          {f.canRename && <button disabled={busy} className="rounded border px-2 py-1.5" onClick={() => action('rename', f)}>{t('改名', 'Rename')}</button>}
          {f.canMove && <button disabled={busy} className="rounded border px-2 py-1.5" onClick={() => action('move', f)}>{t('移动', 'Move')}</button>}
          {canCreate && f.folderKind !== 'STANDARD' && <button disabled={busy || !f.canDelete} title={f.canDelete ? '' : t('请先移走素材和子目录', 'Move assets and children first')} className="rounded border px-2 py-1.5 text-red-600 disabled:opacity-40" onClick={() => action('delete', f)}>{t('删除', 'Delete')}</button>}
        </div>
      </div>
      {isExpanded && children.length > 0 && <ul className="ml-3 border-l border-slate-200 pl-1 sm:ml-6">{children.map(renderNode)}</ul>}
    </li>
  }
  return <>
    <button type="button" onClick={() => { setOpen(true); setForm(null); setError('') }} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"><FolderOpen size={14} />{t('管理文件夹', 'Manage folders')}</button>
    {open && <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) setOpen(false) }} aria-label={t('管理文件夹', 'Manage folders')} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none rounded-t-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 md:inset-0 md:m-auto md:max-w-4xl md:rounded-2xl dark:bg-slate-900 dark:text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4 dark:bg-slate-900"><div><h2 className="font-semibold">{t('管理文件夹', 'Manage folders')}</h2><p className="mt-1 text-xs text-slate-500">{t('按目录整理素材，原始素材与加工内容分开存放', 'Organize originals separately from edited and AI materials')}</p></div><button type="button" disabled={busy} aria-label={t('关闭', 'Close')} onClick={() => setOpen(false)} className="rounded-lg p-2"><X size={20} /></button></header>
      <div className="space-y-4 p-3 sm:p-4">
        <div className="flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} aria-label={t('搜索目录', 'Search folders')} placeholder={t('搜索目录…', 'Search folders…')} className="w-full bg-transparent py-2 text-sm outline-none" /></label>{canCreate && <button type="button" disabled={busy} onClick={() => create()} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"><Plus size={16} />{t('新建目录', 'New folder')}</button>}</div>
        {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}{form?.folder && folders.find(f => f.id === form.folder!.id)?.revision !== form.folder.revision && <button type="button" onClick={refreshFormVersion} className="ml-2 underline">{t('保留输入并使用最新版本', 'Keep input and use latest version')}</button>}<button type="button" onClick={() => void load().catch(e => setError(e.message))} className="ml-2 underline">{t('刷新', 'Refresh')}</button></div>}
        {form && <form onSubmit={e => { e.preventDefault(); void submit() }} className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 dark:bg-slate-800">
          <h3 className="text-sm font-semibold">{{ create: t('新建目录', 'New folder'), rename: t('修改目录名称', 'Rename folder'), move: t('移动目录', 'Move folder'), delete: t('删除空目录', 'Delete empty folder') }[form.action]}</h3>
          <p className="break-words text-xs text-slate-500">{form.folder?.path || selectedParent?.path || labels[form.materialClass]} · {labels[selectedParent?.materialClass || form.materialClass]}</p>
          {['create', 'rename'].includes(form.action) && <label className="block text-sm">{t('目录名称', 'Folder name')}<input autoFocus required maxLength={80} value={form.name} disabled={busy} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" /></label>}
          {['create', 'move'].includes(form.action) && <label className="block text-sm">{t('父目录', 'Parent folder')}<select value={form.parentId} disabled={busy} onChange={e => setForm({ ...form, parentId: e.target.value, materialClass: folders.find(f => f.id === e.target.value)?.materialClass || form.materialClass })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 dark:bg-slate-900">
            <option value="">{labels[form.materialClass]} / 顶层</option>{parentOptions.map(f => <option key={f.id} value={f.id}>{f.path}</option>)}
          </select></label>}
          {form.action === 'create' && !form.parentId && <label className="block text-sm">{t('素材类别', 'Material class')}<select value={form.materialClass} disabled={busy} onChange={e => setForm({ ...form, materialClass: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:bg-slate-900">{MATERIAL_ROOTS.map(root => <option key={root.id} value={root.id}>{root.name}</option>)}</select></label>}
          {form.action === 'delete' && <p className="text-sm">{t(`确认删除空目录“${form.name}”？`, `Delete the empty folder “${form.name}”?`)}</p>}
          <div className="flex gap-2"><button type="submit" disabled={busy || !canCreate || (form.action === 'move' && (form.parentId || null) === (form.folder?.parentId || null))} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{t('确认', 'Confirm')}</button><button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded-lg border px-3 py-2 text-sm">{t('取消', 'Cancel')}</button></div>
        </form>}
        {loading && <p role="status" className="text-sm text-slate-500">{t('正在读取目录…', 'Loading folders…')}</p>}
        {MATERIAL_ROOTS.map(root => <section key={root.id} className="rounded-xl border p-2"><div className="flex items-center gap-1 px-2 py-1"><h3 className="flex-1 text-sm font-semibold">{root.name}</h3><RootPurpose root={root} />{canCreate && <button type="button" onClick={() => create(undefined, root.id)} className="rounded border px-2 py-1 text-xs">新建子目录</button>}</div><ul className="text-sm">{folders.filter(f => !f.parentId && f.materialClass === root.id && !STATUS_FOLDER_KEYS.includes(f.systemKey || '')).map(renderNode)}</ul></section>)}
        {folders.some(f => f.materialClass === 'UNCONFIRMED') && <details className="rounded-xl border p-2"><summary className="cursor-pointer p-2 text-sm">历史目录（待整理）</summary><p className="px-2 text-xs text-slate-500">请到“待整理”检查素材来源并确认，支持分批整理混合目录；整理后可删除空目录。不会按文件夹名称自动判断。</p><ul>{folders.filter(f => !f.parentId && f.materialClass === 'UNCONFIRMED').map(renderNode)}</ul></details>}
        {!canCreate && !loading && <p className="text-sm text-slate-500">{t('当前账号可查看目录，没有编辑权限', 'You can browse folders with read-only access')}</p>}
      </div>
    </dialog>}
  </>
}
