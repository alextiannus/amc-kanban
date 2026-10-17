'use client'

import { createContext, useContext, useRef, useState, type CSSProperties } from 'react'
import type { ActivityTextKey } from '@/lib/activityPage'

type TextField = ActivityTextKey | 'reward'
type LinkSelection = { key: string; original: string; url: string }
type Editing = {
  enabled: boolean
  locale: 'zh' | 'en'
  onText: (field: TextField, value: string) => void
  link: LinkSelection | null
  onLink: (key: string, value: string | null) => void
  closeLink: () => void
}
export const ActivityCanvasEditing = createContext<Editing>({ enabled: false, locale: 'en', onText: () => {}, link: null, onLink: () => {}, closeLink: () => {} })

export function ActivityInlineText({ as: Tag = 'p', field, children, className, style, id }: { as?: 'p' | 'h1' | 'h2' | 'span'; field: TextField; children: string; className?: string; style?: CSSProperties; id?: string }) {
  const editor = useContext(ActivityCanvasEditing)
  const [focused, setFocused] = useState(false)
  const [initial, setInitial] = useState(children)
  const composing = useRef(false)
  const read = (element: HTMLElement) => {
    if (composing.current) return
    const value = element.innerText.replace(/\r\n?/g, '\n').slice(0, 500)
    if (value !== children) editor.onText(field, value)
  }
  // Freeze React's text prop while the browser owns the caret (including IME composition).
  return <Tag id={id} className={className} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...style }} data-activity-edit={field} data-placeholder={editor.locale === 'zh' ? '点击输入文字' : 'Type here'}
    contentEditable={editor.enabled ? 'plaintext-only' : undefined} suppressContentEditableWarning
    role={editor.enabled ? 'textbox' : undefined} aria-multiline={editor.enabled || undefined}
    tabIndex={editor.enabled ? 0 : undefined}
    onFocus={() => { if (editor.enabled) { setInitial(children); setFocused(true) } }}
    onInput={event => { if (editor.enabled) read(event.currentTarget) }}
    onCompositionStart={() => { composing.current = true }}
    onCompositionEnd={event => { composing.current = false; if (editor.enabled) read(event.currentTarget) }}
    onBlur={event => { if (editor.enabled) read(event.currentTarget); setFocused(false) }}
  >{editor.enabled && focused ? initial : children}</Tag>
}

export function ActivityInlineLinkEditor({ linkKey }: { linkKey: string }) {
  const editor = useContext(ActivityCanvasEditing)
  if (!editor.enabled || !editor.link || editor.link.key !== linkKey) return null
  return <LinkInput key={editor.link.key} editor={editor} link={editor.link}/>
}
function LinkInput({ editor, link }: { editor: Editing; link: LinkSelection }) {
  const [value, setValue] = useState(link.url)
  const zh = editor.locale === 'zh'
  let valid = false
  let destination: string | null = null
  try {
    const url = new URL(value)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && value.length <= 2048) destination = url.href
    valid = url.protocol === 'https:' && Boolean(destination)
  } catch { /* Display inline validation while typing. */ }
  return <div data-activity-control className="mt-3 min-w-0 rounded-xl border border-slate-300 bg-white p-2 text-left text-slate-800">
    <label htmlFor="canvas-account-link" className="sr-only">{zh ? '账号链接' : 'Account link'}</label>
    <div className="relative">
    <textarea id="canvas-account-link" autoFocus rows={3} spellCheck={false} autoCapitalize="none" maxLength={2048} value={value} onChange={event => { setValue(event.target.value); editor.onLink(link.key, event.target.value) }} className="block w-full min-w-0 resize-y break-all rounded-lg border border-slate-300 bg-white p-2 pr-10 text-xs leading-5 text-slate-900"/>
    <button type="button" aria-label={zh ? '打开当前链接' : 'Open current link'} title={zh ? '打开当前链接' : 'Open current link'} disabled={!destination} onClick={() => { if (destination) window.open(destination, '_blank', 'noopener,noreferrer') }} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
    </button>
    </div>
    {!valid && <p role="status" className="mt-2 text-xs text-red-700">{zh ? '自定义链接请使用完整的 HTTPS 地址。' : 'Use a complete HTTPS address for a custom link.'}</p>}
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
      <button type="button" onClick={() => { setValue(link.original); editor.onLink(link.key, null); editor.closeLink() }}>{zh ? '自动同步' : 'Automatic'}</button>
      <button type="button" disabled={!valid && value !== link.original} onClick={editor.closeLink} className="ml-auto rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40">{zh ? '完成' : 'Done'}</button>
    </div>
  </div>
}
