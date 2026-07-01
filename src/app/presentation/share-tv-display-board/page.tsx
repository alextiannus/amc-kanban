'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  Play, Pause, ChevronLeft, ChevronRight, Maximize, Minimize, 
  Clock, QrCode, Grid, RefreshCw, AlertCircle, LayoutList, 
  HelpCircle, Eye, Settings, Calendar, Smartphone, Users, MapPin,
  MoveDown, Sliders, ArrowUpDown
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

  // View Settings
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid') // Default is 'grid' (dense wall)
  const [gridCols, setGridCols] = useState<number>(6) // Number of columns in grid
  const [enableBreathing, setEnableBreathing] = useState(true) // Dynamic breathing motion
  const [enableAutoScroll, setEnableAutoScroll] = useState(true) // Auto scrolling in grid view
  const [scrollSpeed, setScrollSpeed] = useState<number>(0.4) // Pixels per frame scroll speed

  // Carousel & Autoplay States (for Single view mode)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [speed, setSpeed] = useState(10000) // Default 10s
  const [transitionStyle, setTransitionStyle] = useState<'zoom' | 'fade' | 'slide' | 'flip'>('zoom')
  const [progress, setProgress] = useState(0)

  // Interactive controls
  const [showQrCode, setShowQrCode] = useState(false) // Hidden by default for clean look
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(false) // Hidden by default
  const [showHelp, setShowHelp] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const progressTimerRef = useRef<number | null>(null)
  const scrollTimerRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(Date.now())
  const scrollPosRef = useRef<number>(0)
  const scrollDirectionRef = useRef<number>(1) // 1 down, -1 up

  // Detect mouse near the bottom (120px trigger zone) to show controls
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const triggerHeight = window.innerHeight - 120
      if (e.clientY > triggerHeight || showHelp) {
        setShowControls(true)
      } else {
        setShowControls(false)
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [showHelp])

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
        width: 100,
        color: {
          dark: '#0f172a',
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

  // Auto-scrolling in Grid View
  useEffect(() => {
    if (!enableAutoScroll || viewMode !== 'grid' || items.length === 0) {
      if (scrollTimerRef.current) cancelAnimationFrame(scrollTimerRef.current)
      return
    }

    const scrollContainer = containerRef.current
    if (!scrollContainer) return

    const scrollTick = () => {
      const container = containerRef.current
      if (!container) return

      const maxScroll = container.scrollHeight - container.clientHeight
      if (maxScroll > 0) {
        // Continuous scroll position update
        scrollPosRef.current += scrollSpeed * scrollDirectionRef.current
        container.scrollTop = scrollPosRef.current

        // Reverse direction at boundary limits with padding safety
        if (scrollPosRef.current >= maxScroll) {
          scrollPosRef.current = maxScroll
          scrollDirectionRef.current = -1
        } else if (scrollPosRef.current <= 0) {
          scrollPosRef.current = 0
          scrollDirectionRef.current = 1
        }
      }

      scrollTimerRef.current = requestAnimationFrame(scrollTick)
    }

    scrollTimerRef.current = requestAnimationFrame(scrollTick)
    return () => {
      if (scrollTimerRef.current) cancelAnimationFrame(scrollTimerRef.current)
    }
  }, [enableAutoScroll, viewMode, scrollSpeed, items.length])

  // Handle slide transitions for single view
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

  // Slide progress bar for single view autoplay
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
          if (viewMode === 'single') {
            setIsPlaying(prev => !prev)
          } else {
            setEnableAutoScroll(prev => !prev)
          }
          break
        case 'ArrowRight':
          if (viewMode === 'single') handleNext()
          break
        case 'ArrowLeft':
          if (viewMode === 'single') handlePrev()
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
  }, [viewMode, handleNext, handlePrev])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error enabling fullscreen:', err)
      })
    } else {
      document.exitFullscreen().catch(err => console.error(err))
    }
  }

  // Framer Motion Carousel animations
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

  // Get grid cols tailwind class
  const getGridColsClass = () => {
    switch (gridCols) {
      case 3: return 'grid-cols-3'
      case 4: return 'grid-cols-3 sm:grid-cols-4'
      case 5: return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5'
      case 8: return 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
      case 6:
      default:
        return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
    }
  }

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
    <div className="relative h-screen w-screen bg-slate-950 text-slate-150 overflow-hidden select-none font-sans flex flex-col justify-between">
      
      {/* ── Slideshow Progress Indicator (Top thin line) ── */}
      {viewMode === 'single' && isPlaying && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-950 z-50">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* ── Immersive Blurred Background (Only in Single slideshow mode) ── */}
      {viewMode === 'single' && items[activeIndex]?.latestSnapshot && (
        <div className="absolute inset-0 z-0 pointer-events-none filter blur-3xl scale-110 opacity-30">
          <img 
            src={getMainAppUrl(items[activeIndex].latestSnapshot!.imageUrl)} 
            className="w-full h-full object-cover" 
            alt="Blur background" 
          />
        </div>
      )}

      {/* ── MAIN CONTENT AREA (100% Space used) ── */}
      <div className="flex-1 w-full h-full relative z-10 flex items-center justify-center">
        {viewMode === 'grid' ? (
          /* DENSE GRID MODE: Filling 100% of viewport with tight gaps and random movements */
          <div 
            ref={containerRef}
            className="w-full h-full overflow-y-auto overflow-x-hidden p-2 scrollbar-none"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div className={`grid ${getGridColsClass()} gap-2`}>
              {items.map((item, idx) => {
                const animationDelay = (idx * 0.4) % 4
                const breathingDuration = 25 + (idx * 3) % 15
                
                return (
                  <div 
                    key={item.accountId}
                    onClick={() => {
                      setActiveIndex(idx)
                      setViewMode('single')
                    }}
                    className="relative w-full aspect-[9/16] bg-slate-900/60 rounded-lg overflow-hidden border border-slate-900 group/card cursor-pointer transition-all hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-550/10"
                  >
                    {/* Living Breathing Ken Burns Animation on every single screenshot! */}
                    <motion.img 
                      src={getMainAppUrl(item.latestSnapshot!.imageUrl)} 
                      className="w-full h-full object-cover object-top select-none pointer-events-none"
                      animate={enableBreathing ? {
                        scale: [1, 1.05, 1.02, 1.06, 1],
                        x: ['0%', '0.5%', '-0.5%', '0.3%', '0%'],
                        y: ['0%', '-0.5%', '0.5%', '-0.3%', '0%'],
                      } : {}}
                      transition={enableBreathing ? {
                        duration: breathingDuration,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: animationDelay
                      } : { duration: 0.2 }}
                      loading="lazy"
                    />

                    {/* Minimal Clean Text Overlay on hover only */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none flex flex-col justify-end">
                      <span className="text-[10px] font-black text-white truncate">{item.brand.name}</span>
                      <span className="text-[8px] text-slate-350 mt-0.5 truncate font-mono uppercase">
                        {PLATFORM_ICONS[item.platformId]} {item.handle}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* SINGLE PICTURE MODE: 100% Screen bleed */
          <div className="w-full h-full flex items-center justify-center p-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={items[activeIndex].accountId}
                variants={getVariants()}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={getTransition()}
                className="relative max-h-full aspect-[9/16] bg-slate-950/20 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center"
              >
                <motion.img 
                  src={getMainAppUrl(items[activeIndex].latestSnapshot!.imageUrl)}
                  alt={`${items[activeIndex].handle} Snapshot`}
                  className="max-w-full max-h-full object-contain block select-none"
                  animate={{ scale: transitionStyle === 'zoom' ? [1.0, 1.05] : [1.0, 1.0] }}
                  transition={getTransition()}
                />
                
                {/* Floating QR Code in Single mode (only if toggled on) */}
                {showQrCode && qrCodeUrl && (
                  <div className="absolute bottom-4 right-4 bg-white p-2 rounded-xl shadow-2xl flex flex-col items-center justify-center gap-1.5 border border-slate-200 z-30">
                    <img src={qrCodeUrl} className="w-16 h-16 block object-contain select-none" alt="QR Code" />
                    <span className="text-[8px] font-bold text-slate-800 font-mono">📱 扫码控制/分享</span>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── COLLAPSIBLE CONTROL PANEL AT BOTTOM (Transparent by default, Hover to reveal) ── */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/85 backdrop-blur-xl border border-slate-900/60 px-5 py-3 rounded-2xl flex items-center gap-5 z-50 shadow-2xl max-w-4xl"
          >
            {/* Mode Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-900/50 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-indigo-650 text-white shadow-sm'
                    : 'text-slate-450 hover:text-slate-200'
                }`}
                title="所有账号密集网格陈列 (G)"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>密集网格</span>
              </button>
              <button 
                onClick={() => setViewMode('single')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'single'
                    ? 'bg-indigo-650 text-white shadow-sm'
                    : 'text-slate-450 hover:text-slate-200'
                }`}
                title="单图轮流播放 (G)"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>单图播放</span>
              </button>
            </div>

            {/* Grid Controls (Auto-Scroll & Density) */}
            {viewMode === 'grid' && (
              <div className="flex items-center gap-4 border-l border-slate-900 pl-4">
                {/* Auto Scroll toggle */}
                <button
                  onClick={() => setEnableAutoScroll(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    enableAutoScroll 
                      ? 'bg-indigo-950/40 border-indigo-900 text-indigo-400' 
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="开关大屏自动滚动 (Space)"
                >
                  {enableAutoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>自动滚动</span>
                </button>

                {/* Grid Cols density */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">排版列数</span>
                  <select 
                    value={gridCols}
                    onChange={(e) => setGridCols(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value={4}>4 列 (宽松)</option>
                    <option value={6}>6 列 (标准)</option>
                    <option value={8}>8 列 (密集)</option>
                  </select>
                </div>

                {/* Auto Scroll Speed selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">滚动速度</span>
                  <select 
                    value={scrollSpeed}
                    onChange={(e) => setScrollSpeed(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value={0.2}>极慢</option>
                    <option value={0.4}>标准</option>
                    <option value={0.8}>快速</option>
                  </select>
                </div>

                {/* Breathing toggle */}
                <button
                  onClick={() => setEnableBreathing(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    enableBreathing 
                      ? 'bg-indigo-950/40 border-indigo-900 text-indigo-400' 
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="开关截图微变焦呼吸特效"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>呼吸微动</span>
                </button>
              </div>
            )}

            {/* Single Slideshow Controls (Play, Pause, Speed, Transitions) */}
            {viewMode === 'single' && (
              <div className="flex items-center gap-4 border-l border-slate-900 pl-4">
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handlePrev} 
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                    title="上一张 (ArrowLeft)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setIsPlaying(prev => !prev)} 
                    className="p-2 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg cursor-pointer"
                    title={isPlaying ? "暂停 (Space)" : "播放 (Space)"}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button 
                    onClick={handleNext} 
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                    title="下一张 (ArrowRight)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Speed selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">间隔</span>
                  <select 
                    value={speed}
                    onChange={(e) => {
                      setSpeed(Number(e.target.value))
                      setProgress(0)
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white outline-none cursor-pointer"
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
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="zoom">变焦 (Ken Burns)</option>
                    <option value="fade">淡入淡出 (Fade)</option>
                    <option value="slide">横向滑动 (Slide)</option>
                    <option value="flip">3D 翻面 (Flip)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Global Settings (Fullscreen, QR Code, Help) */}
            <div className="flex items-center gap-2 border-l border-slate-900 pl-4">
              {viewMode === 'single' && (
                <button 
                  onClick={() => setShowQrCode(prev => !prev)} 
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    showQrCode 
                      ? 'bg-slate-900 border-slate-800 text-indigo-400' 
                      : 'bg-slate-950 border-slate-900 text-slate-500 hover:text-slate-400'
                  }`}
                  title="显示/隐藏二维码 (Q)"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              )}

              <button 
                onClick={() => setShowHelp(prev => !prev)} 
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  showHelp 
                    ? 'bg-slate-900 border-slate-800 text-indigo-400' 
                    : 'bg-slate-950 border-slate-900 text-slate-500 hover:text-slate-400'
                }`}
                title="键盘快捷键说明 (H)"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              <button 
                onClick={toggleFullscreen} 
                className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-xl transition-all cursor-pointer"
                title="网页全屏切换 (F)"
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 cursor-pointer"
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
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">暂停滚动/播放</span>
                </div>
                {viewMode === 'single' && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">ArrowLeft 键</span>
                      <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">上一张快照</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">ArrowRight 键</span>
                      <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">下一张快照</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">F 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">全屏切换</span>
                </div>
                {viewMode === 'single' && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Q 键</span>
                    <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">二维码开关</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">G 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">密集网格 / 单图模式切换</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">H 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">说明面板开关</span>
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
