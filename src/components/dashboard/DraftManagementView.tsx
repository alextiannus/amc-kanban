'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckSquare,
  ChevronDown,
  Edit3,
  Eye,
  FileText,
  Grid2X2,
  Layers3,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Tag,
  Users,
  X,
  Play,
  Video,
  Link,
  Loader2,
} from 'lucide-react'

function isVideoUrl(url: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:\?.*)?$/i.test(path)
}

type DraftItem = {
  id: string
  status: string
  caption: string
  hashtags: string[]
  mediaUrls: string[]
  scheduledAt?: string | null
  platformPostId?: string | null
  publishedAt?: string | null
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

type SocialAccountOption = {
  id: string
  platformId: string
  handle?: string | null
  displayName?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  rejected: 'Rejected',
  failed: 'Failed',
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/60',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60',
  published: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/60',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/60',
  failed: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/60',
}

const TAB_CONFIG = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending approval' },
] as const

type TabKey = (typeof TAB_CONFIG)[number]['key']

function formatTags(tags: string[]) {
  return tags.join(', ')
}

function parseTags(value: string) {
  return value
    .split(/[#,，,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null
}

function draftTimestamp(draft: DraftItem) {
  return draft.publishedAt || draft.scheduledAt || draft.updatedAt || draft.createdAt || new Date().toISOString()
}

function formatDateHeading(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unscheduled'
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function formatCardTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function platformLabel(platformId?: string | null) {
  if (!platformId) return 'Channel'
  return platformId.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function platformBadgeClass(platformId?: string | null) {
  const normalized = (platformId || '').toLowerCase()
  if (normalized.includes('instagram')) return 'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-950/30 dark:text-pink-300 dark:border-pink-900/60'
  if (normalized.includes('facebook')) return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60'
  if (normalized.includes('google')) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60'
  if (normalized.includes('tiktok')) return 'bg-slate-900 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-200'
  return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
}

function accountInitial(draft: DraftItem) {
  const name = draft.account?.displayName || draft.account?.handle || draft.account?.platformId || 'P'
  return name.trim().charAt(0).toUpperCase() || 'P'
}

function mediaForDraft(draft: DraftItem) {
  const assetUrls = draft.assetRefs.map((ref) => ref.asset.url).filter((url): url is string => Boolean(url))
  return [...draft.mediaUrls, ...assetUrls].filter((url): url is string => Boolean(url)).slice(0, 4)
}

function truncateMiddle(value: string, max = 20) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 3)}...`
}

export default function DraftManagementView({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [accounts, setAccounts] = useState<SocialAccountOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [compact, setCompact] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [accountId, setAccountId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [agentNote, setAgentNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [brandAssets, setBrandAssets] = useState<Array<{ id: string; url: string; filename?: string | null; mimeType: string }>>([])
  const [mediaUrlsInput, setMediaUrlsInput] = useState('')
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])

  const selectedDraft = useMemo(() => drafts.find((draft) => draft.id === selectedId) || null, [drafts, selectedId])

  const loadDrafts = async () => {
    if (!brandId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '草稿加载失败')
      setDrafts(json.drafts || [])
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

  const loadBrandAssets = async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/brands/${brandId}/assets`)
      const json = await res.json().catch(() => ({}))
      if (res.ok) setBrandAssets(json.assets || [])
    } catch {
      setBrandAssets([])
    }
  }

  useEffect(() => {
    void loadDrafts()
    void loadBrandAssets()
  }, [brandId])

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
      setMediaUrlsInput('')
      setSelectedAssetIds([])
      return
    }
    setCaption(selectedDraft.caption)
    setHashtags(formatTags(selectedDraft.hashtags))
    setAccountId(selectedDraft.accountId || selectedDraft.account?.id || '')
    setScheduledAt(toDateTimeLocal(selectedDraft.scheduledAt))
    setAgentNote(selectedDraft.agentNote || '')
    setMediaUrlsInput((selectedDraft.mediaUrls || []).join(', '))
    setSelectedAssetIds((selectedDraft.assetRefs || []).map((ref) => ref.asset.id))
    setReviewNote('')
  }, [selectedDraft?.id])

  const platformOptions = useMemo(() => {
    const values = new Set(drafts.map((draft) => draft.account?.platformId).filter(Boolean) as string[])
    return Array.from(values).sort()
  }, [drafts])

  const tagOptions = useMemo(() => {
    const values = new Set(drafts.flatMap((draft) => draft.hashtags))
    return Array.from(values).sort()
  }, [drafts])

  const tabCounts = useMemo(() => {
    return TAB_CONFIG.reduce<Record<TabKey, number>>((acc, tab) => {
      acc[tab.key] = tab.key === 'all' ? drafts.length : drafts.filter((draft) => draft.status === tab.key).length
      return acc
    }, {} as Record<TabKey, number>)
  }, [drafts])

  const filteredDrafts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return drafts
      .filter((draft) => activeTab === 'all' || draft.status === activeTab)
      .filter((draft) => platformFilter === 'all' || draft.account?.platformId === platformFilter)
      .filter((draft) => accountFilter === 'all' || (draft.accountId || draft.account?.id) === accountFilter)
      .filter((draft) => tagFilter === 'all' || draft.hashtags.includes(tagFilter))
      .filter((draft) => {
        if (!normalizedQuery) return true
        return [draft.caption, draft.account?.displayName, draft.account?.handle, draft.hashtags.join(' ')].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
      })
      .sort((a, b) => new Date(draftTimestamp(b)).getTime() - new Date(draftTimestamp(a)).getTime())
  }, [accountFilter, activeTab, drafts, platformFilter, query, tagFilter])

  const groupedDrafts = useMemo(() => {
    const groups = new Map<string, DraftItem[]>()
    filteredDrafts.forEach((draft) => {
      const heading = formatDateHeading(draftTimestamp(draft))
      groups.set(heading, [...(groups.get(heading) || []), draft])
    })
    return Array.from(groups.entries())
  }, [filteredDrafts])

  const openNewDraft = () => {
    setSelectedId(null)
    setEditorOpen(true)
    setCaption('')
    setHashtags('')
    setAccountId('')
    setScheduledAt('')
    setAgentNote('')
    setMediaUrlsInput('')
    setSelectedAssetIds([])
    setReviewNote('')
  }

  const saveDraft = async (nextStatus?: string): Promise<DraftItem | null> => {
    if (!brandId) return null
    const trimmedCaption = caption.trim()
    if (!trimmedCaption) {
      setError('草稿正文不能为空')
      return null
    }
    if (!accountId) {
      setError('请选择发布账号（确定发布平台）')
      return null
    }
    setSaving(true)
    setError(null)
    const mediaUrls = mediaUrlsInput.split(',').map((url) => url.trim()).filter(Boolean)
    try {
      const endpoint = selectedDraft ? `/api/brands/${brandId}/drafts/${selectedDraft.id}` : `/api/brands/${brandId}/drafts`
      const res = await fetch(endpoint, {
        method: selectedDraft ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: trimmedCaption,
          hashtags: parseTags(hashtags),
          accountId,
          scheduledAt: fromDateTimeLocal(scheduledAt),
          agentNote,
          status: nextStatus || selectedDraft?.status || 'draft',
          mediaUrls,
          assetIds: selectedAssetIds,
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
    <div className="min-h-screen bg-slate-50/70 px-4 py-5 text-slate-900 dark:bg-slate-950 dark:text-slate-50 md:px-8">
      <div className="mx-auto max-w-[1480px] space-y-4 pb-24">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              <Layers3 className="h-4 w-4" /> Draft calendar
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-300">{brandName || '当前品牌'}</span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">发布内容（Post）</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search drafts"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <button onClick={loadDrafts} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button onClick={openNewDraft} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> New draft
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-1">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-black transition-colors ${activeTab === tab.key ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  {tab.label}
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${activeTab === tab.key ? 'bg-white/15' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>{tabCounts[tab.key] || 0}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect icon={<Smartphone className="h-4 w-4" />} value={platformFilter} onChange={setPlatformFilter} options={[['all', 'All platforms'], ...platformOptions.map((platform) => [platform, platformLabel(platform)] as [string, string])]} />
              <FilterSelect icon={<Users className="h-4 w-4" />} value={accountFilter} onChange={setAccountFilter} options={[['all', 'All accounts'], ...accounts.map((account) => [account.id, account.displayName || account.handle || account.platformId] as [string, string])]} />
              <FilterSelect icon={<Tag className="h-4 w-4" />} value={tagFilter} onChange={setTagFilter} options={[['all', 'All tags'], ...tagOptions.map((tag) => [tag, `#${tag}`] as [string, string])]} />
              <button onClick={() => setCompact((value) => !value)} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold ${compact ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <Grid2X2 className="h-4 w-4" /> Compact
              </button>
              <button onClick={() => setSelectMode((value) => !value)} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold ${selectMode ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <CheckSquare className="h-4 w-4" /> Select
              </button>
            </div>
          </div>

          {error && <div className="m-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

          <div className="min-h-[520px] p-3 md:p-5">
            {loading ? (
              <div className="flex h-72 items-center justify-center text-sm font-bold text-slate-400">加载草稿中...</div>
            ) : groupedDrafts.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                <FileText className="h-10 w-10 text-slate-300" />
                <div className="text-sm font-bold text-slate-400">暂无匹配草稿</div>
              </div>
            ) : (
              <div className="space-y-7">
                {groupedDrafts.map(([heading, items]) => (
                  <section key={heading} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black text-slate-900 dark:text-slate-50">{heading}</h3>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    </div>
                    <div className={`grid gap-3 ${compact ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'}`}>
                      {items.map((draft) => (
                        <DraftCard key={draft.id} draft={draft} compact={compact} selectMode={selectMode} selected={selectedId === draft.id} onOpen={() => { setSelectedId(draft.id); setEditorOpen(true) }} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30 p-3 backdrop-blur-sm" onClick={() => setEditorOpen(false)}>
          <div className="flex h-full w-full max-w-xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">{selectedDraft ? STATUS_LABELS[selectedDraft.status] || selectedDraft.status : 'New draft'}</p>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">{selectedDraft ? '编辑草稿' : '新建草稿'}</h3>
              </div>
              <button onClick={() => setEditorOpen(false)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="输入草稿正文..."
                className="min-h-[220px] w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                value={hashtags}
                onChange={(event) => setHashtags(event.target.value)}
                placeholder="标签，用逗号分隔，例如 lunch, promo, weekend"
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <textarea
                value={agentNote}
                onChange={(event) => setAgentNote(event.target.value)}
                placeholder="协作备注 / 修改说明"
                className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              {/* Media & Assets Section */}
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">媒体与素材</h4>
                  <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    已选: {selectedAssetIds.length + mediaUrlsInput.split(',').map((u) => u.trim()).filter(Boolean).length}
                  </span>
                </div>

                {/* 1. Preview of currently selected/attached media */}
                {(selectedAssetIds.length > 0 || mediaUrlsInput.trim()) && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400">已附加媒体预览</p>
                    <div className="grid grid-cols-4 gap-2">
                      {/* Selected Assets */}
                      {selectedAssetIds.map((assetId) => {
                        const asset = brandAssets.find((a) => a.id === assetId)
                        if (!asset) return null
                        const isVid = asset.mimeType.startsWith('video/')
                        return (
                          <div key={assetId} className="relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900 group shadow-sm">
                            {isVid ? (
                              <video src={`${asset.url}#t=0.1`} preload="metadata" className="h-full w-full object-cover" muted />
                            ) : (
                              <img src={asset.url} className="h-full w-full object-cover" alt="" />
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedAssetIds((prev) => prev.filter((id) => id !== assetId))}
                              className="absolute top-1 right-1 rounded-full bg-red-500 hover:bg-red-600 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            {isVid && (
                              <div className="absolute bottom-1 right-1 bg-black/50 p-0.5 rounded">
                                <Play className="h-3 w-3 text-white fill-white" />
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 bg-emerald-500/80 px-1 rounded text-[8px] font-black text-white">素材库</div>
                          </div>
                        )
                      })}
                      {/* Manual URLs */}
                      {mediaUrlsInput.split(',').map((u) => u.trim()).filter(Boolean).map((url, idx) => {
                        const isVid = isVideoUrl(url)
                        return (
                          <div key={`manual-${idx}`} className="relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900 group shadow-sm">
                            {isVid ? (
                              <video src={url} className="h-full w-full object-cover" muted />
                            ) : (
                              <img src={url} className="h-full w-full object-cover" alt="" />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const urls = mediaUrlsInput.split(',').map((u) => u.trim()).filter(Boolean)
                                urls.splice(idx, 1)
                                setMediaUrlsInput(urls.join(', '))
                              }}
                              className="absolute top-1 right-1 rounded-full bg-red-500 hover:bg-red-600 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            {isVid && (
                              <div className="absolute bottom-1 right-1 bg-black/50 p-0.5 rounded">
                                <Play className="h-3 w-3 text-white fill-white" />
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 bg-blue-500/80 px-1 rounded text-[8px] font-black text-white">外链</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Direct media URL input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">手动附加媒体 URL (用逗号分隔)</label>
                  <input
                    value={mediaUrlsInput}
                    onChange={(event) => setMediaUrlsInput(event.target.value)}
                    placeholder="https://example.com/image.jpg, https://example.com/video.mp4"
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {/* 3. Browse brand assets */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">从品牌素材库中选择</label>
                  {brandAssets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
                      <p className="text-xs text-slate-400">品牌素材库中暂无素材</p>
                      <p className="mt-1 text-[10px] text-slate-300">请前往“素材”面板上传图片或视频</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-white dark:bg-slate-950">
                      {brandAssets.map((asset) => {
                        const isSelected = selectedAssetIds.includes(asset.id)
                        const isVid = asset.mimeType.startsWith('video/')
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => {
                              setSelectedAssetIds((prev) =>
                                prev.includes(asset.id)
                                  ? prev.filter((id) => id !== asset.id)
                                  : [...prev, asset.id]
                              )
                            }}
                            className={`relative aspect-square rounded-md overflow-hidden border-2 bg-slate-100 dark:bg-slate-900 transition-all ${
                              isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-transparent hover:border-slate-300'
                            }`}
                          >
                            {isVid ? (
                              <video src={`${asset.url}#t=0.1`} preload="metadata" className="h-full w-full object-cover" muted />
                            ) : (
                              <img src={asset.url} className="h-full w-full object-cover" alt="" />
                            )}
                            {isVid && (
                              <div className="absolute bottom-1 right-1 bg-black/50 p-0.5 rounded">
                                <Play className="h-2.5 w-2.5 text-white fill-white" />
                              </div>
                            )}
                            {isSelected && (
                              <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5 shadow-sm">
                                <Check className="h-2.5 w-2.5 text-white stroke-[3px]" />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {selectedDraft?.status === 'pending_review' && (
                <textarea
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="审批意见，驳回时必填"
                  className="min-h-20 w-full rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-slate-800 outline-none focus:border-amber-400 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-slate-100"
                />
              )}

              {selectedDraft?.rejectionNote && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">驳回意见：{selectedDraft.rejectionNote}</div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button disabled={saving || !caption.trim() || !accountId} onClick={() => { void saveDraft('draft') }} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">保存</button>
              <button disabled={saving || !caption.trim() || !accountId} onClick={submitDraft} className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"><Send className="h-4 w-4" /> 提交草稿</button>
              {selectedDraft?.status === 'pending_review' && (
                <>
                  <button disabled={saving} onClick={() => reviewDraft('reject')} className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" /> 驳回</button>
                  <button disabled={saving} onClick={() => reviewDraft('approve')} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /> 批准</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ icon, value, onChange, options }: { icon: React.ReactNode; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="relative inline-flex h-9 items-center rounded-md border border-slate-200 bg-white pl-3 pr-8 text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
      <span className="mr-2 text-slate-400">{icon}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="appearance-none bg-transparent outline-none">
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>{label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
    </label>
  )
}

function DraftCard({ draft, compact, selectMode, selected, onOpen }: { draft: DraftItem; compact: boolean; selectMode: boolean; selected: boolean; onOpen: () => void }) {
  const media = mediaForDraft(draft)
  const platform = draft.account?.platformId
  const accountName = draft.account?.displayName || draft.account?.handle || platformLabel(platform)

  return (
    <button
      onClick={onOpen}
      className={`group overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 ${selected ? 'border-emerald-400 ring-2 ring-emerald-100 dark:ring-emerald-900/40' : 'border-slate-200 dark:border-slate-800'}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          {selectMode && <span className={`h-4 w-4 rounded border ${selected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'}`} />}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white dark:bg-white dark:text-slate-900">{accountInitial(draft)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{accountName}</p>
            <p className="text-xs font-semibold text-slate-400">{formatCardTime(draftTimestamp(draft))}</p>
          </div>
        </div>
        <MoreVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
      </div>

      {media.length > 0 ? (
        <div className={`grid gap-1 bg-slate-100 p-1 dark:bg-slate-950 ${media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {media.map((url, index) => (
            <div key={`${url}-${index}`} className={`overflow-hidden rounded bg-slate-200 dark:bg-slate-800 relative ${compact ? 'aspect-[4/3]' : 'aspect-square'}`}>
              {isVideoUrl(url) ? (
                <>
                  <video src={url} className="h-full w-full object-cover" muted />
                  <div className="absolute bottom-1 right-1 bg-black/50 p-1 rounded">
                    <Play className="h-3 w-3 text-white fill-white" />
                  </div>
                </>
              ) : (
                <img src={url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={`flex items-center justify-center bg-slate-100 text-slate-300 dark:bg-slate-950 ${compact ? 'h-20' : 'h-36'}`}>
          <FileText className="h-9 w-9" />
        </div>
      )}

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${platformBadgeClass(platform)}`}>{platformLabel(platform)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${STATUS_CLASSES[draft.status] || STATUS_CLASSES.draft}`}>{STATUS_LABELS[draft.status] || draft.status}</span>
        </div>
        <p className={`${compact ? 'line-clamp-2' : 'line-clamp-3'} text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200`}>{draft.caption || 'Untitled draft'}</p>
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-400">
          <span className="truncate">{draft.hashtags.map((tag) => `#${tag}`).join(' ') || 'No tags'}</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> View</span>
        </div>
      </div>
    </button>
  )
}
