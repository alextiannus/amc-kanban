'use client'

import { useEffect, useMemo, useState } from 'react'

type Prize = {
  id?: string
  name: string
  type: 'COUPON' | 'PHYSICAL' | 'POINTS' | 'THANKS'
  probability: number
  totalInventory: number | null
  claimedCount?: number
  imageUrl?: string | null
}

type GameConfig = {
  title: string
  description: string | null
  themeColor: string
  taskReviewEnabled?: boolean
  taskGoogleMapsEnabled: boolean
  taskXiaohongshuEnabled: boolean
  taskInstagramEnabled: boolean
  maxSpinsPerUserDay?: number | null
  templateType: 'WHEEL' | 'GRID'
  prizes: Prize[]
  brand?: {
    name?: string
    location?: string | null
    googleReviewUrl?: string | null
    googleBusinessUrl?: string | null
    accounts?: { platformId: string; profileUrl?: string | null; handle?: string | null }[]
  }
}

type GameStatus = {
  pointsBalance: number
  unclaimedPrizes: {
    logId: string
    prizeName: string
    prizeType: string
    redemptionCode: string
  }[]
}

type SpinResult = {
  prize: { name: string; type: string; imageUrl?: string | null }
  redemptionCode: string
  pointsBalance: number
}

type Platform = 'GOOGLE' | 'XIAOHONGSHU' | 'INSTAGRAM'

type PendingSubmission = {
  submissionId: string
  platform: Platform
}

type Locale = 'zh' | 'en'

const copy = {
  en: {
    loading: 'Loading activity...',
    unavailableTitle: 'Activity unavailable',
    defaultBrand: 'AMC Activity',
    defaultTitle: 'Scan & Win',
    luckyGrid: 'Lucky Grid',
    luckyWheel: 'Lucky Wheel',
    tapToPlay: 'Tap to play',
    grid: 'Grid',
    wheel: 'Wheel',
    points: 'Points',
    noDailyLimit: 'No daily limit',
    spinsPerDay: (count: number) => `${count} spins per day`,
    cost: 'Cost: 5 points',
    spin: 'Spin',
    spinning: 'Spinning...',
    youWon: 'You won',
    showCode: 'Show this code to store staff.',
    unclaimedRewards: 'Unclaimed rewards',
    earnPoints: 'Earn points',
    earnPointsBody: 'Publish on one channel, then ask store staff to confirm with the PIN. Each confirmed task adds 5 points.',
    published: 'I published it',
    recording: 'Recording...',
    staffConfirmation: 'Staff confirmation',
    waitingConfirmation: (platform: string) => `${platform} is waiting for staff PIN confirmation.`,
    staffPin: 'Staff PIN',
    checking: 'Checking',
    confirm: 'Confirm',
    prizePool: 'Prize pool',
    chance: (value: string) => `${value}% chance`,
    unlimited: 'Unlimited',
    left: (count: number) => `${count} left`,
    empty: 'Empty',
    tap: 'Tap',
    activityNotReady: 'This activity is not ready yet.',
    statusLoadFailed: 'Unable to load your game status.',
    openFailed: 'Unable to open this activity.',
    submitFailed: 'Submission failed.',
    confirmationFailed: 'Staff confirmation failed.',
    spinFailed: 'Spin failed.',
    taskSubmitted: 'Completed. Please ask staff to enter the PIN and confirm your points.',
    taskConfirmed: 'Confirmed. 5 points have been added. You can play now.',
    googleReview: 'Google review',
    xiaohongshu: 'Xiaohongshu',
    instagram: 'Instagram',
    noPrize: 'No prize',
  },
  zh: {
    loading: '活动加载中...',
    unavailableTitle: '活动暂不可用',
    defaultBrand: 'AMC 活动',
    defaultTitle: '扫码抽奖',
    luckyGrid: '幸运九宫格',
    luckyWheel: '幸运转盘',
    tapToPlay: '点击抽奖',
    grid: '九宫格',
    wheel: '转盘',
    points: '积分',
    noDailyLimit: '不限每日次数',
    spinsPerDay: (count: number) => `每日 ${count} 次`,
    cost: '每次 5 积分',
    spin: '抽奖',
    spinning: '抽奖中...',
    youWon: '恭喜中奖',
    showCode: '请向店员出示兑换码。',
    unclaimedRewards: '待领取奖品',
    earnPoints: '赚取积分',
    earnPointsBody: '选择一个平台发布后，请店员输入 PIN 确认。每次确认可获得 5 积分。',
    published: '我已发布',
    recording: '提交中...',
    staffConfirmation: '员工确认',
    waitingConfirmation: (platform: string) => `${platform} 等待员工输入 PIN 确认。`,
    staffPin: '员工 PIN',
    checking: '确认中',
    confirm: '确认',
    prizePool: '奖品池',
    chance: (value: string) => `${value}% 概率`,
    unlimited: '不限量',
    left: (count: number) => `剩余 ${count}`,
    empty: '空',
    tap: '点击',
    activityNotReady: '活动还没有准备好。',
    statusLoadFailed: '无法加载你的游戏状态。',
    openFailed: '无法打开活动。',
    submitFailed: '提交失败。',
    confirmationFailed: '员工确认失败。',
    spinFailed: '抽奖失败。',
    taskSubmitted: '已提交，请让店员输入 PIN 确认积分。',
    taskConfirmed: '确认成功，已增加 5 积分。现在可以抽奖了。',
    googleReview: 'Google 评价',
    xiaohongshu: '小红书',
    instagram: 'Instagram',
    noPrize: '谢谢参与',
  },
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const lang = new URLSearchParams(window.location.search).get('lang')?.toLowerCase()
  if (lang?.startsWith('zh')) return 'zh'
  if (lang?.startsWith('en')) return 'en'
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function getSessionId(brandId: string): string {
  const key = `amc-game-session:${brandId}`
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const next = crypto.randomUUID()
  window.localStorage.setItem(key, next)
  return next
}

function platformLabel(platform: Platform, locale: Locale): string {
  if (platform === 'GOOGLE') return copy[locale].googleReview
  if (platform === 'XIAOHONGSHU') return copy[locale].xiaohongshu
  return copy[locale].instagram
}

function platformUrl(config: GameConfig | null, platform: Platform): string | undefined {
  if (!config) return undefined
  if (platform === 'GOOGLE') return config.brand?.googleReviewUrl || config.brand?.googleBusinessUrl || undefined
  const account = config.brand?.accounts?.find((item) => item.platformId.toLowerCase() === platform.toLowerCase())
  return account?.profileUrl || undefined
}

function getPlatformAccount(config: GameConfig | null, platform: Platform) {
  if (!config || platform === 'GOOGLE') return undefined
  return config.brand?.accounts?.find((item) => item.platformId.toLowerCase() === platform.toLowerCase())
}

function instagramUsername(config: GameConfig | null): string | undefined {
  const account = getPlatformAccount(config, 'INSTAGRAM')
  const handle = account?.handle?.replace(/^@/, '').trim()
  if (handle) return handle

  const profileUrl = account?.profileUrl
  if (!profileUrl) return undefined
  try {
    const url = new URL(profileUrl)
    return url.pathname.split('/').filter(Boolean)[0]
  } catch {
    return undefined
  }
}

function buildPlatformOpenTarget(config: GameConfig | null, platform: Platform): { appUrl: string; webUrl: string } {
  const webUrl = platformUrl(config, platform)

  if (platform === 'GOOGLE') {
    const fallback = webUrl || 'https://www.google.com/maps'
    const encodedFallback = encodeURIComponent(fallback)
    return {
      appUrl: `comgooglemaps://?q=${encodedFallback}`,
      webUrl: fallback,
    }
  }

  if (platform === 'INSTAGRAM') {
    const username = instagramUsername(config)
    return {
      appUrl: username ? `instagram://user?username=${encodeURIComponent(username)}` : 'instagram://app',
      webUrl: webUrl || (username ? `https://www.instagram.com/${encodeURIComponent(username)}/` : 'https://www.instagram.com/'),
    }
  }

  const fallback = webUrl || 'https://www.xiaohongshu.com/'
  return {
    appUrl: `xhsdiscover://webview?url=${encodeURIComponent(fallback)}`,
    webUrl: fallback,
  }
}

function inventoryLabel(prize: Prize, locale: Locale): string {
  if (prize.totalInventory === null) return copy[locale].unlimited
  return copy[locale].left(Math.max(prize.totalInventory - (prize.claimedCount || 0), 0))
}

function allocateGridSlots(prizesList: Prize[]): Prize[] {
  const activePrizes = prizesList.filter((prize) => prize.probability > 0 || prize.name)
  if (activePrizes.length === 0) return []

  if (activePrizes.length > 8) {
    return [...activePrizes].sort((a, b) => b.probability - a.probability).slice(0, 8)
  }

  const allocatedCounts = activePrizes.map(() => 1)
  let remainingSlots = 8 - activePrizes.length

  while (remainingSlots > 0) {
    let bestIndex = -1
    let maxDeficit = -Infinity

    for (let index = 0; index < activePrizes.length; index += 1) {
      const targetFraction = 8 * activePrizes[index].probability
      const deficit = targetFraction - allocatedCounts[index]
      if (deficit > maxDeficit) {
        maxDeficit = deficit
        bestIndex = index
      }
    }

    if (bestIndex === -1) break
    allocatedCounts[bestIndex] += 1
    remainingSlots -= 1
  }

  const rawSlots: Prize[] = []
  activePrizes.forEach((prize, index) => {
    for (let count = 0; count < allocatedCounts[index]; count += 1) {
      rawSlots.push(prize)
    }
  })

  const counts: Record<string, number> = {}
  rawSlots.forEach((item) => {
    const key = item.id || item.name
    counts[key] = (counts[key] || 0) + 1
  })

  const sortedSlots: Prize[] = []
  ;[...activePrizes]
    .sort((a, b) => counts[b.id || b.name] - counts[a.id || a.name])
    .forEach((prize) => {
      const key = prize.id || prize.name
      for (let index = 0; index < (counts[key] || 0); index += 1) {
        sortedSlots.push(prize)
      }
    })

  const order = [0, 2, 4, 6, 1, 3, 5, 7]
  const orderedSlots: Prize[] = new Array(8)
  for (let index = 0; index < 8; index += 1) {
    orderedSlots[order[index]] = sortedSlots[index]
  }
  return orderedSlots
}

function prizeIcon(type: Prize['type']): string {
  if (type === 'COUPON') return '🎫'
  if (type === 'POINTS') return '🪙'
  if (type === 'PHYSICAL') return '🎁'
  return '✨'
}

function GameBoard({
  config,
  spinning,
  wheelRotation,
  gridActiveSlot,
  onSpin,
  locale,
}: {
  config: GameConfig
  spinning: boolean
  wheelRotation: number
  gridActiveSlot: number | null
  onSpin: () => void
  locale: Locale
}) {
  const t = copy[locale]

  if (config.templateType === 'GRID') {
    const slots = allocateGridSlots(config.prizes)
    const gridIndices = [0, 1, 2, 5, 8, 7, 6, 3]

    return (
      <div className="rounded-[28px] bg-slate-950 p-4 shadow-xl shadow-slate-950/20">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes customer-grid-led-odd {
            0%, 100% { background-color: #ffffff; box-shadow: 0 0 2px #fff, 0 0 6px #f59e0b; }
            50% { background-color: #fbbf24; box-shadow: 0 0 2px #fbbf24, 0 0 8px #d97706; }
          }
          @keyframes customer-grid-led-even {
            0%, 100% { background-color: #fbbf24; box-shadow: 0 0 2px #fbbf24, 0 0 8px #d97706; }
            50% { background-color: #ffffff; box-shadow: 0 0 2px #fff, 0 0 6px #f59e0b; }
          }
          .customer-grid-led-odd { animation: customer-grid-led-odd 1.2s infinite; }
          .customer-grid-led-even { animation: customer-grid-led-even 1.2s infinite; }
        `}} />
        <div className="relative mx-auto aspect-square w-full max-w-[320px] rounded-[24px] border-4 border-slate-900/70 p-4">
          <div className="absolute left-8 right-8 top-1 flex justify-between">
            <span className="customer-grid-led-odd h-2 w-2 rounded-full" />
            <span className="customer-grid-led-even h-2 w-2 rounded-full" />
            <span className="customer-grid-led-odd h-2 w-2 rounded-full" />
          </div>
          <div className="absolute bottom-1 left-8 right-8 flex justify-between">
            <span className="customer-grid-led-even h-2 w-2 rounded-full" />
            <span className="customer-grid-led-odd h-2 w-2 rounded-full" />
            <span className="customer-grid-led-even h-2 w-2 rounded-full" />
          </div>
          <div className="grid h-full w-full grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, gridIndex) => {
              if (gridIndex === 4) {
                return (
                  <button
                    key={gridIndex}
                    onClick={onSpin}
                    disabled={spinning || config.prizes.length === 0}
                    className="rounded-2xl border border-white/20 text-white shadow-lg active:scale-95 disabled:opacity-70"
                    style={{ background: `radial-gradient(circle, ${config.themeColor || '#db2777'} 0%, #4c0519 100%)` }}
                  >
                    <span className="block text-xs font-black uppercase tracking-widest">{t.tap}</span>
                    <span className="block text-lg font-black uppercase tracking-widest">{t.spin}</span>
                  </button>
                )
              }

              const slotIndex = gridIndices.indexOf(gridIndex)
              const prize = slots[slotIndex]
              const isActive = gridActiveSlot === slotIndex
              return (
                <div
                  key={gridIndex}
                  className="flex flex-col items-center justify-center overflow-hidden rounded-2xl border p-1 text-center transition-all duration-150"
                  style={{
                    borderColor: isActive ? (config.themeColor || '#db2777') : 'rgba(51, 65, 85, 0.9)',
                    backgroundColor: isActive ? `${config.themeColor || '#db2777'}2b` : 'rgba(15, 23, 42, 0.7)',
                    boxShadow: isActive ? `0 0 16px ${config.themeColor || '#db2777'}` : 'none',
                  }}
                >
                  {prize ? (
                    <>
                      {prize.imageUrl ? (
                        <img src={prize.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                      ) : (
                        <span className="text-2xl">{prizeIcon(prize.type)}</span>
                      )}
                      <span className="mt-1 w-full truncate text-[11px] font-black leading-tight text-white">{prize.name}</span>
                      <span className="mt-0.5 text-[9px] font-bold text-amber-300">{(prize.probability * 100).toFixed(0)}%</span>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-slate-500">{t.empty}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const prizes = config.prizes.length ? config.prizes : [{ name: t.noPrize, type: 'THANKS' as const, probability: 1, totalInventory: null }]
  const sliceColors = ['#3d2010', '#e87b1e', '#f3e8d0', '#8da628', '#4a6b1e', '#c0392b', '#2563eb', '#7c3aed']

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[330px] items-center justify-center">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes customer-wheel-led-odd {
          0%, 100% { fill: #ffffff; filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #e87b1e); }
          50% { fill: #f3e8d0; filter: drop-shadow(0 0 1px #f3e8d0); }
        }
        @keyframes customer-wheel-led-even {
          0%, 100% { fill: #f3e8d0; filter: drop-shadow(0 0 1px #f3e8d0); }
          50% { fill: #ffffff; filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 4px #e87b1e); }
        }
        .customer-wheel-led-odd { animation: customer-wheel-led-odd 1.2s infinite; }
        .customer-wheel-led-even { animation: customer-wheel-led-even 1.2s infinite; }
      `}} />
      <div className="absolute inset-[-10px] rounded-full border-[8px] border-white shadow-xl shadow-slate-950/25" />
      <div className="absolute top-[-14px] z-30 flex h-9 w-8 items-center justify-center drop-shadow-lg">
        <svg width="24" height="30" viewBox="0 0 18 22" fill="none">
          <path d="M9 22L1 6C1 6 4.5 0 9 0C13.5 0 17 6 17 6L9 22Z" fill="#3d2010" stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="9" cy="7" r="3.2" fill="#ffffff" />
          <circle cx="9" cy="7" r="1.6" fill="#3d2010" />
        </svg>
      </div>
      <button
        onClick={onSpin}
        disabled={spinning || config.prizes.length === 0}
        className="absolute z-20 flex h-20 w-20 items-center justify-center rounded-full border-[5px] border-white bg-white text-sm font-black uppercase tracking-widest text-[#3d2010] shadow-xl active:scale-95 disabled:opacity-70"
      >
        {spinning ? '...' : t.spin}
      </button>
      <div
        className="h-full w-full overflow-hidden rounded-full border-[6px] border-white transition-transform duration-[5000ms] ease-[cubic-bezier(0.1,0.8,0.1,1)]"
        style={{ transform: `rotate(${wheelRotation}deg)` }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {prizes.map((prize, index) => {
            const segments = prizes.length
            const angle = 360 / segments
            const startAngle = index * angle
            const endAngle = startAngle + angle
            const radius = 50
            const start = ((startAngle - 90) * Math.PI) / 180
            const end = ((endAngle - 90) * Math.PI) / 180
            const point1 = { x: 50 + radius * Math.cos(start), y: 50 + radius * Math.sin(start) }
            const point2 = { x: 50 + radius * Math.cos(end), y: 50 + radius * Math.sin(end) }
            const fillColor = sliceColors[index % sliceColors.length]
            const textAngle = startAngle + angle / 2
            const textRad = ((textAngle - 90) * Math.PI) / 180
            const textPos = { x: 50 + 30 * Math.cos(textRad), y: 50 + 30 * Math.sin(textRad) }
            const isUpsideDown = textAngle % 360 > 90 && textAngle % 360 < 270
            const displayRotation = isUpsideDown ? textAngle + 180 : textAngle
            const darkText = fillColor === '#f3e8d0'

            return (
              <g key={prize.id || `${prize.name}-${index}`}>
                <path
                  d={`M 50 50 L ${point1.x} ${point1.y} A 50 50 0 ${angle <= 180 ? '0' : '1'} 1 ${point2.x} ${point2.y} Z`}
                  fill={fillColor}
                  stroke="#ffffff"
                  strokeWidth="0.5"
                />
                <text
                  x={textPos.x}
                  y={textPos.y}
                  fill={darkText ? '#3d2010' : '#ffffff'}
                  fontSize="3.6"
                  fontWeight="900"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  paintOrder="stroke"
                  stroke={darkText ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}
                  strokeWidth="0.4"
                  transform={`rotate(${displayRotation}, ${textPos.x}, ${textPos.y})`}
                >
                  <tspan x={textPos.x} dy="-0.4em">{prize.name.length > 9 ? `${prize.name.slice(0, 7)}..` : prize.name}</tspan>
                  <tspan x={textPos.x} dy="1.2em" fontSize="2.5" fill={darkText ? '#8da628' : '#f3e8d0'} fontWeight="bold">
                    {Number((prize.probability * 100).toFixed(1))}%
                  </tspan>
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 h-full w-full">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeWidth="2" />
          {Array.from({ length: 24 }).map((_, index) => {
            const angle = (index * 360) / 24
            const rad = (angle * Math.PI) / 180
            const cx = 50 + 48 * Math.cos(rad)
            const cy = 50 + 48 * Math.sin(rad)
            return <circle key={index} cx={cx} cy={cy} r="1.2" className={index % 2 === 0 ? 'customer-wheel-led-odd' : 'customer-wheel-led-even'} />
          })}
        </svg>
      </div>
    </div>
  )
}

export default function CustomerGameClient({ brandId }: { brandId: string }) {
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [status, setStatus] = useState<GameStatus | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('GOOGLE')
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null)
  const [staffPin, setStaffPin] = useState('')
  const [submittingTask, setSubmittingTask] = useState(false)
  const [confirmingTask, setConfirmingTask] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [gridActiveSlot, setGridActiveSlot] = useState<number | null>(null)
  const [locale, setLocale] = useState<Locale>('en')

  const accent = config?.themeColor || '#2563eb'
  const t = copy[locale]
  const activePrizes = useMemo(() => (config?.prizes || []).filter((prize) => prize.name), [config])
  const activePlatforms = useMemo<Platform[]>(() => {
    if (!config) return []
    const platforms: Platform[] = []
    if (config.taskGoogleMapsEnabled) platforms.push('GOOGLE')
    if (config.taskXiaohongshuEnabled) platforms.push('XIAOHONGSHU')
    if (config.taskInstagramEnabled) platforms.push('INSTAGRAM')
    return platforms
  }, [config])

  useEffect(() => {
    if (activePlatforms.length > 0 && !activePlatforms.includes(selectedPlatform)) {
      setSelectedPlatform(activePlatforms[0])
    }
  }, [activePlatforms, selectedPlatform])

  useEffect(() => {
    setLocale(detectLocale())
    const id = getSessionId(brandId)
    setSessionId(id)

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [configRes, statusRes] = await Promise.all([
          fetch(`/api/game/config?brandId=${encodeURIComponent(brandId)}&public=true`, { cache: 'no-store' }),
          fetch(`/api/game/status?brandId=${encodeURIComponent(brandId)}&sessionId=${encodeURIComponent(id)}`, { cache: 'no-store' }),
        ])
        if (!configRes.ok) throw new Error(copy[detectLocale()].activityNotReady)
        if (!statusRes.ok) throw new Error(copy[detectLocale()].statusLoadFailed)
        setConfig(await configRes.json())
        setStatus(await statusRes.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : copy[detectLocale()].openFailed)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [brandId])

  async function submitReview(platform: Platform) {
    if (!sessionId || submittingTask) return
    setError('')
    setMessage('')
    setSubmittingTask(true)
    const form = new FormData()
    form.set('brandId', brandId)
    form.set('sessionId', sessionId)
    form.set('taskType', 'REVIEW_SUBMIT')
    form.set('reviewPlatform', platform)
    const response = await fetch('/api/game/tasks', { method: 'POST', body: form })
    const data = await response.json().catch(() => ({}))
    setSubmittingTask(false)
    if (!response.ok) {
      setError(data.error || t.submitFailed)
      return
    }
    setPendingSubmission({ submissionId: data.submissionId, platform })
    setStaffPin('')
    setMessage(t.taskSubmitted)
  }

  async function confirmSubmission() {
    if (!pendingSubmission || !staffPin.trim() || confirmingTask) return
    setError('')
    setMessage('')
    setConfirmingTask(true)
    const response = await fetch('/api/game/tasks/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: pendingSubmission.submissionId, pinCode: staffPin.trim() }),
    })
    const data = await response.json().catch(() => ({}))
    setConfirmingTask(false)
    if (!response.ok) {
      setError(data.error || t.confirmationFailed)
      return
    }
    setStatus((prev) => prev ? { ...prev, pointsBalance: data.pointsBalance } : { pointsBalance: data.pointsBalance, unclaimedPrizes: [] })
    setPendingSubmission(null)
    setStaffPin('')
    setMessage(t.taskConfirmed)
  }

  function openPlatform(platform: Platform) {
    setSelectedPlatform(platform)
    const target = buildPlatformOpenTarget(config, platform)

    const fallbackTimer = window.setTimeout(() => {
      window.location.href = target.webUrl
    }, 900)

    const clearFallback = () => window.clearTimeout(fallbackTimer)
    window.addEventListener('pagehide', clearFallback, { once: true })
    window.addEventListener('blur', clearFallback, { once: true })
    window.location.href = target.appUrl
  }

  async function spin() {
    if (!sessionId || spinning) return
    setError('')
    setMessage('')
    setSpinResult(null)
    setSpinning(true)
    if (config?.templateType === 'GRID') {
      for (let step = 0; step < 28; step += 1) {
        window.setTimeout(() => setGridActiveSlot(step % 8), step * 80)
      }
    } else {
      setWheelRotation((previous) => previous + 360 * 5 + Math.floor(Math.random() * 360))
    }
    const response = await fetch('/api/game/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, sessionId }),
    })
    const data = await response.json().catch(() => ({}))
    setSpinning(false)
    if (config?.templateType === 'GRID') setGridActiveSlot(null)
    if (!response.ok) {
      setError(data.error || t.spinFailed)
      return
    }
    setSpinResult(data)
    setStatus((prev) => prev ? { ...prev, pointsBalance: data.pointsBalance } : prev)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          <p className="text-sm font-semibold text-white/70">{t.loading}</p>
        </div>
      </main>
    )
  }

  if (error && !config) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center text-slate-900">
          <h1 className="text-lg font-black">{t.unavailableTitle}</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-900">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50">
        <header className="px-5 pb-8 pt-8 text-white" style={{ background: accent }}>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/70">{config?.brand?.name || t.defaultBrand}</p>
          <h1 className="mt-3 text-3xl font-black leading-tight">{config?.title || t.defaultTitle}</h1>
          {config?.description && <p className="mt-3 text-sm leading-6 text-white/85">{config.description}</p>}
        </header>

        <div className="-mt-5 flex-1 space-y-4 rounded-t-[28px] bg-slate-50 px-5 pb-8 pt-5">
          {config && (
            <section className="rounded-[28px] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                    {config.templateType === 'GRID' ? t.luckyGrid : t.luckyWheel}
                  </p>
                  <h2 className="text-base font-black text-slate-950">{t.tapToPlay}</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                  {t.points}: <span style={{ color: accent }}>{status?.pointsBalance ?? 0}</span>
                </span>
              </div>
              <GameBoard
                config={config}
                spinning={spinning}
                wheelRotation={wheelRotation}
                gridActiveSlot={gridActiveSlot}
                onSpin={spin}
                locale={locale}
              />
              <p className="mt-3 text-center text-[11px] font-bold text-slate-400">
                {t.cost} · {config.maxSpinsPerUserDay ? t.spinsPerDay(config.maxSpinsPerUserDay) : t.noDailyLimit}
              </p>
            </section>
          )}

          {spinResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase text-emerald-700">{t.youWon}</p>
              <h2 className="mt-1 text-xl font-black text-emerald-950">{spinResult.prize.name}</h2>
              <p className="mt-2 rounded-xl bg-white px-3 py-2 text-center text-2xl font-black tracking-[0.2em] text-emerald-700">{spinResult.redemptionCode}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">{t.showCode}</p>
            </div>
          )}

          {status?.unclaimedPrizes?.length ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase text-slate-400">{t.unclaimedRewards}</p>
              <div className="mt-3 space-y-2">
                {status.unclaimedPrizes.map((prize) => (
                  <div key={prize.logId} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-sm font-bold">{prize.prizeName}</span>
                    <span className="font-black tracking-widest" style={{ color: accent }}>{prize.redemptionCode}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {config?.taskReviewEnabled !== false && activePlatforms.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black">{t.earnPoints}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t.earnPointsBody}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {activePlatforms.map((platform) => (
                  <button
                    key={platform}
                    onClick={() => openPlatform(platform)}
                    className="rounded-xl border px-2 py-2 text-xs font-black"
                    style={{
                      borderColor: selectedPlatform === platform ? accent : 'rgb(226 232 240)',
                      color: selectedPlatform === platform ? accent : 'rgb(51 65 85)',
                      backgroundColor: selectedPlatform === platform ? `${accent}14` : '#ffffff',
                    }}
                  >
                    {platformLabel(platform, locale)}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-2">
                <button
                  onClick={() => submitReview(selectedPlatform)}
                  disabled={submittingTask}
                  className="rounded-xl px-3 py-3 text-sm font-black text-white disabled:opacity-60"
                  style={{ background: accent }}
                >
                  {submittingTask ? t.recording : t.published}
                </button>
              </div>

              {pendingSubmission && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase text-slate-400">{t.staffConfirmation}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{t.waitingConfirmation(platformLabel(pendingSubmission.platform, locale))}</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={staffPin}
                      onChange={(event) => setStaffPin(event.target.value)}
                      inputMode="numeric"
                      type="password"
                      placeholder={t.staffPin}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-slate-400"
                    />
                    <button
                      onClick={confirmSubmission}
                      disabled={confirmingTask || !staffPin.trim()}
                      className="rounded-xl px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                      style={{ background: accent }}
                    >
                      {confirmingTask ? t.checking : t.confirm}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black">{t.prizePool}</h2>
            <div className="mt-3 grid gap-2">
              {activePrizes.map((prize) => (
                <div key={prize.id || prize.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {prize.imageUrl ? (
                      <img src={prize.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl">{prizeIcon(prize.type)}</span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{prize.name}</p>
                      <p className="text-[11px] font-bold text-slate-400">{t.chance(String(Number((prize.probability * 100).toFixed(1))))}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-slate-400">{inventoryLabel(prize, locale)}</span>
                </div>
              ))}
            </div>
          </div>

          {(error || message) && (
            <div className={`rounded-2xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              {error || message}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
