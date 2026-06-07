'use client'
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState } from 'react'
import { Search, Upload, Image as ImageIcon, Video, Tag, Check, Sparkles, Filter, X } from 'lucide-react'

// Category definitions
const CATEGORY_META = [
  { id: 'all', label: '全部', color: 'text-slate-500' },
  { id: 'food', label: '菜品', color: 'text-orange-500' },
  { id: 'interior', label: '店内环境', color: 'text-blue-500' },
  { id: 'event', label: '活动/节日', color: 'text-purple-500' },
  { id: 'review', label: '客户反馈', color: 'text-emerald-500' },
  { id: 'raw', label: '未分类', color: 'text-slate-400' },
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
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [assets, setAssets] = useState<DashboardAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams()
        if (brandId) query.set('brandId', brandId)
        const url = query.toString() ? `/api/dashboard/assets?${query.toString()}` : '/api/dashboard/assets'
        const res = await fetch(url)
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        if (!cancelled) setAssets(data.assets || [])
      } catch {
        if (!cancelled) setError('素材库加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [brandId])

  const toggleSelect = (id: string) => {
    setSelected(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id])
  }

  const filtered = assets.filter(a => {
    const catMatch = activeCategory === 'all' || toCategory(a) === activeCategory
    const query = search.trim().toLowerCase()
    const label = (a.aiCaption || a.filename || '').toLowerCase()
    const brand = a.brandName.toLowerCase()
    const tags = a.aiTags.some(t => t.toLowerCase().includes(query))
    const searchMatch = !query || label.includes(query) || brand.includes(query) || tags
    return catMatch && searchMatch
  })

  const categories = CATEGORY_META.map(cat => ({
    ...cat,
    count: cat.id === 'all' ? assets.length : assets.filter(asset => toCategory(asset) === cat.id).length,
  }))

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-36 space-y-6">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">素材库</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">AI 自动打标 · 随手投喂，自动沉淀为可复用素材</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
              <Sparkles className="w-4 h-4" /> AI 生成帖子 ({selected.length})
            </button>
          )}
          <label className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer shadow-sm shadow-emerald-500/20">
            <Upload className="w-4 h-4" /> 投喂素材
            <input type="file" multiple accept="image/*,video/*" className="hidden" />
          </label>
        </div>
      </div>

      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false) }}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
          ${dragOver ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${dragOver ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">拖拽图片/视频到这里，或者点击直接上传</p>
        <p className="text-xs text-slate-400 mt-1">AI 将自动识别内容并完成打标分类</p>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-400 transition-all">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索素材名称或标签..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400"
          />
          {search && <button onClick={() => setSearch('')}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>}
        </div>
        <button className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
          <Filter className="w-4 h-4" /> 筛选
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition-all
              ${activeCategory === cat.id
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
          >
            <span className={activeCategory === cat.id ? '' : (cat.color || '')}>{cat.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black
              ${activeCategory === cat.id ? 'bg-white/20 text-white dark:bg-black/20 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Selection bar */}
      {selected.length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">已选择 {selected.length} 张素材</span>
          <div className="flex items-center gap-2">
            <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline" onClick={() => setSelected([])}>取消选择</button>
            <button className="flex items-center gap-1.5 text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              <Sparkles className="w-3.5 h-3.5" /> 用于生成
            </button>
          </div>
        </div>
      )}

      {/* Asset Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {filtered.map((asset, i) => {
          const isSelected = selected.includes(asset.id)
          const category = toCategory(asset)
          const categoryMeta = categories.find(c => c.id === category)
          const previewable = isPreviewable(asset)
          const displayLabel = asset.aiCaption || asset.filename || '未命名素材'
          const dateLabel = relativeDate(asset.lastUsedAt || asset.createdAt)
          return (
            <div
              key={asset.id}
              onClick={() => toggleSelect(asset.id)}
              className={`group relative rounded-2xl overflow-hidden border cursor-pointer transition-all duration-200
                ${isSelected ? 'ring-2 ring-emerald-400 border-emerald-300 dark:border-emerald-600' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}`}
            >
              {/* Thumbnail placeholder */}
              <div className={`aspect-square bg-gradient-to-br ${GRADIENT_PLACEHOLDERS[i % GRADIENT_PLACEHOLDERS.length]} flex items-center justify-center overflow-hidden`}>
                {previewable && asset.mimeType.startsWith('image/') ? (
                  <img src={asset.url} alt={displayLabel} className="w-full h-full object-cover" />
                ) : previewable && asset.mimeType.startsWith('video/') ? (
                  <video src={asset.url} className="w-full h-full object-cover" muted playsInline loop autoPlay />
                ) : (
                  <div className="text-slate-400 dark:text-slate-500 opacity-50">
                    {asset.mimeType.startsWith('video/') ? <Video className="w-10 h-10" /> : <ImageIcon className="w-10 h-10" />}
                  </div>
                )}
              </div>

              {/* Select checkbox */}
              <div className={`absolute top-2 left-2 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all
                ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'bg-white/80 dark:bg-slate-900/80 border-slate-300 dark:border-slate-600 opacity-0 group-hover:opacity-100'}`}>
                {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </div>

              {/* Brand badge */}
              <div className="absolute top-2 right-2 bg-slate-900/75 text-white text-[9px] font-black px-2 py-0.5 rounded-full backdrop-blur-sm max-w-[72%] truncate">
                {asset.brandName}
              </div>

              {/* AI Ready badge */}
              {asset.aiReady && (
                <div className="absolute top-9 right-2 bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> AI就绪
                </div>
              )}

              {/* Type badge */}
              {asset.mimeType.startsWith('video/') && (
                <div className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Video className="w-2.5 h-2.5" /> 视频
                </div>
              )}

              {/* Info */}
              <div className="bg-white dark:bg-slate-900 p-3">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{displayLabel}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${categoryMeta?.color || 'text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                    {categoryMeta?.label || '未分类'}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">{asset.brandName}</span>
                </div>
                {asset.aiTags.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
                    <Tag className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                    <p className="text-[10px] text-slate-400 truncate">{asset.aiTags.slice(0, 2).join(' · ')}</p>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400">{dateLabel}</span>
                  {asset.usedCount > 0 && (
                    <span className="text-[10px] font-bold text-indigo-500">已用 {asset.usedCount} 次</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="py-16 text-center text-slate-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-bold text-slate-500">{assets.length === 0 ? '当前还没有素材' : '没有找到匹配的素材'}</p>
          <p className="text-sm mt-1">{assets.length === 0 ? '上传图片或视频后，AI 会自动识别并入库' : '试试修改搜索词或类别筛选'}</p>
        </div>
      )}

      {!loading && error && (
        <div className="px-1 text-xs text-rose-500 font-medium">{error}</div>
      )}

    </div>
  )
}
