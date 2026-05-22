'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

interface Prize {
  id: string
  name: string
  type: string
  probability: number
  totalInventory: number | null
  claimedCount: number
  imageUrl: string | null
}

interface GameConfig {
  title: string
  description: string
  themeColor: string
  taskPhotoEnabled: boolean
  taskReviewEnabled: boolean
  maxSpinsPerUserDay: number
  brand?: {
    name: string
    location: string | null
    googlePlaceId: string | null
    accounts: Array<{
      platformId: string
      profileUrl: string | null
      handle: string
    }>
  }
}

interface UnclaimedPrize {
  logId: string
  prizeName: string
  prizeType: string
  redemptionCode: string
  createdAt: string
}

export default function GameH5Page() {
  const params = useParams()
  const brandId = params.brandId as string

  // Session & UI Languages
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const [sessionId, setSessionId] = useState<string>('')
  const [points, setPoints] = useState<number>(0)
  
  // Game Configuration & Prizes
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  
  // Spinning State
  const [isSpinning, setIsSpinning] = useState<boolean>(false)
  const [winningPrize, setWinningPrize] = useState<{ name: string; code: string } | null>(null)
  const [wheelRotation, setWheelRotation] = useState<number>(0)

  // Unclaimed Prize for Crash Resilience
  const [unclaimedPrize, setUnclaimedPrize] = useState<UnclaimedPrize | null>(null)

  // Merged Task States
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const [isSubmittingTask, setIsSubmittingTask] = useState<boolean>(false)
  const [copyrightAgreed, setCopyrightAgreed] = useState<boolean>(true)
  const [reviewPlatform, setReviewPlatform] = useState<string | null>(null)
  const [useAiText, setUseAiText] = useState<boolean>(true)

  // Toast Notification State
  const toastTimerRef = useRef<any>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToastMessage = (msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
    }, 2500)
  }

  // AI & Manual Verification Modals
  const [verifyingTaskId, setVerifyingTaskId] = useState<string | null>(null)
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [showPinModal, setShowPinModal] = useState<{ submissionId: string } | null>(null)
  const [pinInput, setPinInput] = useState<string>('')
  const [pinError, setPinError] = useState<string | null>(null)

  // Audio/Confetti Canvas Refs
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameId = useRef<number | null>(null)

  const t = {
    zh: {
      points: '当前积分',
      spin: '开始抽奖 (5积分)',
      spinning: '正在抽奖...',
      noPoints: '积分不足，完成下方任务获得积分',
      uploadPhotos: '📷 店内环境/菜品美图分享',
      uploadPhotosSub: '成功上传 3 张店内照片即可获得 5 个积分',
      submitReview: '⭐ 社媒平台发表好评',
      submitReviewSub: '在 Google Maps/小红书/Instagram 发布好评或标记并上传截图获得 5 个积分',
      photoSlot: '照片',
      copyright: '我同意数据使用协议：商家有权下载和使用本次发布所用的图片',
      submitTask: '提交任务',
      submitting: '正在提交并进行 AI 审核...',
      googleMaps: 'Google Maps 直达',
      xiaohongshu: '小红书直达',
      instagram: 'Instagram 直达',
      copyText: '一键复制好评文案',
      copied: '文案已复制到剪贴板！',
      uploadScreenshot: '上传好评截图',
      clerkTitle: 'AI 自动审核未通过',
      clerkDesc: '系统无法自动核实。请向收银台店员出示您的评论页面，并请店员输入 6 位密码解锁积分。',
      inputPin: '输入店员授权密码',
      submitPin: '确认授权',
      invalidPin: '密码错误，请重新输入',
      winTitle: '🎉 恭喜中奖！',
      winSub: '请将此页面出示给店员进行核销兑奖。',
      redeemCode: '核销码',
      close: '关闭',
      thanks: '谢谢参与',
      dailyLimit: '今天抽奖次数已达上限',
      unclaimedTitle: '🎁 您有一个未领取的奖品！',
      unclaimedClaim: '立即查看',
      combinedTask: '⭐ 发布好评并上传店内美图',
      combinedTaskSub: '在 Google Maps/小红书/Instagram 发表好评或标记，上传截图及店内美图即可获得 5 个积分',
      screenshotFirstHint: '（提示：第 1 张请上传好评截图，其余为店内美图）',
      addMore: '添加照片',
      uploadPlaceholder: '上传截图与店内美图 (可多选)',
    },
    en: {
      points: 'Points Balance',
      spin: 'SPIN (5 Points)',
      spinning: 'Spinning...',
      noPoints: 'Not enough points. Complete tasks below to earn points.',
      uploadPhotos: '📷 Share Store & Food Photos',
      uploadPhotosSub: 'Upload 3 store photos to earn 5 points',
      submitReview: '⭐ Leave a Social Review',
      submitReviewSub: 'Post on Google Maps/Xiaohongshu/Instagram and upload screenshot to get 5 points',
      photoSlot: 'Photo',
      copyright: 'I agree to the Data Use Agreement: The merchant has the right to download and use the photos/screenshots uploaded for this post.',
      submitTask: 'Submit Task',
      submitting: 'Submitting and verifying with AI...',
      googleMaps: 'Direct Google Maps',
      xiaohongshu: 'Direct Xiaohongshu',
      instagram: 'Direct Instagram',
      copyText: 'Copy Review Text',
      copied: 'Copied to clipboard!',
      uploadScreenshot: 'Upload Screenshot',
      clerkTitle: 'AI Verification Failed',
      clerkDesc: 'System could not verify automatically. Please show your review screen to the clerk and ask them to input the 6-digit PIN to unlock points.',
      inputPin: 'Enter Staff Code',
      submitPin: 'Approve',
      invalidPin: 'Incorrect PIN, please try again.',
      winTitle: '🎉 Congratulations!',
      winSub: 'Please show this screen to the store staff to claim your prize.',
      redeemCode: 'Claim Code',
      close: 'Close',
      thanks: 'Thanks for playing',
      dailyLimit: 'Daily spin limit reached',
      unclaimedTitle: '🎁 You have an unclaimed prize!',
      unclaimedClaim: 'Claim Now',
      combinedTask: '⭐ Post Review & Share Photos',
      combinedTaskSub: 'Post on Google Maps/Xiaohongshu/Instagram, upload screenshot & store photos to earn 5 points',
      screenshotFirstHint: '(Note: 1st image must be the review screenshot)',
      addMore: 'Add Photo',
      uploadPlaceholder: 'Upload screenshot & store photos (multi-select)',
    }
  }[lang]

  // Copy-paste Text recommendation (Standard & AI-generated options)
  const defaultRecommendedCopy = lang === 'zh'
    ? '非常棒的体验！店里环境很好，服务态度也超级赞，饮品/菜品非常美味，强烈推荐！'
    : 'Great experience! Friendly staff, cozy vibes, and amazing drinks. Highly recommend this place!'

  const aiRecommendedCopy = lang === 'zh'
    ? '✨发现一家超棒的宝藏店！环境特别清雅舒适，拍照非常出片📷。店员服务态度也超级热情，推荐的特色风味口感很赞，层次丰富，完全超出预期！非常适合和朋友一起来坐坐，强烈安利！❤️ #探店 #美食日常 #周末去哪儿'
    : '✨Discovered an amazing place! The vibes are absolutely incredible, super cozy and photo-friendly📷. Extremely friendly staff, and the food/drinks were absolutely delicious with wonderful flavors. Highly recommend hanging out here with friends!❤️ #aestheticvibes #foodie #localguide'

  const recommendedCopy = useAiText ? aiRecommendedCopy : defaultRecommendedCopy

  // 1. Initialize transient sessionId and fetch Config
  useEffect(() => {
    let session = localStorage.getItem('amc_game_session')
    if (!session) {
      session = 'gs_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      localStorage.setItem('amc_game_session', session)
    }
    setSessionId(session)

    // Load Public Game Configuration
    fetch(`/api/game/config?brandId=${brandId}&public=true&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data.title) {
          setConfig(data)
          setPrizes(data.prizes || [])
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load game config', err)
        setLoading(false)
      })
  }, [brandId])

  // 2. Fetch customer status & unclaimed logs
  const fetchStatus = () => {
    if (!brandId || !sessionId) return
    fetch(`/api/game/status?brandId=${brandId}&sessionId=${sessionId}&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data.pointsBalance !== undefined) {
          setPoints(data.pointsBalance)
        }
        if (data.unclaimedPrizes && data.unclaimedPrizes.length > 0) {
          setUnclaimedPrize(data.unclaimedPrizes[0])
        } else {
          setUnclaimedPrize(null)
        }
      })
      .catch(err => console.error('Failed to load status', err))
  }

  useEffect(() => {
    if (sessionId) {
      fetchStatus()
    }
  }, [brandId, sessionId])

  // 3. Client-side Image compression helper
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // Cap max dimensions at 1600px
          const MAX_SIZE = 1600
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width
              width = MAX_SIZE
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height
              height = MAX_SIZE
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, width, height)

          // Convert to WebP with 0.8 quality
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob)
            } else {
              resolve(file) // Fallback to original
            }
          }, 'image/webp', 0.8)
        }
      }
    })
  }

  // 4. File uploads triggers
  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      const file = selectedFiles[0]
      setUploadedFiles([file])
      setFilePreviews([URL.createObjectURL(file)])
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
    setFilePreviews(prev => prev.filter((_, i) => i !== index))
  }

  // 5. Submit Unified/Merged Task
  const submitTask = async () => {
    if (uploadedFiles.length === 0) return
    if (!copyrightAgreed) return

    setIsSubmittingTask(true)
    setVerificationError(null)

    const taskType = 'REVIEW_SUBMIT'

    try {
      const formData = new FormData()
      formData.append('brandId', brandId)
      formData.append('sessionId', sessionId)
      formData.append('taskType', taskType)
      formData.append('copyrightAgreed', copyrightAgreed ? 'true' : 'false')
      if (reviewPlatform) {
        formData.append('reviewPlatform', reviewPlatform)
      }

      // Compress and append each photo
      for (let i = 0; i < uploadedFiles.length; i++) {
        const compressedBlob = await compressImage(uploadedFiles[i])
        formData.append(`files[${i}]`, compressedBlob, uploadedFiles[i].name)
      }

      const res = await fetch('/api/game/tasks', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')

      if (data.status === 'APPROVED') {
        setPoints(data.pointsBalance)
        setUploadedFiles([])
        setFilePreviews([])
        alert(lang === 'zh' ? '任务提交成功！获得 5 积分！' : 'Task submitted successfully! Earned 5 points!')
      } else {
        // AI verification failed, trigger manual Clerk override Modal
        setShowPinModal({ submissionId: data.submissionId })
      }
    } catch (err: any) {
      console.error(err)
      setVerificationError(err.message)
    } finally {
      setIsSubmittingTask(false)
    }
  }

  // 6. Clerk PIN code submission
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showPinModal || !pinInput) return
    setPinError(null)

    try {
      const res = await fetch('/api/game/tasks/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: showPinModal.submissionId,
          pinCode: pinInput,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed')

      setPoints(data.pointsBalance)
      setUploadedFiles([])
      setFilePreviews([])
      setShowPinModal(null)
      setPinInput('')
      alert(lang === 'zh' ? '店员授权成功！已发放 5 积分！' : 'Staff authorized successfully! Granted 5 points!')
    } catch (err: any) {
      setPinError(err.message || 'Incorrect PIN')
    }
  }

  // 8. Spinning mechanics
  const triggerSpin = async () => {
    if (isSpinning) return
    if (points < 5) {
      alert(t.noPoints)
      return
    }

    setIsSpinning(true)
    setWinningPrize(null)

    try {
      const res = await fetch('/api/game/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, sessionId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Spin failed')

      // Haptic feedback for spin trigger
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100])
      }

      // Find index of winning prize
      const prizeIndex = prizes.findIndex(p => p.id === data.prize.id)
      const segmentsCount = prizes.length
      const anglePerSegment = 360 / segmentsCount

      // Spin at least 5 complete rounds, then stop on the exact winning segment
      const targetAngle = 360 - (prizeIndex * anglePerSegment) - (anglePerSegment / 2)
      const finalRotation = wheelRotation + (360 * 5) + targetAngle - (wheelRotation % 360)

      setWheelRotation(finalRotation)

      setTimeout(() => {
        setIsSpinning(false)
        setWinningPrize({ name: data.prize.name, code: data.redemptionCode })
        setPoints(data.pointsBalance)
        // Celebrate! Trigger confetti
        startConfetti()
        
        // Winning vibration
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([300, 100, 300])
        }
      }, 5000) // 5 seconds spin animation
    } catch (err: any) {
      setIsSpinning(false)
      alert(err.message)
    }
  }

  // 9. Lightweight Confetti animation drawn on Canvas
  const startConfetti = () => {
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: any[] = []
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981']

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 6 + 4,
        d: Math.random() * canvas.height,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.07 + 0.02,
        tiltAngle: 0
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let active = false

      particles.forEach((p) => {
        p.tiltAngle += p.tiltAngleIncremental
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2
        p.x += Math.sin(p.tiltAngle)
        p.tilt = Math.sin(p.tiltAngle - p.r / 2) * 5

        if (p.y <= canvas.height) {
          active = true
        }

        ctx.beginPath()
        ctx.lineWidth = p.r
        ctx.strokeStyle = p.color
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y)
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2)
        ctx.stroke()
      })

      if (active) {
        animationFrameId.current = requestAnimationFrame(draw)
      }
    }

    draw()
  }

  // 10. Direct link trigger social review page and copy text
  const openSocialReviewLink = (platform: 'GOOGLE' | 'XIAOHONGSHU' | 'INSTAGRAM') => {
    // Update active verification platform tab dynamically
    setReviewPlatform(platform)

    // Copy recommended review copy text automatically
    try {
      navigator.clipboard.writeText(recommendedCopy)
      if (useAiText) {
        showToastMessage(lang === 'zh' ? 'AI生成文案已复制到剪切板！正在为您打开应用...' : 'AI-generated copy has been copied to clipboard! Opening app...')
      } else {
        showToastMessage(lang === 'zh' ? '推荐文案已复制到剪切板！正在为您打开应用...' : 'Review text copied! Opening app...')
      }
    } catch (err) {
      console.error('Failed to copy review text to clipboard', err)
    }

    const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    if (platform === 'GOOGLE') {
      const googleAccount = config?.brand?.accounts?.find(
        acc => acc.platformId.toLowerCase() === 'google' || acc.platformId.toLowerCase() === 'google_maps'
      )
      if (googleAccount?.profileUrl) {
        window.open(googleAccount.profileUrl, '_blank')
      } else {
        const placeId = config?.brand?.googlePlaceId
        const isValidPlaceId = placeId && placeId !== 'postfast-managed' && placeId.startsWith('ChI')
        if (isValidPlaceId) {
          window.open(`https://search.google.com/local/writereview?placeid=${placeId}`, '_blank')
        } else if (config?.brand?.name) {
          const query = encodeURIComponent(config.brand.name + (config.brand.location ? ' ' + config.brand.location : ''))
          window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
        } else {
          window.open('https://search.google.com/local/writereview?placeid=ChIJj61dQgK6j4AR4GeTYWZsKWw', '_blank') // Default demo place ID (Googleplex)
        }
      }
    } else if (platform === 'XIAOHONGSHU') {
      const account = config?.brand?.accounts?.find(
        acc => acc.platformId.toLowerCase() === 'xiaohongshu'
      )
      if (isMobile) {
        // Attempt to launch Xiaohongshu app direct to create note page
        window.location.href = 'xhsdiscover://post_note'
        // Fallback in case app not installed
        setTimeout(() => {
          if (account?.profileUrl) {
            window.open(account.profileUrl, '_blank')
          } else if (account?.handle) {
            window.open(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(account.handle)}`, '_blank')
          } else {
            window.open('https://www.xiaohongshu.com', '_blank')
          }
        }, 2000)
      } else {
        if (account?.profileUrl) {
          window.open(account.profileUrl, '_blank')
        } else if (account?.handle) {
          window.open(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(account.handle)}`, '_blank')
        } else {
          window.open('https://www.xiaohongshu.com', '_blank')
        }
      }
    } else if (platform === 'INSTAGRAM') {
      const account = config?.brand?.accounts?.find(
        acc => acc.platformId.toLowerCase() === 'instagram'
      )
      if (isMobile) {
        // Attempt to launch Instagram camera
        window.location.href = 'instagram://camera'
        // Fallback in case app not installed
        setTimeout(() => {
          if (account?.profileUrl) {
            window.open(account.profileUrl, '_blank')
          } else if (account?.handle) {
            window.open(`https://www.instagram.com/${account.handle}/`, '_blank')
          } else {
            window.open('https://www.instagram.com', '_blank')
          }
        }, 2000)
      } else {
        if (account?.profileUrl) {
          window.open(account.profileUrl, '_blank')
        } else if (account?.handle) {
          window.open(`https://www.instagram.com/${account.handle}/`, '_blank')
        } else {
          window.open('https://www.instagram.com', '_blank')
        }
      }
    }
  }

  const copyReviewText = () => {
    try {
      navigator.clipboard.writeText(recommendedCopy)
      showToastMessage(t.copied)
    } catch (err) {
      console.error('Failed to copy text', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#12072b] via-[#090314] to-[#04010a] text-slate-100 flex flex-col items-center p-4 relative overflow-x-hidden font-sans selection:bg-pink-500 selection:text-white">
      
      {/* Confetti overlay */}
      <canvas ref={confettiCanvasRef} className="fixed inset-0 pointer-events-none z-50 w-full h-full" />

      {/* Top Bar / Headers */}
      <header className="w-full max-w-md flex justify-between items-center mb-6 z-10 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/40">
            <span className="font-bold text-sm text-slate-950">AMC</span>
          </div>
          <span className="font-bold text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-400">
            {config?.title || '幸运大轮盘'}
          </span>
        </div>
        
        {/* Language selector toggle */}
        <div className="flex gap-2">
          <button 
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="px-3 py-1 text-xs font-semibold rounded-full border border-slate-700/50 bg-slate-900/80 hover:bg-slate-800 transition active:scale-95"
          >
            {lang === 'zh' ? '🇬🇧 English' : '🇨🇳 中文'}
          </button>
        </div>
      </header>

      {/* Main Game Container */}
      <main className="w-full max-w-md flex flex-col items-center gap-6 z-10 pb-16">
        
        {/* Points Display Card */}
        <div className="w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 flex justify-between items-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div>
            <p className="text-slate-400 text-xs tracking-wider uppercase font-semibold">{t.points}</p>
            <h2 className="text-4xl font-extrabold text-white mt-1 flex items-baseline gap-1">
              {points}
              <span className="text-xs text-blue-400 font-semibold uppercase">pts</span>
            </h2>
          </div>

          <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500/20 to-pink-500/20 border border-blue-500/20">
            <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-400 uppercase tracking-widest">
              {lang === 'zh' ? '好礼等您来' : 'Ready to Win'}
            </span>
          </div>
        </div>

        {/* Unclaimed Prize Banner (Crash Resilience) */}
        {unclaimedPrize && (
          <div className="w-full rounded-2xl bg-gradient-to-r from-pink-600/30 to-purple-600/30 border border-pink-500/40 p-4 flex justify-between items-center shadow-lg animate-pulse">
            <div>
              <h4 className="text-sm font-bold text-pink-300">{t.unclaimedTitle}</h4>
              <p className="text-xs text-slate-300 mt-1 font-semibold">{unclaimedPrize.prizeName}</p>
            </div>
            <button 
              onClick={() => setWinningPrize({ name: unclaimedPrize.prizeName, code: unclaimedPrize.redemptionCode })}
              className="px-4 py-1.5 text-xs font-bold bg-pink-500 text-white rounded-xl shadow-md shadow-pink-500/30 active:scale-95 transition"
            >
              {t.unclaimedClaim}
            </button>
          </div>
        )}

        {/* Lucky Spin Wheel (SVG Circular rendering) */}
        <div className="relative w-72 h-72 my-2 flex items-center justify-center">
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes led-blink-odd {
              0%, 100% { fill: #ffffff; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #3b82f6); }
              50% { fill: #fbbf24; filter: drop-shadow(0 0 2px #fbbf24) drop-shadow(0 0 4px #d97706); }
            }
            @keyframes led-blink-even {
              0%, 100% { fill: #fbbf24; filter: drop-shadow(0 0 2px #fbbf24) drop-shadow(0 0 4px #d97706); }
              50% { fill: #ffffff; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #3b82f6); }
            }
            .led-blink-odd {
              animation: led-blink-odd 1.2s infinite;
            }
            .led-blink-even {
              animation: led-blink-even 1.2s infinite;
            }
          `}} />

          {/* Neon outer ring decoration */}
          <div className="absolute inset-[-12px] rounded-full border-4 border-slate-900/60 shadow-[0_0_50px_rgba(59,130,246,0.3)] pointer-events-none" />
          <div className="absolute inset-[-6px] rounded-full border border-blue-500/30 pointer-events-none animate-pulse" />

          {/* Indicator needle at the top */}
          <div className="absolute top-[-15px] z-30 w-8 h-8 flex items-center justify-center filter drop-shadow-[0_4px_10px_rgba(244,63,94,0.5)]">
            <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
              <path d="M12 28L0 6C0 6 6 0 12 0C18 0 24 6 24 6L12 28Z" fill="#f43f5e" />
              <circle cx="12" cy="8" r="4" fill="#ffffff" />
            </svg>
          </div>

          {/* The Spinning Wheel */}
          <div 
            className="w-full h-full rounded-full overflow-hidden shadow-2xl relative border-4 border-slate-950 transition-transform duration-[5000ms] cubic-bezier(0.1, 0.8, 0.1, 1)"
            style={{ 
              transform: `rotate(${wheelRotation}deg)`,
              transformOrigin: '50% 50%'
            }}
          >
            {prizes.length > 0 ? (
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <defs>
                  {/* Neon slice gradients */}
                  <linearGradient id="slice-grad-0" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ff4b72" />
                    <stop offset="100%" stopColor="#d946ef" />
                  </linearGradient>
                  <linearGradient id="slice-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                  <linearGradient id="slice-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#14b8a6" />
                  </linearGradient>
                  <linearGradient id="slice-grad-3" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ff006e" />
                  </linearGradient>
                  <linearGradient id="slice-grad-4" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8338ec" />
                    <stop offset="100%" stopColor="#3a86ff" />
                  </linearGradient>
                  <linearGradient id="slice-grad-5" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06d6a0" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                  <linearGradient id="slice-grad-6" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffbe0b" />
                    <stop offset="100%" stopColor="#fb923c" />
                  </linearGradient>
                  <linearGradient id="slice-grad-7" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>

                {prizes.map((prize, idx) => {
                  const segments = prizes.length
                  const angle = 360 / segments
                  const startAngle = idx * angle
                  const endAngle = startAngle + angle

                  // Polar coordinates helper
                  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
                    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
                    return {
                      x: cx + r * Math.cos(angleInRadians),
                      y: cy + r * Math.sin(angleInRadians)
                    }
                  }

                  const start = polarToCartesian(50, 50, 50, startAngle)
                  const end = polarToCartesian(50, 50, 50, endAngle)
                  const largeArcFlag = angle <= 180 ? '0' : '1'
                  const fillColor = `url(#slice-grad-${idx % 8})`

                  // Compute text placement rotation & translation
                  const textAngle = startAngle + (angle / 2)
                  const textPos = polarToCartesian(50, 50, 28, textAngle)

                  // Auto flip text orientation to keep it right-side up
                  const normAngle = textAngle % 360
                  const isUpsideDown = normAngle > 90 && normAngle < 270
                  const displayRotation = isUpsideDown ? textAngle + 180 : textAngle

                  return (
                    <g key={prize.id}>
                      {/* Segment wedge path */}
                      <path
                        d={`M 50 50 L ${start.x} ${start.y} A 50 50 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`}
                        fill={fillColor}
                        stroke="#090514"
                        strokeWidth="0.8"
                      />
                      {/* Segment Text Label */}
                      <text
                        x={textPos.x}
                        y={textPos.y}
                        fill="#ffffff"
                        fontSize="3"
                        fontWeight="black"
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        paintOrder="stroke"
                        stroke="#000000"
                        strokeWidth="0.6"
                        transform={`rotate(${displayRotation}, ${textPos.x}, ${textPos.y})`}
                      >
                        <tspan x={textPos.x} dy="-0.5em">
                          {prize.name.length > 10 ? prize.name.substring(0, 8) + '...' : prize.name}
                        </tspan>
                        <tspan x={textPos.x} dy="1.1em" fontSize="2.2" fill="#ffeb3b" fontWeight="bold">
                          {Number((prize.probability * 100).toFixed(1))}%
                        </tspan>
                      </text>
                    </g>
                  )
                })}
              </svg>
            ) : (
              <div className="w-full h-full bg-slate-900 flex items-center justify-center text-xs text-slate-500">
                {lang === 'zh' ? '暂无奖品' : 'No Prizes'}
              </div>
            )}
          </div>

          {/* Static Outer Rim with Blinking LED Lights */}
          <div className="absolute inset-0 pointer-events-none z-10 w-full h-full">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* Outer border / rim */}
              <circle cx="50" cy="50" r="48" fill="none" stroke="#1e1b4b" strokeWidth="4" />
              <circle cx="50" cy="50" r="46.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="1 1" className="opacity-40" />
              {/* 24 Blinking LEDs */}
              {Array.from({ length: 24 }).map((_, i) => {
                const dotAngle = (i * 360) / 24
                const dotAngleRad = (dotAngle * Math.PI) / 180
                const r = 48
                const cx = 50 + r * Math.cos(dotAngleRad)
                const cy = 50 + r * Math.sin(dotAngleRad)
                const isOdd = i % 2 === 0
                return (
                  <circle 
                    key={i}
                    cx={cx}
                    cy={cy}
                    r="1.2"
                    className={isOdd ? 'led-blink-odd' : 'led-blink-even'}
                  />
                )
              })}
            </svg>
          </div>

          {/* Central Spin Trigger Button */}
          <button 
            disabled={isSpinning}
            onClick={triggerSpin}
            className={`absolute z-20 w-16 h-16 rounded-full border-4 border-slate-950 flex flex-col items-center justify-center font-black shadow-2xl active:scale-95 transition-all text-center leading-none ${
              isSpinning 
                ? 'bg-slate-800 text-slate-500 border-slate-900 cursor-not-allowed'
                : 'bg-gradient-to-tr from-pink-500 via-rose-500 to-violet-600 text-white hover:brightness-110 shadow-pink-500/30 hover:scale-105 active:scale-95'
            }`}
          >
            {/* Pulsing ring when active */}
            {!isSpinning && (
              <span className="absolute inset-0 rounded-full border border-pink-400/80 animate-ping opacity-70 pointer-events-none" />
            )}
            <span className="text-[12px] uppercase font-black tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {isSpinning ? '...' : (lang === 'zh' ? '抽奖' : 'SPIN')}
            </span>
            {!isSpinning && (
              <span className="text-[7px] text-pink-200 mt-0.5 tracking-wider uppercase font-bold">
                {lang === 'zh' ? '5积分' : '5 PTS'}
              </span>
            )}
          </button>
        </div>



        {/* Task Section Header */}
        <div className="w-full mt-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-2">
            {lang === 'zh' ? '🔥 赚取积分' : '🔥 Earn Points'}
          </h3>
        </div>

        {/* Unified Task Card */}
        {config && (
          <div className="w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 flex flex-col gap-4 shadow-xl">
            <div>
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                {t.submitReview}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {t.submitReviewSub}
              </p>
            </div>

            {/* Social review shortcuts */}
            <div className="flex flex-col gap-3.5 my-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  {lang === 'zh' ? '一键直达平台发表好评（自动复制文案）' : 'Direct Link to Post (Auto-copy review text)'}
                </label>
                
                {/* AI Copywriting Option */}
                <label className="flex items-center gap-1.5 cursor-pointer text-[10.5px] font-bold text-blue-300 select-none bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg hover:bg-blue-500/20 transition flex-shrink-0">
                  <input 
                    type="checkbox" 
                    checked={useAiText} 
                    onChange={(e) => setUseAiText(e.target.checked)}
                    className="rounded border-blue-900 bg-slate-950 text-blue-500 focus:ring-blue-500/20 w-3 h-3 cursor-pointer"
                  />
                  <span className="flex items-center gap-0.5">
                    <span>🤖</span>
                    {lang === 'zh' ? 'AI协助生成文案' : 'AI Copywriter'}
                  </span>
                </label>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {/* Google Maps Button */}
                <button
                  onClick={() => openSocialReviewLink('GOOGLE')}
                  className={`w-full py-5 px-6 rounded-2xl font-extrabold text-base flex items-center justify-between transition-all duration-300 border shadow-md hover:scale-[1.02] active:scale-[0.98] ${
                    reviewPlatform === 'GOOGLE' 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-400 text-white shadow-lg shadow-blue-500/40 scale-[1.02]' 
                      : 'bg-blue-950/30 hover:bg-blue-950/50 border-blue-800/40 text-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-3xl animate-bounce">🗺️</span>
                    <div className="text-left">
                      <p className={reviewPlatform === 'GOOGLE' ? 'text-white' : 'text-slate-100 font-bold'}>{t.googleMaps}</p>
                      <p className={`text-[11px] font-normal mt-0.5 ${reviewPlatform === 'GOOGLE' ? 'text-blue-200' : 'text-blue-400/80'}`}>
                        {lang === 'zh' ? '一键复制文案并直达写评价' : 'Copy text & write review'}
                      </p>
                    </div>
                  </div>
                  {reviewPlatform === 'GOOGLE' ? (
                    <span className="text-[11px] bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider text-white font-black">
                      {lang === 'zh' ? '已选' : 'Active'}
                    </span>
                  ) : (
                    <span className="text-base text-blue-400 font-extrabold">→</span>
                  )}
                </button>

                {/* Xiaohongshu Button */}
                <button
                  onClick={() => openSocialReviewLink('XIAOHONGSHU')}
                  className={`w-full py-5 px-6 rounded-2xl font-extrabold text-base flex items-center justify-between transition-all duration-300 border shadow-md hover:scale-[1.02] active:scale-[0.98] ${
                    reviewPlatform === 'XIAOHONGSHU' 
                      ? 'bg-gradient-to-r from-rose-500 to-red-600 border-rose-400 text-white shadow-lg shadow-rose-500/40 scale-[1.02]' 
                      : 'bg-rose-950/30 hover:bg-rose-950/50 border-rose-800/40 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-3xl animate-bounce">📕</span>
                    <div className="text-left">
                      <p className={reviewPlatform === 'XIAOHONGSHU' ? 'text-white' : 'text-slate-100 font-bold'}>{t.xiaohongshu}</p>
                      <p className={`text-[11px] font-normal mt-0.5 ${reviewPlatform === 'XIAOHONGSHU' ? 'text-rose-200' : 'text-rose-400/80'}`}>
                        {lang === 'zh' ? '一键复制文案并拉起小红书' : 'Copy text & open app'}
                      </p>
                    </div>
                  </div>
                  {reviewPlatform === 'XIAOHONGSHU' ? (
                    <span className="text-[11px] bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider text-white font-black">
                      {lang === 'zh' ? '已选' : 'Active'}
                    </span>
                  ) : (
                    <span className="text-base text-rose-400 font-extrabold">→</span>
                  )}
                </button>

                {/* Instagram Button */}
                <button
                  onClick={() => openSocialReviewLink('INSTAGRAM')}
                  className={`w-full py-5 px-6 rounded-2xl font-extrabold text-base flex items-center justify-between transition-all duration-300 border shadow-md hover:scale-[1.02] active:scale-[0.98] ${
                    reviewPlatform === 'INSTAGRAM' 
                      ? 'bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 border-pink-400 text-white shadow-lg shadow-pink-500/40 scale-[1.02]' 
                      : 'bg-pink-950/30 hover:bg-pink-950/50 border-pink-850/40 text-pink-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-3xl animate-bounce">📸</span>
                    <div className="text-left">
                      <p className={reviewPlatform === 'INSTAGRAM' ? 'text-white' : 'text-slate-100 font-bold'}>{t.instagram}</p>
                      <p className={`text-[11px] font-normal mt-0.5 ${reviewPlatform === 'INSTAGRAM' ? 'text-pink-200' : 'text-pink-400/80'}`}>
                        {lang === 'zh' ? '一键复制文案并直达相机' : 'Copy text & open camera'}
                      </p>
                    </div>
                  </div>
                  {reviewPlatform === 'INSTAGRAM' ? (
                    <span className="text-[11px] bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider text-white font-black">
                      {lang === 'zh' ? '已选' : 'Active'}
                    </span>
                  ) : (
                    <span className="text-base text-pink-400 font-extrabold">→</span>
                  )}
                </button>
              </div>

              {/* Data Use Agreement */}
              <label className="flex items-start gap-2.5 cursor-pointer mt-1 bg-slate-900/30 border border-slate-800/50 p-3 rounded-xl hover:border-slate-700 transition">
                <input 
                  type="checkbox" 
                  checked={copyrightAgreed} 
                  onChange={(e) => setCopyrightAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-750 bg-slate-950 text-blue-500 focus:ring-blue-500/20 w-4 h-4 cursor-pointer"
                />
                <span className="text-[10.5px] text-slate-350 leading-tight">
                  {t.copyright}
                </span>
              </label>

              {/* Secondary copy option */}
              <button
                onClick={copyReviewText}
                className="w-full py-2 rounded-xl bg-slate-900/40 border border-slate-800/80 text-[10px] font-bold text-slate-450 hover:text-slate-300 flex items-center justify-center gap-1 active:scale-95 transition mt-1"
              >
                <span>📋</span>
                {t.copyText}
              </button>
            </div>

            {/* Photo upload / screenshot selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {t.uploadScreenshot}
              </label>

              {/* Thumbnails list/grid */}
              <div className="grid grid-cols-3 gap-3">
                {filePreviews.map((preview, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl border border-slate-700 bg-slate-900/50 flex items-center justify-center overflow-hidden">
                    <img src={preview} alt={`preview_${idx}`} className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute top-1 right-1 bg-slate-950/80 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Plus button to add more */}
                {filePreviews.length === 0 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 transition bg-slate-900/50 flex flex-col items-center justify-center cursor-pointer text-center">
                    <span className="text-2xl text-slate-500">+</span>
                    <span className="text-[10px] text-slate-400 mt-1 font-semibold">
                      {t.uploadScreenshot}
                    </span>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleFilesChange}
                      className="hidden" 
                    />
                  </label>
                )}
              </div>
            </div>

            {verificationError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                {verificationError}
              </div>
            )}

            {/* Submit btn */}
            <button
              disabled={
                uploadedFiles.length === 0 ||
                !copyrightAgreed ||
                isSubmittingTask
              }
              onClick={submitTask}
              className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg transition active:scale-[0.98] ${
                uploadedFiles.length === 0 ||
                !copyrightAgreed ||
                isSubmittingTask
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/30'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
              }`}
            >
              {isSubmittingTask ? t.submitting : t.submitTask}
            </button>
          </div>
        )}
      </main>

      {/* Clerk PIN Authorization Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col gap-4 shadow-2xl relative">
            
            {/* Modal header */}
            <div className="text-center">
              <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-pink-500">
                {t.clerkTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {t.clerkDesc}
              </p>
            </div>

            <form onSubmit={handlePinSubmit} className="flex flex-col gap-4 mt-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  {t.inputPin}
                </label>
                <input 
                  type="password"
                  value={pinInput}
                  maxLength={6}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="******"
                  className="w-full mt-1.5 px-4 py-3 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-center text-2xl font-bold tracking-[1em] focus:outline-none"
                />
              </div>

              {pinError && (
                <p className="text-xs text-rose-500 font-semibold text-center mt-1">
                  {t.invalidPin}
                </p>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(null)
                    setPinInput('')
                    setPinError(null)
                  }}
                  className="flex-1 py-2.5 border border-slate-800 bg-slate-900/60 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  disabled={pinInput.length < 6}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest ${
                    pinInput.length < 6 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {t.submitPin}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Spin Result Modal */}
      {winningPrize && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-pink-500/20 p-6 flex flex-col items-center gap-6 shadow-2xl relative text-center">
            
            <div className="absolute top-[-40px] w-20 h-20 bg-pink-500/10 rounded-full blur-2xl pointer-events-none" />

            <div>
              <h3 className="text-2xl font-black text-white tracking-wide">
                {t.winTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {t.winSub}
              </p>
            </div>

            {/* Glowing Prize Container */}
            <div className="w-full py-6 rounded-2xl bg-gradient-to-r from-pink-500/10 to-blue-500/10 border border-pink-500/20 flex flex-col items-center justify-center relative overflow-hidden">
              <span className="text-3xl">🎁</span>
              <h4 className="text-xl font-extrabold text-white mt-2 tracking-wide">
                {winningPrize.name}
              </h4>
            </div>

            {/* 6-character Code Display */}
            <div className="w-full">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                {t.redeemCode}
              </span>
              <div className="mt-1.5 py-3 bg-slate-950 border border-slate-900 rounded-xl text-2xl font-mono font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-400">
                {winningPrize.code}
              </div>
            </div>

            {/* Close Button */}
            <button 
              onClick={() => {
                setWinningPrize(null)
                fetchStatus() // Refresh status (e.g. clear unclaimed alert)
              }}
              className="w-full py-3 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold tracking-widest uppercase active:scale-95 transition"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-slate-800 text-white text-xs px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
          <span>✨</span>
          <span className="font-bold tracking-wide">{toast}</span>
        </div>
      )}

    </div>
  )
}
