'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

type FullscreenMediaPreviewProps = {
  mediaUrl: string | null
  isVideo: boolean
  title: string
  description?: string
  onClose: () => void
}

export default function FullscreenMediaPreview({
  mediaUrl,
  isVideo,
  title,
  description,
  onClose,
}: FullscreenMediaPreviewProps) {
  useEffect(() => {
    if (!mediaUrl) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mediaUrl, onClose])

  if (!mediaUrl) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950 p-4 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black">{title}</h2>
          {description && <p className="mt-0.5 line-clamp-2 text-xs font-medium text-white/65">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          title="Close fullscreen preview"
          aria-label="Close fullscreen preview"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(event) => event.stopPropagation()}>
        {isVideo ? (
          <video src={mediaUrl} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
        ) : (
          <img src={mediaUrl} alt={title} className="max-h-full max-w-full object-contain" />
        )}
      </div>
    </div>
  )
}