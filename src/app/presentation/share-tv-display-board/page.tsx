'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  Play, Pause, ChevronLeft, ChevronRight, Maximize, Minimize, 
  Clock, QrCode, Grid, RefreshCw, AlertCircle, LayoutList, 
  HelpCircle, Eye, Settings, Calendar, Smartphone, Users, MapPin,
  Sliders, ArrowRightLeft, Sparkles
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

interface PhysicsSeed {
  rotate: number
  startX: number
  startY: number
  startRotate: number
  exitX: number
  exitRotate: number
  breathingDuration: number
  animationDelay: number
}

function PresentationContent() {
  const searchParams = useSearchParams()
  const brandIdFilter = searchParams?.get('brandId')
  const platformIdFilter = searchParams?.get('platformId')

  // Data states
  const [items, setItems] = useState<SnapshotData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Layout View Mode & Columns
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')
  const [gridCols, setGridCols] = useState<number>(4)
  const [enableBreathing, setEnableBreathing] = useState(true)

  // Polaroid Sticker Wall Animation Loop States
  const [currentPage, setCurrentPage] = useState(0)
  const [stage, setStage] = useState<'entering' | 'holding' | 'falling'>('entering')
  const [holdDuration, setHoldDuration] = useState(180000) // Default 3 minutes (180000ms)
  const [batchSeeds, setBatchSeeds] = useState<PhysicsSeed[]>([])

  // Carousel & Autoplay States (for Single view mode)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlayingSingle, setIsPlayingSingle] = useState(true)
  const [singleSpeed, setSingleSpeed] = useState(10000) // 10s per single photo
  const [transitionStyle, setTransitionStyle] = useState<'zoom' | 'fade' | 'slide' | 'flip'>('zoom')
  const [progressSingle, setProgressSingle] = useState(0)

  // Interactive controls
  const [showQrCode, setShowQrCode] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Timers Refs
  const progressTimerRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(Date.now())
  const stageTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate items per batch page
  const gridRows = 1 // Maintain 1 row for spacious polaroid collage display
  const pageSize = gridCols * gridRows
  const totalPages = Math.ceil(items.length / pageSize)

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
      
      const listWithSnapshots = (json.results || []).filter((item: SnapshotData) => !!item.latestSnapshot)
      setItems(listWithSnapshots)
      setCurrentPage(0)
      setActiveIndex(0)
      setStage('entering')
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [brandIdFilter, platformIdFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Get current batch of stickers
  const currentBatchItems = React.useMemo(() => {
    if (viewMode !== 'grid') return []
    const startIdx = currentPage * pageSize
    return items.slice(startIdx, startIdx + pageSize)
  }, [items, currentPage, pageSize, viewMode])

  // Generate randomized physics seeds for flying polaroid stickers when batch or columns change
  useEffect(() => {
    if (currentBatchItems.length === 0) return

    const seeds = currentBatchItems.map((_, idx) => {
      const angle = (Math.random() - 0.5) * 8 // Stuck tilt: -4 to +4 degrees
      const sx = (Math.random() - 0.5) * 1200 // Offscreen X entry offset
      const sy = -700 - Math.random() * 300 // Offscreen Y entry (above viewport)
      const sr = (Math.random() - 0.5) * 120 // Flying spin rotation offset
      const ex = (Math.random() - 0.5) * 400 // Drift X offset on fall-off
      const er = (Math.random() - 0.5) * 90 // Exit spin rotation offset
      const bd = 20 + (idx * 2) % 15 // Breathing duration
      const ad = (idx * 0.45) % 4 // Animation delay offset

      return {
        rotate: angle,
        startX: sx,
        startY: sy,
        startRotate: sr,
        exitX: ex,
        exitRotate: er,
        breathingDuration: bd,
        animationDelay: ad
      }
    })

    setBatchSeeds(seeds)
  }, [currentBatchItems])

  // Polaroid sticker wall workflow timer state machine
  useEffect(() => {
    if (viewMode !== 'grid' || currentBatchItems.length === 0) {
      if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current)
      return
    }

    if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current)

    if (stage === 'entering') {
      // Transition to 'holding' after fly-in animations complete
      const animationDuration = (currentBatchItems.length * 100) + 1200
      stageTimeoutRef.current = setTimeout(() => {
        setStage('holding')
      }, animationDuration)
    } 
    else if (stage === 'holding') {
      // Transition to 'falling' after the display duration expires
      stageTimeoutRef.current = setTimeout(() => {
        setStage('falling')
      }, holdDuration)
    } 
    else if (stage === 'falling') {
      // Transition to next batch and fly-in after exit animations drop off screen
      const animationDuration = (currentBatchItems.length * 60) + 1200
      stageTimeoutRef.current = setTimeout(() => {
        setCurrentPage(prev => (prev + 1) % totalPages)
        setStage('entering')
      }, animationDuration)
    }

    return () => {
      if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current)
    }
  }, [stage, currentBatchItems.length, holdDuration, totalPages, viewMode])

  // Trigger manual fall-off to transition to next page immediately
  const triggerNextBatch = useCallback(() => {
    if (viewMode !== 'grid' || stage !== 'holding') return
    setStage('falling')
  }, [viewMode, stage])

  const triggerPrevBatch = useCallback(() => {
    if (viewMode !== 'grid' || stage !== 'holding') return
    // Custom backward transition: drop current page and calculate prev index
    if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current)
    setStage('falling')
    // Override next tick to load previous page
    setTimeout(() => {
      setCurrentPage(prev => (prev - 1 + totalPages) % totalPages)
      setStage('entering')
    }, (currentBatchItems.length * 60) + 100)
  }, [viewMode, stage, totalPages, currentBatchItems.length])

  // Generate QR Code
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

  // Mouse move sensor zone: bottom 120px reveals transparent overlay panel
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

  // Handle slide transitions for Single mode
  const handleSingleNext = useCallback(() => {
    if (items.length <= 1) return
    setActiveIndex(prev => (prev + 1) % items.length)
    setProgressSingle(0)
  }, [items.length])

  const handleSinglePrev = useCallback(() => {
    if (items.length <= 1) return
    setActiveIndex(prev => (prev - 1 + items.length) % items.length)
    setProgressSingle(0)
  }, [items.length])

  // Single mode progress timer loop
  useEffect(() => {
    if (!isPlayingSingle || viewMode !== 'single' || items.length <= 1) {
      if (progressTimerRef.current) cancelAnimationFrame(progressTimerRef.current)
      return
    }

    lastTimeRef.current = Date.now()
    const tick = () => {
      const now = Date.now()
      const elapsed = now - lastTimeRef.current
      lastTimeRef.current = now

      setProgressSingle(prev => {
        const next = prev + (elapsed / singleSpeed) * 100
        if (next >= 100) {
          handleSingleNext()
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
  }, [isPlayingSingle, viewMode, singleSpeed, items.length, handleSingleNext])

  // Keyboard navigation hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (viewMode === 'single') {
            setIsPlayingSingle(prev => !prev)
          } else {
            // In Grid mode, space forces manual drop/next page
            triggerNextBatch()
          }
          break
        case 'ArrowRight':
          if (viewMode === 'single') {
            handleSingleNext()
          } else {
            triggerNextBatch()
          }
          break
        case 'ArrowLeft':
          if (viewMode === 'single') {
            handleSinglePrev()
          } else {
            triggerPrevBatch()
          }
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'KeyQ':
          e.preventDefault()
          if (viewMode === 'single') setShowQrCode(prev => !prev)
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
  }, [viewMode, handleSingleNext, handleSinglePrev, triggerNextBatch, triggerPrevBatch])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error('Error enabling fullscreen:', err)
      })
    } else {
      document.exitFullscreen().catch(err => console.error(err))
    }
  }

  // Get single view animation parameters
  const getSingleVariants = () => {
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

  const getSingleTransition = () => {
    if (transitionStyle === 'zoom') {
      return {
        opacity: { duration: 0.8, ease: 'easeInOut' },
        scale: { duration: singleSpeed / 1000, ease: 'linear' }
      }
    }
    return { duration: 0.6, ease: 'easeInOut' }
  }

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
      
      {/* ── Slideshow Progress (Top thin line, single mode only) ── */}
      {viewMode === 'single' && isPlayingSingle && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-950 z-50">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-75"
            style={{ width: `${progressSingle}%` }}
          />
        </div>
      )}

      {/* ── Immersive Blurred Background (Glow, single view mode only) ── */}
      {viewMode === 'single' && items[activeIndex]?.latestSnapshot && (
        <div className="absolute inset-0 z-0 pointer-events-none filter blur-3xl scale-110 opacity-30">
          <img 
            src={getMainAppUrl(items[activeIndex].latestSnapshot!.imageUrl)} 
            className="w-full h-full object-cover" 
            alt="Blur background" 
          />
        </div>
      )}

      {/* ── 100% FULLSCREEN SHOWCASE CANVAS AREA ── */}
      <div className="flex-1 w-full h-full relative z-10 flex items-center justify-center">
        {viewMode === 'grid' ? (
          /* DENSE POLAROID STICKER GRID WALL DISPLAY */
          <div className="w-full h-full flex items-center justify-center p-8 md:p-12">
            <div className={`grid ${getGridColsClass()} gap-8 md:gap-12 w-full max-w-[90vw]`}>
              {currentBatchItems.map((item, idx) => {
                const seed = batchSeeds[idx]
                if (!seed) return null

                return (
                  <div 
                    key={`${currentPage}-${item.accountId}`}
                    className="relative w-full aspect-[9/16] perspective-900"
                  >
                    {/* Outer Div: Fly-In Land Spring bounce & Fall-Off acceleration drop */}
                    <motion.div
                      initial={{ 
                        opacity: 0, 
                        x: seed.startX, 
                        y: seed.startY, 
                        scale: 1.8, 
                        rotate: seed.startRotate 
                      }}
                      animate={
                        stage === 'falling'
                          ? { 
                              opacity: 0, 
                              y: window.innerHeight + 300, 
                              x: seed.exitX, 
                              rotate: seed.exitRotate, 
                              scale: 0.95 
                            }
                          : { 
                              opacity: 1, 
                              x: 0, 
                              y: 0, 
                              scale: 1, 
                              rotate: seed.rotate 
                            }
                      }
                      transition={
                        stage === 'falling'
                          ? { 
                              duration: 1.0, 
                              ease: [0.6, -0.28, 0.735, 0.045], // Accel down physics
                              delay: idx * 0.05 
                            }
                          : { 
                              type: 'spring', 
                              stiffness: 65, 
                              damping: 12, 
                              delay: idx * 0.08 // Stagger fly-in pasting
                            }
                      }
                      className="w-full h-full"
                    >
                      {/* Inner Div: Floating / Breathing sway while held on wall */}
                      <motion.div
                        animate={enableBreathing && stage === 'holding' ? {
                          scale: [1, 1.03, 1.015, 1.04, 1],
                          rotate: [seed.rotate, seed.rotate + 1.2, seed.rotate - 1.2, seed.rotate + 0.8, seed.rotate],
                        } : {}}
                        transition={{
                          duration: seed.breathingDuration,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: seed.animationDelay
                        }}
                        className="w-full h-full bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200/50 dark:border-slate-800 shadow-[0_4px_10px_rgba(0,0,0,0.25)] dark:shadow-[0_4px_15px_rgba(0,0,0,0.5)] flex flex-col hover:border-indigo-500 transition-colors"
                      >
                        {/* Snapshot card body */}
                        <div className="flex-1 w-full bg-slate-950 rounded-md overflow-hidden relative group/card">
                          <img 
                            src={getMainAppUrl(item.latestSnapshot!.imageUrl)} 
                            className="w-full h-full object-cover object-top select-none pointer-events-none"
                            alt={item.handle}
                          />

                          {/* Detail text on hover */}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-2.5 pt-5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none flex flex-col justify-end">
                            <span className="text-[10px] font-black text-white truncate">{item.brand.name}</span>
                            <span className="text-[8px] text-slate-350 mt-0.5 truncate font-mono uppercase">
                              {PLATFORM_ICONS[item.platformId]} {item.handle}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* SINGLE VIEW MODE: Screen bleed */
          <div className="w-full h-full flex items-center justify-center p-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={items[activeIndex].accountId}
                variants={getSingleVariants()}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={getSingleTransition()}
                className="relative max-h-full aspect-[9/16] bg-slate-950/20 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center"
              >
                <motion.img 
                  src={getMainAppUrl(items[activeIndex].latestSnapshot!.imageUrl)}
                  alt={`${items[activeIndex].handle} Snapshot`}
                  className="max-w-full max-h-full object-contain block select-none"
                  animate={{ scale: transitionStyle === 'zoom' ? [1.0, 1.05] : [1.0, 1.0] }}
                  transition={getSingleTransition()}
                />
                
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

      {/* ── COLLAPSIBLE OVERLAY CONTROL PANEL (Revealed on hover near bottom) ── */}
      <AnimatePresence>
        {showControls && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/85 backdrop-blur-xl border border-slate-900 px-5 py-3 rounded-2xl flex items-center gap-5 z-50 shadow-2xl max-w-4xl"
          >
            {/* View Mode Swap */}
            <div className="flex items-center gap-1.5 bg-slate-900/50 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-indigo-650 text-white shadow-sm'
                    : 'text-slate-450 hover:text-slate-200'
                }`}
                title="密集贴纸墙模式 (G)"
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

            {/* Sticker Grid Settings (Page turn, Density, Duration, Breathing) */}
            {viewMode === 'grid' && (
              <div className="flex items-center gap-4 border-l border-slate-900 pl-4">
                
                {/* Manual batch shifter */}
                <div className="flex items-center gap-1">
                  <button 
                    onClick={triggerPrevBatch} 
                    disabled={stage !== 'holding'}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg cursor-pointer"
                    title="上一批贴纸 (ArrowLeft)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono font-bold px-1.5">
                    {currentPage + 1} / {totalPages || 1}
                  </span>
                  <button 
                    onClick={triggerNextBatch} 
                    disabled={stage !== 'holding'}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg cursor-pointer"
                    title="下一批贴纸 (ArrowRight / Space)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Display Hold time selection */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">贴纸停置时长</span>
                  <select 
                    value={holdDuration}
                    onChange={(e) => setHoldDuration(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value={15000}>15 秒 (演示)</option>
                    <option value={30000}>30 秒</option>
                    <option value={60000}>1 分钟</option>
                    <option value={180000}>3 分钟 (默认)</option>
                    <option value={300000}>5 分钟</option>
                  </select>
                </div>

                {/* Columns Density */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">列数</span>
                  <select 
                    value={gridCols}
                    onChange={(e) => {
                      setGridCols(Number(e.target.value))
                      setCurrentPage(0)
                      setStage('entering')
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value={4}>4 列 (宽松)</option>
                    <option value={6}>6 列 (标准)</option>
                    <option value={8}>8 列 (密集)</option>
                  </select>
                </div>

                {/* Breathing toggle */}
                <button
                  onClick={() => setEnableBreathing(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    enableBreathing 
                      ? 'bg-indigo-950/45 border-indigo-900 text-indigo-400' 
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="开关贴纸墙悬浮摇晃微动特效"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>呼吸微动</span>
                </button>
              </div>
            )}

            {/* Single Carousel Controls */}
            {viewMode === 'single' && (
              <div className="flex items-center gap-4 border-l border-slate-900 pl-4">
                <div className="flex items-center gap-1">
                  <button 
                    onClick={handleSinglePrev} 
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                    title="上一张 (ArrowLeft)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setIsPlayingSingle(prev => !prev)} 
                    className="p-2 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg cursor-pointer"
                    title={isPlayingSingle ? "暂停 (Space)" : "播放 (Space)"}
                  >
                    {isPlayingSingle ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button 
                    onClick={handleSingleNext} 
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                    title="下一张 (ArrowRight)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">时间间隔</span>
                  <select 
                    value={singleSpeed}
                    onChange={(e) => {
                      setSingleSpeed(Number(e.target.value))
                      setProgressSingle(0)
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value={5000}>5 秒</option>
                    <option value={10000}>10 秒</option>
                    <option value={15000}>15 秒</option>
                    <option value={30000}>30 秒</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-450 font-extrabold uppercase">转场特效</span>
                  <select 
                    value={transitionStyle}
                    onChange={(e) => setTransitionStyle(e.target.value as any)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="zoom">变焦 (Ken Burns)</option>
                    <option value="fade">渐变 (Fade)</option>
                    <option value="slide">滑动 (Slide)</option>
                    <option value="flip">3D 翻面 (Flip)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Global buttons */}
            <div className="flex items-center gap-2 border-l border-slate-900 pl-4">
              {viewMode === 'single' && (
                <button 
                  onClick={() => setShowQrCode(prev => !prev)} 
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    showQrCode 
                      ? 'bg-slate-900 border-slate-800 text-indigo-400' 
                      : 'bg-slate-950 border-slate-900 text-slate-500 hover:text-slate-400'
                  }`}
                  title="显示二维码 (Q)"
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
                title="键盘快捷键 (H)"
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

      {/* ── Keyboard Shortcuts Help Modal ── */}
      <AnimatePresence>
        {showHelp && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 cursor-pointer"
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
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">
                    {viewMode === 'grid' ? '强制掉落并换下一批' : '暂停/播放'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">ArrowLeft 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">
                    {viewMode === 'grid' ? '上一批贴纸' : '上一张快照'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">ArrowRight 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">
                    {viewMode === 'grid' ? '下一批贴纸' : '下一张快照'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">F 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">大屏全屏切换</span>
                </div>
                {viewMode === 'single' && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Q 键</span>
                    <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">二维码开关</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">G 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">网格贴纸 / 单图模式切换</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">H 键</span>
                  <span className="bg-slate-850 text-slate-200 px-2 py-0.5 rounded border border-slate-850">快捷键面板开关</span>
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
