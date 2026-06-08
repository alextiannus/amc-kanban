'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Edit3, FileText, RefreshCw, Send, X } from 'lucide-react'

type DraftStatus = 'draft' | 'pending_review' | 'approved' | 'publishing' | 'published' | 'scheduled' | 'failed'

type SocialAccountOption = {
  id: string
  platformId: string
  handle: string
  displayName: string | null
}

type DraftAssetRef = {
  id: string
  asset: {
    id: string
    url: string
    filename: string | null
    mimeType: string
    aiCategory: string | null
  }
}

type DraftItem = {
  id: string
  accountId: string | null
  caption: string
  captionLang: string
  mediaUrls: string[]
  hashtags: string[]
  scheduledAt: string | null
  status: DraftStatus | string
  agentNote: string | null
  rejectionNote: string | null
  updatedAt: string
  account: { id: string; platformId: string; handle: string; displayName: string | null } | null
  assetRefs: DraftAssetRef[]
}

const STATUS_LABELS: Record<string, string> = {
  draft: '编辑中',
  pending_review: '待审核',
  approved: '已批准',
  publishing: '发布中',
  scheduled: '已排期',
  published: '已发布',
  failed: '发布失败',
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pending_review: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
  publishing: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300',
  scheduled: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300',
  published: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300',
  failed: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300',
}

function formatTags(tags: string[]) {
  return tags.map((tag) => tag.startsWith('#') ? tag.slice(1) : tag).join(', ')
}

function parseTags(value: string) {
  return value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
}

function toDateTimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null
}

export default function DraftManagementView({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [accounts, setAccounts] = useState<SocialAccountOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [accountId, setAccountId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [agentNote, setAgentNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selectedDraft = useMemo(() => drafts.find((draft) => draft.id === selectedId) || null, [drafts, selectedId])

  const loadDrafts = async () => {
    if (!brandId) return
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams()
      if (statusFilter) query.set('status', statusFilter)
      const res = await fetch(`/api/brands/${brandId}/drafts${query.toString() ? `?${query}` : ''}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '草稿加载失败')
      setDrafts(json.drafts || [])
      if (!selectedId && json.drafts?.[0]) setSelectedId(json.drafts[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '草稿加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadAccounts = async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/brands/${brandId}/accounts`)
      const json = await res.json().catch(() => ({}))
      if (res.ok) setAccounts(json.accounts || [])
    } catch {
      setAccounts([])
    }
  }

  useEffect(() => {
    void loadDrafts()
  }, [brandId, statusFilter])

  useEffect(() => {
    void loadAccounts()
  }, [brandId])

  useEffect(() => {
    if (!selectedDraft) {
      setCaption('')
      setHashtags('')
      setAccountId('')
      setScheduledAt('')
      setAgentNote('')
      return
    }
    setCaption(selectedDraft.caption)
    setHashtags(formatTags(selectedDraft.hashtags))
    setAccountId(selectedDraft.accountId || selectedDraft.account?.id || '')
    setScheduledAt(toDateTimeLocal(selectedDraft.scheduledAt))
    setAgentNote(selectedDraft.agentNote || '')
    setReviewNote('')
  }, [selectedDraft?.id])

  const saveDraft = async (nextStatus?: string): Promise<DraftItem | null> => {
    if (!brandId) return null
    setSaving(true)
    setError(null)
    try {
      const endpoint = selectedDraft ? `/api/brands/${brandId}/drafts/${selectedDraft.id}` : `/api/brands/${brandId}/drafts`
      const res = await fetch(endpoint, {
        method: selectedDraft ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          hashtags: parseTags(hashtags),
          accountId,
          scheduledAt: fromDateTimeLocal(scheduledAt),
          agentNote,
          status: nextStatus || selectedDraft?.status || 'draft',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '保存草稿失败')
      await loadDrafts()
      setSelectedId(json.draft?.id || selectedDraft?.id || null)
      return json.draft || null
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存草稿失败')
      return null
    } finally {
      setSaving(false)
    }
  }

  const submitDraft = async () => {
    if (!brandId) return
    const draft = await saveDraft('draft')
    const draftId = draft?.id || selectedDraft?.id
    if (!draftId) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}/submit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: agentNote }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '提交草稿失败')
      await loadDrafts()
      setSelectedId(json.draft?.id || draftId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const reviewDraft = async (action: 'approve' | 'reject') => {
    if (!brandId || !selectedDraft) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reviewNote || agentNote || (action === 'approve' ? 'Approved' : '') }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '审核操作失败')
      await loadDrafts()
      setSelectedId(json.draft?.id || selectedDraft.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '审核操作失败')
    } finally {
      setSaving(false)
    }
  }

  if (!brandId) {
    return <div className="p-8 text-sm text-slate-400">请先选择品牌</div>
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 space-y-5">
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Draft Review</p>
          <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">草稿管理</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{brandName || '当前品牌'} 的草稿存储、编辑与审批</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="">全部状态</option>
            <option value="draft">编辑中</option>
            <option value="pending_review">待审核</option>
            <option value="approved">已批准</option>
            <option value="scheduled">已排期</option>
            <option value="published">已发布</option>
            <option value="failed">发布失败</option>
          </select>
          <button onClick={loadDrafts} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RefreshCw className="h-4 w-4" /> 刷新
          </button>
          <button onClick={() => { setSelectedId(null); setCaption(''); setHashtags(''); setAccountId(''); setScheduledAt(''); setAgentNote(''); setReviewNote('') }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">
            <Edit3 className="h-4 w-4" /> 新建草稿
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm space-y-2 max-h-[calc(100vh-240px)] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">加载草稿中...</div>
          ) : drafts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">暂无草稿</div>
          ) : drafts.map((draft) => (
            <button
              key={draft.id}
              onClick={() => setSelectedId(draft.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === draft.id ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_CLASSES[draft.status] || STATUS_CLASSES.draft}`}>{STATUS_LABELS[draft.status] || draft.status}</span>
                <span className="text-[10px] text-slate-400">{new Date(draft.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
              <p className="line-clamp-2 text-sm font-bold text-slate-800 dark:text-slate-100">{draft.caption}</p>
              <p className="mt-2 truncate text-xs text-slate-400">{draft.hashtags.map((tag) => `#${tag}`).join(' ') || '无标签'}</p>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
            <FileText className="h-4 w-4 text-indigo-500" /> {selectedDraft ? '编辑草稿' : '新建草稿'}
          </div>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="输入草稿正文..."
            className="min-h-[240px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm leading-7 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
          />
          <input
            value={hashtags}
            onChange={(event) => setHashtags(event.target.value)}
            placeholder="标签，用逗号分隔，例如 lunch, promo, weekend"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
            >
              <option value="">选择发布账号</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.platformId} · {account.displayName || account.handle}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
            />
          </div>
          <textarea
            value={agentNote}
            onChange={(event) => setAgentNote(event.target.value)}
            placeholder="协作备注 / 修改说明"
            className="min-h-20 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
          />

          {selectedDraft?.assetRefs.length ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3">
              <p className="mb-2 text-xs font-black text-slate-500 dark:text-slate-400">已引用素材</p>
              <div className="flex flex-wrap gap-2">
                {selectedDraft.assetRefs.map((ref) => (
                  <span key={ref.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-500 dark:text-slate-300">{ref.asset.filename || ref.asset.id}</span>
                ))}
              </div>
            </div>
          ) : null}

          {selectedDraft?.status === 'pending_review' && (
            <textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="审批意见，驳回时必填"
              className="min-h-20 w-full rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400"
            />
          )}

          {selectedDraft?.rejectionNote && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">驳回意见：{selectedDraft.rejectionNote}</div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button disabled={saving || !caption.trim()} onClick={() => { void saveDraft('draft') }} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">保存</button>
            <button disabled={saving || !caption.trim() || !accountId} onClick={submitDraft} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"><Send className="h-4 w-4" /> 提交草稿</button>
            {selectedDraft?.status === 'pending_review' && (
              <>
                <button disabled={saving} onClick={() => reviewDraft('reject')} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" /> 驳回</button>
                <button disabled={saving} onClick={() => reviewDraft('approve')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /> 批准</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
