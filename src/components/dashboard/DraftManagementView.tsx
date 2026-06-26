'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  Trash2,
  Tag,
  Users,
  X,
  Play,
  Video,
  Link,
  Loader2,
  Sparkles,
  Zap,
  Image as ImageIcon,
  Wand2,
  Maximize2,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  ThumbsUp,
  Star,
  Globe,
  Store,
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
  postUrl?: string | null
  createdAt?: string | null
  updatedAt: string
  agentNote?: string | null
  rejectionNote?: string | null
  creativeHooks?: string | null
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
  const closeEditor = () => {
    setEditorOpen(false)
    setSelectedId(null)
    setSelectedAccountIds([])
  }
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
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [agentNote, setAgentNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [contentIdea, setContentIdea] = useState('')
  const [creativeHooks, setCreativeHooks] = useState('')
  const [activeMediaOp, setActiveMediaOp] = useState<{ index: number; action: 'design' | 'video' } | null>(null)
  const [mediaOpPrompt, setMediaOpPrompt] = useState('')
  const [mediaProcessingIndex, setMediaProcessingIndex] = useState<number | null>(null)

  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | 'image' | 'video'>('all')
  const [assetPageSize, setAssetPageSize] = useState(12)
  const [brandAssets, setBrandAssets] = useState<Array<{ id: string; url: string; filename?: string | null; mimeType: string }>>([])
  const filteredAssets = useMemo(() => {
    return brandAssets.filter(asset => {
      const isVid = asset.mimeType.startsWith('video/')
      if (assetTypeFilter === 'image') return !isVid
      if (assetTypeFilter === 'video') return isVid
      return true
    })
  }, [brandAssets, assetTypeFilter])
  const [mediaUrlsInput, setMediaUrlsInput] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<Array<{ id: string; type: 'asset' | 'url'; url: string }>>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [newUrlInput, setNewUrlInput] = useState('')

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setAttachedMedia((prev) => {
      const updated = [...prev]
      const draggedItem = updated[draggedIndex]
      updated.splice(draggedIndex, 1)
      updated.splice(index, 0, draggedItem)
      return updated
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleToggleAsset = (asset: { id: string; url: string }) => {
    setAttachedMedia((prev) => {
      const exists = prev.some((m) => m.type === 'asset' && m.id === asset.id)
      if (exists) {
        return prev.filter((m) => !(m.type === 'asset' && m.id === asset.id))
      } else {
        return [...prev, { id: asset.id, type: 'asset', url: asset.url }]
      }
    })
  }

  const handleRemoveMedia = (index: number) => {
    setAttachedMedia((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleAddUrl = () => {
    const url = newUrlInput.trim()
    if (!url) return
    setAttachedMedia((prev) => [
      ...prev,
      { id: url, type: 'url', url }
    ])
    setNewUrlInput('')
  }

  const selectedAssetIds = useMemo(() => attachedMedia.filter(m => m.type === 'asset').map(m => m.id), [attachedMedia])
  const selectedDraft = useMemo(() => drafts.find((draft) => draft.id === selectedId) || null, [drafts, selectedId])
  const activeAccount = useMemo(() => accounts.find(a => a.id === accountId) || null, [accounts, accountId])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState('instagram')
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

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
    setAssetPageSize(12)
  }, [brandId, assetTypeFilter, selectedId, editorOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return
      if (e.key === 'Escape') {
        setLightboxIndex(null)
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < filteredAssets.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredAssets.length - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, filteredAssets.length])

  useEffect(() => {
    if (!selectedDraft) {
      setCaption('')
      setHashtags('')
      setAccountId('')
      setSelectedAccountIds(accounts.map(a => a.id))
      setScheduledAt('')
      setAgentNote('')
      setMediaUrlsInput('')
      setAttachedMedia([])
      setReviewNote('')
      setContentIdea('')
      setCreativeHooks('')
      setActiveMediaOp(null)
      setMediaOpPrompt('')
      setMediaProcessingIndex(null)
      return
    }
    setContentIdea('')
    setCreativeHooks('')
    setActiveMediaOp(null)
    setMediaOpPrompt('')
    setMediaProcessingIndex(null)
    setCaption(selectedDraft.caption)
    setCreativeHooks(selectedDraft.creativeHooks || '')
    setHashtags(formatTags(selectedDraft.hashtags))
    const accId = selectedDraft.accountId || selectedDraft.account?.id || ''
    setAccountId(accId)
    setSelectedAccountIds(accId ? [accId] : [])
    setScheduledAt(toDateTimeLocal(selectedDraft.scheduledAt))
    if (selectedDraft.agentNote && selectedDraft.agentNote.includes("【AI 生成指令】")) {
      const cleanNote = selectedDraft.agentNote.replace(/【AI 生成指令】[\s\S]*?【\/AI 生成指令】(?:\r?\n)?/, '');
      setAgentNote(cleanNote.trim());
      const match = selectedDraft.agentNote.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/);
      if (match) {
        setContentIdea(match[1].trim());
      }
    } else {
      setAgentNote(selectedDraft.agentNote || '');
    }
    setMediaUrlsInput((selectedDraft.mediaUrls || []).join(', '))

    const initialMedia: Array<{ id: string; type: 'asset' | 'url'; url: string }> = []
    if (selectedDraft.assetRefs) {
      selectedDraft.assetRefs.forEach((ref) => {
        if (ref.asset) {
          initialMedia.push({
            id: ref.asset.id,
            type: 'asset',
            url: ref.asset.url || '',
          })
        }
      })
    }
    if (selectedDraft.mediaUrls) {
      selectedDraft.mediaUrls.forEach((url) => {
        initialMedia.push({
          id: url,
          type: 'url',
          url,
        })
      })
    }
    setAttachedMedia(initialMedia)
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
    setSelectedAccountIds(accounts.map(a => a.id))
    setScheduledAt('')
    setAgentNote('')
    setMediaUrlsInput('')
    setAttachedMedia([])
    setReviewNote('')
    setCreativeHooks('')
  }

  const saveDraft = async (nextStatus?: string, captionOverride?: string): Promise<DraftItem[] | null> => {
    if (!brandId) return null
    let activeCaption = captionOverride !== undefined ? captionOverride : caption
    if (!activeCaption.trim() && contentIdea.trim()) {
      activeCaption = contentIdea.trim()
      setCaption(activeCaption)
    }
    const trimmedCaption = activeCaption.trim()
    if (!trimmedCaption) {
      setError('草稿正文或内容创意不能为空')
      return null
    }
    if (selectedAccountIds.length === 0) {
      setError('请选择发布平台账号')
      return null
    }
    setSaving(true)
    setError(null)
    const mediaUrls = attachedMedia.filter((m) => m.type === 'url').map((m) => m.url)
    const formattedAgentNote = contentIdea.trim() ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】\n${agentNote}` : agentNote
    try {
      const savedDrafts: DraftItem[] = []

      if (selectedDraft) {
        // Update existing draft with first account
        const endpoint = `/api/brands/${brandId}/drafts/${selectedDraft.id}`
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: trimmedCaption,
            hashtags: parseTags(hashtags),
            accountId: selectedAccountIds[0],
            scheduledAt: fromDateTimeLocal(scheduledAt),
            agentNote: formattedAgentNote,
            status: nextStatus || selectedDraft.status || 'draft',
            mediaUrls,
            assetIds: selectedAssetIds,
            creativeHooks: creativeHooks.trim(),
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || '修改草稿失败')
        if (json.draft) savedDrafts.push(json.draft)

        // Create new drafts for any additional accounts
        const otherAccounts = selectedAccountIds.slice(1)
        if (otherAccounts.length > 0) {
          const results = await Promise.all(
            otherAccounts.map(async (accId) => {
              const resCreate = await fetch(`/api/brands/${brandId}/drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  caption: trimmedCaption,
                  hashtags: parseTags(hashtags),
                  accountId: accId,
                  scheduledAt: fromDateTimeLocal(scheduledAt),
                  agentNote: formattedAgentNote,
                  status: nextStatus || 'draft',
                  mediaUrls,
                  assetIds: selectedAssetIds,
                  creativeHooks: creativeHooks.trim(),
                }),
              })
              const jsonCreate = await resCreate.json().catch(() => ({}))
              if (resCreate.ok && jsonCreate.draft) {
                return jsonCreate.draft
              } else {
                console.error(`Failed to create copy draft for account ${accId}:`, jsonCreate.error)
                return null
              }
            })
          )
          results.forEach(d => { if (d) savedDrafts.push(d) })
        }
      } else {
        // Create new drafts for all selected accounts
        const results = await Promise.all(
          selectedAccountIds.map(async (accId) => {
            const res = await fetch(`/api/brands/${brandId}/drafts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: trimmedCaption,
                hashtags: parseTags(hashtags),
                accountId: accId,
                scheduledAt: fromDateTimeLocal(scheduledAt),
                agentNote: formattedAgentNote,
                status: nextStatus || 'draft',
                mediaUrls,
                assetIds: selectedAssetIds,
                creativeHooks: creativeHooks.trim(),
              }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || '创建草稿失败')
            return json.draft || null
          })
        )
        results.forEach(d => { if (d) savedDrafts.push(d) })
      }

      await loadDrafts()
      if (savedDrafts.length > 0) {
        setSelectedId(savedDrafts[0].id)
      }
      return savedDrafts
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存草稿失败')
      return null
    } finally {
      setSaving(false)
    }
  }

  const submitDraft = async () => {
    if (!brandId) return
    const draftsList = await saveDraft('draft')
    if (!draftsList || draftsList.length === 0) return

    setSaving(true)
    setError(null)
    try {
      await Promise.all(
        draftsList.map(async (draft) => {
          const res = await fetch(`/api/brands/${brandId}/drafts/${draft.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || `提交草稿 ${draft.id} 失败`)
        })
      )
      await loadDrafts()
      closeEditor()
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
      closeEditor()
    } catch (e) {
      setError(e instanceof Error ? e.message : '审核操作失败')
    } finally {
      setSaving(false)
    }
  }

  const discardDraft = async (draftId: string) => {
    if (!brandId) return
    if (!confirm('确定要废弃该草稿吗？此操作不可逆。')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '废弃草稿失败')
      closeEditor()
      await loadDrafts()
    } catch (e) {
      setError(e instanceof Error ? e.message : '废弃草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const triggerCopywriter = async (draftId: string, silent = false) => {
    if (!brandId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '触发 AI 创作失败')
      
      // Update local state and reload list immediately to show the placeholder
      setCaption('【AI 正在创作中...】')
      await loadDrafts()

      // Poll every 2 seconds until AI copywriting is complete
      let attempts = 0
      const maxAttempts = 15
      const interval = setInterval(async () => {
        attempts++
        try {
          const checkRes = await fetch(`/api/brands/${brandId}/drafts/${draftId}`)
          if (checkRes.ok) {
            const checkData = await checkRes.json()
            const updatedDraft = checkData.draft
            if (updatedDraft && updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
              clearInterval(interval)
              setSaving(false)
              
              // Reload final draft list
              await loadDrafts()
              
              // If the editor is still open for this draft, load the new content
              if (selectedId === draftId) {
                setCaption(updatedDraft.caption)
                setHashtags(formatTags(updatedDraft.hashtags))
                setCreativeHooks(updatedDraft.creativeHooks || '')
              }
            }
          }
        } catch (e) {
          console.error('Polling error:', e)
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval)
          setSaving(false)
        }
      }, 2000)

    } catch (e) {
      setSaving(false)
      if (!silent) {
        setError(e instanceof Error ? e.message : '触发 AI 创作失败')
      } else {
        console.error(`Copywriter trigger failed silently:`, e)
      }
    }
  }

  const handleMediaAIDesign = async (index: number, assetId: string, actionType: 'design' | 'video') => {
    if (!mediaOpPrompt.trim()) {
      alert('请输入操作提示词')
      return
    }
    
    setMediaProcessingIndex(index)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/assets/${assetId}/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: mediaOpPrompt, action: actionType })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '操作失败')
      }

      const newAsset = data.asset

      setAttachedMedia(prev => {
        const next = [...prev]
        next[index] = {
          id: newAsset.id,
          type: 'asset',
          url: newAsset.url
        }
        return next
      })

      alert(actionType === 'video' ? 'AI 视频生成成功！已为您同步该视频。' : 'AI 修图优化成功！已为您更新该图片。')
      setActiveMediaOp(null)
      setMediaOpPrompt('')
      await loadBrandAssets()
    } catch (err: any) {
      alert(err.message || '操作失败')
    } finally {
      setMediaProcessingIndex(null)
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
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30 p-3 backdrop-blur-sm" onClick={closeEditor}>
          <div className="flex h-full w-full max-w-xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400 flex items-center gap-2">
                  <span>{selectedDraft ? STATUS_LABELS[selectedDraft.status] || selectedDraft.status : 'New draft'}</span>
                  {selectedDraft?.status === 'published' && selectedDraft.postUrl && (
                    <a
                      href={selectedDraft.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300 font-bold"
                    >
                      🔗 查看文章
                    </a>
                  )}
                </p>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">
                  {selectedDraft ? (selectedDraft.status === 'published' ? '查看已发布文章' : '编辑草稿') : '新建草稿'}
                </h3>
              </div>
              <button onClick={closeEditor} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {selectedDraft?.status !== 'published' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">内容创意 / 生成指令 (AI Idea & Prompt)</label>
                  <textarea
                    value={contentIdea}
                    onChange={(event) => setContentIdea(event.target.value)}
                    placeholder="输入内容创意或AI生成指令，例如：‘介绍我们的新菜单，突出新鲜食材和南洋风味’，AI将自动按所选平台特性重构文案..."
                    className="min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              )}
              
              {selectedDraft?.status !== 'published' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">创意 hooks (Creative Hooks)</label>
                  <textarea
                    value={creativeHooks}
                    onChange={(event) => setCreativeHooks(event.target.value)}
                    placeholder="输入吸睛创意 hooks / 写作思路 / 爆款切入点，方便保存思路并供 AI 创作时使用..."
                    className="min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              )}
              
              {selectedDraft && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">草稿正文 (Draft Caption)</label>
                    <textarea
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder="输入草稿正文..."
                      disabled={selectedDraft?.status === 'published'}
                      className="min-h-[160px] w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  </div>
                  <input
                    value={hashtags}
                    onChange={(event) => setHashtags(event.target.value)}
                    placeholder="标签，用逗号分隔，例如 lunch, promo, weekend"
                    disabled={selectedDraft?.status === 'published'}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 min-h-[44px]">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">发布账号 (多选) <span className="text-red-500">*</span></p>
                  {accounts.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">未绑定任何账号</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {accounts.map((account) => {
                        const isSelected = selectedAccountIds.includes(account.id)
                        return (
                          <button
                            key={account.id}
                            type="button"
                            disabled={selectedDraft?.status === 'published'}
                            onClick={() => {
                              setSelectedAccountIds(prev => {
                                const next = prev.includes(account.id)
                                  ? prev.filter(id => id !== account.id)
                                  : [...prev, account.id]
                                setAccountId(next[0] || '')
                                return next
                              })
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all flex items-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300'
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            <span>{account.platformId.toLowerCase() === 'instagram' ? '📸' : account.platformId.toLowerCase() === 'facebook' ? '👥' : account.platformId.toLowerCase() === 'red' ? '📕' : account.platformId.toLowerCase() === 'tiktok' ? '🎵' : '🔗'}</span>
                            <span>{account.displayName || account.handle}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-end">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    disabled={selectedDraft?.status === 'published'}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              {selectedDraft && (
                <textarea
                  value={agentNote}
                  onChange={(event) => setAgentNote(event.target.value)}
                  placeholder="协作备注 / 修改说明"
                  disabled={selectedDraft?.status === 'published'}
                  className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              )}

              {/* Media & Assets Section */}
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">媒体与素材</h4>
                  <div className="flex items-center gap-2">
                    {attachedMedia.length > 0 && selectedDraft?.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() => setAttachedMedia([])}
                        className="text-xs font-semibold text-rose-600 dark:text-rose-455 hover:underline cursor-pointer"
                      >
                        清空选择
                      </button>
                    )}
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      已选: {attachedMedia.length}
                    </span>
                  </div>
                </div>

                {/* Drag-and-drop grid */}
                {attachedMedia.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400">
                      {selectedDraft?.status === 'published' ? '媒体内容' : '拖拽调整媒体排序'}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {attachedMedia.map((item, index) => {
                        const isVid = isVideoUrl(item.url)
                        return (
                          <div
                            key={`${item.type}-${item.id}-${index}`}
                            draggable={selectedDraft?.status !== 'published'}
                            onDragStart={(e) => selectedDraft?.status !== 'published' && handleDragStart(e, index)}
                            onDragOver={(e) => selectedDraft?.status !== 'published' && handleDragOver(e, index)}
                            onDragEnd={selectedDraft?.status !== 'published' ? handleDragEnd : undefined}
                            className={`relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900 group shadow-sm transition-shadow ${
                              selectedDraft?.status === 'published'
                                ? 'cursor-default'
                                : draggedIndex === index
                                ? 'opacity-40 border-emerald-500 scale-95 cursor-grab active:cursor-grabbing'
                                : 'cursor-grab active:cursor-grabbing hover:shadow'
                            }`}
                          >
                            {isVid ? (
                              <video src={item.url.startsWith('http') ? item.url : `${item.url}#t=0.1`} preload="metadata" className="h-full w-full object-cover pointer-events-none" muted />
                            ) : (
                              <img src={item.url} className="h-full w-full object-cover pointer-events-none" alt="" />
                            )}
                            {selectedDraft?.status !== 'published' && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMedia(index)}
                                className="absolute top-1 right-1 rounded-full bg-red-500 hover:bg-red-600 p-1 text-white opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                            {isVid && (
                              <div className="absolute bottom-1 right-1 bg-black/50 p-0.5 rounded">
                                <Play className="h-3 w-3 text-white fill-white" />
                              </div>
                            )}
                            <div className={`absolute bottom-1 left-1 px-1 rounded text-[8px] font-black text-white ${
                              item.type === 'asset' ? 'bg-emerald-500/80' : 'bg-blue-500/80'
                            }`}>
                              {item.type === 'asset' ? '素材库' : '外链'}
                            </div>

                            {/* AI Image design & Video generation overlays */}
                            {selectedDraft?.status !== 'published' && item.type === 'asset' && !isVid && (
                              <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveMediaOp({ index, action: 'design' })
                                    setMediaOpPrompt('')
                                  }}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] py-1 font-bold flex items-center justify-center gap-1"
                                >
                                  <Wand2 className="h-2.5 w-2.5" /> AI优化
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveMediaOp({ index, action: 'video' })
                                    setMediaOpPrompt('')
                                  }}
                                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] py-1 font-bold flex items-center justify-center gap-1"
                                >
                                  <Video className="h-2.5 w-2.5" /> 生视频
                                </button>
                              </div>
                            )}

                            {/* Processing Overlay */}
                            {mediaProcessingIndex === index && (
                              <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-1 z-20">
                                <Loader2 className="h-5 w-5 text-white animate-spin" />
                                <span className="text-[9px] text-white font-bold">
                                  {activeMediaOp?.action === 'video' ? '视频生成中...' : '图片优化中...'}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Inline media AI prompt form */}
                    {activeMediaOp && (
                      <div className="mt-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            {activeMediaOp.action === 'video' ? (
                              <>
                                <Video className="h-3.5 w-3.5 text-indigo-500" />
                                AI 图生视频 (第 {activeMediaOp.index + 1} 张图)
                              </>
                            ) : (
                              <>
                                <Wand2 className="h-3.5 w-3.5 text-emerald-500" />
                                AI 图片优化 (第 {activeMediaOp.index + 1} 张图)
                              </>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">使用 Kie.ai API</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={mediaOpPrompt}
                            onChange={(e) => setMediaOpPrompt(e.target.value)}
                            placeholder={
                              activeMediaOp.action === 'video'
                                ? "输入提示词，例如：'让锅里的食物冒热气，缓慢推近'..."
                                : "输入提示词，例如：'提高亮度，添加专业的美食滤镜'..."
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const item = attachedMedia[activeMediaOp.index]
                                if (item && item.type === 'asset') {
                                  handleMediaAIDesign(activeMediaOp.index, item.id, activeMediaOp.action)
                                }
                              }
                            }}
                            className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const item = attachedMedia[activeMediaOp.index]
                                if (item && item.type === 'asset') {
                                  handleMediaAIDesign(activeMediaOp.index, item.id, activeMediaOp.action)
                                }
                              }}
                              className="px-3 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold hover:bg-slate-800"
                            >
                              确定
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMediaOp(null)
                                setMediaOpPrompt('')
                              }}
                              className="px-3 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 text-xs font-bold"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Add URL input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">添加外部媒体链接</label>
                  <div className="flex gap-2">
                    <input
                      value={newUrlInput}
                      disabled={selectedDraft?.status === 'published'}
                      onChange={(event) => setNewUrlInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          if (selectedDraft?.status !== 'published') handleAddUrl()
                        }
                      }}
                      placeholder="https://example.com/image.jpg"
                      className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      disabled={selectedDraft?.status === 'published'}
                      onClick={handleAddUrl}
                      className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {/* Browse brand assets */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">从品牌素材库中选择</label>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-[10px] font-black">
                      <button
                        type="button"
                        onClick={() => setAssetTypeFilter('all')}
                        className={`px-2 py-0.5 rounded transition-all ${
                          assetTypeFilter === 'all'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                        }`}
                      >
                        全部
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssetTypeFilter('image')}
                        className={`px-2 py-0.5 rounded transition-all ${
                          assetTypeFilter === 'image'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                        }`}
                      >
                        图片
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssetTypeFilter('video')}
                        className={`px-2 py-0.5 rounded transition-all ${
                          assetTypeFilter === 'video'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                        }`}
                      >
                        视频
                      </button>
                    </div>
                  </div>

                  {filteredAssets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
                      <p className="text-xs text-slate-400">
                        {assetTypeFilter === 'image' ? '暂无图片素材' : assetTypeFilter === 'video' ? '暂无视频素材' : '品牌素材库中暂无素材'}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-300">请前往“素材”面板上传图片或视频</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3.5 max-h-[380px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-950 scrollbar-thin">
                        {filteredAssets.slice(0, assetPageSize).map((asset, idx) => {
                          const isSelected = selectedAssetIds.includes(asset.id)
                          const isVid = asset.mimeType.startsWith('video/')
                          return (
                            <div
                              key={asset.id}
                              className={`relative aspect-square rounded-xl overflow-hidden border bg-slate-100 dark:bg-slate-900 transition-all duration-200 group shadow-sm hover:scale-[1.03] hover:shadow-md ${
                                isSelected 
                                  ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-650'
                              }`}
                            >
                              <button
                                type="button"
                                disabled={selectedDraft?.status === 'published'}
                                onClick={() => selectedDraft?.status !== 'published' && handleToggleAsset(asset)}
                                className="absolute inset-0 w-full h-full text-left disabled:cursor-not-allowed"
                              >
                                {isVid ? (
                                  <video src={asset.url.startsWith('http') ? asset.url : `${asset.url}#t=0.1`} preload="metadata" className="h-full w-full object-cover pointer-events-none" muted />
                                ) : (
                                  <img src={asset.url} className="h-full w-full object-cover pointer-events-none" alt="" />
                                )}
                              </button>

                              {isSelected && (
                                <div className="absolute inset-0 bg-emerald-950/20 backdrop-blur-[0.5px] pointer-events-none" />
                              )}

                              {isSelected && (
                                <div className={`absolute top-1.5 right-1.5 bg-emerald-500 rounded-full p-0.5 shadow-sm transition-colors z-10 ${selectedDraft?.status !== 'published' ? 'group-hover:bg-rose-600' : ''}`}>
                                  <Check className={`h-3 w-3 text-white stroke-[3px] block ${selectedDraft?.status !== 'published' ? 'group-hover:hidden' : ''}`} />
                                  {selectedDraft?.status !== 'published' && (
                                    <X className="h-3 w-3 text-white stroke-[3px] hidden group-hover:block" />
                                  )}
                                </div>
                              )}

                              {isVid && (
                                <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-[2px] p-1 rounded border border-white/10 shadow-sm pointer-events-none">
                                  <Play className="h-2.5 w-2.5 text-white fill-white" />
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setLightboxIndex(idx)
                                }}
                                className="absolute bottom-1.5 left-1.5 h-7 w-7 bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 backdrop-blur-md rounded-full shadow-sm flex items-center justify-center pointer-events-auto opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100 z-10"
                                title="预览大图"
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </button>

                              {asset.filename && (
                                <div className="absolute top-0 inset-x-0 bg-slate-950/70 p-1 text-[8px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                  {asset.filename}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {filteredAssets.length > assetPageSize && (
                        <div className="flex justify-center pt-2">
                          <button
                            type="button"
                            onClick={() => setAssetPageSize(prev => prev + 12)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 py-1.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-sm"
                          >
                            加载更多素材 (+12)
                          </button>
                        </div>
                      )}
                    </>
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

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800 w-full">
              <button
                type="button"
                onClick={() => {
                  const account = accounts.find((a) => a.id === accountId)
                  if (account) {
                    setPreviewPlatform(account.platformId.toLowerCase())
                  } else {
                    setPreviewPlatform('instagram')
                  }
                  setPreviewMediaIndex(0)
                  setPreviewOpen(true)
                }}
                className={`rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 flex items-center gap-2 ${(!selectedDraft || selectedDraft.status === 'published') ? 'mr-auto' : ''}`}
              >
                <Eye className="h-4 w-4" /> 预览效果
              </button>
              {selectedDraft && selectedDraft.status !== 'published' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => discardDraft(selectedDraft.id)}
                  className="rounded-md border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30 flex items-center gap-1.5 mr-auto"
                >
                  <Trash2 className="h-4 w-4" /> 废弃
                </button>
              )}
              {selectedDraft?.status === 'published' ? (
                selectedDraft.postUrl ? (
                  <a
                    href={selectedDraft.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white transition-colors animate-pulse"
                  >
                    打开已发布文章
                  </a>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 rounded-md bg-slate-300 dark:bg-slate-700 px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  >
                    打开已发布文章 (暂无链接)
                  </button>
                )
              ) : (
                <>
                  <button
                    type="button"
                    disabled={saving || (!caption.trim() && !contentIdea.trim()) || selectedAccountIds.length === 0}
                    onClick={async () => {
                      const activeCaption = caption.trim() || '【AI 正在创作中...】'
                      if (!caption.trim()) {
                        setCaption(activeCaption)
                      }
                      const statusToSave = selectedDraft ? selectedDraft.status : 'draft'
                      const saved = await saveDraft(statusToSave, activeCaption)
                      if (saved && saved.length > 0) {
                        await Promise.all(
                          saved.map(draft => triggerCopywriter(draft.id, true))
                        )
                        alert('AI 创作已在后台启动，您可以稍后查看。')
                        closeEditor()
                        await loadDrafts()
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    ✨ AI 创作
                  </button>
                  <button
                    disabled={saving || (!caption.trim() && !contentIdea.trim()) || selectedAccountIds.length === 0}
                    onClick={async () => {
                      const saved = await saveDraft('draft')
                      if (saved) closeEditor()
                    }}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    保存
                  </button>
                  <button
                    disabled={saving || (!caption.trim() && !contentIdea.trim()) || selectedAccountIds.length === 0}
                    onClick={submitDraft}
                    className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> 提交草稿
                  </button>
                  {selectedDraft?.status === 'pending_review' && (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          const saved = await saveDraft(selectedDraft.status)
                          if (saved && saved.length > 0) {
                            await triggerCopywriter(saved[0].id)
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        ✨ AI 重新创作
                      </button>
                      <button disabled={saving} onClick={() => reviewDraft('reject')} className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" /> 驳回</button>
                      <button disabled={saving} onClick={() => reviewDraft('approve')} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /> 批准</button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Platform Preview Mockups Dialog */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md" onClick={() => setPreviewOpen(false)}>
          <div className="relative flex h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/95 shadow-2xl dark:border-slate-800 dark:bg-slate-900/95 lg:flex-row" onClick={(e) => e.stopPropagation()}>
            
            {/* Platform Selector Left Sidebar */}
            <div className="w-full border-b border-slate-200 bg-white/50 p-5 dark:border-slate-800 dark:bg-slate-950/50 lg:w-80 lg:border-b-0 lg:border-r flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Eye className="h-5 w-5 text-emerald-500" /> 发布预览
                  </h3>
                  <button onClick={() => setPreviewOpen(false)} className="lg:hidden rounded-md p-1 hover:bg-slate-200 dark:hover:bg-slate-800">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  查看该内容在各个社交媒体平台的发布效果。
                </p>

                <div className="mt-6 space-y-2">
                  {[
                    { id: 'instagram', name: 'Instagram Feed', icon: '📸' },
                    { id: 'red', name: '小红书 (Xiaohongshu)', icon: '📕' },
                    { id: 'facebook', name: 'Facebook Post', icon: '👥' },
                    { id: 'tiktok', name: 'TikTok Video', icon: '🎵' },
                    { id: 'google_business', name: 'Google Business', icon: '🏪' },
                  ].map((plat) => (
                    <button
                      key={plat.id}
                      onClick={() => {
                        setPreviewPlatform(plat.id)
                        setPreviewMediaIndex(0)
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-black transition-all ${
                        previewPlatform === plat.id
                          ? 'bg-slate-900 text-white shadow-lg dark:bg-white dark:text-slate-950'
                          : 'text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="text-base">{plat.icon}</span>
                      {plat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">草稿摘要</h4>
                <div className="mt-2 space-y-1 text-xs">
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-400">正文字数:</span> {caption.length} 字
                  </p>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-400">标签数量:</span> {parseTags(hashtags).length} 个
                  </p>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-400">媒体数量:</span> {attachedMedia.length} 个
                  </p>
                </div>
              </div>
            </div>

            {/* Preview Viewport Center/Right Pane */}
            <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 lg:p-8">
              
              {/* Instagram Preview */}
              {previewPlatform === 'instagram' && (
                <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-white shadow-lg dark:border-slate-955 dark:bg-black text-black dark:text-white">
                  {/* Instagram Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-[1px]">
                        <div className="h-full w-full rounded-full border border-white bg-slate-200 dark:border-black overflow-hidden">
                          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold leading-tight">{activeAccount?.displayName || activeAccount?.handle || brandName || 'Your Brand'}</p>
                        <p className="text-[8px] text-slate-500 leading-none mt-0.5">Singapore</p>
                      </div>
                    </div>
                    <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  {/* Instagram Media Slider */}
                  <div className="relative aspect-square w-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                    {attachedMedia.length > 0 ? (
                      <>
                        {isVideoUrl(attachedMedia[previewMediaIndex % attachedMedia.length]?.url) ? (
                          <video src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                        ) : (
                          <img src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                        )}
                        {attachedMedia.length > 1 && (
                          <>
                            <span className="absolute right-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white z-10">
                              {(previewMediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                              }}
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev + 1) % attachedMedia.length)
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
                    <p className="mt-2 text-[9px] font-bold">1,245 likes</p>
                    <div className="mt-1 space-y-1 text-[10px]">
                      <p className="leading-relaxed text-left">
                        <span className="font-bold mr-1">{activeAccount?.handle || brandName || 'brand'}</span>
                        <span className="whitespace-pre-wrap">{caption}</span>
                      </p>
                      {parseTags(hashtags).length > 0 && (
                        <p className="text-blue-600 dark:text-blue-400 font-medium text-left">
                          {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                        </p>
                      )}
                      <p className="text-slate-400 dark:text-slate-500 text-[9px] mt-1 cursor-pointer hover:underline text-left">查看全部 12 条评论</p>
                      <p className="text-slate-400 dark:text-slate-500 text-[8px] tracking-wider uppercase mt-1 text-left">2小时前</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Xiaohongshu Preview */}
              {previewPlatform === 'red' && (
                <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-white shadow-lg dark:border-slate-955 dark:bg-[#0f0f0f] text-black dark:text-white">
                  {/* XHS Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-900">
                    <div className="flex items-center gap-1.5">
                      <div className="h-6 w-6 rounded-full bg-slate-200 overflow-hidden border border-slate-100 dark:border-slate-800">
                        <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                      </div>
                      <p className="text-[10px] font-bold">{activeAccount?.displayName || brandName || 'Your Brand'}</p>
                    </div>
                    <button className="rounded-full bg-[#ff2442] px-2.5 py-0.5 text-[9px] font-black text-white hover:bg-[#e0203a] transition-colors">关注</button>
                  </div>

                  {/* XHS Media */}
                  <div className="relative aspect-[3/4] w-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                    {attachedMedia.length > 0 ? (
                      <>
                        {isVideoUrl(attachedMedia[previewMediaIndex % attachedMedia.length]?.url) ? (
                          <video src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                        ) : (
                          <img src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                        )}
                        {attachedMedia.length > 1 && (
                          <>
                            <span className="absolute right-2 top-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[8px] font-bold text-white z-10">
                              {(previewMediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                              }}
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev + 1) % attachedMedia.length)
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

                  {/* XHS Content */}
                  <div className="px-3 py-2.5 max-h-32 overflow-y-auto border-b border-slate-50 dark:border-slate-900">
                    <h4 className="text-[11px] font-black leading-normal text-slate-900 dark:text-white text-left">
                      {caption.split('\n')[0]?.slice(0, 30) || 'Untitled Post'}
                    </h4>
                    <p className="mt-1 whitespace-pre-wrap text-[10px] leading-normal text-slate-700 dark:text-slate-300 text-left">
                      {caption.split('\n').slice(1).join('\n') || caption}
                    </p>
                    {parseTags(hashtags).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {parseTags(hashtags).map((tag) => (
                          <span key={tag} className="text-[10px] text-[#3a5b8f] dark:text-[#6a90d0] font-medium hover:underline cursor-pointer">#${tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* XHS Footer bar */}
                  <div className="flex items-center justify-between px-3 py-2 text-slate-500 dark:text-slate-400 text-[9px]">
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1 text-slate-405 dark:text-slate-500 text-[9px] mr-2.5 flex items-center">
                      说点什么...
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-0.5 cursor-pointer">
                        <Heart className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 hover:text-[#ff2442] hover:fill-[#ff2442]" />
                        <span className="font-bold text-slate-600 dark:text-slate-300">152</span>
                      </div>
                      <div className="flex items-center gap-0.5 cursor-pointer">
                        <Star className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 hover:text-yellow-500 hover:fill-yellow-500" />
                        <span className="font-bold text-slate-600 dark:text-slate-300">48</span>
                      </div>
                      <div className="flex items-center gap-0.5 cursor-pointer">
                        <MessageCircle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        <span className="font-bold text-slate-600 dark:text-slate-300">12</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Facebook Preview */}
              {previewPlatform === 'facebook' && (
                <div className="mx-auto w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-805 dark:bg-slate-900 text-black dark:text-white">
                  {/* FB Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-slate-200 overflow-hidden border border-slate-100 dark:border-slate-800">
                        <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-900 dark:text-white text-left">{activeAccount?.displayName || brandName || 'Your Brand'}</p>
                        <p className="text-[8px] text-slate-500 flex items-center gap-1 mt-0.5">
                          Just now · <Globe className="w-2.5 h-2.5 text-slate-400" />
                        </p>
                      </div>
                    </div>
                    <MoreVertical className="h-4 w-4 text-slate-400" />
                  </div>

                  {/* FB Text */}
                  <div className="mt-2 text-[10px] leading-relaxed text-slate-800 dark:text-slate-205 text-left">
                    <p className="whitespace-pre-wrap">{caption}</p>
                    {parseTags(hashtags).length > 0 && (
                      <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">
                        {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                      </p>
                    )}
                  </div>

                  {/* FB Collage Layout */}
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 relative">
                    {attachedMedia.length === 0 ? (
                      <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-slate-400">
                        <ImageIcon className="h-8 w-8 text-slate-300" />
                        <span className="text-[10px] font-semibold">暂无媒体文件</span>
                      </div>
                    ) : (
                      <div className="relative aspect-video w-full">
                        {isVideoUrl(attachedMedia[previewMediaIndex % attachedMedia.length]?.url) ? (
                          <video src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                        ) : (
                          <img src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                        )}
                        {attachedMedia.length > 1 && (
                          <>
                            <span className="absolute right-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white z-10">
                              {(previewMediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                              }}
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev + 1) % attachedMedia.length)
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* FB Reactions bar */}
                  <div className="mt-2.5 flex items-center justify-between border-b border-slate-100 pb-2 text-[9px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[8px] font-bold">👍</span>
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold -ml-2">❤️</span>
                      <span className="font-semibold ml-0.5">45 likes</span>
                    </div>
                    <div className="flex gap-2">
                      <span>12 comments</span>
                      <span>·</span>
                      <span>3 shares</span>
                    </div>
                  </div>

                  {/* FB Actions */}
                  <div className="mt-1 flex items-center justify-around text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded flex-1 justify-center transition-colors">
                      <ThumbsUp className="w-3.5 h-3.5" /> Like
                    </span>
                    <span className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded flex-1 justify-center transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" /> Comment
                    </span>
                    <span className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded flex-1 justify-center transition-colors">
                      <Share2 className="w-3.5 h-3.5" /> Share
                    </span>
                  </div>
                </div>
              )}

              {/* TikTok Preview */}
              {previewPlatform === 'tiktok' && (
                <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-black shadow-lg dark:border-slate-955 text-white">
                  {/* TikTok Media Panel */}
                  <div className="relative aspect-[9/16] w-full bg-slate-950 flex items-center justify-center">
                    {attachedMedia.length > 0 ? (
                      <>
                        <img src={attachedMedia[0].url} className="absolute inset-0 h-full w-full object-cover blur-xl opacity-30" alt="" />
                        {isVideoUrl(attachedMedia[0].url) ? (
                          <video src={attachedMedia[0].url} className="relative z-10 h-full w-full object-contain" controls muted />
                        ) : (
                          <img src={attachedMedia[0].url} className="relative z-10 max-h-full max-w-full object-contain" alt="" />
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-white/40">
                        <Video className="h-8 w-8" />
                        <span className="text-[10px] font-semibold">暂无媒体文件</span>
                      </div>
                    )}

                    {/* TikTok Top Navigation */}
                    <div className="absolute top-4 left-0 right-0 z-10 flex justify-center gap-3.5 text-[10px] font-bold text-white/60">
                      <span className="hover:text-white">Following</span>
                      <span className="text-white border-b-2 border-white pb-0.5">For You</span>
                    </div>

                    {/* TikTok Sidebar Overlay */}
                    <div className="absolute bottom-20 right-2.5 z-10 flex flex-col items-center gap-3.5">
                      <div className="relative">
                        <div className="h-8 w-8 rounded-full border border-white bg-slate-400 overflow-hidden">
                          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                        </div>
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#ff0050] px-1 text-[8px] font-bold text-white z-10">+</span>
                      </div>
                      <div className="flex flex-col items-center cursor-pointer">
                        <Heart className="w-5.5 h-5.5 text-white fill-white hover:text-red-500 hover:fill-red-500 transition-colors" />
                        <span className="text-[8px] font-bold mt-0.5">89.2K</span>
                      </div>
                      <div className="flex flex-col items-center cursor-pointer">
                        <MessageCircle className="w-5.5 h-5.5 text-white fill-white" />
                        <span className="text-[8px] font-bold mt-0.5">4,120</span>
                      </div>
                      <div className="flex flex-col items-center cursor-pointer">
                        <Bookmark className="w-5.5 h-5.5 text-white fill-white" />
                        <span className="text-[8px] font-bold mt-0.5">2,845</span>
                      </div>
                      <div className="flex flex-col items-center cursor-pointer">
                        <Share2 className="w-5.5 h-5.5 text-white fill-white" />
                        <span className="text-[8px] font-bold mt-0.5">1,029</span>
                      </div>

                      {/* Spinning Disc */}
                      <div className="w-7 h-7 rounded-full bg-slate-900 border border-slate-700/50 flex items-center justify-center animate-spin mt-1" style={{ animationDuration: '6s' }}>
                        <div className="w-4 h-4 rounded-full bg-slate-800 border border-slate-650 flex items-center justify-center overflow-hidden">
                          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover animate-spin" style={{ animationDuration: '6s' }} alt="" />
                        </div>
                      </div>
                    </div>

                    {/* TikTok Bottom Panel */}
                    <div className="absolute bottom-4 left-3 right-12 z-10 space-y-1.5 text-white text-[10px] text-left">
                      <p className="font-bold text-xs">@{activeAccount?.handle || brandName || 'brand_tiktok'}</p>
                      <p className="line-clamp-2 leading-relaxed text-white/90 whitespace-pre-wrap">{caption}</p>
                      {parseTags(hashtags).length > 0 && (
                        <div className="flex gap-1 flex-wrap font-bold font-mono">
                          {parseTags(hashtags).map((tag) => (
                            <span key={tag}>#${tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 overflow-hidden bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full w-fit max-w-[140px]">
                        <span className="text-[8px] animate-pulse">🎵</span>
                        <span className="text-[8px] overflow-hidden whitespace-nowrap text-ellipsis">Original Sound - @{activeAccount?.handle || brandName || 'brand'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Google Business Preview */}
              {previewPlatform === 'google_business' && (
                <div className="mx-auto w-full max-w-[340px] rounded-xl border border-slate-205 bg-white p-3 shadow-lg dark:border-slate-888 dark:bg-slate-905 text-black dark:text-white">
                  {/* GBP Header */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm shrink-0">
                      <Store className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black leading-tight text-left">{brandName || 'Your Business Name'}</p>
                      <p className="text-[8px] text-slate-400 mt-0.5 text-left">Google Business · Updated just now</p>
                    </div>
                  </div>

                  {/* GBP Cover image */}
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-955 relative">
                    {attachedMedia.length > 0 ? (
                      <div className="relative aspect-video w-full">
                        {isVideoUrl(attachedMedia[previewMediaIndex % attachedMedia.length]?.url) ? (
                          <video src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                        ) : (
                          <img src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                        )}
                        {attachedMedia.length > 1 && (
                          <>
                            <span className="absolute right-2 top-2 rounded-full bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-white z-10">
                              {(previewMediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1))
                              }}
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMediaIndex(prev => (prev + 1) % attachedMedia.length)
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-24 flex-col items-center justify-center gap-1.5 text-slate-400">
                        <ImageIcon className="h-6 w-6 text-slate-300" />
                        <span className="text-[10px] font-semibold">暂无封面图片</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 text-[10px] leading-normal text-slate-700 dark:text-slate-350 text-left">
                    <p className="whitespace-pre-wrap">{caption}</p>
                    {parseTags(hashtags).length > 0 && (
                      <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">
                        {parseTags(hashtags).map(tag => `#${tag}`).join(' ')}
                      </p>
                    )}
                  </div>

                  {/* GBP Button */}
                  <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <button className="w-full rounded-md bg-[#1a73e8] hover:bg-[#1557b0] py-2 text-[10px] font-bold text-white transition-colors tracking-wide uppercase">
                      了解更多 (Learn More)
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Absolute Close Button */}
            <button
              onClick={() => setPreviewOpen(false)}
              className="absolute right-4 top-4 z-20 hidden rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900/80 dark:bg-slate-100/60 dark:text-black dark:hover:bg-slate-100/80 lg:flex"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {lightboxIndex !== null && filteredAssets[lightboxIndex] && (() => {
        const asset = filteredAssets[lightboxIndex]
        const isVid = asset.mimeType.startsWith('video/')
        const isSelected = selectedAssetIds.includes(asset.id)
        
        return (
          <div 
            className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Top Toolbar */}
            <div className="w-full flex items-center justify-between px-4 py-2 bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl max-w-5xl z-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col text-left">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">素材库预览 ({lightboxIndex + 1} / {filteredAssets.length})</span>
                <span className="text-sm text-white font-black truncate max-w-md mt-0.5">{asset.filename || '未命名素材'}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setLightboxIndex(null)} 
                className="h-9 w-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Media Content Area */}
            <div className="flex-1 w-full flex items-center justify-center relative py-6" onClick={(e) => e.stopPropagation()}>
              {/* Previous Button */}
              <button
                type="button"
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredAssets.length - 1))}
                className="absolute left-4 lg:left-8 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg border border-white/5 z-10"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              {/* Media Display */}
              <div className="max-h-[70vh] max-w-[85vw] flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl relative bg-slate-900/50 p-1 border border-white/10">
                {isVid ? (
                  <video src={asset.url.startsWith('http') ? asset.url : `${asset.url}#t=0.1`} controls autoPlay className="max-h-[70vh] max-w-[85vw] object-contain rounded-xl" />
                ) : (
                  <img src={asset.url} className="max-h-[70vh] max-w-[85vw] object-contain rounded-xl" alt="" />
                )}
              </div>

              {/* Next Button */}
              <button
                type="button"
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev < filteredAssets.length - 1 ? prev + 1 : 0))}
                className="absolute right-4 lg:right-8 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg border border-white/5 z-10"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>

            {/* Bottom Actions Bar */}
            <div className="w-full flex items-center justify-center gap-3 py-2 z-10" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                disabled={selectedDraft?.status === 'published'}
                onClick={() => selectedDraft?.status !== 'published' && handleToggleAsset(asset)}
                className={`px-6 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                }`}
              >
                {isSelected ? (
                  <>
                    <X className="h-4 w-4 stroke-[3px]" />
                    <span>取消选择此素材</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 stroke-[3px]" />
                    <span>选择此素材</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )
      })()}
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
