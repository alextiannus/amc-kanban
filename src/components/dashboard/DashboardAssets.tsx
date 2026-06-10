'use client'
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState, useRef } from 'react'
import {
  Search,
  Upload,
  Image as ImageIcon,
  Video,
  Tag,
  Check,
  Sparkles,
  Filter,
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
  Users,
  Play,
  Settings,
  ChevronDown,
  CheckCircle2,
  RefreshCw
} from 'lucide-react'

// Category definitions
const CATEGORY_META = [
  { id: 'all', label: '全部', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  { id: 'food', label: '菜品', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
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
  return asset.aiCategory || 'raw'
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

interface DashboardAssetsProps {
  brandId?: string
}

export default function DashboardAssets({ brandId }: DashboardAssetsProps) {
  const simulationEnabled = process.env.NODE_ENV !== 'production'
  const [activeCategory, setActiveCategory] = useState('all')
  const [viewFilter, setViewFilter] = useState<'all' | 'recent' | 'unused' | 'high_perf' | 'ai_pending' | 'images' | 'videos'>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  
  const [assets, setAssets] = useState<DashboardAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [targetFolder, setTargetFolder] = useState('素材库')
  const [moveFolder, setMoveFolder] = useState('')

  // Tag confirmation state edits
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [editFilename, setEditFilename] = useState('')
  const [editCaption, setEditCaption] = useState('')

  // Bulk Tagging simulator state
  const [bulkTaggingActive, setBulkTaggingActive] = useState(false)
  const [bulkTagProgress, setBulkTagProgress] = useState(0)

  // Image-to-Video Simulator State
  const [videoGenAsset, setVideoGenAsset] = useState<DashboardAsset | null>(null)
  const [videoGenProgress, setVideoGenProgress] = useState(0)
  const [videoGenStep, setVideoGenStep] = useState(0)
  const [videoGenFinished, setVideoGenFinished] = useState(false)

  // Batch Tags Input
  const [batchTagsText, setBatchTagsText] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAssets = async (cancelled = false) => {
    setLoading(true)
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
          setActiveAssetId(loadedAssets[0].id)
        }
      }
    } catch {
      if (!cancelled) setError('素材库加载失败')
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void loadAssets(cancelled)
    return () => { cancelled = true }
  }, [brandId])

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setSelected(p => {
      const isSel = p.includes(id)
      const next = isSel ? p.filter(s => s !== id) : [...p, id]
      return next
    })
    setActiveAssetId(id)
  }

  const handleCardClick = (id: string) => {
    setActiveAssetId(id)
  }

  // Filter logic
  const filtered = assets.filter(a => {
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

  const activeAsset = assets.find(a => a.id === activeAssetId) || filtered[0] || assets[0]

  // Batch mark pending assets as ready by syncing to backend.
  const startBulkTagging = async () => {
    if (!brandId) {
      setError('请先选择品牌')
      return
    }
    const pendingIds = assets.filter(a => !a.aiReady).map(a => a.id)
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
          body: JSON.stringify({ aiReady: true }),
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

  // Start Single/Batch Video Generation
  const handleStartVideoGen = (asset: DashboardAsset) => {
    if (!simulationEnabled) {
      setError('图生视频为下一期开发计划，当前环境暂未开放。')
      return
    }
    setVideoGenAsset(asset)
    setVideoGenProgress(0)
    setVideoGenStep(0)
    setVideoGenFinished(false)

    const interval = setInterval(() => {
      setVideoGenProgress(prev => {
        const next = prev + 4
        if (next >= 100) {
          clearInterval(interval)
          setVideoGenFinished(true)
          return 100
        }
        // Step text updater
        if (next < 25) setVideoGenStep(0)
        else if (next < 50) setVideoGenStep(1)
        else if (next < 75) setVideoGenStep(2)
        else setVideoGenStep(3)
        return next
      })
    }, 120)
  }

  // Save generated video simulation
  const handleSaveGeneratedVideo = async () => {
    if (!simulationEnabled) {
      setError('生产环境已禁用演示图生视频，请上传真实视频素材。')
      return
    }
    if (!videoGenAsset || !brandId) return
    setUploading(true)
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const newVideoAsset: DashboardAsset = {
        id: `mock-video-${Date.now()}`,
        brandId,
        brandName: videoGenAsset.brandName,
        url: videoGenAsset.url, // reuse url for preview animation
        filename: `${videoGenAsset.filename?.split('.')[0] || 'generated'}_motion.mp4`,
        mimeType: 'video/mp4',
        aiTags: [...videoGenAsset.aiTags, 'AI图生视频', '动态视觉'],
        aiCategory: videoGenAsset.aiCategory || 'food',
        aiCaption: `AI 动态视频：由 “${videoGenAsset.aiCaption || '静态素材'}” 图生视频生成，动态光影饱满。`,
        aiReady: true,
        usedCount: 0,
        lastUsedAt: null,
        sourceType: 'AI_GENERATED',
        createdAt: new Date().toISOString()
      }

      setAssets(prev => [newVideoAsset, ...prev])
      setVideoGenAsset(null)
      setSelected([])
      alert('动态视频已成功保存至素材库！')
    } catch {
      setError('保存视频失败')
    } finally {
      setUploading(false)
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
    try {
      for (const file of fileList) {
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
            mimeType: file.type || 'application/octet-stream',
            fileBase64,
            folder: targetFolder,
            aiCategory: targetFolder === '素材库' ? 'raw' : targetFolder,
            aiTags: [targetFolder, '待确认'],
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || '素材上传失败')
      }
      await loadAssets()
    } catch (e) {
      setError(e instanceof Error ? e.message : '素材上传失败')
    } finally {
      setUploading(false)
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
    const newTags = batchTagsText.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean)
    try {
      await Promise.all(selected.map((assetId) => {
        const original = assets.find(a => a.id === assetId)
        const combinedTags = Array.from(new Set([...(original?.aiTags || []), ...newTags]))
        const payload: Record<string, any> = { aiTags: combinedTags, aiReady: true }
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
      setSelected([])
      setBatchTagsText('')
      setMoveFolder('')
      await loadAssets()
    } catch {
      setError('批量更新素材失败')
    } finally {
      setUploading(false)
    }
  }

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

        <div className="flex-1 overflow-y-auto min-h-0 pt-2 border-t border-slate-100 dark:border-slate-800">
          <h3 className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>标签浏览</span>
            <Plus className="w-3.5 h-3.5 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300" />
          </h3>
          <div className="flex flex-wrap gap-2 px-2">
            {CATEGORY_META.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-all border ${activeCategory === cat.id ? 'bg-slate-800 border-slate-800 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm font-bold' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'}`}
              >
                #{cat.label}
              </button>
            ))}
          </div>
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
              营销素材知识库
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
              <span>{uploading ? '上传中...' : '上传素材'}</span>
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
            value={targetFolder}
            onChange={(e) => setTargetFolder(e.target.value)}
            className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 outline-none hover:bg-slate-50 transition-all"
          >
            <option value="素材库">根目录 (素材库)</option>
            <option value="菜品">菜品目录</option>
            <option value="环境">环境目录</option>
            <option value="活动">活动目录</option>
          </select>
        </div>

        {/* Scrollable grid wrapper */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/40 dark:bg-slate-950/20">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Grid Layout */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
              {filtered.map((asset, i) => {
                const isSelected = selected.includes(asset.id)
                const isActive = activeAssetId === asset.id
                const previewable = isPreviewable(asset)
                const isVideo = asset.mimeType.startsWith('video/')
                
                // Determine Status Badge styles
                let statusColor = 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30'
                let statusLabel = 'Pending'
                if (asset.sourceType === 'UGC' || asset.aiTags.includes('UGC')) {
                  statusColor = 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30'
                  statusLabel = 'UGC'
                } else if (asset.aiReady) {
                  statusColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30'
                  statusLabel = 'Approved'
                }

                return (
                  <div
                    key={asset.id}
                    onClick={() => handleCardClick(asset.id)}
                    className={`group flex flex-col bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border cursor-pointer transition-all duration-200 select-none shadow-sm ${isActive ? 'ring-2 ring-indigo-500 border-indigo-500' : isSelected ? 'ring-2 ring-indigo-500/50 border-indigo-500/50' : 'border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md'}`}
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
                          <img
                            src={asset.url}
                            alt="video thumbnail"
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
                        className={`absolute top-2 left-2 w-5.5 h-5.5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500 scale-100' : 'bg-white/80 dark:bg-slate-900/80 border-slate-300 dark:border-slate-600 opacity-0 group-hover:opacity-100 hover:scale-105'}`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>

                      {/* Brand Label */}
                      <div className="absolute bottom-2 left-2 bg-slate-900/75 text-white text-[9px] font-black px-1.5 py-0.5 rounded backdrop-blur-sm truncate max-w-[85%]">
                        {asset.brandName}
                      </div>
                    </div>

                    {/* Card Footer Detail */}
                    <div className="px-3 py-2 bg-white dark:bg-slate-900 flex items-center justify-between border-t border-slate-100/60 dark:border-slate-800/60 text-[10px] select-none">
                      <div>
                        {isVideo ? (
                          <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                            <Video className="w-2.5 h-2.5" /> 视频
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">
                            {relativeDate(asset.lastUsedAt || asset.createdAt)}
                          </span>
                        )}
                      </div>
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
                onClick={() => setSelected([])}
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
                <input
                  type="text"
                  value={moveFolder}
                  onChange={(e) => setMoveFolder(e.target.value)}
                  placeholder="输入目标文件夹名称"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Set usage plan */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  使用排期排程
                </h4>
                <button
                  onClick={() => setError('请在日历/草稿模块设置真实发布排期。')}
                  className="w-full py-2.5 border border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>标记为排期使用</span>
                </button>
              </div>
            </div>

            {/* Bottom actions container */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <button
                onClick={() => {
                  const firstSelected = assets.find(a => selected.includes(a.id))
                  if (firstSelected) handleStartVideoGen(firstSelected)
                }}
                className="w-full mb-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all border border-slate-200/50 dark:border-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
                title={simulationEnabled ? '批量图生视频' : '下一期开发计划'}
                disabled={!simulationEnabled}
              >
                <Video className="w-4 h-4 text-indigo-500" />
                <span>{simulationEnabled ? '批量图生视频' : '批量图生视频（下一期）'}</span>
              </button>

              <button
                onClick={applyBatchChanges}
                disabled={uploading}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Check className="w-4 h-4" />
                <span>{uploading ? '提交中...' : '应用更改'}</span>
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
                <div className="aspect-[4/3] w-full bg-slate-200 dark:bg-slate-800 relative flex items-center justify-center">
                  <img src={activeAsset.url} alt="detail asset" className="w-full h-full object-cover" />
                  {activeAsset.mimeType.startsWith('video/') && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  )}
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
                          if (val && !activeAsset.aiTags.includes(val)) {
                            const updated = [...activeAsset.aiTags, val]
                            void updateAssetTags(activeAsset.id, updated)
                            e.currentTarget.value = ''
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
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <button
                onClick={() => handleStartVideoGen(activeAsset)}
                className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 mb-2 active:scale-[0.98] transition-all border border-slate-200/50 dark:border-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
                title={simulationEnabled ? '图生视频' : '下一期开发计划'}
                disabled={!simulationEnabled}
              >
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span>{simulationEnabled ? '图生视频' : '图生视频（下一期）'}</span>
              </button>

              <button
                onClick={() => setError('请前往草稿管理模块创建并关联素材生成推文。')}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>生成新推文</span>
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

      {/* 4. IMAGE-TO-VIDEO GENERATOR MODAL */}
      {simulationEnabled && videoGenAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden max-w-4xl w-full border border-slate-100 dark:border-slate-800 shadow-2xl flex flex-col md:flex-row relative animate-in zoom-in-95 duration-200">
            
            {/* Close button */}
            {!uploading && (
              <button
                onClick={() => setVideoGenAsset(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-slate-950/40 hover:bg-slate-950/60 rounded-full text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Left: Input Image */}
            <div className="md:w-1/2 bg-slate-100 dark:bg-slate-950 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 bg-slate-200 dark:bg-slate-850 px-2 py-0.5 rounded-full">
                  输入静态图像
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2">
                  {videoGenAsset.filename || '素材图片'}
                </h3>
              </div>

              <div className="aspect-square rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-800 bg-slate-200 dark:bg-slate-900 my-4 shadow-sm">
                <img src={videoGenAsset.url} alt="Original input" className="w-full h-full object-cover" />
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                画面主体: {videoGenAsset.aiCaption || '未分类美食主体'}
              </p>
            </div>

            {/* Right: Generation Screen / Video Preview */}
            <div className="md:w-1/2 p-6 flex flex-col justify-between bg-white dark:bg-slate-900">
              {!videoGenFinished ? (
                /* Processing screen */
                <div className="flex-1 flex flex-col items-center justify-center py-12">
                  <div className="relative w-24 h-24 mb-6">
                    {/* Glowing rotating circle */}
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100 dark:border-indigo-950/40 border-t-indigo-500 animate-spin"></div>
                    <div className="absolute inset-2 bg-indigo-50 dark:bg-indigo-950/20 rounded-full flex items-center justify-center text-indigo-500 animate-pulse">
                      <Sparkles className="w-8 h-8" />
                    </div>
                  </div>
                  
                  <h4 className="text-md font-bold text-slate-900 dark:text-white">AI 智能视频生成中</h4>
                  <div className="w-64 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-4 shadow-inner">
                    <div
                      className="bg-indigo-500 h-full transition-all duration-150"
                      style={{ width: `${videoGenProgress}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 font-mono">{videoGenProgress}%</span>

                  {/* Processing steps list */}
                  <div className="mt-6 space-y-2 text-left w-64">
                    {[
                      '分析画面光影与物体轮廓',
                      '插值计算 3D 深度场与动作流',
                      '生成时间一致性动态帧',
                      '渲染高精度 4K H.264 视频'
                    ].map((stepText, idx) => {
                      const isActive = videoGenStep === idx
                      const isDone = videoGenStep > idx
                      return (
                        <div
                          key={stepText}
                          className={`flex items-center gap-2 text-xs transition-colors ${isActive ? 'text-indigo-500 font-bold' : isDone ? 'text-emerald-500 font-medium' : 'text-slate-400'}`}
                        >
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${isActive ? 'bg-indigo-500 text-white animate-pulse' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                            {isDone ? '✓' : idx + 1}
                          </div>
                          <span>{stepText}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* Finished generated preview */
                <div className="flex-1 flex flex-col justify-between h-full">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-wider text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full">
                      已生成动态视频
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2">
                      {videoGenAsset.filename?.split('.')[0]}_motion.mp4
                    </h3>
                  </div>

                  {/* Generated Cinematic simulated player */}
                  <div className="aspect-square rounded-2xl overflow-hidden border-2 border-indigo-500 bg-slate-950 my-4 shadow-lg shadow-indigo-500/10 relative group">
                    <img
                      src={videoGenAsset.url}
                      alt="cinematic video render"
                      className="w-full h-full object-cover scale-100 origin-center animate-pan-zoom"
                      style={{
                        animation: 'panZoom 8s ease-in-out infinite'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex flex-col justify-between p-3.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="self-end bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                        <Sparkles className="w-2.5 h-2.5" /> AI 运动增强
                      </div>
                      
                      {/* Control bar */}
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center text-slate-900 cursor-pointer">
                          <Play className="w-3.5 h-3.5 fill-slate-900 text-slate-900 ml-0.5" />
                        </div>
                        {/* Mock timeline progress scrubber */}
                        <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 w-1/3 animate-[pulse_2s_infinite]"></div>
                        </div>
                        <span className="text-[10px] text-white font-mono">0:04</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-normal mb-4">
                    💡 **AI 渲染报告**：采用时间流网格与深度视差算法。画面中烟雾和液体高光平滑流动，循环衔接优异。
                  </p>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setVideoGenAsset(null)}
                      className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                      重新生成
                    </button>
                    <button
                      onClick={handleSaveGeneratedVideo}
                      disabled={uploading}
                      className="flex-1 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{uploading ? '保存中...' : '保存至素材库'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Embedded Ken Burns effect CSS */}
      <style>{`
        @keyframes panZoom {
          0% { transform: scale(1) translate(0, 0); }
          25% { transform: scale(1.1) translate(-1%, 1%); }
          50% { transform: scale(1.15) translate(1%, -1%); }
          75% { transform: scale(1.08) translate(-1%, -1%); }
          100% { transform: scale(1) translate(0, 0); }
        }
        .animate-pan-zoom {
          animation: panZoom 8s ease-in-out infinite;
        }
      `}</style>

    </div>
  )
}
