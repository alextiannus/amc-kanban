'use client'
import React, { useState } from 'react'
import { COPYWRITER_ROSTER, CopywriterPersona, platformAliases } from '@/lib/copywriters'
import {
  PhoneFrame, PlatformPreview, normalizePlatform,
  type PreviewPost, type PlatformKey,
} from './PhonePreview'
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
  RefreshCw,
  ChevronDown
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
  selectedCopywriters: CopywriterPersona[]
  draftCaptions: Record<string, string>
  setDraftCaptions: React.Dispatch<React.SetStateAction<Record<string, string>>>
  draftHashtags: Record<string, string>
  setDraftHashtags: React.Dispatch<React.SetStateAction<Record<string, string>>>
  draftStatuses: Record<string, 'generating' | 'completed' | 'failed'>
  draftWarnings?: Record<string, string>
  isAiGenerating: boolean
  saving: boolean
  attachedMedia: any[]
  onCancel: () => void
  onSaveDraft: () => void
  onSchedule: (customTime?: string) => void
  onRegenerate: () => void
  onCancelCopywriter: (cwId: string) => void
  onRegenerateSingleCopywriter?: (cwId: string) => void
  previewOnly?: boolean
}

export default function PostPreviewModal({
  isOpen,
  onClose,
  brandName = 'Your Brand',
  selectedCopywriters,
  draftCaptions,
  setDraftCaptions,
  draftHashtags,
  setDraftHashtags,
  draftStatuses,
  draftWarnings = {},
  isAiGenerating,
  saving,
  attachedMedia,
  onCancel,
  onSaveDraft,
  onSchedule,
  onRegenerate,
  onCancelCopywriter,
  onRegenerateSingleCopywriter,
  previewOnly = false
}: PostPreviewModalProps) {
  const [editingCopywriterId, setEditingCopywriterId] = useState<string | null>(null)
  const [showScheduleDropdown, setShowScheduleDropdown] = useState(false)
  const [customTime, setCustomTime] = useState('')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm" onClick={onClose}>
      {/* Floating panel — contained, not full-screen */}
      <div
        className="relative flex flex-col w-full max-w-5xl bg-slate-950 rounded-2xl shadow-2xl border border-white/8 overflow-hidden"
        style={{ height: 'min(88vh, 900px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 shrink-0 bg-slate-900">
          <div className="flex items-center gap-3">
            {isAiGenerating && (
              <span className="flex items-center gap-1.5 text-indigo-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-black">Copywriters 正在创作中...</span>
              </span>
            )}
            {!isAiGenerating && (
              <span className="text-xs font-black text-slate-300">{selectedCopywriters.length} 个平台预览</span>
            )}
            <span className="text-[10px] text-slate-500">每位写手负责自己的平台</span>
          </div>
          <button onClick={onClose} className="rounded-full w-7 h-7 flex items-center justify-center hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Token warning if any */}
        {Object.keys(draftWarnings).length > 0 && (
          <div className="mx-8 mb-2 flex items-start gap-2 rounded-xl border border-amber-800/40 bg-amber-950/30 px-4 py-2">
            <span className="text-sm mt-0.5">⚠️</span>
            <p className="text-[10px] text-amber-400">部分平台 amc-content 创作失败，请点击重写或检查内容服务配置。</p>
          </div>
        )}

        {/* Scroll region: outer=block flex-item (overflow both axes); inner=flex row for alignment */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {/* flex row on a NON-overflowing div so items-start reliably aligns all cards at same Y */}
          <div className="flex items-start px-8 py-6 gap-5 min-w-max">
          {selectedCopywriters.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-600">
              <Eye className="w-10 h-10 opacity-30" />
              <p className="text-xs font-bold">请选择 Copywriter 以查看预览</p>
            </div>
          ) : (
            selectedCopywriters.map((copywriter) => {
              const cwId = copywriter.id
              const platform = normalizePlatformLabel(copywriter.platform)
              const status = draftStatuses[cwId] || 'completed'
              const isGenerating = status === 'generating'
              const isFailed = status === 'failed'
              const currentCaption = draftCaptions[cwId] !== undefined ? draftCaptions[cwId] : ''
              const currentHashtagsString = draftHashtags[cwId] !== undefined ? draftHashtags[cwId] : ''
              const displayAccount = {
                id: cwId,
                platformId: copywriter.platform,
                displayName: copywriter.name,
                handle: copywriter.handle,
              }

              const platformLabel = platform === 'ig' ? 'Instagram' : platform === 'xhs' ? '小红书' : platform === 'fb' ? 'Facebook' : platform === 'tiktok' ? 'TikTok' : 'Google Business'

              const mockHandle = brandName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'brand'

              return (
                <div key={cwId} className="flex-shrink-0 flex flex-col gap-3 self-start" style={{ width: 270 }}>
                  {/* Copywriter Control Panel - Displayed above the mockup screenshot */}
                  <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2 shrink-0 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* A tiny platform indicator */}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          platform === 'ig' ? 'bg-gradient-to-tr from-yellow-400 via-pink-400 to-purple-400'
                          : platform === 'xhs' ? 'bg-red-500'
                          : platform === 'fb' ? 'bg-blue-650'
                          : platform === 'tiktok' ? 'bg-white'
                          : 'bg-amber-500'
                        }`} />
                        <span className="text-[10px] font-black text-slate-200">{platformLabel}</span>
                      </div>
                      
                      {/* Close button to skip/cancel draft */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onCancelCopywriter(cwId) }}
                        className="w-5 h-5 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 flex items-center justify-center transition-all"
                        title={`取消 ${copywriter.name} 的草稿`}
                      >
                        <X className="w-3 w-3" />
                      </button>
                    </div>

                    {/* Copywriter block with specialty & rewrite action */}
                    <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg border border-slate-800/40">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Copywriter avatar or initial */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${
                          isGenerating ? 'bg-indigo-950 text-indigo-400 border border-indigo-500/30 animate-pulse' : 'bg-slate-800 text-slate-350'
                        }`}>
                          {copywriter.name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-200 truncate">{copywriter.name}</p>
                          <p className="text-[8px] text-slate-500 truncate" title={copywriter.specialty}>{copywriter.specialty}</p>
                        </div>
                      </div>

                      {/* Status / Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isGenerating ? (
                          <span className="flex items-center gap-0.5 text-[8px] text-indigo-400 font-bold bg-indigo-950/60 border border-indigo-900/50 px-1.5 py-0.5 rounded-full">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span>创作中</span>
                          </span>
                        ) : (
                          // Show a rewrite button!
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRegenerateSingleCopywriter?.(cwId) }}
                            disabled={saving || isAiGenerating}
                            className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950 hover:bg-indigo-900 border border-indigo-900/50 px-2 py-0.5 rounded-full flex items-center gap-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            title={`让 ${copywriter.name} 重新撰写文案`}
                          >
                            <RefreshCw className="w-2 h-2" />
                            <span>重写</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Phone preview — same iPhone frame as QuickPreviewModal */}
                  <div
                    onClick={() => setEditingCopywriterId(cwId)}
                    className="cursor-pointer flex justify-center"
                  >
                    {isGenerating ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <p className="text-[11px] font-bold text-indigo-400">创作中...</p>
                      </div>
                    ) : isFailed ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
                        <p className="text-[11px] font-bold text-rose-400">生成失败</p>
                        <p className="text-[9px] text-slate-500">请点击重写</p>
                      </div>
                    ) : (
                      <PhoneFrame dark={normalizePlatform(copywriter.platform) === 'tiktok'} scale={0.85}>
                        <PlatformPreview
                          post={{
                            caption: currentCaption,
                            hashtags: parseTags(currentHashtagsString),
                            mediaUrls: attachedMedia.map((m: any) => m.url).filter(Boolean),
                          }}
                          platform={normalizePlatform(copywriter.platform) as PlatformKey}
                          account={brandName}
                        />
                      </PhoneFrame>
                    )}
                  </div>
                </div>
              )

            })
          )}
          </div>
        </div>


        {/* Hint text */}
        {selectedCopywriters.length > 0 && (
          <p className="text-center text-[10px] text-slate-600 pb-2 shrink-0">
            每位 Copywriter 都单独调用 content engine 创作，点击 × 可跳过某位写手...
          </p>
        )}

        {/* Footer Action Buttons */}
        {!previewOnly && (
          <div className="border-t border-slate-800 bg-slate-900/80 px-8 py-4 flex items-center justify-between shrink-0 gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className="px-4 py-2 border border-slate-700 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-950/30 hover:border-rose-800 transition-all bg-transparent flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>取消创作</span>
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={saving || isAiGenerating}
                onClick={onRegenerate}
                className="px-4 py-2 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-all bg-transparent flex items-center gap-1.5"
              >
                {saving && isAiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-orange-400" />}
                <span>重新生成</span>
              </button>
              <button
                type="button"
                disabled={saving || isAiGenerating}
                onClick={onSaveDraft}
                className="px-4 py-2 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-all bg-transparent flex items-center gap-1.5"
              >
                {saving && !isAiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-indigo-400" />}
                <span>保存草稿</span>
              </button>
              <div className="relative flex items-center bg-emerald-700 rounded-xl shadow-md">
                <button
                  type="button"
                  disabled={saving || isAiGenerating}
                  onClick={() => onSchedule()}
                  className="px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50 rounded-l-xl transition-all flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>智能排期发布</span>
                </button>
                <button
                  type="button"
                  disabled={saving || isAiGenerating}
                  onClick={() => setShowScheduleDropdown(prev => !prev)}
                  className="px-2.5 py-2 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-r-xl transition-all self-stretch flex items-center justify-center border-l border-emerald-600"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showScheduleDropdown && (
                  <div className="absolute bottom-full right-0 mb-2.5 w-56 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl z-50 text-left animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">排期发布设置</p>
                    <button
                      type="button"
                      onClick={() => { setShowScheduleDropdown(false); onSchedule() }}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-bold text-slate-200 hover:bg-slate-800 flex items-center gap-1.5"
                    >
                      <span>🤖</span><span>智能自动排期 (推荐)</span>
                    </button>
                    <div className="border-t border-slate-800 my-2" />
                    <div className="space-y-1.5 p-0.5">
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                        <span>📅</span><span>指定排期发布时间</span>
                      </span>
                      <input
                        type="datetime-local"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 px-2 py-1.5 outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={!customTime}
                        onClick={() => { setShowScheduleDropdown(false); onSchedule(customTime) }}
                        className="w-full mt-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all"
                      >
                        确认排期发布
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview-only footer */}
        {previewOnly && (
          <div className="border-t border-slate-800 bg-slate-900/80 px-8 py-4 flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-all bg-transparent"
            >
              关闭预览
            </button>
          </div>
        )}

        {/* Inline edit modal */}
        {editingCopywriterId && (() => {
          const copywriter = selectedCopywriters.find(c => c.id === editingCopywriterId)
          if (!copywriter) return null
          const currentCap = draftCaptions[editingCopywriterId] !== undefined ? draftCaptions[editingCopywriterId] : ''
          const currentHash = draftHashtags[editingCopywriterId] !== undefined ? draftHashtags[editingCopywriterId] : ''
          const platformId = copywriter.platform as string
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setEditingCopywriterId(null)}>
              <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                    <span>{platformId === 'instagram' ? '📸' : platformId === 'facebook' ? '👥' : (platformId === 'xiaohongshu' || platformId === 'xhs') ? '📕' : platformId === 'tiktok' ? '🎵' : '📍'}</span>
                    编辑 {copywriter.name} 的发布内容
                  </h3>
                  <button onClick={() => setEditingCopywriterId(null)} className="rounded-md p-1 hover:bg-slate-800 text-slate-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">专属正文 (Caption)</label>
                    <textarea
                      value={currentCap}
                      onChange={(e) => setDraftCaptions(prev => ({ ...prev, [editingCopywriterId]: e.target.value }))}
                      placeholder="输入该渠道的专属文案..."
                      className="w-full min-h-[160px] rounded-xl border border-slate-700 bg-slate-950 text-slate-100 px-4 py-3 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">专属标签 (Hashtags)</label>
                    <input
                      type="text"
                      value={currentHash}
                      onChange={(e) => setDraftHashtags(prev => ({ ...prev, [editingCopywriterId]: e.target.value }))}
                      placeholder="例如: 美食 探店 推荐"
                      className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 px-4 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end border-t border-slate-800 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingCopywriterId(null)}
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
