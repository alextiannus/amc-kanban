'use client'

import React, { useEffect, useState } from 'react'
import { X, Save, Loader2, CheckCircle2, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  brandId: string
  open: boolean
  onClose: () => void
  initialSettings?: Record<string, unknown>
}

export function BrandKnowledgePanel({ brandId, open, onClose }: Props) {
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileMarkdown, setProfileMarkdown] = useState('')
  const [profileViewMode, setProfileViewMode] = useState<'edit' | 'preview'>('edit')
  const [syncingGrowth, setSyncingGrowth] = useState(false)

  useEffect(() => {
    if (!open) return

    const loadProfile = async () => {
      setProfileLoading(true)
      try {
        const res = await fetch(`/api/brands/${brandId}/profile`)
        if (!res.ok) return
        const data = await res.json()
        const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
        setProfileMarkdown(markdown)
      } catch (e) {
        console.error('Failed to load brand profile markdown:', e)
      } finally {
        setProfileLoading(false)
      }
    }

    void loadProfile()
  }, [open, brandId])

  const handleSaveProfile = async (nextMarkdown?: string) => {
    const markdown = (nextMarkdown ?? profileMarkdown).trim()
    if (!markdown) return

    setProfileSaving(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      })
      if (!res.ok) {
        alert('保存品牌 Profile 失败，请重试')
        return
      }
      const data = await res.json()
      const serverMarkdown = typeof data?.markdown === 'string' ? data.markdown : markdown
      setProfileMarkdown(serverMarkdown)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } catch (e) {
      console.error(e)
      alert('保存品牌 Profile 失败，请检查网络')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleRefreshProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/profile?refresh=1`)
      if (!res.ok) {
        alert('刷新 Profile 失败，请稍后再试')
        return
      }
      const data = await res.json()
      const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
      setProfileMarkdown(markdown)
    } catch (e) {
      console.error(e)
      alert('刷新 Profile 失败，请检查网络')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleSyncGrowth = async () => {
    setSyncingGrowth(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/sync-growth`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || '从 AMC Growth 同步失败')
        return
      }
      alert('已成功同步 AMC Growth 品牌故事与上下文！')
      await handleRefreshProfile()
    } catch (e) {
      console.error(e)
      alert('同步失败，请检查网络')
    } finally {
      setSyncingGrowth(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">📚 品牌知识库</h3>
            <p className="text-xs text-slate-400 mt-0.5">管理 AI 预读的品牌 Profile</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2">
                <FileText className="w-4 h-4" /> 品牌 Profile Markdown（AI 预读）
              </p>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setProfileViewMode('edit')}
                    className={`text-[11px] px-2 py-1 ${profileViewMode === 'edit' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileViewMode('preview')}
                    className={`text-[11px] px-2 py-1 border-l border-slate-200 dark:border-slate-700 ${profileViewMode === 'preview' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    预览
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSyncGrowth}
                  disabled={profileLoading || profileSaving || syncingGrowth}
                  className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 disabled:opacity-60 text-indigo-600 dark:text-indigo-400 font-bold"
                >
                  {syncingGrowth ? '同步中...' : '同步 AMC Growth'}
                </button>
                <button
                  type="button"
                  onClick={handleRefreshProfile}
                  disabled={profileLoading || profileSaving || syncingGrowth}
                  className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {profileLoading ? '刷新中...' : '刷新自动区'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">可直接编辑品牌定义、设计策略、推广语境。系统自动区会在刷新时同步。</p>
            {profileViewMode === 'edit' ? (
              <textarea
                value={profileMarkdown}
                onChange={(e) => setProfileMarkdown(e.target.value)}
                placeholder="加载后可编辑品牌 Profile Markdown..."
                className="w-full min-h-[340px] px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            ) : (
              <div className="w-full min-h-[340px] px-4 py-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 overflow-auto prose prose-slate dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {profileMarkdown || '（暂无内容）'}
                </ReactMarkdown>
              </div>
            )}
            <button
              type="button"
              onClick={() => handleSaveProfile()}
              disabled={profileSaving || profileLoading || !profileMarkdown.trim()}
              className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {profileSaving
                ? <><Loader2 size={14} className="animate-spin" /> 保存 Profile 中…</>
                : profileSaved
                  ? <><CheckCircle2 size={14} /> Profile 已保存</>
                  : <><Save size={14} /> 保存 Profile Markdown</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
