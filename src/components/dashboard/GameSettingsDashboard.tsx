'use client'

import React, { useState, useEffect } from 'react'
import { Save, Loader2, Plus, Trash2, HelpCircle, Check, Copy, Printer, RefreshCw, Eye, Sparkles } from 'lucide-react'
import QRCode from 'qrcode'

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

export default function GameSettingsDashboard({ brandId, brandName }: Props) {
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // QR code state
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  // Poster customizations
  const [posterTitle, setPosterTitle] = useState('Scan & Win!')
  const [posterDesc, setPosterDesc] = useState('Leave a review or share store photos to get free drinks and rewards!')
  const [stickerTheme, setStickerTheme] = useState<'black' | 'blue' | 'green' | 'purple' | 'gold'>('black')
  const [googlePlaceId, setGooglePlaceId] = useState('')

  // Wheel preview state
  const [wheelRotation, setWheelRotation] = useState(0)
  const [isPreviewSpinning, setIsPreviewSpinning] = useState(false)
  const [previewActiveSlot, setPreviewActiveSlot] = useState<number | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [brandId])

  const fetchConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/game/config?brandId=${brandId}`)
      if (!res.ok) {
        throw new Error('Failed to load game configuration')
      }
      const data = await res.json()
      setConfig(data)
      
      // Initialize states from persistent config values
      if (data.posterTitle) setPosterTitle(data.posterTitle)
      if (data.posterDesc) setPosterDesc(data.posterDesc)
      if (data.posterTheme) setStickerTheme(data.posterTheme)
      if (data.brand?.googlePlaceId) setGooglePlaceId(data.brand.googlePlaceId)

      // Generate QR Code
      const gameUrl = `${window.location.origin}/game/${brandId}`
      const qrDataUrl = await QRCode.toDataURL(gameUrl, {
        width: 300,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
      setQrCodeUrl(qrDataUrl)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
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
      // 1. Save Brand Settings (Google Place ID)
      const brandSettingsRes = await fetch(`/api/brands/${brandId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googlePlaceId: googlePlaceId.trim()
        }),
      })
      if (!brandSettingsRes.ok) {
        const data = await brandSettingsRes.json()
        throw new Error(data.error || 'Failed to save Google Place ID')
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
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
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

  const copyGameLink = () => {
    const gameUrl = `${window.location.origin}/game/${brandId}`
    navigator.clipboard.writeText(gameUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const openPosterPrint = () => {
    const printUrl = `/board/game/poster/${brandId}?title=${encodeURIComponent(posterTitle)}&desc=${encodeURIComponent(posterDesc)}&theme=${stickerTheme}`
    window.open(printUrl, '_blank')
  }

  const triggerPreviewSpin = () => {
    if (isPreviewSpinning || !config || config.prizes.length === 0) return
    setIsPreviewSpinning(true)
    
    if (config.templateType === 'GRID') {
      const slots = allocateGridSlots(config.prizes);
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
    <div className="flex-1 w-full max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">店内活动设置</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            配置扫码抽奖游戏，吸引店内顾客提交谷歌地图/小红书/Instagram评价或分享，快速沉淀UGC素材。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyGameLink}
            className="flex items-center gap-2 px-3 py-2 border rounded-xl transition bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-bold shadow-sm"
          >
            {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            {copiedLink ? '链接已复制' : '复制顾客游戏页链接'}
          </button>
          <a
            href={`/game/${brandId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition"
          >
            <Eye size={14} />
            预览顾客端 H5
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Config Forms */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Section 1: Basic Game Rules Config */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              游戏主体配置
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">游戏界面模版</label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Wheel option */}
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, templateType: 'WHEEL' })}
                    className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition-all duration-300 ${
                      config.templateType === 'WHEEL' || !config.templateType
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                      <RefreshCw size={24} className="text-blue-500" />
                    </div>
                    <span className="text-sm font-extrabold">幸运大轮盘</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">经典的转盘式抽奖，霓虹渐变与LED闪烁效果</span>
                  </button>

                  {/* Grid option */}
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, templateType: 'GRID' })}
                    className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition-all duration-300 ${
                      config.templateType === 'GRID'
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500">
                        <rect x="3" y="3" width="6" height="6" rx="1" />
                        <rect x="15" y="3" width="6" height="6" rx="1" />
                        <rect x="9" y="9" width="6" height="6" rx="1" />
                        <rect x="3" y="15" width="6" height="6" rx="1" />
                        <rect x="15" y="15" width="6" height="6" rx="1" />
                      </svg>
                    </div>
                    <span className="text-sm font-extrabold">九宫格抽奖</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">3x3 网格依次点亮减速动画，高概率奖品占多格</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">游戏主标题</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  placeholder="幸运大轮盘"
                  className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">游戏主题色</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={config.themeColor}
                    onChange={(e) => setConfig({ ...config, themeColor: e.target.value })}
                    className="w-12 h-10 p-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer"
                  />
                  <input
                    type="text"
                    value={config.themeColor}
                    onChange={(e) => setConfig({ ...config, themeColor: e.target.value })}
                    placeholder="#3b82f6"
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">活动规则及说明描述</label>
                <textarea
                  rows={2}
                  value={config.description || ''}
                  onChange={(e) => setConfig({ ...config, description: e.target.value })}
                  placeholder="请输入对顾客展示的活动规则及奖品介绍说明..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  店员现场核销授权码 (6位数字)
                  <span className="group relative text-slate-400 cursor-help">
                    <HelpCircle size={13} />
                    <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block w-48 p-2 rounded bg-slate-950 text-[10px] text-white leading-normal z-50 shadow-xl">
                      若AI未能核实截图，店员在顾客手机上输入此密码可以直接人工发放积分。
                    </span>
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={config.clerkPin}
                  onChange={(e) => setConfig({ ...config, clerkPin: e.target.value.replace(/\D/g, '') })}
                  placeholder="123456"
                  className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-mono tracking-widest text-center text-lg font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">每位用户每日最大抽奖次数</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.maxSpinsPerUserDay}
                  onChange={(e) => setConfig({ ...config, maxSpinsPerUserDay: parseInt(e.target.value) || 3 })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-bold"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">可做任务社交媒体平台 (至少保留一个)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Google Maps toggle */}
                  <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer select-none transition-all duration-300 ${
                    config.taskGoogleMapsEnabled
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 ring-2 ring-blue-500/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={config.taskGoogleMapsEnabled}
                      onChange={(e) => setConfig({ ...config, taskGoogleMapsEnabled: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-black">Google Maps</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">谷歌地图评价推广</span>
                    </div>
                  </label>

                  {/* Xiaohongshu toggle */}
                  <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer select-none transition-all duration-300 ${
                    config.taskXiaohongshuEnabled
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 ring-2 ring-blue-500/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={config.taskXiaohongshuEnabled}
                      onChange={(e) => setConfig({ ...config, taskXiaohongshuEnabled: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-black">小红书 (Xiaohongshu)</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">小红书图文分享推广</span>
                    </div>
                  </label>

                  {/* Instagram toggle */}
                  <label className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer select-none transition-all duration-300 ${
                    config.taskInstagramEnabled
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 ring-2 ring-blue-500/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={config.taskInstagramEnabled}
                      onChange={(e) => setConfig({ ...config, taskInstagramEnabled: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-black">Instagram</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Instagram 帖子分享推广</span>
                    </div>
                  </label>
                </div>

                {config.taskGoogleMapsEnabled && (
                  <div className="mt-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Google Place ID (谷歌商家 ID)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="例如: ChIJ4ab_0xmX2jER0mYbefR79PI"
                        value={googlePlaceId}
                        onChange={(e) => setGooglePlaceId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition font-mono"
                      />
                      <a 
                        href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-805 dark:hover:bg-slate-750 dark:text-slate-300 rounded-xl text-[10px] font-bold flex items-center transition"
                      >
                        查找 ID
                      </a>
                    </div>
                    <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-normal">
                      用于在顾客发表评价时，一键跳转到您店铺的 Google Maps 评价页面。建议先点击“查找 ID”获取您店铺的标准 ID（如 <code>ChI...</code> 格式），也可填入 <code>fid/cid</code> 形式的完整链接。
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Section 2: Prizes and Probabilities Config */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                  奖品池与中奖概率设置
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">设置转盘奖品名称、中奖概率（百分比）以及库存数量限制。</p>
              </div>
              <button
                type="button"
                onClick={handleAddPrize}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-bold rounded-xl transition"
              >
                <Plus size={14} /> 添加奖品
              </button>
            </div>

            <div className="space-y-4">
              {config.prizes.map((prize, idx) => (
                <div 
                  key={prize.id || idx}
                  className="flex flex-col md:flex-row items-start md:items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-2xl animate-in fade-in duration-200"
                >
                  {/* Prize Name Input */}
                  <div className="flex-1 w-full space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">奖品名称</label>
                    <input
                      type="text"
                      value={prize.name}
                      onChange={(e) => handleUpdatePrize(idx, { name: e.target.value })}
                      placeholder="Free Iced Latte"
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Prize Type */}
                  <div className="w-full md:w-32 space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">奖品类型</label>
                    <select
                      value={prize.type}
                      onChange={(e) => handleUpdatePrize(idx, { type: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="COUPON">优惠券 (COUPON)</option>
                      <option value="PHYSICAL">实物礼品 (PHYSICAL)</option>
                      <option value="POINTS">额外积分 (POINTS)</option>
                      <option value="THANKS">安慰奖 (THANKS)</option>
                    </select>
                  </div>

                  {/* Probability */}
                  <div className="w-24 space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">中奖率 (%)</label>
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
                        className="w-full pr-6 pl-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                      />
                      <span className="absolute right-2.5 text-xs text-slate-400 font-bold">%</span>
                    </div>
                  </div>

                  {/* Inventory */}
                  <div className="w-28 space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex justify-between">
                      <span>总库存</span>
                      {prize.claimedCount !== undefined && prize.claimedCount > 0 && (
                        <span className="text-blue-500 font-semibold lowercase">已兑:{prize.claimedCount}</span>
                      )}
                    </label>
                    <input
                      type="number"
                      placeholder="无限"
                      value={prize.totalInventory === null ? '' : prize.totalInventory}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseInt(e.target.value)
                        handleUpdatePrize(idx, { totalInventory: val === null || isNaN(val) ? null : val })
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                    />
                  </div>

                  {/* Remove Button */}
                  <div className="self-end md:self-center pt-2 md:pt-4">
                    <button
                      type="button"
                      disabled={config.prizes.length <= 2}
                      onClick={() => handleRemovePrize(idx)}
                      className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg hover:bg-slate-150 dark:hover:bg-slate-700 transition-colors"
                      title="删除此奖项"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Validation bar */}
            <div className={`p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border text-xs font-bold ${
              isProbValid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400'
                : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-400'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-base">{isProbValid ? '✅' : '⚠️'}</span>
                <span>
                  当前中奖概率总和：<span className="font-extrabold text-base font-mono">{(sumOfProbabilities * 100).toFixed(1)}%</span>
                  {!isProbValid && ' (请将所有奖项中奖概率调整为总和 100.0% 保证算法完全一致)'}
                </span>
              </div>
              {isProbValid && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 px-2 py-0.5 rounded-full">配置平衡</span>}
            </div>

          </div>

          {/* Submit/Save Controls */}
          {error && <div className="p-4 bg-red-50/90 dark:bg-red-950/25 border border-red-200 text-xs font-bold text-red-500 rounded-2xl">{error}</div>}

          <div className="flex justify-end gap-2">
            <button
              onClick={fetchConfig}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-bold transition hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              放弃更改
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition shadow-md shadow-blue-500/20 disabled:opacity-60"
            >
              {saving ? (
                <><Loader2 size={16} className="animate-spin" /> 保存中...</>
              ) : saved ? (
                <><Check size={16} /> 已保存</>
              ) : (
                <><Save size={16} /> 保存配置</>
              )}
            </button>
          </div>

        </div>

        {/* Right Column: Wheel Preview & Poster Download */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Wheel Real-time preview */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center gap-4 text-center">
            <div className="w-full flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                {config.templateType === 'GRID' ? '九宫格实机效果预览' : '转盘实机效果预览'}
              </h3>
              <button 
                onClick={triggerPreviewSpin}
                disabled={isPreviewSpinning || config.prizes.length === 0}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-250 transition-colors"
                title="模拟旋转"
              >
                <RefreshCw size={15} className={isPreviewSpinning ? 'animate-spin text-blue-500' : ''} />
              </button>
            </div>

            {config.templateType === 'GRID' ? (
              <div className="relative w-60 h-60 my-3 p-3 bg-slate-950 rounded-2xl border-4 border-slate-900/60 shadow-[0_0_25px_rgba(219,39,119,0.2)]">
                {/* Blinking outer lights/border */}
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes grid-led-blink-odd {
                    0%, 100% { background-color: #ffffff; box-shadow: 0 0 2px #fff, 0 0 4px #db2777; }
                    50% { background-color: #fbbf24; box-shadow: 0 0 2px #fbbf24, 0 0 6px #d97706; }
                  }
                  @keyframes grid-led-blink-even {
                    0%, 100% { background-color: #fbbf24; box-shadow: 0 0 2px #fbbf24, 0 0 6px #d97706; }
                    50% { background-color: #ffffff; box-shadow: 0 0 2px #fff, 0 0 4px #db2777; }
                  }
                  .grid-led-odd {
                    animation: grid-led-blink-odd 1.2s infinite;
                  }
                  .grid-led-even {
                    animation: grid-led-blink-even 1.2s infinite;
                  }
                `}} />

                {/* 12 small led dots around the border of the 9-grid */}
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
                        // SPIN button in center
                        return (
                          <button
                            key={gIdx}
                            onClick={triggerPreviewSpin}
                            disabled={isPreviewSpinning || config.prizes.length === 0}
                            style={{
                              background: `radial-gradient(circle, ${config.themeColor || '#db2777'} 0%, #4c0519 100%)`,
                            }}
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
                        return (
                          <div key={gIdx} className="bg-slate-900/60 rounded-xl border border-slate-800/80 flex items-center justify-center text-[10px] text-slate-650">
                            无奖品
                          </div>
                        );
                      }

                      return (
                        <div
                          key={gIdx}
                          style={{
                            borderColor: isActive ? (config.themeColor || '#db2777') : 'rgba(30, 41, 59, 0.8)',
                            backgroundColor: isActive ? `${config.themeColor || '#db2777'}1a` : 'rgba(15, 23, 42, 0.6)',
                            boxShadow: isActive ? `0 0 12px ${config.themeColor || '#db2777'}` : 'none',
                          }}
                          className={`rounded-xl border transition-all duration-150 flex flex-col items-center justify-center p-1 text-center overflow-hidden`}
                        >
                          <span className="text-base mb-0.5">
                            {prize.type === 'COUPON' ? '🎫' : prize.type === 'POINTS' ? '🪙' : prize.type === 'PHYSICAL' ? '🎁' : '🌸'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-200 truncate w-full leading-tight">
                            {prize.name}
                          </span>
                          <span className="text-[7.5px] font-semibold text-amber-400 mt-0.5 leading-none">
                            {(prize.probability * 100).toFixed(0)}% 概率
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              /* Simulated Wheel (matches client CSS design) */
              <div className="relative w-56 h-56 flex items-center justify-center my-3">
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes preview-led-blink-odd {
                    0%, 100% { fill: #ffffff; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #db2777); }
                    50% { fill: #fbbf24; filter: drop-shadow(0 0 1px #fbbf24) drop-shadow(0 0 3px #d97706); }
                  }
                  @keyframes preview-led-blink-even {
                    0%, 100% { fill: #fbbf24; filter: drop-shadow(0 0 1px #fbbf24) drop-shadow(0 0 3px #d97706); }
                    50% { fill: #ffffff; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #db2777); }
                  }
                  .preview-led-blink-odd {
                    animation: preview-led-blink-odd 1.2s infinite;
                  }
                  .preview-led-blink-even {
                    animation: preview-led-blink-even 1.2s infinite;
                  }
                `}} />

                <div className="absolute inset-[-8px] rounded-full border-4 border-slate-900/60 shadow-[0_0_25px_rgba(219,39,119,0.2)] pointer-events-none" />
                
                {/* Top pointer */}
                <div className="absolute top-[-8px] z-30 w-6 h-6 flex items-center justify-center filter drop-shadow-[0_2px_4px_rgba(244,63,94,0.4)]">
                  <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
                    <path d="M8 18L0 4C0 4 4 0 8 0C12 0 16 4 16 4L8 18Z" fill="#f43f5e" />
                  </svg>
                </div>

                {/* Central spin trigger */}
                <button 
                  onClick={triggerPreviewSpin}
                  disabled={isPreviewSpinning || config.prizes.length === 0}
                  className="absolute z-20 w-12 h-12 rounded-full border-2 border-slate-950 bg-gradient-to-tr from-pink-500 via-rose-500 to-violet-600 text-white flex items-center justify-center font-extrabold text-[9px] shadow-lg active:scale-95 transition"
                >
                  SPIN
                </button>

                {/* Slices container */}
                <div 
                  className="w-full h-full rounded-full overflow-hidden border-2 border-slate-950 transition-transform duration-[5000ms] ease-[cubic-bezier(0.1,0.8,0.1,1)]"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                  }}
                >
                  {config.prizes.length > 0 ? (
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <defs>
                        {/* Neon slice gradients */}
                        <linearGradient id="prev-slice-grad-0" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ff4b72" />
                          <stop offset="100%" stopColor="#d946ef" />
                        </linearGradient>
                        <linearGradient id="prev-slice-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                        <linearGradient id="prev-slice-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#14b8a6" />
                        </linearGradient>
                        <linearGradient id="prev-slice-grad-3" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f59e0b" />
                          <stop offset="100%" stopColor="#ff006e" />
                        </linearGradient>
                        <linearGradient id="prev-slice-grad-4" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#8338ec" />
                          <stop offset="100%" stopColor="#3a86ff" />
                        </linearGradient>
                        <linearGradient id="prev-slice-grad-5" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#06d6a0" />
                          <stop offset="100%" stopColor="#10b981" />
                        </linearGradient>
                        <linearGradient id="prev-slice-grad-6" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ffbe0b" />
                          <stop offset="100%" stopColor="#fb923c" />
                        </linearGradient>
                        <linearGradient id="prev-slice-grad-7" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f43f5e" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>

                      {config.prizes.map((p, idx) => {
                        const segments = config.prizes.length
                        const angle = 360 / segments
                        const startAngle = idx * angle
                        const endAngle = startAngle + angle

                        // Polar coords
                        const r = 50
                        const angleInRadians1 = ((startAngle - 90) * Math.PI) / 180.0
                        const angleInRadians2 = ((endAngle - 90) * Math.PI) / 180.0
                        const p1 = { x: 50 + r * Math.cos(angleInRadians1), y: 50 + r * Math.sin(angleInRadians1) }
                        const p2 = { x: 50 + r * Math.cos(angleInRadians2), y: 50 + r * Math.sin(angleInRadians2) }

                        const fillColor = `url(#prev-slice-grad-${idx % 8})`

                        const textAngle = startAngle + (angle / 2)
                        const textAngleInRad = ((textAngle - 90) * Math.PI) / 180.0
                        const textPos = { x: 50 + 28 * Math.cos(textAngleInRad), y: 50 + 28 * Math.sin(textAngleInRad) }

                        // Keep text right-side up
                        const normAngle = textAngle % 360
                        const isUpsideDown = normAngle > 90 && normAngle < 270
                        const displayRotation = isUpsideDown ? textAngle + 180 : textAngle

                        return (
                          <g key={idx}>
                            <path 
                              d={`M 50 50 L ${p1.x} ${p1.y} A 50 50 0 ${angle <= 180 ? '0' : '1'} 1 ${p2.x} ${p2.y} Z`}
                              fill={fillColor}
                              stroke="#000"
                              strokeWidth="0.5"
                            />
                            <text
                              x={textPos.x}
                              y={textPos.y}
                              fill="#fff"
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
                                {p.name.length > 8 ? p.name.substring(0, 6) + '..' : p.name}
                              </tspan>
                              <tspan x={textPos.x} dy="1.1em" fontSize="2.2" fill="#ffeb3b" fontWeight="bold">
                                {Number((p.probability * 100).toFixed(1))}%
                              </tspan>
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  ) : (
                    <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-500">无奖品</div>
                  )}
                </div>

                {/* Static Outer Rim with Blinking LED Lights */}
                <div className="absolute inset-0 pointer-events-none z-10 w-full h-full">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    {/* Outer border / rim */}
                    <circle cx="50" cy="50" r="48" fill="none" stroke="#1e1b4b" strokeWidth="4" />
                    <circle cx="50" cy="50" r="46.5" fill="none" stroke="#db2777" strokeWidth="0.5" strokeDasharray="1 1" className="opacity-40" />
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
                          className={isOdd ? 'preview-led-blink-odd' : 'preview-led-blink-even'}
                        />
                      )
                    })}
                  </svg>
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-400">
              {config.templateType === 'GRID' ? '九宫格在移动端会以流畅的跑马灯发光动画呈现给您的顾客。' : '大转盘在移动端会以亮丽的霓虹渐变效果呈现给您的顾客。'}
            </p>
          </div>

          {/* Marketing Sticker customizer & printing */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-5">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              宣传贴纸生成与打印
            </h3>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">贴纸主标题</label>
                <input
                  type="text"
                  value={posterTitle}
                  onChange={(e) => setPosterTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">贴纸引导语</label>
                <textarea
                  rows={2}
                  value={posterDesc}
                  onChange={(e) => setPosterDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 resize-none"
                />
              </div>

              {/* Color Scheme Picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">贴纸配色方案</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['black', 'blue', 'green', 'purple', 'gold'] as const).map((t) => {
                    const labelMap = {
                      black: '曜石黑',
                      blue: '极光蓝',
                      green: '森林绿',
                      purple: '紫罗兰',
                      gold: '琥珀金',
                    }
                    const dotMap = {
                      black: 'bg-slate-900 dark:bg-slate-100',
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
                        className={`flex flex-col items-center justify-center py-2 rounded-xl border text-[9px] font-bold transition-all ${
                          stickerTheme === t
                            ? 'border-blue-500 bg-blue-50/40 text-blue-600 dark:text-blue-450 ring-1 ring-blue-500/25 shadow-sm'
                            : 'border-slate-250/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-700'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full mb-1 ${dotMap[t]}`} />
                        <span>{labelMap[t]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Sticker mini-preview */}
            <div className="w-full flex justify-center">
              {(() => {
                const colorThemes = {
                  black: {
                    badge: 'bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-150',
                    title: 'text-slate-950 dark:text-white',
                    borderAccent: 'border-slate-900/10 dark:border-slate-100/10',
                    borderDouble: 'border-slate-900 dark:border-slate-300',
                  },
                  blue: {
                    badge: 'bg-blue-600 text-white',
                    title: 'text-slate-950 dark:text-white',
                    borderAccent: 'border-blue-600/10',
                    borderDouble: 'border-blue-600',
                  },
                  green: {
                    badge: 'bg-emerald-600 text-white',
                    title: 'text-slate-950 dark:text-white',
                    borderAccent: 'border-emerald-600/10',
                    borderDouble: 'border-emerald-600',
                  },
                  purple: {
                    badge: 'bg-purple-600 text-white',
                    title: 'text-slate-950 dark:text-white',
                    borderAccent: 'border-purple-600/10',
                    borderDouble: 'border-purple-600',
                  },
                  gold: {
                    badge: 'bg-amber-500 text-white',
                    title: 'text-slate-950 dark:text-white',
                    borderAccent: 'border-amber-500/10',
                    borderDouble: 'border-amber-500',
                  },
                }
                const currentTheme = colorThemes[stickerTheme]

                return (
                  <div className="border border-slate-200/60 dark:border-slate-800 p-3.5 rounded-2xl bg-white dark:bg-slate-950 flex flex-col items-center justify-between text-center aspect-square w-full max-w-[220px] relative overflow-hidden shadow-sm">
                    {/* Modern Border Accent */}
                    <div className={`absolute inset-1.5 border-2 ${currentTheme.borderAccent} pointer-events-none rounded-lg`} />
                    <div className={`absolute inset-2 border ${currentTheme.borderDouble} pointer-events-none rounded-md`} />
                    
                    <span className={`text-[7.5px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider select-none mt-1 ${currentTheme.badge}`}>
                      {brandName}
                    </span>

                    <h4 className={`text-xs font-black leading-tight mt-1 uppercase truncate w-full px-2 ${currentTheme.title}`}>
                      {posterTitle}
                    </h4>
                    
                    <p className="text-[8.5px] text-slate-500 dark:text-slate-400 max-w-[180px] leading-tight mt-0.5 truncate w-full px-1 z-10">
                      {posterDesc}
                    </p>

                    {/* QR Image */}
                    {qrCodeUrl ? (
                      <div className={`p-1 bg-white rounded-lg shadow border z-10 my-1`}>
                        <img src={qrCodeUrl} alt="Store Game QR Code" className="w-18 h-18 object-contain" />
                      </div>
                    ) : (
                      <div className="w-18 h-18 bg-white border border-slate-200/50 rounded-lg flex items-center justify-center text-[9px] text-slate-400 my-1 z-10">
                        正在生成...
                      </div>
                    )}

                    <p className="text-[7px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 z-10">
                      Scan to Spin & Claim Rewards
                    </p>
                  </div>
                )
              })()}
            </div>

            <button
              onClick={openPosterPrint}
              disabled={!qrCodeUrl}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow shadow-blue-600/10 active:scale-[0.98] disabled:opacity-50"
            >
              <Printer size={13} />
              打印桌贴/包装贴纸 (80mm x 80mm)
            </button>
          </div>
        </div>

      </div>

    </div>
  )
}
