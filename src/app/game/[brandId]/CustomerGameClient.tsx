'use client'

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { BookOpen, CheckCircle2, Copy, MapPin } from 'lucide-react'

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
    timezone?: string | null
    googleReviewUrl?: string | null
    googleReviewAppUrl?: string | null
    googleBusinessUrl?: string | null
    accounts?: { platformId: string; profileUrl?: string | null; handle?: string | null }[]
  }
}

type GameStatus = {
  pointsBalance: number
  spinsTodayCount?: number
  maxSpinsPerUserDay?: number
  spinsRemainingToday?: number
  unclaimedPrizes: {
    logId: string
    prizeName: string
    prizeType: string
    redemptionCode: string
  }[]
  activeRound: { id: string; startsAt: string; endsAt: string } | null
  nextRound: { id: string; startsAt: string; endsAt: string } | null
  entryRewardClaimed: boolean
  entryReward?: {
    platform: Platform
    pointsAwarded: number
    createdAt: string
  } | null
  todayFeedbackSubmission?: {
    submissionId: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    pointsAwarded: number
  } | null
}

type SpinResult = {
  prize: { id?: string; name: string; type: string; imageUrl?: string | null }
  redemptionCode: string | null
  pointsBalance: number
  spinsTodayCount?: number
  maxSpinsPerUserDay?: number
  spinsRemainingToday?: number
}

type Platform = 'GOOGLE' | 'XIAOHONGSHU' | 'INSTAGRAM'

type Locale = 'zh' | 'en'
type ShareDrafts = Partial<Record<Platform, string>>

type ShareDraftResponse = {
  draftId: string | null
  locale: Locale | null
  drafts: ShareDrafts
  source: 'ai' | 'fallback' | null
  generatedAt: string | null
}

const copy = {
  en: {
    openPlatform: 'Open platform',
    opened: 'Opened',
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
    spinsRemaining: (remaining: number, max: number) => `${remaining}/${max} spins left today`,
    cost: 'Cost: 5 points',
    spin: 'Spin',
    spinning: 'Spinning...',
    youWon: 'You won',
    showCode: 'Show this code to store staff.',
    noCodeNeeded: 'No redemption code needed.',
    unclaimedRewards: 'Unclaimed rewards',
    activityPaused: 'This activity is currently paused.',
    nextRoundStarts: (value: string) => `Next round starts ${value}.`,
    heroCta: 'Review now, earn points, and spin to win',
    rewardAndOpen: (platform: string) => `Get 5 points and open ${platform}`,
    rewarding: 'Adding 5 points...',
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
    taskConfirmed: 'Confirmed. 5 points have been added. You can play now.',
    googleReview: 'Google review',
    xiaohongshu: 'Xiaohongshu',
    instagram: 'Instagram',
    noPrize: 'No prize',
    copyAndOpen: (platform: string) => `Copy and open ${platform}`,
    copyFailed: 'Could not copy automatically. Your draft is still here—please press and hold to copy it manually.',
    copiedOpening: (platform: string) => `Copied. Opening ${platform}...`,
    rewardFailed: 'Unable to add entry points. Please try again before opening the platform.',
  },
  zh: {
    openPlatform: '打开平台',
    opened: '已打开',
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
    spinsRemaining: (remaining: number, max: number) => `今日剩余 ${remaining}/${max} 次`,
    cost: '每次 5 积分',
    spin: '抽奖',
    spinning: '抽奖中...',
    youWon: '恭喜中奖',
    showCode: '请向店员出示兑换码。',
    noCodeNeeded: '无需兑换码。',
    unclaimedRewards: '待领取奖品',
    activityPaused: '当前活动暂停中。',
    nextRoundStarts: (value: string) => `下一轮将在 ${value} 开始。`,
    heroCta: '立即评价，获取积分抽奖',
    rewardAndOpen: (platform: string) => `领取 5 积分并打开 ${platform}`,
    rewarding: '正在增加 5 积分...',
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
    taskConfirmed: '确认成功，已增加 5 积分。现在可以抽奖了。',
    googleReview: 'Google 评价',
    xiaohongshu: '小红书',
    instagram: 'Instagram',
    noPrize: '谢谢参与',
    copyAndOpen: (platform: string) => `复制并打开 ${platform}`,
    copyFailed: '自动复制失败，文案仍已保留；请长按文案手动复制。',
    copiedOpening: (platform: string) => `已复制，正在打开 ${platform}…`,
    rewardFailed: '无法增加入口积分，请重试后再打开平台。',
  },
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
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

function openedPlatformStorageKey(brandId: string): string {
  return `amc-game-opened-platform:${brandId}`
}

function draftEditsStorageKey(brandId: string): string {
  return `amc-game-share-draft-edits:${brandId}`
}

function parseDraftEdits(value: string | null): { draftId: string; drafts: ShareDrafts } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { draftId?: unknown; drafts?: unknown }
    if (typeof parsed.draftId !== 'string' || !parsed.drafts || typeof parsed.drafts !== 'object') return null
    const drafts: ShareDrafts = {}
    for (const platform of ['GOOGLE', 'XIAOHONGSHU', 'INSTAGRAM'] as const) {
      const text = (parsed.drafts as Record<string, unknown>)[platform]
      if (typeof text === 'string') drafts[platform] = text
    }
    return { draftId: parsed.draftId, drafts }
  } catch {
    return null
  }
}

function isPlatform(value: string | null): value is Platform {
  return value === 'GOOGLE' || value === 'XIAOHONGSHU' || value === 'INSTAGRAM'
}

function platformLabel(platform: Platform, locale: Locale): string {
  const labels: Record<Locale, Record<Platform, string>> = {
    en: {
      GOOGLE: 'Google Review',
      XIAOHONGSHU: 'Xiaohongshu',
      INSTAGRAM: 'Instagram',
    },
    zh: {
      GOOGLE: 'Google 评价',
      XIAOHONGSHU: '小红书',
      INSTAGRAM: 'Instagram',
    },
  }
  return labels[locale][platform]
}

type PlatformIconProps = {
  className?: string
  strokeWidth?: number
}

function InstagramIcon({ className, strokeWidth = 2 }: PlatformIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const platformVisuals = {
  GOOGLE: {
    Icon: MapPin,
    idle: 'border-blue-100 bg-blue-50/40 hover:border-blue-300 hover:bg-blue-50',
    active: 'border-blue-500 bg-blue-50 shadow-sm shadow-blue-100',
    icon: 'bg-blue-600 text-white',
    text: 'text-blue-700',
    focus: 'focus-visible:ring-blue-500',
  },
  XIAOHONGSHU: {
    Icon: BookOpen,
    idle: 'border-rose-100 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50',
    active: 'border-rose-500 bg-rose-50 shadow-sm shadow-rose-100',
    icon: 'bg-rose-600 text-white',
    text: 'text-rose-700',
    focus: 'focus-visible:ring-rose-500',
  },
  INSTAGRAM: {
    Icon: InstagramIcon,
    idle: 'border-fuchsia-100 bg-gradient-to-r from-pink-50/50 to-violet-50/50 hover:border-fuchsia-300',
    active: 'border-fuchsia-500 bg-gradient-to-r from-pink-50 to-violet-50 shadow-sm shadow-fuchsia-100',
    icon: 'bg-gradient-to-br from-pink-500 via-fuchsia-500 to-violet-600 text-white',
    text: 'text-fuchsia-700',
    focus: 'focus-visible:ring-fuchsia-500',
  },
} satisfies Record<Platform, {
  Icon: ComponentType<PlatformIconProps>
  idle: string
  active: string
  icon: string
  text: string
  focus: string
}>

function platformUrl(config: GameConfig | null, platform: Platform): string | undefined {
  if (!config) return undefined
  if (platform === 'GOOGLE') return config.brand?.googleReviewUrl || config.brand?.googleBusinessUrl || undefined
  const account = config.brand?.accounts?.find((item) => item.platformId.toLowerCase() === platform.toLowerCase())
  return account?.profileUrl || undefined
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function iosGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value)
    const supportedHost = url.hostname === 'maps.google.com'
      || (url.hostname === 'www.google.com' && url.pathname.startsWith('/maps/'))
    if (!supportedHost || !['http:', 'https:'].includes(url.protocol)) return value
    return `comgooglemapsurl://${url.host}${url.pathname}${url.search}${url.hash}`
  } catch {
    return value
  }
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

function buildPlatformOpenTarget(config: GameConfig | null, platform: Platform): { appUrl?: string; webUrl: string } {
  const webUrl = platformUrl(config, platform)

  if (platform === 'GOOGLE') {
    const providerAppUrl = config?.brand?.googleReviewAppUrl?.trim() || undefined
    const fallback = webUrl || providerAppUrl || 'https://www.google.com/maps'
    return {
      ...(providerAppUrl ? { appUrl: isIosDevice() ? iosGoogleMapsUrl(providerAppUrl) : providerAppUrl } : {}),
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

function prizeKey(prize: { id?: string; name: string }): string {
  return prize.id || prize.name
}

function wheelTargetRotation(currentRotation: number, prizes: Prize[], targetPrize: { id?: string; name: string }): number {
  const targetIndex = prizes.findIndex((prize) => prizeKey(prize) === prizeKey(targetPrize))
  if (targetIndex < 0 || prizes.length === 0) return currentRotation + 360 * 5
  const segmentAngle = 360 / prizes.length
  const targetCenterAngle = targetIndex * segmentAngle + segmentAngle / 2
  const currentTurns = Math.floor(currentRotation / 360)
  const baseRotation = (currentTurns + 5) * 360 - targetCenterAngle
  return baseRotation <= currentRotation ? baseRotation + 360 : baseRotation
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
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [gridActiveSlot, setGridActiveSlot] = useState<number | null>(null)
  const [locale, setLocale] = useState<Locale>('en')
  const [shareDraftId, setShareDraftId] = useState<string | null>(null)
  const [shareDrafts, setShareDrafts] = useState<ShareDrafts>({})
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [copiedPlatform, setCopiedPlatform] = useState<Platform | null>(null)
  const [rewardingPlatform, setRewardingPlatform] = useState<Platform | null>(null)

  const accent = config?.themeColor || '#2563eb'
  const t = copy[locale]
  const activePrizes = useMemo(() => (config?.prizes || []).filter((prize) => prize.name), [config])
  const dailyLimit = status?.maxSpinsPerUserDay ?? config?.maxSpinsPerUserDay ?? null
  const spinsRemaining = status?.spinsRemainingToday ?? dailyLimit
  const activePlatforms = useMemo<Platform[]>(() => {
    if (!config) return []
    const platforms: Platform[] = []
    if (config.taskGoogleMapsEnabled) platforms.push('GOOGLE')
    if (config.taskXiaohongshuEnabled) platforms.push('XIAOHONGSHU')
    if (config.taskInstagramEnabled) platforms.push('INSTAGRAM')
    return platforms
  }, [config])
  const activityActive = Boolean(status?.activeRound)
  const showGame = activityActive && Boolean(status?.entryRewardClaimed)
  const formatRoundTime = (value: string) => {
    try {
      return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: config?.brand?.timezone || undefined,
      }).format(new Date(value))
    } catch {
      return new Date(value).toLocaleString()
    }
  }

  const requestShareDrafts = useCallback(async (requestedSessionId: string, requestLocale: Locale, silent = false) => {
    if (!requestedSessionId) return
    if (!silent) setLoadingDrafts(true)
    try {
      const response = await fetch(`/api/game/share-drafts?brandId=${encodeURIComponent(brandId)}&sessionId=${encodeURIComponent(requestedSessionId)}&locale=${requestLocale}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as Partial<ShareDraftResponse> & { error?: string }
      if (!response.ok) {
        if (!silent) setError(data.error || copy[requestLocale].submitFailed)
        return
      }
      const returnedDrafts = data.drafts || {}
      setShareDraftId(data.draftId || null)
      setShareDrafts(() => {
        const localEdits = parseDraftEdits(window.sessionStorage.getItem(draftEditsStorageKey(brandId)))
        const nextDrafts = localEdits && localEdits.draftId === data.draftId
          ? { ...returnedDrafts, ...localEdits.drafts }
          : returnedDrafts
        if (data.draftId) {
          window.sessionStorage.setItem(draftEditsStorageKey(brandId), JSON.stringify({ draftId: data.draftId, drafts: nextDrafts }))
        } else if (localEdits) {
          window.sessionStorage.removeItem(draftEditsStorageKey(brandId))
        }
        return nextDrafts
      })
    } catch {
      if (!silent) setError(copy[requestLocale].submitFailed)
    } finally {
      if (!silent) setLoadingDrafts(false)
    }
  }, [brandId])

  const refreshStatus = useCallback(async (requestedSessionId: string) => {
    if (!requestedSessionId) return null
    const response = await fetch(`/api/game/status?brandId=${encodeURIComponent(brandId)}&sessionId=${encodeURIComponent(requestedSessionId)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(copy[detectLocale()].statusLoadFailed)
    const data = await response.json() as GameStatus
    setStatus(data)
    return data
  }, [brandId])

  useEffect(() => {
    if (!config) return

    const storageKey = openedPlatformStorageKey(brandId)
    const storedPlatform = window.sessionStorage.getItem(storageKey)
    const restoreTimer = window.setTimeout(() => {
      if (isPlatform(storedPlatform) && activePlatforms.includes(storedPlatform)) {
        setSelectedPlatform(storedPlatform)
        return
      }

      setSelectedPlatform(null)
      if (storedPlatform) window.sessionStorage.removeItem(storageKey)
    }, 0)

    return () => window.clearTimeout(restoreTimer)
  }, [activePlatforms, brandId, config])

  useEffect(() => {
    const detectedLocale = detectLocale()
    const id = getSessionId(brandId)
    const initializeTimer = window.setTimeout(() => {
      setLocale(detectedLocale)
      setSessionId(id)
    }, 0)

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
        const configData = await configRes.json() as GameConfig
        const statusData = await statusRes.json() as GameStatus
        setConfig(configData)
        setStatus(statusData)
      } catch (err) {
        setError(err instanceof Error ? err.message : copy[detectLocale()].openFailed)
      } finally {
        setLoading(false)
      }
    }

    void load()
    return () => window.clearTimeout(initializeTimer)
  }, [brandId])

  useEffect(() => {
    const activeRoundId = status?.activeRound?.id
    if (!sessionId || !config || !activeRoundId || status.entryRewardClaimed || config.taskReviewEnabled === false) return
    queueMicrotask(() => void requestShareDrafts(sessionId, locale))
  }, [config, locale, requestShareDrafts, sessionId, status?.activeRound?.id, status?.entryRewardClaimed])

  useEffect(() => {
    if (!sessionId || !status?.activeRound || status.entryRewardClaimed || !shareDraftId) return
    const renew = () => {
      if (document.visibilityState === 'visible') void requestShareDrafts(sessionId, locale, true)
    }
    const timer = window.setInterval(renew, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', renew)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', renew)
    }
  }, [locale, requestShareDrafts, sessionId, shareDraftId, status?.activeRound, status?.entryRewardClaimed])

  useEffect(() => {
    if (!sessionId) return
    const handlePageShow = () => { void refreshStatus(sessionId).catch(() => undefined) }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handlePageShow()
    }
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refreshStatus, sessionId])

  useEffect(() => {
    if (!sessionId) return
    const boundary = status?.activeRound?.endsAt || status?.nextRound?.startsAt
    if (!boundary) return
    let cancelled = false
    let timer = 0
    const schedule = () => {
      const untilBoundary = new Date(boundary).getTime() - Date.now() + 250
      const delay = Math.min(Math.max(untilBoundary, 1_000), 6 * 60 * 60 * 1_000)
      timer = window.setTimeout(() => {
        void refreshStatus(sessionId).finally(() => {
          if (!cancelled && untilBoundary > delay) schedule()
        })
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [refreshStatus, sessionId, status?.activeRound?.endsAt, status?.nextRound?.startsAt])

  function openPlatform(platform: Platform) {
    window.sessionStorage.setItem(openedPlatformStorageKey(brandId), platform)
    setSelectedPlatform(platform)
    const target = buildPlatformOpenTarget(config, platform)

    // Google review links are already universal HTTPS deep links. Passing the
    // whole URL through a Maps text-search scheme searches for the URL instead
    // of opening the review composer, especially on iOS.
    if (!target.appUrl) {
      window.location.assign(target.webUrl)
      return
    }

    const fallbackTimer = window.setTimeout(() => {
      window.location.assign(target.webUrl)
    }, 900)

    const clearFallback = () => window.clearTimeout(fallbackTimer)
    window.addEventListener('pagehide', clearFallback, { once: true })
    window.addEventListener('blur', clearFallback, { once: true })
    window.location.assign(target.appUrl)
  }

  function updateDraft(platform: Platform, value: string) {
    const nextDrafts = { ...shareDrafts, [platform]: value }
    setShareDrafts(nextDrafts)
    if (shareDraftId) {
      window.sessionStorage.setItem(draftEditsStorageKey(brandId), JSON.stringify({ draftId: shareDraftId, drafts: nextDrafts }))
    }
  }

  async function copyAndOpenPlatform(platform: Platform) {
    const text = shareDrafts[platform]?.trim()
    if (!text || rewardingPlatform) return
    setError('')
    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        copied = true
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        copied = document.execCommand('copy')
        textarea.remove()
      }
    } catch {
      copied = false
    }
    if (!copied) {
      setError(t.copyFailed)
      return
    }
    setRewardingPlatform(platform)
    try {
      const response = await fetch('/api/game/entry-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, sessionId, platform, draftId: shareDraftId }),
      })
      const data = await response.json().catch(() => ({})) as {
        error?: string
        code?: string
        pointsBalance?: number
        pointsAwarded?: number
        platform?: Platform
        activeRound?: GameStatus['activeRound']
      }
      if (!response.ok) {
        setError(data.error || t.rewardFailed)
        if (data.code === 'DRAFT_RESERVATION_INVALID') void requestShareDrafts(sessionId, locale)
        return
      }
      setStatus((current) => current ? {
        ...current,
        pointsBalance: data.pointsBalance ?? current.pointsBalance,
        activeRound: data.activeRound ?? current.activeRound,
        entryRewardClaimed: true,
        entryReward: {
          platform: data.platform || platform,
          pointsAwarded: data.pointsAwarded || 5,
          createdAt: new Date().toISOString(),
        },
      } : current)
    } catch {
      setError(t.rewardFailed)
      return
    } finally {
      setRewardingPlatform(null)
    }
    setCopiedPlatform(platform)
    setMessage(t.copiedOpening(platformLabel(platform, locale)))
    openPlatform(platform)
  }

  async function spin() {
    if (!sessionId || spinning) return
    setError('')
    setMessage('')
    setSpinResult(null)
    setSpinning(true)
    const response = await fetch('/api/game/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, sessionId }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setSpinning(false)
      if (config?.templateType === 'GRID') setGridActiveSlot(null)
      setError(data.error || t.spinFailed)
      return
    }

    if (config?.templateType === 'GRID') {
      const slots = allocateGridSlots(config.prizes)
      const targetSlot = Math.max(0, slots.findIndex((prize) => prize && prizeKey(prize) === prizeKey(data.prize)))
      for (let step = 0; step <= 32 + targetSlot; step += 1) {
        window.setTimeout(() => setGridActiveSlot(step % 8), step * 80)
      }
      window.setTimeout(() => {
        setGridActiveSlot(targetSlot)
        setSpinning(false)
        setSpinResult(data)
        setStatus((prev) => prev ? {
          ...prev,
          pointsBalance: data.pointsBalance,
          spinsTodayCount: data.spinsTodayCount,
          maxSpinsPerUserDay: data.maxSpinsPerUserDay,
          spinsRemainingToday: data.spinsRemainingToday,
        } : prev)
      }, (33 + targetSlot) * 80)
      return
    }

    setWheelRotation((previous) => wheelTargetRotation(previous, config?.prizes || [], data.prize))
    window.setTimeout(() => {
      setSpinning(false)
      setSpinResult(data)
      setStatus((prev) => prev ? {
        ...prev,
        pointsBalance: data.pointsBalance,
        spinsTodayCount: data.spinsTodayCount,
        maxSpinsPerUserDay: data.maxSpinsPerUserDay,
        spinsRemainingToday: data.spinsRemainingToday,
      } : prev)
    }, 5000)
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
          <p className="mt-3 text-sm font-semibold leading-6 text-white/90">{t.heroCta}</p>
        </header>

        <div className="-mt-5 flex-1 space-y-4 rounded-t-[28px] bg-slate-50 px-5 pb-8 pt-5">
          {!activityActive && (
            <section className="rounded-[28px] bg-white p-6 text-center shadow-sm">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl" aria-hidden="true">⏸</span>
              <h2 className="mt-4 text-lg font-black text-slate-950">{t.activityPaused}</h2>
              {status?.nextRound && (
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  {t.nextRoundStarts(formatRoundTime(status.nextRound.startsAt))}
                </p>
              )}
            </section>
          )}

          {activityActive && !status?.entryRewardClaimed && activePlatforms.length === 0 && (
            <section className="rounded-2xl bg-white p-5 text-center text-sm font-bold text-slate-600 shadow-sm">
              {t.activityNotReady}
            </section>
          )}

          {showGame && config && (
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
                {t.cost} · {dailyLimit ? t.spinsRemaining(spinsRemaining ?? dailyLimit, dailyLimit) : t.noDailyLimit}
              </p>
            </section>
          )}

          {showGame && spinResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase text-emerald-700">{t.youWon}</p>
              <h2 className="mt-1 text-xl font-black text-emerald-950">{spinResult.prize.name}</h2>
              {spinResult.redemptionCode ? (
                <>
                  <p className="mt-2 rounded-xl bg-white px-3 py-2 text-center text-2xl font-black tracking-[0.2em] text-emerald-700">{spinResult.redemptionCode}</p>
                  <p className="mt-2 text-xs font-semibold text-emerald-700">{t.showCode}</p>
                </>
              ) : (
                <p className="mt-2 rounded-xl bg-white px-3 py-2 text-center text-sm font-black text-emerald-700">{t.noCodeNeeded}</p>
              )}
            </div>
          )}

          {showGame && status?.unclaimedPrizes?.length ? (
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

          {activityActive && !status?.entryRewardClaimed && config?.taskReviewEnabled !== false && activePlatforms.length > 0 && (
            <div className="space-y-3">
              <div>
                <div className="space-y-3">
                  {activePlatforms.map((platform) => {
                    const isOpened = selectedPlatform === platform
                    const visual = platformVisuals[platform]
                    const PlatformIcon = visual.Icon
                    const label = platformLabel(platform, locale)
                    const draft = shareDrafts[platform]

                    if (draft !== undefined) {
                      return (
                        <section key={platform} aria-label={label} className={`rounded-xl border-2 p-3 ${isOpened ? visual.active : visual.idle}`}>
                          <div className="flex items-center gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${visual.icon}`} aria-hidden="true">
                              <PlatformIcon className="h-4.5 w-4.5" strokeWidth={2.25} />
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-black text-slate-900">{label}</span>
                            {isOpened && <span className={`flex items-center gap-1 text-xs font-bold ${visual.text}`}><CheckCircle2 className="h-4 w-4" />{t.opened}</span>}
                          </div>
                          <textarea
                            value={draft}
                            onChange={(event) => updateDraft(platform, event.target.value)}
                            rows={5}
                            aria-label={`${label} draft`}
                            className="mt-3 w-full resize-y rounded-lg border border-white/80 bg-white px-3 py-2.5 text-sm leading-5 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-white"
                          />
                          <button
                            type="button"
                            onClick={() => copyAndOpenPlatform(platform)}
                            disabled={!draft.trim() || Boolean(rewardingPlatform)}
                            className={`mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-black text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.99] disabled:opacity-50 ${visual.icon} ${visual.focus}`}
                          >
                            {copiedPlatform === platform ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {rewardingPlatform === platform ? t.rewarding : t.rewardAndOpen(label)}
                          </button>
                        </section>
                      )
                    }

                    return (
                      <div
                        key={platform}
                        aria-label={`${t.openPlatform}: ${label}`}
                        className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${visual.idle}`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${visual.icon}`} aria-hidden="true">
                          <PlatformIcon className="h-5 w-5" strokeWidth={2.25} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black text-slate-900">{label}</span>
                          <span className="mt-1 block h-3 w-32 animate-pulse rounded bg-slate-200" aria-hidden="true" />
                        </span>
                        {loadingDrafts && <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" aria-hidden="true" />}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {showGame && <div className="rounded-2xl bg-white p-4 shadow-sm">
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
          </div>}

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
