'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MATERIAL_ROOTS, STATUS_FOLDER_KEYS } from '@/lib/asset-library/roots'
import { isKnownAiAsset } from '@/lib/asset-library/material-policy'
import type { ManagedFolder } from './AssetFolderManager'
import { ReviewThumbnail, ReviewMediaViewer, type ReviewMedia } from './MaterialCleanupPreview'

type Item = ReviewMedia & { folderId: string | null; aiCategory: string | null; materialClass: string; updatedAt: string; sourceType?: string; technicalMetadata?: unknown }
export default function MaterialCleanup({ brandId, canWrite, folders, onChanged }: { brandId?: string; canWrite: boolean; folders: ManagedFolder[]; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<Item[]>([]), [chosen, setChosen] = useState<Item[]>([])
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [scope, setScope] = useState('UNCONFIRMED'), [oldFolder, setOldFolder] = useState('')
  const [root, setRoot] = useState('ORIGINAL'), [target, setTarget] = useState(''), [preview, setPreview] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState(''), [reload, setReload] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null), version = useRef(0)
  const [media, setMedia] = useState<Item | null>(null)
  const previewPosition = useRef<{ top: number; id: string } | null>(null)
  const openMedia = (asset: Item) => { previewPosition.current = { top: dialog.current?.scrollTop || 0, id: asset.id }; setMedia(asset) }
  const close = () => { setOpen(false); setMedia(null); previewPosition.current = null }
  useLayoutEffect(() => {
    if (media || !previewPosition.current) return
    const position = previewPosition.current
    const node = dialog.current
    node?.querySelector<HTMLButtonElement>(`[data-review-id="${CSS.escape(position.id)}"]`)?.focus({ preventScroll: true })
    if (node) node.scrollTop = position.top
    previewPosition.current = null
  }, [media])
  const classLabel = (value: string) => MATERIAL_ROOTS.find(root => root.id === value)?.name || '待归类'
  useEffect(() => () => { version.current++ }, [brandId])
  useEffect(() => { const node = dialog.current; if (open) node?.showModal(); return () => node?.close() }, [open])
  useEffect(() => {
    if (!open || !brandId) return
    const abort = new AbortController()
    const q = new URLSearchParams({ brandId, page: String(page), pageSize: '24' })
    if (scope) q.set('materialClass', scope)
    if (oldFolder) q.set('folderId', oldFolder)
    void Promise.resolve().then(() => { if (!abort.signal.aborted) { setBusy(true); setError('') } })
    fetch(`/api/dashboard/assets?${q}`, { cache: 'no-store', signal: abort.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '读取失败'); if (!abort.signal.aborted) { setItems(data.assets); setTotal(data.total) } }).catch(e => { if (!abort.signal.aborted) setError(e.message) }).finally(() => { if (!abort.signal.aborted) setBusy(false) })
    return () => abort.abort()
  }, [open, brandId, page, scope, oldFolder, reload])
  const submit = async (rollback = false) => {
    if (busy || !brandId || (!rollback && !preview)) return
    const v = version.current; setBusy(true); setError('')
    try {
      const response = await fetch(`/api/brands/${brandId}/assets/organize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rollback ? { action: 'rollback', receiptId: receipt } : { action: 'apply', assetIds: preview!.map(a => a.id), revisions: Object.fromEntries(preview!.map(a => [a.id, a.updatedAt])), folderId: target || null, materialClass: root, confirmMaterialClassChange: true }) })
      const data = await response.json()
      if (v !== version.current) return
      if (!response.ok) throw new Error(data.error || '整理失败')
      setReceipt(rollback ? '' : data.receiptId); setPreview(null); setChosen([]); setReload(r => r + 1); await onChanged()
    } catch (e) { if (v === version.current) setError((e as Error).message) }
    finally { if (v === version.current) setBusy(false) }
  }
  return <><button type="button" onClick={() => setOpen(true)} className="rounded-lg border px-3 py-2 text-xs">待整理</button>
    {open && <dialog ref={dialog} aria-label="待整理工作台" onCancel={e => { e.preventDefault(); if (media) setMedia(null); else if (!busy) close() }} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-4 text-slate-900 backdrop:bg-black/50 md:inset-0 md:m-auto md:max-w-3xl md:rounded-2xl dark:bg-slate-900 dark:text-white">
      <header className="flex items-center justify-between"><h2 className="font-semibold">待整理</h2><button type="button" disabled={busy} onClick={close} className="rounded border p-2">关闭</button></header>
      <p className="my-3 text-xs leading-5 text-slate-500">待归类表示还没有可靠的来源分类。先预览文件，确认是实拍原始、AI生成还是人工加工，再选择目标目录。文件夹名称不能证明来源；混合目录可只选其中部分，未选择的保持原状。需要检查、不建议使用也可在这里核对。</p>
      {error && <p role="alert" className="my-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}<button type="button" disabled={busy} onClick={() => { setPreview(null); setChosen([]); setReload(r => r + 1) }} className="ml-2 underline">刷新预览</button></p>}
      {receipt && <p role="status" className="my-3 text-sm text-green-700">整理已保存。<button type="button" disabled={busy} onClick={() => void submit(true)} className="ml-2 underline">撤销本次整理</button></p>}
      {media ? <ReviewMediaViewer key={media.id} asset={media} onBack={() => setMedia(null)} /> : preview ? <div className="space-y-3"><h3 className="font-semibold">确认整理 {preview.length} 项</h3><p className="text-sm">目标：{MATERIAL_ROOTS.find(r => r.id === root)?.name}{target ? ` / ${folders.find(f => f.id === target)?.path}` : ''}。原文件、素材 ID 和已有引用保留。</p><ul className="max-h-80 overflow-auto text-xs">{preview.map(a => <li key={a.id} className="flex items-center gap-3 border-b py-2"><ReviewThumbnail asset={a} onPreview={() => openMedia(a)} /><div className="min-w-0"><button type="button" onClick={() => openMedia(a)} className="break-words text-left text-indigo-600">{a.filename || a.id}</button><p className="mt-1 break-words text-slate-500">{a.aiCategory || '未归档'} / {classLabel(a.materialClass)} → {MATERIAL_ROOTS.find(r => r.id === root)?.name}</p></div></li>)}</ul><button disabled={busy || !canWrite} onClick={() => void submit()} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white">确认分类并归档</button><button disabled={busy} onClick={() => setPreview(null)} className="ml-2 rounded border px-3 py-2 text-sm">返回修改</button></div> : <>
        <div className="flex flex-wrap gap-2 text-xs"><label>检查范围 <select value={scope} disabled={busy} onChange={e => { setScope(e.target.value); setPage(1); setChosen([]) }} className="rounded border bg-transparent p-2"><option value="UNCONFIRMED">待归类</option><option value="">全部历史素材</option></select></label><label>历史目录 <select value={oldFolder} disabled={busy} onChange={e => { setOldFolder(e.target.value); setPage(1); setChosen([]) }} className="max-w-52 rounded border bg-transparent p-2"><option value="">全部</option>{folders.map(f => <option key={f.id} value={f.id}>{f.path}</option>)}</select></label></div>
        <ul className="my-3 space-y-2">{items.map(a => <li key={a.id} className="flex items-center gap-2 rounded-lg border p-2"><input type="checkbox" aria-label={`选择 ${a.filename || a.id}`} checked={chosen.some(c => c.id === a.id)} disabled={busy || !canWrite} onChange={e => setChosen(prior => e.target.checked ? [...prior, a] : prior.filter(c => c.id !== a.id))} /><ReviewThumbnail asset={a} onPreview={() => openMedia(a)} /><div className="min-w-0 flex-1"><button type="button" onClick={() => openMedia(a)} className="block w-full truncate text-left text-sm text-indigo-600">{a.filename || a.id}</button><p className="mt-1 break-words text-xs text-slate-500">{a.aiCategory || '未归档'} · {isKnownAiAsset(a) ? '有服务端 AI 生成记录' : '来源待人工核对'} · {classLabel(a.materialClass)}</p></div></li>)}</ul>
        <div className="flex items-center justify-between text-xs"><span>共 {total} 项，已选 {chosen.length}</span><div><button disabled={busy || page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border p-2 disabled:opacity-40">上一页</button><span className="mx-2">{page}</span><button disabled={busy || page * 24 >= total} onClick={() => setPage(p => p + 1)} className="rounded border p-2 disabled:opacity-40">下一页</button></div></div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs"><label>归入 <select disabled={busy || !canWrite} value={root} onChange={e => { setRoot(e.target.value); setTarget('') }} className="rounded border bg-transparent p-2">{MATERIAL_ROOTS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><select aria-label="整理目标子目录" disabled={busy || !canWrite} value={target} onChange={e => setTarget(e.target.value)} className="max-w-56 rounded border bg-transparent p-2"><option value="">默认归档位置</option>{folders.filter(f => f.materialClass === root && !STATUS_FOLDER_KEYS.includes(f.systemKey || '')).map(f => <option key={f.id} value={f.id}>{f.path}</option>)}</select><button disabled={busy || !canWrite || !chosen.length || chosen.length > 500} onClick={() => { if (chosen.some(a => isKnownAiAsset(a) && root !== 'AI')) { setError('所选素材有可信 AI 生成记录，请归入 AI制作成果或分批整理'); return } setPreview([...chosen]) }} className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-40">预览整理</button></div>
      </>}
      {!canWrite && <p className="mt-3 text-xs text-slate-500">当前账号只有查看权限。</p>}
    </dialog>}
  </>
}
