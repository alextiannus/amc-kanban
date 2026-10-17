'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft, Save, Loader2, Plus, Trash2, HelpCircle, Check, Printer, RefreshCw,
  MapPin, BookOpen, Camera, CheckCircle2, AlertTriangle, Ticket, Gift, Coins, Flower2, ChevronDown, ChevronUp,
} from 'lucide-react'
import QRCode from 'qrcode'
import { followRewardDescription as resolveFollowRewardDescription } from '@/lib/followReward'
import { activityPrimary, activitySecondary, activityDanger } from './activityUi'
import FollowEntryCard from './FollowEntryCard'
import { getPermanentGameUrl, getPermanentPosterUrl, PERMANENT_GAME_QR_OPTIONS } from '@/lib/gameQr'

interface Prize {
  id?: string
  name: string
  type: 'COUPON' | 'PHYSICAL' | 'POINTS' | 'THANKS'
  probability: number // float 0 to 1
  totalInventory: number | null
  claimedCount?: number
  imageUrl?: string | null
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

// Only editable game rules belong in a draw save; synced brand data stays server-owned.
function editableDrawConfig(config: GameConfig) {
  return {
    title: config.title, description: config.description, themeColor: config.themeColor,
    taskPhotoEnabled: false, taskReviewEnabled: true,
    taskGoogleMapsEnabled: config.taskGoogleMapsEnabled,
    taskXiaohongshuEnabled: config.taskXiaohongshuEnabled,
    taskInstagramEnabled: config.taskInstagramEnabled,
    clerkPin: config.clerkPin, maxSpinsPerUserDay: config.maxSpinsPerUserDay,
    templateType: config.templateType,
    prizes: config.prizes.map(({ id, name, type, probability, totalInventory, imageUrl }) => ({ id, name, type, probability, totalInventory, imageUrl })),
  }
}

interface Props {
  brandId: string
  brandName: string
  isEn?: boolean
  onBack?: () => void
  onConfigSaved?: () => void
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

export default function ActivitySettingsEditor({ brandId, brandName, isEn = false, onBack, onConfigSaved }: Props) {
  const t = (zh: string, en: string) => isEn ? en : zh

  const [config, setConfig] = useState<GameConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const interfaceLanguage = useRef(isEn)
  useEffect(() => { interfaceLanguage.current = isEn }, [isEn])
  const drawRequestPending = useRef(false)
  const [saved, setSaved] = useState(false)
  const [savedDrawSnapshot, setSavedDrawSnapshot] = useState('')
  const [pageDirty, setPageDirty] = useState(false)
  const [drawSelected, setDrawSelected] = useState(false)
  const [wheelSettingsExpanded, setWheelSettingsExpanded] = useState(false)
  const [activityPreviewVersion, setActivityPreviewVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // QR code state
  const [qrCodeUrl, setQrCodeUrl] = useState('')

  // Poster customizations
  const [posterTitle, setPosterTitle] = useState('Scan & Win!')
  const [posterDesc, setPosterDesc] = useState('Leave a review or share store photos to get free drinks and rewards!')
  const [stickerTheme, setStickerTheme] = useState<'black' | 'blue' | 'green' | 'purple' | 'gold'>('black')
  const [followRewardDescription, setFollowRewardDescription] = useState('')
  const [savedFollowRewardDescription, setSavedFollowRewardDescription] = useState('')

  // Wheel preview state
  const [wheelRotation, setWheelRotation] = useState(0)
  const [isPreviewSpinning, setIsPreviewSpinning] = useState(false)
  const [previewActiveSlot, setPreviewActiveSlot] = useState<number | null>(null)

  const fetchConfig = useCallback(async (preserveFollow = false) => {
    if (drawRequestPending.current) return
    drawRequestPending.current = true
    setRestoring(preserveFollow)
    if (!preserveFollow) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/game/config?brandId=${brandId}&initialize=false`)
      if (!res.ok) {
        throw new Error('Failed to load game configuration')
      }
      const data = await res.json()
      const hydrated = { clerkPin: '123456', maxSpinsPerUserDay: 3, ...data }
      if (!data.id) { hydrated.title = interfaceLanguage.current ? 'Share & spin' : '分享抽奖轮盘'; hydrated.taskReviewEnabled = true; hydrated.taskGoogleMapsEnabled = true; hydrated.taskInstagramEnabled = true }
      setConfig(hydrated)
      if (!preserveFollow) setDrawSelected(data.brand?.activityPage?.drawEnabled ?? data.hasActivity === true)
      if (!preserveFollow) {
        setFollowRewardDescription(resolveFollowRewardDescription(data.brand?.followRewardDescription))
        setSavedFollowRewardDescription(resolveFollowRewardDescription(data.brand?.followRewardDescription))
      }
      setSaved(false)
      setSavedDrawSnapshot(JSON.stringify([editableDrawConfig(hydrated), data.posterTitle || 'Scan & Win!', data.posterDesc || 'Leave a review or share store photos to get free drinks and rewards!', data.posterTheme || 'black']))
      
      // Initialize states from persistent config values
      setPosterTitle(data.posterTitle || 'Scan & Win!')
      setPosterDesc(data.posterDesc || 'Leave a review or share store photos to get free drinks and rewards!')
      setStickerTheme(data.posterTheme || 'black')

    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to load game configuration')
    } finally {
      drawRequestPending.current = false
      setRestoring(false)
      setLoading(false)
    }
  }, [brandId])

  useEffect(() => {
    queueMicrotask(() => {
      setWheelSettingsExpanded(false)
      void fetchConfig()
    })
  }, [fetchConfig])

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
  }, [brandId])

  const handleSave = async () => {
    if (!config || drawRequestPending.current) return
    setSaving(true)
    setError(null)

    // Validate platform selection
    if (!config.taskGoogleMapsEnabled && !config.taskXiaohongshuEnabled && !config.taskInstagramEnabled) {
      alert(t('请至少选择一个社交媒体平台作为推广渠道！', 'Please select at least one social media platform as a promotion channel!'))
      setSaving(false)
      return
    }

    // Convert probability sum check
    const probSum = config.prizes.reduce((sum, p) => sum + p.probability, 0)
    if (Math.abs(probSum - 1.0) > 0.001) {
      if (!confirm(t(`警告：总概率为 ${(probSum * 100).toFixed(1)}%。强烈建议调整至 100% 以确保随机抽奖正确运行。仍要保存？`, `Warning: Total probability is ${(probSum * 100).toFixed(1)}%. It is highly recommended to make it exactly 100% so random prize selection works correctly. Save anyway?`))) {
        setSaving(false)
        return
      }
    }

    drawRequestPending.current = true
    try {
      const res = await fetch(`/api/game/config?brandId=${brandId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editableDrawConfig(config),
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
      setSavedDrawSnapshot(JSON.stringify([editableDrawConfig(savedData), posterTitle, posterDesc, stickerTheme]))
      setSaved(true)
      setActivityPreviewVersion(value => value + 1)
      onConfigSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      drawRequestPending.current = false
      setSaving(false)
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



  const openPosterPrint = () => {
    const printUrl = `${getPermanentPosterUrl(brandId)}?title=${encodeURIComponent(posterTitle)}&desc=${encodeURIComponent(posterDesc)}&theme=${stickerTheme}`
    window.open(printUrl, '_blank')
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
        <p className="text-sm font-semibold">{t('正在载入营销配置数据...', 'Loading marketing configuration...')}</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
        {t('数据载入失败，请重试。', 'Failed to load data. Please try again.')}
      </div>
    )
  }

  // Calculate sum of probabilities
  const drawDirty = JSON.stringify([editableDrawConfig(config), posterTitle, posterDesc, stickerTheme]) !== savedDrawSnapshot
  const sumOfProbabilities = config.prizes.reduce((sum, p) => sum + p.probability, 0)
  const isProbValid = Math.abs(sumOfProbabilities - 1.0) < 0.001
  const previewConfig = {
    title: config.title, description: config.description, themeColor: config.themeColor,
    templateType: config.templateType, taskReviewEnabled: config.taskReviewEnabled,
    taskGoogleMapsEnabled: config.taskGoogleMapsEnabled, taskXiaohongshuEnabled: config.taskXiaohongshuEnabled,
    taskInstagramEnabled: config.taskInstagramEnabled, maxSpinsPerUserDay: config.maxSpinsPerUserDay, prizes: config.prizes,
  }

  const handleBack = () => {
    if (!onBack) return
    const hasUnsavedChanges = pageDirty || drawDirty || followRewardDescription !== savedFollowRewardDescription
    if (hasUnsavedChanges && !window.confirm(t(
      '还有未保存的修改。离开后这些修改将丢失，仍要返回增值服务吗？',
      'You have unsaved changes. Leaving will discard them. Return to services?',
    ))) return
    onBack()
  }

  return (
    <div className={`w-full space-y-4 ${wheelSettingsExpanded ? 'pb-24' : 'pb-8'} animate-in fade-in slide-in-from-bottom-3 duration-300`}>

      {onBack && <button type="button" onClick={handleBack} disabled={saving || restoring} className={activitySecondary}><ArrowLeft size={15}/>{t('返回增值服务', 'Back to services')}</button>}
      {/* ── Compact Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 leading-tight">{t('店内活动', 'In-Store Activities')}</h2>
          <p className="text-xs leading-6 text-slate-500 mt-1">
            {t('从关注礼遇到分享抽奖，边编辑，边看顾客会看到的页面。', 'Build your follow offers and lucky draw, and see the customer page as you edit.')}
          </p>
        </div>

      </div>

      <FollowEntryCard key={brandId} brandId={brandId} brandName={brandName} qrCodeUrl={qrCodeUrl} isEn={isEn} rewardDescription={followRewardDescription} onRewardChange={setFollowRewardDescription} onRewardSaved={setSavedFollowRewardDescription} activityVersion={activityPreviewVersion} previewActivity={drawSelected} onPageDirtyChange={setPageDirty} onDrawSelection={enabled => { setDrawSelected(enabled); setWheelSettingsExpanded(false) }} onEditDraw={() => setWheelSettingsExpanded(true)} previewConfig={previewConfig}>

      {drawSelected && <button type="button" aria-expanded={wheelSettingsExpanded} aria-controls="in-store-lucky-draw-settings" onClick={() => setWheelSettingsExpanded(value => !value)} className={`${activitySecondary} w-full`}><Gift size={15}/>{wheelSettingsExpanded ? t('收起轮盘配置', 'Collapse draw settings') : t('编辑轮盘配置', 'Edit draw settings')}{wheelSettingsExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>}

      <fieldset id="in-store-lucky-draw-settings" className="min-w-0" disabled={saving || restoring} aria-busy={saving || restoring} hidden={!drawSelected || !wheelSettingsExpanded} onChangeCapture={() => setSaved(false)}>
      <div className="space-y-4">

        {/* ── LEFT: Config Forms ── */}
        <div className="space-y-4">

          {/* Section 1: Game Rules */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">{t('活动内容', 'Activity content')}</h3>

            {/* Template Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('选择抽奖样式', 'Choose a draw style')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={config.templateType === 'WHEEL' || !config.templateType}
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
                    <span className="text-xs font-extrabold block">{t('幸运大转盘', 'Lucky Spin Wheel')}</span>
                    <span className="text-xs text-slate-400 leading-tight">{t('转动轮盘，揭晓惊喜', 'Spin to reveal a surprise')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  aria-pressed={config.templateType === 'GRID'}
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
                    <span className="text-xs font-extrabold block">{t('九宫格抽奖', 'Grid Lucky Draw')}</span>
                    <span className="text-xs text-slate-400 leading-tight">{t('跑马灯发光动画', 'LED marquee animation')}</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Title + Theme Color side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('活动标题', 'Activity title')}</label>
                <input
                  type="text"
                  aria-label={t('活动标题', 'Activity title')}
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  placeholder={t('幸运大轮盘', 'Lucky Spin')}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('主题色', 'Theme Color')}</label>
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
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('活动说明', 'Activity Description')}</label>
              <textarea
                rows={2}
                aria-label={t('活动说明', 'Activity description')}
                value={config.description || ''}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder={t('活动规则及奖品介绍说明...', 'Activity rules and prize description...')}
                className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition resize-none"
              />
            </div>

            {/* PIN + Spins per day side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  {t('店员核销码', 'Clerk PIN')}
                  <span className="group relative text-slate-400 cursor-help">
                    <HelpCircle size={11} />
                    <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block w-44 p-2 rounded bg-slate-950 text-xs text-white leading-normal z-50 shadow-xl">
                      {t('AI无法核实截图时，店员输入此密码可人工发放积分', 'When AI cannot verify screenshots, clerk enters this PIN to manually grant rewards')}
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
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('每日最大次数', 'Max Spins / Day')}</label>
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
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('可做任务平台', 'Supported Platforms')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'taskGoogleMapsEnabled' as const, label: 'Google Maps', Icon: MapPin },
                  { key: 'taskXiaohongshuEnabled' as const, label: t('小红书', 'Xiaohongshu'), Icon: BookOpen },
                  { key: 'taskInstagramEnabled' as const, label: 'Instagram', Icon: Camera },
                ].map(({ key, label, Icon }) => (
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
                    <Icon size={16} />
                    <span className="text-xs font-bold leading-tight">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t('账号与 Google 评价入口自动同步品牌已绑定的信息，无需重复填写。上方仅选择参与抽奖的任务平台。', 'Accounts and Google review links sync automatically from your brand. Above, choose which task platforms participate in the draw.')}
            </p>
          </div>

          {/* Section 2: Prizes */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">{t('奖品池与中奖概率', 'Prize Pool & Odds')}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{t('设置奖品名称、中奖概率与库存数量。', 'Set prize names, win probabilities, and inventory.')}</p>
              </div>
              <button
                type="button"
                onClick={handleAddPrize}
                className={activitySecondary}
              >
                <Plus size={13} /> {t('添加', 'Add')}
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
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('奖品名称', 'Prize Name')}</label>
                      <input
                        type="text"
                        aria-label={t(`奖品 ${idx + 1} 名称`, `Prize ${idx + 1} name`)}
                        value={prize.name}
                        onChange={(e) => handleUpdatePrize(idx, { name: e.target.value })}
                        placeholder={t('免费冰拿铁', 'Free Iced Latte')}
                        className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('奖品类型', 'Prize Type')}</label>
                      <select
                        value={prize.type}
                        onChange={(e) => handleUpdatePrize(idx, { type: e.target.value as Prize['type'] })}
                        className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="COUPON">{t('优惠券', 'Coupon')}</option>
                        <option value="PHYSICAL">{t('实物', 'Physical')}</option>
                        <option value="POINTS">{t('积分', 'Points')}</option>
                        <option value="THANKS">{t('安慰奖', 'Consolation')}</option>
                      </select>
                    </div>
                  </div>
                  {/* Row 2: Probability + Inventory + Delete */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-0.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('中奖率', 'Win Rate')}</label>
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
                          className="w-full pr-5 pl-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                        />
                        <span className="absolute right-2 text-xs text-slate-400 font-bold">%</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between">
                        <span>{t('库存', 'Stock')}</span>
                        {prize.claimedCount !== undefined && prize.claimedCount > 0 && (
                          <span className="text-blue-500 normal-case">{t('已兑:', 'Claimed:')} {prize.claimedCount}</span>
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
                        className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={config.prizes.length <= 2}
                      onClick={() => handleRemovePrize(idx)}
                      className={activityDanger}
                      title={t('删除', 'Delete')}
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
              {isProbValid ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span className="flex-1">
                {t('概率总和：', 'Total Probability: ')}<span className="font-extrabold font-mono">{(sumOfProbabilities * 100).toFixed(1)}%</span>
                {!isProbValid && t(' (请调至总和 100%)', ' (Please adjust to 100%)')}
              </span>
              {isProbValid && <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 px-2 py-0.5 rounded-full">✓ {t('正确', 'Valid')}</span>}
            </div>
          </div>

          {/* Error display */}
          {error && <div className="p-3 bg-red-50/90 dark:bg-red-950/25 border border-red-200 text-xs font-bold text-red-500 rounded-xl">{error}</div>}

        </div>

        {/* ── RIGHT: Preview + Poster ── */}
        <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><summary className="cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-300">{t('高级选项：抽奖测试与独立贴纸', 'Advanced: draw testing & standalone stickers')}</summary><div className="mt-4 space-y-4">

          {/* Live Preview */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex flex-col items-center gap-3 text-center">
            <div className="w-full flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                {config.templateType === 'GRID' ? t('九宫格预览', 'Grid Preview') : t('转盘预览', 'Wheel Preview')}
              </h3>
              <button
                onClick={triggerPreviewSpin}
                disabled={isPreviewSpinning || config.prizes.length === 0}
                className={activitySecondary}
                title={t('模拟旋转', 'Simulate Spin')}
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
                            <span className="text-[10px] font-black tracking-wider drop-shadow-md">{t('点击', 'TAP')}</span>
                            <span className="text-[14px] font-black uppercase tracking-widest drop-shadow-md">{t('抽奖', 'SPIN')}</span>
                          </button>
                        );
                      }
                      const slotIdx = gridIndices.indexOf(gIdx);
                      const prize = slots[slotIdx];
                      const isActive = previewActiveSlot === slotIdx;
                      if (!prize) {
                        return <div key={gIdx} className="bg-slate-900/60 rounded-xl border border-slate-800/80 flex items-center justify-center text-[10px] text-slate-650">{t('无', 'N/A')}</div>;
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
                          {prize.type === 'COUPON' ? <Ticket size={15} className="mb-0.5" />
                            : prize.type === 'POINTS' ? <Coins size={15} className="mb-0.5" />
                            : prize.type === 'PHYSICAL' ? <Gift size={15} className="mb-0.5" />
                            : <Flower2 size={15} className="mb-0.5" />}
                          <span className="text-[9px] font-bold text-slate-200 truncate w-full leading-tight">{prize.name}</span>
                          <span className="text-[7.5px] font-semibold text-amber-400 mt-0.5">{(prize.probability * 100).toFixed(0)}%</span>
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
                              <tspan x={textPos.x} dy="1.1em" fontSize="2.2" fill={fillColor === '#f3e8d0' ? '#8da628' : '#f3e8d0'} fontWeight="bold">
                                {Number((p.probability * 100).toFixed(1))}%
                              </tspan>
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  ) : (
                    <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-500">{t('无奖品', 'No prizes')}</div>
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
              {config.templateType === 'GRID' ? t('九宫格跑马灯动画效果', 'Grid LED marquee animation') : t('霓虹渐变大转盘效果', 'Neon gradient spin wheel')}
            </p>
          </div>

          {/* Poster + QR */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">{t('宣传贴纸打印', 'Promo Sticker Print')}</h3>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('贴纸标题', 'Sticker Title')}</label>
                <input
                  type="text"
                  value={posterTitle}
                  onChange={(e) => setPosterTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('配色方案', 'Color Theme')}</label>
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
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('引导语', 'Tagline')}</label>
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
                      <div className="w-16 h-16 bg-white border border-slate-200/50 rounded-lg flex items-center justify-center text-[9px] text-slate-400 my-1 z-10">{t('生成中...', 'Generating...')}</div>
                    )}
                    <p className="text-[6.5px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 z-10">Scan to Spin & Claim Rewards</p>
                  </div>
                )
              })()}
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold leading-4 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Check size={13} className="mt-0.5 shrink-0" />
              <span>{t('固定二维码：更换奖品、概率或库存后无需重新打印。', 'Permanent QR: changing rewards, odds, or inventory does not require reprinting.')}</span>
            </div>

            <button
              onClick={openPosterPrint}
              disabled={!qrCodeUrl}
              className={`${activitySecondary} w-full`}
            >
              <Printer size={13} />
              {t('打印贴纸 (80mm × 80mm)', 'Print Sticker (80mm × 80mm)')}
            </button>
          </div>

        </div></details>
      </div>

      {/* ── Sticky Save Bar ── */}
      <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        {error && <p className="flex-1 text-xs font-bold text-red-500 truncate">{error}</p>}
        {!error && <p role="status" className="flex-1 text-[10px] text-slate-400 truncate">{drawDirty ? t('尚未保存 · 已同步预览', 'Unsaved changes · Preview updated') : t('抽奖配置已保存', 'Draw settings saved')}</p>}
        <button
          onClick={() => void fetchConfig(true)}
          disabled={saving || restoring || !drawDirty}
          className={activitySecondary}
        >
          {restoring ? <><Loader2 size={14} className="animate-spin" />{t('还原中…', 'Restoring…')}</> : t('还原抽奖配置', 'Restore draw settings')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || restoring}
          className={activityPrimary}
        >
          {saving ? <><Loader2 size={14} className="animate-spin" /> {t('保存中...', 'Saving...')}</> :
           saved && !drawDirty ? <><Check size={14} /> {t('已保存', 'Saved')}</> :
                    <><Save size={14} /> {t('保存抽奖配置', 'Save draw settings')}</>}
        </button>
      </div>
      </fieldset>
      </FollowEntryCard>
    </div>
  )
}
