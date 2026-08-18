'use client'
import React, { useState } from 'react'
import { CopywriterPersona } from '@/lib/copywriters'
import {
  PhoneFrame, PlatformPreview, normalizePlatform,
  type PlatformKey,
} from './PhonePreview'
import {
  X,
  Eye,
  Loader2,
  Edit3,
  Clock,
  Save,
  Trash2,
  RefreshCw,
  ChevronDown
} from 'lucide-react'

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

function getPlatformDisplay(platform: string) {
  if (platform === 'ig') return {
    label: 'Instagram',
    dot: 'bg-gradient-to-tr from-yellow-400 via-pink-400 to-purple-500',
    border: 'border-pink-500/25',
    glow: 'shadow-pink-950/30',
    ring: 'focus-within:ring-pink-500/30',
  }
  if (platform === 'xhs') return {
    label: '小红书',
    dot: 'bg-red-500',
    border: 'border-red-500/25',
    glow: 'shadow-red-950/30',
    ring: 'focus-within:ring-red-500/30',
  }
  if (platform === 'fb') return {
    label: 'Facebook',
    dot: 'bg-blue-500',
    border: 'border-blue-500/25',
    glow: 'shadow-blue-950/30',
    ring: 'focus-within:ring-blue-500/30',
  }
  if (platform === 'tiktok') return {
    label: 'TikTok',
    dot: 'bg-white',
    border: 'border-slate-500/30',
    glow: 'shadow-slate-950/40',
    ring: 'focus-within:ring-slate-400/20',
  }
  return {
    label: 'Google Business',
    dot: 'bg-amber-500',
    border: 'border-amber-500/25',
    glow: 'shadow-amber-950/30',
    ring: 'focus-within:ring-amber-500/25',
  }
}

function getStatusDisplay(status: 'generating' | 'completed' | 'failed') {
  if (status === 'generating') {
    return {
      label: '创作中',
      className: 'border-indigo-500/30 bg-indigo-950/50 text-indigo-300',
    }
  }
  if (status === 'failed') {
    return {
      label: '生成失败',
      className: 'border-rose-500/35 bg-rose-950/50 text-rose-300',
    }
  }
  return {
    label: '已生成',
    className: 'border-emerald-500/25 bg-emerald-950/40 text-emerald-300',
  }
}

interface PreviewMedia {
  url?: string | null
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
  attachedMedia: PreviewMedia[]
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
  const completedCopywriterCount = selectedCopywriters.filter((copywriter) => {
    const caption = (draftCaptions[copywriter.id] || '').trim()
    return draftStatuses[copywriter.id] === 'completed' && caption && !caption.includes('【AI 正在创作中')
  }).length

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
          <div className="mx-8 mt-4 flex items-start gap-2 rounded-xl border border-amber-800/40 bg-amber-950/30 px-4 py-2">
            <p className="text-[10px] font-bold text-amber-400">部分平台 amc-content 创作失败，请在对应平台卡片中重写或检查内容服务配置。</p>
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
              const platformMeta = getPlatformDisplay(platform)
              const statusMeta = getStatusDisplay(status)

              return (
                <article
                  key={cwId}
                  className={`flex-shrink-0 self-start rounded-2xl border ${platformMeta.border} bg-slate-900 p-4 shadow-2xl ${platformMeta.glow} ${platformMeta.ring} focus-within:ring-2`}
                  style={{ width: 324 }}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${platformMeta.dot}`} />
                        <h3 className="truncate text-sm font-black text-slate-100">{platformMeta.label}</h3>
                      </div>
                      <p className="mt-1 truncate text-[10px] font-bold text-slate-500">{copywriter.name} 负责此平台</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCancelCopywriter(cwId) }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-rose-950/40 hover:text-rose-300"
                      title={`跳过 ${platformMeta.label}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      isGenerating ? 'border border-indigo-500/30 bg-indigo-950 text-indigo-300' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {copywriter.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-slate-100">{copywriter.name}</p>
                      <p className="truncate text-[9px] text-slate-500" title={copywriter.specialty}>{copywriter.specialty}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black ${statusMeta.className}`}>
                      {isGenerating && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>{statusMeta.label}</span>
                    </span>
                  </div>

                  <div
                    onClick={() => !isGenerating && !isFailed && setEditingCopywriterId(cwId)}
                    className={`flex min-h-[520px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/55 p-3 ${
                      !isGenerating && !isFailed ? 'cursor-pointer hover:border-slate-700' : ''
                    }`}
                  >
                    {isGenerating ? (
                      <div className="flex h-[460px] flex-col items-center justify-center gap-3 text-center text-slate-500">
                        <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
                        <p className="text-xs font-black text-indigo-300">正在为 {platformMeta.label} 创作</p>
                        <p className="max-w-[220px] text-[10px] leading-relaxed text-slate-500">该平台完成后会单独显示帖文预览，不影响其他平台继续生成。</p>
                      </div>
                    ) : isFailed ? (
                      <div className="flex h-[460px] flex-col items-center justify-center gap-3 text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-500/30 bg-rose-950/50 text-rose-300">
                          <RefreshCw className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-black text-rose-300">{platformMeta.label} 生成失败</p>
                        <p className="max-w-[240px] whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-500">
                          {currentCaption || draftWarnings[cwId] || 'content engine 未返回有效正文，请点击重写。'}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRegenerateSingleCopywriter?.(cwId) }}
                          disabled={saving}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-950 px-3 py-1.5 text-[10px] font-black text-indigo-300 transition-colors hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>重写这个平台</span>
                        </button>
                      </div>
                    ) : (
                      <PhoneFrame dark={normalizePlatform(copywriter.platform) === 'tiktok'} scale={0.85}>
                        <PlatformPreview
                          post={{
                            caption: currentCaption,
                            hashtags: parseTags(currentHashtagsString),
                            mediaUrls: attachedMedia.map((m) => m.url).filter(Boolean) as string[],
                          }}
                          platform={normalizePlatform(copywriter.platform) as PlatformKey}
                          account={brandName}
                        />
                      </PhoneFrame>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingCopywriterId(cwId)}
                      disabled={isGenerating || isFailed}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-[10px] font-black text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>编辑帖文</span>
                    </button>
                    {!isGenerating && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRegenerateSingleCopywriter?.(cwId) }}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-950/70 px-3 py-1.5 text-[10px] font-black text-indigo-300 transition-colors hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-50"
                        title={`让 ${copywriter.name} 重新撰写 ${platformMeta.label}`}
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>重写</span>
                      </button>
                    )}
                  </div>
                </article>
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
                disabled={saving || completedCopywriterCount === 0}
                onClick={onSaveDraft}
                className="px-4 py-2 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-all bg-transparent flex items-center gap-1.5"
              >
                {saving && !isAiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-indigo-400" />}
                <span>保存草稿</span>
              </button>
              <div className="relative flex items-center bg-emerald-700 rounded-xl shadow-md">
                <button
                  type="button"
                  disabled={saving || completedCopywriterCount === 0}
                  onClick={() => onSchedule()}
                  className="px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50 rounded-l-xl transition-all flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>智能排期发布</span>
                </button>
                <button
                  type="button"
                  disabled={saving || completedCopywriterCount === 0}
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
