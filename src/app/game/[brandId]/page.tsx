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
  taskGoogleMapsEnabled: boolean
  taskXiaohongshuEnabled: boolean
  taskInstagramEnabled: boolean
  maxSpinsPerUserDay: number
  templateType: 'WHEEL' | 'GRID'
  brand?: {
    name: string
    location: string | null
    googlePlaceId: string | null
    googleBusinessUrl?: string | null
    googleReviewUrl?: string | null
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

function allocateGridSlots(prizesList: Prize[]): Prize[] {
  const activePrizes = prizesList.filter(p => p.probability > 0 || p.name);
  if (activePrizes.length === 0) return [];
  
  const slots: Prize[] = new Array(8).fill(null);
  
  if (activePrizes.length <= 8) {
    // 1. Give each active prize at least 1 slot
    const allocatedCounts = activePrizes.map(() => 1);
    let remainingSlots = 8 - activePrizes.length;
    
    // 2. Distribute remaining slots dynamically
    while (remainingSlots > 0) {
      let bestIndex = -1;
      let maxDeficit = -Infinity;
      
      for (let i = 0; i < activePrizes.length; i++) {
        const targetFraction = 8 * activePrizes[i].probability;
        const deficit = targetFraction - allocatedCounts[i];
        if (deficit > maxDeficit) {
          maxDeficit = deficit;
          bestIndex = i;
        }
      }
      
      if (bestIndex !== -1) {
        allocatedCounts[bestIndex]++;
        remainingSlots--;
      } else {
        break;
      }
    }
    
    // Construct flat array of allocated items
    const rawSlots: Prize[] = [];
    activePrizes.forEach((prize, idx) => {
      const count = allocatedCounts[idx];
      for (let c = 0; c < count; c++) {
        rawSlots.push(prize);
      }
    });
    
    // Interleave the rawSlots to avoid placing duplicates adjacent
    const counts: { [key: string]: number } = {};
    rawSlots.forEach(item => {
      const key = item.id || item.name;
      counts[key] = (counts[key] || 0) + 1;
    });
    
    const uniquePrizes = [...activePrizes].sort((a, b) => {
      const keyA = a.id || a.name;
      const keyB = b.id || b.name;
      return counts[keyB] - counts[keyA];
    });
    
    const orderedSlots: Prize[] = new Array(8).fill(null);
    const order = [0, 2, 4, 6, 1, 3, 5, 7];
    
    const sortedSlots: Prize[] = [];
    uniquePrizes.forEach(prize => {
      const key = prize.id || prize.name;
      const count = counts[key] || 0;
      for (let i = 0; i < count; i++) {
        sortedSlots.push(prize);
      }
    });
    
    for (let i = 0; i < 8; i++) {
      orderedSlots[order[i]] = sortedSlots[i];
    }
    
    return orderedSlots;
  } else {
    // If more than 8 active prizes, take the top 8 by probability descending
    const sorted = [...activePrizes].sort((a, b) => b.probability - a.probability);
    return sorted.slice(0, 8);
  }
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
  const [activeGridSlot, setActiveGridSlot] = useState<number | null>(null)

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

  // Manual verification modal
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
      submitReviewSub: '在 Google Maps/小红书/Instagram 发布好评或标记并上传凭证图片获得 5 个积分',
      photoSlot: '照片',
      copyright: '我同意数据使用协议：商家有权下载和使用本次发布所用的图片',
      submitTask: '提交任务',
      submitting: '正在提交，等待店员人工确认...',
      googleMaps: 'Google Maps 直达',
      xiaohongshu: '小红书直达',
      instagram: 'Instagram 直达',
      copyText: '一键复制好评文案',
      copied: '文案已复制到剪贴板！',
      uploadScreenshot: '上传任务凭证图片',
      clerkTitle: '等待店员人工确认',
      clerkDesc: '请向收银台店员出示您的评论页面，并请店员输入 6 位密码确认后发放积分。',
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
      combinedTaskSub: '在 Google Maps/小红书/Instagram 发表好评或标记，上传凭证图片及店内美图即可获得 5 个积分',
      screenshotFirstHint: '（提示：请上传可核验任务完成的凭证图片）',
      addMore: '添加照片',
      uploadPlaceholder: '上传任务凭证与店内美图 (可多选)',
    },
    en: {
      points: 'Points Balance',
      spin: 'SPIN (5 Points)',
      spinning: 'Spinning...',
      noPoints: 'Not enough points. Complete tasks below to earn points.',
      uploadPhotos: '📷 Share Store & Food Photos',
      uploadPhotosSub: 'Upload 3 store photos to earn 5 points',
      submitReview: '⭐ Leave a Social Review',
      submitReviewSub: 'Post on Google Maps/Xiaohongshu/Instagram and upload proof images to get 5 points',
      photoSlot: 'Photo',
      copyright: 'I agree to the Data Use Agreement: The merchant has the right to download and use the photos/screenshots uploaded for this post.',
      submitTask: 'Submit Task',
      submitting: 'Submitting and waiting for manual staff confirmation...',
      googleMaps: 'Direct Google Maps',
      xiaohongshu: 'Direct Xiaohongshu',
      instagram: 'Direct Instagram',
      copyText: 'Copy Review Text',
      copied: 'Copied to clipboard!',
      uploadScreenshot: 'Upload Proof Images',
      clerkTitle: 'Manual Confirmation Required',
      clerkDesc: 'Please show your review screen to the clerk and ask them to enter the 6-digit PIN to grant points.',
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
      combinedTaskSub: 'Post on Google Maps/Xiaohongshu/Instagram, upload proof images & store photos to earn 5 points',
      screenshotFirstHint: '(Note: upload images that can verify task completion)',
      addMore: 'Add Photo',
      uploadPlaceholder: 'Upload proof images & store photos (multi-select)',
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
          
          // Auto-select platform if only 1 is enabled
          const isGoogle = data.taskGoogleMapsEnabled ?? true
          const isXhs = data.taskXiaohongshuEnabled ?? true
          const isInsta = data.taskInstagramEnabled ?? true
          const enabledCount = (isGoogle ? 1 : 0) + (isXhs ? 1 : 0) + (isInsta ? 1 : 0)
          
          if (enabledCount === 1) {
            if (isGoogle) setReviewPlatform('GOOGLE')
            else if (isXhs) setReviewPlatform('XIAOHONGSHU')
            else if (isInsta) setReviewPlatform('INSTAGRAM')
          }
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

      // Optional: append files if user selected any (legacy-compatible)
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
        // Directly enter manual clerk confirmation flow.
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

      if (config?.templateType === 'GRID') {
        const slots = allocateGridSlots(prizes);
        if (slots.length === 0) {
          setIsSpinning(false);
          return;
        }

        // Find all matching slots for the winning prize
        const matchingIndices: number[] = [];
        slots.forEach((item, index) => {
          if (item && item.id === data.prize.id) {
            matchingIndices.push(index);
          }
        });

        const targetSlot = matchingIndices.length > 0 
          ? matchingIndices[Math.floor(Math.random() * matchingIndices.length)] 
          : 0;

        const startSlot = activeGridSlot !== null ? activeGridSlot : 0;
        const rounds = 3;
        const totalSteps = rounds * 8 + ((targetSlot - startSlot + 8) % 8);

        let step = 0;
        const runAnim = () => {
          const nextSlot = (startSlot + step) % 8;
          setActiveGridSlot(nextSlot);
          
          if (typeof navigator !== 'undefined' && navigator.vibrate && step % 2 === 0) {
            navigator.vibrate(10); // subtle haptic ticks during rotation
          }

          if (step < totalSteps) {
            step++;
            const stepsLeft = totalSteps - step;
            let delay = 60;
            if (stepsLeft <= 12) {
              delay = 60 + (12 - stepsLeft) * 35;
            }
            setTimeout(runAnim, delay);
          } else {
            setIsSpinning(false);
            setWinningPrize({ name: data.prize.name, code: data.redemptionCode });
            setPoints(data.pointsBalance);
            startConfetti();
            
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([300, 100, 300]);
            }
          }
        };
        runAnim();
      } else {
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
      }
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
      const configuredReviewUrl = config?.brand?.googleReviewUrl
      if (configuredReviewUrl) {
        window.open(configuredReviewUrl, '_blank')
        return
      }

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
        } else if (config?.brand?.googleBusinessUrl) {
          window.open(config.brand.googleBusinessUrl, '_blank')
        } else if (config?.brand?.name) {
          const query = encodeURIComponent(config.brand.name + (config.brand.location ? ' ' + config.brand.location : ''))
          window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
        } else {
          showToastMessage(lang === 'zh' ? '未配置 Google 商家信息，请联系门店管理员' : 'Google business config is missing, please contact the store admin')
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

  const getDynamicReviewSub = () => {
    if (!config) return ''
    const isGoogle = config.taskGoogleMapsEnabled ?? true
    const isXhs = config.taskXiaohongshuEnabled ?? true
    const isInsta = config.taskInstagramEnabled ?? true
    const none = !isGoogle && !isXhs && !isInsta
    
    const platforms: string[] = []
    if (isGoogle || none) platforms.push('Google Maps')
    if (isXhs || none) platforms.push(lang === 'zh' ? '小红书' : 'Xiaohongshu')
    if (isInsta || none) platforms.push('Instagram')
    
    const platformsText = platforms.join('/')
    if (lang === 'zh') {
      return `在 ${platformsText} 发布好评或标记并上传凭证图片获得 5 个积分`
    } else {
      return `Post on ${platformsText} and upload proof images to get 5 points`
    }
  }

  const isGoogleEnabled = config?.taskGoogleMapsEnabled ?? true
  const isXiaohongshuEnabled = config?.taskXiaohongshuEnabled ?? true
  const isInstagramEnabled = config?.taskInstagramEnabled ?? true
  const noneEnabled = !isGoogleEnabled && !isXiaohongshuEnabled && !isInstagramEnabled
  
  const showGoogle = isGoogleEnabled || noneEnabled
  const showXiaohongshu = isXiaohongshuEnabled || noneEnabled
  const showInstagram = isInstagramEnabled || noneEnabled

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#12072b] via-[#090314] to-[#04010a] text-slate-100 flex flex-col items-center px-2.5 py-4 min-[375px]:px-3.5 min-[410px]:px-4 relative overflow-x-hidden font-sans selection:bg-pink-500 selection:text-white">
      
      {/* Confetti overlay */}
      <canvas ref={confettiCanvasRef} className="fixed inset-0 pointer-events-none z-50 w-full h-full" />

      {/* Top Bar / Headers */}
      <header className="w-full max-w-md flex justify-between items-center mb-4 z-10 pt-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-pink-500 flex items-center justify-center shadow-md shadow-pink-500/20">
            <span className="font-bold text-xs text-white">AMC</span>
          </div>
          <span className="font-extrabold text-base tracking-wide text-white">
            {config?.title || '幸运大轮盘'}
          </span>
        </div>
        
        <div className="flex items-center gap-1.5">
          {/* Compact Points Pill in Header */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full py-1 px-2.5 backdrop-blur-md">
            <span className="text-xs">🪙</span>
            <span className="text-xs font-black text-amber-400 tracking-tight">{points}</span>
            <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-tighter">pts</span>
          </div>

          {/* Language selector toggle */}
          <button 
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="px-2.5 py-1 text-[10px] font-semibold rounded-full border border-slate-700/50 bg-slate-900/80 hover:bg-slate-800 transition active:scale-95"
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </header>

      {/* Main Game Container */}
      <main className="w-full max-w-md flex flex-col items-center gap-3 z-10 pb-10">

        {/* Unclaimed Prize Banner (Crash Resilience) - Super Slimmed Down */}
        {unclaimedPrize && (
          <div className="w-full rounded-xl bg-gradient-to-r from-pink-900/30 to-purple-900/30 border border-pink-500/25 py-1.5 px-3 flex justify-between items-center shadow-sm animate-pulse gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm">🎁</span>
              <div className="flex items-center gap-1.5 text-xs text-slate-200 min-w-0">
                <span className="font-bold text-pink-300 flex-shrink-0">{lang === 'zh' ? '未领奖品:' : 'Unclaimed:'}</span>
                <span className="truncate max-w-[160px] font-medium">{unclaimedPrize.prizeName}</span>
              </div>
            </div>
            <button 
              onClick={() => setWinningPrize({ name: unclaimedPrize.prizeName, code: unclaimedPrize.redemptionCode })}
              className="px-2.5 py-1 text-[10px] font-bold bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-lg shadow-md active:scale-95 transition flex-shrink-0"
            >
              {t.unclaimedClaim}
            </button>
          </div>
        )}

        {/* Activity Description / Rules */}
        {config?.description && (
          <div className="w-full rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-3.5 shadow-xl text-center">
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
              {config.description}
            </p>
          </div>
        )}

        {/* Lucky Spin Wheel or Nine-Grid container */}
        {config?.templateType === 'GRID' ? (
          /* Nine-Grid (九宫格 Circular-like grid layout) */
          <div className="relative w-[336px] h-[336px] min-[375px]:w-[358px] min-[375px]:h-[358px] min-[410px]:w-[388px] min-[410px]:h-[388px] my-2.5 p-3 bg-gradient-to-b from-[#180d30]/90 to-[#0a0515]/95 rounded-3xl border-4 border-[#cca43b]/70 shadow-[0_0_50px_rgba(204,164,59,0.2)] flex flex-col justify-between">
            {/* Blinking LEDs outer border */}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes led-glow-odd {
                0%, 100% { background-color: #f3e7c4; box-shadow: 0 0 4px #f3e7c4, 0 0 8px #cca43b; }
                50% { background-color: #1e0d3d; box-shadow: none; }
              }
              @keyframes led-glow-even {
                0%, 100% { background-color: #1e0d3d; box-shadow: none; }
                50% { background-color: #f3e7c4; box-shadow: 0 0 4px #f3e7c4, 0 0 8px #cca43b; }
              }
              .grid-led-glow-odd {
                animation: led-glow-odd 1.2s infinite;
              }
              .grid-led-glow-even {
                animation: led-glow-even 1.2s infinite;
              }
            `}} />

            {/* LED Dots */}
            <div className="absolute top-1.5 left-6 right-6 flex justify-between">
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-odd" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-even" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-odd" />
            </div>
            <div className="absolute bottom-1.5 left-6 right-6 flex justify-between">
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-even" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-odd" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-even" />
            </div>
            <div className="absolute left-1.5 top-6 bottom-6 flex flex-col justify-between">
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-odd" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-even" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-odd" />
            </div>
            <div className="absolute right-1.5 top-6 bottom-6 flex flex-col justify-between">
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-even" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-odd" />
              <span className="w-1.5 h-1.5 rounded-full grid-led-glow-even" />
            </div>

            <div className="grid grid-cols-3 gap-2 h-full w-full">
              {(() => {
                const slots = allocateGridSlots(prizes);
                const gridIndices = [0, 1, 2, 5, 8, 7, 6, 3];
                return Array.from({ length: 9 }).map((_, gIdx) => {
                  if (gIdx === 4) {
                    // Central SPIN Button
                    return (
                      <button
                        key={gIdx}
                        disabled={isSpinning}
                        onClick={triggerSpin}
                        style={{
                          background: isSpinning 
                            ? '#1a1329' 
                            : `radial-gradient(circle, #f3e7c4 0%, #cca43b 70%, #795a16 100%)`,
                        }}
                        className={`relative rounded-2xl flex flex-col items-center justify-center border-2 border-[#544012] shadow-2xl active:scale-95 transition-all duration-205 ${
                          isSpinning 
                            ? 'text-slate-500 cursor-not-allowed' 
                            : 'text-slate-950 hover:brightness-110 shadow-[0_0_20px_rgba(220,174,66,0.35)] hover:scale-[1.02]'
                        }`}
                      >
                        {!isSpinning && (
                          <span className="absolute inset-0 rounded-2xl border border-[#f3e7c4]/50 animate-ping opacity-60 pointer-events-none" />
                        )}
                        <span className="text-xs font-black tracking-widest drop-shadow-md">
                          {isSpinning ? '...' : (lang === 'zh' ? '抽奖' : 'SPIN')}
                        </span>
                        {!isSpinning && (
                          <span className="text-[7.5px] text-slate-800 mt-1 uppercase font-black tracking-wider opacity-85">
                            {lang === 'zh' ? '5积分' : '5 PTS'}
                          </span>
                        )}
                      </button>
                    );
                  }

                  const slotIdx = gridIndices.indexOf(gIdx);
                  const prize = slots[slotIdx];
                  const isActive = activeGridSlot === slotIdx;

                  if (!prize) {
                    return (
                      <div 
                        key={gIdx} 
                        className="bg-slate-900/60 rounded-2xl border border-slate-800/80 flex items-center justify-center text-xs text-slate-700 font-semibold"
                      >
                        {lang === 'zh' ? '无奖品' : 'Empty'}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={gIdx}
                      style={{
                        borderColor: isActive ? (config?.themeColor || '#3b82f6') : 'rgba(255, 255, 255, 0.08)',
                        backgroundColor: isActive ? `${config?.themeColor || '#3b82f6'}22` : 'rgba(255, 255, 255, 0.04)',
                        boxShadow: isActive 
                          ? `0 0 15px ${config?.themeColor || '#3b82f6'}, inset 0 0 8px ${config?.themeColor || '#3b82f6'}33` 
                          : 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                      }}
                      className={`rounded-2xl border transition-all duration-150 flex flex-col items-center justify-center p-1 text-center relative overflow-hidden backdrop-blur-sm`}
                    >
                      {isActive && (
                        <div 
                          style={{ backgroundColor: config?.themeColor || '#3b82f6' }}
                          className="absolute inset-0 opacity-5 blur-xl pointer-events-none" 
                        />
                      )}
                      
                      <span className="text-xl mb-1 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                        {prize.type === 'COUPON' ? '🎫' : prize.type === 'POINTS' ? '🪙' : prize.type === 'PHYSICAL' ? '🎁' : '🌸'}
                      </span>
                      
                      <span className="text-[10px] font-bold text-slate-100 truncate w-full px-1 tracking-wide leading-tight">
                        {prize.name}
                      </span>

                      <span className="text-[7.5px] font-black text-amber-400 mt-1 uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/15 leading-none">
                        {(prize.probability * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : (
          /* Lucky Spin Wheel (SVG Circular rendering) */
          <div className="relative w-[336px] h-[336px] min-[375px]:w-[358px] min-[375px]:h-[358px] min-[410px]:w-[388px] min-[410px]:h-[388px] my-2.5 flex items-center justify-center">
            {/* Blinking LEDs keyframes & styles */}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes led-blink-odd {
                0%, 100% { fill: #ffffff; filter: drop-shadow(0 0 3px #ffffff) drop-shadow(0 0 5px #e87b1e); }
                50% { fill: #f3e8d0; filter: drop-shadow(0 0 1px #f3e8d0); }
              }
              @keyframes led-blink-even {
                0%, 100% { fill: #f3e8d0; filter: drop-shadow(0 0 1px #f3e8d0); }
                50% { fill: #ffffff; filter: drop-shadow(0 0 3px #ffffff) drop-shadow(0 0 5px #e87b1e); }
              }
              .led-blink-odd {
                animation: led-blink-odd 1.2s infinite;
              }
              .led-blink-even {
                animation: led-blink-even 1.2s infinite;
              }
            `}} />

            {/* Clean outer ring decoration matching reference */}
            <div className="absolute inset-[-18px] rounded-full border-[6px] border-white/90 shadow-[0_4px_24px_rgba(0,0,0,0.35)] pointer-events-none" />
            <div className="absolute inset-[-10px] rounded-full border-2 border-[#e87b1e]/40 pointer-events-none" />

            {/* Indicator needle at the top - dark brown matching reference */}
            <div className="absolute top-[-20px] z-30 w-8 h-10 flex items-center justify-center filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
              <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
                <path d="M14 36L1 8C1 8 7 0 14 0C21 0 27 8 27 8L14 36Z" fill="#3d2010" stroke="#ffffff" strokeWidth="1.5" />
                <circle cx="14" cy="10" r="5" fill="#ffffff" />
                <circle cx="14" cy="10" r="2.5" fill="#3d2010" />
              </svg>
            </div>

            {/* The Spinning Wheel */}
            <div 
              className="w-full h-full rounded-full overflow-hidden shadow-2xl relative border-[6px] border-white transition-transform duration-[5000ms] cubic-bezier(0.1, 0.8, 0.1, 1)"
              style={{ 
                transform: `rotate(${wheelRotation}deg)`,
                transformOrigin: '50% 50%'
              }}
            >
              {prizes.length > 0 ? (
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <defs>
                    {/* Warm earthy palette matching the reference OK Cashbag wheel */}
                    {/* Colors cycle: dark-brown, orange, cream, olive-green, dark-green, red-orange, beige, forest */}
                  </defs>

                  {/* Layer 1: Wedges paths */}
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
                    // Warm earthy palette from reference (cycles through 6 distinct colors)
                    const SLICE_COLORS = ['#3d2010', '#e87b1e', '#f3e8d0', '#8da628', '#4a6b1e', '#c0392b', '#e87b1e', '#8da628']
                    const fillColor = SLICE_COLORS[idx % SLICE_COLORS.length]

                    return (
                      <path
                        key={`wedge-${prize.id || idx}`}
                        d={`M 50 50 L ${start.x} ${start.y} A 50 50 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`}
                        fill={fillColor}
                        stroke="#ffffff"
                        strokeWidth="0.5"
                      />
                    )
                  })}

                  {/* Layer 2: Clean white spoke dividers matching reference */}
                  <circle cx="50" cy="50" r="18" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
                  <circle cx="50" cy="50" r="49.5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.4" />

                  {/* Layer 3: Text Labels */}
                  {prizes.map((prize, idx) => {
                    const segments = prizes.length
                    const angle = 360 / segments
                    const startAngle = idx * angle

                    // Polar coordinates helper
                    const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
                      const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
                      return {
                        x: cx + r * Math.cos(angleInRadians),
                        y: cy + r * Math.sin(angleInRadians)
                      }
                    }

                    // Compute text placement rotation & translation
                    const textAngle = startAngle + (angle / 2)
                    const textPos = polarToCartesian(50, 50, 28, textAngle)

                    // Auto flip text orientation to keep it right-side up
                    const normAngle = textAngle % 360
                    const isUpsideDown = normAngle > 90 && normAngle < 270
                    const displayRotation = isUpsideDown ? textAngle + 180 : textAngle

                    // Use light text on dark slices, dark text on light slices (cream)
                    const SLICE_COLORS_TEXT = ['#3d2010', '#e87b1e', '#f3e8d0', '#8da628', '#4a6b1e', '#c0392b', '#e87b1e', '#8da628']
                    const sliceColor = SLICE_COLORS_TEXT[idx % SLICE_COLORS_TEXT.length]
                    const isLightSlice = sliceColor === '#f3e8d0'
                    const textFill = isLightSlice ? '#3d2010' : '#ffffff'
                    const subTextFill = isLightSlice ? '#8da628' : '#f3e8d0'

                    return (
                      <text
                        key={`text-${prize.id || idx}`}
                        x={textPos.x}
                        y={textPos.y}
                        fill={textFill}
                        fontSize="3.2"
                        fontWeight="900"
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        paintOrder="stroke"
                        stroke={isLightSlice ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)'}
                        strokeWidth="0.4"
                        transform={`rotate(${displayRotation}, ${textPos.x}, ${textPos.y})`}
                      >
                        <tspan x={textPos.x} dy="-0.5em">
                          {prize.name.length > 10 ? prize.name.substring(0, 8) + '...' : prize.name}
                        </tspan>
                        <tspan x={textPos.x} dy="1.2em" fontSize="2.2" fill={subTextFill} fontWeight="bold">
                          {Number((prize.probability * 100).toFixed(1))}%
                        </tspan>
                      </text>
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
                {/* Outer white border rim matching reference */}
                <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeWidth="2" />
                <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
                
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

            {/* Central Spin Trigger Button - white circle with logo style matching reference */}
            <button 
              disabled={isSpinning}
              onClick={triggerSpin}
              className={`absolute z-20 w-[84px] h-[84px] rounded-full flex flex-col items-center justify-center font-black shadow-2xl active:scale-95 transition-all text-center leading-none border-4 ${
                isSpinning 
                  ? 'bg-slate-200 text-slate-400 border-white cursor-not-allowed'
                  : 'bg-white border-white text-[#3d2010] hover:brightness-95 shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95'
              }`}
            >
              {/* Pulsing ring when active */}
              {!isSpinning && (
                <span className="absolute -inset-2 rounded-full border-2 border-white/50 animate-ping opacity-60 pointer-events-none" />
              )}
              <span className="text-[15px] uppercase font-black tracking-widest text-[#3d2010] drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">
                {isSpinning ? '...' : (lang === 'zh' ? '抽奖' : 'SPIN')}
              </span>
              {!isSpinning && (
                <span className="text-[8px] text-[#8da628] mt-0.5 tracking-wider uppercase font-black">
                  {lang === 'zh' ? '5积分' : '5 PTS'}
                </span>
              )}
            </button>
          </div>
        )}



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
                {getDynamicReviewSub()}
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
                {showGoogle && (
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
                )}

                {/* Xiaohongshu Button */}
                {showXiaohongshu && (
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
                )}

                {/* Instagram Button */}
                {showInstagram && (
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
                )}
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

            {verificationError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                {verificationError}
              </div>
            )}

            {/* Submit btn */}
            <button
              disabled={
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
