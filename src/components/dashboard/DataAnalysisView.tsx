'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback } from 'react'
import { 
  Search, ArrowUpDown, Camera, RefreshCw, Eye, X, 
  Store, Users, Smartphone, AlertCircle, CheckCircle2 
} from 'lucide-react'

interface SnapshotData {
  accountId: string
  platformId: string
  handle: string
  profileUrl: string | null
  followerCount: number | null
  ratingScore: number | null
  snapshotAt: string | null
  brand: {
    id: string
    name: string
    location: string | null
  }
  owners: Array<{
    id: string
    email: string
    nickname: string
  }>
  latestSnapshot: {
    id: string
    imageUrl: string
    capturedAt: string
  } | null
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📸',
  xiaohongshu: '📕',
  tiktok: '🎵',
  facebook: '👥',
  google: '🌐',
  youtube: '🎥',
}

export default function DataAnalysisView() {
  const [items, setItems] = useState<SnapshotData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [selectedBrand, setSelectedBrand] = useState('all')
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [selectedOwner, setSelectedOwner] = useState('all')
  
  // Search & Sort
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  
  // UI State
  const [triggeringCrawler, setTriggeringCrawler] = useState(false)
  const [activeSnapshotUrl, setActiveSnapshotUrl] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/data-analysis?sortOrder=${sortOrder}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '加载账号展现数据失败')
      }
      const json = await res.json()
      setItems(json.results || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [sortOrder])

  useEffect(() => {
    loadData()
  }, [loadData])

  const triggerCrawler = async () => {
    if (triggeringCrawler) return
    setTriggeringCrawler(true)
    setNotification(null)
    try {
      const res = await fetch('/api/researcher/capture-snapshots', { method: 'POST' })
      if (res.ok) {
        setNotification({ type: 'success', message: '已成功在后台启动截图抓取任务，请稍后刷新页面查看结果。' })
        setTimeout(() => {
          loadData()
        }, 5000) // Wait 5 seconds and reload
      } else {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || '触发截图抓取失败')
      }
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : '触发失败' })
    } finally {
      setTriggeringCrawler(false)
    }
  }

  // Extract filter options dynamically from items
  const brandOptions = React.useMemo(() => {
    const brands = new Map<string, string>()
    items.forEach(item => brands.set(item.brand.id, item.brand.name))
    return Array.from(brands.entries()).map(([id, name]) => ({ value: id, label: name }))
  }, [items])

  const platformOptions = React.useMemo(() => {
    const platforms = new Set<string>()
    items.forEach(item => platforms.add(item.platformId))
    return Array.from(platforms).map(p => ({ value: p, label: p.toUpperCase() }))
  }, [items])

  const ownerOptions = React.useMemo(() => {
    const owners = new Map<string, string>()
    items.forEach(item => {
      item.owners.forEach(owner => owners.set(owner.id, owner.nickname))
    })
    return Array.from(owners.entries()).map(([id, nickname]) => ({ value: id, label: nickname }))
  }, [items])

  // Filter & Search matching
  const filteredItems = React.useMemo(() => {
    return items.filter(item => {
      if (selectedBrand !== 'all' && item.brand.id !== selectedBrand) return false
      if (selectedPlatform !== 'all' && item.platformId !== selectedPlatform) return false
      if (selectedOwner !== 'all' && !item.owners.some(o => o.id === selectedOwner)) return false
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchHandle = item.handle.toLowerCase().includes(query)
        const matchBrand = item.brand.name.toLowerCase().includes(query)
        const matchOwners = item.owners.some(o => o.nickname.toLowerCase().includes(query))
        if (!matchHandle && !matchBrand && !matchOwners) return false
      }
      
      return true
    })
  }, [items, selectedBrand, selectedPlatform, selectedOwner, searchQuery])

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6">
      {/* Top Title & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-150 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Camera className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            <span>账号展现看板 (Data Analysis)</span>
          </h2>
          <p className="text-xs text-slate-400 font-bold mt-1">展示各品牌社交媒体账号的最新真实主页快照，由 AMC Researcher 定期回采更新。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
            title="刷新数据"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={triggerCrawler}
            disabled={triggeringCrawler || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            <span>{triggeringCrawler ? '正在抓取...' : '重新抓取全部快照'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 text-sm transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
          notification.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-300'
            : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-sm flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索账号名、品牌或主理人..."
            className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-850 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
          />
        </div>

        {/* Filter Brand */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase">品牌</span>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="all">全部品牌</option>
            {brandOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Filter Platform */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase">平台</span>
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="all">全部平台</option>
            {platformOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Filter Owner */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase">主理人</span>
          <select
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="all">全部主理人</option>
            {ownerOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Sort Brands */}
        <button
          onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>排序: 品牌名 ({sortOrder === 'asc' ? 'A-Z' : 'Z-A'})</span>
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center min-h-[40vh] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-indigo-650 animate-spin mb-4" />
          <p className="text-sm font-semibold text-slate-400">正在读取快照看板中...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm min-h-[40vh] flex flex-col items-center justify-center">
          <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
          <h3 className="text-base font-extrabold text-slate-700 dark:text-slate-200">未找到符合条件的账号快照</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">请检查您的过滤器，或尝试点击“重新抓取全部快照”生成测试快照数据。</p>
        </div>
      ) : (
        /* Snapshots Grid Card list */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const hasSnapshot = !!item.latestSnapshot
            return (
              <div 
                key={item.accountId}
                className="group bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden"
              >
                {/* Header card info */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center text-sm font-black dark:bg-white dark:text-slate-900 flex-shrink-0">
                      {item.brand.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-slate-950 dark:text-white truncate flex items-center gap-1.5">
                        <span>{item.brand.name}</span>
                        {item.brand.location && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-semibold">{item.brand.location}</span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-400 font-bold flex items-center gap-1.5 mt-0.5 truncate">
                        <span>{PLATFORM_ICONS[item.platformId] || '🔗'}</span>
                        <span className="text-slate-650 dark:text-slate-300 font-black">{item.handle}</span>
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-150 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                    {item.platformId}
                  </span>
                </div>

                {/* Body: Owners (主理人) */}
                <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[10px] font-black text-slate-400 shrink-0 uppercase tracking-wide">主理人:</span>
                  <div className="flex gap-1">
                    {item.owners.length === 0 ? (
                      <span className="text-[10px] text-slate-400 italic">未绑定</span>
                    ) : (
                      item.owners.map(owner => (
                        <span 
                          key={owner.id} 
                          className="text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 px-2 py-0.5 rounded-md shadow-sm shrink-0"
                        >
                          {owner.nickname}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Screenshot Display Area */}
                <div className="relative aspect-[4/5] bg-slate-900 flex items-center justify-center overflow-hidden border-b border-slate-100 dark:border-slate-800 group/snapshot">
                  {hasSnapshot ? (
                    <>
                      <img 
                        src={item.latestSnapshot!.imageUrl} 
                        alt={`${item.handle} Snapshot`}
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover/snapshot:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/snapshot:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button
                          onClick={() => setActiveSnapshotUrl(item.latestSnapshot!.imageUrl)}
                          className="p-3 bg-white hover:bg-slate-100 text-slate-900 rounded-full shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 font-bold text-xs"
                        >
                          <Eye className="w-4 h-4" /> 查看大图
                        </button>
                        {item.profileUrl && (
                          <a
                            href={item.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 font-bold text-xs"
                          >
                            <Store className="w-4 h-4" /> 访问主页
                          </a>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center p-6 text-center text-slate-500">
                      <Camera className="w-12 h-12 text-slate-600 dark:text-slate-700 mb-3" />
                      <p className="text-sm font-extrabold">暂无主页快照</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">待 AMC Researcher 执行抓取任务后自动呈现。</p>
                    </div>
                  )}
                </div>

                {/* Footer details */}
                <div className="p-4 bg-slate-50/30 dark:bg-slate-950/10 flex items-center justify-between text-xs text-slate-400 font-bold mt-auto">
                  <span className="flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    <span>粉丝: {item.followerCount ? `${item.followerCount.toLocaleString()}` : '--'}</span>
                  </span>
                  <span>
                    {hasSnapshot 
                      ? `更新: ${new Date(item.latestSnapshot!.capturedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` 
                      : '未抓取'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Snapshot zoom Modal */}
      {activeSnapshotUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setActiveSnapshotUrl(null)}
        >
          <div 
            className="relative bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
              <span className="text-xs font-bold text-slate-400">快照大图预览</span>
              <button 
                onClick={() => setActiveSnapshotUrl(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-slate-950">
              <img 
                src={activeSnapshotUrl} 
                className="max-w-full h-auto object-contain rounded-xl border border-slate-800" 
                alt="Full Snapshot" 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
