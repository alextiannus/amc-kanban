'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  Play, Pause, ChevronLeft, ChevronRight, Maximize, Minimize, 
  Clock, QrCode, Grid, RefreshCw, AlertCircle, LayoutList, 
  HelpCircle, Eye, Settings, Calendar, Smartphone, Users, MapPin
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'

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

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'from-purple-600 via-pink-650 to-orange-500',
  tiktok: 'from-slate-900 to-black border border-slate-800',
  xiaohongshu: 'from-rose-600 to-red-700',
  facebook: 'from-blue-600 to-indigo-700',
  google: 'from-emerald-600 to-teal-700',
  youtube: 'from-red-600 to-rose-700',
}

function PresentationContent() {
  const searchParams = useSearchParams()
  const brandIdFilter = searchParams?.get('brandId')
  const platformIdFilter = searchParams?.get('platformId')

  // Data states
  const [items, setItems] = useState<SnapshotData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carousel & Autoplay States
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [speed, setSpeed] = useState(10000) // Default 10s
  const [transitionStyle, setTransitionStyle] = useState<'zoom' | 'fade' | 'slide' | 'flip'>('zoom')
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single')
  const [progress, setProgress] = useState(0)

  // Interactive controls
  const [showQrCode, setShowQrCode] = useState(true)
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showHelp, setShowHelp] = useState(false)

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressTimerRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(Date.now())

  // Digital Clock state
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  // Sync clock
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(clockTimer)
  }, [])

  // Hide controls after 3 seconds of mouse inactivity
  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [handleMouseMove])

  // Fetch snapshots
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let url = '/api/public/snapshots?sortOrder=asc'
      if (brandIdFilter) url += `&brandId=${brandIdFilter}`
      if (platformIdFilter) url += `&platformId=${platformIdFilter}`

      const res = await fetch(url)
      if (!res.ok) throw new Error('加载数据失败')
      const json = await res.json()
      
      // Filter out accounts that have no screenshots
      const listWithSnapshots = (json.results || []).filter((item: SnapshotData) => !!item.latestSnapshot)
      setItems(listWithSnapshots)
      setActiveIndex(0)
      setProgress(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [brandIdFilter, platformIdFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Generate shareable QR Code
  useEffect(() => {
    if (typeof window !== 'undefined') {
      QRCode.toDataURL(window.location.href, {
        margin: 1,
        width: 110,
        color: {
          dark: '#0f172a', // Slate 900
          light: '#ffffff',
        }
      })
        .then(url => setQrCodeUrl(url))
        .catch(err => console.error('QR code generation failed:', err))
    }
  }, [])

  // Listen to fullscreen changes
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Handle slide transitions
  const handleNext = useCallback(() => {
    if (items.length <= 1) return
    setActiveIndex(prev => (prev + 1) % items.length)
    setProgress(0)
  }, [items.length])

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return
    setActiveIndex(prev => (prev - 1 + items.length) % items.length)
    setProgress(0)
  }, [items.length])

  // Slide rotation progress timer
  useEffect(() => {
    if (!isPlaying || viewMode !== 'single' || items.length <= 1) {
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current)
      return
    }

    lastTimeRef.current = Date.now()
    const tick = () => {
      const now = Date.now()
      const elapsed = now - lastTimeRef.current
      lastTimeRef.current = now

      setProgress(prev => {
        const next = prev + (elapsed / speed) * 100
        if (next >= 100) {
          handleNext()
          return 0
        }
        return next
      })

      progressTimerRef.current = requestAnimationFrame(tick)
    }

    progressTimerRef.current = requestAnimationFrame(tick)

    return () => {
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current)
    }
  }, [isPlaying, viewMode, speed, items.length, handleNext])

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          setIsPlaying(prev => !prev)
          break
        case 'ArrowRight':
          handleNext()
          break
        case 'ArrowLeft':
          handlePrev()
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'KeyQ':
          e.preventDefault()
          setShowQrCode(prev => !prev)
          break
        case 'KeyG':
          e.preventDefault()
          setViewMode(prev => prev === 'single' ? 'grid' : 'single')
          break
        case 'KeyH':
          e.preventDefault()
          setShowHelp(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrev])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error enabling fullscreen:', err)
      })
    } else {
      document.exitFullscreen().catch(err => console.error(err))
    }
  }

  // Active items mapping
  const activeItem = items[activeIndex]

  // Framer Motion Animation Settings
  const getVariants = () => {
    switch (transitionStyle) {
      case 'slide':
        return {
          initial: { opacity: 0, x: 120 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: -120 },
        }
      case 'flip':
        return {
          initial: { opacity: 0, rotateY: 90, scale: 0.95 },
          animate: { opacity: 1, rotateY: 0, scale: 1 },
          exit: { opacity: 0, rotateY: -90, scale: 0.95 },
        }
      case 'fade':
      case 'zoom':
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
        }
    }
  }

  const getTransition = () => {
    if (transitionStyle === 'zoom') {
      return {
        opacity: { duration: 0.8, ease: 'easeInOut' },
        scale: { duration: speed / 1000, ease: 'linear' }
      }
    }
    return { duration: 0.6, ease: 'easeInOut' }
  }

  const activeImageScale = transitionStyle === 'zoom' ? [1.0, 1.05] : [1.0, 1.0]

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-350">
        <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide animate-pulse">正在载入 AMC 电子大屏快照展示数据...</p>
      </div>
    )
  }

  if (error || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-rose-500 border border-rose-550/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-black">暂无可展示的账号快照</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error ? `错误原因: ${error}` : '当前系统内没有符合要求的已截屏账号数据。请确认您的账号快照是否采集成功，或取消品牌/平台过滤器重试。'}
          </p>
        </div>
        <button 
          onClick={loadData}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-650 hover:bg-indigo-600 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-md"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>重新加载</span>
        </button>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-150 overflow-hidden select-none font-sans flex flex-col justify-between">
      {/* ── Slide Progress Bar ── */}
      {viewMode === 'single' && isPlaying && (
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-slate-900/60 z-50">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* ── Immersive Blurred Background (Glow Mode) ── */}
      <AnimatePresence mode="popLayout">
        {viewMode === 'single' && activeItem?.latestSnapshot && (
          <motion.div 
            key={`bg-${activeItem.latestSnapshot.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0 z-0 pointer-events-none filter blur-3xl scale-110"
            style={{
              backgroundImage: `url(${getMainAppUrl(activeItem.latestSnapshot.imageUrl)})`,
              backgroundPosition: 'center top',
              backgroundSize: 'cover',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Ambient Dark Canvas Cover ── */}
      <div className="absolute inset-0 bg-slate-950/40 z-0 pointer-events-none" />

      {/* ── Header Widgets (Digital Clock & Meta Info) ── */}
      <div className="relative z-20 flex justify-between items-start p-6 md:p-8 pointer-events-none">
        {/* Left Title */}
        <div className="bg-slate-950/70 backdrop-blur-md border border-slate-900 rounded-2xl px-5 py-3 flex items-center gap-3">
          <img src="/logo.svg" className="w-7 h-7 object-contain" alt="AMC Logo" />
          <div>
            <h1 className="text-xs font-black text-white tracking-widest uppercase">AI Marketing Crew</h1>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">电子屏动态工作展示平台</p>
          </div>
        </div>

        {/* Right Digital Clock */}
        <div className="bg-slate-950/70 backdrop-blur-md border border-slate-900 rounded-2xl px-5 py-3 text-right">
          <div className="flex items-center gap-2 justify-end text-white font-mono text-base font-black tracking-wider">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>{currentTime.toLocaleTimeString('zh-CN', { hour12: false })}</span>
          </div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
            {currentTime.toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* ── Main View Screen Area ── */}
      <div className="relative flex-1 flex items-center justify-center p-4 md:p-6 min-h-0 z-10">
        {viewMode === 'single' ? (
          /* Single Slideshow display */
          <div className="relative w-full h-full max-h-[75vh] flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.accountId}
                variants={getVariants()}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={getTransition()}
                className="relative max-h-full aspect-[9/16] bg-slate-900/40 rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex items-center justify-center"
                style={{ perspective: 1200 }}
              >
                <motion.img 
                  src={getMainAppUrl(activeItem.latestSnapshot!.imageUrl)}
                  alt={`${activeItem.handle} Snapshot`}
                  className="max-w-full max-h-full object-contain block select-none"
                  animate={{ scale: activeImageScale }}
                  transition={getTransition()}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          /* Grid Summary display */
          <div className="w-full max-w-7xl max-h-[75vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {items.map((item, idx) => (
                <div 
                  key={item.accountId}
                  onClick={() => {
                    setActiveIndex(idx)
                    setViewMode('single')
                  }}
                  className={`group relative bg-slate-900/45 hover:bg-slate-900/70 border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 p-2.5 space-y-2 flex flex-col justify-between ${
                    idx === activeIndex
                      ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)]'
                      : 'border-slate-800/60 hover:border-slate-700'
                  }`}
                >
                  {/* Miniature Snapshot */}
                  <div className="relative w-full aspect-[3/4] bg-slate-950 rounded-xl overflow-hidden">
                    <img 
                      src={getMainAppUrl(item.latestSnapshot!.imageUrl)} 
                      className="w-full h-full object-contain object-top group-hover:scale-105 transition-transform duration-300"
                      alt={item.handle}
                      loading="lazy"
                    />
                  </div>

                  {/* Metadata inside card */}
                  <div>
                    <h3 className="text-[11px] font-black text-white truncate">{item.brand.name}</h3>
                    <p className="text-[9px] text-slate-450 mt-0.5 truncate uppercase">
                      {PLATFORM_ICONS[item.platformId]} {item.handle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer Widgets (Info Overlay & QR Code Widget) ── */}
      {viewMode === 'single' && (
        <div className="relative z-20 flex flex-col md:flex-row justify-between items-end p-6 md:p-8 pointer-events-none gap-6">
          {/* Left: Glassmorphic Floating Stats Card */}
          <motion.div 
            key={`card-${activeItem.accountId}`}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-slate-950/80 backdrop-blur-xl border border-slate-900 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl pointer-events-auto"
          >
            {/* Platform Tag */}
            <div className="flex justify-between items-center">
              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase bg-gradient-to-r ${PLATFORM_COLORS[activeItem.platformId] || 'from-slate-700 to-slate-800'} text-white shadow-sm`}>
                {PLATFORM_ICONS[activeItem.platformId]} {activeItem.platformId.toUpperCase()}
              </span>
              {activeItem.latestSnapshot?.capturedAt && (
                <span className="text-[9px] text-slate-400 font-mono font-bold">
                  更新: {new Date(activeItem.latestSnapshot.capturedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Brand Title */}
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-1.5 truncate">
                <span>{activeItem.brand.name}</span>
                {activeItem.brand.location && (
                  <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold">{activeItem.brand.location}</span>
                )}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold mt-1 font-mono tracking-wide">
                Handle: {activeItem.handle}
              </p>
            </div>

            {/* Account Details list */}
            <div className="grid grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded-2xl border border-slate-800/40 text-[10px]">
              <div>
                <span className="text-slate-450 font-bold block">粉丝数量</span>
                <span className="text-xs font-black text-white mt-0.5 block">
                  {activeItem.followerCount ? activeItem.followerCount.toLocaleString() : '--'}
                </span>
              </div>
              <div>
                <span className="text-slate-450 font-bold block">评分星级</span>
                <span className="text-xs font-black text-amber-400 mt-0.5 block">
                  {activeItem.ratingScore ? `⭐ ${activeItem.ratingScore.toFixed(1)}` : '暂无'}
                </span>
              </div>
            </div>

            {/* Account Owners */}
            {activeItem.owners.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-450" />
                <span className="text-[9px] text-slate-400 font-bold">
                  管理主理人: <strong className="text-slate-200">{activeItem.owners.map(o => o.nickname).join(', ')}</strong>
                </span>
              </div>
            )}
          </motion.div>

          {/* Right: Floating QR Code Overlay */}
          {showQrCode && qrCodeUrl && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-3.5 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-2 border border-slate-200 pointer-events-auto"
            >
              <img src={qrCodeUrl} className="w-24 h-24 block object-contain select-none" alt="Share QR Code" />
              <div className="text-[9px] font-bold text-slate-800 text-center tracking-wider font-mono">
                📱 手机扫码控制/分享
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Spacer when in grid mode to preserve structure */}
      {viewMode === 'grid' && <div className="h-6" />}

      {/* ── Floating Controls Panel Overlay (Auto-hides) ── */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-950/85 backdrop-blur-md border border-slate-900 p-4 rounded-2xl flex flex-wrap items-center gap-5 z-40 shadow-2xl"
          >
            {/* Play/Pause & Shift buttons */}
            {viewMode === 'single' && (
              <div className="flex items-center gap-2.5 border-r border-slate-800/80 pr-4">
                <button 
                  onClick={handlePrev} 
                  className="p-2 bg-slate-900 hover:bg-slate-850 text-white rounded-xl transition-all active:scale-90 cursor-pointer"
                  title="上一张 (ArrowLeft)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsPlaying(prev => !prev)} 
                  className="p-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl transition-all active:scale-90 shadow-md cursor-pointer"
                  title={isPlaying ? "暂停 (Space)" : "播放 (Space)"}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button 
                  onClick={handleNext} 
                  className="p-2 bg-slate-900 hover:bg-slate-850 text-white rounded-xl transition-all active:scale-90 cursor-pointer"
                  title="下一张 (ArrowRight)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mode Swapper */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('single')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'single'
                    ? 'bg-indigo-650 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="全屏循环播放 (G)"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>播放</span>
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-indigo-650 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="网格看板总览 (G)"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>网格</span>
              </button>
            </div>

            {/* Playback Settings (Speed & Animations) */}
            {viewMode === 'single' && (
              <div className="flex items-center gap-4 border-l border-r border-slate-800/80 px-4">
                {/* Speed selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">速度</span>
                  <select 
                    value={speed}
                    onChange={(e) => {
                      setSpeed(Number(e.target.value))
                      setProgress(0)
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value={5000}>5 秒</option>
                    <option value={10000}>10 秒</option>
                    <option value={15000}>15 秒</option>
                    <option value={30000}>30 秒</option>
                  </select>
                </div>

                {/* Transition style selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">特效</span>
                  <select 
                    value={transitionStyle}
                    onChange={(e) => setTransitionStyle(e.target.value as any)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="zoom">缩放 (Ken Burns)</option>
                    <option value="fade">渐显 (Fade)</option>
                    <option value="slide">平滑滑入 (Slide)</option>
                    <option value="flip">3D 翻转 (Flip)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Toggle QR code, Help & Fullscreen buttons */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowQrCode(prev => !prev)} 
                className={`p-2 rounded-xl border transition-all active:scale-90 cursor-pointer ${
                  showQrCode 
                    ? 'bg-slate-900 border-slate-800 text-indigo-400' 
                    : 'bg-slate-950 border-slate-900 text-slate-500 hover:text-slate-400'
                }`}
                title="显示/隐藏二维码 (Q)"
              >
                <QrCode className="w-4 h-4" />
              </button>

              <button 
                onClick={() => setShowHelp(prev => !prev)} 
                className={`p-2 rounded-xl border transition-all active:scale-90 cursor-pointer ${
                  showHelp 
                    ? 'bg-slate-900 border-slate-800 text-indigo-400' 
                    : 'bg-slate-950 border-slate-900 text-slate-500 hover:text-slate-400'
                }`}
                title="快捷键帮助 (H)"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              <button 
                onClick={toggleFullscreen} 
                className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-850 text-white rounded-xl transition-all active:scale-90 cursor-pointer"
                title="切屏全屏模式 (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Key Help Dialog Modal ── */}
      <AnimatePresence>
        {showHelp && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 cursor-pointer"
            onClick={() => setShowHelp(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 cursor-default text-xs"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-sm font-black text-white pb-2 border-b border-slate-800">
                ⌨️ 键盘快捷键指南
              </h3>
              <div className="space-y-3 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Space 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-800">播放 / 暂停</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">ArrowLeft 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-800">上一张快照</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">ArrowRight 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-800">下一张快照</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">F 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-800">全屏切换</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Q 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-800">显示/隐藏二维码</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">G 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-800">播放 / 网格视图切换</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">H 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-800">帮助面板切换</span>
                </div>
              </div>
              <button 
                onClick={() => setShowHelp(false)}
                className="w-full py-2 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl font-bold cursor-pointer transition-colors"
              >
                我知道了
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function PresentationPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-350">
        <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide animate-pulse">正在载入 AMC 电子大屏快照展示数据...</p>
      </div>
    }>
      <PresentationContent />
    </Suspense>
  )
}
