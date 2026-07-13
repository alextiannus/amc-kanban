'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Heart,
  MessageCircle,
  Eye,
  Share2,
  ExternalLink,
  Calendar,
  Tag,
  Play,
  Plus,
  Clock,
  Sparkles,
  AlertTriangle,
  Wand2,
  Video,
  Loader2,
  Save,
  Trash2,
  Edit3,
  RefreshCw,
  ChevronDown,
  Check,
  Globe,
  Store,
  ChevronLeft,
  ChevronRight,
  FileText,
  MoreVertical,
  MessageSquare,
  Zap,
  Send
} from 'lucide-react'
import PostPreviewModal from './PostPreviewModal'
import { callGeminiDirect } from '@/lib/gemini-direct'
import { COPYWRITER_ROSTER, draftAccountIdForCopywriter, platformAliases } from '@/lib/copywriters'

function isVideoUrl(url: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:\?.*)?$/i.test(path)
}

function parseTags(value: string) {
  return value
    .split(/[#,，,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
}

function formatTags(tags: string[]) {
  return tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
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

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  scheduled: '已排期',
  published: '已发布',
  failed: '生成失败',
  done: '已发布', // Fallback
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  pending_review: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/60',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60',
  failed: 'bg-rose-105 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/60',
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-[#E4405F] text-white',
  tiktok: 'bg-[#010101] text-white',
  xiaohongshu: 'bg-[#FF2442] text-white',
  red: 'bg-[#FF2442] text-white',
  facebook: 'bg-[#1877F2] text-white',
  google: 'bg-[#4285F4] text-white',
  google_business: 'bg-[#4285F4] text-white',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  xiaohongshu: '小红书',
  red: '小红书',
  facebook: 'Facebook',
  google_business: 'Google Business',
}

/** Returns the effective default selectedAccountIds:
 *  - copywriters whose platform the brand has a real account configured
 *  - plus 小红书 (XHS) is always included as a default target regardless of account config */
function buildDefaultAccountIds(accounts: SocialAccountOption[]): string[] {
  return COPYWRITER_ROSTER
    .filter((copywriter) => {
      // Always include XHS
      if (['xiaohongshu', 'xhs'].includes(copywriter.platform.toLowerCase())) return true
      // Include if brand has a real account configured for this platform
      const aliases = platformAliases(copywriter.platform)
      return accounts.some((a) => aliases.includes((a.platformId || '').toLowerCase()))
    })
    .map((copywriter) => draftAccountIdForCopywriter(copywriter, accounts))
}

function normalizePlatformLabel(plat?: string): string {
  if (!plat) return ''
  const p = plat.toLowerCase()
  if (p === 'instagram' || p === 'ig') return 'ig'
  if (['red', 'xiaohongshu', 'xhs', 'rednote'].includes(p)) return 'xhs'
  if (p === 'facebook' || p === 'fb') return 'fb'
  if (p === 'tiktok') return 'tiktok'
  if (p === 'google_business' || p === 'google' || p === 'google_maps') return 'gbp'
  return p
}

interface DraftItem {
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

interface SocialAccountOption {
  id: string
  platformId: string
  handle?: string | null
  displayName?: string | null
}

interface Comment {
  id: string
  author: string
  avatar: string
  content: string
  time: string
  reply?: string
  isAiReply?: boolean
  isGeneratingReply?: boolean
}

interface PostEditDrawerProps {
  isOpen: boolean
  onClose: () => void
  postId: string | null // null means create new
  brandId: string
  brandName?: string
  onSuccess: () => void
  /** Pre-fill media when opening from asset library */
  initialAttachedMedia?: Array<{ id: string; type: 'asset' | 'url'; url: string }>
}

export default function PostEditDrawer({
  isOpen,
  onClose,
  postId,
  brandId,
  brandName = '当前品牌',
  onSuccess,
  initialAttachedMedia,
}: PostEditDrawerProps) {
  const [selectedDraft, setSelectedDraft] = useState<DraftItem | null>(null)
  const [accounts, setAccounts] = useState<SocialAccountOption[]>([])
  
  // Form states
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [agentNote, setAgentNote] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [contentIdea, setContentIdea] = useState('')
  const [creativeHooks, setCreativeHooks] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<Array<{ id: string; type: 'asset' | 'url'; url: string }>>([])
  
  // Loading & Action states
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AI copywriting monitoring states
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [createdDrafts, setCreatedDrafts] = useState<any[] | null>(null)
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>({})
  const [draftHashtags, setDraftHashtags] = useState<Record<string, string>>({})
  const [draftStatuses, setDraftStatuses] = useState<Record<string, 'generating' | 'completed' | 'failed'>>({})
  // Per-account LLM Token/API error message (non-fatal: fallback content was generated)
  const [draftWarnings, setDraftWarnings] = useState<Record<string, string>>({})
  const [previewOnly, setPreviewOnly] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  // Maps draft.id → copywriter.id so save/schedule handlers can look up captions by copywriter
  const [draftCopywriterMap, setDraftCopywriterMap] = useState<Record<string, string>>({})

  // Hooks generator states
  const [showHookGenerator, setShowHookGenerator] = useState(false)
  const [hookBusinessType, setHookBusinessType] = useState('F&B')
  const [hookStyle, setHookStyle] = useState('Contra-Narrative')
  const [hookTopic, setHookTopic] = useState('')
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false)
  const [generatedHooks, setGeneratedHooks] = useState<Array<{ visual: string; overlay: string; audio: string }>>([])

  // Media assets states
  const [brandAssets, setBrandAssets] = useState<Array<{ id: string; url: string; filename?: string | null; mimeType: string; usedCount?: number; createdAt?: string | Date }>>([])
  const [assetTypeFilter, setAssetTypeFilter] = useState<'unused' | 'all'>('unused')
  const [mediaUrlsInput, setMediaUrlsInput] = useState('')
  const [newUrlInput, setNewUrlInput] = useState('')
  const [activeMediaOp, setActiveMediaOp] = useState<{ index: number; action: 'design' | 'video' } | null>(null)
  const [mediaOpPrompt, setMediaOpPrompt] = useState('')
  const [mediaProcessingIndex, setMediaProcessingIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const assetPageSize = 12

  // Comments / conversion states (For Published Posts)
  const [commentsList, setCommentsList] = useState<Comment[]>([])
  const [commentReplyText, setCommentReplyText] = useState<Record<string, string>>({})
  const [clicksCount, setClicksCount] = useState(0)
  const [roiAmount, setRoiAmount] = useState(0)

  const selectedAssetIds = useMemo(() => {
    return attachedMedia.filter(m => m.type === 'asset').map(m => m.id)
  }, [attachedMedia])

  const filteredAssets = useMemo(() => {
    const sorted = [...brandAssets].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tB - tA
    })
    return sorted.filter(asset => {
      if (assetTypeFilter === 'unused') {
        return (asset.usedCount ?? 0) === 0
      }
      return true
    })
  }, [brandAssets, assetTypeFilter])

  // Load configuration & accounts
  useEffect(() => {
    if (!isOpen) return
    const loadAccounts = async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/accounts`)
        if (res.ok) {
          const json = await res.json()
          setAccounts(json.accounts || [])
        }
      } catch (err) {
        console.error('Failed to load accounts:', err)
      }
    }
    const loadBrandAssets = async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/assets`)
        if (res.ok) {
          const json = await res.json()
          setBrandAssets(json.assets || [])
        }
      } catch (err) {
        console.error('Failed to load assets:', err)
      }
    }
    loadAccounts()
    loadBrandAssets()
  }, [isOpen, brandId])

  // Load post details if editing
  useEffect(() => {
    if (!isOpen) return
    if (!postId) {
      // Create mode: reset all states
      setSelectedDraft(null)
      setCaption('')
      setHashtags('')
      // Default: select all configured accounts + XHS (always, via unconfigured_xhs if needed)
      setSelectedAccountIds(buildDefaultAccountIds(accounts))
      setScheduledAt('')
      setAgentNote('')
      setReviewNote('')
      setContentIdea('')
      setCreativeHooks('')
      // Pre-fill media if coming from asset library
      setAttachedMedia(initialAttachedMedia ?? [])
      setMediaUrlsInput('')
      setNewUrlInput('')
      setCommentsList([])
      return
    }

    const loadDraft = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/brands/${brandId}/drafts/${postId}`)
        if (!res.ok) throw new Error('加载 Post 详情失败')
        const json = await res.json()
        const draft = json.draft as DraftItem
        setSelectedDraft(draft)

        // Bind form values
        setCaption(draft.caption || '')
        setHashtags(formatTags(draft.hashtags || []))
        const accId = draft.accountId || draft.account?.id || ''
        setSelectedAccountIds(accId ? [accId] : buildDefaultAccountIds(accounts))
        setScheduledAt(toDateTimeLocal(draft.scheduledAt))

        if (draft.agentNote && draft.agentNote.includes("【AI 生成指令】")) {
          const cleanNote = draft.agentNote.replace(/【AI 生成指令】[\s\S]*?【\/AI 生成指令】(?:\r?\n)?/, '')
          setAgentNote(cleanNote.trim())
          const match = draft.agentNote.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/)
          if (match) {
            setContentIdea(match[1].trim())
          }
        } else {
          setAgentNote(draft.agentNote || '')
        }

        const initialMedia: Array<{ id: string; type: 'asset' | 'url'; url: string }> = []
        if (draft.assetRefs) {
          draft.assetRefs.forEach((ref) => {
            if (ref.asset) {
              initialMedia.push({
                id: ref.asset.id,
                type: 'asset',
                url: ref.asset.url || '',
              })
            }
          })
        }
        if (draft.mediaUrls) {
          draft.mediaUrls.forEach((url) => {
            initialMedia.push({
              id: url,
              type: 'url',
              url,
            })
          })
        }
        setAttachedMedia(initialMedia)
        setMediaUrlsInput((draft.mediaUrls || []).join(', '))
        setReviewNote('')

        // Load simulated comments and conversion stats if published
        if (draft.status === 'published' || draft.status === 'done') {
          // Generate realistic simulation data based on post ID
          const seed = draft.id.charCodeAt(0) + draft.id.charCodeAt(draft.id.length - 1)
          setClicksCount(Math.round((seed * 3.5) % 150) + 12)
          setRoiAmount(Math.round((seed * 22) % 450) + 40)
          
          setCommentsList([
            {
              id: 'c1',
              author: 'Alex Lin',
              avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format',
              content: '请问这家店在哪里啊？周末人多吗？想去打卡！',
              time: '2小时前'
            },
            {
              id: 'c2',
              author: 'Sarah Tan',
              avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&fit=crop&auto=format',
              content: '看图太有南洋风味了！有素食或者不含乳制品的选项吗？',
              time: '4小时前'
            }
          ])
        }
      } catch (err: any) {
        setError(err.message || '加载 Post 失败')
      } finally {
        setLoading(false)
      }
    }

    loadDraft()
  }, [isOpen, postId, brandId, accounts.length])

  // AI Generation Polling logic
  useEffect(() => {
    if (!isAiGenerating || !createdDrafts || createdDrafts.length === 0) return

    const interval = setInterval(async () => {
      const generatingDrafts = createdDrafts.filter(d => draftStatuses[draftCopywriterMap[d.id] || d.accountId] === 'generating')
      if (generatingDrafts.length === 0) {
        setIsAiGenerating(false)
        clearInterval(interval)
        return
      }

      const updatedStatuses = { ...draftStatuses }
      await Promise.all(
        generatingDrafts.map(async (draft) => {
          const cwKey = draftCopywriterMap[draft.id] || draft.accountId
          try {
            const checkRes = await fetch(`/api/brands/${brandId}/drafts/${draft.id}`)
            if (checkRes.status === 404) {
              updatedStatuses[cwKey] = 'failed'
              return
            }
            if (checkRes.ok) {
              const checkData = await checkRes.json()
              const updatedDraft = checkData.draft
              if (updatedDraft) {
                if (updatedDraft.status === 'failed') {
                  updatedStatuses[cwKey] = 'failed'
                  // Clean up failed draft
                  fetch(`/api/brands/${brandId}/drafts/${draft.id}`, { method: 'DELETE' }).catch(() => {})
                } else if (updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
                  updatedStatuses[cwKey] = 'completed'
                  setDraftCaptions(prev => ({ ...prev, [cwKey]: updatedDraft.caption }))
                  setDraftHashtags(prev => ({ ...prev, [cwKey]: (updatedDraft.hashtags || []).join(' ') }))
                  // Detect LLM Token/API failure — publisher saved fallback content as 'draft'
                  const note: string = updatedDraft.agentNote || ''
                  if (note.includes('AI 智能写作失败') || note.includes('LLM') || note.includes('token') || note.includes('Token')) {
                    setDraftWarnings(prev => ({
                      ...prev,
                      [cwKey]: `AI Token 错误：${note}`,
                    }))
                  }
                }
              }
            }
          } catch (e) {
            console.error(`Error polling draft ${draft.id}:`, e)
          }
        })
      )

      setDraftStatuses(updatedStatuses)
    }, 2000)

    return () => clearInterval(interval)
  }, [isAiGenerating, createdDrafts, brandId, draftStatuses, draftCopywriterMap])

  // Action methods
  const saveDraft = async (nextStatus?: string, captionOverride?: string, accountIdsOverride?: string[]): Promise<DraftItem[] | null> => {
    let activeCaption = captionOverride !== undefined ? captionOverride : caption
    if (!activeCaption.trim() && contentIdea.trim()) {
      activeCaption = contentIdea.trim()
      setCaption(activeCaption)
    }
    const trimmedCaption = activeCaption.trim()
    if (!trimmedCaption && attachedMedia.length === 0) {
      setError('草稿正文、内容创意或素材不能为空')
      return null
    }
    const activeAccountIds = accountIdsOverride || selectedAccountIds
    if (activeAccountIds.length === 0) {
      setError('请至少选择一位 Copywriter')
      return null
    }
    setSaving(true)
    setError(null)
    const mediaUrls = attachedMedia.filter((m) => m.type === 'url').map((m) => m.url)
    const formattedAgentNote = contentIdea.trim() ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】\n${agentNote}` : agentNote
    try {
      const savedDrafts: DraftItem[] = []

      if (selectedDraft) {
        // Update existing draft
        const endpoint = `/api/brands/${brandId}/drafts/${selectedDraft.id}`
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: trimmedCaption,
            hashtags: parseTags(hashtags),
            accountId: activeAccountIds[0],
            scheduledAt: fromDateTimeLocal(scheduledAt),
            agentNote: formattedAgentNote,
            status: nextStatus || selectedDraft.status || 'draft',
            mediaUrls,
            assetIds: selectedAssetIds,
            creativeHooks: creativeHooks.trim(),
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || '修改 Post 失败')
        if (json.draft) savedDrafts.push(json.draft)

        // Create new drafts for additional accounts
        const otherAccounts = activeAccountIds.slice(1)
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
              }
              return null
            })
          )
          results.forEach(d => { if (d) savedDrafts.push(d) })
        }
      } else {
        // Create new drafts for all accounts
        const results = await Promise.all(
          activeAccountIds.map(async (accId) => {
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
            if (!res.ok) throw new Error(json.error || '创建 Post 失败')
            return json.draft || null
          })
        )
        results.forEach(d => { if (d) savedDrafts.push(d) })
      }

      return savedDrafts
    } catch (e: any) {
      setError(e.message || '保存 Post 失败')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = async () => {
    const isScheduled = selectedDraft?.status === 'scheduled'
    const confirmMsg = isScheduled ? '确定要取消并删除该排期吗？' : '确定要废弃该内容吗？此操作不可逆。'
    if (!confirm(confirmMsg)) return
    
    setSaving(true)
    setError(null)
    const targetId = selectedDraft?.id || postId
    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${targetId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '操作失败')
      }
      alert(isScheduled ? '已成功取消排期。' : '已废弃该内容。')
      onClose()
      onSuccess()
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAiCopywrite = async () => {
    setSaving(true)
    setError(null)
    try {
      const targetAccountIds = [...selectedAccountIds]
      // XHS is always in the default selection; respect user's choice here
      // Save draft first to commit latest edits to contentIdea/attachedMedia
      const saved = await saveDraft(selectedDraft?.status || 'draft', '【AI 正在创作中...】', targetAccountIds)
      if (saved && saved.length > 0) {
        // Remap: after backend resolves unconfigured_* IDs, use real accountIds from saved drafts
        const newSelectedIds = saved.map(d => d.accountId || '').filter(Boolean)

        // Key captions/statuses by copywriter.id (not accountId) — preview is copywriter-driven
        const newCaptions: Record<string, string> = {}
        const newHashtags: Record<string, string> = {}
        const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}
        const newDraftCopywriterMap: Record<string, string> = {}

        saved.forEach((d: any) => {
          // Map draft back to a copywriter by matching account.platformId to COPYWRITER_ROSTER
          const platformId = (d.account?.platformId || '').toLowerCase()
          const cw = COPYWRITER_ROSTER.find(c =>
            platformAliases(c.platform).includes(platformId) || c.platform === platformId
          )
          const cwKey = cw?.id || d.accountId || ''
          newCaptions[cwKey] = '【AI 正在创作中...】'
          newHashtags[cwKey] = ''
          newStatuses[cwKey] = 'generating'
          if (d.id) newDraftCopywriterMap[d.id] = cwKey
        })

        setCreatedDrafts(saved)
        setSelectedAccountIds(newSelectedIds)
        setDraftCaptions(newCaptions)
        setDraftHashtags(newHashtags)
        setDraftStatuses(newStatuses)
        setDraftCopywriterMap(newDraftCopywriterMap)
        setIsAiGenerating(true)
        setPreviewOnly(false)
        setPreviewModalOpen(true)

        // Trigger AI copywriting in parallel
        await Promise.all(
          saved.map(draft =>
            fetch(`/api/brands/${brandId}/drafts/${draft.id}/trigger-copywriter`, { method: 'POST' })
          )
        )
      }
    } catch (e: any) {
      alert(e.message || 'AI 创作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSingleAiCopywrite = async (cwId: string) => {
    const draftEntry = Object.entries(draftCopywriterMap).find(([, v]) => v === cwId)
    if (!draftEntry) {
      alert('未找到该 Copywriter 对应的草稿')
      return
    }
    const draftId = draftEntry[0]

    setDraftStatuses(prev => ({ ...prev, [cwId]: 'generating' }))
    setDraftCaptions(prev => ({ ...prev, [cwId]: '【AI 正在创作中...】' }))
    setDraftHashtags(prev => ({ ...prev, [cwId]: '' }))
    setDraftWarnings(prev => {
      const n = { ...prev }
      delete n[cwId]
      return n
    })

    setIsAiGenerating(true)

    try {
      const res = await fetch(`/api/brands/${brandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '触发 AI 创作失败')
      }
    } catch (e: any) {
      alert(e.message || 'AI 创作失败')
      setDraftStatuses(prev => ({ ...prev, [cwId]: 'failed' }))
    }
  }

  const handleSaveDraftsFromModal = async () => {
    if (!createdDrafts) return
    setSaving(true)
    try {
      await Promise.all(
        createdDrafts.map(async (d) => {
          const cwKey = draftCopywriterMap[d.id] || d.accountId || ''
          const cap = draftCaptions[cwKey] || ''
          const hash = draftHashtags[cwKey] || ''
          await fetch(`/api/brands/${brandId}/drafts/${d.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: cap,
              hashtags: parseTags(hash),
              status: 'draft'
            })
          })
        })
      )
      setPreviewModalOpen(false)
      setCreatedDrafts(null)
      onClose()
      onSuccess()
      alert('草稿已成功保存')
    } catch (e: any) {
      alert(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleScheduleFromModal = async (customTime?: string) => {
    if (!createdDrafts) return
    setSaving(true)
    try {
      let targetDateISO: string
      const parsedTime = scheduledAt ? fromDateTimeLocal(scheduledAt) : null
      const isFutureTime = parsedTime && new Date(parsedTime).getTime() > Date.now()

      if (customTime) {
        targetDateISO = new Date(customTime).toISOString()
      } else if (isFutureTime && parsedTime) {
        targetDateISO = parsedTime
      } else {
        const schedRes = await fetch(`/api/brands/${brandId}/scheduling/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: null, numberOfPosts: 1, urgency: 'normal' }),
        })
        if (schedRes.ok) {
          const schedData = await schedRes.json()
          targetDateISO = schedData.recommendations?.[0]?.recommendedAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        } else {
          targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        }
      }

      await Promise.all(
        createdDrafts.map(async (d) => {
          const cwKey = draftCopywriterMap[d.id] || d.accountId || ''
          const cap = draftCaptions[cwKey] || ''
          const hash = draftHashtags[cwKey] || ''
          
          await fetch(`/api/brands/${brandId}/drafts/${d.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: cap,
              hashtags: parseTags(hash),
              scheduledAt: targetDateISO
            })
          })

          await fetch(`/api/brands/${brandId}/drafts/${d.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
        })
      )

      setPreviewModalOpen(false)
      setCreatedDrafts(null)
      onClose()
      onSuccess()
      alert('已成功设定时间并提交审核排期！')
    } catch (e: any) {
      alert(e.message || '排期失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSmartScheduleDirect = async () => {
    if (!selectedDraft) return
    setSaving(true)
    setError(null)
    try {
      let targetDateISO: string
      const parsedTime = scheduledAt ? fromDateTimeLocal(scheduledAt) : null
      const isFutureTime = parsedTime && new Date(parsedTime).getTime() > Date.now()

      if (isFutureTime && parsedTime) {
        targetDateISO = parsedTime
      } else {
        const schedRes = await fetch(`/api/brands/${brandId}/scheduling/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: null, numberOfPosts: 1, urgency: 'normal' }),
        })
        if (schedRes.ok) {
          const schedData = await schedRes.json()
          targetDateISO = schedData.recommendations?.[0]?.recommendedAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        } else {
          targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        }
      }

      // Update scheduledAt
      const patchRes = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          hashtags: parseTags(hashtags),
          scheduledAt: targetDateISO,
          assetIds: selectedAssetIds,
          mediaUrls: attachedMedia.filter(m => m.type === 'url').map(m => m.url),
        })
      })
      if (!patchRes.ok) throw new Error('更新排期失败')

      // Submit/approve direct
      const submitRes = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '智能排期发布' }),
      })
      if (!submitRes.ok) {
        const errData = await submitRes.json().catch(() => ({}))
        const errMsg = errData?.error || `排期通道提交失败 (${submitRes.status})`
        throw new Error(errMsg)
      }

      alert(`已成功排期发布！排期时间：${new Date(targetDateISO).toLocaleString()}`)
      onClose()
      onSuccess()
    } catch (e: any) {
      alert(e.message || '智能排期失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePublishNow = async () => {
    if (!selectedDraft) return
    if (!confirm('确定要立即发布此帖文吗？')) return
    setSaving(true)
    setError(null)
    try {
      // Save current edits first
      const patchRes = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          hashtags: parseTags(hashtags),
          assetIds: selectedAssetIds,
          mediaUrls: attachedMedia.filter(m => m.type === 'url').map(m => m.url),
        })
      })
      if (!patchRes.ok) throw new Error('更新内容失败')

      const res = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '立即发布', publishType: 'immediate' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '发布失败')
      }
      alert('已成功发送立即发布指令！')
      onClose()
      onSuccess()
    } catch (err: any) {
      alert(err.message || '发布失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReschedule = async () => {
    if (!selectedDraft) return
    setSaving(true)
    setError(null)
    try {
      const patchRes = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          hashtags: parseTags(hashtags),
          scheduledAt: fromDateTimeLocal(scheduledAt),
          assetIds: selectedAssetIds,
          mediaUrls: attachedMedia.filter(m => m.type === 'url').map(m => m.url),
        })
      })
      if (!patchRes.ok) throw new Error('更新内容失败')

      const res = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}/submit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '重新排期发布' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '重新排期失败')
      }
      alert('已重新计算并成功提交排期！')
      onClose()
      onSuccess()
    } catch (err: any) {
      alert(err.message || '重新排期失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!selectedDraft) return
    setSaving(true)
    setError(null)
    try {
      // Save current edits first
      const patchRes = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          hashtags: parseTags(hashtags),
          scheduledAt: fromDateTimeLocal(scheduledAt),
          assetIds: selectedAssetIds,
          mediaUrls: attachedMedia.filter(m => m.type === 'url').map(m => m.url),
        })
      })
      if (!patchRes.ok) throw new Error('保存内容失败')

      const res = await fetch(`/api/brands/${brandId}/drafts/${selectedDraft.id}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reviewNote || agentNote || (action === 'approve' ? 'Approved' : '') }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '操作失败')
      }
      alert(action === 'approve' ? '审核批准成功！' : '内容已被驳回。')
      onClose()
      onSuccess()
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  // Hook generation handler
  const triggerGenerateHooks = async () => {
    setIsGeneratingHooks(true)
    const isVid = attachedMedia.some(m => isVideoUrl(m.url))
    const topic = hookTopic || contentIdea || '我们的特色服务'
    try {
      const response = await fetch('/api/copywriter/generate-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          contentType: isVid ? 'video' : 'photo',
          contentIdea,
          hookStyle,
          businessType: hookBusinessType,
        })
      })
      if (response.ok) {
        const json = await response.json()
        if (json.success && Array.isArray(json.hooks) && json.hooks.length > 0) {
          setGeneratedHooks(json.hooks.slice(0, 3))
          setIsGeneratingHooks(false)
          return
        }
      }
      
      // Browser-direct Gemini fallback
      const systemPrompt = `You are an expert copywriter. Generate 3 highly engaging, high-conversion opening hook options for a social media post.
Style framework: ${hookStyle}
Industry: ${hookBusinessType}
Media type: ${isVid ? 'video' : 'photo'}

Return the output strictly in a valid JSON array format, containing:
- "visual": Visual design instructions for the creator (in Chinese, max 15 words).
- "overlay": The bold text overlay to print on the video/image (in Chinese, max 7 words).
- "audio": The opening caption line that hooks the audience (in Chinese, max 30 words, 1 short sentence).`
      const promptMsg = `Content idea / Materials description: ${contentIdea || topic}`
      const res = await callGeminiDirect(systemPrompt, [], promptMsg, false, 800)
      if (res.direct && res.reply) {
        let cleanText = res.reply.replace(/```json/gi, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleanText)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setGeneratedHooks(parsed.slice(0, 3))
          setIsGeneratingHooks(false)
          return
        }
      }
      
      alert('AI 钩子生成失败，已尝试直接调用但不可达')
    } catch (directErr) {
      console.error(directErr)
      alert('AI 钩子生成失败')
    } finally {
      setIsGeneratingHooks(false)
    }
  }

  // Media Operations handlers
  const handleMediaAIDesign = async (index: number, assetId: string, actionType: 'design' | 'video') => {
    if (!mediaOpPrompt.trim()) {
      alert('请输入操作提示词')
      return
    }
    
    setMediaProcessingIndex(index)
    try {
      const res = await fetch(`/api/brands/${brandId}/assets/${assetId}/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: mediaOpPrompt, action: actionType })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI 操作失败')

      const newAsset = data.asset
      setAttachedMedia(prev => {
        const next = [...prev]
        next[index] = { id: newAsset.id, type: 'asset', url: newAsset.url }
        return next
      })

      alert(actionType === 'video' ? 'AI 视频生成成功！已更新视频。' : 'AI 优化成功！已更新图片。')
      setActiveMediaOp(null)
      setMediaOpPrompt('')
      // Reload assets list
      const assetsRes = await fetch(`/api/brands/${brandId}/assets`)
      if (assetsRes.ok) {
        const json = await assetsRes.json()
        setBrandAssets(json.assets || [])
      }
    } catch (err: any) {
      alert(err.message || '操作失败')
    } finally {
      setMediaProcessingIndex(null)
    }
  }

  const handleAddUrl = () => {
    if (!newUrlInput.trim()) return
    const url = newUrlInput.trim()
    setAttachedMedia(prev => [...prev, { id: url, type: 'url', url }])
    setNewUrlInput('')
  }

  const handleRemoveMedia = (index: number) => {
    setAttachedMedia(prev => prev.filter((_, i) => i !== index))
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setAttachedMedia(prev => {
      const next = [...prev]
      const [draggedItem] = next.splice(draggedIndex, 1)
      next.splice(index, 0, draggedItem)
      return next
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleToggleAsset = (asset: any) => {
    const isSelected = attachedMedia.some(m => m.id === asset.id)
    if (isSelected) {
      setAttachedMedia(prev => prev.filter(m => m.id !== asset.id))
    } else {
      setAttachedMedia(prev => [...prev, { id: asset.id, type: 'asset', url: asset.url }])
    }
  }

  // Comments manual replies
  const handleSendManualReply = (commentId: string) => {
    const text = commentReplyText[commentId]?.trim()
    if (!text) return
    setCommentsList(prev => prev.map(c => c.id === commentId ? { ...c, reply: text } : c))
    setCommentReplyText(prev => ({ ...prev, [commentId]: '' }))
  }

  const handleGenerateAiReply = (commentId: string, commentContent: string) => {
    setCommentsList(prev => prev.map(c => c.id === commentId ? { ...c, isGeneratingReply: true } : c))
    setTimeout(() => {
      let aiResponse = '感谢您的反馈！我们会继续努力提供更好的服务。❤️'
      if (commentContent.includes('地址') || commentContent.includes('在哪里')) {
        aiResponse = '我们店在新加坡乌节路321号，欢迎您随时来店打卡体验！🏬'
      } else if (commentContent.includes('素食') || commentContent.includes('vegan')) {
        aiResponse = 'Yes, we do have delicious vegan and dairy-free options available! Please ask our staff when you arrive. 🌱'
      }
      setCommentsList(prev => prev.map(c => c.id === commentId ? { ...c, reply: aiResponse, isAiReply: true, isGeneratingReply: false } : c))
    }, 1000)
  }

  if (!isOpen) return null

  const isPublished = selectedDraft?.status === 'published' || selectedDraft?.status === 'done'
  const isScheduled = selectedDraft?.status === 'scheduled'
  const isPendingReview = selectedDraft?.status === 'pending_review'
  const isDraftOrFailed = !selectedDraft || ['draft', 'failed'].includes(selectedDraft.status)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in slide-in-from-right duration-250"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 shrink-0">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-400 flex items-center gap-2">
              <span>{selectedDraft ? STATUS_LABELS[selectedDraft.status] || selectedDraft.status : '草稿'}</span>
              {isPublished && selectedDraft.postUrl && (
                <a
                  href={selectedDraft.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-650 hover:text-indigo-750 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300 font-bold"
                >
                  🔗 查看文章
                </a>
              )}
            </p>
            <h3 className="text-lg font-black text-slate-955 dark:text-white">
              {selectedDraft ? (isPublished ? '查看已发布文章' : isScheduled ? '编辑已排期文章' : isPendingReview ? '审核文章' : '编辑草稿') : '新建发布草稿'}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex h-72 items-center justify-center text-sm font-bold text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mr-2" /> 加载中...
            </div>
          ) : (
            <>
              {/* Theme / Material Description — simple text field, AI auto-generates hooks */}
              {!isPublished && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">今日主题 / 素材说明</label>
                    <textarea
                      value={contentIdea}
                      onChange={(event) => setContentIdea(event.target.value)}
                      placeholder="描述今日主题或素材创意，AI 将自动提炼 Hook 并创作各平台文案。留空时 AI 将根据已选素材自动构思。"
                      className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      创意开场白 / Hooks
                      <span className="ml-1.5 normal-case font-normal text-slate-400 dark:text-slate-600">（选填，留空由 AI 自动生成）</span>
                    </label>
                    <input
                      type="text"
                      value={creativeHooks}
                      onChange={e => setCreativeHooks(e.target.value)}
                      placeholder="例：没想到这家餐厅环境如此好！ / You won't believe this place exists..."
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}


              {/* Caption and Hashtags */}
              {(selectedDraft || isPublished) && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">发布正文 (Caption)</label>
                    <textarea
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder="输入草稿正文..."
                      disabled={isPublished}
                      className="min-h-[160px] w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-550 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">发布标签 (Hashtags)</label>
                    <input
                      value={hashtags}
                      onChange={(event) => setHashtags(event.target.value)}
                      placeholder="标签，用逗号分隔，例如 lunch, promo, weekend"
                      disabled={isPublished}
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-550 disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              )}

              {/* Copywriter — full width row */}
              <div className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Copywriter <span className="text-red-500">*</span></p>
                {/* Avatar row — one circle per platform, no wrap */}
                <div className="flex items-end gap-4">
                  {COPYWRITER_ROSTER.map((copywriter) => {
                    const configuredAccount = accounts.find(a =>
                      platformAliases(copywriter.platform).includes((a.platformId || '').toLowerCase())
                    )
                    const effectiveId = draftAccountIdForCopywriter(copywriter, accounts)
                    const isConfigured = !!configuredAccount
                    const isSelected = selectedAccountIds.includes(effectiveId)
                    const title = isConfigured
                      ? (configuredAccount?.displayName || configuredAccount?.handle || copywriter.handle)
                      : `${copywriter.handle}（未配置发布账号，仍可先创作内容）`

                    // Platform logo SVGs — fills the circle container
                    const platformLogo: Record<string, React.ReactNode> = {
                      instagram: (
                        <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
                          <defs>
                            <linearGradient id="ig-g" x1="0%" y1="100%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#f09433"/>
                              <stop offset="25%" stopColor="#e6683c"/>
                              <stop offset="50%" stopColor="#dc2743"/>
                              <stop offset="75%" stopColor="#cc2366"/>
                              <stop offset="100%" stopColor="#bc1888"/>
                            </linearGradient>
                          </defs>
                          <rect width="32" height="32" rx="0" fill="url(#ig-g)"/>
                          <circle cx="16" cy="16" r="5.5" stroke="white" strokeWidth="2.2" fill="none"/>
                          <circle cx="22.5" cy="9.5" r="1.5" fill="white"/>
                        </svg>
                      ),
                      tiktok: (
                        <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
                          <rect width="32" height="32" rx="0" fill="#010101"/>
                          <path d="M22 11.2a4.8 4.8 0 01-4.8-4.8v-.4h-2.8V18a2 2 0 11-2-2v-2.8A4.8 4.8 0 009.6 18a4.8 4.8 0 109.6 0V12.6A8.6 8.6 0 0022 13V11.2z" fill="white"/>
                          <path d="M22 10a4.8 4.8 0 01-4.8-4.8" stroke="#69C9D0" strokeWidth="2" strokeLinecap="round" fill="none"/>
                        </svg>
                      ),
                      facebook: (
                        <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
                          <rect width="32" height="32" rx="0" fill="#1877F2"/>
                          <path d="M18 11.5h2.5V8H18c-2.2 0-4 1.8-4 4v2H12V17h2v10h3V17h2.5l.5-3H17v-2c0-.28.22-.5.5-.5l.5 0z" fill="white"/>
                        </svg>
                      ),
                      google_business: (
                        <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
                          <rect width="32" height="32" rx="0" fill="white"/>
                          <path d="M16 7c2.35 0 4.43.88 6 2.32L24.4 7C22.24 5.1 19.27 4 16 4 10.8 4 6.4 7.12 4.5 11.5l3.4 2.66A8 8 0 0116 7z" fill="#EA4335"/>
                          <path d="M28 16.5c0-1.12-.1-2.2-.3-3.22H16v6h6.72a5.76 5.76 0 01-2.5 3.76l4.12 3.2C26.4 24.12 28 20.6 28 16.5z" fill="#4285F4"/>
                          <path d="M7.9 19.16A8 8 0 0116 25c2.86 0 5.42-1.04 7.34-2.76l-4.12-3.2a5 5 0 01-7.44-1.84l-3.88 2.96z" fill="#34A853"/>
                          <path d="M4.5 11.5l3.4 2.66A8 8 0 006 16c0 .72.08 1.42.2 2.1L2.6 21a13.5 13.5 0 01-.6-5A13.5 13.5 0 014.5 11.5z" fill="#FBBC04"/>
                        </svg>
                      ),
                      xiaohongshu: (
                        <svg viewBox="0 0 32 32" className="w-full h-full" fill="none">
                          <rect width="32" height="32" rx="0" fill="#FF2442"/>
                          <text x="16" y="21" textAnchor="middle" fontSize="15" fontWeight="900" fill="white" fontFamily="sans-serif">小</text>
                        </svg>
                      ),
                    }

                    return (
                      <button
                        key={copywriter.id}
                        type="button"
                        disabled={isPublished}
                        title={title}
                        onClick={() => {
                          setSelectedAccountIds(prev =>
                            prev.includes(effectiveId)
                              ? prev.filter(id => id !== effectiveId)
                              : [...prev, effectiveId]
                          )
                        }}
                        className="relative flex flex-col items-center gap-1.5 group disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none"
                      >
                        {/* Avatar circle */}
                        <div className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 ${
                          isSelected
                            ? 'ring-[3px] ring-offset-2 ring-indigo-500 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40 scale-105'
                            : 'ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-2 hover:ring-indigo-300 hover:scale-105'
                        } bg-white dark:bg-slate-800 overflow-hidden`}>
                          {platformLogo[copywriter.platform] ?? (
                            <span className="text-base font-black text-slate-500">{copywriter.name[0]}</span>
                          )}
                          {/* Unconfigured amber dot badge */}
                          {!isConfigured && (
                            <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white dark:border-slate-950" title="未配置账号" />
                          )}
                        </div>
                        {/* Name label */}
                        <span className={`text-[11px] font-bold leading-none transition-colors ${
                          isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                        }`}>
                          {copywriter.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Scheduled At — full width row below */}
              <div className="flex flex-col space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">指定排期时间</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  disabled={isPublished}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-850 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-955 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-550 disabled:cursor-not-allowed"
                />
              </div>

              {/* Collaboration Note */}
              {selectedDraft && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">协作备注 / 修改说明</label>
                  <textarea
                    value={agentNote}
                    onChange={(event) => setAgentNote(event.target.value)}
                    placeholder="协作备注 / 修改说明"
                    disabled={isPublished}
                    className="min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-550 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {/* Media Section */}
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">媒体与素材</h4>
                  <div className="flex items-center gap-2">
                    {attachedMedia.length > 0 && !isPublished && (
                      <button
                        type="button"
                        onClick={() => setAttachedMedia([])}
                        className="text-xs font-semibold text-rose-650 dark:text-rose-455 hover:underline cursor-pointer"
                      >
                        清空选择
                      </button>
                    )}
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      已选: {attachedMedia.length}
                    </span>
                  </div>
                </div>

                {attachedMedia.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400">
                      {isPublished ? '媒体内容' : '拖拽调整媒体排序'}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {attachedMedia.map((item, index) => {
                        const isVid = isVideoUrl(item.url)
                        return (
                          <div
                            key={`${item.type}-${item.id}-${index}`}
                            draggable={!isPublished}
                            onDragStart={(e) => !isPublished && handleDragStart(e, index)}
                            onDragOver={(e) => !isPublished && handleDragOver(e, index)}
                            onDragEnd={!isPublished ? handleDragEnd : undefined}
                            className={`relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900 group shadow-sm transition-shadow ${
                              isPublished
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
                            {!isPublished && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMedia(index)}
                                className="absolute top-1 right-1 rounded-full bg-red-500 hover:bg-red-650 p-1 text-white opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
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
                            {!isPublished && item.type === 'asset' && !isVid && (
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
                                AI 图案设计优化 (第 {activeMediaOp.index + 1} 张图)
                              </>
                            )}
                          </span>
                          <button onClick={() => setActiveMediaOp(null)} className="text-slate-400 hover:text-slate-655">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={mediaOpPrompt}
                          onChange={(e) => setMediaOpPrompt(e.target.value)}
                          placeholder={activeMediaOp.action === 'video' ? '输入运动形式，如：慢动作平移、水流波动、烟雾飘动' : '输入优化指示，如：转换为新潮插画风格、调整色调、添加南洋风味元素'}
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveMediaOp(null)}
                            className="px-3 py-1.5 border border-slate-200 rounded text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMediaAIDesign(activeMediaOp.index, attachedMedia[activeMediaOp.index].id, activeMediaOp.action)}
                            className="px-3.5 py-1.5 bg-indigo-600 text-white rounded text-[10px] font-black hover:bg-indigo-755"
                          >
                            立即生成
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Media add link and library browse */}
                {!isPublished && (
                  <div className="space-y-3 pt-3 border-t border-slate-200/50 dark:border-slate-800">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newUrlInput}
                        onChange={(e) => setNewUrlInput(e.target.value)}
                        placeholder="输入外链媒体 URL..."
                        className="flex-1 h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-955 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleAddUrl}
                        className="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-705 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 font-bold text-xs rounded-md flex items-center justify-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>添加外链</span>
                      </button>
                    </div>

                    {/* Browse assets */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">从品牌素材库挑选：</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAssetTypeFilter('unused')}
                            className={`text-[9px] px-2 py-0.5 rounded font-black ${
                              assetTypeFilter === 'unused' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-955/40' : 'text-slate-400'
                            }`}
                          >
                            未使用
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssetTypeFilter('all')}
                            className={`text-[9px] px-2 py-0.5 rounded font-black ${
                              assetTypeFilter === 'all' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-955/40' : 'text-slate-400'
                            }`}
                          >
                            全部素材
                          </button>
                        </div>
                      </div>

                      {filteredAssets.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic text-center py-2">素材库暂空或全部被占用</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {filteredAssets.slice(0, assetPageSize).map((asset) => {
                            const isSelected = attachedMedia.some(m => m.id === asset.id)
                            const isVid = asset.mimeType?.startsWith('video/')
                            return (
                              <div
                                key={asset.id}
                                onClick={() => handleToggleAsset(asset)}
                                className={`relative aspect-square rounded-md overflow-hidden bg-slate-55 border cursor-pointer group shadow-sm transition-all hover:scale-[1.02] ${
                                  isSelected ? 'border-emerald-500 ring-2 ring-emerald-105 dark:ring-emerald-950' : 'border-slate-200 dark:border-slate-800'
                                }`}
                              >
                                {isVid ? (
                                  <video src={asset.url} preload="metadata" className="h-full w-full object-cover pointer-events-none" muted />
                                ) : (
                                  <img src={asset.url} className="h-full w-full object-cover pointer-events-none" alt="" />
                                )}
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20" />
                                {isSelected && (
                                  <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
                                    <span className="bg-emerald-500 text-white rounded-full p-0.5">
                                      <Check className="h-3 w-3 stroke-[3px]" />
                                    </span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Review inputs (Pending Review State only) */}
              {isPendingReview && (
                <div className="space-y-3">
                  <textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="审批意见，驳回时必填..."
                    className="min-h-[80px] w-full rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-slate-800 outline-none focus:border-amber-400 dark:border-amber-900/60 dark:bg-amber-955/20 dark:text-slate-100"
                  />
                  {selectedDraft?.rejectionNote && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-955/40 dark:text-rose-300">
                      历史驳回意见：{selectedDraft.rejectionNote}
                    </div>
                  )}
                </div>
              )}

              {/* Temporal status (Scheduled State only) */}
              {isScheduled && (
                <div className="p-4 bg-indigo-500/5 dark:bg-indigo-950/10 border border-indigo-500/15 rounded-2xl">
                  <h4 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Temporal 托管与重试调度</span>
                  </h4>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-350">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span>服务托管中 · 重试事务就绪</span>
                  </div>
                  <p className="text-[10px] text-slate-450 dark:text-slate-500 mt-1.5">
                    该排期已受指数退避及重调度机制保护，若因网络抖动推送失败，Temporal 调度器将自动重试。
                  </p>
                </div>
              )}

              {/* Comments and Clicks tracking (Published state only) */}
              {isPublished && (
                <div className="space-y-4">
                  {/* Clicks and ROI */}
                  <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/15 rounded-2xl">
                    <h4 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 fill-emerald-500/15" />
                      <span>引流分析 & Click 追踪</span>
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-700/40 p-2.5 rounded-xl shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">点击量</p>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-105 mt-0.5">{clicksCount} 次</p>
                      </div>
                      <div className="bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-700/40 p-2.5 rounded-xl shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">引流到店 ROI</p>
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">${roiAmount}</p>
                      </div>
                    </div>
                  </div>

                  {/* Comments list */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-850 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                        <span>帖文评论与回复</span>
                      </h4>
                      <span className="text-[9px] font-black text-indigo-655 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded-full">
                        {commentsList.length} 条评论
                      </span>
                    </div>
                    
                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1 no-scrollbar">
                      {commentsList.length > 0 ? (
                        commentsList.map(comment => (
                          <div key={comment.id} className="space-y-2 border-b border-slate-100/50 dark:border-slate-800/40 pb-3 last:border-0 last:pb-0">
                            <div className="flex items-start gap-2">
                              <img src={comment.avatar} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-705 dark:text-slate-350">{comment.author}</span>
                                  <span className="text-[9px] text-slate-450">{comment.time}</span>
                                </div>
                                <p className="text-xs text-slate-605 dark:text-slate-400 mt-0.5 leading-relaxed">{comment.content}</p>
                              </div>
                            </div>

                            {comment.reply ? (
                              <div className="ml-9 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-black text-indigo-655 dark:text-indigo-400">主理人回复</span>
                                  {comment.isAiReply && (
                                    <span className="text-[8px] font-bold text-slate-400 bg-slate-200/50 dark:bg-slate-800 px-1 rounded flex items-center gap-0.5">
                                      <Sparkles className="w-2 h-2 text-indigo-500" />
                                      AI 自动回复
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-750 dark:text-slate-200 font-medium leading-relaxed">{comment.reply}</p>
                              </div>
                            ) : (
                              <div className="ml-9 space-y-2">
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={commentReplyText[comment.id] || ''}
                                    onChange={(e) => setCommentReplyText(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                    placeholder="输入人工回复内容..."
                                    className="flex-1 h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-855 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-150"
                                  />
                                  <button
                                    onClick={() => handleSendManualReply(comment.id)}
                                    className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm shrink-0 transition-colors"
                                  >
                                    回复
                                  </button>
                                  <button
                                    onClick={() => handleGenerateAiReply(comment.id, comment.content)}
                                    disabled={comment.isGeneratingReply}
                                    className="h-8 px-2 border border-slate-200 dark:border-slate-700 text-indigo-655 dark:text-indigo-400 font-bold text-xs rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 flex items-center justify-center gap-1 transition-all"
                                  >
                                    <Sparkles className={`w-3.5 h-3.5 ${comment.isGeneratingReply ? 'animate-spin' : ''}`} />
                                    <span>AI</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="py-6 text-center text-slate-400 dark:text-slate-550 text-xs italic">暂无评论记录</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800 w-full shrink-0 bg-white dark:bg-slate-900">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              const newCaptions: Record<string, string> = {}
              const newHashtags: Record<string, string> = {}
              const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}
              // Key by copywriter.id — derive selected copywriters from selectedAccountIds
              COPYWRITER_ROSTER
                .filter(c => selectedAccountIds.includes(draftAccountIdForCopywriter(c, accounts)))
                .forEach(c => {
                  newCaptions[c.id] = caption
                  newHashtags[c.id] = hashtags
                  newStatuses[c.id] = 'completed'
                })
              setDraftCaptions(newCaptions)
              setDraftHashtags(newHashtags)
              setDraftStatuses(newStatuses)
              setPreviewOnly(true)
              setPreviewModalOpen(true)
            }}
            className={`rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 flex items-center gap-2 ${(!selectedDraft || isPublished) ? 'mr-auto' : ''}`}
          >
            <Eye className="h-4 w-4" /> 预览效果
          </button>

          {/* DISCARD button: visible for any editable/non-published states */}
          {selectedDraft && !isPublished && (
            <button
              type="button"
              disabled={saving}
              onClick={handleDiscard}
              className="rounded-md border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30 flex items-center gap-1.5 mr-auto"
            >
              <Trash2 className="h-4 w-4" /> {isScheduled ? '取消排期' : '废弃'}
            </button>
          )}

          {/* DYNAMIC ACTIONS BY STATUS */}
          {isPublished ? (
            selectedDraft?.postUrl ? (
              <a
                href={selectedDraft.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white transition-colors"
              >
                打开已发布文章
              </a>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 rounded-md bg-slate-300 dark:bg-slate-700 px-4 py-2 text-sm font-bold text-slate-550 dark:text-slate-400 cursor-not-allowed"
              >
                打开已发布文章 (暂无链接)
              </button>
            )
          ) : isDraftOrFailed ? (
            <>
              <button
                type="button"
                disabled={saving || (!caption.trim() && !contentIdea.trim() && attachedMedia.length === 0) || selectedAccountIds.length === 0 || isAiGenerating}
                onClick={handleAiCopywrite}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                ✨ AI 创作
              </button>
              <button
                disabled={saving || (!caption.trim() && !contentIdea.trim() && attachedMedia.length === 0) || selectedAccountIds.length === 0}
                onClick={async () => {
                  const saved = await saveDraft('draft')
                  if (saved) {
                    onClose()
                    onSuccess()
                  }
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                保存
              </button>
              {selectedDraft && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSmartScheduleDirect}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" /> 智能排期
                </button>
              )}
            </>
          ) : isPendingReview ? (
            <>
              <button
                type="button"
                disabled={saving || isAiGenerating}
                onClick={handleAiCopywrite}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                ✨ AI 重新创作
              </button>
              <button
                disabled={saving}
                onClick={async () => {
                  const saved = await saveDraft('pending_review')
                  if (saved) {
                    onClose()
                    onSuccess()
                    alert('内容修改已保存')
                  }
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                保存
              </button>
              <button
                disabled={saving || !reviewNote.trim()}
                onClick={() => handleReview('reject')}
                className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" /> 驳回
              </button>
              <button
                disabled={saving}
                onClick={() => handleReview('approve')}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> 批准
              </button>
            </>
          ) : isScheduled ? (
            <>
              <button
                disabled={saving}
                onClick={async () => {
                  const saved = await saveDraft('scheduled')
                  if (saved) {
                    onClose()
                    onSuccess()
                    alert('排期内容已更新')
                  }
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                保存修改
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handlePublishNow}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-755 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" /> 立即发布
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleReschedule}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5" /> 重新智能排期
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Platform Preview Mockups Dialog */}
      <PostPreviewModal
        isOpen={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false)
          setCreatedDrafts(null)
          setIsAiGenerating(false)
        }}
        brandName={brandName}
        selectedCopywriters={COPYWRITER_ROSTER.filter(c => selectedAccountIds.includes(draftAccountIdForCopywriter(c, accounts)) || Object.keys(draftCaptions).includes(c.id))}
        draftCaptions={draftCaptions}
        setDraftCaptions={setDraftCaptions}
        draftHashtags={draftHashtags}
        setDraftHashtags={setDraftHashtags}
        draftStatuses={draftStatuses}
        draftWarnings={draftWarnings}
        isAiGenerating={isAiGenerating}
        saving={saving}
        attachedMedia={attachedMedia}
        onCancel={() => {
          setPreviewModalOpen(false)
          setCreatedDrafts(null)
          setIsAiGenerating(false)
        }}
        onSaveDraft={handleSaveDraftsFromModal}
        onSchedule={handleScheduleFromModal}
        onRegenerate={handleAiCopywrite}
        onRegenerateSingleCopywriter={handleSingleAiCopywrite}
        onCancelCopywriter={async (cwId) => {
          // Find the draft associated with this copywriter
          const draftEntry = Object.entries(draftCopywriterMap).find(([, v]) => v === cwId)
          if (draftEntry) {
            const draftId = draftEntry[0]
            // Delete the draft in the background
            fetch(`/api/brands/${brandId}/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {})
            // Remove from createdDrafts
            setCreatedDrafts(prev => prev ? prev.filter(d => d.id !== draftId) : null)
            setDraftCopywriterMap(prev => { const n = { ...prev }; delete n[draftId]; return n })
          }
          // Remove the copywriter's account from selectedAccountIds
          setSelectedAccountIds(prev => {
            const cw = COPYWRITER_ROSTER.find(c => c.id === cwId)
            if (!cw) return prev
            const effectiveId = draftAccountIdForCopywriter(cw, accounts)
            return prev.filter(id => id !== effectiveId)
          })
          // Clean up caption/status state for this copywriter
          setDraftCaptions(prev => { const n = { ...prev }; delete n[cwId]; return n })
          setDraftHashtags(prev => { const n = { ...prev }; delete n[cwId]; return n })
          setDraftStatuses(prev => { const n = { ...prev }; delete n[cwId]; return n })
        }}
        previewOnly={previewOnly}
      />
    </div>
  )
}
