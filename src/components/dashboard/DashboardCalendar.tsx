'use client'
import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  ThumbsUp,
  Star,
  Globe,
  Store,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Video,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Shield,
  Copy,
  Plus,
  Compass,
  ArrowRight,
  RefreshCw,
  Send,
  Zap,
  Eye,
  MoreVertical,
  Wand2,
  Loader2,
  Play,
  X,
  ChevronDown,
  Check,
  Maximize2,
  ExternalLink,
  Save
} from 'lucide-react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// Platform pill colors
const PLATFORM_COLORS: Record<string, string> = {
  'IG': 'bg-pink-100 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800/50',
  '小红书': 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50',
  'TikTok': 'bg-slate-900 text-white border-slate-700',
  'Google': 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
  'Facebook': 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
  'Email': 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/50',
  '任务': 'bg-violet-100 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/50',
  '全平台': 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
}

function normalizePlatformLabel(platform: string) {
  const key = platform.trim().toLowerCase()
  const aliasMap: Record<string, string> = {
    instagram: 'IG',
    ig: 'IG',
    xiaohongshu: '小红书',
    rednote: '小红书',
    red: '小红书',
    xhs: '小红书',
    tiktok: 'TikTok',
    google: 'Google',
    google_business: 'Google',
    google_maps: 'Google',
    facebook: 'Facebook',
    fb: 'Facebook',
    email: 'Email',
    newsletter: 'Email',
    task: '任务',
    任务: '任务',
    all: '全平台',
    '全平台': '全平台',
  }

  return aliasMap[key] ?? platform
}

function parseTags(value: string) {
  return value
    .split(/[#,，,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
}

function isVideoUrl(url: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:\?.*)?$/i.test(path)
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

const STATUS_COLORS: Record<string, string> = {
  'done': 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/20',
  'pending': 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/20',
  'scheduled': 'bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/20',
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

interface GroupedEvent {
  id: string
  brandName: string
  platform: string
  title: string
  cleanTitle: string
  status: 'done' | 'pending' | 'scheduled'
  time: string
  scheduledAt: string
  mediaUrls?: string[]
  clicks?: number
  roi?: number
  platformPostId?: string | null
  events: CalendarEvent[]
}

function getCleanTitle(title: string, platform: string): string {
  const normPlatform = normalizePlatformLabel(platform)
  const escapedPlatform = normPlatform.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const pattern = new RegExp(`^(\\[?${escapedPlatform}\\]?\\s*·?\\s*|${escapedPlatform}\\s*[:：·]?\\s*|${platform}\\s*[:：·]?\\s*)`, 'i')
  return title.replace(pattern, '').trim()
}

function groupEventsByTitle(events: CalendarEvent[]): GroupedEvent[] {
  const groups: Record<string, GroupedEvent> = {}
  events.forEach(ev => {
    const cleanTitle = getCleanTitle(ev.title, ev.platform)
    const key = `${ev.brandName}|${cleanTitle}`
    if (!groups[key]) {
      groups[key] = {
        id: ev.id,
        brandName: ev.brandName,
        platform: ev.platform,
        title: ev.title,
        cleanTitle: cleanTitle,
        status: ev.status,
        time: ev.time,
        scheduledAt: ev.scheduledAt,
        mediaUrls: ev.mediaUrls,
        clicks: ev.clicks,
        roi: ev.roi,
        platformPostId: ev.platformPostId,
        events: []
      }
    }
    groups[key].events.push(ev)
    const group = groups[key]
    if (ev.status === 'done') {
      group.status = 'done'
    } else if (ev.status === 'scheduled' && group.status !== 'done') {
      group.status = 'scheduled'
    } else if (ev.status === 'pending' && group.status !== 'done' && group.status !== 'scheduled') {
      group.status = 'pending'
    }
    if (ev.clicks) group.clicks = (group.clicks || 0) + ev.clicks
    if (ev.roi) group.roi = (group.roi || 0) + ev.roi
  })
  return Object.values(groups)
}

function getPostOriginalUrl(platform: string, platformPostId: string | null | undefined, postUrl?: string | null): string {
  if (postUrl && (postUrl.startsWith('http://') || postUrl.startsWith('https://'))) {
    return postUrl
  }
  if (platformPostId && (platformPostId.startsWith('http://') || platformPostId.startsWith('https://'))) {
    return platformPostId
  }
  const normPlatform = normalizePlatformLabel(platform)
  const postId = platformPostId || `mock_post_${Date.now()}`
  switch (normPlatform) {
    case 'IG':
      return `https://www.instagram.com/p/${postId}/`
    case '小红书':
      return `https://www.xiaohongshu.com/explore/${postId}`
    case 'TikTok':
      return `https://www.tiktok.com/video/${postId}`
    case 'Google':
      return `https://www.google.com/maps/place/${postId}`
    case 'Facebook':
      return `https://www.facebook.com/${postId}`
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(normPlatform + ' post ' + postId)}`
  }
}

interface CalendarEvent {
  id: string
  brandId: string
  brandName: string
  platform: string
  title: string
  status: 'done' | 'pending' | 'scheduled'
  time: string
  scheduledAt: string
  mediaUrls?: string[]
  captionLang?: string
  mediaAssetId?: string | null
  clicks?: number
  roi?: number
  platformPostId?: string | null
  type?: 'post' | 'task'
  postUrl?: string | null
  agentNote?: string | null
  creativeHooks?: string | null
}

interface DashboardCalendarProps {
  brandId?: string
}

export default function DashboardCalendar({ brandId }: DashboardCalendarProps) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggeringId, setTriggeringId] = useState<string | null>(null)

  // Stitch & Postis UX elements
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'scheduled' | 'done'>('all')
  const [activeView, setActiveView] = useState<'month' | 'week' | 'day' | 'list'>('month')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [isBrandsCollapsed, setIsBrandsCollapsed] = useState(true)
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({})
  const [commentReplyText, setCommentReplyText] = useState<Record<string, string>>({})
  const [designerPromptText, setDesignerPromptText] = useState('')
  const [assetPageSize, setAssetPageSize] = useState(12)
  const [designerProcessing, setDesignerProcessing] = useState(false)
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [showDesignerPanel, setShowDesignerPanel] = useState<string | null>(null)
  const [aiProposalGenerating, setAiProposalGenerating] = useState(false)
  const [brandDetails, setBrandDetails] = useState<any>(null)

  const [activeBrandId, setActiveBrandId] = useState(brandId)
  const [allBrands, setAllBrands] = useState<any[]>([])
  // Map of brandId → lastPublishedAt ISO string (or null)
  const [brandActivityMap, setBrandActivityMap] = useState<Record<string, string | null>>({})

  // Draft Creation Workspace states
  const [isCreatingPost, setIsCreatingPost] = useState(false)
  const [contentIdea, setContentIdea] = useState('')
  const [creativeHooks, setCreativeHooks] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [agentNote, setAgentNote] = useState('')
  const [attachedMedia, setAttachedMedia] = useState<Array<{ id: string; type: 'asset' | 'url'; url: string }>>([])
  const [newUrlInput, setNewUrlInput] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState<'unused' | 'all'>('unused')
  const [accounts, setAccounts] = useState<any[]>([])
  const [brandAssets, setBrandAssets] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [mediaProcessingIndex, setMediaProcessingIndex] = useState<number | null>(null)
  const [activeMediaOp, setActiveMediaOp] = useState<{ index: number; action: 'design' | 'video' } | null>(null)
  const [mediaOpPrompt, setMediaOpPrompt] = useState('')
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

    const [createdDrafts, setCreatedDrafts] = useState<any[] | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [draftCaptions, setDraftCaptions] = useState<Record<string, string>>({})
  const [draftHashtags, setDraftHashtags] = useState<Record<string, string>>({})
  const [draftStatuses, setDraftStatuses] = useState<Record<string, 'generating' | 'completed' | 'failed'>>({})
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [showPublishOptionModal, setShowPublishOptionModal] = useState(false)
  const [showPublishDropdown, setShowPublishDropdown] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)

  const accountOptions = useMemo(() => {
    const list = [...accounts]

    // Add unconfigured placeholder accounts from createdDrafts if any
    if (createdDrafts && createdDrafts.length > 0) {
      createdDrafts.forEach(d => {
        if (d.account && d.account.handle === 'unconfigured') {
          if (!list.some(a => a.id === d.account.id)) {
            const pId = d.account.platformId.toLowerCase()
            const isGoogle = ['google', 'google_business'].includes(pId)
            const isRed = ['red', 'xiaohongshu', 'xhs'].includes(pId)
            list.push({
              id: d.account.id,
              platformId: d.account.platformId,
              handle: 'unconfigured',
              displayName: d.account.displayName || (
                isGoogle ? 'Google Business (未配置)'
                : isRed ? '小红书 (未配置)'
                : pId === 'instagram' ? 'Instagram (未配置)'
                : pId === 'facebook' ? 'Facebook (未配置)'
                : pId === 'tiktok' ? 'TikTok (未配置)'
                : `${d.account.platformId.charAt(0).toUpperCase() + d.account.platformId.slice(1)} (未配置)`
              ),
              autoPilot: false,
              profileUrl: null
            } as any)
          }
        }
      })
    }

    const hasGoogle = list.some(a => ['google', 'google_business'].includes(a.platformId.toLowerCase()))
    const hasRednote = list.some(a => ['red', 'xiaohongshu', 'xhs'].includes(a.platformId.toLowerCase()))
    const hasInstagram = list.some(a => a.platformId.toLowerCase() === 'instagram')
    const hasFacebook = list.some(a => a.platformId.toLowerCase() === 'facebook')
    const hasTiktok = list.some(a => a.platformId.toLowerCase() === 'tiktok')

    if (!hasGoogle) {
      list.push({
        id: 'unconfigured_google_business',
        platformId: 'google_business',
        handle: 'unconfigured',
        displayName: 'Google Business (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasRednote) {
      list.push({
        id: 'unconfigured_red',
        platformId: 'red',
        handle: 'unconfigured',
        displayName: '小红书 (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasInstagram) {
      list.push({
        id: 'unconfigured_instagram',
        platformId: 'instagram',
        handle: 'unconfigured',
        displayName: 'Instagram (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasFacebook) {
      list.push({
        id: 'unconfigured_facebook',
        platformId: 'facebook',
        handle: 'unconfigured',
        displayName: 'Facebook (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    if (!hasTiktok) {
      list.push({
        id: 'unconfigured_tiktok',
        platformId: 'tiktok',
        handle: 'unconfigured',
        displayName: 'TikTok (未配置)',
        autoPilot: false,
        profileUrl: null
      } as any)
    }
    return list
  }, [accounts, createdDrafts])

  useEffect(() => {
    if (!isAiGenerating || !createdDrafts || createdDrafts.length === 0) return

    let isMounted = true
    const interval = setInterval(async () => {
      const generatingDrafts = createdDrafts.filter(d => draftStatuses[d.accountId] === 'generating')
      
      if (generatingDrafts.length === 0) {
        setIsAiGenerating(false)
        clearInterval(interval)
        return
      }

      await Promise.all(
        generatingDrafts.map(async (draft) => {
          try {
            const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}`)
            const account = accountOptions.find(a => a.id === draft.accountId)
            const label = account ? (account.displayName || account.handle) : draft.accountId

            if (res.status === 404) {
              if (isMounted) {
                setDraftStatuses(prev => ({ ...prev, [draft.accountId]: 'failed' }))
                alert(`【AI 创作失败】账号 [${label}] 的内容生成未成功，数据已清理。`)
                setCreatedDrafts(prev => prev ? prev.filter(d => d.id !== draft.id) : null)
                setSelectedAccountIds(prev => prev.filter(id => id !== draft.accountId))
                setDraftCaptions(prev => {
                  const next = { ...prev }
                  delete next[draft.accountId]
                  return next
                })
                setDraftHashtags(prev => {
                  const next = { ...prev }
                  delete next[draft.accountId]
                  return next
                })
              }
              return
            }
            if (!res.ok) return
            const json = await res.json()
            const updatedDraft = json.draft
            
            if (updatedDraft) {
              if (updatedDraft.status === 'failed') {
                if (isMounted) {
                  setDraftStatuses(prev => ({ ...prev, [draft.accountId]: 'failed' }))
                  const errMsg = updatedDraft.agentNote || '未知错误'
                  alert(`【AI 创作失败】账号 [${label}] 内容生成失败：\n${errMsg}`)
                  
                  // Clean up draft from DB immediately
                  fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}`, { method: 'DELETE' }).catch(() => {})

                  setCreatedDrafts(prev => prev ? prev.filter(d => d.id !== draft.id) : null)
                  setSelectedAccountIds(prev => prev.filter(id => id !== draft.accountId))
                  setDraftCaptions(prev => {
                    const next = { ...prev }
                    delete next[draft.accountId]
                    return next
                  })
                  setDraftHashtags(prev => {
                    const next = { ...prev }
                    delete next[draft.accountId]
                    return next
                  })
                }
                return
              }
              if (updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
                if (isMounted) {
                  setDraftCaptions(prev => ({ ...prev, [draft.accountId]: updatedDraft.caption }))
                  setDraftHashtags(prev => ({ ...prev, [draft.accountId]: (updatedDraft.hashtags || []).join(' ') }))
                  setDraftStatuses(prev => ({ ...prev, [draft.accountId]: 'completed' }))
                }
              }
            }
          } catch (e) {
            console.error(`Error polling draft ${draft.id}:`, e)
          }
        })
      )
    }, 2000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [isAiGenerating, createdDrafts, draftStatuses, activeBrandId, accountOptions])

  useEffect(() => {
    if (activeBrandId) {
      // Load accounts
      fetch(`/api/brands/${activeBrandId}/accounts`)
        .then(res => res.json())
        .then(data => setAccounts(data.accounts || []))
        .catch(() => setAccounts([]))

      // Load assets
      fetch(`/api/brands/${activeBrandId}/assets`)
        .then(res => res.json())
        .then(data => setBrandAssets(data.assets || []))
        .catch(() => setBrandAssets([]))
    } else {
      setAccounts([])
      setBrandAssets([])
    }
  }, [activeBrandId])

  useEffect(() => {
    setAssetPageSize(12)
  }, [activeBrandId, assetTypeFilter, isCreatingPost])

  useEffect(() => {
    setActiveBrandId(brandId)
  }, [brandId])

  useEffect(() => {
    fetch('/api/brands?assignedOnly=true')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllBrands(data)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch brand activity (last published date) for color-coded health status
  useEffect(() => {
    fetch('/api/dashboard/brand-activity')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.brands)) {
          const map: Record<string, string | null> = {}
          data.brands.forEach((b: { id: string; lastPublishedAt: string | null }) => {
            map[b.id] = b.lastPublishedAt
          })
          setBrandActivityMap(map)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (activeBrandId) {
      fetch(`/api/brands/${activeBrandId}`)
        .then(res => res.json())
        .then(data => setBrandDetails(data))
        .catch(() => {})
    }
  }, [activeBrandId])



  // Media asset handlers
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

  // Asset filtering helper
  const filteredAssets = useMemo(() => {
    // Sort descending by createdAt to prioritize latest uploaded assets
    const sorted = [...brandAssets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return sorted.filter(asset => {
      if (assetTypeFilter === 'unused') {
        return asset.usedCount === 0
      }
      const isVid = asset.mimeType?.startsWith('video/') || isVideoUrl(asset.url)
      if (assetTypeFilter === 'all') {
        return !isVid
      }
      return true
    })
  }, [brandAssets, assetTypeFilter])

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

  // API triggers
  const triggerCopywriter = async (draftId: string, silent = false) => {
    if (!activeBrandId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '触发 AI 创作失败')
      if (!silent) {
        alert('AI 创作已在后台启动，您可以稍后查看。')
        setIsCreatingPost(false)
        await refreshCalendar()
      }
    } catch (e: any) {
      if (!silent) {
        alert(e.message || '触发 AI 创作失败')
      } else {
        console.error(`Copywriter trigger failed silently:`, e)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleMediaAIDesign = async (index: number, assetId: string, actionType: 'design' | 'video') => {
    if (!mediaOpPrompt.trim()) {
      alert('请输入操作提示词')
      return
    }
    
    setMediaProcessingIndex(index)
    try {
      const imageUrls = attachedMedia
        .map((m) => m.url)
        .filter((u): u is string => Boolean(u))

      const apiPath = actionType === 'video'
        ? `/api/brands/${activeBrandId}/video-director`
        : `/api/brands/${activeBrandId}/assets/${assetId}/design`

      const payload = actionType === 'video'
        ? {
            prompt: mediaOpPrompt,
            creativeHooks,
            imageAssetIds: [assetId],
            imageUrls,
          }
        : {
            prompt: mediaOpPrompt,
            action: actionType,
          }

      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

      alert(actionType === 'video' ? 'VideoDirector 图生视频成功！已为您同步该视频。' : 'AI 修图优化成功！已为您更新该图片。')
      setActiveMediaOp(null)
      setMediaOpPrompt('')
      // refresh assets
      fetch(`/api/brands/${activeBrandId}/assets`)
        .then(res => res.json())
        .then(data => setBrandAssets(data.assets || []))
        .catch(() => {})
    } catch (err: any) {
      alert(err.message || '操作失败')
    } finally {
      setMediaProcessingIndex(null)
    }
  }

    const saveDraft = async (nextStatus?: string, captionOverride?: string, scheduledAtOverride?: string) => {
    if (!activeBrandId) return null
    let activeCaption = captionOverride !== undefined ? captionOverride : caption
    if (!activeCaption.trim() && contentIdea.trim()) {
      activeCaption = contentIdea.trim()
      setCaption(activeCaption)
    }
    const trimmedCaption = activeCaption.trim()
    if (!trimmedCaption) {
      alert('草稿正文或内容创意不能为空')
      return null
    }
    if (selectedAccountIds.length === 0) {
      alert('请选择发布平台账号')
      return null
    }
    setSaving(true)
    const mediaUrls = attachedMedia.filter((m) => m.type === 'url').map((m) => m.url)
    const formattedAgentNote = contentIdea.trim() ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】\n${agentNote}` : agentNote
    try {
      const savedDrafts: any[] = []

      // Create new drafts for all selected accounts
      const results = await Promise.all(
        selectedAccountIds.map(async (accId) => {
          const res = await fetch(`/api/brands/${activeBrandId}/drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caption: trimmedCaption,
              hashtags: parseTags(hashtags),
              accountId: accId,
              scheduledAt: scheduledAtOverride === 'none' ? null : ((scheduledAtOverride || scheduledAt) ? new Date(scheduledAtOverride || scheduledAt).toISOString() : null),
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

      await refreshCalendar()
      return savedDrafts
    } catch (e: any) {
      alert(e.message || '保存草稿失败')
      return null
    } finally {
      setSaving(false)
    }
  }

    const saveOrUpdateDrafts = async (status: string, scheduledAtOverride?: string | null) => {
    if (!activeBrandId) return null
    setSaving(true)
    try {
      if (createdDrafts && createdDrafts.length > 0) {
        const updated = await Promise.all(
          createdDrafts.map(async (d) => {
            const currentCaption = draftCaptions[d.accountId] || d.caption || '【AI 正在创作中...】'
            const currentHashtags = draftHashtags[d.accountId] !== undefined
              ? (typeof draftHashtags[d.accountId] === 'string' ? parseTags(draftHashtags[d.accountId]) : draftHashtags[d.accountId])
              : d.hashtags

            const res = await fetch(`/api/brands/${activeBrandId}/drafts/${d.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: currentCaption,
                hashtags: Array.isArray(currentHashtags) ? currentHashtags : parseTags(String(currentHashtags || '')),
                status,
                scheduledAt: scheduledAtOverride === null ? null : (scheduledAtOverride || (scheduledAt ? new Date(scheduledAt).toISOString() : null)),
                creativeHooks: creativeHooks.trim(),
              }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(json.error || `更新草稿失败: ${d.id}`)
            return json.draft
          })
        )
        await refreshCalendar()
        return updated
      } else {
        const saved = await saveDraft(status, undefined, scheduledAtOverride === null ? 'none' : scheduledAtOverride)
        return saved
      }
    } catch (e: any) {
      alert(e.message || '操作失败')
      return null
    } finally {
      setSaving(false)
    }
  }

    const submitDraft = async () => {
    if (!activeBrandId) return
    const draftsList = await saveOrUpdateDrafts('draft')
    if (!draftsList || draftsList.length === 0) return

    setSaving(true)
    try {
      await Promise.all(
        draftsList.map(async (draft) => {
          const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || `提交草稿 ${draft.id} 失败`)
        })
      )
      alert('草稿提交成功！')
      setIsCreatingPost(false)
      await refreshCalendar()
    } catch (e: any) {
      alert(e.message || '提交草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSchedulePublish = async () => {
    if (!activeBrandId) return

    setSaving(true)
    try {
      // Call unified smart scheduling API to get recommended publish time
      let targetDateISO: string
      try {
        const schedRes = await fetch(`/api/brands/${activeBrandId}/scheduling/recommend`, {
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
      } catch {
        targetDateISO = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      }

      const draftsList = await saveOrUpdateDrafts('scheduled', targetDateISO)
      if (!draftsList || draftsList.length === 0) { setSaving(false); return }

      await Promise.all(
        draftsList.map(async (draft) => {
          const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || `提交草稿 ${draft.id} 失败`)
        })
      )

      const dt = new Date(targetDateISO)
      const timeStr = dt.toLocaleString('zh-CN', {
        month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      alert(`智能排期成功！系统已为您安排在 ${timeStr} 发布。`)
      setIsCreatingPost(false)
      setShowPublishOptionModal(false)
      await refreshCalendar()
    } catch (e: any) {
      alert(e.message || '排期提交失败')
    } finally {
      setSaving(false)
    }
  }



  const handlePublishImmediately = async () => {
    if (!activeBrandId) return

    // For immediate publish, scheduledAt should be null so that it gets published right now.
    // Use 'draft' as intermediate status — submitDraftForDelivery decides the final status
    // (either 'published', 'scheduled', or 'failed'). Pre-setting 'published' caused a
    // status inconsistency when PostFast API key was missing or delivery failed.
    const draftsList = await saveOrUpdateDrafts('draft', null)
    if (!draftsList || draftsList.length === 0) return

    setSaving(true)
    try {
      await Promise.all(
        draftsList.map(async (draft) => {
          // Use /approve route to bypass autopilot check and force publish
          const res = await fetch(`/api/brands/${activeBrandId}/drafts/${draft.id}/approve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: agentNote }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || `发布草稿 ${draft.id} 失败`)
        })
      )

      alert('立刻发布成功！系统已为您直接发布内容。')
      setIsCreatingPost(false)
      setShowPublishOptionModal(false)
      await refreshCalendar()
    } catch (e: any) {
      alert(e.message || '立刻发布失败')
    } finally {
      setSaving(false)
    }
  }

  const refreshCalendar = async () => {
    try {
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleAIWrite = async (eventBrandId: string, draftId: string) => {
    const targetBrandId = eventBrandId || activeBrandId
    if (!targetBrandId) {
      alert('未找到关联的品牌ID')
      return
    }
    setTriggeringId(draftId)
    try {
      const currentEvent = events.find(e => e.id === draftId)
      let notePayload = ""
      if (currentEvent) {
        const originalNote = currentEvent.agentNote || ""
        const cleanNote = originalNote.replace(/【AI 生成指令】[\s\S]*?【\/AI 生成指令】(?:\r?\n)?/, '').trim()
        notePayload = contentIdea.trim() 
          ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】\n${cleanNote}`.trim()
          : cleanNote
      } else {
        notePayload = contentIdea.trim() ? `【AI 生成指令】${contentIdea.trim()}【/AI 生成指令】` : ""
      }

      const patchRes = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentNote: notePayload,
          creativeHooks: creativeHooks.trim()
        })
      })

      if (!patchRes.ok) {
        const errJson = await patchRes.json().catch(() => ({}))
        throw new Error(errJson.error || '保存创意想法与指令失败')
      }

      const res = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}/trigger-copywriter`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '触发 AI 创作失败')
      
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      
      // Update calendar immediately to show the placeholder caption
      const reloadRes = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (reloadRes.ok) {
        const data = await reloadRes.json()
        setEvents(data.events || [])
      }

      // Poll every 2 seconds until AI copywriting is complete
      let attempts = 0
      const maxAttempts = 15 // 30 seconds max
      const interval = setInterval(async () => {
        attempts++
        try {
          const checkRes = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`)
          if (checkRes.status === 404) {
            clearInterval(interval)
            setTriggeringId(null)
            alert('【AI 创作失败】该渠道的内容生成未成功，数据已清理。')
            await refreshCalendar()
            return
          }
          if (checkRes.ok) {
            const checkData = await checkRes.json()
            const updatedDraft = checkData.draft
            if (updatedDraft) {
              if (updatedDraft.status === 'failed') {
                clearInterval(interval)
                setTriggeringId(null)
                const errMsg = updatedDraft.agentNote || '未知错误'
                alert(`【AI 创作失败】内容生成失败：\n${errMsg}`)
                
                // Clean up draft from DB immediately
                fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {})
                await refreshCalendar()
                return
              }
              if (updatedDraft.caption && updatedDraft.caption !== '【AI 正在创作中...】') {
                clearInterval(interval)
                setTriggeringId(null)
                
                // Reload final events to show the actual generated caption
                const reloadRes2 = await fetch(`/api/dashboard/calendar?${query.toString()}`)
                if (reloadRes2.ok) {
                  const data2 = await reloadRes2.json()
                  setEvents(data2.events || [])
                }
              }
            }
          }
        } catch (e) {
          console.error('Polling error:', e)
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval)
          setTriggeringId(null)
        }
      }, 2000)

    } catch (e) {
      alert(e instanceof Error ? e.message : '触发 AI 创作失败')
      setTriggeringId(null)
    }
  }

  const handleAIDesign = async (draftId: string, mediaAssetId: string, actionType: 'design' | 'video') => {
    if (!designerPromptText.trim()) {
      alert('请输入您的智能修改指令，例如：“添加店长推荐标签”')
      return
    }

    if (actionType === 'video') {
      setVideoProcessing(true)
    } else {
      setDesignerProcessing(true)
    }

    try {
      const targetBrandId = activeBrandId || events.find(e => e.id === draftId)?.brandId
      if (!targetBrandId) {
        throw new Error('未找到关联的品牌ID')
      }

      const targetEvent = events.find(e => e.id === draftId)
      const apiPath = actionType === 'video'
        ? `/api/brands/${targetBrandId}/video-director`
        : `/api/brands/${targetBrandId}/assets/${mediaAssetId}/design`

      const payload = actionType === 'video'
        ? {
            prompt: designerPromptText,
            creativeHooks,
            imageAssetIds: [mediaAssetId],
            imageUrls: targetEvent?.mediaUrls || [],
          }
        : {
            prompt: designerPromptText,
            action: actionType,
          }

      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '设计修改失败')
      }

      const newAsset = data.asset

      // Patch the draft with the new media asset URL
      const patchRes = await fetch(`/api/brands/${targetBrandId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrls: [newAsset.url],
          assetIds: [newAsset.id]
        })
      })

      if (!patchRes.ok) {
        const patchData = await patchRes.json()
        throw new Error(patchData.error || '关联新素材到排期失败')
      }

      alert(actionType === 'video' ? 'VideoDirector 操作成功！已完成图生视频并同步到排期。' : 'Designer AI 操作成功！排期已自动同步全新设计的海报。')
      
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      const reloadRes = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (reloadRes.ok) {
        const data = await reloadRes.json()
        setEvents(data.events || [])
      }
      setShowDesignerPanel(null)
      setDesignerPromptText('')
    } catch (err: any) {
      alert(err.message || '修改失败')
    } finally {
      setDesignerProcessing(false)
      setVideoProcessing(false)
    }
  }

  const handleAIProposal = async () => {
    setAiProposalGenerating(true)
    try {
      // Trigger Apify sync to get latest reviews/topics for planning
      if (activeBrandId) {
        await fetch(`/api/brands/${activeBrandId}/apify-sync`, { method: 'POST' }).catch(() => {})
      }
      
      // Call coordinate-scheduler workflows to generate drafts (simulated interval or direct trigger if present)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Reload calendar to fetch newly created draft proposals
      const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
      const query = new URLSearchParams({ month })
      if (activeBrandId) query.set('brandId', activeBrandId)
      const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
        alert('AI 已根据品牌资产和本地动态为您生成了全新排期提案！')
      }
    } catch (err) {
      alert('一键排期提案失败，请稍后重试')
    } finally {
      setAiProposalGenerating(false)
    }
  }

  // Derived state memoizations
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (activeFilter === 'all') return true
      if (activeFilter === 'done') {
        return ev.status === 'done' && ev.type !== 'task'
      }
      return ev.status === activeFilter
    })
  }, [events, activeFilter])

  const eventsByDay = useMemo(() => {
    return filteredEvents.reduce<Record<number, CalendarEvent[]>>((acc, event) => {
      const day = new Date(event.scheduledAt).getDate()
      acc[day] = acc[day] || []
      acc[day].push(event)
      return acc
    }, {})
  }, [filteredEvents])

  const selectedDayEvents = useMemo(() => {
    return selectedDay ? (eventsByDay[selectedDay] || []) : []
  }, [selectedDay, eventsByDay])

  const activeDrawerEvent = useMemo(() => {
    return selectedDayEvents.find(e => e.id === selectedEventId) || selectedDayEvents[0]
  }, [selectedDayEvents, selectedEventId])

  const activeEventComments = useMemo(() => {
    return (activeDrawerEvent && commentsMap[activeDrawerEvent.id]) || []
  }, [activeDrawerEvent, commentsMap])

  // Synchronize Content Idea and Creative Hooks when selecting an event in the calendar drawer
  const lastDrawerEventIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeDrawerEvent) {
      if (lastDrawerEventIdRef.current !== activeDrawerEvent.id) {
        lastDrawerEventIdRef.current = activeDrawerEvent.id
        
        const note = activeDrawerEvent.agentNote || ''
        if (note.includes('【AI 生成指令】')) {
          const match = note.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/)
          if (match) {
            setContentIdea(match[1].trim())
          } else {
            setContentIdea('')
          }
        } else {
          setContentIdea(note)
        }
        setCreativeHooks(activeDrawerEvent.creativeHooks || '')
      }
    } else {
      lastDrawerEventIdRef.current = null
      setContentIdea('')
      setCreativeHooks('')
    }
  }, [activeDrawerEvent])

  // Load calendar events
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
        const query = new URLSearchParams({ month })
        if (activeBrandId) query.set('brandId', activeBrandId)
        const res = await fetch(`/api/dashboard/calendar?${query.toString()}`)
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        if (!cancelled) setEvents(data.events || [])
      } catch {
        if (!cancelled) setError('日历数据加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [viewYear, viewMonth, activeBrandId])

  // Reset selectedEventId to the first event of the selected day when day changes
  useEffect(() => {
    if (selectedDay) {
      if (selectedDayEvents.length > 0) {
        if (!selectedDayEvents.some(e => e.id === selectedEventId)) {
          setSelectedEventId(selectedDayEvents[0].id)
        }
      } else {
        setSelectedEventId(null)
      }
    } else {
      setSelectedEventId(null)
    }
  }, [selectedDay, selectedDayEvents, selectedEventId])



  const handleSendManualReply = (eventId: string, commentId: string) => {
    const text = commentReplyText[commentId]?.trim()
    if (!text) return

    setCommentsMap(prev => {
      const list = prev[eventId] || []
      return {
        ...prev,
        [eventId]: list.map(c => c.id === commentId ? { ...c, reply: text } : c)
      }
    })
    setCommentReplyText(prev => ({ ...prev, [commentId]: '' }))
  }

  const handleGenerateAiReply = (eventId: string, commentId: string, commentContent: string) => {
    setCommentsMap(prev => {
      const list = prev[eventId] || []
      return {
        ...prev,
        [eventId]: list.map(c => c.id === commentId ? { ...c, isGeneratingReply: true } : c)
      }
    })

    setTimeout(() => {
      let aiResponse = '感谢您的反馈！我们会继续努力提供更好的产品和服务。'
      if (commentContent.includes('地址') || commentContent.includes('门店') || commentContent.includes('在哪里')) {
        aiResponse = '亲亲，我们在上海市静安区南京西路123号设有旗舰店，欢迎您随时来店打卡体验！'
      } else if (commentContent.includes('预约') || commentContent.includes('排队') || commentContent.includes('周末')) {
        aiResponse = '周末客流量较大，为了避免您排队，建议您关注我们的小程序提前进行预约排队哦！'
      } else if (commentContent.includes('好吃') || commentContent.includes('超赞') || commentContent.includes('delicious') || commentContent.includes('amazing')) {
        aiResponse = '哇，太开心得到您的喜爱！我们会保持品质，期待您的下一次光临！❤️'
      } else if (commentContent.includes('open') || commentContent.includes('weekend')) {
        aiResponse = 'Yes, we are open on weekends from 9 AM to 10 PM. Looking forward to welcoming you!'
      } else if (commentContent.includes('vegan') || commentContent.includes('dairy-free')) {
        aiResponse = 'Yes, we do have delicious vegan and dairy-free options available! Please ask our staff when you arrive.'
      }

      setCommentsMap(prev => {
        const list = prev[eventId] || []
        return {
          ...prev,
          [eventId]: list.map(c => c.id === commentId ? {
            ...c,
            reply: aiResponse,
            isAiReply: true,
            isGeneratingReply: false
          } : c)
        }
      })
    }, 1000)
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
    setSelectedDay(null)
    setSelectedEventId(null)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
    setSelectedDay(null)
    setSelectedEventId(null)
  }

  const handlePrev = () => {
    if (activeView === 'day') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() - 1)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else if (activeView === 'week') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() - 7)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else {
      prevMonth()
    }
  }

  const handleNext = () => {
    if (activeView === 'day') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() + 1)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else if (activeView === 'week') {
      const refDay = selectedDay || 1
      const current = new Date(viewYear, viewMonth, refDay)
      current.setDate(current.getDate() + 7)
      setViewYear(current.getFullYear())
      setViewMonth(current.getMonth())
      setSelectedDay(current.getDate())
      setSelectedEventId(null)
    } else {
      nextMonth()
    }
  }

  // Auto-select day when entering day/week view if selectedDay is null
  useEffect(() => {
    if ((activeView === 'day' || activeView === 'week') && !selectedDay) {
      const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()
      setSelectedDay(isCurrentMonth ? today.getDate() : 1)
    }
  }, [activeView, selectedDay, viewYear, viewMonth])

  // Get formatted week range label
  const getWeekRangeLabel = () => {
    const weekDays = getDaysForWeekView()
    const start = weekDays[0]
    const end = weekDays[6]
    if (start.getFullYear() === end.getFullYear()) {
      if (start.getMonth() === end.getMonth()) {
        return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getDate()}日`
      }
      return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`
    }
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const getDaysForWeekView = () => {
    const referenceDate = selectedDay ? new Date(viewYear, viewMonth, selectedDay) : new Date(viewYear, viewMonth, 1)
    const dayOfWeek = referenceDate.getDay() // 0 is Sunday
    const startOfWeek = new Date(referenceDate)
    startOfWeek.setDate(referenceDate.getDate() - dayOfWeek)
    
    const weekDays = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      weekDays.push(d)
    }
    return weekDays
  }

  // --- Start of Diagnostics & Stats ---
  const getVisibleEvents = () => {
    if (activeView === 'day' && selectedDay) {
      return events.filter(ev => {
        const d = new Date(ev.scheduledAt)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === selectedDay
      })
    } else if (activeView === 'week') {
      const weekDays = getDaysForWeekView()
      const start = weekDays[0]
      const end = weekDays[6]
      const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).getTime()
      const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime()
      return events.filter(ev => {
        const t = new Date(ev.scheduledAt).getTime()
        return t >= startMs && t <= endMs
      })
    } else {
      return events.filter(ev => {
        const d = new Date(ev.scheduledAt)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth
      })
    }
  }

  const visibleEvents = getVisibleEvents()

  const stats = {
    done: visibleEvents.filter(e => e.status === 'done' && e.type !== 'task').length,
    scheduled: visibleEvents.filter(e => e.status === 'scheduled').length,
    pending: visibleEvents.filter(e => e.status === 'pending').length,
    total: visibleEvents.length
  }

  // Calculate gap days (days with 0 posts)
  const getGapDaysCount = () => {
    if (activeView === 'day' && selectedDay) {
      const dayEvents = events.filter(ev => {
        const d = new Date(ev.scheduledAt)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === selectedDay
      })
      return dayEvents.length === 0 ? 1 : 0
    } else if (activeView === 'week') {
      let gaps = 0
      const weekDays = getDaysForWeekView()
      weekDays.forEach(wd => {
        const dayEvents = events.filter(ev => {
          const d = new Date(ev.scheduledAt)
          return d.getFullYear() === wd.getFullYear() && d.getMonth() === wd.getMonth() && d.getDate() === wd.getDate()
        })
        if (dayEvents.length === 0) gaps++
      })
      return gaps
    } else {
      let gaps = 0
      const totalMonthDays = new Date(viewYear, viewMonth + 1, 0).getDate()
      for (let d = 1; d <= totalMonthDays; d++) {
        const dayEvents = events.filter(ev => {
          const date = new Date(ev.scheduledAt)
          return date.getFullYear() === viewYear && date.getMonth() === viewMonth && date.getDate() === d
        })
        if (dayEvents.length === 0) gaps++
      }
      return gaps
    }
  }

  const gapDaysCount = getGapDaysCount()

  // Calculate missing platforms (for single brand view)
  const getMissingPlatforms = () => {
    const activeAccounts = brandDetails?.accounts || []
    const missing: string[] = []
    if (activeBrandId && activeAccounts.length > 0) {
      activeAccounts.forEach((acc: any) => {
        const normPlatform = normalizePlatformLabel(acc.platformId)
        const hasPost = visibleEvents.some(ev => normalizePlatformLabel(ev.platform) === normPlatform)
        if (!hasPost && !missing.includes(normPlatform)) {
          missing.push(normPlatform)
        }
      })
    }
    return missing
  }

  const missingPlatforms = getMissingPlatforms()

  // Calculate missing brands (for all brands view)
  const getMissingBrands = () => {
    const missing: string[] = []
    if (!activeBrandId && allBrands.length > 0) {
      allBrands.forEach((b: any) => {
        const hasPost = visibleEvents.some(ev => ev.brandId === b.id)
        if (!hasPost) {
          missing.push(b.name)
        }
      })
    }
    return missing
  }

  const missingBrands = getMissingBrands()
  // --- End of Diagnostics & Stats ---

  const isToday = (d: number) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  const formatTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  const expiredAccounts = brandDetails?.accounts?.filter((acc: any) => {
    if (!acc.expiresAt) return false
    return new Date(acc.expiresAt) < new Date()
  }) || []

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[750px] bg-slate-50 dark:bg-slate-950 font-sans">
      
      {/* 1. Left Sidebar: Channels & Private Domain */}
      <aside className="w-full lg:w-[260px] bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-4 tracking-wider">托管渠道 (Channels)</h2>
          
          <button
            onClick={() => {
              if (!activeBrandId) {
                alert('请在左侧选择特定品牌后再新建发布草稿。')
                return
              }
              setIsCreatingPost(true)
              setCaption('')
              setContentIdea('')
              setCreativeHooks('')
              setHashtags('')
              setSelectedAccountIds(accounts.map(a => a.id))
              setScheduledAt('')
              setAgentNote('')
              setAttachedMedia([])
              setNewUrlInput('')
              setCreatedDrafts(null)
              setIsAiGenerating(false)
              setDraftCaptions({})
              setDraftHashtags({})
              setDraftStatuses({})
              setEditingAccountId(null)
            }}
            className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-xs"
          >
            <Plus className="w-4 h-4 text-slate-500" />
            <span>新建发布 (New Post)</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
          {/* Brand List Selection */}
          <div>
            <div 
              onClick={() => setIsBrandsCollapsed(!isBrandsCollapsed)}
              className="flex items-center justify-between mb-3 px-1 cursor-pointer select-none text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <span className="text-[10px] font-black uppercase tracking-widest">
                我的品牌 (My Brands)
              </span>
              {isBrandsCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </div>
            {!isBrandsCollapsed && (
              allBrands.length > 0 ? (() => {
                const now = new Date()

                // Compute health status per brand
                const getBrandHealth = (brandId: string): 'red' | 'yellow' | 'green' | 'unknown' => {
                  if (!(brandId in brandActivityMap)) return 'unknown'
                  const lastPub = brandActivityMap[brandId]
                  if (!lastPub) return 'red'
                  const daysSince = Math.floor((now.getTime() - new Date(lastPub).getTime()) / (1000 * 60 * 60 * 24))
                  if (daysSince <= 2) return 'green'
                  if (daysSince === 3) return 'yellow'
                  return 'red'
                }

                const healthOrder: Record<string, number> = { red: 0, yellow: 1, green: 2, unknown: 3 }
                const sortedBrands = [...allBrands].sort((a, b) => {
                  return (healthOrder[getBrandHealth(a.id)] ?? 3) - (healthOrder[getBrandHealth(b.id)] ?? 3)
                })

                const healthDot: Record<string, string> = {
                  red: 'bg-red-500',
                  yellow: 'bg-amber-400',
                  green: 'bg-emerald-500',
                  unknown: 'bg-slate-300 dark:bg-slate-600',
                }

                const healthLabel: Record<string, string> = {
                  red: '超过2天未发布',
                  yellow: '第3天未发布',
                  green: '3天内有发布',
                  unknown: '暂无数据',
                }

                return (
                  <ul className="space-y-1.5 mb-6">
                    <li
                      onClick={() => setActiveBrandId(undefined)}
                      className={`flex flex-col p-2.5 rounded-xl cursor-pointer transition-all border ${
                        activeBrandId === undefined
                          ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-400 font-bold'
                          : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <span className="text-xs text-slate-700 dark:text-slate-200">全部品牌 (All Brands)</span>
                    </li>
                    {sortedBrands.map((b: any) => {
                      const isSelected = b.id === activeBrandId
                      const lacksChannels = !b.accounts || b.accounts.length === 0
                      const health = getBrandHealth(b.id)
                      return (
                        <li
                          key={b.id}
                          onClick={() => setActiveBrandId(b.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                            isSelected
                              ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/40 font-bold'
                              : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className={`text-xs truncate ${
                              isSelected
                                ? 'text-indigo-700 dark:text-indigo-400'
                                : 'text-slate-700 dark:text-slate-200'
                            }`}>{b.name}</span>
                            {lacksChannels && (
                              <span className="text-[9px] text-red-500 font-medium mt-0.5">
                                ⚠️ 缺失渠道配置
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 ml-2 shrink-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                health === 'red' ? 'bg-red-500 animate-pulse' :
                                health === 'yellow' ? 'bg-amber-400' :
                                health === 'green' ? 'bg-emerald-500' :
                                'bg-slate-300 dark:bg-slate-600'
                              }`}
                              title={healthLabel[health]}
                            />
                            <span className={`text-[8px] font-semibold ${
                              health === 'red' ? 'text-red-500' :
                              health === 'yellow' ? 'text-amber-500' :
                              health === 'green' ? 'text-emerald-600 dark:text-emerald-400' :
                              'text-slate-400'
                            }`}>
                              {healthLabel[health]}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              })() : (
                <div className="text-[11px] text-slate-400 italic p-1 mb-6">加载品牌中...</div>
              )
            )}
          </div>

          {/* Dynamic Accounts List from DB */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {brandDetails?.name || '当前品牌'} · 托管渠道
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            
            {activeBrandId && brandDetails?.accounts && brandDetails.accounts.length > 0 ? (
              <ul className="space-y-1.5">
                {brandDetails.accounts.map((acc: any) => {
                  const normPlatform = normalizePlatformLabel(acc.platformId)
                  const isExpired = acc.expiresAt && new Date(acc.expiresAt) < new Date()
                  return (
                    <li key={acc.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-[9px] text-white font-extrabold ${
                          normPlatform === 'IG' ? 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500' :
                          normPlatform === 'Google' ? 'bg-blue-550' :
                          normPlatform === 'TikTok' ? 'bg-black' :
                          normPlatform === 'Facebook' ? 'bg-indigo-650' :
                          normPlatform === '小红书' ? 'bg-red-600' : 'bg-slate-500'
                        }`}>
                          {normPlatform}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate max-w-[140px]">
                          {acc.handle || acc.displayName}
                        </span>
                      </div>
                      <span className={`w-1.5 h-1.5 rounded-full ${isExpired ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    </li>
                  )
                })}
              </ul>
            ) : !activeBrandId ? (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80">
                当前显示全部品牌发布排期。选择左侧特定品牌可查看并配置其单独的托管发布渠道。
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80">
                暂未连接发布渠道，请前往“品牌设置”完成账号授权。
              </div>
            )}
          </div>

          {/* Dynamic Warnings List */}
          {activeBrandId && expiredAccounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">警告与异常</span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <div className="space-y-2">
                {expiredAccounts.map((acc: any) => (
                  <div key={acc.id} className="bg-amber-50 dark:bg-amber-955/20 border border-amber-200/50 dark:border-amber-900/30 p-3 rounded-xl flex gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="text-[10px]">
                      <p className="font-extrabold leading-tight">{normalizePlatformLabel(acc.platformId)} 授权过期</p>
                      <p className="mt-1 opacity-90">账号 {acc.handle} 的 AccessToken 已失效，排期将无法自动发布。</p>
                      <button onClick={() => alert('请前往设置重新连接')} className="mt-1.5 font-black underline hover:no-underline text-[9px]">去重新授权</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Brand Website / Landing Conversion page */}
          {activeBrandId && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">引流落地页</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/35 border border-slate-100 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2">
                  {brandDetails?.website ? (
                    <>
                      <Compass className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[170px]">{brandDetails.website}</span>
                    </>
                  ) : (
                    <>
                      <Compass className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 italic">缺失</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Central Content Area: Calendar Grid */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 p-4 lg:p-6 overflow-y-auto">
        {isCreatingPost ? (
          <div className="flex-1 flex flex-col gap-6 max-w-4xl mx-auto w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-805 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                  新建排期发布草稿 (Create Post Draft)
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-505 mt-1">品牌: {brandDetails?.name || '当前品牌'} · 支持多平台内容撰写及AI创作</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingPost(false)}
                className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900"
              >
                返回日历
              </button>
            </div>

            {/* Editor Body */}
            <div className="flex-1 space-y-5 overflow-y-auto pr-1 scrollbar-thin">
              
              {/* Content Idea & Generator Prompt */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">内容创意 / 生成指令 (AI Idea & Prompt)</label>
                <textarea
                  value={contentIdea}
                  onChange={(event) => setContentIdea(event.target.value)}
                  placeholder="输入内容创意或AI生成指令，例如：‘介绍我们的新菜单，突出新鲜食材和南洋风味’，AI将自动按所选平台特性重构文案..."
                  className="min-h-[60px] w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {/* Creative Hooks */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">创意 hooks (Creative Hooks)</label>
                <textarea
                  value={creativeHooks}
                  onChange={(event) => setCreativeHooks(event.target.value)}
                  placeholder="输入吸睛创意 hooks / 写作思路 / 爆款切入点，方便保存思路并供 AI 创作时使用..."
                  className="min-h-[60px] w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>



              {/* Accounts (Multi-Select) & AI Write Button */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-955/20 p-3 min-h-[44px]">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2.5">发布账号 (多选) <span className="text-red-500">*</span></p>
                  {accountOptions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">该品牌未绑定任何渠道账号</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {accountOptions.map((account) => {
                        const isSelected = selectedAccountIds.includes(account.id)
                        const getPlatformIcon = () => {
                          const p = account.platformId.toLowerCase()
                          if (p === 'instagram') return '📸'
                          if (p === 'facebook' || p === 'fb') return '👥'
                          if (p === 'red' || p === 'xiaohongshu' || p === 'xhs') return '📕'
                          if (p === 'tiktok') return '🎵'
                          if (p === 'google' || p === 'google_business') return '📍'
                          return '🔗'
                        }
                        return (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() => {
                              setSelectedAccountIds(prev => {
                                const next = prev.includes(account.id)
                                  ? prev.filter(id => id !== account.id)
                                  : [...prev, account.id]
                                setAccountId(next[0] || '')
                                return next
                              })
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300'
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            <span>{getPlatformIcon()}</span>
                            <span>{account.displayName || account.handle}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-end space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-550">内容创作</label>
                  <button
                    type="button"
                    disabled={saving || !contentIdea.trim() || selectedAccountIds.length === 0 || isAiGenerating}
                    onClick={async () => {
                      setSaving(true)
                      try {
                        if (createdDrafts && createdDrafts.length > 0) {
                          await Promise.all(
                            createdDrafts.map(d =>
                              fetch(`/api/brands/${activeBrandId}/drafts/${d.id}`, { method: 'DELETE' }).catch(() => {})
                            )
                          )
                        }

                        const saved = await saveDraft('draft', '【AI 正在创作中...】')
                        if (saved && saved.length > 0) {
                          // === CRITICAL: Batch ALL state updates synchronously before any further await ===
                          // If we call setCreatedDrafts and then await (e.g. accounts fetch) before calling
                          // setSelectedAccountIds, React flushes an intermediate render where accountOptions
                          // has already dropped 'unconfigured_xxx' (because createdDrafts now has the real
                          // DB account) but selectedAccountIds still references the old placeholder ID →
                          // preview panel entry disappears. Fix: compute newSelectedIds eagerly from `saved`
                          // and batch everything in one synchronous block, with no await in between.

                          const newSelectedIds = selectedAccountIds.map(id => {
                            if (id === 'unconfigured_red') {
                              const match = saved.find(d => ['red', 'xiaohongshu', 'xhs'].includes(d.account?.platformId?.toLowerCase()))
                              return match ? match.accountId : id
                            }
                            if (id === 'unconfigured_google_business') {
                              const match = saved.find(d => ['google_business', 'google', 'google_maps'].includes(d.account?.platformId?.toLowerCase()))
                              return match ? match.accountId : id
                            }
                            if (id === 'unconfigured_instagram') {
                              const match = saved.find(d => d.account?.platformId?.toLowerCase() === 'instagram')
                              return match ? match.accountId : id
                            }
                            if (id === 'unconfigured_facebook') {
                              const match = saved.find(d => d.account?.platformId?.toLowerCase() === 'facebook')
                              return match ? match.accountId : id
                            }
                            if (id === 'unconfigured_tiktok') {
                              const match = saved.find(d => d.account?.platformId?.toLowerCase() === 'tiktok')
                              return match ? match.accountId : id
                            }
                            return id
                          })

                          const newCaptions: Record<string, string> = {}
                          const newHashtags: Record<string, string> = {}
                          const newStatuses: Record<string, 'generating' | 'completed' | 'failed'> = {}
                          saved.forEach(d => {
                            newCaptions[d.accountId] = '【AI 正在创作中...】'
                            newHashtags[d.accountId] = ''
                            newStatuses[d.accountId] = 'generating'
                          })

                          // All state updates in one synchronous block → single batched render
                          setCreatedDrafts(saved)
                          setSelectedAccountIds(newSelectedIds)
                          setDraftCaptions(newCaptions)
                          setDraftHashtags(newHashtags)
                          setDraftStatuses(newStatuses)
                          setIsAiGenerating(true)

                          // Refresh accounts list in background (fire-and-forget, non-blocking)
                          fetch(`/api/brands/${activeBrandId}/accounts`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => { if (data?.accounts) setAccounts(data.accounts) })
                            .catch(e => console.error('Failed to reload accounts:', e))

                          await Promise.all(
                            saved.map(draft => triggerCopywriter(draft.id, true))
                          )
                        }
                      } catch (e: any) {
                        alert(e.message || '启动 AI 创作失败')
                        setIsAiGenerating(false)
                      } finally {
                        setSaving(false)
                      }
                    }}
                    className="h-10 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {isAiGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>AI 创作中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-white animate-pulse" />
                        <span>✨ AI 创作</span>
                      </>
                    )}
                  </button>
                </div>
              </div>



              {/* Media & Assets Section */}
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">媒体与素材</h4>
                  <div className="flex items-center gap-2">
                    {attachedMedia.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAttachedMedia([])}
                        className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        清空选择
                      </button>
                    )}
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      已选: {attachedMedia.length}
                    </span>
                  </div>
                </div>

                {/* Drag-and-drop grid */}
                {attachedMedia.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400">拖拽调整媒体排序</p>
                    <div className="grid grid-cols-4 gap-2">
                      {attachedMedia.map((item, index) => {
                        const isVid = isVideoUrl(item.url)
                        return (
                          <div
                            key={`${item.type}-${item.id}-${index}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900 group shadow-sm transition-shadow cursor-grab active:cursor-grabbing hover:shadow ${
                              draggedIndex === index ? 'opacity-40 border-emerald-500 scale-95' : ''
                            }`}
                          >
                            {isVid ? (
                              <video src={item.url} className="h-full w-full object-cover pointer-events-none" muted />
                            ) : (
                              <img src={item.url} className="h-full w-full object-cover pointer-events-none" alt="" />
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia(index)}
                              className="absolute top-1 right-1 rounded-full bg-red-500 hover:bg-red-600 p-1 text-white opacity-90 transition-opacity z-10"
                            >
                              <X className="h-3 w-3" />
                            </button>
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
                            {item.type === 'asset' && !isVid && (
                              <div className="absolute inset-0 bg-slate-955/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveMediaOp({ index, action: 'design' })
                                    setMediaOpPrompt('')
                                  }}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] py-1 font-bold flex items-center justify-center gap-0.5"
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
                                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[9px] py-1 font-bold flex items-center justify-center gap-0.5"
                                >
                                  <Video className="h-2.5 w-2.5" /> 生视频
                                </button>
                              </div>
                            )}

                            {/* Processing Overlay */}
                            {mediaProcessingIndex === index && (
                              <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-1 z-20">
                                <Loader2 className="h-4 w-4 text-white animate-spin" />
                                <span className="text-[8px] text-white font-bold">
                                  {activeMediaOp?.action === 'video' ? '视频生成...' : '图片优化...'}
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
                              className="px-3 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-350 text-xs font-bold"
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
                      onChange={(event) => setNewUrlInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleAddUrl()
                        }
                      }}
                      placeholder="https://example.com/image.jpg"
                      className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-955 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddUrl}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
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
                      {(['unused', 'all'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAssetTypeFilter(t)}
                          className={`px-2 py-0.5 rounded transition-all ${
                            assetTypeFilter === t
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                          }`}
                        >
                          {t === 'unused' ? '未使用' : '全部'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredAssets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center dark:border-slate-800">
                      <p className="text-xs text-slate-400">暂无对应素材</p>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[340px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-950 scrollbar-thin">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5">
                          {filteredAssets.slice(0, assetPageSize).map((asset, idx) => {
                            const isSelected = selectedAssetIds.includes(asset.id)
                            const isVid = asset.mimeType?.startsWith('video/') || isVideoUrl(asset.url)
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
                                  onClick={() => handleToggleAsset(asset)}
                                  className="absolute inset-0 w-full h-full text-left"
                                >
                                  {isVid ? (
                                    <video src={asset.url} className="h-full w-full object-cover pointer-events-none" muted />
                                  ) : (
                                    <img src={asset.url} className="h-full w-full object-cover pointer-events-none" alt="" />
                                  )}
                                </button>

                                {isSelected && (
                                  <div className="absolute inset-0 bg-emerald-950/20 backdrop-blur-[0.5px] pointer-events-none" />
                                )}

                                {isSelected && (
                                  <div className="absolute top-1.5 right-1.5 bg-emerald-500 rounded-full p-0.5 shadow-sm transition-colors z-10">
                                    <Check className="h-3 w-3 text-white stroke-[3px]" />
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

            </div>

            {/* Bottom Actions */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsCreatingPost(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-650 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900"
              >
                取消返回
              </button>

              <div className="flex items-center gap-3">
                {/* 预览效果 Button */}
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Eye className="w-4 h-4 text-indigo-500" />
                  <span>预览效果 ({selectedAccountIds.length} 个账号)</span>
                </button>

                {selectedAccountIds.length > 0 && (
                  <div className="relative">
                    {/* Split publish button: main action + dropdown */}
                    <div className="flex items-stretch rounded-xl overflow-hidden shadow-md">
                      {/* Primary action: smart scheduling */}
                      <button
                        type="button"
                        disabled={saving || isAiGenerating}
                        onClick={handleSchedulePublish}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs transition-all flex items-center gap-1 border-r border-emerald-500"
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>排期发布</span>
                      </button>
                      {/* Dropdown toggle */}
                      <button
                        type="button"
                        disabled={saving || isAiGenerating}
                        onClick={(e) => { e.stopPropagation(); setShowPublishDropdown(v => !v) }}
                        className="px-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-all flex items-center"
                        aria-label="更多发布选项"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showPublishDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Dropdown menu */}
                    {showPublishDropdown && (
                      <div
                        className="absolute right-0 bottom-full mb-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Save as draft */}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => { setShowPublishDropdown(false); saveDraft('draft') }}
                          className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:scale-110 transition-transform">
                            <Save className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-slate-50 transition-colors">保存草稿</p>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">保存到草稿箱，稍后发布</p>
                          </div>
                        </button>

                        <div className="h-px bg-slate-100 dark:bg-slate-800 mx-2" />

                        {/* Smart scheduling */}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => { setShowPublishDropdown(false); handleSchedulePublish() }}
                          className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors group"
                        >
                          <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-650 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                            <Clock className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">智能排期</p>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">AI 推荐黄金发布时段</p>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Click-outside overlay to close */}
                    {showPublishDropdown && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowPublishDropdown(false)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 p-4 rounded-2xl shadow-sm mb-6 shrink-0">
          
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 min-w-[120px]">
              {activeView === 'day' && selectedDay
                ? `${viewYear}年 ${viewMonth + 1}月${selectedDay}日`
                : activeView === 'week'
                ? getWeekRangeLabel()
                : `${viewYear}年 ${MONTHS[viewMonth]}`}
            </h2>
            <div className="flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-800">
              <button onClick={handlePrev} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 border-r border-slate-200 dark:border-slate-700 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={handleNext} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDay(today.getDate()) }}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all bg-white dark:bg-slate-900"
            >
              今天 (Today)
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl">
              {(['all', 'pending', 'scheduled', 'done'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setActiveFilter(filter); setSelectedEventId(null) }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    activeFilter === filter
                      ? 'bg-white dark:bg-slate-750 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {filter === 'all' ? '全部' : filter === 'pending' ? '待审核' : filter === 'scheduled' ? '已排期' : '已发布'}
                </button>
              ))}
            </div>

            <div className="flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
              {(['month', 'week', 'day', 'list'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`px-3.5 py-1.5 text-xs font-bold transition-all ${
                    activeView === view
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 border-r border-slate-200 dark:border-slate-700 last:border-0'
                  }`}
                >
                  {view === 'month' ? '月' : view === 'week' ? '周' : view === 'day' ? '日' : '列表'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm overflow-hidden flex flex-col flex-1">
          {activeView !== 'day' && activeView !== 'list' && (
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-400 dark:text-slate-500 py-3 uppercase tracking-wider">
                  {d === '日' || d === '六' ? <span className="text-red-400">{d}</span> : d}
                </div>
              ))}
            </div>
          )}

          {activeView === 'month' && (
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800 flex-1 min-h-[400px]">
              {cells.map((day, idx) => {
                const dayEvents = day ? (eventsByDay[day] || []) : []
                const selected = day === selectedDay
                const todayCell = day ? isToday(day) : false

                return (
                  <div
                    key={idx}
                    onClick={() => day && setSelectedDay(day)}
                    className={`p-2 cursor-pointer transition-all flex flex-col justify-between group min-h-[90px] lg:min-h-[110px]
                      ${day ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20' : 'bg-slate-50/30 dark:bg-slate-950/20'}
                      ${selected ? 'bg-indigo-50/30 dark:bg-indigo-900/10 ring-2 ring-inset ring-indigo-500/55' : ''}`}
                  >
                    {day ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full
                            ${todayCell ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
                            {day}
                          </span>
                          {dayEvents.length > 2 && (
                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">+{dayEvents.length - 2}</span>
                          )}
                        </div>
                        
                        <div className="space-y-1 flex-1 flex flex-col justify-end overflow-hidden">
                          {dayEvents.length > 0 ? (
                            groupEventsByTitle(dayEvents).slice(0, 2).map((group) => {
                              const isGrouped = group.events.length > 1
                              const normPlatform = normalizePlatformLabel(group.platform)
                              const hasVideo = group.mediaUrls?.[0] && group.platform === 'IG' && group.title.includes('视频')
                              
                              if (!isGrouped) {
                                return (
                                  <div
                                    key={group.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedDay(day); setSelectedEventId(group.id) }}
                                    className={`text-[9px] font-bold px-1.5 py-1 rounded-lg border flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative ${
                                      PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                                    } ${group.status === 'pending' ? 'border-amber-300/40 bg-amber-500/5' : ''}`}
                                  >
                                    {hasVideo && <Video className="w-2.5 h-2.5 inline-block shrink-0 text-pink-500" />}
                                    {group.status === 'scheduled' && normPlatform === 'Google' && (
                                      <Shield className="w-2.5 h-2.5 text-blue-500 fill-blue-500/10 shrink-0" />
                                    )}
                                    <span>
                                      {!activeBrandId && `[${group.brandName}] `}
                                      {normPlatform} · {group.cleanTitle}
                                    </span>
                                  </div>
                                )
                              } else {
                                return (
                                  <div
                                    key={group.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedDay(day); setSelectedEventId(group.id) }}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg border bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-indigo-950/10 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-350 flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative"
                                  >
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      {group.events.map((e, idx) => {
                                        const p = normalizePlatformLabel(e.platform)
                                        return (
                                          <span key={idx} className="px-0.5 py-0 text-[7px] font-black rounded bg-slate-200/80 dark:bg-slate-700 text-slate-650 dark:text-slate-350 shrink-0">
                                            {p}
                                          </span>
                                        )
                                      })}
                                    </div>
                                    <span className="truncate">
                                      {!activeBrandId && `[${group.brandName}] `}
                                      {group.cleanTitle}
                                    </span>
                                  </div>
                                )
                              }
                            })
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeView === 'week' && (
            <div className="grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800 flex-1 min-h-[150px]">
              {getDaysForWeekView().map((d, idx) => {
                const isSelected = selectedDay === d.getDate() && viewMonth === d.getMonth() && viewYear === d.getFullYear()
                const todayCell = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
                const isCurrentMonth = d.getMonth() === viewMonth
                
                const dayEvents = filteredEvents.filter(ev => {
                  const evDate = new Date(ev.scheduledAt)
                  return evDate.getDate() === d.getDate() &&
                         evDate.getMonth() === d.getMonth() &&
                         evDate.getFullYear() === d.getFullYear()
                })

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setViewYear(d.getFullYear())
                      setViewMonth(d.getMonth())
                      setSelectedDay(d.getDate())
                    }}
                    className={`p-2 cursor-pointer transition-all flex flex-col justify-between group min-h-[200px]
                      ${isCurrentMonth ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20' : 'bg-slate-50/30 dark:bg-slate-950/20 opacity-60'}
                      ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-900/10 ring-2 ring-inset ring-indigo-500/55' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full
                        ${todayCell ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}>
                        {d.getDate()}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{WEEKDAYS[d.getDay()]}</span>
                    </div>
                    
                    <div className="space-y-1 flex-1 flex flex-col justify-end overflow-y-auto no-scrollbar">
                      {dayEvents.length > 0 ? (
                        groupEventsByTitle(dayEvents).map((group) => {
                          const isGrouped = group.events.length > 1
                          const normPlatform = normalizePlatformLabel(group.platform)
                          const hasVideo = group.mediaUrls?.[0] && group.platform === 'IG' && group.title.includes('视频')
                          
                          if (!isGrouped) {
                            return (
                              <div
                                key={group.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedDay(d.getDate()); setSelectedEventId(group.id) }}
                                className={`text-[9px] font-bold px-1.5 py-1 rounded-lg border flex items-center gap-1 truncate transition-transform hover:scale-[1.02] shadow-sm relative ${
                                  PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                                } ${group.status === 'pending' ? 'border-amber-300/40 bg-amber-500/5' : ''}`}
                              >
                                {hasVideo && <Video className="w-2.5 h-2.5 inline-block shrink-0 text-pink-500" />}
                                {group.status === 'scheduled' && normPlatform === 'Google' && (
                                  <Shield className="w-2.5 h-2.5 text-blue-500 fill-blue-500/10 shrink-0" />
                                )}
                                <span>
                                  {!activeBrandId && `[${group.brandName}] `}
                                  {normPlatform} · {group.cleanTitle}
                                </span>
                              </div>
                            )
                          } else {
                            return (
                              <div
                                key={group.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedDay(d.getDate()); setSelectedEventId(group.id) }}
                                className="text-[9px] font-bold px-1.5 py-1 rounded-lg border bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-indigo-950/10 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-350 flex flex-col gap-1 transition-transform hover:scale-[1.02] shadow-sm relative"
                              >
                                <div className="flex items-center gap-1 flex-wrap">
                                  {group.events.map((e, idx) => {
                                    const p = normalizePlatformLabel(e.platform)
                                    return (
                                      <span key={idx} className="px-1 py-0.2 text-[8px] font-black rounded bg-slate-200 dark:bg-slate-700 text-slate-650 dark:text-slate-350 shrink-0">
                                        {p}
                                      </span>
                                    )
                                  })}
                                </div>
                                <span className="truncate">
                                  {!activeBrandId && `[${group.brandName}] `}
                                  {group.cleanTitle}
                                </span>
                              </div>
                            )
                          }
                        })
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeView === 'day' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                      {viewYear}年 {viewMonth + 1}月{selectedDay}日 排期内容
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">当天共有 {selectedDayEvents.length} 条排期记录</p>
                  </div>
                </div>
                
                {selectedDayEvents.length === 0 ? (
                  <div className="py-12 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
                    <Clock className="w-10 h-10 mx-auto mb-3 opacity-20 text-slate-400" />
                    <p className="text-sm font-extrabold text-slate-750 dark:text-slate-350">当天无任何排期内容</p>
                    
                    {activeBrandId && (brandDetails?.accounts || []).length > 0 ? (
                      <div className="mt-4 max-w-sm mx-auto p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-800 text-left">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-widest block mb-2">渠道发布缺口检测：</span>
                        <div className="space-y-1.5">
                          {(brandDetails.accounts || []).map((acc: any) => {
                            const normPlatform = normalizePlatformLabel(acc.platformId)
                            return (
                              <div key={acc.id} className="flex items-center justify-between text-xs">
                                <span className="text-slate-650 dark:text-slate-450">{normPlatform} ({acc.handle || acc.displayName})</span>
                                <span className="text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-955/20 px-1.5 py-0.5 rounded-full border border-red-100 dark:border-red-900/30">
                                  ❌ 缺失发布内容
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : !activeBrandId ? (
                      <p className="text-xs text-slate-450 mt-2">当前显示合并品牌看板。选择左侧特定品牌，可检测该品牌的具体渠道发布缺口。</p>
                    ) : (
                      <p className="text-xs text-slate-450 mt-2">该品牌暂未绑定任何托管发布渠道。请先前往“品牌设置”连接渠道账号。</p>
                    )}

                          {activeBrandId && (
                      <button
                        onClick={() => {
                          alert('请在“发布”或“任务”视图新建排期草稿，发布后将在日历对应日期上显示。')
                        }}
                        className="mt-6 inline-flex items-center gap-2 bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all shadow-md active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                        <span>新建排期草稿</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedDayEvents.map((ev) => {
                      const normPlatform = normalizePlatformLabel(ev.platform)
                      const isExpired = expiredAccounts.some((acc: any) => acc.platformId === ev.platform)
                      return (
                        <div 
                          key={ev.id}
                          onClick={() => { setSelectedEventId(ev.id) }}
                          className={`p-4 bg-white dark:bg-slate-850/40 rounded-2xl border border-slate-100 dark:border-slate-800/80 hover:border-indigo-500/40 hover:shadow-md transition-all cursor-pointer flex gap-4 ${
                            selectedEventId === ev.id ? 'ring-2 ring-indigo-500/60' : ''
                          }`}
                        >
                          {ev.mediaUrls?.[0] && (
                            <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-slate-100 border border-slate-200/40">
                              <img src={ev.mediaUrls[0]} alt={ev.title} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2">
                                  {!activeBrandId && (
                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-150 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/30">
                                      {ev.brandName}
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                    PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}>
                                    {normPlatform}
                                  </span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold">{formatTime(ev.time)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {ev.status === 'done' && ev.type !== 'task' && (
                                    <a
                                      href={getPostOriginalUrl(ev.platform, ev.platformPostId, ev.postUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-650 hover:text-indigo-750 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                                    >
                                      <ExternalLink className="w-2.5 h-2.5" />
                                      <span>查看原文</span>
                                    </a>
                                  )}
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLORS[ev.status]}`}>
                                    {ev.status === 'done' ? (ev.type === 'task' ? '已完成' : '已发布') : ev.status === 'pending' ? '待审核' : '已排期'}
                                  </span>
                                </div>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed">
                                {!activeBrandId && `[${ev.brandName}] `}
                                {ev.title}
                              </h4>
                            </div>
                            
                            {isExpired && (
                              <div className="flex items-center gap-1 mt-2 text-[9px] font-bold text-amber-600 dark:text-amber-500">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>授权已失效</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'list' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-2">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">本月排期列表</h3>
                    <p className="text-xs text-slate-400 mt-1">共筛选出 {filteredEvents.length} 条排期记录</p>
                  </div>
                </div>

                {filteredEvents.length === 0 ? (
                  <div className="py-24 text-center text-slate-400 dark:text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-extrabold">暂无符合条件的排期记录</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredEvents.map((ev) => {
                      const normPlatform = normalizePlatformLabel(ev.platform)
                      const evDate = new Date(ev.scheduledAt)
                      const isSelected = selectedEventId === ev.id
                      return (
                        <div
                          key={ev.id}
                          onClick={() => {
                            setSelectedDay(evDate.getDate())
                            setSelectedEventId(ev.id)
                          }}
                          className={`py-3.5 px-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 cursor-pointer transition-colors flex items-center justify-between gap-4 ${
                            isSelected ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="flex flex-col items-center shrink-0 w-10 text-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">
                                {evDate.toLocaleDateString('zh-CN', { month: 'short' })}
                              </span>
                              <span className="text-sm font-black text-slate-700 dark:text-slate-300 mt-0.5">{evDate.getDate()}日</span>
                            </div>

                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
                              PLATFORM_COLORS[normPlatform] || 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {normPlatform}
                            </span>

                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[320px]">
                              {!activeBrandId && `[${ev.brandName}] `}
                              {ev.title.replace(`${normPlatform} · `, '')}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-slate-400 font-bold">{formatTime(ev.time)}</span>
                            {ev.status === 'done' && ev.type !== 'task' && (
                              <a
                                href={getPostOriginalUrl(ev.platform, ev.platformPostId, ev.postUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-650 hover:text-indigo-750 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                <span>查看原文</span>
                              </a>
                            )}
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${STATUS_COLORS[ev.status]}`}>
                              {ev.status === 'done' ? (ev.type === 'task' ? '已完成' : '已发布') : ev.status === 'pending' ? '待审核' : '已排期'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </main>

      {/* 3. Right Details Drawer / Stacked Platform Previews */}
      {isCreatingPost && previewModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-955/65 p-4 backdrop-blur-sm" onClick={() => setPreviewModalOpen(false)}>
          <div className="relative w-full max-w-4xl h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-805 dark:text-slate-100 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-indigo-500" />
                  多平台发布预览 ({selectedAccountIds.length} 个账号)
                </h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">实时预览不同平台的内容渲染效果</p>
              </div>
              <button onClick={() => setPreviewModalOpen(false)} className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-900 scrollbar-thin">
            {selectedAccountIds.length === 0 ? (
              <div className="py-20 text-center text-slate-400 dark:text-slate-500">
                <Eye className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-extrabold">请选择发布账号以查看预览</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
                {selectedAccountIds.map((accId) => {
                  const account = accountOptions.find((a) => a.id === accId)
                  if (!account) return null
                  const platform = account.platformId.toLowerCase()
                  
                  const isGenerating = draftStatuses[accId] === 'generating'
                  const currentCaption = draftCaptions[accId] !== undefined ? draftCaptions[accId] : (caption || '【AI Copywriter will generate content here】')
                  const currentHashtagsString = draftHashtags[accId] !== undefined ? draftHashtags[accId] : hashtags
                  const currentHashtagsArray = parseTags(currentHashtagsString)

                  return (
                    <div
                      key={accId}
                      onClick={() => {
                        if (!isGenerating) {
                          setEditingAccountId(accId)
                        }
                      }}
                      className={`space-y-4 border-b border-slate-100 dark:border-slate-850 pb-6 last:border-0 last:pb-0 transition-all ${
                        !isGenerating ? 'cursor-pointer hover:bg-slate-100/30 dark:hover:bg-slate-800/10 p-2 rounded-2xl' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-355">
                          {platform.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">({account.displayName || account.handle})</span>
                      </div>

                      <div className="relative" onClick={(e) => {
                        if (e.target instanceof HTMLButtonElement || e.target instanceof SVGElement || (e.target instanceof HTMLElement && e.target.closest('button'))) {
                          e.stopPropagation()
                        }
                      }}>
                        <div className={`${isGenerating ? 'blur-[2px] opacity-70 pointer-events-none' : ''} transition-all duration-300`}>
                          {platform === 'instagram' && (
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
                                    <p className="text-[10px] font-bold leading-tight">{account.displayName || account.handle || brandDetails?.name || 'Your Brand'}</p>
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
                                  <Bookmark className="w-4.5 h-4.5 text-slate-800 dark:text-slate-200 hover:text-slate-500 transition-colors cursor-pointer" />
                                </div>
                                <p className="mt-2 text-[9px] font-bold">1,245 likes</p>
                                <div className="mt-1 space-y-1 text-[10px]">
                                  <p className="leading-relaxed text-left">
                                    <span className="font-bold mr-1">{account.handle || brandDetails?.name || 'brand'}</span>
                                    <span className="whitespace-pre-wrap">{currentCaption}</span>
                                  </p>
                                  {currentHashtagsArray.length > 0 && (
                                    <p className="text-blue-600 dark:text-blue-400 font-medium text-left">
                                      {currentHashtagsArray.map(tag => `#${tag}`).join(' ')}
                                    </p>
                                  )}
                                  <p className="text-slate-400 dark:text-slate-500 text-[9px] mt-1 cursor-pointer hover:underline text-left">查看全部 12 条评论</p>
                                  <p className="text-slate-400 dark:text-slate-500 text-[8px] tracking-wider uppercase mt-1 text-left">2小时前</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {(platform === 'red' || platform === 'xiaohongshu' || platform === 'xhs') && (
                            <div className="relative mx-auto w-full max-w-[310px] overflow-hidden rounded-[32px] border-[10px] border-slate-900 bg-white shadow-2xl dark:border-slate-950 dark:bg-[#0a0a0a] text-black dark:text-white">
                              {/* XHS Status Bar */}
                              <div className="flex items-center justify-between bg-white dark:bg-[#0a0a0a] px-3.5 pt-2 pb-0.5">
                                <span className="text-[9px] font-black text-slate-900 dark:text-white">2:11</span>
                                <div className="flex items-center gap-1.5">
                                  <div className="flex items-end gap-[2px] h-2.5">
                                    {[2,3,4,5].map(h => <div key={h} className="w-[2px] bg-slate-900 dark:bg-white rounded-sm" style={{height: `${h}px`}} />)}
                                  </div>
                                  <div className="w-3.5 h-2.5 rounded-sm border border-slate-900 dark:border-white relative">
                                    <div className="absolute left-0.5 top-0.5 bottom-0.5 right-1 bg-slate-900 dark:bg-white rounded-sm" />
                                    <div className="absolute -right-0.5 top-[3px] bottom-[3px] w-0.5 bg-slate-900 dark:bg-white rounded-r-sm" />
                                  </div>
                                </div>
                              </div>

                              {/* XHS Nav Bar */}
                              <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-[#0a0a0a]">
                                <button className="text-slate-700 dark:text-slate-300 text-xs font-bold">&lt;</button>
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-rose-400 to-orange-300 overflow-hidden border-2 border-white dark:border-slate-800 shadow-sm">
                                    <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                                  </div>
                                  <p className="text-[10px] font-black text-slate-900 dark:text-white tracking-tight">{account.displayName || brandDetails?.name || '你的品牌'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button className="rounded-full border border-[#ff2442] px-2.5 py-0.5 text-[9px] font-black text-[#ff2442] hover:bg-[#ff2442] hover:text-white transition-all">关注</button>
                                  <button className="text-slate-500 dark:text-slate-400">
                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                                  </button>
                                </div>
                              </div>

                              {/* XHS Media */}
                              <div className="relative aspect-[3/4] w-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden">
                                {attachedMedia.length > 0 ? (
                                  <>
                                    {isVideoUrl(attachedMedia[previewMediaIndex % attachedMedia.length]?.url) ? (
                                      <video src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                                    ) : (
                                      <img src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                                    )}
                                    {/* 实况 badge top-left */}
                                    <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded-full px-2 py-0.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                      <span className="text-[8.5px] font-black text-white">实况</span>
                                      <svg viewBox="0 0 12 12" className="w-2 h-2 fill-white/70"><path d="M4.5 3l4.5 3-4.5 3V3z"/></svg>
                                    </div>
                                    {/* Photo count top-right */}
                                    {attachedMedia.length > 1 && (
                                      <div className="absolute top-2.5 right-2.5 z-10 bg-black/40 backdrop-blur-sm rounded-full px-2 py-0.5">
                                        <span className="text-[8.5px] font-black text-white">{(previewMediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}</span>
                                      </div>
                                    )}
                                    {/* Dot indicators bottom-center */}
                                    {attachedMedia.length > 1 && (
                                      <>
                                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
                                          {attachedMedia.map((_, dotIdx) => (
                                            <span
                                              key={dotIdx}
                                              className={`rounded-full transition-all duration-300 ${
                                                (previewMediaIndex % attachedMedia.length) === dotIdx
                                                  ? 'h-1.5 w-3 bg-[#ff2442]'
                                                  : 'h-1 w-1 bg-white/50'
                                              }`}
                                            />
                                          ))}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setPreviewMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1)) }}
                                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/25 hover:bg-black/50 text-white rounded-full p-1 transition-colors z-10"
                                        >
                                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-white"><path d="M10 3L5 8l5 5V3z"/></svg>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setPreviewMediaIndex(prev => (prev + 1) % attachedMedia.length) }}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/25 hover:bg-black/50 text-white rounded-full p-1 transition-colors z-10"
                                        >
                                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-white"><path d="M6 3l5 5-5 5V3z"/></svg>
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
                              <div className="bg-white dark:bg-[#0a0a0a] px-3.5 pt-3 pb-2">
                                {(() => {
                                  const lines = currentCaption.split('\n');
                                  const titleLine = lines[0] || '';
                                  const bodyContent = lines.slice(1).join('\n');
                                  return (
                                    <div className="max-h-28 overflow-y-auto scrollbar-thin">
                                      {titleLine && (
                                        <h4 className="text-[12.5px] font-black leading-snug text-slate-900 dark:text-white text-left tracking-wide mb-1.5">
                                          {titleLine}
                                        </h4>
                                      )}
                                      {bodyContent.trim() ? (
                                        <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-slate-600 dark:text-slate-400 text-left">
                                          {bodyContent}
                                        </p>
                                      ) : (
                                        !titleLine && (
                                          <p className="text-[10px] text-slate-400 italic">暂无内容描述</p>
                                        )
                                      )}
                                      {currentHashtagsArray.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5">
                                          {currentHashtagsArray.map((tag) => (
                                            <span key={tag} className="text-[9.5px] text-[#1a5f9e] dark:text-[#5a9fd4] font-bold">#{tag}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* XHS Footer */}
                                <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                                  <div className="flex-1 flex items-center bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1.5 gap-1">
                                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-slate-400 stroke-[1.5]"><path d="M2 14l3-1h9V3H2v11z"/></svg>
                                    <span className="text-[9px] text-slate-400">说点什么...</span>
                                  </div>
                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <div className="flex items-center gap-0.5 cursor-pointer">
                                      <Heart className="w-3.5 h-3.5 text-slate-400 hover:text-[#ff2442] hover:fill-[#ff2442] transition-colors" />
                                      <span className="text-[9px] font-bold text-slate-500">24</span>
                                    </div>
                                    <div className="flex items-center gap-0.5 cursor-pointer">
                                      <Star className="w-3.5 h-3.5 text-slate-400 hover:text-yellow-500 hover:fill-yellow-500 transition-colors" />
                                      <span className="text-[9px] font-bold text-slate-500">14</span>
                                    </div>
                                    <div className="flex items-center gap-0.5 cursor-pointer">
                                      <MessageCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
                                      <span className="text-[9px] font-bold text-slate-500">10</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}


                          {platform === 'facebook' && (
                            <div className="mx-auto w-full max-w-[320px] rounded-xl bg-white shadow-lg dark:bg-[#242526] text-black dark:text-white border border-slate-200 dark:border-slate-700 overflow-hidden">
                              {/* FB Header */}
                              <div className="flex items-start justify-between p-3 pb-2">
                                <div className="flex items-center gap-2">
                                  <div className="relative h-9 w-9 rounded-full bg-slate-200 overflow-hidden border-2 border-white dark:border-slate-700 shadow-sm shrink-0">
                                    <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover" alt="" />
                                    {/* Online green dot */}
                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-[1.5px] border-white dark:border-[#242526]" />
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-slate-900 dark:text-white text-left leading-tight">{account.displayName || account.handle || brandDetails?.name || 'Your Brand'}</p>
                                    <p className="text-[8.5px] text-slate-500 flex items-center gap-1 mt-0.5">
                                      <span>1天</span>
                                      <span>·</span>
                                      <Globe className="w-2.5 h-2.5 text-slate-400" />
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <MoreVertical className="h-4 w-4 text-slate-500 cursor-pointer" />
                                  <button className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M2 4h12v1.5H2zm0 3h12v1.5H2zm0 3h8v1.5H2z"/></svg>
                                  </button>
                                </div>
                              </div>

                              {/* FB Text */}
                              <div className="px-3 pb-2 text-[11px] leading-relaxed text-slate-800 dark:text-slate-200 text-left">
                                <p className="whitespace-pre-wrap">{currentCaption}</p>
                                {currentHashtagsArray.length > 0 && (
                                  <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium text-[10px]">
                                    {currentHashtagsArray.map(tag => `#${tag}`).join(' ')}
                                  </p>
                                )}
                              </div>

                              {/* FB Image — portrait 4:5 like the screenshot */}
                              <div className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-900" style={{aspectRatio: '4/5'}}>
                                {attachedMedia.length === 0 ? (
                                  <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-400">
                                    <ImageIcon className="h-8 w-8 text-slate-300" />
                                    <span className="text-[10px] font-semibold">暂无媒体文件</span>
                                  </div>
                                ) : (
                                  <>
                                    {isVideoUrl(attachedMedia[previewMediaIndex % attachedMedia.length]?.url) ? (
                                      <video src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" controls muted />
                                    ) : (
                                      <img src={attachedMedia[previewMediaIndex % attachedMedia.length]?.url} className="h-full w-full object-cover" alt="" />
                                    )}
                                    {/* Gift button bottom-left overlaid on image */}
                                    <div className="absolute bottom-3 left-3 z-10">
                                      <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1.5 text-white">
                                        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-white"><path d="M8 1a2 2 0 00-2 2H2v2h1l1 8h8l1-8h1V3h-4a2 2 0 00-2-2zM6 3a2 2 0 014 0H6zm-1 4h6l-.75 6H5.75L5 7z"/></svg>
                                        <span className="text-[9px] font-black">送礼物</span>
                                      </div>
                                    </div>
                                    {/* Image count */}
                                    {attachedMedia.length > 1 && (
                                      <>
                                        <div className="absolute top-2.5 right-2.5 z-10 bg-black/50 rounded-full px-1.5 py-0.5">
                                          <span className="text-[8px] font-bold text-white">{(previewMediaIndex % attachedMedia.length) + 1}/{attachedMedia.length}</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setPreviewMediaIndex(prev => (prev > 0 ? prev - 1 : attachedMedia.length - 1)) }}
                                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/35 hover:bg-black/55 text-white rounded-full p-1 transition-colors z-10"
                                        >
                                          <ChevronLeft className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setPreviewMediaIndex(prev => (prev + 1) % attachedMedia.length) }}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/35 hover:bg-black/55 text-white rounded-full p-1 transition-colors z-10"
                                        >
                                          <ChevronRight className="w-3 h-3" />
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>

                              {/* FB Reactions count */}
                              <div className="px-3 pt-2 pb-1 flex items-center justify-between text-[9.5px] text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-1">
                                  <div className="flex -space-x-1">
                                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#1877f2] text-white text-[7px] shadow-sm">👍</span>
                                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#f02849] text-white text-[7px] shadow-sm">❤️</span>
                                  </div>
                                  <span className="ml-1 font-medium text-slate-600 dark:text-slate-300">82</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="cursor-pointer hover:underline">9条评论</span>
                                </div>
                              </div>

                              {/* FB divider */}
                              <div className="mx-3 border-t border-slate-200 dark:border-slate-700" />

                              {/* FB Actions */}
                              <div className="flex items-center justify-around py-1 px-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                                <button className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg flex-1 justify-center transition-colors">
                                  <ThumbsUp className="w-3.5 h-3.5" /> <span>赞</span>
                                </button>
                                <button className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg flex-1 justify-center transition-colors">
                                  <MessageCircle className="w-3.5 h-3.5" /> <span>评论</span>
                                </button>
                                <button className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg flex-1 justify-center transition-colors">
                                  <Share2 className="w-3.5 h-3.5" /> <span>分享</span>
                                </button>
                              </div>
                            </div>
                          )}


                          {platform === 'tiktok' && (
                            <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-[24px] border-[8px] border-slate-900 bg-black shadow-lg dark:border-slate-955 text-white">
                              {/* TikTok Media Panel */}
                              <div className="relative aspect-[9/16] w-full bg-slate-955 flex items-center justify-center">
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

                                {/* TikTok Right Sidebar Overlay */}
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
                                  <p className="font-bold text-xs">@{account.handle || brandDetails?.name || 'brand_tiktok'}</p>
                                  <p className="line-clamp-2 leading-relaxed text-white/90 whitespace-pre-wrap">{currentCaption}</p>
                                  {currentHashtagsArray.length > 0 && (
                                    <div className="flex gap-1 flex-wrap font-bold font-mono">
                                      {currentHashtagsArray.map((tag) => (
                                        <span key={tag}>#{tag}</span>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5 overflow-hidden bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full w-fit max-w-[140px]">
                                    <span className="text-[8px] animate-pulse">🎵</span>
                                    <span className="text-[8px] overflow-hidden whitespace-nowrap text-ellipsis">Original Sound - @{account.handle || brandDetails?.name || 'brand'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {(platform === 'google_business' || platform === 'google') && (
                            <div className="mx-auto w-full max-w-[340px] rounded-xl border border-slate-205 bg-white p-3 shadow-lg dark:border-slate-888 dark:bg-slate-905 text-black dark:text-white">
                              {/* GBP Header */}
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm shrink-0">
                                  <Store className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-black leading-tight text-left">{brandDetails?.name || 'Your Business Name'}</p>
                                  <p className="text-[8px] text-slate-405 mt-0.5 text-left">Google Business · Updated just now</p>
                                </div>
                              </div>

                              {/* GBP Cover image */}
                              <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-808 dark:bg-slate-955 relative">
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
                                <p className="whitespace-pre-wrap">{currentCaption}</p>
                                {currentHashtagsArray.length > 0 && (
                                  <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">
                                    {currentHashtagsArray.map(tag => `#${tag}`).join(' ')}
                                  </p>
                                )}
                              </div>

                              {/* GBP CTA Button */}
                              <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                                <button className="w-full rounded-md bg-[#1a73e8] hover:bg-[#1557b0] py-2 text-[10px] font-bold text-white transition-colors tracking-wide uppercase">
                                  了解更多 (Learn More)
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {isGenerating && (
                          <div className={`absolute inset-0 bg-slate-900/20 dark:bg-slate-955/40 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 ${
                            ['instagram', 'red', 'tiktok'].includes(platform) ? 'rounded-[24px]' : 'rounded-xl'
                          }`}>
                            <div className="bg-white/95 dark:bg-slate-900/95 p-4 rounded-2xl shadow-xl flex flex-col items-center gap-2 border border-slate-100 dark:border-slate-800">
                              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">AI Copywriter 正在创作中...</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Inline Platform-specific editing inputs removed. Review Post Modal is used instead. */}
                    </div>
                  )
                })}
              </div>
            )}
          </div></div></div>
      ) : (
        !isCreatingPost && selectedDay && (
          <aside className="w-full lg:w-[380px] bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 flex flex-col shrink-0 shadow-2xl animate-in slide-in-from-right duration-350 z-20">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                {viewMonth + 1}月{selectedDay}日 排期详情
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">查看及配置发布细节</p>
            </div>
            <button
              onClick={() => { setSelectedDay(null); setSelectedEventId(null) }}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
            {selectedDayEvents.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-extrabold">当天无排期内容</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDayEvents.length > 1 && (
                  <div className="flex items-center gap-1.5 p-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl overflow-x-auto">
                    {selectedDayEvents.map(e => (
                      <button
                        key={e.id}
                        onClick={() => setSelectedEventId(e.id)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black whitespace-nowrap transition-all ${
                          (selectedEventId === e.id || (!selectedEventId && selectedDayEvents[0].id === e.id))
                            ? 'bg-white dark:bg-slate-705 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-100 dark:border-slate-650'
                            : 'text-slate-400 hover:text-slate-700 dark:text-slate-500'
                        }`}
                      >
                        {normalizePlatformLabel(e.platform)}
                      </button>
                    ))}
                  </div>
                )}

                {activeDrawerEvent && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-500 dark:text-slate-400">{formatTime(activeDrawerEvent.time)}</span>
                        <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border ${STATUS_COLORS[activeDrawerEvent.status]}`}>
                          {activeDrawerEvent.status === 'done' ? (activeDrawerEvent.type === 'task' ? '已完成' : '已发布') : activeDrawerEvent.status === 'pending' ? '待审核' : '已排期'}
                        </span>
                        {activeDrawerEvent.status === 'done' && activeDrawerEvent.type !== 'task' && (
                          <a
                            href={getPostOriginalUrl(activeDrawerEvent.platform, activeDrawerEvent.platformPostId, activeDrawerEvent.postUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-650 hover:text-indigo-750 dark:text-indigo-400 dark:hover:text-indigo-300 ml-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>打开发布原文</span>
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">{activeDrawerEvent.brandName}</span>
                    </div>

                    {/* Comments & Replies section for published events - Primary card */}
                    {activeDrawerEvent.status === 'done' && activeDrawerEvent.type !== 'task' && (
                      <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-850 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                            <span>[{normalizePlatformLabel(activeDrawerEvent.platform)}] 帖文评论与回复</span>
                          </h4>
                          <span className="text-[9px] font-black text-indigo-650 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded-full">
                            {activeEventComments.length} 条评论
                          </span>
                        </div>
                        
                        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1 no-scrollbar">
                          {activeEventComments.length > 0 ? (
                            activeEventComments.map(comment => (
                              <div key={comment.id} className="space-y-2 border-b border-slate-100/50 dark:border-slate-800/40 pb-3 last:border-0 last:pb-0">
                                <div className="flex items-start gap-2">
                                  <img src={comment.avatar} className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" alt="" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-slate-700 dark:text-slate-350">{comment.author}</span>
                                      <span className="text-[9px] text-slate-450">{comment.time}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{comment.content}</p>
                                  </div>
                                </div>

                                {comment.reply ? (
                                  <div className="ml-9 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-black text-indigo-650 dark:text-indigo-400">商家回复 (Owner)</span>
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
                                        className="flex-1 h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-850 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-150"
                                      />
                                      <button
                                        onClick={() => handleSendManualReply(activeDrawerEvent.id, comment.id)}
                                        className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm shrink-0 transition-colors"
                                      >
                                        回复
                                      </button>
                                      <button
                                        onClick={() => handleGenerateAiReply(activeDrawerEvent.id, comment.id, comment.content)}
                                        disabled={comment.isGeneratingReply}
                                        className="h-8 px-2 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 flex items-center justify-center gap-1 transition-all"
                                        title="AI 智能生成回复"
                                      >
                                        <Sparkles className={`w-3.5 h-3.5 ${comment.isGeneratingReply ? 'animate-spin' : ''}`} />
                                        <span>{comment.isGeneratingReply ? '生成中' : 'AI'}</span>
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
                    )}

                    {activeDrawerEvent.mediaUrls && activeDrawerEvent.mediaUrls[0] && (
                      <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-slate-150 border border-slate-200/50 dark:border-slate-800 shadow-sm group">
                        <img
                          src={activeDrawerEvent.mediaUrls[0]}
                          alt={activeDrawerEvent.title}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                        />
                        {activeDrawerEvent.title.includes('视频') && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-white/95 text-pink-600 flex items-center justify-center shadow-lg">
                              <Video className="w-5 h-5 fill-pink-600/10" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl">
                      <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">文案预览</h4>
                      <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
                        {activeDrawerEvent.title}
                      </p>
                    </div>

                    {/* Real DB Click/ROI conversion statistics badges */}
                    {activeDrawerEvent.status === 'done' && activeDrawerEvent.type !== 'task' && (
                      <div className="space-y-3">
                        <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/15 rounded-2xl">
                          <h4 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 fill-emerald-500/15" />
                            <span>引流分析 & Click 追踪</span>
                          </h4>
                          
                          <div className="grid grid-cols-2 gap-3 text-center">
                            <div className="bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-700/40 p-2.5 rounded-xl shadow-sm">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">点击量</p>
                              <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5">{activeDrawerEvent.clicks ?? 0} 次</p>
                            </div>
                            <div className="bg-white dark:bg-slate-850 border border-slate-100 dark:border-slate-700/40 p-2.5 rounded-xl shadow-sm">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">引流到店 ROI</p>
                              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">${activeDrawerEvent.roi ?? 0}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Real Temporal Protection Indicator for scheduled posts */}
                    {activeDrawerEvent.status === 'scheduled' && activeDrawerEvent.type !== 'task' && (
                      <div className="p-4 bg-indigo-500/5 dark:bg-indigo-950/10 border border-indigo-500/15 rounded-2xl">
                        <h4 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Temporal 托管与重试调度</span>
                        </h4>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          <span>服务托管中 · 重试事务就绪</span>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">该排期受指数退避及重调度机制保护，若因网络抖动推送失败，Temporal 调度器将自动重试。</p>
                      </div>
                    )}

                    {/* AI Actions Section: Copywriter & Designer */}
                    {activeDrawerEvent.status !== 'done' && activeDrawerEvent.type !== 'task' && (
                      <div className="space-y-3 pt-2">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-550">内容创意 / 生成指令 (AI Idea & Prompt)</label>
                          <textarea
                            value={contentIdea}
                            onChange={(e) => setContentIdea(e.target.value)}
                            placeholder="输入内容创意或AI生成指令，例如：‘介绍我们的新菜单，突出新鲜食材和南洋风味’，AI将自动按所选平台特性重构文案..."
                            className="min-h-[50px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-550">创意 hooks (Creative Hooks)</label>
                          <textarea
                            value={creativeHooks}
                            onChange={(e) => setCreativeHooks(e.target.value)}
                            placeholder="输入吸睛创意 hooks / 写作思路 / 爆款切入点..."
                            className="min-h-[50px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>

                        <div className="flex gap-2.5">
                          <button
                            onClick={() => handleAIWrite(activeDrawerEvent.brandId, activeDrawerEvent.id)}
                            disabled={triggeringId === activeDrawerEvent.id}
                            className="flex-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 dark:border-indigo-900/40 dark:text-indigo-400 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 font-black text-xs transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            <span>{triggeringId === activeDrawerEvent.id ? '正在重写...' : 'AI 创作重构'}</span>
                          </button>

                          {activeDrawerEvent.mediaAssetId && (
                            <button
                              onClick={() => setShowDesignerPanel(prev => prev === activeDrawerEvent.id ? null : activeDrawerEvent.id)}
                              className="flex-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 dark:bg-purple-950/20 dark:hover:bg-purple-900/30 dark:border-purple-900/40 dark:text-purple-400 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 font-black text-xs transition-all active:scale-[0.98]"
                            >
                              <ImageIcon className="w-4 h-4 text-purple-500" />
                              <span>AI 图像设计</span>
                            </button>
                          )}
                        </div>

                        {showDesignerPanel === activeDrawerEvent.id && activeDrawerEvent.mediaAssetId && (
                          <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl space-y-3.5 animate-in slide-in-from-top duration-300">
                            <div>
                              <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-purple-500" />
                                <span>Designer AI / VideoDirector 助手</span>
                              </h4>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                                Designer 负责修图；VideoDirector 负责图生视频。可基于 1 张或多张图片，结合提示词与创意 hooks 自动完善 prompt 后生成视频。
                              </p>
                            </div>

                            <textarea
                              rows={2}
                              value={designerPromptText}
                              onChange={(e) => setDesignerPromptText(e.target.value)}
                              placeholder="输入您的修图/剪辑指令..."
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                            />

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAIDesign(activeDrawerEvent.id, activeDrawerEvent.mediaAssetId!, 'design')}
                                disabled={designerProcessing || videoProcessing}
                                className="flex-1 bg-purple-650 hover:bg-purple-700 text-white py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs shadow-sm transition-all active:scale-[0.97] disabled:opacity-50"
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>{designerProcessing ? '修图中...' : 'AI 修图'}</span>
                              </button>

                              <button
                                onClick={() => handleAIDesign(activeDrawerEvent.id, activeDrawerEvent.mediaAssetId!, 'video')}
                                disabled={designerProcessing || videoProcessing}
                                className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-700 text-white py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 font-bold text-xs shadow-sm transition-all active:scale-[0.97] disabled:opacity-50"
                              >
                                <Video className="w-3.5 h-3.5" />
                                <span>{videoProcessing ? '生成中...' : 'VideoDirector 图生视频'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>

          {selectedDayEvents.some(e => e.status === 'pending') && (
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 shrink-0">
              <button
                onClick={() => alert('已一键审核并排期当天所有待审批任务！')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black text-xs shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all"
              >
                发布全部待审核任务
              </button>
            </div>
          )}
        </aside>
      ) )}

      {/* Lightbox Preview Modal */}
      {lightboxIndex !== null && filteredAssets[lightboxIndex] && (() => {
        const asset = filteredAssets[lightboxIndex]
        const isVid = asset.mimeType?.startsWith('video/') || isVideoUrl(asset.url)
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
                  <video src={asset.url} controls autoPlay className="max-h-[70vh] max-w-[85vw] object-contain rounded-xl" />
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
                onClick={() => handleToggleAsset(asset)}
                className={`px-6 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 ${
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

      {/* Review Post Modal */}
      {editingAccountId && (() => {
        const account = accountOptions.find(a => a.id === editingAccountId)
        if (!account) return null
        const currentCap = draftCaptions[editingAccountId] !== undefined ? draftCaptions[editingAccountId] : (caption || '')
        const currentHash = draftHashtags[editingAccountId] !== undefined ? draftHashtags[editingAccountId] : hashtags
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-955/60 p-4 backdrop-blur-sm" onClick={() => setEditingAccountId(null)}>
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

      {/* Publish Option Selection Modal */}
      {showPublishOptionModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-955/60 p-4 backdrop-blur-sm"
          onClick={() => setShowPublishOptionModal(false)}
        >
          <div 
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-500" />
                选择发布模式
              </h3>
              <button 
                onClick={() => setShowPublishOptionModal(false)} 
                className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Options Selection */}
            <div className="mt-5 space-y-4">
              {/* Option 1: Save as Draft */}
              <button
                type="button"
                onClick={() => saveDraft('draft')}
                disabled={saving}
                className="w-full text-left p-4 rounded-2xl border border-slate-150 dark:border-slate-800 hover:border-slate-500 dark:hover:border-slate-500 hover:bg-slate-50/20 dark:hover:bg-slate-800/20 transition-all flex items-start gap-4 group active:scale-[0.99] disabled:opacity-50"
              >
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 group-hover:scale-110 transition-transform">
                  <Save className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-150 group-hover:text-slate-900 dark:group-hover:text-slate-50 transition-colors">
                    保存草稿 (Save as Draft)
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                    保存到草稿箱，随时在发布日历中查看和安排发布时间。
                  </p>
                </div>
              </button>

              {/* Option 2: Smart Scheduling */}
              <button
                type="button"
                onClick={handleSchedulePublish}
                disabled={saving}
                className="w-full text-left p-4 rounded-2xl border border-slate-150 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-850 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 transition-all flex items-start gap-4 group active:scale-[0.99] disabled:opacity-50"
              >
                <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-950/50 text-indigo-650 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-150 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    智能排期 (Smart Scheduling)
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                    使用 AI 推荐的黄金时段进行自动排程发布，可在发布日历中编辑调整。
                  </p>
                </div>
              </button>
            </div>

            {/* Footer with Close Button */}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowPublishOptionModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
