'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import { MATERIAL_ROOTS, STATUS_FOLDER_KEYS, type MaterialRoot } from '@/lib/asset-library/roots'
import type { ManagedFolder } from './AssetFolderManager'

// Portal into the current dialog when present, so the explanation remains in
// the modal top layer. Fixed positioning avoids scroll-container clipping.
export function RootPurpose({ root }: { root: Pick<MaterialRoot, 'id' | 'name' | 'description'> }) {
  const [open, setOpen] = useState(false)
  const [portalHost, setPortalHost] = useState<Element | null>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const id = useId()
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)) })
    setPortalHost(trigger.current?.closest('dialog') || document.body)
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key, true); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  return <><button ref={trigger} type="button" aria-label={`${root.name}用途`} aria-describedby={open ? id : undefined} aria-expanded={open} onPointerEnter={e => { if (e.pointerType === 'mouse') show() }} onPointerLeave={e => { if (e.pointerType === 'mouse' && document.activeElement !== trigger.current) setOpen(false) }} onFocus={show} onBlur={() => setOpen(false)} onClick={e => { e.stopPropagation(); show() }} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline focus-visible:outline-indigo-500"><CircleAlert size={16} /></button>
    {open && portalHost && createPortal(<div ref={tip} id={id} role="tooltip" style={position} className="fixed z-[100] w-[280px] max-w-[calc(100vw-16px)] rounded-lg bg-slate-800 p-3 text-xs font-normal leading-5 text-white shadow-lg">{root.description}</div>, portalHost)}</>
}

export default function MaterialDirectoryPicker({ roots = MATERIAL_ROOTS, folders, rootId, folderId, onChange }: { roots?: readonly Pick<MaterialRoot, 'id' | 'name' | 'description'>[]; folders: ManagedFolder[]; rootId: string; folderId: string; onChange: (root: string, folder: string) => void }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [expanded, setExpanded] = useState<string[]>([])
  const container = useRef<HTMLDivElement>(null)
  const current = roots.find(r => r.id === rootId) || roots[0]
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!container.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const choose = (root: string, folder = '') => { onChange(root, folder); setOpen(false); setSearch('') }
  const node = (f: ManagedFolder, root: string): React.ReactNode => {
    if (STATUS_FOLDER_KEYS.includes(f.systemKey || '')) return null
    const children = folders.filter(c => c.parentId === f.id && c.materialClass === root)
    if (search && ![f.name, ...folders.filter(c => c.path.startsWith(f.path + ' / ')).map(c => c.name)].some(n => n.toLowerCase().includes(search.toLowerCase()))) return null
    const show = !!search || expanded.includes(f.id)
    return <li key={f.id}><div className="flex items-center"><button type="button" disabled={!children.length} aria-label={`展开 ${f.name}`} aria-expanded={show} className="h-8 w-7 shrink-0 disabled:invisible" onClick={() => setExpanded(ids => show ? ids.filter(id => id !== f.id) : [...ids, f.id])}><ChevronRight size={14} className={show ? 'rotate-90' : ''} /></button><button type="button" aria-current={folderId === f.id ? 'page' : undefined} onClick={() => choose(root, f.id)} className="min-w-0 flex-1 rounded-lg p-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-slate-800"><span className="break-words">{f.name}</span> <small className="text-slate-400">{f.subtreeAssetCount}</small></button></div>{show && <ul className="ml-4 border-l pl-1">{children.map(c => node(c, root))}</ul>}</li>
  }
  return <div ref={container} className="relative min-w-0 max-w-full" onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); container.current?.querySelector('button')?.focus() } }}>
    <div className="flex items-center"><button type="button" aria-label="素材目录" aria-expanded={open} onClick={() => setOpen(v => !v)} className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FolderOpen size={16} /><span className="truncate">{current.name}{folderId ? ` / ${folders.find(f => f.id === folderId)?.path || '…'}` : ''}</span><ChevronDown size={14} /></button><RootPurpose root={current} /></div>
    {open && <div role="dialog" aria-label="选择素材目录" className="absolute left-0 top-full z-40 mt-2 max-h-[65dvh] w-[360px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border bg-white p-2 shadow-xl dark:bg-slate-900"><input aria-label="搜索目录" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索目录" className="mb-2 w-full rounded border bg-transparent p-2 text-sm" />{roots.map(root => <section key={root.id}><div className="flex items-center rounded-lg bg-slate-50 dark:bg-slate-800"><button type="button" aria-current={rootId === root.id && !folderId ? 'page' : undefined} onClick={() => choose(root.id)} className="flex-1 p-2 text-left text-sm font-semibold">{root.name}</button><RootPurpose root={root} /></div><ul>{folders.filter(f => !f.parentId && f.materialClass === root.id).map(f => node(f, root.id))}</ul></section>)}</div>}
  </div>
}
