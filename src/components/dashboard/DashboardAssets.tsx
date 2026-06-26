'use client'
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import {
  Search,
  Upload,
  Image as ImageIcon,
  Video,
  Check,
  CheckSquare,
  Sparkles,
  X,
  Grid,
  Clock,
  Archive,
  TrendingUp,
  Bot,
  Plus,
  Calendar,
  BarChart2,
  AlertTriangle,
  Play,
  RefreshCw,
  Trash2,
  Maximize2,
  Send,
  ChevronRight,
  Eye,
  MoreVertical,
  FileText,
  ChevronLeft,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  ThumbsUp,
  Star,
  Globe,
  Store
} from 'lucide-react'

// Category definitions
const CATEGORY_META = [
  { id: 'all', label: '全部', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  { id: 'food', label: '产品', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
  { id: 'interior', label: '店内环境', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
  { id: 'event', label: '活动/节日', color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
  { id: 'review', label: '客户反馈', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
  { id: 'raw', label: '未分类', color: 'text-slate-400 bg-slate-50 dark:bg-slate-800/20' },
]

const GRADIENT_PLACEHOLDERS = [
  'from-orange-100 to-rose-100 dark:from-orange-900/30 dark:to-rose-900/30',
  'from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30',
  'from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30',
  'from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30',
  'from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30',
]

interface DashboardAsset {
  id: string
  brandId: string
  brandName: string
  url: string
  filename: string | null
  mimeType: string
  aiTags: string[]
  aiCategory: string | null
  aiCaption: string | null
  aiReady: boolean
  usedCount: number
  lastUsedAt: string | null
  sourceType: string
  createdAt: string
}

function toCategory(asset: DashboardAsset) {
  const cat = asset.aiCategory || 'raw'
  if (cat === 'food' || cat === '菜品' || cat === '产品') return 'food'
  if (cat === 'interior' || cat === '环境' || cat === '店内环境') return 'interior'
  if (cat === 'event' || cat === '活动' || cat === '活动/节日') return 'event'
  if (cat === 'review' || cat === '反馈' || cat === '客户反馈') return 'review'
  return cat
}

function isPreviewable(asset: DashboardAsset) {
  const url = asset.url || ''
  return /^https?:\/\//.test(url) || url.startsWith('/')
}

function relativeDate(value: string) {
  const date = new Date(value)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / (24 * 60 * 60 * 1000))

  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays}天前`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

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

interface DashboardAssetsProps {
  brandId?: string
}

export default function DashboardAssets({ brandId }: DashboardAssetsProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [viewFilter, setViewFilter] = useState<'all' | 'recent' | 'unused' | 'high_perf' | 'ai_pending' | 'images' | 'videos' | 'scheduled'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [isBatchSelectMode, setIsBatchSelectMode] = useState(false)
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)

  useEffect(() => {
    setIsBatchSelectMode(selected.length > 0)
  }, [selected.length])
  
  const [assets, setAssets] = useState<DashboardAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [targetFolder, setTargetFolder] = useState('素材库')
  const [moveFolder, setMoveFolder] = useState('')
  const [folders, setFolders] = useState<string[]>(['素材库', '产品', '环境', '活动'])
  const [selectedFolder, setSelectedFolder] = useState<string>('all')

  // Image Lightbox Preview State
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  // Designer AI Chat State
  const [designerPromptText, setDesignerPromptText] = useState('')
  const [chatHistory, setChatHistory] = useState<Record<string, Array<{ sender: 'user' | 'ai'; text: string; newAssetId?: string; newAssetUrl?: string }>>>({})
  const [aiProcessing, setAiProcessing] = useState(false)

  // Drag and Drop folder categorization state
  const [draggingIds, setDraggingIds] = useState<string[] | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  // Drag/Swipe selection tracking refs
  const isDragSelecting = useRef(false)
  const dragSelectionMode = useRef<'select' | 'deselect'>('select')
  const dragVisitedIds = useRef<Set<string>>(new Set())
  const hasToggledThisInteraction = useRef(false)
  
  // Selection mode states & refs
  const [isSelectingState, setIsSelectingState] = useState(false)
  const lastSelectedId = useRef<string | null>(null)

  // Schedule / Create Task Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleTargetIds, setScheduleTargetIds] = useState<string[]>([])
  const [scheduleCaption, setScheduleCaption] = useState('')
  const [scheduleHashtags, setScheduleHashtags] = useState('')
  const [scheduleSelectedAccountIds, setScheduleSelectedAccountIds] = useState<string[]>([])
  const [scheduleScheduledAt, setScheduleScheduledAt] = useState('')
  const [scheduleAgentNote, setScheduleAgentNote] = useState('')
  const [brandAccounts, setBrandAccounts] = useState<any[]>([])
  const [creatingTask, setCreatingTask] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState('instagram')
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0)

  const brandName = useMemo(() => {
    return assets[0]?.brandName || 'Your Brand'
  }, [assets])

  const activeAccount = useMemo(() => {
    const accId = scheduleSelectedAccountIds[0]
    return brandAccounts.find(a => a.id === accId) || null
  }, [brandAccounts, scheduleSelectedAccountIds])

  const attachedMedia = useMemo(() => {
    return scheduleTargetIds
      .map((id) => {
        const asset = assets.find((a) => a.id === id)
        if (!asset) return null
        return {
          id: asset.id,
          url: asset.url,
          type: isVideoUrl(asset.url) ? 'video' : 'image',
        }
      })
      .filter(Boolean) as { id: string; url: string; type: string }[]
  }, [scheduleTargetIds, assets])

  const loadFolders = useCallback(async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/brands/${brandId}/folders`)
      if (res.ok) {
        const data = await res.json()
        const folderNames = (data.folders || []).map((f: { name: string }) => f.name)
        setFolders(['素材库', ...folderNames])
      }
    } catch (err) {
      console.error('Failed to load folders:', err)
    }
  }, [brandId])

  const handleCreateFolder = async () => {
    if (!brandId) return
    const name = window.prompt('请输入新文件夹名称：')
    if (!name || !name.trim()) return

    const folderName = name.trim()
    if (folders.includes(folderName)) {
      alert('文件夹已存在')
      return
    }

    try {
      const res = await fetch(`/api/brands/${brandId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '创建文件夹失败')
      }
      await loadFolders()
      setSelectedFolder(folderName)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '创建文件夹失败')
    }
  }

  const handleDeleteFolder = async (folderName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!brandId) return
    if (['素材库', '产品', '环境', '活动'].includes(folderName)) {
      alert('系统默认文件夹不可删除')
      return
    }

    if (!window.confirm(`确定要删除文件夹 “${folderName}” 吗？\n删除文件夹后，其中的素材将自动移至 “素材库” 根目录。`)) return

    try {
      const res = await fetch(`/api/brands/${brandId}/folders?name=${encodeURIComponent(folderName)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '删除文件夹失败')
      }
      await loadFolders()
      if (selectedFolder === folderName) {
        setSelectedFolder('素材库')
      }
      await loadAssets()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除文件夹失败')
    }
  }

  const handleDragStart = (assetId: string, e: React.DragEvent) => {
    if (isDragSelecting.current) {
      e.preventDefault()
      return
    }
    const targets = selected.includes(assetId) ? selected : [assetId]
    setDraggingIds(targets)
    e.dataTransfer.setData('application/json', JSON.stringify(targets))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggingIds(null)
    setDragOverFolder(null)
  }

  const handleDropOnFolder = async (folderName: string, e: React.DragEvent) => {
    e.preventDefault()
    setDragOverFolder(null)

    let ids: string[] = []
    try {
      const data = e.dataTransfer.getData('application/json')
      if (data) {
        ids = JSON.parse(data)
      }
    } catch {
      // fallback
    }

    if (ids.length === 0 && draggingIds) {
      ids = draggingIds
    }

    if (!brandId || ids.length === 0) return

    setUploading(true)
    setError(null)
    try {
      await Promise.all(ids.map((assetId) => {
        const payload: Record<string, unknown> = {
          folder: folderName,
          aiCategory: folderName
        }
        return fetch(`/api/brands/${brandId}/assets/${assetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }))
      setDraggingIds(null)
      await loadAssets()
    } catch {
      setError('移动素材文件夹失败')
    } finally {
      setUploading(false)
    }
  }

  const getChatMessages = (assetId: string) => {
    return chatHistory[assetId] || [
      {
        sender: 'ai' as const,
        text: '你好！我是 Designer AI。你可以直接告诉我如何操作这张图片，例如：“裁剪为 1:1”、“添加水印”、“添加‘店长推荐’标签”、“调亮图片” 等。我将为你生成一张全新素材，不会覆盖原图。'
      }
    ]
  }

  const handleSendDesignerCommand = async (customPrompt?: string) => {
    const text = (customPrompt || designerPromptText || '').trim()
    if (!text || aiProcessing || !activeAsset) return

    if (!customPrompt) {
      setDesignerPromptText('')
    }

    const assetId = activeAsset.id
    const userMsg = { sender: 'user' as const, text }

    setChatHistory(prev => ({
      ...prev,
      [assetId]: [...(prev[assetId] || []), userMsg]
    }))

    setAiProcessing(true)

    try {
      const res = await fetch(`/api/brands/${brandId}/assets/${assetId}/design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '设计修改失败')
      }

      const newAsset = data.asset
      const aiMsg = {
        sender: 'ai' as const,
        text: `已为您完成修改！新图片已成功保存为新素材：${newAsset.filename || '新图片.jpg'}。您可以点击下方预览或在素材库中查看。`,
        newAssetId: newAsset.id,
        newAssetUrl: newAsset.url
      }

      setChatHistory(prev => ({
        ...prev,
        [assetId]: [...(prev[assetId] || []), aiMsg]
      }))

      await loadAssets()
    } catch (err: any) {
      const errorMsg = {
        sender: 'ai' as const,
        text: `抱歉，设计修改遇到了问题：${err.message || '未知错误'}`
      }
      setChatHistory(prev => ({
        ...prev,
        [assetId]: [...(prev[assetId] || []), errorMsg]
      }))
    } finally {
      setAiProcessing(false)
    }
  }



  // Bulk Tagging simulator state
  const [bulkTaggingActive, setBulkTaggingActive] = useState(false)
  const [bulkTagProgress, setBulkTagProgress] = useState(0)

  // Batch Tags Input
  const [batchTagsText, setBatchTagsText] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAssets = useCallback(async (cancelled = false) => {
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true)
    })
    setError(null)
    try {
      const query = new URLSearchParams()
      if (brandId) query.set('brandId', brandId)
      const url = query.toString() ? `/api/dashboard/assets?${query.toString()}` : '/api/dashboard/assets'
      const res = await fetch(url)
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      if (!cancelled) {
        const loadedAssets = data.assets || []
        setAssets(loadedAssets)
        // Auto-select first asset for Single AI Insight
        if (loadedAssets.length > 0) {
          setActiveAssetId(prev => {
            const exists = loadedAssets.some((a: any) => a.id === prev)
            return exists ? prev : loadedAssets[0].id
          })
        }
      }
      if (!cancelled) {
        await loadFolders()
      }
    } catch {
      if (!cancelled) setError('素材库加载失败')
    } finally {
      if (!cancelled) setLoading(false)
    }
  }, [brandId, loadFolders])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void loadAssets(cancelled)
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loadAssets])



  const loadBrandAccounts = useCallback(async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/brands/${brandId}/accounts`)
      if (res.ok) {
        const json = await res.json()
        const data = json.accounts || []
        setBrandAccounts(data)
        if (data && data.length > 0) {
          setScheduleSelectedAccountIds([data[0].id])
        }
      }
    } catch (err) {
      console.error('Failed to load brand accounts:', err)
    }
  }, [brandId])

  const handleConfirmScheduleAndTask = async () => {
    if (!brandId || scheduleTargetIds.length === 0) return
    if (!scheduleCaption.trim()) {
      alert('草稿正文不能为空')
      return
    }
    if (scheduleSelectedAccountIds.length === 0) {
      alert('请选择发布账号（确定发布平台）')
      return
    }

    setCreatingTask(true)
    setError(null)

    try {
      // 1. Tag the assets as "草稿排期"
      const assetRes = await fetch(`/api/brands/${brandId}/assets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetIds: scheduleTargetIds,
          appendTags: ['草稿排期'],
          aiReady: true,
        }),
      })

      if (!assetRes.ok) {
        throw new Error('标记素材为草稿排期失败')
      }

      // 2. Create the ContentDraft directly
      const selectedUrls = assets
        .filter(a => scheduleTargetIds.includes(a.id))
        .map(a => a.url)

      const parseTags = (str: string) => {
        if (!str.trim()) return []
        return str
          .split(/[\s,，]+/)
          .map((t) => t.trim().replace(/^#/, ''))
          .filter((t) => t.length > 0)
      }

      await Promise.all(
        scheduleSelectedAccountIds.map(async (accId) => {
          const draftRes = await fetch(`/api/brands/${brandId}/drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: accId,
              caption: scheduleCaption.trim(),
              hashtags: parseTags(scheduleHashtags),
              assetIds: scheduleTargetIds,
              mediaUrls: selectedUrls,
              scheduledAt: scheduleScheduledAt ? new Date(scheduleScheduledAt).toISOString() : null,
              status: 'draft',
              agentNote: scheduleAgentNote.trim() || null,
              agentId: null,
              createTask: true,
            }),
          })

          const draftData = await draftRes.json().catch(() => ({}))
          if (!draftRes.ok) {
            throw new Error(draftData.error || '创建 Post 草稿失败')
          }
        })
      )

      // 3. Reset states and notify
      setSelected([])
      setIsBatchSelectMode(false)
      setScheduleModalOpen(false)
      await loadAssets()
      alert(`已成功生成 Post 草稿并创建了看板任务！\n平台的 AMC Copywriter 将继续完成内容的完整创作和发布。`)
    } catch (err: any) {
      setError(err?.message || '操作失败，请重试')
    } finally {
      setCreatingTask(false)
    }
  }

  const markForSchedule = (assetIds: string | string[]) => {
    const ids = Array.isArray(assetIds) ? assetIds : [assetIds]
    if (ids.length === 0) return
    setScheduleTargetIds(ids)
    setScheduleCaption('')
    setScheduleHashtags('')
    setScheduleScheduledAt('')
    setScheduleAgentNote('')
    setScheduleModalOpen(true)
    void loadBrandAccounts()
  }

  // Handler for mouse up globally (to terminate dragging)
  const handleMouseUpGlobal = useCallback(() => {
    isDragSelecting.current = false
    setIsSelectingState(false)
    dragVisitedIds.current.clear()
    setTimeout(() => {
      hasToggledThisInteraction.current = false
    }, 50)
  }, [])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUpGlobal)
    window.addEventListener('touchend', handleMouseUpGlobal)
    return () => {
      window.removeEventListener('mouseup', handleMouseUpGlobal)
      window.removeEventListener('touchend', handleMouseUpGlobal)
    }
  }, [handleMouseUpGlobal])

  const startDragSelection = (startId: string) => {
    isDragSelecting.current = true
    setIsSelectingState(true)
    setIsBatchSelectMode(true)
    dragVisitedIds.current.clear()
    dragVisitedIds.current.add(startId)
    hasToggledThisInteraction.current = true
    lastSelectedId.current = startId

    // Determine mode based on whether startId is already selected
    const isAlreadySelected = selected.includes(startId)
    if (isAlreadySelected) {
      dragSelectionMode.current = 'deselect'
      setSelected(prev => prev.filter(id => id !== startId))
    } else {
      dragSelectionMode.current = 'select'
      setSelected(prev => [...prev, startId])
    }
    setActiveAssetId(startId)
  }

  const handleCheckboxMouseDown = (id: string, e: React.MouseEvent) => {
    if (e.button !== 0) return // Left click only
    if (e.shiftKey) {
      // Let the toggleSelect onClick handle the shift range selection
      return
    }
    startDragSelection(id)
  }

  const handleCheckboxTouchStart = (id: string) => {
    startDragSelection(id)
  }

  const handleCardMouseEnter = (id: string) => {
    if (!isDragSelecting.current) return
    if (dragVisitedIds.current.has(id)) return

    dragVisitedIds.current.add(id)
    lastSelectedId.current = id
    if (dragSelectionMode.current === 'select') {
      setSelected(prev => {
        if (prev.includes(id)) return prev
        return [...prev, id]
      })
    } else {
      setSelected(prev => prev.filter(x => x !== id))
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragSelecting.current) return
    
    // Call e.preventDefault() if safe to do so to prevent viewport scrolling
    if (e.cancelable) {
      e.preventDefault()
    }

    const touch = e.touches[0]
    if (!touch) return

    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) return

    // Walk up DOM to find target card
    let current: HTMLElement | null = el as HTMLElement
    let id: string | null = null
    while (current) {
      const assetId = current.getAttribute('data-asset-id')
      if (assetId) {
        id = assetId
        break
      }
      current = current.parentElement
    }

    if (id && !dragVisitedIds.current.has(id)) {
      dragVisitedIds.current.add(id)
      lastSelectedId.current = id
      const targetId = id
      if (dragSelectionMode.current === 'select') {
        setSelected(prev => {
          if (prev.includes(targetId)) return prev
          return [...prev, targetId]
        })
      } else {
        setSelected(prev => prev.filter(x => x !== targetId))
      }
    }
  }

  const toggleSelect = (id: string, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation()
    
    // If handled in the current touch/mouse interaction, skip the redundant click handler toggle
    if (hasToggledThisInteraction.current) {
      hasToggledThisInteraction.current = false
      return
    }

    const isShift = e && 'shiftKey' in e && (e as React.MouseEvent).shiftKey

    setSelected(prev => {
      const isSel = prev.includes(id)
      
      if (isShift && lastSelectedId.current) {
        const lastIdx = filtered.findIndex(a => a.id === lastSelectedId.current)
        const currentIdx = filtered.findIndex(a => a.id === id)
        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx)
          const end = Math.max(lastIdx, currentIdx)
          const idsInRange = filtered.slice(start, end + 1).map(a => a.id)
          
          const lastWasSelected = prev.includes(lastSelectedId.current)
          if (lastWasSelected) {
            return Array.from(new Set([...prev, ...idsInRange]))
          } else {
            return prev.filter(x => !idsInRange.includes(x))
          }
        }
      }

      lastSelectedId.current = id
      const next = isSel ? prev.filter(s => s !== id) : [...prev, id]
      return next
    })
    setActiveAssetId(id)
  }

  const handleCardClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (isBatchSelectMode) {
      toggleSelect(id, e)
    } else {
      setActiveAssetId(id)
    }
  }

  // Filter logic
  const filtered = assets.filter(a => {
    // Folder filter
    const folderMatch = selectedFolder === 'all'
      ? true
      : selectedFolder === '素材库'
        ? (!a.aiCategory || a.aiCategory === '素材库' || a.aiCategory === 'raw')
        : a.aiCategory === selectedFolder
    if (!folderMatch) return false
    // 1. Sidebar views filter
    if (viewFilter === 'recent') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      if (new Date(a.createdAt) < sevenDaysAgo) return false
    } else if (viewFilter === 'unused') {
      if (a.usedCount > 0) return false
    } else if (viewFilter === 'high_perf') {
      if (a.usedCount <= 2) return false
    } else if (viewFilter === 'ai_pending') {
      if (a.aiReady) return false
    } else if (viewFilter === 'images') {
      if (!a.mimeType.startsWith('image/')) return false
    } else if (viewFilter === 'videos') {
      if (!a.mimeType.startsWith('video/')) return false
    } else if (viewFilter === 'scheduled') {
      if (!a.aiTags.includes('草稿排期') && !a.aiTags.includes('排期发布')) return false
    }

    // 2. Category tag filter
    const catMatch = activeCategory === 'all' || toCategory(a) === activeCategory

    // 3. Search query
    const query = search.trim().toLowerCase()
    const label = (a.aiCaption || a.filename || '').toLowerCase()
    const brandNameLower = a.brandName.toLowerCase()
    const tags = a.aiTags.some(t => t.toLowerCase().includes(query))
    const searchMatch = !query || label.includes(query) || brandNameLower.includes(query) || tags
    return catMatch && searchMatch
  })

  // Dynamic badge counts
  const countAll = assets.length
  const countRecent = assets.filter(a => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return new Date(a.createdAt) >= sevenDaysAgo
  }).length
  const countUnused = assets.filter(a => a.usedCount === 0).length
  const countHighPerf = assets.filter(a => a.usedCount > 2).length
  const countAiPending = assets.filter(a => !a.aiReady).length
  const countImages = assets.filter(a => a.mimeType.startsWith('image/')).length
  const countVideos = assets.filter(a => a.mimeType.startsWith('video/')).length
  const countScheduled = assets.filter(a => a.aiTags.includes('草稿排期') || a.aiTags.includes('排期发布')).length

  const activeAsset = assets.find(a => a.id === activeAssetId) || filtered[0] || assets[0]

  // Batch mark pending assets as ready by syncing to backend.
  const startBulkTagging = async () => {
    if (!brandId) {
      setError('请先选择品牌')
      return
    }
    const pendingIds = assets.filter(a => 
      !a.aiReady || 
      a.aiTags.length === 0 || 
      a.aiTags.includes('待确认') || 
      a.aiTags.includes('待打标') ||
      !a.aiCaption
    ).map(a => a.id)
    
    if (pendingIds.length === 0) {
      setBulkTagProgress(100)
      return
    }

    setBulkTaggingActive(true)
    setBulkTagProgress(0)
    setError(null)

    let completed = 0
    try {
      for (const assetId of pendingIds) {
        const res = await fetch(`/api/brands/${brandId}/assets/${assetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiReady: true, triggerAiTagging: true }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || '批量确认失败')
        }
        completed += 1
        setBulkTagProgress(Math.round((completed / pendingIds.length) * 100))
      }
      await loadAssets()
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量确认失败')
    } finally {
      setBulkTaggingActive(false)
    }
  }



  const uploadFiles = async (files: FileList | File[]) => {
    if (!brandId) {
      setError('请先选择品牌再上传素材')
      return
    }
    const fileList = Array.from(files)
    if (fileList.length === 0) return

    setUploading(true)
    setError(null)
    setUploadProgress(`准备上传 (${fileList.length}个文件)...`)

    let uploadedCount = 0
    const failedFiles: string[] = []

    const uploadSingleFile = async (file: File) => {
      const filename = file.name
      const mimeType = file.type || 'application/octet-stream'

      try {
        // 1. Request presigned upload URL from backend
        const presignRes = await fetch(
          `/api/brands/${brandId}/assets/presign-upload?filename=${encodeURIComponent(filename)}&mimeType=${encodeURIComponent(mimeType)}&folder=${encodeURIComponent(targetFolder)}`
        )
        const presignData = await presignRes.json().catch(() => ({}))
        
        if (!presignRes.ok) {
          throw new Error(presignData.error || '获取上传凭证失败')
        }

        let uploadSuccess = false

        if (!presignData.useDirectApi) {
          try {
            // 2. Perform direct binary upload to Huawei OBS pre-signed PUT URL
            const uploadHeaders: Record<string, string> = {
              'Content-Type': mimeType,
            }
            
            const uploadRes = await fetch(presignData.uploadUrl, {
              method: 'PUT',
              headers: uploadHeaders,
              body: file, // Directly send the raw binary File/Blob
            })

            if (!uploadRes.ok) {
              throw new Error(`直接上传到存储服务失败 (HTTP ${uploadRes.status})`)
            }

            // 3. Confirm the upload with the backend to write the record in database
            const confirmRes = await fetch(`/api/brands/${brandId}/assets/confirm-upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                mimeType,
                sizeBytes: file.size,
                url: presignData.assetUrl,
                key: presignData.key,
                folder: targetFolder,
                aiTags: [targetFolder, '待确认'],
              }),
            })
            const confirmData = await confirmRes.json().catch(() => ({}))
            if (!confirmRes.ok) {
              throw new Error(confirmData.error || '确认素材入库失败')
            }

            uploadSuccess = true
          } catch (directErr: any) {
            console.warn(`Direct OBS upload failed for ${filename}, falling back to server API:`, directErr)
          }
        }

        if (presignData.useDirectApi || !uploadSuccess) {
          // Fallback to local Base64 upload route
          const fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const value = String(reader.result || '')
              resolve(value.includes(',') ? value.split(',').pop() || '' : value)
            }
            reader.onerror = () => reject(new Error('read failed'))
            reader.readAsDataURL(file)
          })

          const res = await fetch(`/api/brands/${brandId}/assets/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              mimeType,
              fileBase64,
              folder: targetFolder,
              aiCategory: targetFolder === '素材库' ? 'raw' : targetFolder,
              aiTags: [targetFolder, '待确认'],
            }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(json.error || '素材上传失败')
        }

        uploadedCount++
        setUploadProgress(`正在上传... 已成功 ${uploadedCount}/${fileList.length}`)
      } catch (fileError: any) {
        console.error(`Upload failed for file "${file.name}":`, fileError)
        failedFiles.push(`${file.name}: ${fileError?.message || '未知错误'}`)
      }
    }

    // Process files using a worker pool with a concurrency limit of 3
    const queue = [...fileList]
    const concurrencyLimit = 3

    const worker = async () => {
      while (queue.length > 0) {
        const file = queue.shift()
        if (file) {
          await uploadSingleFile(file)
        }
      }
    }

    try {
      // Start workers in parallel
      const workers = Array.from(
        { length: Math.min(concurrencyLimit, fileList.length) },
        () => worker()
      )
      await Promise.all(workers)
      
      await loadAssets()
      
      if (failedFiles.length > 0) {
        setError(`成功上传 ${uploadedCount} 个，失败 ${failedFiles.length} 个：\n${failedFiles.join('\n')}`)
      } else {
        alert(`已成功上传 ${uploadedCount} 个素材！`)
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : '素材上传异常')
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  // Update tags or info of single asset
  const updateAssetTags = async (assetId: string, updatedTags: string[]) => {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, aiTags: updatedTags } : a))
    if (!brandId) return
    try {
      await fetch(`/api/brands/${brandId}/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiTags: updatedTags })
      })
    } catch {
      console.error('Failed to sync updated tags to backend')
    }
  }

  // Remove individual tag from active asset
  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeAsset) return
    const updated = activeAsset.aiTags.filter(t => t !== tagToRemove)
    void updateAssetTags(activeAsset.id, updated)
  }

  // Accept/Approve tag
  const handleApproveAsset = async (assetId: string) => {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, aiReady: true } : a))
    if (!brandId) return
    try {
      await fetch(`/api/brands/${brandId}/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiReady: true })
      })
    } catch (e) {
      console.error(e)
    }
  }

  // Apply batch changes
  const applyBatchChanges = async () => {
    if (!brandId || selected.length === 0) return
    setUploading(true)
    setError(null)
    const newTags = batchTagsText
      .split(/[#,，\s]+/)
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean)
    try {
      await Promise.all(selected.map((assetId) => {
        const original = assets.find(a => a.id === assetId)
        const combinedTags = Array.from(new Set([...(original?.aiTags || []), ...newTags]))
        const payload: Record<string, unknown> = { aiTags: combinedTags, aiReady: true }
        if (moveFolder.trim()) {
          payload.folder = moveFolder.trim()
          payload.aiCategory = moveFolder.trim()
        }
        return fetch(`/api/brands/${brandId}/assets/${assetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }))
      setBatchTagsText('')
      setMoveFolder('')
      await loadAssets()
    } catch {
      setError('批量更新素材失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAsset = async (assetId: string) => {
    if (!brandId) return
    if (!window.confirm('确定要永久删除该素材吗？此操作无法撤销。')) return

    setError(null)
    try {
      const res = await fetch(`/api/brands/${brandId}/assets/${assetId}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '删除素材失败')

      setSelected(prev => prev.filter(id => id !== assetId))
      if (activeAssetId === assetId) {
        setActiveAssetId(null)
      }
      await loadAssets()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除素材失败')
    }
  }

  const handleBatchDeleteAssets = async () => {
    if (!brandId || selected.length === 0) return
    if (!window.confirm(`确定要永久删除这 ${selected.length} 个素材吗？此操作无法撤销。`)) return

    setUploading(true)
    setError(null)
    try {
      await Promise.all(selected.map((assetId) => {
        return fetch(`/api/brands/${brandId}/assets/${assetId}`, {
          method: 'DELETE',
        })
      }))
      setSelected([])
      setIsBatchSelectMode(false)
      setActiveAssetId(null)
      await loadAssets()
    } catch {
      setError('批量删除素材失败')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (activeEl) {
        const tagName = activeEl.tagName.toUpperCase()
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable')) {
          return
        }
      }

      if (e.key === 'Escape') {
        if (selected.length > 0) {
          e.preventDefault()
          setSelected([])
        } else if (activeAssetId) {
          e.preventDefault()
          setActiveAssetId(null)
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.length > 0) {
          e.preventDefault()
          void handleBatchDeleteAssets()
        } else if (activeAssetId) {
          e.preventDefault()
          void handleDeleteAsset(activeAssetId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selected, activeAssetId, brandId, assets, handleDeleteAsset, handleBatchDeleteAssets])

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans relative">
      
      {/* 1. LEFT SIDEBAR: Views & Tag Browser */}
      <aside className="w-64 border-r border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col p-4 shrink-0 h-full overflow-y-auto hidden lg:flex select-none">
        <div className="mb-6">
          <h3 className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">资产视图</h3>
          <nav className="space-y-1">
            <button
              onClick={() => { setViewFilter('all'); setActiveCategory('all'); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'all' && activeCategory === 'all' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <Grid className="w-4 h-4" />
                <span>全部素材</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countAll}</span>
            </button>

            <button
              onClick={() => setViewFilter('recent')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'recent' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4" />
                <span>最近上传</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countRecent}</span>
            </button>

            <button
              onClick={() => setViewFilter('unused')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'unused' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <Archive className="w-4 h-4" />
                <span>未使用</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countUnused}</span>
            </button>

            <button
              onClick={() => setViewFilter('high_perf')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'high_perf' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4" />
                <span>高表现</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countHighPerf}</span>
            </button>

            <button
              onClick={() => setViewFilter('ai_pending')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'ai_pending' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <Bot className="w-4 h-4" />
                <span>AI 待处理</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countAiPending}</span>
            </button>

            <button
              onClick={() => setViewFilter('scheduled')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'scheduled' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4" />
                <span>草稿排期</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countScheduled}</span>
            </button>

            <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-2 mx-3"></div>

            <button
              onClick={() => setViewFilter('images')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'images' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="w-4 h-4" />
                <span>图片素材</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countImages}</span>
            </button>

            <button
              onClick={() => setViewFilter('videos')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${viewFilter === 'videos' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3">
                <Video className="w-4 h-4" />
                <span>视频素材</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{countVideos}</span>
            </button>
          </nav>
        </div>

        <div className="mb-6 border-t border-slate-100 dark:border-slate-800 pt-4">
          <h3 className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>文件夹</span>
            <Plus
              className="w-3.5 h-3.5 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              onClick={handleCreateFolder}
            />
          </h3>
          <nav className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            {/* 全部文件夹 */}
            <button
              onClick={() => { setSelectedFolder('all'); setTargetFolder('素材库'); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDragEnter={() => setDragOverFolder('all')}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(e) => handleDropOnFolder('素材库', e)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all group ${dragOverFolder === 'all' ? 'bg-indigo-100 dark:bg-indigo-900/50 border-2 border-indigo-500 scale-[1.02]' : selectedFolder === 'all' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold border-2 border-transparent' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-2 border-transparent'}`}
            >
              <div className="flex items-center gap-3 truncate">
                <span className="shrink-0 text-md">📁</span>
                <span className="truncate">全部文件夹 (显示所有)</span>
              </div>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{assets.length}</span>
            </button>

            {folders.map(f => {
              const isSelected = selectedFolder === f
              const isDragOver = dragOverFolder === f
              const count = assets.filter(a => f === '素材库' ? (!a.aiCategory || a.aiCategory === '素材库' || a.aiCategory === 'raw') : a.aiCategory === f).length
              const isDeletable = !['素材库', '产品', '环境', '活动'].includes(f)

              return (
                <button
                  key={f}
                  onClick={() => { setSelectedFolder(f); setTargetFolder(f); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDragEnter={() => setDragOverFolder(f)}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={(e) => handleDropOnFolder(f, e)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all group ${isDragOver ? 'bg-indigo-100 dark:bg-indigo-900/50 border-2 border-indigo-500 scale-[1.02]' : isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold border-2 border-transparent' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-2 border-transparent'}`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className="shrink-0 text-md">📁</span>
                    <span className="truncate">{f}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">{count}</span>
                    {isDeletable && (
                      <X
                        className="w-3 h-3 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                        onClick={(e) => handleDeleteFolder(f, e)}
                      />
                    )}
                  </div>
                </button>
              )
            })}
          </nav>
        </div>


        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Powered by Immedi.AI</p>
        </div>
      </aside>

      {/* 2. CENTER COLUMN: Media Grid */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header bar */}
        <div className="p-6 border-b border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-sm z-10">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white flex items-center gap-2">
              <span>营销素材知识库</span>
              <span className="text-xs px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full font-bold border border-indigo-100/50 dark:border-indigo-900/30">
                📁 {selectedFolder === 'all' ? '全部文件夹' : selectedFolder}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              AI 自动理解素材内容，一键生成多平台营销帖子与动态视频
            </p>
          </div>
          
          <div className="flex items-center gap-2.5">
            <button
              onClick={startBulkTagging}
              disabled={bulkTaggingActive || assets.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-600 dark:text-indigo-400 disabled:opacity-50"
            >
              {bulkTaggingActive ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>处理中 {bulkTagProgress}%</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>AI 批量打标</span>
                </>
              )}
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files) }}
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-95 transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>{uploading ? (uploadProgress || '上传中...') : '上传素材'}</span>
            </button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索标签、AI 描述..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          
          <select
            value={selectedFolder}
            onChange={(e) => {
              const val = e.target.value
              setSelectedFolder(val)
              setTargetFolder(val === 'all' ? '素材库' : val)
            }}
            className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none hover:bg-slate-50 transition-all cursor-pointer"
          >
            <option value="all">全部文件夹 (所有素材)</option>
            {folders.map(f => (
              <option key={f} value={f}>
                {f === '素材库' ? '根目录 (素材库)' : `${f} 目录`}
              </option>
            ))}
          </select>

          {selected.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const visibleIds = filtered.map(a => a.id)
                  const allVisibleSelected = visibleIds.every(id => selected.includes(id))
                  if (allVisibleSelected) {
                    setSelected(prev => prev.filter(id => !visibleIds.includes(id)))
                  } else {
                    setSelected(prev => Array.from(new Set([...prev, ...visibleIds])))
                  }
                }}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1.5 select-none shrink-0"
              >
                <Check className="w-4 h-4 text-indigo-500" strokeWidth={3} />
                <span>{filtered.every(a => selected.includes(a.id)) ? '取消全选' : '全选'}</span>
              </button>

              <button
                type="button"
                onClick={() => markForSchedule(selected)}
                className="rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/35 px-3.5 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-450 outline-none transition-all cursor-pointer flex items-center gap-1.5 select-none shrink-0"
              >
                <Calendar className="w-4 h-4" />
                <span>准备草稿排期(idea)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelected([])
                  setIsBatchSelectMode(false)
                }}
                className="rounded-xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/20 dark:hover:bg-rose-900/35 px-3.5 py-2 text-sm font-semibold text-rose-600 dark:text-rose-455 outline-none transition-all cursor-pointer flex items-center gap-1.5 select-none shrink-0"
              >
                <X className="w-4 h-4" />
                <span>取消选择 ({selected.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Scrollable grid wrapper */}
        <div 
          onClick={() => {
            if (hasToggledThisInteraction.current) {
              return
            }
            if (selected.length > 0) {
              setSelected([])
              setIsBatchSelectMode(false)
            }
          }}
          className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/40 dark:bg-slate-950/20"
        >
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Grid Layout */}
          {filtered.length > 0 ? (
            <div
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-20"
              style={{ touchAction: isSelectingState ? 'none' : 'auto' }}
            >
              {filtered.map((asset, i) => {
                const isSelected = selected.includes(asset.id)
                const isActive = activeAssetId === asset.id
                const previewable = isPreviewable(asset)
                const isVideo = asset.mimeType.startsWith('video/')

                return (
                  <div
                    key={asset.id}
                    data-asset-id={asset.id}
                    draggable={!isSelectingState}
                    onDragStart={(e) => handleDragStart(asset.id, e)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleCardClick(asset.id, e)}
                    onMouseEnter={() => handleCardMouseEnter(asset.id)}
                    onTouchMove={isSelectingState ? handleTouchMove : undefined}
                    style={{ touchAction: isSelectingState ? 'none' : 'auto' }}
                    className={`group flex flex-col bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border cursor-pointer transition-all duration-200 select-none shadow-sm relative ${isActive ? 'ring-2 ring-indigo-500 border-indigo-500' : isSelected ? 'ring-2 ring-indigo-500/50 border-indigo-500/50' : 'border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md'} ${draggingIds?.includes(asset.id) ? 'opacity-40 scale-95 border-dashed border-indigo-400' : ''}`}
                  >
                    {/* Thumbnail Container */}
                    <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      {previewable && asset.mimeType.startsWith('image/') ? (
                        <img
                          src={asset.url}
                          alt={asset.filename || 'asset'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : previewable && isVideo ? (
                        <div className="relative w-full h-full">
                          <video
                            src={`${asset.url}#t=0.1`}
                            preload="metadata"
                            muted
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                            <div className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all">
                              <Play className="w-5 h-5 text-indigo-600 fill-indigo-600 ml-0.5" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${GRADIENT_PLACEHOLDERS[i % GRADIENT_PLACEHOLDERS.length]} flex items-center justify-center`}>
                          {isVideo ? (
                            <Video className="w-10 h-10 text-slate-400" />
                          ) : (
                            <ImageIcon className="w-10 h-10 text-slate-400" />
                          )}
                        </div>
                      )}

                      {/* Top-Right: Used Count Badge */}
                      <div className="absolute top-2 right-2 z-10 bg-slate-950/70 dark:bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full select-none">
                        {asset.usedCount}
                      </div>

                      {/* Top-Left: Checkbox hover overlay */}
                      <div
                        onClick={(e) => toggleSelect(asset.id, e)}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          handleCheckboxMouseDown(asset.id, e)
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation()
                          handleCheckboxTouchStart(asset.id)
                        }}
                        className={`absolute top-2.5 left-2.5 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-indigo-500 border-indigo-500 hover:bg-rose-600 hover:border-rose-600 scale-100 shadow-sm shadow-indigo-500/20 group/cb'
                            : isBatchSelectMode
                              ? 'bg-white/90 dark:bg-slate-900/90 border-slate-400 dark:border-slate-500 opacity-100 hover:border-indigo-500'
                              : 'bg-white/80 dark:bg-slate-900/80 border-slate-300 dark:border-slate-600 opacity-0 group-hover:opacity-100 hover:scale-105 hover:border-indigo-500'
                        } z-20`}
                        title={isSelected ? "点击取消选择" : "点击选择"}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-4 h-4 text-white block group-hover/cb:hidden" strokeWidth={3} />
                            <X className="w-4 h-4 text-white hidden group-hover/cb:block" strokeWidth={3} />
                          </>
                        ) : (
                          <Check className="w-4 h-4 text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
                        )}
                      </div>

                      {/* Brand Label */}
                      <div className="absolute bottom-2 left-2 bg-slate-900/75 text-white text-[9px] font-black px-1.5 py-0.5 rounded backdrop-blur-sm truncate max-w-[85%]">
                        {asset.brandName}
                      </div>

                      {/* Bottom-Right: Zoom preview button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewImageUrl(asset.url)
                        }}
                        className="absolute bottom-2 right-2 w-7 h-7 bg-slate-950/60 dark:bg-black/60 hover:bg-indigo-600 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 active:scale-95 transition-all shadow-md backdrop-blur-sm z-20"
                        title="点击放大查看原图"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>


                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-24 text-center">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-sm text-slate-400">智能素材库载入中...</p>
                </div>
              ) : (
                <div className="max-w-xs mx-auto">
                  <ImageIcon className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">没有找到匹配的素材</p>
                  <p className="text-xs text-slate-400 mt-1">试试清除搜索词、切换左侧视图或文件夹分类</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 3. RIGHT SIDEBAR: AI Detail & Batch Drawer */}
      <aside className="w-80 border-l border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 h-full overflow-hidden hidden xl:flex">
        {selected.length > 1 ? (
          
          /* DRAWER: BATCH OPERATIONS MODE */
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30">
              <div>
                <h2 className="text-md font-bold text-slate-900 dark:text-slate-100">批量操作</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">已选择 {selected.length} 个素材</p>
              </div>
              <button
                onClick={() => {
                  setSelected([])
                  setIsBatchSelectMode(false)
                }}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
              {/* Selected Thumbnails Carousel */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  已选素材预览
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                  {selected.map(id => {
                    const matched = assets.find(a => a.id === id)
                    if (!matched) return null
                    return (
                      <div
                        key={id}
                        onClick={() => setSelected(prev => prev.filter(x => x !== id))}
                        className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-800 hover:border-red-500 hover:opacity-80 transition-all cursor-pointer group"
                        title="点击移除选择"
                      >
                        <img src={matched.url} alt="thumbnail" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-red-600/75 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Batch Tags Input */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  批量添加标签
                </h4>
                <input
                  type="text"
                  value={batchTagsText}
                  onChange={e => setBatchTagsText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void applyBatchChanges()
                    }
                  }}
                  placeholder="添加标签 (逗号或空格分隔)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100"
                />
                
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['+ 招牌推荐', '+ 节日限定', '+ 探店必点', '+ 夏季新品'].map(chip => (
                    <button
                      key={chip}
                      onClick={() => {
                        const tag = chip.replace('+ ', '')
                        setBatchTagsText(prev => {
                          const existing = prev.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean)
                          if (existing.includes(tag)) return prev
                          return [...existing, tag].join(', ')
                        })
                      }}
                      className="px-2 py-1 bg-indigo-50/70 hover:bg-indigo-100/80 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] rounded font-bold transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Move to folder inside batch drawer */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  移动分类文件夹
                </h4>
                <select
                  value={moveFolder}
                  onChange={(e) => setMoveFolder(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <option value="">选择目标文件夹...</option>
                  {folders.map(f => (
                    <option key={f} value={f}>
                      {f === '素材库' ? '根目录 (素材库)' : f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Set usage plan */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  使用排期排程
                </h4>
                <button
                  onClick={() => markForSchedule(selected)}
                  className="w-full py-2.5 border border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>准备草稿排期(idea)</span>
                </button>
              </div>
            </div>

            {/* Bottom actions container */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col gap-2">
              <button
                onClick={applyBatchChanges}
                disabled={uploading}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Check className="w-4 h-4" />
                <span>{uploading ? '提交中...' : '应用更改'}</span>
              </button>

              <button
                onClick={handleBatchDeleteAssets}
                disabled={uploading || selected.length === 0}
                className="w-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>批量删除素材 (Delete 键)</span>
              </button>
            </div>
          </div>
        ) : activeAsset ? (

          /* DRAWER: SINGLE ASSET INSIGHT MODE */
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30">
              <h2 className="text-md font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-500" />
                <span>AI 素材洞察</span>
              </h2>
              {/* Check status badge */}
              {!activeAsset.aiReady && (
                <button
                  onClick={() => handleApproveAsset(activeAsset.id)}
                  className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-600 rounded text-[10px] font-bold transition-all"
                >
                  确认入库
                </button>
              )}
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
              {/* Asset Preview Thumbnail card */}
              <div className="rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 shadow-sm">
                <div
                  onClick={() => setPreviewImageUrl(activeAsset.url)}
                  className="aspect-[4/3] w-full bg-slate-200 dark:bg-slate-800 relative flex items-center justify-center cursor-zoom-in group/preview"
                  title="点击查看原图"
                >
                  {isPreviewable(activeAsset) ? (
                    activeAsset.mimeType.startsWith('video/') ? (
                      <video src={`${activeAsset.url}#t=0.1`} preload="metadata" muted className="w-full h-full object-cover" />
                    ) : (
                      <img src={activeAsset.url} alt="detail asset" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
                      {activeAsset.mimeType.startsWith('video/') ? (
                        <Video className="w-12 h-12 text-slate-400" />
                      ) : (
                        <ImageIcon className="w-12 h-12 text-slate-400" />
                      )}
                    </div>
                  )}
                  {activeAsset.mimeType.startsWith('video/') && isPreviewable(activeAsset) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  )}
                  {/* Hover magnifying overlay */}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1.5 text-white bg-black/60 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm">
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>查看原图</span>
                    </div>
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate flex-1 mr-2">
                      {activeAsset.filename || '未命名素材'}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {activeAsset.mimeType.split('/')[1]?.toUpperCase() || 'RAW'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800/60">
                    {activeAsset.aiCaption || 'AI 尚未生成图析描述。可以点击批量打标来分析。'}
                  </p>
                </div>
              </div>

              {/* Designer AI Chat Section */}
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Designer AI 智能修改助手</span>
                </div>
                {activeAsset.mimeType.startsWith('video/') ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 rounded-2xl text-center space-y-1">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
                    <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">仅支持图片素材</h5>
                    <p className="text-[10px] text-slate-400 leading-normal">Designer AI 智能操作目前仅支持对图片进行裁剪、水印、滤镜、亮度等调整。</p>
                  </div>
                ) : (
                  <div className="bg-slate-50/80 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/55 dark:border-slate-800/80 rounded-2xl p-4 space-y-3.5 shadow-sm">
                    {/* Message Log */}
                    <div className="max-h-60 overflow-y-auto space-y-3 pr-1 custom-scrollbar text-xs">
                      {getChatMessages(activeAsset.id).map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} items-start gap-2`}
                        >
                          {msg.sender === 'ai' && (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-xs">
                              <Bot className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                          <div className="flex flex-col max-w-[85%]">
                            <div
                              className={`p-2.5 rounded-2xl leading-relaxed ${
                                msg.sender === 'user'
                                  ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-tr-none shadow-xs'
                                  : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 text-slate-700 dark:text-slate-200 rounded-tl-none'
                              }`}
                            >
                              {msg.text}
                            </div>
                            {msg.sender === 'ai' && msg.newAssetUrl && (
                              <div
                                onClick={() => {
                                  if (msg.newAssetId) {
                                    setActiveAssetId(msg.newAssetId)
                                  }
                                }}
                                className="mt-1.5 p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02] shadow-xs"
                              >
                                <img
                                  src={msg.newAssetUrl}
                                  alt="designed result"
                                  className="w-10 h-10 object-cover rounded-lg shrink-0 border border-slate-100 dark:border-slate-800"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">查看生成的新图</p>
                                  <p className="text-[9px] text-slate-400">点击在此面板预览</p>
                                </div>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quick Command Chips */}
                    {getChatMessages(activeAsset.id).length === 1 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          { label: '裁剪 1:1', prompt: '裁剪为 1:1 正方形' },
                          { label: '添加水印', prompt: '添加品牌水印' },
                          { label: '黑白滤镜', prompt: '将图片转换为黑白' },
                          { label: '调亮画面', prompt: '将图片调亮' },
                          { label: '添加“店长推荐”标签', prompt: '在图片中添加“店长推荐”封面标签' },
                        ].map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => handleSendDesignerCommand(chip.prompt)}
                            disabled={aiProcessing}
                            className="px-2.5 py-1 bg-white hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-950/30 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-350 text-[10px] rounded-lg font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                          >
                            + {chip.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Chat Input Field */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={designerPromptText}
                        disabled={aiProcessing}
                        onChange={(e) => setDesignerPromptText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !aiProcessing) {
                            e.preventDefault()
                            void handleSendDesignerCommand()
                          }
                        }}
                        placeholder={aiProcessing ? "Designer AI 正在生成中..." : "告诉 Designer AI 如何修改此图片..."}
                        className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendDesignerCommand()}
                        disabled={aiProcessing || !designerPromptText.trim()}
                        className="px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
                      >
                        {aiProcessing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Folder selection for single asset */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  分类文件夹
                </h4>
                <select
                  value={activeAsset.aiCategory || '素材库'}
                  onChange={async (e) => {
                    const nextFolder = e.target.value
                    setAssets(prev => prev.map(a => a.id === activeAsset.id ? { ...a, aiCategory: nextFolder } : a))
                    if (!brandId) return
                    try {
                      const res = await fetch(`/api/brands/${brandId}/assets/${activeAsset.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder: nextFolder }),
                      })
                      if (!res.ok) throw new Error('Failed to update folder')
                      await loadAssets()
                    } catch (err) {
                      console.error(err)
                      alert('修改文件夹失败')
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  {folders.map(f => (
                    <option key={f} value={f}>
                      {f === '素材库' ? '根目录 (素材库)' : f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tag confirmations */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    AI 标签确认
                  </h4>
                  <span className="text-[10px] text-indigo-500 font-bold">{activeAsset.aiTags.length} 个已生成</span>
                </div>
                
                <div className="space-y-1.5">
                  {activeAsset.aiTags.map(tag => (
                    <div
                      key={tag}
                      className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800/60 group hover:border-indigo-400/40 transition-all"
                    >
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">#{tag}</span>
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="p-0.5 hover:bg-rose-50 text-rose-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="删除该标签"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  
                  {/* Quick Add Tag Inline */}
                  <div className="flex gap-2 items-center pt-1">
                    <input
                      type="text"
                      placeholder="回车新增标签..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim()
                          if (val) {
                            const newTags = val
                              .split(/[#,，\s]+/)
                              .map(t => t.trim().replace(/^#/, ''))
                              .filter(Boolean)
                            
                            if (newTags.length > 0) {
                              const combined = Array.from(new Set([...activeAsset.aiTags, ...newTags]))
                              void updateAssetTags(activeAsset.id, combined)
                              e.currentTarget.value = ''
                            }
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Performance Summary (real data only) */}
              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-2xl border border-indigo-100/60 dark:border-indigo-900/30">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-300">素材表现概览</h4>
                </div>

                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <p>累计使用次数：{activeAsset.usedCount}</p>
                  <p>最近一次使用：{activeAsset.lastUsedAt ? relativeDate(activeAsset.lastUsedAt) : '暂无记录'}</p>
                  {!activeAsset.aiReady && (
                    <div className="flex items-start gap-2 text-[11px] bg-white/80 dark:bg-slate-900 p-2.5 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30 text-slate-500 dark:text-slate-400">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="leading-normal">该素材尚未确认入库，建议先完成标签确认与分组。</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Publication History */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  渠道分发历史
                </h4>
                
                {activeAsset.usedCount > 0 ? (
                  <div className="space-y-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-xs text-xs text-slate-600 dark:text-slate-300">
                    <p>累计发布次数：{activeAsset.usedCount}</p>
                    <p>最近使用时间：{activeAsset.lastUsedAt ? relativeDate(activeAsset.lastUsedAt) : '暂无记录'}</p>
                    <p className="text-[11px] text-slate-400">渠道明细将在接入发布平台回流后展示。</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">该素材尚未发布至任何平台</p>
                )}
              </div>
            </div>

            {/* Bottom CTAs */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col gap-2">
              <button
                onClick={() => markForSchedule(activeAsset.id)}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Calendar className="w-4 h-4" />
                <span>准备草稿排期(idea)</span>
              </button>

              <button
                onClick={() => handleDeleteAsset(activeAsset.id)}
                className="w-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除素材 (Delete 键)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
            <Bot className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-sm font-bold">点击卡片查看 AI 分析</p>
            <p className="text-xs mt-1">选择单张素材展示 AI 智能标签与图生视频操作</p>
          </div>
        )}
      </aside>

      {/* Lightbox original media preview modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm transition-all animate-fade-in"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all"
            title="关闭预览"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div
            className="max-w-[90vw] max-h-[90vh] flex items-center justify-center relative"
            onClick={e => e.stopPropagation()}
          >
            {previewImageUrl.toLowerCase().endsWith('.mp4') || previewImageUrl.includes('/videos/') ? (
              <video
                src={previewImageUrl}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <img
                src={previewImageUrl}
                alt="Original preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl select-none"
              />
            )}
            
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white/70 text-xs font-mono bg-black/40 px-3 py-1 rounded-full backdrop-blur-md whitespace-nowrap">
              <a
                href={previewImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline flex items-center gap-1 hover:text-white"
              >
                <span>在新标签页打开原文件 ↗</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 4. Schedule Drawer (100% identical to new draft drawer in DraftManagementView) */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 z-[9999] flex justify-end bg-slate-950/30 p-3 backdrop-blur-sm" onClick={() => setScheduleModalOpen(false)}>
          <div className="flex h-full w-full max-w-xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in slide-in-from-right duration-250" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">New draft</p>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">准备草稿排期 (Idea)</h3>
              </div>
              <button onClick={() => setScheduleModalOpen(false)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <textarea
                value={scheduleCaption}
                onChange={e => setScheduleCaption(e.target.value)}
                placeholder="输入草稿正文..."
                className="min-h-[220px] w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                value={scheduleHashtags}
                onChange={e => setScheduleHashtags(e.target.value)}
                placeholder="标签，用逗号分隔，例如 lunch, promo, weekend"
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 min-h-[44px]">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">发布账号 (多选) <span className="text-red-500">*</span></p>
                  {brandAccounts.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">未绑定任何账号</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {brandAccounts.map((account) => {
                        const isSelected = scheduleSelectedAccountIds.includes(account.id)
                        return (
                          <button
                            key={account.id}
                            type="button"
                            onClick={() => {
                              setScheduleSelectedAccountIds(prev =>
                                prev.includes(account.id)
                                  ? prev.filter(id => id !== account.id)
                                  : [...prev, account.id]
                              )
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300'
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            <span>{account.platformId.toLowerCase() === 'instagram' ? '📸' : account.platformId.toLowerCase() === 'facebook' ? '👥' : account.platformId.toLowerCase() === 'red' ? '📕' : account.platformId.toLowerCase() === 'tiktok' ? '🎵' : '🔗'}</span>
                            <span>{account.displayName || account.name || account.handle}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-end">
                  <input
                    type="datetime-local"
                    value={scheduleScheduledAt}
                    onChange={(event) => setScheduleScheduledAt(event.target.value)}
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
              <textarea
                value={scheduleAgentNote}
                onChange={e => setScheduleAgentNote(e.target.value)}
                placeholder="协作备注 / 修改说明"
                className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              {/* Media & Assets Section */}
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">媒体与素材</h4>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      已选: {scheduleTargetIds.length}
                    </span>
                  </div>
                </div>

                {/* Grid for selected schedule target assets */}
                {scheduleTargetIds.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {scheduleTargetIds.map((id, index) => {
                      const matched = assets.find(a => a.id === id)
                      if (!matched) return null
                      const isVid = matched.mimeType.startsWith('video/')
                      return (
                        <div
                          key={id}
                          className="relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden dark:border-slate-800 dark:bg-slate-900 shadow-sm"
                        >
                          {isVid ? (
                            <video src={`${matched.url}#t=0.1`} preload="metadata" className="h-full w-full object-cover" muted />
                          ) : (
                            <img src={matched.url} className="h-full w-full object-cover" alt="" />
                          )}
                          {isVid && (
                            <div className="absolute bottom-1 right-1 bg-black/50 p-0.5 rounded">
                              <Play className="h-3 w-3 text-white fill-white" />
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 px-1 rounded text-[8px] font-black text-white bg-emerald-500/80">
                            素材库
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mx-5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800 w-full bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  const firstSelectedAccountId = scheduleSelectedAccountIds[0]
                  const account = brandAccounts.find((a) => a.id === firstSelectedAccountId)
                  if (account) {
                    setPreviewPlatform(account.platformId.toLowerCase())
                  } else {
                    setPreviewPlatform('instagram')
                  }
                  setPreviewMediaIndex(0)
                  setPreviewOpen(true)
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 mr-auto flex items-center gap-2"
              >
                <Eye className="h-4 w-4" /> 预览效果
              </button>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                disabled={creatingTask || !scheduleCaption.trim() || scheduleSelectedAccountIds.length === 0}
                onClick={handleConfirmScheduleAndTask}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {creatingTask ? '生成中...' : '生成 Post 草稿'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Preview Mockups Dialog */}
      {previewOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md" onClick={() => setPreviewOpen(false)}>
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
                    <span className="font-bold text-slate-400">正文字数:</span> {scheduleCaption.length} 字
                  </p>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-400">标签数量:</span> {parseTags(scheduleHashtags).length} 个
                  </p>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-400">媒体数量:</span> {scheduleTargetIds.length} 个
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
                        {attachedMedia[previewMediaIndex % attachedMedia.length]?.type === 'video' ? (
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
                        <span className="whitespace-pre-wrap">{scheduleCaption}</span>
                      </p>
                      {parseTags(scheduleHashtags).length > 0 && (
                        <p className="text-blue-600 dark:text-blue-400 font-medium text-left">
                          {parseTags(scheduleHashtags).map(tag => `#${tag}`).join(' ')}
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
                  <div className="relative aspect-[3/4] w-full bg-slate-55 dark:bg-slate-900 flex items-center justify-center">
                    {attachedMedia.length > 0 ? (
                      <>
                        {attachedMedia[previewMediaIndex % attachedMedia.length]?.type === 'video' ? (
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
                      {scheduleCaption.split('\n')[0]?.slice(0, 30) || 'Untitled Post'}
                    </h4>
                    <p className="mt-1 whitespace-pre-wrap text-[10px] leading-normal text-slate-700 dark:text-slate-300 text-left">
                      {scheduleCaption.split('\n').slice(1).join('\n') || scheduleCaption}
                    </p>
                    {parseTags(scheduleHashtags).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {parseTags(scheduleHashtags).map((tag) => (
                          <span key={tag} className="text-[10px] text-[#3a5b8f] dark:text-[#6a90d0] font-medium hover:underline cursor-pointer">#${tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* XHS Footer bar */}
                  <div className="flex items-center justify-between px-3 py-2 text-slate-500 dark:text-slate-400 text-[9px]">
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1 text-slate-400 dark:text-slate-500 text-[9px] mr-2.5 flex items-center">
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
                <div className="mx-auto w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900 text-black dark:text-white">
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
                  <div className="mt-2 text-[10px] leading-relaxed text-slate-800 dark:text-slate-200 text-left">
                    <p className="whitespace-pre-wrap">{scheduleCaption}</p>
                    {parseTags(scheduleHashtags).length > 0 && (
                      <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">
                        {parseTags(scheduleHashtags).map(tag => `#${tag}`).join(' ')}
                      </p>
                    )}
                  </div>

                  {/* FB Collage Layout */}
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-955 relative">
                    {attachedMedia.length === 0 ? (
                      <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-slate-400">
                        <ImageIcon className="h-8 w-8 text-slate-300" />
                        <span className="text-[10px] font-semibold">暂无媒体文件</span>
                      </div>
                    ) : (
                      <div className="relative aspect-video w-full">
                        {attachedMedia[previewMediaIndex % attachedMedia.length]?.type === 'video' ? (
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
                        {attachedMedia[0].type === 'video' ? (
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
                        <div className="w-4 h-4 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center overflow-hidden">
                          <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&auto=format" className="h-full w-full object-cover animate-spin" style={{ animationDuration: '6s' }} alt="" />
                        </div>
                      </div>
                    </div>

                    {/* TikTok Bottom Panel */}
                    <div className="absolute bottom-4 left-3 right-12 z-10 space-y-1.5 text-white text-[10px] text-left">
                      <p className="font-bold text-xs">@{activeAccount?.handle || brandName || 'brand_tiktok'}</p>
                      <p className="line-clamp-2 leading-relaxed text-white/90 whitespace-pre-wrap">{scheduleCaption}</p>
                      {parseTags(scheduleHashtags).length > 0 && (
                        <div className="flex gap-1 flex-wrap font-bold font-mono">
                          {parseTags(scheduleHashtags).map((tag) => (
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
                <div className="mx-auto w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900 text-black dark:text-white">
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
                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 relative">
                    {attachedMedia.length > 0 ? (
                      <div className="relative aspect-video w-full">
                        {attachedMedia[previewMediaIndex % attachedMedia.length]?.type === 'video' ? (
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

                  <div className="mt-2 text-[10px] leading-normal text-slate-700 dark:text-slate-300 text-left">
                    <p className="whitespace-pre-wrap">{scheduleCaption}</p>
                    {parseTags(scheduleHashtags).length > 0 && (
                      <p className="mt-1 text-blue-600 dark:text-blue-400 font-medium">
                        {parseTags(scheduleHashtags).map(tag => `#${tag}`).join(' ')}
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

      {/* Floating Bottom Bar for selection operations */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-3 px-5 py-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-2xl transition-all duration-355 transform scale-100 whitespace-nowrap select-none">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
            已选择 <span className="text-indigo-600 dark:text-indigo-400 text-sm font-black">{selected.length}</span> 项
          </span>
          
          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 shrink-0" />
          
          <button
            onClick={() => markForSchedule(selected)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 active:scale-95 transition-all"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>准备草稿排期(idea)</span>
          </button>
          
          <button
            onClick={handleBatchDeleteAssets}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>批量删除</span>
          </button>
          
          <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-800 shrink-0" />
          
          <button
            onClick={() => {
              setSelected([])
              setIsBatchSelectMode(false)
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-850 dark:hover:bg-slate-700 text-white active:scale-95 transition-all shadow-sm flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>取消选择</span>
          </button>
        </div>
      )}

    </div>
  )
}
