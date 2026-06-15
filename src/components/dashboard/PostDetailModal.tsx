'use client'
/* eslint-disable @next/next/no-img-element */
import React from 'react'
import { X, Heart, MessageCircle, Eye, Share2, ExternalLink, Calendar, Tag, Play } from 'lucide-react'

function isVideoUrl(url: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:\?.*)?$/i.test(path)
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
const CT_COLORS: Record<string, string> = {
  SHORT: '#ef4444', VIDEO: '#f97316', IMAGE: '#3b82f6', LONG: '#8b5cf6', STORY: '#ec4899',
}
const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F', tiktok: '#010101', xiaohongshu: '#FF2442',
  facebook: '#1877F2', youtube: '#FF0000', google: '#4285F4',
  twitter: '#1DA1F2', x: '#000000', linkedin: '#0A66C2', unknown: '#6366f1',
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return '0'
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}K`
  return String(n)
}

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

export default function PostDetailModal({ post, onClose }: Props) {
  const platformKey = (post.platform ?? 'unknown').toLowerCase()
  const contentTypeKey = post.contentType ?? 'UNKNOWN'
  const statusKey = post.status ?? 'draft'

  const platformColor = PLATFORM_COLORS[platformKey] ?? '#6366f1'
  const ctColor = CT_COLORS[contentTypeKey] ?? '#6366f1'
  const statusCls = STATUS_COLORS[statusKey] ?? STATUS_COLORS.draft
  const pubDate = new Date(post.publishedAt ?? Date.now()).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const interactions = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0)
  const hashtags = post.hashtags ?? []
  const mediaUrls = post.mediaUrls ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${platformColor}20` }}>
              <img src={`https://cdn.simpleicons.org/${platformKey === 'unknown' ? 'github' : platformKey}/${platformColor.replace('#','')}`}
                className="w-4 h-4 object-contain" onError={e => ((e.target as HTMLImageElement).style.display='none')} alt={post.platform ?? 'unknown'} />
            </div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{post.handle || post.platform || 'unknown'}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusCls}`}>{STATUS_LABELS[statusKey] ?? statusKey}</span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: ctColor }}>{contentTypeKey}</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5">
          {/* Date */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{pubDate}</span>
            {post.scheduledAt && post.status !== 'published' && post.status !== 'done' && (
              <span className="text-amber-500 font-bold">· 排期中</span>
            )}
          </div>

          {/* Caption */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">内容文案</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{post.caption || '（无文案）'}</p>
          </div>

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Tag className="w-3 h-3" /> 标签</p>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((h: string, i: number) => (
                  <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">#{h.replace(/^#/,'')}</span>
                ))}
              </div>
            </div>
          )}

          {/* Media thumbnails */}
          {mediaUrls.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">媒体文件</p>
              <div className="flex gap-2 flex-wrap">
                {mediaUrls.slice(0, 4).map((u: string, i: number) => (
                  <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                    className="w-16 h-16 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center relative group">
                    {isVideoUrl(u) ? (
                      <>
                        <video src={u} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-70 group-hover:opacity-90 transition-opacity">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      </>
                    ) : (
                      <img src={u} alt="" className="w-full h-full object-cover" onError={e => ((e.target as HTMLImageElement).style.display='none')} />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Engagement stats */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">互动数据</p>
            <div className="grid grid-cols-4 gap-2">
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
              <p className="text-[11px] text-slate-400 mt-2 text-center">总互动 {fmtNum(interactions)} · 互动率 {post.engRate}%</p>
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
  )
}
