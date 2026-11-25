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

type DirectoryRoot = Pick<MaterialRoot, 'id' | 'name' | 'description'>
type DirectoryGroup = Pick<DirectoryRoot, 'id' | 'name'> & Partial<Pick<DirectoryRoot, 'description'>>

export function MaterialDirectoryTree({ groups, folders, rootId, folderId, onSelectFolder, onSelectRoot, disabled, visible = true }: {
  groups: readonly DirectoryGroup[]
  folders: readonly ManagedFolder[]
  rootId?: string
  folderId?: string
  onSelectFolder: (folder: ManagedFolder) => void
  onSelectRoot?: (rootId: string) => void
  disabled?: boolean
  visible?: boolean
}) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])
  if (!visible) return null

  const query = search.trim().toLowerCase()
  const groupsById = new Map(groups.map(group => [group.id, group]))
  const foldersById = new Map(folders.map(folder => [folder.id, folder]))
  const matchingFolders = new Set<string>()

  if (query) {
    for (const folder of folders) {
      const group = groupsById.get(folder.materialClass)
      if (!group || !`${group.name} / ${folder.path}`.toLowerCase().includes(query)) continue
      let ancestor: ManagedFolder | undefined = folder
      while (ancestor && !matchingFolders.has(ancestor.id)) {
        matchingFolders.add(ancestor.id)
        ancestor = ancestor.parentId ? foldersById.get(ancestor.parentId) : undefined
      }
    }
  }

  const rootFolders = new Map<string, ManagedFolder[]>()
  const childrenById = new Map<string, ManagedFolder[]>()
  for (const folder of folders) {
    if (query && !matchingFolders.has(folder.id)) continue
    const index = folder.parentId ? childrenById : rootFolders
    const key = folder.parentId ?? folder.materialClass
    const siblings = index.get(key)
    if (siblings) siblings.push(folder)
    else index.set(key, [folder])
  }

  const renderFolder = (folder: ManagedFolder): React.ReactNode => {
    const children = childrenById.get(folder.id) ?? []
    const isExpanded = children.length > 0 && (!!query || expanded.includes(folder.id))
    return (
      <li key={folder.id}>
        <div className="flex items-center">
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={`${isExpanded ? '折叠' : '展开'} ${folder.name}`}
              aria-expanded={isExpanded}
              disabled={disabled || !!query}
              className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 disabled:hover:bg-transparent dark:hover:bg-slate-800"
              onClick={() => setExpanded(ids => isExpanded ? ids.filter(id => id !== folder.id) : [...ids, folder.id])}
            >
              <ChevronRight size={14} className={isExpanded ? 'rotate-90' : ''} />
            </button>
          ) : <span aria-hidden="true" className="w-7 shrink-0" />}
          <button
            type="button"
            aria-current={folderId === folder.id ? (onSelectRoot ? 'page' : true) : undefined}
            disabled={disabled}
            onClick={() => {
              if (onSelectRoot) setSearch('')
              onSelectFolder(folder)
            }}
            className="min-w-0 flex-1 rounded-lg p-2 text-left text-sm hover:bg-indigo-50 aria-[current]:bg-indigo-50 aria-[current]:font-medium dark:hover:bg-slate-800 dark:aria-[current]:bg-indigo-950/60"
          >
            <span className="break-words">{folder.name}</span>{' '}
            <small className="text-slate-500 dark:text-slate-400">{folder.subtreeAssetCount}</small>
          </button>
        </div>
        {isExpanded && <ul className="ml-4 border-l border-slate-200 pl-1 dark:border-slate-700">{children.map(renderFolder)}</ul>}
      </li>
    )
  }

  const visibleGroups = onSelectRoot ? groups : groups.filter(group => rootFolders.has(group.id))
  return (
    <>
      <input aria-label="搜索目录" placeholder="搜索目录" value={search} disabled={disabled} onChange={e => setSearch(e.target.value)} className="mb-2 w-full rounded border bg-transparent p-2 text-sm" />
      <div className="space-y-1">
        {visibleGroups.map(group => (
          <section key={group.id}>
            <div className="flex min-h-9 items-center rounded-lg bg-slate-50 dark:bg-slate-800">
              {onSelectRoot ? (
                <button type="button" aria-current={rootId === group.id && !folderId ? 'page' : undefined} onClick={() => { setSearch(''); onSelectRoot(group.id) }} className="flex-1 p-2 text-left text-sm font-semibold">{group.name}</button>
              ) : (
                <h3 className="flex-1 px-2 py-1.5 text-sm font-semibold">{group.name}</h3>
              )}
              {onSelectRoot && group.description && <RootPurpose root={{ ...group, description: group.description }} />}
            </div>
            <ul>{rootFolders.get(group.id)?.map(renderFolder)}</ul>
          </section>
        ))}
        {!visibleGroups.length && <p role="status" className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400">{query ? '没有匹配的目录' : '暂无文件夹'}</p>}
      </div>
    </>
  )
}

export default function MaterialDirectoryPicker({ roots = MATERIAL_ROOTS, folders, rootId, folderId, onChange }: {
  roots?: readonly DirectoryRoot[]
  folders: ManagedFolder[]
  rootId: string
  folderId: string
  onChange: (root: string, folder: string) => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const current = roots.find(root => root.id === rootId) || roots[0]
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!container.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const choose = (root: string, folder = '') => {
    onChange(root, folder)
    close()
  }

  return (
    <div ref={container} className="relative min-w-0 max-w-full" onKeyDown={e => {
      if (open && e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }}>
      <div className="flex items-center">
        <button ref={trigger} type="button" aria-label="素材目录" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <FolderOpen size={16} className="shrink-0" />
          <span className="truncate">{current.name}{folderId ? ` / ${folders.find(folder => folder.id === folderId)?.path || '…'}` : ''}</span>
          <ChevronDown size={14} className="shrink-0" />
        </button>
        <RootPurpose root={current} />
      </div>
      <div role="dialog" aria-label="选择素材目录" hidden={!open} className="absolute left-0 top-full z-40 mt-2 max-h-[65dvh] w-[360px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border bg-white p-2 shadow-xl dark:bg-slate-900">
        <MaterialDirectoryTree
          groups={roots}
          folders={open ? folders.filter(folder => !STATUS_FOLDER_KEYS.includes(folder.systemKey || '')) : []}
          rootId={rootId}
          folderId={folderId}
          visible={open}
          onSelectRoot={choose}
          onSelectFolder={folder => choose(folder.materialClass, folder.id)}
        />
      </div>
    </div>
  )
}
