'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Info, Loader2, AlertCircle, X, FolderOpen, Sparkles } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { PROTECTED_FOLDERS } from '@/lib/asset-analysis/policy'

type Asset = { id: string; brandId: string; url: string; filename: string | null; aiCaption: string | null; aiTags: string[]; aiCategory: string | null; imageAnalysis?: { contentType?: string; needsReview?: boolean }; analysisTask?: { status: string; error?: string; batchId: string } }
type Folder = { id: string; name: string; assetCount?: number }
type Batch = { id: string; status: string; error?: string; industry: string; createdAt: string; updatedAt?: string; _count?: { items: number }; groups?: Group[]; items?: Item[] }
type Item = { id: string; assetId: string; status: string; error?: string; result?: { caption: string; contentType: string; needsReview: boolean }; asset: { url: string; filename: string | null } }
type Group = { name: string; folderId: string | null; reason: string; itemIds: string[] }

async function api(url: string, body?: unknown, method = 'POST') {
  const res = await fetch(url, body === undefined ? undefined : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useI18n()
  useEffect(() => { ref.current?.showModal(); const dialog = ref.current; return () => dialog?.close() }, [])
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); close() }} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none rounded-t-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 md:inset-0 md:m-auto md:max-w-3xl md:rounded-2xl dark:bg-slate-900 dark:text-white" aria-label={title}>
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-4 dark:bg-slate-900"><h2 className="font-semibold">{title}</h2><button type="button" aria-label={t('关闭', 'Close')} onClick={close} className="rounded-lg p-2"><X size={20} /></button></header>
    <div className="space-y-4 p-4">{children}</div>
  </dialog>
}

export function AssetInfoButton({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const { t } = useI18n()
  const busy = ['QUEUED', 'RUNNING'].includes(asset.analysisTask?.status || '')
  const failed = asset.analysisTask?.status === 'FAILED'
  const label = busy ? t('正在分析图片', 'Analyzing image') : failed ? t('分析失败，点击查看', 'Analysis failed — view details') : asset.aiCaption || t('查看图片说明', 'View image details')
  return <div className="group/info absolute left-2 top-2 z-20" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
    <button type="button" aria-label={t('查看图片说明', 'View image details')} title={label} onClick={e => { e.stopPropagation(); onClick() }} className={`flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/65 shadow backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-white ${failed ? 'text-orange-300' : 'text-white'}`}>
      {busy ? <Loader2 size={18} className="animate-spin" /> : failed ? <AlertCircle size={18} /> : <Info size={18} />}
    </button>
    <span role="tooltip" className="pointer-events-none absolute left-0 top-11 hidden w-48 rounded-lg bg-slate-950/90 p-2 text-xs leading-relaxed text-white group-hover/info:block group-focus-within/info:block">{label}</span>
  </div>
}

export default function AssetAnalysisTools({ brandId, selected, infoAsset, closeInfo, onChanged }: { brandId?: string; selected: string[]; infoAsset: Asset | null; closeInfo: () => void; onChanged: () => void }) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(false)
  const [manage, setManage] = useState(false)
  const [batches, setBatches] = useState<Batch[]>([])
  const [batch, setBatch] = useState<Batch | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signature = useRef('')
  const editorBaseline = useRef({ id: '', caption: '', tags: '' })
  const base = `/api/brands/${brandId}/asset-analysis`
  const statusLabel = (status: string) => ({ QUEUED: t('排队中', 'Queued'), RUNNING: t('分析中', 'Analyzing'), READY: t('待确认归类', 'Ready to organize'), FAILED: t('分析失败', 'Failed'), APPLIED: t('已完成归类', 'Organized') }[status] || status)

  useEffect(() => {
    const previous = editorBaseline.current
    const next = { id: infoAsset?.id || '', caption: infoAsset?.aiCaption || '', tags: (infoAsset?.aiTags || []).join(', ') }
    setCaption(current => previous.id === next.id && current !== previous.caption ? current : next.caption)
    setTags(current => previous.id === next.id && current !== previous.tags ? current : next.tags)
    editorBaseline.current = next
  }, [infoAsset?.id, infoAsset?.aiCaption, infoAsset?.aiTags.join(', ')])
  useEffect(() => setError(''), [infoAsset?.id])
  useEffect(() => { setBatch(null); setBatches([]); setOpen(false); setError(''); signature.current = '' }, [brandId])
  const refresh = useCallback(async () => {
    if (!brandId) return
    const data = await api(base)
    setBatches(data.batches)
    const next = JSON.stringify(data.batches.map((b: Batch) => [b.id, b.status, b.error, b.updatedAt]))
    if (signature.current && next !== signature.current) onChanged()
    signature.current = next
  }, [base, brandId, onChanged])
  useEffect(() => {
    if (!brandId) return
    void refresh().catch(() => {})
    const timer = setInterval(() => { void refresh().catch(() => {}) }, 10_000)
    return () => clearInterval(timer)
  }, [refresh, brandId])
  useEffect(() => {
    if (!batch || !['QUEUED', 'RUNNING'].includes(batch.status)) return
    const timer = setInterval(() => { void api(`${base}?batchId=${batch.id}`).then(data => setBatch(data.batch)).catch(e => setError(e.message)) }, 5000)
    return () => clearInterval(timer)
  }, [base, batch?.id, batch?.status])
  useEffect(() => {
    if (!batch?.groups) return
    setGroups(batch.groups)
    const initial: Record<string, string> = {}
    batch.items?.forEach(item => { initial[item.id] = item.result?.needsReview ? '' : String(batch.groups!.findIndex(g => g.itemIds.includes(item.id))) })
    setChoices(initial)
  }, [batch?.id, batch?.groups])

  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action() } catch (e: any) { setError(e.message) } finally { setBusy(false) } }
  const loadFolders = async () => { const data = await api(`/api/brands/${brandId}/folders`); setFolders(data.folders) }
  const showBatch = async (id: string) => { await loadFolders(); const data = await api(`${base}?batchId=${id}`); setBatch(data.batch); setOpen(true); closeInfo() }
  const start = async (scope: 'selected' | 'unanalyzed', ids = selected) => run(async () => {
    const data = await api(base, { scope, assetIds: ids, language, requestKey: crypto.randomUUID() })
    await showBatch(data.batch.id); await refresh(); onChanged()
  })
  const retry = async (id: string) => run(async () => { await api(base, { action: 'retry', batchId: id }, 'PATCH'); await showBatch(id); onChanged() })
  const ready = batches.filter(b => b.status === 'READY').length

  return <>
    {brandId && <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => { setOpen(true); setBatch(null); setError(''); void loadFolders().catch(e => setError(e.message)) }} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"><Sparkles size={14} />{t('图片分析', 'Image analysis')}{ready > 0 && <span className="rounded-full bg-indigo-100 px-1.5 text-indigo-700">{ready}</span>}</button>
      <button type="button" onClick={() => { setManage(true); setError(''); void loadFolders().catch(e => setError(e.message)) }} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"><FolderOpen size={14} />{t('管理文件夹', 'Manage folders')}</button>
    </div>}

    {infoAsset && <Modal title={t('图片说明', 'Image details')} close={closeInfo}>
      <img src={infoAsset.url} alt={infoAsset.filename || ''} className="mx-auto max-h-56 rounded-lg object-contain" />
      {infoAsset.analysisTask?.status === 'FAILED' && <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800">{infoAsset.analysisTask.error}</p>}
      <p className="text-sm">{t('识别类型', 'Content type')}：{infoAsset.imageAnalysis?.contentType || t('尚未分析', 'Not analyzed')}{infoAsset.imageAnalysis?.needsReview && <span className="ml-2 text-orange-600">{t('需人工确认', 'Needs review')}</span>}</p>
      <label className="block text-sm">{t('图片说明', 'Caption')}<textarea value={caption} onChange={e => setCaption(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border bg-transparent p-2" /></label>
      <label className="block text-sm">{t('标签（逗号分隔）', 'Tags (comma separated)')}<input value={tags} onChange={e => setTags(e.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-2" /></label>
      <p className="text-sm">{t('当前文件夹', 'Current folder')}：{infoAsset.aiCategory || t('素材库', 'Library')}</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => void run(async () => {
          await api(`/api/brands/${infoAsset.brandId}/assets/${infoAsset.id}`, { aiCaption: caption, aiTags: tags.split(/[,，]/).map(s => s.trim()).filter(Boolean) }, 'PATCH'); onChanged(); closeInfo()
        })}>{t('保存说明和标签', 'Save caption and tags')}</button>
        {brandId && <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => void start('selected', [infoAsset.id])}>{t('重新分析', 'Analyze again')}</button>}
        {brandId && infoAsset.analysisTask && <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => void run(() => showBatch(infoAsset.analysisTask!.batchId))}>{t('查看归类建议', 'View recommendations')}</button>}
      </div>
    </Modal>}

    {open && <Modal title={t('图片分析与推荐归类', 'Image analysis and folders')} close={() => setOpen(false)}>
      <p className="text-sm text-slate-500">{t('分析会自动添加说明和标签；确认后才创建文件夹和移动图片。', 'Analysis adds captions and tags. Folders and moves are applied only after confirmation.')}</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2"><button disabled={busy || !selected.length} onClick={() => void start('selected')} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-40">{t('分析选中图片', 'Analyze selected images')} ({selected.length})</button><button disabled={busy} onClick={() => void start('unanalyzed')} className="rounded-lg border px-3 py-2 text-sm">{t('分析全库未分析图片', 'Analyze all unprocessed images')}</button></div>
      <select aria-label={t('分析批次', 'Analysis batch')} value={batch?.id || ''} onChange={e => e.target.value && void run(() => showBatch(e.target.value))} className="w-full rounded-lg border bg-transparent p-2 text-sm"><option value="">{t('选择分析批次', 'Choose a batch')}</option>{batches.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleString()} · {statusLabel(b.status)} · {b._count?.items}</option>)}</select>
      {batch && <>
        <p className="text-sm">{statusLabel(batch.status)} · {batch.items?.filter(i => i.status === 'SUCCEEDED').length}/{batch.items?.length} {t('张成功', 'succeeded')}{batch.industry === 'General' && <span className="ml-2 text-orange-600">{t('建议完善商家行业资料', 'Add your merchant industry for better results')}</span>}</p>
        {batch.error && <p className="text-sm text-orange-600">{batch.error}</p>}
        {(batch.status !== 'APPLIED' && (batch.status === 'FAILED' || batch.items?.some(i => i.status === 'FAILED'))) && <div className="space-y-2"><p className="text-xs text-slate-500">{t('仅重试失败项。上游结果未知的重试可能再次产生调用费用。', 'Only failed items are retried. Unknown upstream results may incur another model call.')}</p><button disabled={busy} onClick={() => void retry(batch.id)} className="rounded-lg border px-3 py-2 text-sm">{t('重试失败项 / 汇总', 'Retry failures / summary')}</button></div>}
        {batch.status === 'READY' && <>
          {groups.map((group, index) => <section key={index} className="space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap gap-2"><input aria-label={t('推荐文件夹名称', 'Suggested folder name')} value={group.name} disabled={!!group.folderId} maxLength={80} onChange={e => setGroups(gs => gs.map((g, i) => i === index ? { ...g, name: e.target.value } : g))} className="min-w-0 flex-1 rounded-lg border bg-transparent p-2 text-sm" /><select aria-label={t('选择已有文件夹', 'Choose existing folder')} value={group.folderId || ''} onChange={e => setGroups(gs => gs.map((g, i) => i === index ? { ...g, folderId: e.target.value || null, name: folders.find(f => f.id === e.target.value)?.name || g.name } : g))} className="rounded-lg border bg-transparent p-2 text-sm"><option value="">{t('新建文件夹', 'Create folder')}</option>{folders.filter(f => !PROTECTED_FOLDERS.includes(f.name)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <p className="text-xs text-slate-500">{group.reason} · {Object.values(choices).filter(v => v === String(index)).length} {t('张图片', 'images')}</p>
            <div className="flex gap-2 overflow-x-auto">{batch.items?.filter(item => choices[item.id] === String(index)).map(item => <img key={item.id} src={item.asset.url} alt={item.asset.filename || ''} className="h-16 w-16 flex-none rounded-lg object-cover" />)}</div>
          </section>)}
          <div className="space-y-2">{batch.items?.map(item => <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2"><img src={item.asset.url} alt="" className="h-12 w-12 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{item.asset.filename}</p><p className="text-xs text-slate-500">{item.result?.caption || item.error}</p>{item.result?.needsReview && <span className="text-xs text-orange-600">{t('需人工确认，默认跳过', 'Needs review; skipped by default')}</span>}</div><select aria-label={t('图片归类', 'Image folder')} disabled={item.status !== 'SUCCEEDED'} value={choices[item.id] ?? ''} onChange={e => setChoices(c => ({ ...c, [item.id]: e.target.value }))} className="max-w-40 rounded border bg-transparent p-2 text-xs"><option value="">{t('跳过', 'Skip')}</option>{groups.map((g, i) => <option key={i} value={i}>{g.name}</option>)}</select></div>)}</div>
          <button disabled={busy} onClick={() => void run(async () => {
            const assignments = (batch.items || []).filter(i => i.status === 'SUCCEEDED' && choices[i.id] !== '' && groups[Number(choices[i.id])]).map(i => { const group = groups[Number(choices[i.id])]; return { itemId: i.id, ...(group.folderId ? { folderId: group.folderId } : { newFolderName: group.name }) } })
            await api(base, { action: 'apply', batchId: batch.id, assignments }, 'PATCH'); await showBatch(batch.id); await refresh(); onChanged()
          })} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40">{t('确认归类', 'Confirm organization')}</button>
        </>}
      </>}
    </Modal>}

    {manage && <Modal title={t('管理文件夹', 'Manage folders')} close={() => setManage(false)}>
      <p className="text-sm text-slate-500">{t('删除文件夹后，图片保留并移回素材库。', 'Deleting a folder moves its images to the library without deleting them.')}</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => { const name = window.prompt(t('新文件夹名称', 'New folder name')); if (name) void run(async () => { await api(`/api/brands/${brandId}/folders`, { name }); await loadFolders(); onChanged() }) }}>{t('新增文件夹', 'New folder')}</button>
      {folders.map(folder => <div key={folder.id} className="flex items-center gap-2 border-b py-2 text-sm"><span className="flex-1">{folder.name} <small className="text-slate-400">({folder.assetCount || 0})</small></span>{PROTECTED_FOLDERS.includes(folder.name) ? <span className="text-xs text-slate-400">{t('系统目录', 'System folder')}</span> : <><button disabled={busy} className="rounded border px-2 py-1" onClick={() => { const name = window.prompt(t('修改名称', 'Rename folder'), folder.name); if (name && name !== folder.name) void run(async () => { await api(`/api/brands/${brandId}/folders`, { folderId: folder.id, name }, 'PATCH'); await loadFolders(); onChanged() }) }}>{t('改名', 'Rename')}</button><button disabled={busy} className="rounded border px-2 py-1 text-red-600" onClick={() => { if (window.confirm(t(`删除“${folder.name}”（${folder.assetCount || 0} 个素材）？素材将移回根目录，不会删除。`, `Delete “${folder.name}” (${folder.assetCount || 0} assets)? Images will move to the library.`))) void run(async () => { const response = await fetch(`/api/brands/${brandId}/folders?folderId=${folder.id}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await loadFolders(); onChanged() }) }}>{t('删除', 'Delete')}</button></>}</div>)}
    </Modal>}
  </>
}
