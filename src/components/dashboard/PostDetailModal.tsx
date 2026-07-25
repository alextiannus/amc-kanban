'use client'
/* eslint-disable @next/next/no-img-element */
import React, { useState } from 'react'
import { X, ExternalLink, Heart, MessageCircle, Eye, Share2, Calendar } from 'lucide-react'
import {
  PhoneFrame, PlatformPreview,
  normalizePlatform, platformLabel, platformGradient,
  type PlatformKey, type PreviewPost,
} from './PhonePreview'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined) {
  if (n == null) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
const STATUS_LABELS: Record<string, string> = {
  published: '已发布', done: '已完成', pending_review: '待审核', draft: '草稿',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostDetail {
  platform?: string
  contentType?: string
  status?: string
  publishedAt?: string | number | Date
  handle?: string
  scheduledAt?: string | null
  caption?: string
  hashtags?: string[]
  mediaUrls?: string[]
  likes?: number
  comments?: number
  shares?: number
  impressions?: number
  engRate?: string | number
  postUrl?: string
}

interface Props { post: PostDetail; onClose: () => void }

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostDetailModal({ post, onClose }: Props) {
  const [mediaIndex, setMediaIndex] = useState(0)

  const platformKey = normalizePlatform(post.platform) as PlatformKey
  const isDark = platformKey === 'tiktok'
  const gradClass = platformGradient(platformKey)
  const statusKey = post.status ?? 'draft'
  const statusCls = STATUS_COLORS[statusKey] ?? STATUS_COLORS.draft

  const pubDate = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : post.scheduledAt
      ? `预计发布: ${new Date(post.scheduledAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : '未发布'

  const hashtags = post.hashtags ?? []
  const mediaUrls = post.mediaUrls ?? []
  const interactions = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0)

  const previewPost: PreviewPost = {
    caption: post.caption ?? '',
    hashtags,
    mediaUrls,
  }
  const accountName = post.handle || platformLabel(post.platform) || 'Your Brand'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" />

      {/* Layout: phone left | analytics right */}
      <div className="relative z-10 flex items-start gap-7" onClick={e => e.stopPropagation()}>

        {/* ── Phone Column ─────────────────────────── */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          {/* Platform pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${gradClass} shadow-lg`}>
            <span className="text-white text-xs font-black">{platformLabel(post.platform)}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusCls}`}>
              {STATUS_LABELS[statusKey] ?? statusKey}
            </span>
          </div>

          <PhoneFrame dark={isDark}>
            <PlatformPreview
              post={previewPost}
              platform={platformKey}
              account={accountName}
              mediaIndex={mediaIndex}
              onMediaIndex={setMediaIndex}
            />
          </PhoneFrame>

          <p className="text-[11px] text-white/35">手机预览 · 仅供参考</p>
        </div>

        {/* ── Analytics Panel ──────────────────────── */}
        <div
          className="w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
          style={{ maxHeight: '92vh' }}
        >
          {/* Header */}
          <div className={`bg-gradient-to-r ${gradClass} p-4 flex items-center justify-between shrink-0`}>
            <div>
              <p className="text-sm font-black text-white">帖文详情</p>
              <p className="text-xs text-white/70">{accountName}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Date */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{pubDate}</span>
              {post.scheduledAt && post.status !== 'published' && post.status !== 'done' && (
                <span className="text-amber-500 font-bold">· 排期中</span>
              )}
            </div>

            {/* Caption */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">内容文案</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap line-clamp-6">
                {post.caption || <span className="text-slate-400 italic">（无文案）</span>}
              </p>
            </div>

            {/* Hashtags */}
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((h: string, i: number) => (
                  <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                    #{h.replace(/^#/, '')}
                  </span>
                ))}
              </div>
            )}

            {/* Engagement stats */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">互动数据</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: <Heart className="w-3.5 h-3.5 text-pink-500" />, label: '点赞', val: post.likes },
                  { icon: <MessageCircle className="w-3.5 h-3.5 text-blue-500" />, label: '评论', val: post.comments },
                  { icon: <Share2 className="w-3.5 h-3.5 text-emerald-500" />, label: '分享', val: post.shares },
                  { icon: <Eye className="w-3.5 h-3.5 text-violet-500" />, label: '曝光', val: post.impressions },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                    <div className="flex justify-center mb-1">{item.icon}</div>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-100">{fmtNum(item.val)}</p>
                    <p className="text-[10px] text-slate-400">{item.label}</p>
                  </div>
                ))}
              </div>
              {interactions > 0 && (
                <p className="text-[11px] text-slate-400 mt-2 text-center">
                  总互动 {fmtNum(interactions)} · 互动率 {post.engRate}%
                </p>
              )}
            </div>

            {/* Link */}
            {post.postUrl && (
              <a href={post.postUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all">
                <ExternalLink className="w-4 h-4" /> 查看原帖
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
