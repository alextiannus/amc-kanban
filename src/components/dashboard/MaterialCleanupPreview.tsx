'use client'

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import { FileImage, Film, Play } from 'lucide-react'

export type ReviewMedia = { id: string; filename: string | null; url: string; mimeType?: string; thumbnailUrl?: string | null; thumbnailStatus?: string }
export const reviewIsVideo = (asset: ReviewMedia) => asset.mimeType?.startsWith('video/') || /\.(mp4|mov|webm|m4v)(?:[?#]|$)/i.test(asset.url)

export function ReviewThumbnail({ asset, onPreview }: { asset: ReviewMedia; onPreview: () => void }) {
  const video = reviewIsVideo(asset)
  const [failed, setFailed] = useState<string[]>([]), [visible, setVisible] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const source = asset.thumbnailUrl && !failed.includes(asset.thumbnailUrl) ? asset.thumbnailUrl : !video && !failed.includes(asset.url) ? asset.url : null
  useEffect(() => {
    const node = button.current
    if (!node || !video || source) return
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '120px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [video, source])
  return <button data-review-id={asset.id} ref={button} type="button" onClick={onPreview} aria-label={`预览 ${asset.filename || asset.id}`} className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 sm:h-24 sm:w-32 dark:bg-slate-800">
    {source ? <img src={source} alt={asset.filename || '素材缩略图'} loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailed(prior => [...prior, source])} />
      : video && visible && !failed.includes(asset.url) ? <video src={`${asset.url.split('#')[0]}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true" className="h-full w-full object-cover" onError={() => setFailed(prior => [...prior, asset.url])} />
      : <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-[10px]">{video ? <Film size={22} /> : <FileImage size={22} />}{failed.includes(asset.url) ? '封面不可用，点击预览' : '点击预览'}</span>}
    {video && <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><Play size={24} className="rounded-full bg-black/50 p-1 text-white" /></span>}
    <span className="absolute bottom-0 left-0 rounded-tr bg-slate-950/70 px-1.5 py-0.5 text-[10px] text-white">{video ? '视频' : '图片'}</span>
  </button>
}

export function ReviewMediaViewer({ asset, onBack }: { asset: ReviewMedia; onBack: () => void }) {
  const [failed, setFailed] = useState(false)
  const player = useRef<HTMLVideoElement>(null)
  const video = reviewIsVideo(asset)
  useEffect(() => {
    const node = player.current
    return () => { if (node) { node.pause(); node.removeAttribute('src'); node.load() } }
  }, [])
  return <section aria-label="素材预览" className="my-4 space-y-3">
    <div className="flex items-center gap-2"><h3 className="min-w-0 flex-1 break-words text-sm font-semibold">{asset.filename || asset.id}</h3><button type="button" autoFocus onClick={onBack} className="shrink-0 rounded border px-3 py-2 text-xs">返回整理列表</button></div>
    <div className="flex min-h-48 items-center justify-center rounded-xl bg-slate-950 p-2">
      {failed ? <p role="status" className="p-4 text-sm text-white">预览加载失败，请尝试打开原文件。</p> : video
        ? <video ref={player} src={asset.url} controls playsInline preload="metadata" poster={asset.thumbnailUrl || undefined} onError={() => setFailed(true)} className="max-h-[55dvh] max-w-full" />
        : <img src={asset.url} alt={asset.filename || '素材大图'} onError={() => setFailed(true)} className="max-h-[55dvh] max-w-full object-contain" />}
    </div>
    <a href={asset.url} target="_blank" rel="noreferrer" className="inline-block text-xs text-indigo-600">打开原文件 ↗</a>
    <p className="text-xs text-slate-500">预览不会改变已选素材、分类或归档。</p>
  </section>
}
