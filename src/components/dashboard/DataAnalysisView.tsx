'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Search, ArrowUpDown, Camera, RefreshCw, Eye, X, 
  Store, Users, Smartphone, AlertCircle, CheckCircle2, Upload
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
    isUserUploaded?: boolean
    isReal?: boolean
  } | null
}

const getMainAppUrl = (path: string) => {
  if (typeof window === 'undefined') return path
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  const port = window.location.port
  
  if (port === '3001') {
    return `${protocol}//localhost:3000${path}`
  }
  
  if (hostname.startsWith('amc-mm.')) {
    const parentHost = hostname.replace(/^amc-mm\./, '')
    const portSuffix = port ? `:${port}` : ''
    return `${protocol}//${parentHost}${portSuffix}${path}`
  }
  
  return path
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📸',
  xiaohongshu: '📕',
  tiktok: '🎵',
  facebook: '👥',
  google: '🌐',
  youtube: '🎥',
}

const PLATFORM_BADGES: Record<string, { label: string; icon: string; className: string }> = {
  instagram: { 
    label: 'INSTAGRAM', 
    icon: '📸', 
    className: 'bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white border-none' 
  },
  tiktok: { 
    label: 'TIKTOK', 
    icon: '🎵', 
    className: 'bg-black text-white border border-slate-800' 
  },
  xiaohongshu: { 
    label: 'RED / 小红书', 
    icon: '📕', 
    className: 'bg-rose-600 text-white border-none' 
  },
  facebook: { 
    label: 'FACEBOOK', 
    icon: '👥', 
    className: 'bg-blue-600 text-white border-none' 
  },
  google: { 
    label: 'GOOGLE', 
    icon: '🌐', 
    className: 'bg-emerald-600 text-white border-none' 
  },
  youtube: { 
    label: 'YOUTUBE', 
    icon: '🎥', 
    className: 'bg-red-600 text-white border-none' 
  },
}

export default function DataAnalysisView() {
  const [items, setItems] = useState<SnapshotData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAccountId, setUploadingAccountId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)

  const triggerUpload = (accountId: string) => {
    setUploadingAccountId(accountId)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingAccountId) return

    setIsUploading(true)
    setUploadProgress(0)
    setNotification(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('accountId', uploadingAccountId)

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/data-analysis/upload')

        // Track upload progress
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(percentage)
          }
        }

        xhr.onload = () => {
          let json: any = {}
          try {
            json = JSON.parse(xhr.responseText)
          } catch (e) {}

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(json.error || '上传截图失败'))
          }
        }

        xhr.onerror = () => {
          reject(new Error('网络连接错误，上传失败'))
        }

        xhr.send(formData)
      })

      setNotification({ type: 'success', message: '截图上传并更新成功！' })
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败')
    } finally {
      setIsUploading(false)
      setUploadingAccountId(null)
      setUploadProgress(0)
    }
  }
  // Filters
  const [selectedBrand, setSelectedBrand] = useState('all')
  const [selectedPlatform, setSelectedPlatform] = useState('instagram')
  const [selectedOwner, setSelectedOwner] = useState('all')
  
  // Search & Sort
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  
  // UI State
  const [triggeringCrawler, setTriggeringCrawler] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<SnapshotData | null>(null)

  // Keep selectedAccount synced with items updates
  useEffect(() => {
    if (selectedAccount) {
      const updated = items.find(i => i.accountId === selectedAccount.accountId)
      if (updated) {
        setSelectedAccount(updated)
      }
    }
  }, [items, selectedAccount])

  // Login State
  const [loginModalAccount, setLoginModalAccount] = useState<SnapshotData | null>(null)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const handleInstagramLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginModalAccount) return
    setLoggingIn(true)
    setNotification(null)
    try {
      const res = await fetch('/api/researcher/login-instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: loginModalAccount.accountId,
          username: loginUsername,
          password: loginPassword,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || '登录并抓取快照失败')
      }
      setNotification({ type: 'success', message: `Instagram 账号 ${loginModalAccount.handle} 登录并截屏成功！` })
      setLoginModalAccount(null)
      setLoginUsername('')
      setLoginPassword('')
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoggingIn(false)
    }
  }

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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredItems.map((item) => {
            const hasSnapshot = !!item.latestSnapshot
            
            // Format Platform Name
            const platformLabel = PLATFORM_BADGES[item.platformId]?.label || item.platformId.toUpperCase()
            
            // Format Time
            const timeStr = item.latestSnapshot?.capturedAt
              ? new Date(item.latestSnapshot.capturedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              : '暂无时间'
              
            return (
              <div 
                key={item.accountId}
                onClick={() => setSelectedAccount(item)}
                className="group relative flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-1 gap-2.5"
              >
                {/* Title Header at the top-left */}
                <div className="text-left select-none pl-0.5 shrink-0">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {item.brand.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                    {platformLabel} - {timeStr}
                  </p>
                </div>

                {/* Real-time upload progress overlay */}
                {isUploading && uploadingAccountId === item.accountId ? (
                  <div className="relative w-full aspect-[2/3] bg-slate-950/85 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center text-white p-4 z-10 animate-in fade-in duration-200">
                    <div className="relative w-14 h-14 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-800 border-t-emerald-500 animate-spin" />
                      <span className="text-[10px] font-black text-emerald-400">{uploadProgress}%</span>
                    </div>
                    <span className="text-[11px] font-black text-slate-200 mt-3 tracking-wide">正在上传截图...</span>
                    <div className="w-2/3 bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden shadow-inner">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-150" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : hasSnapshot ? (
                  <div className="relative w-full overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/40">
                    <img 
                      src={getMainAppUrl(item.latestSnapshot!.imageUrl)} 
                      alt={`${item.handle} Snapshot`}
                      className="w-full h-auto object-contain block transition-transform duration-500 group-hover:scale-[1.01]"
                      loading="lazy"
                    />

                    {/* Hover detail clue */}
                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <span className="px-3.5 py-1.5 bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 rounded-full font-bold text-[10px] shadow-sm transform translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
                        查看详情
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full aspect-[2/3] flex flex-col items-center justify-center p-4 text-center text-slate-450 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-dashed border-slate-200 dark:border-slate-800/60">
                    <Camera className="w-7 h-7 text-slate-350 dark:text-slate-700 mb-2" />
                    <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
                      暂无快照
                    </span>
                    <p className="text-[9px] text-slate-400 mt-2 max-w-[130px] leading-relaxed font-semibold">
                      点击卡片登录并获取自动截图，或手动上传最新快照。
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Snapshot details Modal */}
      {selectedAccount && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setSelectedAccount(null)}
        >
          <div 
            className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black dark:bg-white dark:text-slate-900 shrink-0">
                  {selectedAccount.brand.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{selectedAccount.brand.name}</span>
                    {selectedAccount.brand.location && (
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-semibold">{selectedAccount.brand.location}</span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                    <span>{PLATFORM_ICONS[selectedAccount.platformId]}</span>
                    <span>{selectedAccount.handle}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedAccount(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content: 2-Column layout */}
            <div className="flex-1 overflow-y-auto flex flex-col md:flex-row min-h-0">
              {/* Left Column: Full Screenshot Image */}
              <div className="flex-1 bg-slate-950 p-6 flex items-center justify-center min-h-[300px] md:min-h-0 overflow-y-auto max-h-[50vh] md:max-h-none border-b md:border-b-0 md:border-r border-slate-150 dark:border-slate-800">
                {selectedAccount.latestSnapshot ? (
                  <img 
                    src={getMainAppUrl(selectedAccount.latestSnapshot.imageUrl)} 
                    className="max-w-full max-h-[70vh] object-contain rounded-xl border border-slate-800" 
                    alt="Full Account Snapshot" 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
                    <Camera className="w-12 h-12 text-slate-700 mb-2 animate-pulse" />
                    <p className="text-sm font-bold text-slate-400">暂无该账号的抓取快照</p>
                  </div>
                )}
              </div>

              {/* Right Column: Account Details & Actions */}
              <div className="w-full md:w-80 p-6 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0 space-y-6">
                <div className="space-y-5">
                  {/* Stats & Info Section */}
                  <div className="space-y-3.5">
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">账号明细</h4>
                    <div className="space-y-2 bg-white dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-855 shadow-sm text-xs">
                      <div className="flex justify-between py-1">
                        <span className="text-slate-450 font-bold">平台渠道</span>
                        <span className="font-black text-slate-800 dark:text-slate-200 uppercase">{selectedAccount.platformId}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-450 font-bold">粉丝数量</span>
                        <span className="font-black text-slate-800 dark:text-slate-200">
                          {selectedAccount.followerCount ? `${selectedAccount.followerCount.toLocaleString()}` : '--'}
                        </span>
                      </div>
                      {selectedAccount.ratingScore !== null && (
                        <div className="flex justify-between py-1">
                          <span className="text-slate-450 font-bold">评分星级</span>
                          <span className="font-black text-slate-800 dark:text-slate-200">⭐ {selectedAccount.ratingScore.toFixed(1)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1">
                        <span className="text-slate-450 font-bold">更新时间</span>
                        <span className="font-black text-slate-800 dark:text-slate-200">
                          {selectedAccount.latestSnapshot 
                            ? new Date(selectedAccount.latestSnapshot.capturedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '未抓取'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-450 font-bold">快照状态</span>
                        <span className="font-black">
                          {selectedAccount.latestSnapshot?.isUserUploaded ? (
                            <span className="text-emerald-500">👤 用户手动上传</span>
                          ) : selectedAccount.latestSnapshot?.isReal ? (
                            <span className="text-blue-500">🤖 AI 真实抓取</span>
                          ) : selectedAccount.latestSnapshot ? (
                            <span className="text-amber-500">⚠️ 未验证快照</span>
                          ) : (
                            <span className="text-slate-400">无数据</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Owners Section */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">账号主理人</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAccount.owners.length === 0 ? (
                        <span className="text-xs text-slate-450 italic">未绑定主理人</span>
                      ) : (
                        selectedAccount.owners.map(owner => (
                          <div 
                            key={owner.id} 
                            className="text-xs font-bold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-350 px-3 py-1 rounded-xl shadow-sm"
                          >
                            <span className="font-black text-slate-850 dark:text-white">{owner.nickname}</span>
                            <span className="text-[10px] text-slate-450 block">{owner.email}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
                  {selectedAccount.profileUrl && (
                    <a
                      href={selectedAccount.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-755 text-white rounded-xl shadow transition-all active:scale-95 flex items-center justify-center gap-1.5 font-bold text-xs text-center"
                    >
                      <Store className="w-4 h-4" /> 访问主页
                    </a>
                  )}
                  
                  <button
                    onClick={() => triggerUpload(selectedAccount.accountId)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow transition-all active:scale-95 flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
                  >
                    <Upload className="w-4 h-4" /> 手动上传最新截图
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginModalAccount(selectedAccount)
                      setLoginUsername('')
                      setLoginPassword('')
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-700 dark:border-slate-800 text-slate-200 dark:text-slate-300 rounded-xl shadow transition-all active:scale-95 flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
                  >
                    <span>🔑 重新登录并抓取</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Instagram Login Modal */}
      {loginModalAccount && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !loggingIn && setLoginModalAccount(null)}
        >
          <form 
            onSubmit={handleInstagramLogin}
            className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full p-5 space-y-4 text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Instagram 登录授权
              </h3>
              <button 
                type="button"
                disabled={loggingIn}
                onClick={() => setLoginModalAccount(null)}
                className="p-1 text-slate-400 hover:text-slate-650 dark:hover:text-white cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              请输入账号 <strong>{loginModalAccount.handle}</strong> 的 Instagram 登录凭证。系统将启动后台 Playwright 浏览器模拟登录并安全保存会话 Cookies，以支持自动截图抓取。
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">手机号、用户名或邮箱</label>
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  disabled={loggingIn}
                  placeholder="Username, email, or phone"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">密码</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  disabled={loggingIn}
                  placeholder="Instagram password"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={loggingIn}
                onClick={() => setLoginModalAccount(null)}
                className="px-4 py-2 border border-slate-250 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-350 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loggingIn}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                {loggingIn ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>登录授权中...</span>
                  </>
                ) : (
                  <span>确认并登录</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Hidden file input for screenshot uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />
    </div>
  )
}
