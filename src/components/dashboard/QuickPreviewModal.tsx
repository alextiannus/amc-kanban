'use client'
import React, { useState, useEffect } from 'react'
import {
  X, Check, RefreshCw, Edit3, Trash2, ExternalLink,
  Heart, MessageCircle, Bookmark, Send,
  Loader2, Calendar, AlertTriangle,
} from 'lucide-react'
import {
  PhoneFrame, PlatformPreview, MediaSlot,
  normalizePlatform, platformLabel, platformGradient,
  type PlatformKey, type PreviewPost,
} from './PhonePreview'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuickPreviewDraft {
  id: string
  status: string
  caption: string
  hashtags: string[]
  mediaUrls: string[]
  coverAsset?: {
    id: string
    url?: string | null
  } | null
  scheduledAt?: string | null
  publishedAt?: string | null
  postUrl?: string | null
  createdAt?: string | null
  updatedAt: string
  agentNote?: string | null
  rejectionNote?: string | null
  accountId?: string | null
  account?: {
    id: string
    platformId: string
    handle?: string | null
    displayName?: string | null
  } | null
  assetRefs: Array<{
    id: string
    asset: {
      id: string
      filename?: string | null
      url?: string | null
      type: string
    }
  }>
}

interface QuickPreviewModalProps {
  draft: QuickPreviewDraft | null
  brandId: string
  isOpen: boolean
  onClose: () => void
  onApprove: (draftId: string) => Promise<void>
  onRegenerate: (draftId: string) => Promise<void>
  onEdit: (draftId: string) => void
  onDiscard: (draftId: string) => Promise<void>
  brandName?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Draft', pending_review: '待审核', approved: 'Approved',
    scheduled: 'Scheduled', published: 'Published', rejected: 'Rejected', failed: 'Failed',
  }
  return map[status] || status
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    published: 'bg-violet-50 text-violet-700 border-violet-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return map[status] || 'bg-slate-100 text-slate-600 border-slate-200'
}

function formatDateTime(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function allMedia(draft: QuickPreviewDraft): string[] {
  const assetUrls = draft.assetRefs.map((r) => r.asset.url).filter((u): u is string => Boolean(u))
  return Array.from(new Set([draft.coverAsset?.url, ...assetUrls, ...draft.mediaUrls].filter((url): url is string => Boolean(url))))
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuickPreviewModal({
  draft, brandId, isOpen, onClose, onApprove, onRegenerate, onEdit, onDiscard, brandName = 'Your Brand',
}: QuickPreviewModalProps) {
  const [mediaIndex, setMediaIndex] = useState(0)
  const [loading, setLoading] = useState<'approve' | 'regenerate' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => { setMediaIndex(0); setError(null); setLoading(null); setConfirmDiscard(false) }, [draft?.id])
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen || !draft) return null

  const media = allMedia(draft)
  const platform = normalizePlatform(draft.account?.platformId)
  const accountName = draft.account?.displayName || draft.account?.handle || brandName
  const scheduledTime = formatDateTime(draft.scheduledAt)
  const publishedTime = formatDateTime(draft.publishedAt)
  const canApprove = ['draft', 'pending_review', 'rejected', 'failed'].includes(draft.status)
  const canRegenerate = ['draft', 'pending_review', 'rejected', 'failed'].includes(draft.status)

  const handleApprove = async () => {
    setLoading('approve'); setError(null)
    try { await onApprove(draft.id); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setLoading(null) }
  }
  const handleRegenerate = async () => {
    setLoading('regenerate'); setError(null)
    try { await onRegenerate(draft.id) }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setLoading(null) }
  }
  const handleDiscard = async () => {
    if (!confirmDiscard) { setConfirmDiscard(true); return }
    setLoading('discard'); setError(null)
    try { await onDiscard(draft.id); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setLoading(null); setConfirmDiscard(false) }
  }

  const isDark = platform === 'tiktok'
  const gradClass = platformGradient(platform)
  // Build the minimal PreviewPost shape for the shared phone preview
  const previewPost: PreviewPost = { caption: draft.caption, hashtags: draft.hashtags, mediaUrls: media }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={onClose} />

      {/* Layout: phone left | actions right */}
      <div className="relative z-10 flex items-start gap-7">

        {/* ── Phone Column ───────────────────────── */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          {/* Platform pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${gradClass} shadow-lg`}>
            <span className="text-white text-xs font-black">{platformLabel(draft.account?.platformId)}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusClass(draft.status)}`}>{statusLabel(draft.status)}</span>
          </div>

          <PhoneFrame dark={isDark}>
            <PlatformPreview post={previewPost} platform={platform} account={accountName} mediaIndex={mediaIndex} onMediaIndex={setMediaIndex} />
          </PhoneFrame>

          <p className="text-[11px] text-white/35">手机预览 · 仅供参考</p>
        </div>

        {/* ── Actions Panel ──────────────────────── */}
        <div
          className="w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
          style={{ maxHeight: '92vh' }}
        >
          {/* Header */}
          <div className={`bg-gradient-to-r ${gradClass} p-4 flex items-center justify-between shrink-0`}>
            <div>
              <p className="text-sm font-black text-white">Review 草稿</p>
              <p className="text-xs text-white/70">{accountName}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">文案</p>
              <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap line-clamp-6">
                {draft.caption || <span className="text-slate-400 italic">暂无正文</span>}
              </p>
            </div>

            {draft.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.hashtags.map((tag) => (
                  <span key={tag} className="rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[11px] font-bold px-2 py-0.5">#{tag}</span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {scheduledTime && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Calendar className="h-3.5 w-3.5 shrink-0" /><span>预计发布：{scheduledTime}</span>
                </div>
              )}
              {publishedTime && (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                  <Check className="h-3.5 w-3.5 shrink-0" /><span>已发布：{publishedTime}</span>
                </div>
              )}
              {draft.postUrl && (
                <a href={draft.postUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700">
                  <ExternalLink className="h-3.5 w-3.5" />查看已发布帖子
                </a>
              )}
              {draft.agentNote && !draft.agentNote.includes('【AI 生成指令】') && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400 mb-0.5">Agent Note</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{draft.agentNote}</p>
                </div>
              )}
              {draft.rejectionNote && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
                  <p className="text-[11px] font-bold text-rose-500 mb-0.5">拒绝原因</p>
                  <p className="text-xs text-rose-700">{draft.rejectionNote}</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          {/* Action buttons */}
          <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-4 space-y-2">
            {confirmDiscard && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 flex items-center justify-between gap-2">
                <span>确定要放弃该草稿吗？</span>
                <button onClick={() => setConfirmDiscard(false)} className="text-slate-500 hover:text-slate-700 font-bold">取消</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {canApprove && (
                <button onClick={handleApprove} disabled={!!loading}
                  className="flex items-center justify-center gap-1.5 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50 transition-colors">
                  {loading === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}确认发布
                </button>
              )}
              {canRegenerate && (
                <button onClick={handleRegenerate} disabled={!!loading}
                  className="flex items-center justify-center gap-1.5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-50 transition-colors">
                  {loading === 'regenerate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}重新创作
                </button>
              )}
              <button onClick={() => { onEdit(draft.id); onClose() }} disabled={!!loading}
                className="flex items-center justify-center gap-1.5 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-sm font-black disabled:opacity-50 transition-colors">
                <Edit3 className="h-4 w-4" />手动修改
              </button>
              <button onClick={handleDiscard} disabled={!!loading}
                className={`flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-black disabled:opacity-50 transition-colors ${confirmDiscard ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-600' : 'border border-rose-200 text-rose-600 hover:bg-rose-50'}`}>
                {loading === 'discard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {confirmDiscard ? '确认放弃' : '放弃草稿'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
