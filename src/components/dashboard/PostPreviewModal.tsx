'use client'
import React, { useState } from 'react'
import {
  X,
  Eye,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Edit3,
  Clock,
  Save,
  Trash2,
  Video,
  RefreshCw
} from 'lucide-react'

// Helper function to check video file extensions
function isVideoUrl(url: string): boolean {
  if (!url) return false
  const cleanUrl = url.split('?')[0].split('#')[0]
  return /\.(mp4|webm|ogg|mov)$/i.test(cleanUrl) || cleanUrl.includes('/video/')
}

// Helper function to parse hashtags
function parseTags(value: string | string[]): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  return value
    .split(/[\s,，#]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function normalizePlatformLabel(plat: string): string {
  const p = plat.toLowerCase()
  if (p === 'instagram' || p === 'ig') return 'ig'
  if (['red', 'xiaohongshu', 'xhs', 'rednote'].includes(p)) return 'xhs'
  if (p === 'facebook' || p === 'fb') return 'fb'
  if (p === 'tiktok') return 'tiktok'
  if (p === 'google_business' || p === 'google' || p === 'google_maps') return 'gbp'
  return p
}

interface PostPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  brandName?: string
  selectedAccountIds: string[]
  accountOptions: any[]
  draftCaptions: Record<string, string>
  setDraftCaptions: React.Dispatch<React.SetStateAction<Record<string, string>>>
  draftHashtags: Record<string, string>
  setDraftHashtags: React.Dispatch<React.SetStateAction<Record<string, string>>>
  draftStatuses: Record<string, 'generating' | 'completed' | 'failed'>
  isAiGenerating: boolean
  saving: boolean
  attachedMedia: any[]
  onCancel: () => void
  onSaveDraft: () => void
  onSchedule: () => void
  onRegenerate: () => void
}

export default function PostPreviewModal({
  isOpen,
  onClose,
  brandName = 'Your Brand',
  selectedAccountIds,
  accountOptions,
  draftCaptions,
  setDraftCaptions,
  draftHashtags,
  setDraftHashtags,
  draftStatuses,
  isAiGenerating,
  saving,
  attachedMedia,
  onCancel,
  onSaveDraft,
  onSchedule,
  onRegenerate
}: PostPreviewModalProps) {
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-955/65 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-5xl h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 flex flex-col shadow-2xl animate-in zoom-in-95 duration-205" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-indigo-500" />
              多平台发布预览 ({selectedAccountIds.length} 个账号)
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-0.5">实时预览不同平台的内容渲染效果</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content - Scrollable list/grid of previews */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 scrollbar-thin">
          {selectedAccountIds.length === 0 ? (
            <div className="py-20 text-center text-slate-400 dark:text-slate-555">
              <Eye className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-xs font-extrabold">请选择发布账号以查看预览</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
              {selectedAccountIds.map((accId) => {
                const account = accountOptions.find((a) => a.id === accId)
                if (!account) return null

                const platform = normalizePlatformLabel(account.platformId)
                const status = draftStatuses[accId] || 'completed'
                const isGenerating = status === 'generating'
                const isFailed = status === 'failed'

                const currentCaption = draftCaptions[accId] !== undefined ? draftCaptions[accId] : ''
                const currentHashtagsString = draftHashtags[accId] !== undefined ? draftHashtags[accId] : ''

                return (
                  <PlatformPreviewCard
                    key={accId}
                    account={account}
                    platform={platform}
                    isGenerating={isGenerating}
                    isFailed={isFailed}
                    caption={currentCaption}
                    hashtags={currentHashtagsString}
                    attachedMedia={attachedMedia}
                    brandName={brandName}
                    onOpenEdit={() => setEditingAccountId(accId)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Footer - Core Action Buttons */}
        <div className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 flex items-center justify-between shrink-0 gap-3">
          {/* Cancel generation */}
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-rose-650 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all bg-white dark:bg-slate-900 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>取消创作</span>
          </button>

          <div className="flex items-center gap-3">
            {/* Try again / Regenerate */}
            <button
              type="button"
              disabled={saving || isAiGenerating}
              onClick={onRegenerate}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900 flex items-center gap-1.5"
            >
              {saving && isAiGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-orange-500" />
              )}
              <span>再试一下</span>
            </button>

            {/* Save Draft */}
            <button
              type="button"
              disabled={saving || isAiGenerating}
              onClick={onSaveDraft}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900 flex items-center gap-1.5"
            >
              {saving && !isAiGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 text-indigo-500" />
              )}
              <span>保存草稿</span>
            </button>

            {/* Smart publish */}
            <button
              type="button"
              disabled={saving || isAiGenerating}
              onClick={onSchedule}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Clock className="w-3.5 h-3.5" />
              )}
              <span>智能排期</span>
            </button>
          </div>
        </div>

        {/* Nested Inline Edit Modal */}
        {editingAccountId && (() => {
          const account = accountOptions.find(a => a.id === editingAccountId)
          if (!account) return null
          const currentCap = draftCaptions[editingAccountId] !== undefined ? draftCaptions[editingAccountId] : ''
          const currentHash = draftHashtags[editingAccountId] !== undefined ? draftHashtags[editingAccountId] : ''
          
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setEditingAccountId(null)}>
              <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span>{account.platformId.toLowerCase() === 'instagram' ? '📸' : account.platformId.toLowerCase() === 'facebook' ? '👥' : (account.platformId.toLowerCase() === 'red' || account.platformId.toLowerCase() === 'xiaohongshu' || account.platformId.toLowerCase() === 'xhs') ? '📕' : account.platformId.toLowerCase() === 'tiktok' ? '🎵' : '📍'}</span>
                    编辑 {account.displayName || account.handle} 的发布内容
                  </h3>
                  <button onClick={() => setEditingAccountId(null)} className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">专属正文 (Caption)</label>
                    <textarea
                      value={currentCap}
                      onChange={(e) => setDraftCaptions(prev => ({ ...prev, [editingAccountId]: e.target.value }))}
                      placeholder="输入该渠道的专属文案..."
                      className="w-full min-h-[160px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">专属标签 (Hashtags)</label>
                    <input
                      type="text"
                      value={currentHash}
                      onChange={(e) => setDraftHashtags(prev => ({ ...prev, [editingAccountId]: e.target.value }))}
                      placeholder="例如: 美食 探店 推荐 (空格分隔，无需加#)"
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs text-slate-850 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-955 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingAccountId(null)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-md transition-all"
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}

// Inner subcomponent representing a single platform card
interface PlatformPreviewCardProps {
  account: any
  platform: string
  isGenerating: boolean
  isFailed: boolean
  caption: string
  hashtags: string
  attachedMedia: any[]
  brandName: string
  onOpenEdit: () => void
}

function PlatformPreviewCard({
  account,
  platform,
  isGenerating,
  isFailed,
  caption,
  hashtags,
  attachedMedia,
  brandName,
  onOpenEdit
}: PlatformPreviewCardProps) {
  const [mediaIndex, setMediaIndex] = useState(0)

  return (
    <div
      onClick={() => {
        if (!isGenerating) {
          onOpenEdit()
        }
      }}
      className={`space-y-4 border-b border-slate-100 dark:border-slate-800 pb-6 last:border-0 last:pb-0 transition-all ${
        !isGenerating ? 'cursor-pointer hover:bg-slate-100/30 dark:hover:bg-slate-800/10 p-2 rounded-2xl' : ''
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {platform.toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-400 font-bold">({account.displayName || account.handle})</span>
        </div>
        {!isGenerating && !isFailed && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenEdit() }}
            className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Edit3 className="w-3 h-3" />
            <span>编辑内容</span>
          </button>
        )}
      </div>

      <div className="relative" onClick={(e) => {
        if (e.target instanceof HTMLButtonElement || e.target instanceof SVGElement || (e.target instanceof HTMLElement && e.target.closest('button'))) {
          e.stopPropagation()
        }
      }}>
        <div className={`${isGenerating ? 'blur-[2px] opacity-70 pointer-events-none' : ''} transition-all duration-300`}>
          {platform === 'ig' && (
            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-white shadow-lg dark:border-slate-800 dark:bg-black text-black dark:text-white">
              {/* Instagram Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-900">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-[1px]">
                    <div className="h-full w-full rounded-full border border-white bg-slate-200 dark:border-black overflow-hidden">
                      <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold leading-tight">{account.displayName || account.handle || brandName}</p>
                    <p className="text-[8px] text-slate-500 leading-none mt-0.5">Singapore</p>
                  </div>
                </div>
                <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
              </div>

              {/* Instagram Media Slider */}
              <div className="relative aspect-square w-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                {attachedMedia.length > 0 ? (
                  <>
                    {isVideoUrl(attachedMedia[mediaIndex % attachedMedia.length]?.url) ? (
                      <video src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                    ) : (
                      <img src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                    )}
                    {attachedMedia.length > 1 && (
                      <>
                        <span className="absolute right-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white z-10">
                          {(mediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev + 1) % attachedMedia.length)
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-400">
                    <ImageIcon className="h-8 w-8 text-slate-300" />
                    <span className="text-[10px] font-semibold">暂无媒体文件</span>
                  </div>
                )}
              </div>

              {/* Instagram Actions */}
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between text-base leading-none">
                  <div className="flex items-center gap-3">
                    <Heart className="w-4.5 h-4.5 text-slate-800 dark:text-slate-200 hover:text-red-500 hover:fill-red-500 transition-colors cursor-pointer" />
                    <MessageCircle className="w-4.5 h-4.5 text-slate-800 dark:text-slate-200 hover:text-slate-500 transition-colors cursor-pointer" />
                    <Send className="w-4.5 h-4.5 text-slate-800 dark:text-slate-200 hover:text-slate-500 transition-colors cursor-pointer rotate-45 transform origin-center -translate-y-0.5" />
                  </div>
                  <Bookmark className="w-4.5 h-4.5 text-slate-800 dark:text-slate-200 hover:text-slate-550 transition-colors cursor-pointer" />
                </div>

                <div className="mt-2 text-[10px] leading-normal text-slate-800 dark:text-slate-200 text-left">
                  <span className="font-bold mr-1.5">{account.displayName || account.handle || brandName}</span>
                  <span className="whitespace-pre-wrap text-[9px]">{caption}</span>
                  {parseTags(hashtags).length > 0 && (
                    <span className="block mt-1 text-blue-600 dark:text-blue-400 font-medium text-[9px]">
                      {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {platform === 'xhs' && (
            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-[#f9f9f9] shadow-lg dark:border-slate-800 dark:bg-zinc-950 text-black dark:text-white">
              {/* Xiaohongshu Media Slider */}
              <div className="relative aspect-[3/4] w-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                {attachedMedia.length > 0 ? (
                  <>
                    {isVideoUrl(attachedMedia[mediaIndex % attachedMedia.length]?.url) ? (
                      <video src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                    ) : (
                      <img src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                    )}
                    {attachedMedia.length > 1 && (
                      <>
                        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-black text-white z-10">
                          {(mediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                          }}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 bg-black/45 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev + 1) % attachedMedia.length)
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-black/45 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-400">
                    <ImageIcon className="h-8 w-8 text-slate-300" />
                    <span className="text-[10px] font-semibold">暂无媒体文件</span>
                  </div>
                )}
              </div>

              {/* Xiaohongshu Body */}
              <div className="p-3 bg-white dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800">
                <div className="text-[10px] font-black text-slate-900 dark:text-white text-left leading-snug">
                  {caption.substring(0, 36) || '这里是小红书的精彩标题...'}
                </div>
                
                <div className="mt-1.5 text-[9px] leading-relaxed text-slate-750 dark:text-zinc-350 text-left">
                  <p className="whitespace-pre-wrap">{caption}</p>
                  {parseTags(hashtags).length > 0 && (
                    <p className="mt-1.5 text-[#3b5998] dark:text-blue-400 font-medium">
                      {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                    </p>
                  )}
                </div>

                <div className="mt-3 border-t border-slate-50 dark:border-zinc-800 pt-2.5 flex items-center justify-between text-slate-400 text-[8px] font-bold">
                  <div className="flex items-center gap-1">
                    <div className="h-4 w-4 rounded-full overflow-hidden bg-slate-200">
                      <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                    </div>
                    <span className="text-[9px] text-slate-600 dark:text-zinc-300">{account.displayName || account.handle || brandName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-500">❤️</span> <span>888</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {platform === 'fb' && (
            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900 text-black dark:text-white">
              {/* Facebook Header */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="h-6 w-6 rounded-full overflow-hidden bg-slate-250">
                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold leading-none">{account.displayName || account.handle || brandName}</p>
                  <p className="text-[7px] text-slate-500 leading-none mt-1">刚刚 · 地球 🌐</p>
                </div>
              </div>

              {/* Facebook Caption */}
              <div className="px-3 pb-2 text-[9px] leading-normal text-slate-800 dark:text-slate-200 text-left">
                <p className="whitespace-pre-wrap">{caption}</p>
                {parseTags(hashtags).length > 0 && (
                  <p className="mt-1 text-indigo-600 dark:text-indigo-400 font-medium">
                    {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                  </p>
                )}
              </div>

              {/* Facebook Media View */}
              <div className="relative aspect-[16/10] w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center border-y border-slate-100 dark:border-slate-800">
                {attachedMedia.length > 0 ? (
                  <>
                    {isVideoUrl(attachedMedia[mediaIndex % attachedMedia.length]?.url) ? (
                      <video src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                    ) : (
                      <img src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                    )}
                    {attachedMedia.length > 1 && (
                      <>
                        <span className="absolute right-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white z-10">
                          {(mediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev + 1) % attachedMedia.length)
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageIcon className="h-6 w-6 text-slate-300" />
                    <span className="text-[9px] font-semibold">无媒体文件</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {platform === 'tiktok' && (
            <div className="relative mx-auto w-full max-w-[280px] aspect-[9/16] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-black text-white shadow-lg">
              {/* TikTok Media Mockup */}
              {attachedMedia.length > 0 && isVideoUrl(attachedMedia[0].url) ? (
                <video src={attachedMedia[0].url} className="absolute inset-0 h-full w-full object-cover" controls muted />
              ) : attachedMedia.length > 0 ? (
                <img src={attachedMedia[0].url} className="absolute inset-0 h-full w-full object-cover opacity-60" alt="" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 bg-slate-950">
                  <Video className="h-10 w-10 opacity-30" />
                  <span className="text-[10px]">添加视频以实现 TikTok 全屏预览</span>
                </div>
              )}

              {/* TikTok Sidebar Actions */}
              <div className="absolute right-3.5 bottom-28 flex flex-col items-center gap-4 z-10">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-slate-200 border border-white overflow-hidden">
                    <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg">❤️</span>
                  <span className="text-[8px] font-black leading-none">99k</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg">💬</span>
                  <span className="text-[8px] font-black leading-none">888</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg">⭐</span>
                  <span className="text-[8px] font-black leading-none">666</span>
                </div>
              </div>

              {/* TikTok Bottom Text Overlay */}
              <div className="absolute left-3 right-12 bottom-6 z-10 text-left bg-gradient-to-t from-black/80 to-transparent p-2 rounded-xl">
                <p className="text-[10px] font-black">@{account.displayName || account.handle || brandName}</p>
                <p className="text-[9px] leading-normal mt-1 opacity-90 line-clamp-3 whitespace-pre-wrap">{caption}</p>
                {parseTags(hashtags).length > 0 && (
                  <p className="mt-1 text-[9px] text-cyan-300 font-medium">
                    {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                  </p>
                )}
                <p className="text-[8px] mt-1.5 opacity-70 truncate">🎵 原声音轨 - {brandName}</p>
              </div>
            </div>
          )}

          {platform === 'gbp' && (
            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900 text-black dark:text-white p-4">
              {/* GBP Header */}
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="h-7 w-7 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center text-slate-500">
                  <span className="text-xs">🏪</span>
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold leading-none">{account.displayName || account.handle || brandName}</p>
                  <p className="text-[7px] text-slate-500 leading-none mt-1">Google Maps Post</p>
                </div>
              </div>

              {/* GBP Media */}
              <div className="relative aspect-[16/9] w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center rounded-xl overflow-hidden mt-3 border border-slate-100 dark:border-slate-800">
                {attachedMedia.length > 0 ? (
                  <>
                    {isVideoUrl(attachedMedia[mediaIndex % attachedMedia.length]?.url) ? (
                      <video src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                    ) : (
                      <img src={attachedMedia[mediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                    )}
                    {attachedMedia.length > 1 && (
                      <>
                        <span className="absolute right-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white z-10">
                          {(mediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaIndex(prev => (prev + 1) % attachedMedia.length)
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageIcon className="h-6 w-6 text-slate-300" />
                    <span className="text-[8px] font-semibold">无媒体文件</span>
                  </div>
                )}
              </div>

              {/* GBP Post Body */}
              <div className="mt-3 text-[9px] leading-normal text-slate-700 dark:text-slate-350 text-left">
                <p className="whitespace-pre-wrap">{caption}</p>
                {parseTags(hashtags).length > 0 && (
                  <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">
                    {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                  </p>
                )}
              </div>

              {/* GBP Button */}
              <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                <button className="w-full rounded-md bg-[#1a73e8] hover:bg-[#1557b0] py-2 text-[9px] font-bold text-white transition-colors tracking-wide uppercase">
                  了解更多 (Learn More)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 pointer-events-none">
            <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-pulse pointer-events-auto">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              <div className="text-left">
                <span className="text-xs font-black text-slate-800 dark:text-slate-100">AI 正在创作中...</span>
                <span className="block text-[9px] text-slate-450 mt-0.5">请耐心等待</span>
              </div>
            </div>
          </div>
        )}

        {/* Failed Error Message Overlay */}
        {isFailed && (
          <div className="absolute inset-0 bg-rose-500/5 backdrop-blur-[0.5px] flex flex-col items-center justify-center z-10">
            <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 p-4 rounded-2xl shadow-2xl max-w-[240px] text-center">
              <span className="text-2xl">⚠️</span>
              <h4 className="text-xs font-black text-rose-600 dark:text-rose-400 mt-2">内容生成失败</h4>
              <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                AI 在为此平台生成内容时遇到网络错误或内容安全风控限制。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
