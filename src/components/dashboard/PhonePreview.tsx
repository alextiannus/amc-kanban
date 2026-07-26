'use client'
/**
 * PhonePreview — Shared phone frame and platform-native preview components.
 *
 * Exported and reused by:
 *   - QuickPreviewModal   (single draft review in the post management list)
 *   - PostDetailModal     (published post analytics detail)
 *   - PostPreviewModal    (creation-flow multi-platform preview cards)
 */
import React, { useState, useRef } from 'react'
import {
  Eye, ChevronLeft, ChevronRight,
  Play, Pause, Volume2, VolumeX,
  Heart, MessageCircle, Bookmark, Share2,
  Home, PlusSquare, Film, User, Search,
  ThumbsUp, Globe, Music2, MoreHorizontal, Send,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlatformKey = 'instagram' | 'tiktok' | 'facebook' | 'xhs' | 'google' | 'channel'

/** Minimal post data required for any platform preview. */
export interface PreviewPost {
  caption: string
  hashtags: string[]
  mediaUrls: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isVideoUrl(url: string): boolean {
  if (!url) return false
  const path = url.split('?')[0].split('#')[0]
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)$/i.test(path)
}

export function normalizePlatform(platformId?: string | null): PlatformKey {
  if (!platformId) return 'channel'
  const p = platformId.toLowerCase()
  if (p.includes('instagram')) return 'instagram'
  if (p.includes('tiktok')) return 'tiktok'
  if (p.includes('facebook')) return 'facebook'
  if (['red', 'xhs', 'xiaohongshu', 'rednote'].includes(p)) return 'xhs'
  if (p.includes('google')) return 'google'
  return 'channel'
}

export function platformLabel(platformId?: string | null) {
  const p = normalizePlatform(platformId)
  const map: Record<PlatformKey, string> = {
    instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook',
    xhs: '小红书', google: 'Google Business', channel: 'Channel',
  }
  return map[p]
}

export function platformGradient(platform: PlatformKey) {
  const map: Record<PlatformKey, string> = {
    instagram: 'from-pink-500 via-rose-500 to-orange-400',
    tiktok: 'from-slate-900 to-slate-700',
    facebook: 'from-blue-700 to-blue-500',
    xhs: 'from-rose-500 to-pink-600',
    google: 'from-emerald-500 to-teal-500',
    channel: 'from-indigo-500 to-violet-500',
  }
  return map[platform]
}

// ─── Media Components ─────────────────────────────────────────────────────────

export function VideoPlayer({ url, className }: { url: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0)

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }
  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  return (
    <div className={`relative group bg-black overflow-hidden ${className}`} onClick={togglePlay}>
      <video ref={videoRef} src={url} className="w-full h-full object-cover" muted={muted} loop playsInline
        onTimeUpdate={() => { const v = videoRef.current; if (v?.duration) setProgress((v.currentTime / v.duration) * 100) }}
        onEnded={() => setPlaying(false)}
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
          <button onClick={togglePlay} className="text-white">{playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-white" />}</button>
          <div className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"><div className="h-full bg-white rounded-full" style={{ width: `${progress}%` }} /></div>
          <button onClick={toggleMute} className="text-white">{muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</button>
        </div>
      </div>
    </div>
  )
}

export function MediaSlot({ url, className }: { url: string; className?: string }) {
  if (!url) return <div className={`bg-slate-200 flex items-center justify-center ${className}`}><Eye className="h-6 w-6 text-slate-400" /></div>
  if (isVideoUrl(url)) return <VideoPlayer url={url} className={className} />
  return <img src={url} alt="" className={`object-cover ${className}`} />
}

export function MediaCarousel({ media, index, setIndex }: { media: string[]; index: number; setIndex: (i: number) => void }) {
  const cur = media[index]
  return (
    <div className="relative w-full" style={{ aspectRatio: '1/1' }}>
      <MediaSlot url={cur ?? ''} className="w-full h-full" />
      {media.length > 1 && (
        <>
          <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setIndex(Math.min(media.length - 1, index + 1))} disabled={index === media.length - 1}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {media.map((_, i) => <div key={i} className={`rounded-full transition-all ${i === index ? 'w-3 h-1.5 bg-blue-500' : 'w-1.5 h-1.5 bg-white/60'}`} />)}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Phone Frame ─────────────────────────────────────────────────────────────

export function PhoneFrame({ children, dark, scale = 1 }: { children: React.ReactNode; dark?: boolean; scale?: number }) {
  const baseWidth = 294
  const border = Math.round(10 * scale)
  const br = Math.round(44 * scale)
  const brInner = Math.round(36 * scale)
  const screenH = Math.round(580 * scale)
  const btnTop1 = Math.round(68 * scale)
  const btnTop2 = Math.round(108 * scale)
  const btnTop3 = Math.round(168 * scale)
  const btnRTop = Math.round(105 * scale)
  const btnH1 = Math.round(30 * scale)
  const btnH2 = Math.round(50 * scale)
  const btnHR = Math.round(70 * scale)
  const hiW = Math.round(112 * scale)
  const hiH = Math.round(4 * scale)
  const statusH = Math.round(44 * scale)
  const statusFs = Math.round(11 * scale)

  return (
    <div className="relative mx-auto" style={{ width: baseWidth * scale }}>
      {/* Outer shell */}
      <div
        className={`relative ${dark ? 'bg-slate-900' : 'bg-white'}`}
        style={{
          borderRadius: br,
          border: `${border}px solid #1e293b`,
          boxShadow: '0 0 0 1.5px #334155, 0 25px 70px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Physical buttons */}
        <div className="absolute bg-slate-600 rounded-l-sm" style={{ left: -(border + 3), top: btnTop1, width: 3, height: btnH1 }} />
        <div className="absolute bg-slate-600 rounded-l-sm" style={{ left: -(border + 3), top: btnTop2, width: 3, height: btnH2 }} />
        <div className="absolute bg-slate-600 rounded-l-sm" style={{ left: -(border + 3), top: btnTop3, width: 3, height: btnH2 }} />
        <div className="absolute bg-slate-600 rounded-r-sm" style={{ right: -(border + 3), top: btnRTop, width: 3, height: btnHR }} />

        {/* Screen */}
        <div
          className={`overflow-hidden flex flex-col ${dark ? 'bg-black' : 'bg-white'}`}
          style={{ borderRadius: brInner, height: screenH }}
        >
          {/* Status bar */}
          <div
            className={`relative flex items-center justify-between px-5 shrink-0 ${dark ? 'text-white' : 'text-black'}`}
            style={{ height: statusH, fontSize: statusFs, fontWeight: 700 }}
          >
            <span style={{ letterSpacing: '-0.3px' }}>9:41</span>
            {/* Dynamic island */}
            <div className="absolute left-1/2 -translate-x-1/2" style={{ top: Math.round(10*scale), width: Math.round(90*scale), height: Math.round(28*scale), background: '#000', borderRadius: 999 }} />
            <div className="flex items-center gap-1" style={{ opacity: 0.85 }}>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
                <rect x="0" y="5" width="3" height="7" rx="0.6" /><rect x="4.5" y="3.5" width="3" height="8.5" rx="0.6" />
                <rect x="9" y="1.5" width="3" height="10.5" rx="0.6" /><rect x="13.5" y="0" width="2.5" height="12" rx="0.6" opacity="0.35" />
              </svg>
              <svg width="15" height="12" viewBox="0 0 15 12" fill="currentColor">
                <path d="M7.5 3C9.5 3 11.3 3.9 12.5 5.3L13.8 3.7C12.2 1.9 9.97 0.8 7.5 0.8C5.03 0.8 2.8 1.9 1.2 3.7L2.5 5.3C3.7 3.9 5.5 3 7.5 3Z" />
                <path d="M7.5 6C8.75 6 9.87 6.55 10.65 7.44L11.9 5.87C10.77 4.69 9.22 3.94 7.5 3.94C5.78 3.94 4.23 4.69 3.1 5.87L4.35 7.44C5.13 6.55 6.25 6 7.5 6Z" />
                <circle cx="7.5" cy="10.5" r="1.5" />
              </svg>
              <svg width="24" height="12" viewBox="0 0 24 12" fill="currentColor">
                <rect x="0" y="1" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                <rect x="1.5" y="2.5" width="16" height="7" rx="1.5" />
                <path d="M21 4v4a2 2 0 000-4z" />
              </svg>
            </div>
          </div>

          {/* App content */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </div>

      {/* Home indicator */}
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full ${dark ? 'bg-white/25' : 'bg-black/20'}`}
        style={{ width: hiW, height: hiH }}
      />
    </div>
  )
}

// ─── Platform-native App Previews ─────────────────────────────────────────────

export function InstagramPreview({ post, media, idx, setIdx, account }: {
  post: PreviewPost; media: string[]; idx: number; setIdx: (i: number) => void; account: string
}) {
  const caption = post.caption
  const tags = post.hashtags.map(h => `#${h}`).join(' ')
  return (
    <div className="flex flex-col h-full bg-white text-black">
      {/* Nav */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
        <span className="font-black text-[15px]" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Instagram</span>
        <div className="flex gap-3 text-black"><Heart className="h-5 w-5" /><Send className="h-5 w-5 -rotate-12" /></div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Post header */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 via-rose-500 to-orange-400 p-[2px]">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-[10px] font-black">{account.charAt(0).toUpperCase()}</div>
          </div>
          <div className="flex-1"><p className="text-[11px] font-black leading-tight">{account}</p><p className="text-[9px] text-slate-400">Singapore · Sponsored</p></div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>

        {/* Media */}
        <MediaCarousel media={media} index={idx} setIndex={setIdx} />

        {/* Action row */}
        <div className="flex items-center px-3 pt-2 pb-1 gap-3">
          <Heart className="h-6 w-6" /><MessageCircle className="h-6 w-6" /><Send className="h-6 w-6 -rotate-12" />
          <Bookmark className="h-6 w-6 ml-auto" />
        </div>
        <p className="px-3 text-[11px] font-black pb-1">1,284 likes</p>

        {/* Caption */}
        <div className="px-3 pb-3">
          <p className="text-[11px] leading-snug">
            <span className="font-black">{account} </span>
            <span className="text-slate-700">{caption.slice(0, 90)}{caption.length > 90 && '…'}</span>
          </p>
          {tags && <p className="text-[10px] text-blue-500 mt-0.5 leading-snug">{tags.slice(0, 60)}</p>}
          <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-wide">2 minutes ago</p>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-around px-2 py-2 border-t border-slate-100 shrink-0">
        <Home className="h-5 w-5" /><Search className="h-5 w-5 text-slate-400" /><PlusSquare className="h-5 w-5 text-slate-400" /><Film className="h-5 w-5 text-slate-400" /><User className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  )
}

export function TikTokPreview({ post, media, idx, setIdx, account }: {
  post: PreviewPost; media: string[]; idx: number; setIdx: (i: number) => void; account: string
}) {
  const cur = media[idx] ?? media[0]
  const caption = [post.caption, ...post.hashtags.map(h => `#${h}`)].join(' ')
  const hasVideo = media.some(isVideoUrl)
  return (
    <div className="relative flex flex-col h-full bg-black text-white overflow-hidden">
      {/* Full-bleed media */}
      <div className="absolute inset-0">
        {hasVideo ? (
          <MediaSlot url={cur ?? ''} className="w-full h-full" />
        ) : cur ? (
          <>
            <img src={cur} alt="" className="h-full w-full object-cover" />
            {media.length > 1 && (
              <>
                <button onClick={() => setIdx(idx > 0 ? idx - 1 : media.length - 1)}
                  className="absolute left-2 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setIdx((idx + 1) % media.length)}
                  className="absolute right-12 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute top-12 right-3 z-20 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold text-white">
                  {idx + 1}/{media.length}
                </div>
              </>
            )}
          </>
        ) : (
          <MediaSlot url="" className="w-full h-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/20" />
      </div>

      {/* Top nav */}
      <div className="relative z-10 flex items-center justify-center gap-4 pt-1 pb-0.5 shrink-0">
        <span className="text-[11px] font-semibold text-white/60">Following</span>
        <div className="flex flex-col items-center">
          <span className="text-[12px] font-black">For You</span>
          <div className="w-4 h-0.5 bg-white rounded-full mt-0.5" />
        </div>
        <span className="text-[11px] font-semibold text-white/60">LIVE</span>
      </div>

      {/* Right sidebar */}
      <div className="absolute right-2 bottom-20 z-10 flex flex-col items-center gap-5">
        <div className="flex flex-col items-center">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center font-black text-[11px] border-2 border-white">{account.charAt(0).toUpperCase()}</div>
          <div className="w-3.5 h-3.5 rounded-full bg-rose-500 flex items-center justify-center -mt-1.5 border border-black"><span className="text-white text-[8px] font-black">+</span></div>
        </div>
        <div className="flex flex-col items-center gap-0.5"><Heart className="h-7 w-7 fill-white" /><span className="text-[9px] font-bold">58.2k</span></div>
        <div className="flex flex-col items-center gap-0.5"><MessageCircle className="h-7 w-7" /><span className="text-[9px] font-bold">824</span></div>
        <div className="flex flex-col items-center gap-0.5"><Share2 className="h-7 w-7" /><span className="text-[9px] font-bold">分享</span></div>
        <div className="w-9 h-9 rounded-full border-4 border-[#1a1a1a] bg-slate-700 flex items-center justify-center shadow-inner">
          <Music2 className="h-3.5 w-3.5 text-white" />
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-12 left-3 right-14 z-10">
        <p className="text-[11px] font-black mb-1">@{account}</p>
        <p className="text-[10px] leading-snug text-white/90 line-clamp-2">{caption.slice(0, 100)}</p>
        <div className="flex items-center gap-1 mt-1.5">
          <Music2 className="h-3 w-3 text-white/70 shrink-0" />
          <p className="text-[9px] text-white/60 truncate">原声 · {account}</p>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-around px-3 py-2 border-t border-white/10 bg-black/60 shrink-0">
        <Home className="h-5 w-5" /><Search className="h-5 w-5 text-white/50" />
        <div className="relative"><div className="w-9 h-6 rounded-md border-[1.5px] border-white flex items-center justify-center"><span className="text-white text-base font-black leading-none">+</span></div></div>
        <MessageCircle className="h-5 w-5 text-white/50" /><User className="h-5 w-5 text-white/50" />
      </div>
    </div>
  )
}

export function XHSPreview({ post, media, idx, setIdx, account }: {
  post: PreviewPost; media: string[]; idx: number; setIdx: (i: number) => void; account: string
}) {
  const cur = media[idx]
  const title = post.caption.split(/[。！\n]/)[0].slice(0, 28) || post.caption.slice(0, 28)
  const body = post.caption.slice(0, 100)

  return (
    <div className="flex flex-col h-full bg-white text-black">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
        <ChevronLeft className="h-5 w-5 text-slate-600" />
        <div className="flex gap-3"><Search className="h-4 w-4 text-slate-500" /><MoreHorizontal className="h-4 w-4 text-slate-500" /></div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Media 3:4 */}
        <div className="relative w-full bg-slate-100" style={{ aspectRatio: '3/4' }}>
          <MediaSlot url={cur ?? ''} className="w-full h-full" />
          {media.length > 1 && (
            <>
              <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setIdx(Math.min(media.length - 1, idx + 1))} disabled={idx === media.length - 1}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <div className="absolute bottom-2 right-3 bg-black/50 text-white text-[9px] font-bold px-2 py-0.5 rounded-full z-10">{idx + 1}/{media.length}</div>
            </>
          )}
        </div>

        <div className="px-3 pt-2 pb-1">
          <p className="text-[13px] font-black leading-snug mb-1">{title}</p>
          <p className="text-[11px] text-slate-600 leading-snug">{body}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {post.hashtags.slice(0, 5).map(tag => <span key={tag} className="text-[10px] text-blue-500 font-semibold">#{tag}</span>)}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-rose-400 flex items-center justify-center text-white text-[10px] font-black shrink-0">{account.charAt(0).toUpperCase()}</div>
          <p className="text-[11px] font-bold flex-1 truncate">{account}</p>
          <button className="text-[10px] font-black text-rose-500 border border-rose-400 rounded-full px-2.5 py-0.5 shrink-0">关注</button>
        </div>

        <div className="flex items-center gap-5 px-3 pb-3 border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1"><Heart className="h-4 w-4 text-slate-400" /><span className="text-[10px] text-slate-500">2.4k</span></div>
          <div className="flex items-center gap-1"><MessageCircle className="h-4 w-4 text-slate-400" /><span className="text-[10px] text-slate-500">86</span></div>
          <div className="flex items-center gap-1"><Bookmark className="h-4 w-4 text-slate-400" /><span className="text-[10px] text-slate-500">收藏</span></div>
          <Share2 className="h-4 w-4 text-slate-400 ml-auto" />
        </div>
      </div>

      <div className="flex items-center justify-around px-2 py-1.5 border-t border-slate-100 shrink-0">
        <Home className="h-5 w-5 text-rose-500" /><Search className="h-5 w-5 text-slate-400" />
        <div className="w-10 h-7 rounded-lg bg-rose-500 flex items-center justify-center"><span className="text-white font-black text-lg leading-none">+</span></div>
        <MessageCircle className="h-5 w-5 text-slate-400" /><User className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  )
}

export function FacebookPreview({ post, media, idx, setIdx, account }: {
  post: PreviewPost; media: string[]; idx: number; setIdx: (i: number) => void; account: string
}) {
  const cur = media[idx]
  const caption = post.caption.slice(0, 130)
  return (
    <div className="flex flex-col h-full bg-[#f0f2f5] text-black">
      <div className="bg-[#1877f2] flex items-center justify-between px-3 py-2 shrink-0">
        <span className="text-white font-black text-[15px]" style={{ fontFamily: 'Georgia, serif' }}>facebook</span>
        <div className="flex gap-3"><Search className="h-4 w-4 text-white" /><MessageCircle className="h-4 w-4 text-white" /></div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-2 px-3 py-2 overflow-x-hidden shrink-0">
          {['你', account.slice(0, 1), 'A', 'B'].map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5 shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black text-white ${i === 0 ? 'bg-[#1877f2]' : 'bg-gradient-to-br from-pink-400 to-orange-400'}`}>{s}</div>
              <span className="text-[8px] text-slate-500 truncate w-10 text-center">{i === 0 ? '你的' : account.slice(0, 4)}</span>
            </div>
          ))}
        </div>

        <div className="bg-white shadow-sm">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#1877f2] flex items-center justify-center text-white text-[11px] font-black">{account.charAt(0).toUpperCase()}</div>
            <div className="flex-1">
              <p className="text-[11px] font-black">{account}</p>
              <div className="flex items-center gap-1 text-[9px] text-slate-400"><span>2分钟前</span><span>·</span><Globe className="h-2.5 w-2.5" /></div>
            </div>
            <MoreHorizontal className="h-4 w-4 text-slate-400" />
          </div>
          <p className="px-3 pb-2 text-[11px] leading-snug">{caption}{post.caption.length > 130 && <span className="text-[#1877f2] font-bold"> 查看更多</span>}</p>

          {cur && (
            <div className="relative bg-slate-100">
              <MediaSlot url={cur} className="w-full max-h-44" />
              {media.length > 1 && (
                <>
                  <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
                    className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10"><ChevronLeft className="h-3 w-3" /></button>
                  <button onClick={() => setIdx(Math.min(media.length - 1, idx + 1))} disabled={idx === media.length - 1}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10"><ChevronRight className="h-3 w-3" /></button>
                </>
              )}
            </div>
          )}

          <div className="px-3 py-1 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center"><span className="text-[13px]">👍</span><span className="text-[13px]">❤️</span><span className="text-[10px] text-slate-500 ml-1">1.2k</span></div>
            <span className="text-[10px] text-slate-500">48 条评论</span>
          </div>
          <div className="flex items-center justify-around px-1 py-1">
            {[{ icon: <ThumbsUp className="h-3.5 w-3.5" />, label: '赞' }, { icon: <MessageCircle className="h-3.5 w-3.5" />, label: '评论' }, { icon: <Share2 className="h-3.5 w-3.5" />, label: '分享' }].map(({ icon, label }) => (
              <button key={label} className="flex items-center gap-1 text-[10px] font-bold text-slate-500 py-1 px-2 rounded-md hover:bg-slate-100">{icon}{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-around px-2 py-1.5 bg-white border-t border-slate-200 shrink-0">
        <Home className="h-5 w-5 text-[#1877f2]" /><User className="h-5 w-5 text-slate-400" /><Film className="h-5 w-5 text-slate-400" />
        <MessageCircle className="h-5 w-5 text-slate-400" /><MoreHorizontal className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  )
}

// ─── Google Business Preview ──────────────────────────────────────────────────

export function GoogleBusinessPreview({ post, media, idx, setIdx, account }: {
  post: PreviewPost; media: string[]; idx: number; setIdx: (i: number) => void; account: string
}) {
  const cur = media[idx]
  const snippet = post.caption.slice(0, 120)
  return (
    <div className="flex flex-col h-full bg-white text-black">
      {/* Google Maps-style header */}
      <div className="bg-white border-b border-slate-100 px-3 py-2 flex items-center gap-2 shrink-0">
        {/* Google G logo */}
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.9c-.5 2.8-2.1 5.1-4.5 6.7v5.6h7.3c4.3-3.9 6.4-9.7 6.4-16.3z"/>
          <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.3-5.6c-2 1.3-4.5 2.1-7.2 2.1-5.5 0-10.2-3.7-11.9-8.7H4.5v5.8C8.1 42.5 15.5 46 24 46z"/>
          <path fill="#FBBC05" d="M12.1 28.5c-.4-1.3-.7-2.6-.7-4s.3-2.7.7-4v-5.8H4.5C2.9 17.8 2 20.8 2 24s.9 6.2 2.5 9.3l7.6-4.8z"/>
          <path fill="#EA4335" d="M24 10.3c3.1 0 5.9 1.1 8.1 3.1l6.1-6.1C34.9 4 29.9 2 24 2 15.5 2 8.1 5.5 4.5 11.5l7.6 5.8c1.7-5 6.4-7 11.9-7z"/>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black truncate text-slate-800">{account}</p>
          <p className="text-[8px] text-slate-400">Google Business Profile</p>
        </div>
        <Search className="h-4 w-4 text-slate-400" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Business card / post header */}
        <div className="bg-slate-50 border-b border-slate-100 px-3 py-2 flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[13px] font-black shrink-0">
            {account.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-slate-800 truncate">{account}</p>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <svg key={i} width="10" height="10" viewBox="0 0 24 24" fill={i < 5 ? '#FBBC05' : 'none'} stroke="#FBBC05" strokeWidth="2">
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                </svg>
              ))}
              <span className="text-[8px] text-slate-400 ml-0.5">5.0 · Google</span>
            </div>
          </div>
        </div>

        {/* Update/post card */}
        <div className="bg-white mx-3 my-2 rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Media */}
          {cur ? (
            <div className="relative bg-slate-100" style={{ aspectRatio: '16/9' }}>
              <MediaSlot url={cur} className="w-full h-full" />
              {media.length > 1 && (
                <>
                  <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
                    className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setIdx(Math.min(media.length - 1, idx + 1))} disabled={idx === media.length - 1}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 z-10">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">最新动态</span>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
              <Eye className="h-6 w-6 text-emerald-300" />
            </div>
          )}

          {/* Content */}
          <div className="px-3 py-2">
            <p className="text-[10px] text-slate-400 mb-1">1 小时前 · 企业更新</p>
            <p className="text-[11px] text-slate-700 leading-snug">{snippet}{post.caption.length > 120 && <span className="text-emerald-600 font-bold"> 查看更多</span>}</p>
            {post.hashtags.length > 0 && (
              <p className="text-[10px] text-emerald-600 mt-1 font-medium">{post.hashtags.slice(0, 4).map(t => `#${t}`).join(' ')}</p>
            )}
          </div>

          {/* CTA buttons */}
          <div className="flex border-t border-slate-100">
            {['了解更多', '致电', '获取路线'].map((label, i) => (
              <button key={label} className={`flex-1 py-2 text-[10px] font-black text-emerald-600 hover:bg-emerald-50 transition-colors ${i > 0 ? 'border-l border-slate-100' : ''}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* "People also search" placeholder */}
        <div className="mx-3 mb-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">相关搜索</p>
          <div className="flex flex-wrap gap-1.5">
            {['附近餐厅', '营业时间', '评价'].map(tag => (
              <span key={tag} className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-around px-2 py-1.5 bg-white border-t border-slate-200 shrink-0">
        <Home className="h-5 w-5 text-emerald-600" />
        <Search className="h-5 w-5 text-slate-400" />
        <div className="w-9 h-7 rounded-full bg-emerald-600 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 48 48">
            <path fill="white" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.9c-.5 2.8-2.1 5.1-4.5 6.7v5.6h7.3c4.3-3.9 6.4-9.7 6.4-16.3z"/>
            <path fill="white" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.3-5.6c-2 1.3-4.5 2.1-7.2 2.1-5.5 0-10.2-3.7-11.9-8.7H4.5v5.8C8.1 42.5 15.5 46 24 46z"/>
            <path fill="white" d="M12.1 28.5c-.4-1.3-.7-2.6-.7-4s.3-2.7.7-4v-5.8H4.5C2.9 17.8 2 20.8 2 24s.9 6.2 2.5 9.3l7.6-4.8z"/>
            <path fill="white" d="M24 10.3c3.1 0 5.9 1.1 8.1 3.1l6.1-6.1C34.9 4 29.9 2 24 2 15.5 2 8.1 5.5 4.5 11.5l7.6 5.8c1.7-5 6.4-7 11.9-7z"/>
          </svg>
        </div>
        <MessageCircle className="h-5 w-5 text-slate-400" />
        <User className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  )
}

// ─── Composed Platform Preview (picks the right app UI) ──────────────────────

export function PlatformPreview({
  post, platform, account, mediaIndex = 0, onMediaIndex,
}: {
  post: PreviewPost
  platform: PlatformKey
  account: string
  mediaIndex?: number
  onMediaIndex?: (i: number) => void
}) {
  const [localIdx, setLocalIdx] = useState(0)
  const idx = onMediaIndex ? mediaIndex : localIdx
  const setIdx = onMediaIndex ?? setLocalIdx
  const media = post.mediaUrls.filter(Boolean)

  if (platform === 'tiktok') return <TikTokPreview post={post} media={media} idx={idx} setIdx={setIdx} account={account} />
  if (platform === 'xhs')     return <XHSPreview post={post} media={media} idx={idx} setIdx={setIdx} account={account} />
  if (platform === 'facebook') return <FacebookPreview post={post} media={media} idx={idx} setIdx={setIdx} account={account} />
  if (platform === 'google' || platform === 'channel') return <GoogleBusinessPreview post={post} media={media} idx={idx} setIdx={setIdx} account={account} />
  return <InstagramPreview post={post} media={media} idx={idx} setIdx={setIdx} account={account} />
}

// ─── Convenience: PhonePreview (frame + platform content) ────────────────────

export function PhonePreview({
  post, platform, account, scale,
}: {
  post: PreviewPost
  platform: PlatformKey
  account: string
  scale?: number
}) {
  const isDark = platform === 'tiktok'
  return (
    <PhoneFrame dark={isDark} scale={scale}>
      <PlatformPreview post={post} platform={platform} account={account} />
    </PhoneFrame>
  )
}
