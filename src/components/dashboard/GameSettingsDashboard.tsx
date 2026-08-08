'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, Plus, Trash2, HelpCircle, Check, Copy, Printer, RefreshCw, Eye, Search, TicketCheck, CalendarClock } from 'lucide-react'
import QRCode from 'qrcode'
import { getPermanentGameUrl, getPermanentPosterUrl, PERMANENT_GAME_QR_OPTIONS } from '@/lib/gameQr'

interface Prize {
  id?: string
  name: string
  type: 'COUPON' | 'PHYSICAL' | 'POINTS' | 'THANKS'
  probability: number // float 0 to 1
  totalInventory: number | null
  claimedCount?: number
}

interface GameConfig {
  id?: string
  title: string
  description: string | null
  themeColor: string
  taskPhotoEnabled: boolean
  taskReviewEnabled: boolean
  taskGoogleMapsEnabled: boolean
  taskXiaohongshuEnabled: boolean
  taskInstagramEnabled: boolean
  clerkPin: string
  maxSpinsPerUserDay: number
  templateType: 'WHEEL' | 'GRID'
  prizes: Prize[]
  posterTitle?: string
  posterDesc?: string
  posterTheme?: 'black' | 'blue' | 'green' | 'purple' | 'gold'
}

interface Props {
  brandId: string
  brandName: string
}

interface ActivityRound {
  id: string
  startsAt: string
  endsAt: string
  createdAt: string
  updatedAt: string
}

interface ShareDraftPoolStatus {
  targetSize: number
  locales: Record<'zh' | 'en', {
    available: number
    reserved: number
    status: string
    lastGeneratedAt: string | null
    lastError: string | null
  }>
}

function zonedDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0)
  return { year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour'), minute: pick('minute'), second: pick('second') }
}

function utcToRoundInput(value: string, timeZone: string) {
  const parts = zonedDateParts(new Date(value), timeZone)
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

function roundInputToUtc(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('请填写完整的活动日期和时间。')
  const desired = match.slice(1).map(Number)
  const wallClockUtc = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4])
  let candidate = wallClockUtc
  for (let index = 0; index < 3; index += 1) {
    const shown = zonedDateParts(new Date(candidate), timeZone)
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute)
    candidate += wallClockUtc - shownAsUtc
  }
  const finalParts = zonedDateParts(new Date(candidate), timeZone)
  if ([finalParts.year, finalParts.month, finalParts.day, finalParts.hour, finalParts.minute].some((part, index) => part !== desired[index])) {
    throw new Error('该本地时间在品牌时区中不存在，请选择其他时间。')
  }
  return new Date(candidate).toISOString()
}

function activityRoundStatus(round: ActivityRound) {
  const now = Date.now()
  if (new Date(round.endsAt).getTime() <= now) return 'ENDED' as const
  if (new Date(round.startsAt).getTime() <= now) return 'ACTIVE' as const
  return 'UPCOMING' as const
}

function allocateGridSlots(prizesList: Prize[]): Prize[] {
  const activePrizes = prizesList.filter(p => p.probability > 0 || p.name);
  if (activePrizes.length === 0) return [];
  
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

export default function GameSettingsDashboard({ brandId, brandName }: Props) {
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activityRounds, setActivityRounds] = useState<ActivityRound[]>([])
  const [brandTimezone, setBrandTimezone] = useState('Asia/Singapore')
  const [newRoundStartsAt, setNewRoundStartsAt] = useState('')
  const [newRoundEndsAt, setNewRoundEndsAt] = useState('')
  const [roundEdits, setRoundEdits] = useState<Record<string, { startsAt: string; endsAt: string }>>({})
  const [roundBusy, setRoundBusy] = useState<string | null>(null)
  const [shareDraftPool, setShareDraftPool] = useState<ShareDraftPoolStatus | null>(null)
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolError, setPoolError] = useState('')

  // QR code state
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  // Poster customizations
  const [posterTitle, setPosterTitle] = useState('Scan & Win!')
  const [posterDesc, setPosterDesc] = useState('Open any sharing platform once per activity round to receive 5 points.')
  const [stickerTheme, setStickerTheme] = useState<'black' | 'blue' | 'green' | 'purple' | 'gold'>('black')
  const [googlePlaceId, setGooglePlaceId] = useState('')
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [googleReviewAppUrl, setGoogleReviewAppUrl] = useState('')
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState('')
  const [redemptionCode, setRedemptionCode] = useState('')
  const [redemptionLoading, setRedemptionLoading] = useState(false)
  const [redemptionMessage, setRedemptionMessage] = useState('')
  const [redemptionError, setRedemptionError] = useState('')
  const [redemptionResult, setRedemptionResult] = useState<{
    redemptionCode: string
    status: string
    prizeName: string
    prizeType: string
    createdAt?: string
    claimedAt?: string | null
  } | null>(null)

  // Wheel preview state
  const [wheelRotation, setWheelRotation] = useState(0)
  const [isPreviewSpinning, setIsPreviewSpinning] = useState(false)
  const [previewActiveSlot, setPreviewActiveSlot] = useState<number | null>(null)

  const fetchShareDraftPool = useCallback(async (showLoading = false) => {
    if (showLoading) setPoolLoading(true)
    try {
      const response = await fetch(`/api/game/share-draft-pool?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as { pool?: ShareDraftPoolStatus; error?: string }
      if (!response.ok || !data.pool) throw new Error(data.error || '无法读取 AI 评价文案池')
      setShareDraftPool(data.pool)
      setPoolError('')
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : '无法读取 AI 评价文案池')
    } finally {
      if (showLoading) setPoolLoading(false)
    }
  }, [brandId])

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/game/config?brandId=${brandId}`)
      if (!res.ok) {
        throw new Error('Failed to load game configuration')
      }
      const data = await res.json()
      setConfig(data)

      const roundsRes = await fetch(`/api/game/rounds?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' })
      if (!roundsRes.ok) {
        const roundsError = await roundsRes.json().catch(() => ({})) as { error?: string }
        throw new Error(roundsError.error || 'Failed to load activity rounds')
      }
      const roundsData = await roundsRes.json() as { rounds: ActivityRound[]; timezone: string }
      const timezone = roundsData.timezone || 'Asia/Singapore'
      setBrandTimezone(timezone)
      setActivityRounds(roundsData.rounds)
      setRoundEdits(Object.fromEntries(roundsData.rounds.map((round) => [round.id, {
        startsAt: utcToRoundInput(round.startsAt, timezone),
        endsAt: utcToRoundInput(round.endsAt, timezone),
      }])))
      
      // Initialize states from persistent config values
      if (data.posterTitle) setPosterTitle(data.posterTitle)
      if (data.posterDesc) setPosterDesc(data.posterDesc)
      if (data.posterTheme) setStickerTheme(data.posterTheme)
      if (data.brand?.googlePlaceId) setGooglePlaceId(data.brand.googlePlaceId)
      if (data.brand?.googleReviewUrl) setGoogleReviewUrl(data.brand.googleReviewUrl)
      if (data.brand?.googleReviewAppUrl) setGoogleReviewAppUrl(data.brand.googleReviewAppUrl)
      if (data.brand?.googleBusinessUrl) setGoogleBusinessUrl(data.brand.googleBusinessUrl)
      await fetchShareDraftPool()

    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load game configuration')
    } finally {
      setLoading(false)
    }
  }, [brandId, fetchShareDraftPool])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchConfig()
    })
  }, [fetchConfig])

  useEffect(() => {
    const generating = shareDraftPool && Object.values(shareDraftPool.locales).some((item) => ['PENDING', 'GENERATING'].includes(item.status))
    if (!generating) return
    const timer = window.setInterval(() => void fetchShareDraftPool(), 3000)
    return () => window.clearInterval(timer)
  }, [fetchShareDraftPool, shareDraftPool])

  useEffect(() => {
    let active = true
    void QRCode.toDataURL(getPermanentGameUrl(brandId), PERMANENT_GAME_QR_OPTIONS)
      .then((dataUrl) => {
        if (active) setQrCodeUrl(dataUrl)
      })
      .catch((err: unknown) => console.error('Failed to generate permanent game QR code', err))
    return () => {
      active = false
    }
  }, [brandId, fetchShareDraftPool])

  const upsertRound = useCallback((round: ActivityRound) => {
    setActivityRounds((current) => [...current.filter((item) => item.id !== round.id), round]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()))
    setRoundEdits((current) => ({
      ...current,
      [round.id]: {
        startsAt: utcToRoundInput(round.startsAt, brandTimezone),
        endsAt: utcToRoundInput(round.endsAt, brandTimezone),
      },
    }))
  }, [brandTimezone])

  const createActivityRound = async () => {
    setError(null)
    setRoundBusy('new')
    try {
      const startsAt = roundInputToUtc(newRoundStartsAt, brandTimezone)
      const endsAt = roundInputToUtc(newRoundEndsAt, brandTimezone)
      const response = await fetch('/api/game/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, startsAt, endsAt }),
      })
      const data = await response.json().catch(() => ({})) as { round?: ActivityRound; error?: string }
      if (!response.ok || !data.round) throw new Error(data.error || 'Unable to create activity round')
      upsertRound(data.round)
      setNewRoundStartsAt('')
      setNewRoundEndsAt('')
      window.setTimeout(() => void fetchShareDraftPool(), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create activity round')
    } finally {
      setRoundBusy(null)
    }
  }

  const updateActivityRound = async (round: ActivityRound) => {
    const edit = roundEdits[round.id]
    if (!edit) return
    const status = activityRoundStatus(round)
    setError(null)
    setRoundBusy(round.id)
    try {
      const payload: { brandId: string; roundId: string; startsAt?: string; endsAt: string } = {
        brandId,
        roundId: round.id,
        endsAt: roundInputToUtc(edit.endsAt, brandTimezone),
      }
      if (status === 'UPCOMING') payload.startsAt = roundInputToUtc(edit.startsAt, brandTimezone)
      const response = await fetch('/api/game/rounds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({})) as { round?: ActivityRound; error?: string }
      if (!response.ok || !data.round) throw new Error(data.error || 'Unable to update activity round')
      upsertRound(data.round)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update activity round')
    } finally {
      setRoundBusy(null)
    }
  }

  const deleteActivityRound = async (round: ActivityRound) => {
    if (!confirm('确定删除这个尚未开始的活动轮次吗？')) return
    setError(null)
    setRoundBusy(round.id)
    try {
      const response = await fetch(`/api/game/rounds?brandId=${encodeURIComponent(brandId)}&roundId=${encodeURIComponent(round.id)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to delete activity round')
      setActivityRounds((current) => current.filter((item) => item.id !== round.id))
      setRoundEdits((current) => {
        const next = { ...current }
        delete next[round.id]
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete activity round')
    } finally {
      setRoundBusy(null)
    }
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setError(null)

    // Validate platform selection
    if (!config.taskGoogleMapsEnabled && !config.taskXiaohongshuEnabled && !config.taskInstagramEnabled) {
      alert("请至少选择一个社交媒体平台作为推广渠道！")
      setSaving(false)
      return
    }

    // Convert probability sum check
    const probSum = config.prizes.reduce((sum, p) => sum + p.probability, 0)
    if (Math.abs(probSum - 1.0) > 0.001) {
      if (!confirm(`Warning: Total probability is ${(probSum * 100).toFixed(1)}%. It is highly recommended to make it exactly 100% so that random prize selection behaves correctly. Save anyway?`)) {
        setSaving(false)
        return
      }
    }

    try {
      // 1. Save Brand Settings (Google Maps review entry)
      const brandSettingsRes = await fetch(`/api/brands/${brandId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googlePlaceId: googlePlaceId.trim(),
          googleReviewUrl: googleReviewUrl.trim(),
          googleReviewAppUrl: googleReviewAppUrl.trim(),
          googleBusinessUrl: googleBusinessUrl.trim(),
        }),
      })
      if (!brandSettingsRes.ok) {
        const data = await brandSettingsRes.json()
        throw new Error(data.error || 'Failed to save Google Maps settings')
      }

      // 2. Save Game Config
      const res = await fetch(`/api/game/config?brandId=${brandId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          taskPhotoEnabled: false,
          taskReviewEnabled: true,
          posterTitle,
          posterDesc,
          posterTheme: stickerTheme,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save configuration')
      }
      const savedData = await res.json()
      setConfig(savedData)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      window.setTimeout(() => void fetchShareDraftPool(), 1000)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const refillShareDraftPool = async () => {
    setPoolLoading(true)
    setPoolError('')
    try {
      const response = await fetch('/api/game/share-draft-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || '无法提交文案补充任务')
      setShareDraftPool((current) => current ? {
        ...current,
        locales: {
          zh: { ...current.locales.zh, status: 'PENDING', lastError: null },
          en: { ...current.locales.en, status: 'PENDING', lastError: null },
        },
      } : current)
      window.setTimeout(() => void fetchShareDraftPool(), 1000)
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : '无法提交文案补充任务')
    } finally {
      setPoolLoading(false)
    }
  }

  const handleAddPrize = () => {
    if (!config) return
    const newPrize: Prize = {
      name: 'New Reward',
      type: 'COUPON',
      probability: 0.1,
      totalInventory: null,
      claimedCount: 0,
    }
    setConfig({
      ...config,
      prizes: [...config.prizes, newPrize],
    })
  }

  const handleUpdatePrize = (index: number, fields: Partial<Prize>) => {
    if (!config) return
    const updated = [...config.prizes]
    updated[index] = { ...updated[index], ...fields }
    setConfig({ ...config, prizes: updated })
  }

  const handleRemovePrize = (index: number) => {
    if (!config) return
    const updated = config.prizes.filter((_, i) => i !== index)
    setConfig({ ...config, prizes: updated })
  }

  const copyGameLink = () => {
    const gameUrl = getPermanentGameUrl(brandId)
    navigator.clipboard.writeText(gameUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const openPosterPrint = () => {
    const printUrl = `${getPermanentPosterUrl(brandId)}?title=${encodeURIComponent(posterTitle)}&desc=${encodeURIComponent(posterDesc)}&theme=${stickerTheme}`
    window.open(printUrl, '_blank')
  }

  const lookupRedemption = async () => {
    if (!config || !redemptionCode.trim()) return
    setRedemptionLoading(true)
    setRedemptionError('')
    setRedemptionMessage('')
    setRedemptionResult(null)
    try {
      const params = new URLSearchParams({
        brandId,
        code: redemptionCode.trim().toUpperCase(),
        pinCode: config.clerkPin,
      })
      const res = await fetch(`/api/game/redemptions?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '查询失败')
      const item = data.redemptions?.[0]
      if (!item) throw new Error('未找到该兑奖码')
      setRedemptionResult(item)
    } catch (err) {
      setRedemptionError(err instanceof Error ? err.message : '查询失败')
    } finally {
      setRedemptionLoading(false)
    }
  }

  const claimRedemption = async () => {
    if (!config || !redemptionCode.trim()) return
    setRedemptionLoading(true)
    setRedemptionError('')
    setRedemptionMessage('')
    try {
      const res = await fetch('/api/game/redemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          redemptionCode: redemptionCode.trim().toUpperCase(),
          pinCode: config.clerkPin,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '核销失败')
      setRedemptionResult(data.redemption)
      setRedemptionMessage(data.redemption?.alreadyClaimed ? '该兑换码此前已核销，不会重复使用。' : '核销成功，系统已存档。')
    } catch (err) {
      setRedemptionError(err instanceof Error ? err.message : '核销失败')
    } finally {
      setRedemptionLoading(false)
    }
  }

  const triggerPreviewSpin = () => {
    if (isPreviewSpinning || !config || config.prizes.length === 0) return
    setIsPreviewSpinning(true)
    
    if (config.templateType === 'GRID') {
      const slots = allocateGridSlots(config.prizes)
      if (slots.length === 0) {
        setIsPreviewSpinning(false);
        return;
      }
      
      const targetSlot = Math.floor(Math.random() * 8);
      const startSlot = previewActiveSlot !== null ? previewActiveSlot : 0;
      
      const rounds = 3;
      const totalSteps = rounds * 8 + ((targetSlot - startSlot + 8) % 8);
      
      let step = 0;
      const runAnim = () => {
        const nextSlot = (startSlot + step) % 8;
        setPreviewActiveSlot(nextSlot);
        if (step < totalSteps) {
          step++;
          const stepsLeft = totalSteps - step;
          let delay = 60;
          if (stepsLeft <= 12) {
            delay = 60 + (12 - stepsLeft) * 35;
          }
          setTimeout(runAnim, delay);
        } else {
          setIsPreviewSpinning(false);
        }
      };
      runAnim();
    } else {
      // Spin randomly
      const randomAngle = 360 * 5 + Math.floor(Math.random() * 360)
      setWheelRotation(prev => prev + randomAngle)
      
      setTimeout(() => {
        setIsPreviewSpinning(false)
      }, 5000)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-slate-500">
        <Loader2 size={36} className="animate-spin text-blue-500 mb-2" />
        <p className="text-sm font-semibold">正在载入营销配置数据...</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
        数据载入失败，请重试。
      </div>
    )
  }

  // Calculate sum of probabilities
  const sumOfProbabilities = config.prizes.reduce((sum, p) => sum + p.probability, 0)
  const isProbValid = Math.abs(sumOfProbabilities - 1.0) < 0.001

  return (
    <div className="w-full space-y-4 pb-24 animate-in fade-in slide-in-from-bottom-3 duration-300">

      {/* ── Compact Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100 leading-tight">店内活动设置</h2>
          <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">
            配置活动轮次、三平台领分入口、抽奖和奖品核销。
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={copyGameLink}
            className="flex items-center gap-1.5 px-2.5 py-2 border rounded-xl transition bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-blue-300 hover:text-blue-600 text-xs font-bold shadow-sm"
          >
            {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            <span className="hidden sm:inline">{copiedLink ? '已复制' : '复制链接'}</span>
          </button>
          <a
            href={getPermanentGameUrl(brandId)}

            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition"
          >
            <Eye size={14} />
            <span className="hidden sm:inline">预览 H5</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* ── LEFT: Config Forms ── */}
        <div className="lg:col-span-8 space-y-4">

          {/* Section 1: Game Rules */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">游戏配置</h3>

            {/* Template Type */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">游戏界面模版</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, templateType: 'WHEEL' })}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-200 ${
                    config.templateType === 'WHEEL' || !config.templateType
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <RefreshCw size={16} className="text-blue-500" />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold block">幸运大转盘</span>
                    <span className="text-[9px] text-slate-400 leading-tight">霓虹渐变效果</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, templateType: 'GRID' })}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-200 ${
                    config.templateType === 'GRID'
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500">
                      <rect x="3" y="3" width="6" height="6" rx="1" />
                      <rect x="15" y="3" width="6" height="6" rx="1" />
                      <rect x="9" y="9" width="6" height="6" rx="1" />
                      <rect x="3" y="15" width="6" height="6" rx="1" />
                      <rect x="15" y="15" width="6" height="6" rx="1" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs font-extrabold block">九宫格抽奖</span>
                    <span className="text-[9px] text-slate-400 leading-tight">跑马灯发光动画</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Title + Theme Color side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">游戏标题</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  placeholder="幸运大轮盘"
                  className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">主题色</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={config.themeColor}
                    onChange={(e) => setConfig({ ...config, themeColor: e.target.value })}
                    className="w-10 h-9 p-0.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={config.themeColor}
                    onChange={(e) => setConfig({ ...config, themeColor: e.target.value })}
                    placeholder="#3b82f6"
                    className="flex-1 min-w-0 px-2 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">活动说明</label>
              <textarea
                rows={5}
                value={config.description || ''}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder="活动规则及奖品介绍说明..."
                className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition resize-y min-h-[100px]"
              />
            </div>

            {/* PIN + Spins per day side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  店员核销码
                  <span className="group relative text-slate-400 cursor-help">
                    <HelpCircle size={11} />
                    <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block w-44 p-2 rounded bg-slate-950 text-[10px] text-white leading-normal z-50 shadow-xl">
                      用于店员查询和核销顾客中奖兑换码；入口积分由系统自动发放。
                    </span>
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={config.clerkPin}
                  onChange={(e) => setConfig({ ...config, clerkPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="123456"
                  className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-mono tracking-widest text-center font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">每日最大次数</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.maxSpinsPerUserDay}
                  onChange={(e) => setConfig({ ...config, maxSpinsPerUserDay: parseInt(e.target.value) || 3 })}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-bold"
                />
              </div>
            </div>

            {/* Platform toggles — compact chips */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">领分与分享平台</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'taskGoogleMapsEnabled' as const, label: 'Google Maps', icon: '📍' },
                  { key: 'taskXiaohongshuEnabled' as const, label: '小红书', icon: '📕' },
                  { key: 'taskInstagramEnabled' as const, label: 'Instagram', icon: '📸' },
                ].map(({ key, label, icon }) => (
                  <label
                    key={key}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border cursor-pointer select-none transition-all duration-200 text-center ${
                      config[key]
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 ring-2 ring-blue-500/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={config[key]}
                      onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                      className="sr-only"
                    />
                    <span className="text-base">{icon}</span>
                    <span className="text-[9px] font-bold leading-tight">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Google Maps expanded config */}
            {config.taskGoogleMapsEnabled && (
              <div className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Google Review URL（Web 兜底）</label>
                  <input
                    type="url"
                    placeholder="https://search.google.com/local/writereview?placeid=..."
                    value={googleReviewUrl}
                    onChange={(e) => setGoogleReviewUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Google Maps App 写评 URL</label>
                  <input
                    type="url"
                    placeholder="https://www.google.com/maps/..."
                    value={googleReviewAppUrl}
                    onChange={(e) => setGoogleReviewAppUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                  <p className="text-[9px] text-slate-400">优先由 Growth 同步 Google Places 原始 writeAReviewUri；也可从 Growth 手工复制。</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Google Place ID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="例: ChIJ4ab_0xmX2jER0mYbefR79PI"
                      value={googlePlaceId}
                      onChange={(e) => setGooglePlaceId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-mono"
                    />
                    <a
                      href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-bold flex items-center transition shrink-0"
                    >查找 ID</a>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">兜底商家主页 URL</label>
                  <input
                    type="url"
                    placeholder="https://maps.google.com/..."
                    value={googleBusinessUrl}
                    onChange={(e) => setGoogleBusinessUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Activity rounds */}
          <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  <CalendarClock size={15} className="text-blue-500" />
                  活动轮次
                </h3>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  按品牌时区 {brandTimezone} 排期；没有进行中的轮次时，顾客端自动暂停，永久二维码不变。
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${activityRounds.some((round) => activityRoundStatus(round) === 'ACTIVE') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {activityRounds.some((round) => activityRoundStatus(round) === 'ACTIVE') ? '活动进行中' : '当前暂停'}
              </span>
            </div>

            <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-950/10">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">新增活动轮次</p>
              <p className="mb-2 text-[10px] leading-4 text-slate-500">开始时间可以早于当前时间；只要结束时间仍在未来，创建后会立即生效。</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-[10px] font-bold text-slate-500">
                  开始时间
                  <input
                    type="datetime-local"
                    value={newRoundStartsAt}
                    onChange={(event) => setNewRoundStartsAt(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                <label className="space-y-1 text-[10px] font-bold text-slate-500">
                  结束时间
                  <input
                    type="datetime-local"
                    value={newRoundEndsAt}
                    onChange={(event) => setNewRoundEndsAt(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void createActivityRound()}
                disabled={!newRoundStartsAt || !newRoundEndsAt || roundBusy !== null}
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {roundBusy === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                创建轮次
              </button>
            </div>

            {activityRounds.length === 0 ? (
              <div className="rounded-xl bg-amber-50 px-3 py-4 text-center text-xs font-bold text-amber-700">
                尚未配置活动轮次，活动保持暂停。
              </div>
            ) : (
              <div className="space-y-2">
                {activityRounds.map((round) => {
                  const status = activityRoundStatus(round)
                  const edit = roundEdits[round.id] || {
                    startsAt: utcToRoundInput(round.startsAt, brandTimezone),
                    endsAt: utcToRoundInput(round.endsAt, brandTimezone),
                  }
                  const readonly = status === 'ENDED'
                  const startLocked = status !== 'UPCOMING'
                  const statusCopy = status === 'ACTIVE' ? '进行中' : status === 'UPCOMING' ? '未开始' : '已结束'
                  const statusStyle = status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : status === 'UPCOMING' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                  return (
                    <div key={round.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black ${statusStyle}`}>{statusCopy}</span>
                        <span className="text-[9px] font-mono text-slate-400">{round.id.slice(-8)}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1 text-[10px] font-bold text-slate-500">
                          开始时间 {status === 'ACTIVE' && '（已锁定）'}
                          <input
                            type="datetime-local"
                            value={edit.startsAt}
                            disabled={startLocked}
                            onChange={(event) => setRoundEdits((current) => ({ ...current, [round.id]: { ...edit, startsAt: event.target.value } }))}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          />
                        </label>
                        <label className="space-y-1 text-[10px] font-bold text-slate-500">
                          结束时间
                          <input
                            type="datetime-local"
                            value={edit.endsAt}
                            disabled={readonly}
                            onChange={(event) => setRoundEdits((current) => ({ ...current, [round.id]: { ...edit, endsAt: event.target.value } }))}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          />
                        </label>
                      </div>
                      {!readonly && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void updateActivityRound(round)}
                            disabled={roundBusy !== null}
                            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                          >
                            {roundBusy === round.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            保存轮次
                          </button>
                          {status === 'UPCOMING' && (
                            <button
                              type="button"
                              onClick={() => void deleteActivityRound(round)}
                              disabled={roundBusy !== null}
                              className="flex min-h-9 items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-red-600 disabled:opacity-50"
                              aria-label="删除轮次"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* AI review draft pool */}
          <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  <RefreshCw size={15} className="text-violet-500" />
                  AI 评价文案池
                </h3>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  顾客直接领取预生成文案；中文、英文各维持 {shareDraftPool?.targetSize || 5} 组，使用后自动补充。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refillShareDraftPool()}
                disabled={poolLoading}
                className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:bg-violet-950/30 dark:text-violet-300"
              >
                <RefreshCw size={12} className={poolLoading ? 'animate-spin' : ''} />
                补充至 5 组
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(['zh', 'en'] as const).map((localeKey) => {
                const item = shareDraftPool?.locales[localeKey]
                const statusCopy = item?.status === 'GENERATING' ? '生成中' : item?.status === 'PENDING' ? '待生成' : item?.status === 'ERROR' ? '生成失败' : '库存正常'
                const statusStyle = item?.status === 'ERROR' ? 'bg-red-50 text-red-700' : ['PENDING', 'GENERATING'].includes(item?.status || '') ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                return (
                  <div key={localeKey} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-100">{localeKey === 'zh' ? '中文文案' : 'English drafts'}</p>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black ${statusStyle}`}>{statusCopy}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900">
                        <p className="text-[9px] font-bold text-slate-400">可用</p>
                        <p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{item?.available ?? 0}</p>
                      </div>
                      <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900">
                        <p className="text-[9px] font-bold text-slate-400">已锁定</p>
                        <p className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">{item?.reserved ?? 0}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[9px] leading-4 text-slate-400">
                      最近生成：{item?.lastGeneratedAt ? new Date(item.lastGeneratedAt).toLocaleString('zh-CN') : '尚未生成'}
                    </p>
                    {item?.lastError && <p className="mt-1 break-words text-[9px] leading-4 text-red-600">{item.lastError}</p>}
                  </div>
                )
              })}
            </div>
            {poolError && <p className="rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700">{poolError}</p>}
          </div>

          {/* Section 2: Prizes */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">奖品池与中奖概率</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">设置奖品名称、中奖概率与库存数量。</p>
              </div>
              <button
                type="button"
                onClick={handleAddPrize}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded-xl transition"
              >
                <Plus size={13} /> 添加
              </button>
            </div>

            <div className="space-y-2">
              {config.prizes.map((prize, idx) => (
                <div
                  key={prize.id || idx}
                  className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-xl animate-in fade-in duration-200 space-y-2"
                >
                  {/* Row 1: Name + Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">奖品名称</label>
                      <input
                        type="text"
                        value={prize.name}
                        onChange={(e) => handleUpdatePrize(idx, { name: e.target.value })}
                        placeholder="Free Iced Latte"
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">奖品类型</label>
                      <select
                        value={prize.type}
                        onChange={(e) => handleUpdatePrize(idx, { type: e.target.value as Prize['type'] })}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="COUPON">🎫 优惠券</option>
                        <option value="PHYSICAL">🎁 实物</option>
                        <option value="POINTS">🪙 积分</option>
                        <option value="THANKS">🌸 安慰奖</option>
                      </select>
                    </div>
                  </div>
                  {/* Row 2: Probability + Inventory + Delete */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-0.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">中奖率</label>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={(prize.probability * 100).toFixed(1)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            handleUpdatePrize(idx, { probability: Math.max(0, Math.min(1, val / 100)) })
                          }}
                          className="w-full pr-5 pl-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                        />
                        <span className="absolute right-2 text-[10px] text-slate-400 font-bold">%</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                        <span>库存</span>
                        {prize.claimedCount !== undefined && prize.claimedCount > 0 && (
                          <span className="text-blue-500 normal-case">已兑:{prize.claimedCount}</span>
                        )}
                      </label>
                      <input
                        type="number"
                        placeholder="∞"
                        value={prize.totalInventory === null ? '' : prize.totalInventory}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value)
                          handleUpdatePrize(idx, { totalInventory: val === null || isNaN(val) ? null : val })
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={config.prizes.length <= 2}
                      onClick={() => handleRemovePrize(idx)}
                      className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 mb-0.5"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Probability validation */}
            <div className={`p-3 rounded-xl flex items-center gap-2.5 border text-xs font-bold ${
              isProbValid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400'
                : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-400'
            }`}>
              <span>{isProbValid ? '✅' : '⚠️'}</span>
              <span className="flex-1">
                概率总和：<span className="font-extrabold font-mono">{(sumOfProbabilities * 100).toFixed(1)}%</span>
                {!isProbValid && ' (请调至总和 100%)'}
              </span>
              {isProbValid && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 px-2 py-0.5 rounded-full">✓ 正确</span>}
            </div>
          </div>

          {/* Error display */}
          {error && <div className="p-3 bg-red-50/90 dark:bg-red-950/25 border border-red-200 text-xs font-bold text-red-500 rounded-xl">{error}</div>}

        </div>

        {/* ── RIGHT: Preview + Poster ── */}
        <div className="lg:col-span-4 space-y-4">

          {/* Live Preview */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex flex-col items-center gap-3 text-center">
            <div className="w-full flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                {config.templateType === 'GRID' ? '九宫格预览' : '转盘预览'}
              </h3>
              <button
                onClick={triggerPreviewSpin}
                disabled={isPreviewSpinning || config.prizes.length === 0}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 transition-colors"
                title="模拟旋转"
              >
                <RefreshCw size={14} className={isPreviewSpinning ? 'animate-spin text-blue-500' : ''} />
              </button>
            </div>

            {config.templateType === 'GRID' ? (
              <div className="relative w-52 h-52 p-3 bg-slate-950 rounded-2xl border-4 border-slate-900/60 shadow-[0_0_25px_rgba(219,39,119,0.2)]">
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes grid-led-blink-odd {
                    0%, 100% { background-color: #ffffff; box-shadow: 0 0 2px #fff, 0 0 4px #db2777; }
                    50% { background-color: #fbbf24; box-shadow: 0 0 2px #fbbf24, 0 0 6px #d97706; }
                  }
                  @keyframes grid-led-blink-even {
                    0%, 100% { background-color: #fbbf24; box-shadow: 0 0 2px #fbbf24, 0 0 6px #d97706; }
                    50% { background-color: #ffffff; box-shadow: 0 0 2px #fff, 0 0 4px #db2777; }
                  }
                  .grid-led-odd { animation: grid-led-blink-odd 1.2s infinite; }
                  .grid-led-even { animation: grid-led-blink-even 1.2s infinite; }
                `}} />
                <div className="absolute top-1 left-4 right-4 flex justify-between">
                  <span className="w-1.5 h-1.5 rounded-full grid-led-odd" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-even" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-odd" />
                </div>
                <div className="absolute bottom-1 left-4 right-4 flex justify-between">
                  <span className="w-1.5 h-1.5 rounded-full grid-led-even" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-odd" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-even" />
                </div>
                <div className="absolute left-1 top-4 bottom-4 flex flex-col justify-between">
                  <span className="w-1.5 h-1.5 rounded-full grid-led-odd" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-even" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-odd" />
                </div>
                <div className="absolute right-1 top-4 bottom-4 flex flex-col justify-between">
                  <span className="w-1.5 h-1.5 rounded-full grid-led-even" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-odd" />
                  <span className="w-1.5 h-1.5 rounded-full grid-led-even" />
                </div>
                <div className="grid grid-cols-3 gap-1.5 h-full w-full">
                  {(() => {
                    const slots = allocateGridSlots(config.prizes);
                    const gridIndices = [0, 1, 2, 5, 8, 7, 6, 3];
                    return Array.from({ length: 9 }).map((_, gIdx) => {
                      if (gIdx === 4) {
                        return (
                          <button
                            key={gIdx}
                            onClick={triggerPreviewSpin}
                            disabled={isPreviewSpinning || config.prizes.length === 0}
                            style={{ background: `radial-gradient(circle, ${config.themeColor || '#db2777'} 0%, #4c0519 100%)` }}
                            className="rounded-xl flex flex-col items-center justify-center text-white active:scale-95 transition shadow-lg border border-slate-700/50"
                          >
                            <span className="text-[10px] font-black tracking-wider drop-shadow-md">点击</span>
                            <span className="text-[14px] font-black uppercase tracking-widest drop-shadow-md">抽奖</span>
                          </button>
                        );
                      }
                      const slotIdx = gridIndices.indexOf(gIdx);
                      const prize = slots[slotIdx];
                      const isActive = previewActiveSlot === slotIdx;
                      if (!prize) {
                        return <div key={gIdx} className="bg-slate-900/60 rounded-xl border border-slate-800/80 flex items-center justify-center text-[10px] text-slate-650">无</div>;
                      }
                      return (
                        <div
                          key={gIdx}
                          style={{
                            borderColor: isActive ? (config.themeColor || '#db2777') : 'rgba(30, 41, 59, 0.8)',
                            backgroundColor: isActive ? `${config.themeColor || '#db2777'}1a` : 'rgba(15, 23, 42, 0.6)',
                            boxShadow: isActive ? `0 0 12px ${config.themeColor || '#db2777'}` : 'none',
                          }}
                          className="rounded-xl border transition-all duration-150 flex flex-col items-center justify-center p-1 text-center overflow-hidden"
                        >
                          <span className="text-sm mb-0.5">
                            {prize.type === 'COUPON' ? '🎫' : prize.type === 'POINTS' ? '🪙' : prize.type === 'PHYSICAL' ? '🎁' : '🌸'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-200 truncate w-full leading-tight">{prize.name}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              <div className="relative w-48 h-48 flex items-center justify-center">
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes preview-led-blink-odd {
                    0%, 100% { fill: #ffffff; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #e87b1e); }
                    50% { fill: #f3e8d0; filter: drop-shadow(0 0 1px #f3e8d0); }
                  }
                  @keyframes preview-led-blink-even {
                    0%, 100% { fill: #f3e8d0; filter: drop-shadow(0 0 1px #f3e8d0); }
                    50% { fill: #ffffff; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #e87b1e); }
                  }
                  .preview-led-blink-odd { animation: preview-led-blink-odd 1.2s infinite; }
                  .preview-led-blink-even { animation: preview-led-blink-even 1.2s infinite; }
                `}} />
                <div className="absolute inset-[-10px] rounded-full border-[5px] border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.3)] pointer-events-none" />
                <div className="absolute inset-[-4px] rounded-full border border-[#e87b1e]/40 pointer-events-none" />
                <div className="absolute top-[-12px] z-30 w-6 h-7 flex items-center justify-center filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
                  <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
                    <path d="M9 22L1 6C1 6 4.5 0 9 0C13.5 0 17 6 17 6L9 22Z" fill="#3d2010" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx="9" cy="7" r="3.2" fill="#ffffff" />
                    <circle cx="9" cy="7" r="1.6" fill="#3d2010" />
                  </svg>
                </div>
                <button
                  onClick={triggerPreviewSpin}
                  disabled={isPreviewSpinning || config.prizes.length === 0}
                  className="absolute z-20 w-11 h-11 rounded-full border-[3px] border-white bg-white text-[#3d2010] flex items-center justify-center font-extrabold text-[9px] shadow-lg active:scale-95 transition"
                >
                  SPIN
                </button>
                <div
                  className="w-full h-full rounded-full overflow-hidden border-[4px] border-white transition-transform duration-[5000ms] ease-[cubic-bezier(0.1,0.8,0.1,1)]"
                  style={{ transform: `rotate(${wheelRotation}deg)` }}
                >
                  {config.prizes.length > 0 ? (
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      {config.prizes.map((p, idx) => {
                        const segments = config.prizes.length
                        const angle = 360 / segments
                        const startAngle = idx * angle
                        const endAngle = startAngle + angle
                        const r = 50
                        const a1 = ((startAngle - 90) * Math.PI) / 180.0
                        const a2 = ((endAngle - 90) * Math.PI) / 180.0
                        const p1 = { x: 50 + r * Math.cos(a1), y: 50 + r * Math.sin(a1) }
                        const p2 = { x: 50 + r * Math.cos(a2), y: 50 + r * Math.sin(a2) }
                        const SLICE_COLORS = ['#3d2010', '#e87b1e', '#f3e8d0', '#8da628', '#4a6b1e', '#c0392b', '#e87b1e', '#8da628']
                        const fillColor = SLICE_COLORS[idx % SLICE_COLORS.length]
                        const textAngle = startAngle + (angle / 2)
                        const textAngleInRad = ((textAngle - 90) * Math.PI) / 180.0
                        const textPos = { x: 50 + 28 * Math.cos(textAngleInRad), y: 50 + 28 * Math.sin(textAngleInRad) }
                        const normAngle = textAngle % 360
                        const isUpsideDown = normAngle > 90 && normAngle < 270
                        const displayRotation = isUpsideDown ? textAngle + 180 : textAngle
                        return (
                          <g key={idx}>
                            <path
                              d={`M 50 50 L ${p1.x} ${p1.y} A 50 50 0 ${angle <= 180 ? '0' : '1'} 1 ${p2.x} ${p2.y} Z`}
                              fill={fillColor}
                              stroke="#ffffff"
                              strokeWidth="0.5"
                            />
                            <text
                              x={textPos.x}
                              y={textPos.y}
                              fill={fillColor === '#f3e8d0' ? '#3d2010' : '#ffffff'}
                              fontSize="3"
                              fontWeight="900"
                              textAnchor="middle"
                              alignmentBaseline="middle"
                              paintOrder="stroke"
                              stroke={fillColor === '#f3e8d0' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}
                              strokeWidth="0.4"
                              transform={`rotate(${displayRotation}, ${textPos.x}, ${textPos.y})`}
                            >
                              <tspan x={textPos.x} dy="-0.5em">{p.name.length > 8 ? p.name.substring(0, 6) + '..' : p.name}</tspan>
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  ) : (
                    <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-500">无奖品</div>
                  )}
                </div>
                <div className="absolute inset-0 pointer-events-none z-10 w-full h-full">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <circle cx="50" cy="50" r="49" fill="none" stroke="#ffffff" strokeWidth="2" />
                    <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4" />
                    {Array.from({ length: 24 }).map((_, i) => {
                      const dotAngle = (i * 360) / 24
                      const dotAngleRad = (dotAngle * Math.PI) / 180
                      const r = 48
                      const cx = 50 + r * Math.cos(dotAngleRad)
                      const cy = 50 + r * Math.sin(dotAngleRad)
                      return (
                        <circle key={i} cx={cx} cy={cy} r="1.2" className={i % 2 === 0 ? 'preview-led-blink-odd' : 'preview-led-blink-even'} />
                      )
                    })}
                  </svg>
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-400">
              {config.templateType === 'GRID' ? '九宫格跑马灯动画效果' : '霓虹渐变大转盘效果'}
            </p>
          </div>

          {/* Poster + QR */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">宣传贴纸打印</h3>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">贴纸标题</label>
                <input
                  type="text"
                  value={posterTitle}
                  onChange={(e) => setPosterTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">配色方案</label>
                <div className="flex gap-1">
                  {(['black', 'blue', 'green', 'purple', 'gold'] as const).map((t) => {
                    const dotMap = {
                      black: 'bg-slate-900',
                      blue: 'bg-blue-600',
                      green: 'bg-emerald-600',
                      purple: 'bg-purple-600',
                      gold: 'bg-amber-500',
                    }
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setStickerTheme(t)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${dotMap[t]} ${stickerTheme === t ? 'border-blue-500 scale-110 ring-2 ring-blue-400/30' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        title={t}
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">引导语</label>
              <textarea
                rows={2}
                value={posterDesc}
                onChange={(e) => setPosterDesc(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 resize-none"
              />
            </div>

            {/* Sticker mini-preview */}
            <div className="w-full flex justify-center">
              {(() => {
                const colorThemes = {
                  black: { badge: 'bg-slate-900 text-white', title: 'text-slate-950', borderAccent: 'border-slate-900/10', borderDouble: 'border-slate-900' },
                  blue:  { badge: 'bg-blue-600 text-white',  title: 'text-slate-950', borderAccent: 'border-blue-600/10',  borderDouble: 'border-blue-600' },
                  green: { badge: 'bg-emerald-600 text-white', title: 'text-slate-950', borderAccent: 'border-emerald-600/10', borderDouble: 'border-emerald-600' },
                  purple:{ badge: 'bg-purple-600 text-white', title: 'text-slate-950', borderAccent: 'border-purple-600/10', borderDouble: 'border-purple-600' },
                  gold:  { badge: 'bg-amber-500 text-white',  title: 'text-slate-950', borderAccent: 'border-amber-500/10',  borderDouble: 'border-amber-500' },
                }
                const currentTheme = colorThemes[stickerTheme]
                return (
                  <div className="border border-slate-200/60 p-3 rounded-2xl bg-white flex flex-col items-center justify-between text-center aspect-square w-full max-w-[180px] relative overflow-hidden shadow-sm">
                    <div className={`absolute inset-1.5 border-2 ${currentTheme.borderAccent} pointer-events-none rounded-lg`} />
                    <div className={`absolute inset-2 border ${currentTheme.borderDouble} pointer-events-none rounded-md`} />
                    <span className={`text-[7px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider select-none mt-1 ${currentTheme.badge}`}>{brandName}</span>
                    <h4 className={`text-[10px] font-black leading-tight mt-1 uppercase truncate w-full px-2 ${currentTheme.title}`}>{posterTitle}</h4>
                    <p className="text-[8px] text-slate-500 max-w-full leading-tight mt-0.5 truncate w-full px-1 z-10">{posterDesc}</p>
                    {qrCodeUrl ? (
                      <div className="p-1 bg-white rounded-lg shadow border z-10 my-1">
                        <img src={qrCodeUrl} alt="QR" className="w-16 h-16 object-contain" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 bg-white border border-slate-200/50 rounded-lg flex items-center justify-center text-[9px] text-slate-400 my-1 z-10">生成中...</div>
                    )}
                    <p className="text-[6.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 z-10">Scan to Spin & Claim Rewards</p>
                  </div>
                )
              })()}
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold leading-4 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Check size={13} className="mt-0.5 shrink-0" />
              <span>固定二维码：更换奖品、概率或库存后无需重新打印。</span>
            </div>

            <button
              onClick={openPosterPrint}
              disabled={!qrCodeUrl}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow shadow-blue-600/10 active:scale-[0.98] disabled:opacity-50"
            >
              <Printer size={13} />
              打印贴纸 (80mm × 80mm)
            </button>
          </div>

          {/* Redemption */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
            <div>
              <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">兑奖查询 / 核销</h3>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">输入客户手机上的中奖码，可查询状态并核销。核销后会记录 claimedAt，用于后续活动效果分析。</p>
            </div>
            <div className="flex gap-2">
              <input
                value={redemptionCode}
                onChange={(event) => setRedemptionCode(event.target.value.toUpperCase())}
                placeholder="输入中奖码"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black tracking-widest text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={lookupRedemption}
                disabled={redemptionLoading || !redemptionCode.trim()}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                title="查询"
              >
                {redemptionLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>
            {redemptionResult && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-800 dark:text-slate-100">{redemptionResult.prizeName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    redemptionResult.status === 'CLAIMED'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : redemptionResult.status === 'UNCLAIMED'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}>{redemptionResult.status}</span>
                </div>
                <p className="mt-1 font-mono text-[11px] font-bold tracking-widest text-slate-500">{redemptionResult.redemptionCode}</p>
                {redemptionResult.claimedAt && <p className="mt-1 text-[10px] text-slate-400">已核销：{new Date(redemptionResult.claimedAt).toLocaleString()}</p>}
              </div>
            )}
            {redemptionError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 dark:bg-red-950/30 dark:text-red-300">{redemptionError}</p>}
            {redemptionMessage && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{redemptionMessage}</p>}
            <button
              onClick={claimRedemption}
              disabled={redemptionLoading || !redemptionCode.trim() || redemptionResult?.status === 'CLAIMED'}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {redemptionLoading ? <Loader2 size={14} className="animate-spin" /> : <TicketCheck size={14} />}
              确认核销并存档
            </button>
          </div>

        </div>
      </div>

      {/* ── Sticky Save Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-2 shadow-lg">
        {error && <p className="flex-1 text-xs font-bold text-red-500 truncate">{error}</p>}
        {!error && <p className="flex-1 text-[10px] text-slate-400 truncate">更改将在保存后同步至顾客端</p>}
        <button
          onClick={fetchConfig}
          disabled={saving}
          className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold transition hover:bg-slate-50 shrink-0"
        >
          放弃
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 disabled:opacity-60 shrink-0"
        >
          {saving ? <><Loader2 size={14} className="animate-spin" /> 保存中...</> :
           saved  ? <><Check size={14} /> 已保存</> :
                    <><Save size={14} /> 保存配置</>}
        </button>
      </div>

    </div>
  )
}
