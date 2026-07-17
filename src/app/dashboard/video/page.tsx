'use client'

/* eslint-disable @next/next/no-img-element */
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, Film, Loader2, Play, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'

type Asset = {
  id: string
  url: string
  filename?: string | null
  mimeType: string
  usedCount?: number
  createdAt?: string
}

type VideoScene = {
  id: string
  title: string
  durationSec: number
  intent: string
  assetRefs: string[]
  visualPrompt: string
  cameraMotion: string
  textOverlay: string
  voiceover?: string
}

type SceneRow = {
  rowId: string
  scene: VideoScene
  job: any
  prompt: string
  assetIds: string[]
  includeInFinal: boolean
  execution?: any
  busy?: boolean
}

const creatorOptions = [
  {
    id: 'product_showcase',
    label: '产品展示',
    hint: '产品/菜品动态展示',
    defaultIdea: '把选中的产品/菜品素材做成一条有质感的短视频展示',
    duration: 6,
    flow: '主打画面 → 细节展示 → 到店/下单引导',
  },
  {
    id: 'story_campaign',
    label: '剧情短片',
    hint: '多段剧情视频',
    defaultIdea: '用已选素材讲一个顾客发现并选择商家的短故事',
    duration: 12,
    flow: '开场问题 → 发现商家 → 体验过程 → 行动引导',
  },
  {
    id: 'review_to_video',
    label: '好评视频',
    hint: '评价变信任素材',
    defaultIdea: '把一条顾客好评变成可信、有画面感的社交视频',
    duration: 6,
    flow: '顾客证明 → 可信细节 → 尝试引导',
  },
  {
    id: 'event_offer',
    label: '活动促销',
    hint: '节日/开业/优惠',
    defaultIdea: '用已选素材介绍一个限时优惠、节日活动或开业促销',
    duration: 8,
    flow: '优惠亮点 → 价值说明 → 领取/预约方式',
  },
  {
    id: 'menu_recommendation',
    label: '菜单推荐',
    hint: '今日推荐/套餐',
    defaultIdea: '用菜品图片推荐今日主打、套餐或菜单亮点',
    duration: 6,
    flow: '今日推荐 → 菜单细节 → 下单引导',
  },
  {
    id: 'local_discovery',
    label: '本地发现',
    hint: '附近场景/商圈',
    defaultIdea: '把这个商家介绍成附近值得发现和收藏的本地选择',
    duration: 6,
    flow: '附近发现 → 到店理由 → 找到商家',
  },
]

const sceneTitleMap: Record<string, string> = {
  'Hero Product': '主打画面',
  Details: '细节展示',
  Visit: '行动引导',
  'Problem Moment': '开场问题',
  Discovery: '发现商家',
  Experience: '体验过程',
  Action: '行动引导',
  Offer: '优惠亮点',
  Value: '价值说明',
  Redeem: '领取方式',
  'Today Pick': '今日推荐',
  'Menu Detail': '菜单细节',
  Order: '下单引导',
  'Near You': '附近发现',
  'Why Visit': '到店理由',
  'Find It': '找到商家',
}

const intentMap: Record<string, string> = {
  'Stop the scroll with a specific local or product hook.': '用明确的产品或本地场景开场。',
  'Prove the claim with product, store, review, or offer evidence.': '用产品、门店、评价或优惠细节证明卖点。',
  'Finish with one clear merchant-friendly call to action.': '用清楚的行动引导收尾。',
  'Show the customer situation before the merchant appears.': '先呈现顾客遇到的真实需求。',
  'Introduce the merchant as the practical answer.': '把商家自然引出为解决方案。',
  'Show the product or service being enjoyed.': '展示产品或服务被体验的过程。',
  'Close with one simple next step.': '用一个简单下一步完成转化。',
}

const motionMap: Record<string, string> = {
  'cinematic push-in, product detail motion, natural light': '自然光缓慢推进，突出产品细节',
  'close-up detail sweep, subtle parallax, appetizing or service-focused motion': '近景扫过细节，轻微视差',
  'clean branded end frame, gentle zoom, no visual clutter': '干净收尾，轻微放大',
  'slow push-in with natural handheld energy': '自然手持慢推',
  'quick reveal, rack focus to hero product or storefront': '快速揭示，焦点转到主角',
  'smooth lateral move across details, warm motion accents': '平滑横移，突出细节',
  'clean end frame with gentle zoom and readable text': '清楚结束画面，文字可读',
}

function sceneTitle(scene: VideoScene) {
  return sceneTitleMap[scene.title] || scene.title
}

function sceneIntent(scene: VideoScene) {
  return intentMap[scene.intent] || scene.intent
}

function sceneMotion(scene: VideoScene) {
  return motionMap[scene.cameraMotion] || scene.cameraMotion
}

function VideoCreatorPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const brandId = params.get('brandId') || ''
  const initialAssetIds = useMemo(() => {
    const raw = params.get('assetIds') || ''
    return raw.split(',').map((item) => item.trim()).filter(Boolean)
  }, [params])

  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(initialAssetIds)
  const [creatorType, setCreatorType] = useState('product_showcase')
  const [idea, setIdea] = useState(creatorOptions[0].defaultIdea)
  const [platform, setPlatform] = useState('tiktok')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [duration, setDuration] = useState(creatorOptions[0].duration)
  const [assetFilter, setAssetFilter] = useState<'unused' | 'all'>('unused')
  const [assetPageSize, setAssetPageSize] = useState(12)
  const [expandedAssetRowId, setExpandedAssetRowId] = useState<string | null>(null)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [finalBusy, setFinalBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<any>(null)
  const [rows, setRows] = useState<SceneRow[]>([])
  const [finalExecution, setFinalExecution] = useState<any>(null)

  const selectedCreator = useMemo(
    () => creatorOptions.find((item) => item.id === creatorType) || creatorOptions[0],
    [creatorType],
  )

  useEffect(() => {
    setSelectedAssetIds(initialAssetIds)
  }, [initialAssetIds])

  useEffect(() => {
    if (!brandId) return
    setLoadingAssets(true)
    fetch(`/api/dashboard/assets?brandId=${encodeURIComponent(brandId)}`)
      .then((res) => res.json())
      .then((json) => setAssets(json.assets || []))
      .catch(() => setError('素材加载失败'))
      .finally(() => setLoadingAssets(false))
  }, [brandId])

  const visibleAssets = useMemo(() => {
    const selected = new Set(selectedAssetIds)
    const imageAssets = assets.filter((asset) => !asset.mimeType?.startsWith('video/'))
    const filtered = assetFilter === 'unused'
      ? imageAssets.filter((asset: any) => (asset.usedCount ?? 0) === 0 || selected.has(asset.id))
      : imageAssets
    return [...filtered].sort((a: any, b: any) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tB - tA
    })
  }, [assets, assetFilter, selectedAssetIds])

  const selectedFinalRows = rows.filter((row) => row.includeInFinal && row.execution?.outputUrl)
  const selectedFinalUrls = selectedFinalRows
    .map((row) => row.execution?.outputUrl)
    .filter((url): url is string => typeof url === 'string' && Boolean(url))

  const setRow = (rowId: string, patch: Partial<SceneRow>) => {
    setRows((prev) => prev.map((row) => row.rowId === rowId ? { ...row, ...patch } : row))
  }

  const resetPlan = () => {
    setPlan(null)
    setRows([])
    setFinalExecution(null)
  }

  const handleSelectCreator = (creatorId: string) => {
    const next = creatorOptions.find((item) => item.id === creatorId)
    setCreatorType(creatorId)
    resetPlan()
    setError(null)
    if (next) {
      setIdea(next.defaultIdea)
      setDuration(next.duration)
    }
  }

  const toggleRowAsset = (rowId: string, assetId: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.rowId !== rowId) return row
      const next = row.assetIds.includes(assetId)
        ? row.assetIds.filter((id) => id !== assetId)
        : [...row.assetIds, assetId]
      return { ...row, assetIds: next, execution: undefined }
    }))
  }

  const assetRefsForRow = (assetIds: string[]) => assets
    .filter((asset) => assetIds.includes(asset.id))
    .map((asset) => ({ id: asset.id, url: asset.url, mimeType: asset.mimeType }))

  const selectedAssetsForRow = (row: SceneRow) => assets.filter((asset) => row.assetIds.includes(asset.id))

  const buildRows = (videoPlan: any): SceneRow[] => {
    const scenes: VideoScene[] = videoPlan?.scenes || []
    const jobs: any[] = videoPlan?.seedanceJobs || []
    return scenes.map((scene, index) => {
      const job = jobs.find((item) => item.id.endsWith(`-${scene.id}`)) || jobs[index]
      const fallbackAssetIds = scene.assetRefs?.filter((id) => assets.some((asset) => asset.id === id)) || []
      return {
        rowId: scene.id,
        scene,
        job,
        prompt: job?.request?.prompt || scene.visualPrompt || '',
        assetIds: index === 0 ? selectedAssetIds : fallbackAssetIds,
        includeInFinal: true,
      }
    })
  }

  const handleAddRow = () => {
    const last = rows[rows.length - 1]
    const nextIndex = rows.length + 1
    const nextId = String(nextIndex).padStart(2, '0')
    const baseScene: VideoScene = last?.scene || {
      id: nextId,
      title: 'Custom Shot',
      durationSec: 4,
      intent: 'Prove the claim with product, store, review, or offer evidence.',
      assetRefs: [],
      visualPrompt: idea,
      cameraMotion: 'close-up detail sweep, subtle parallax, appetizing or service-focused motion',
      textOverlay: selectedCreator.label,
    }
    const scene: VideoScene = {
      ...baseScene,
      id: nextId,
      title: `Custom Shot ${nextIndex}`,
      durationSec: Math.max(4, Math.min(6, baseScene.durationSec || 4)),
      assetRefs: [],
      textOverlay: baseScene.textOverlay || selectedCreator.label,
      visualPrompt: baseScene.visualPrompt || idea,
    }
    const job = last?.job
      ? {
          ...last.job,
          id: `seedance-custom-${nextId}`,
          request: { ...last.job.request, prompt: scene.visualPrompt, duration: scene.durationSec },
        }
      : {
          id: `seedance-custom-${nextId}`,
          provider: 'seedance',
          mode: 'image_to_video',
          modelHint: 'seedance-2.0-fast',
          request: {
            prompt: scene.visualPrompt,
            ratio: aspectRatio,
            duration: scene.durationSec,
            references: [],
            negativePrompt: 'distorted text, inaccurate logo, fake price, fake address, low quality, watermark',
          },
        }
    setRows((prev) => [...prev, {
      rowId: `custom-${Date.now()}`,
      scene,
      job,
      prompt: job.request.prompt || scene.visualPrompt,
      assetIds: [],
      includeInFinal: true,
    }])
    setFinalExecution(null)
  }

  const handleDeleteRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId))
    setFinalExecution(null)
    if (expandedAssetRowId === rowId) setExpandedAssetRowId(null)
  }

  const validateBase = () => {
    if (!brandId) {
      setError('缺少 brandId')
      return false
    }
    if (!idea.trim()) {
      setError('请输入视频目标')
      return false
    }
    if (selectedAssetIds.length === 0) {
      setError('请至少选择一个素材')
      return false
    }
    return true
  }

  const handleGeneratePlan = async () => {
    if (!validateBase()) return
    setPlanning(true)
    setError(null)
    setFinalExecution(null)
    try {
      const res = await fetch('/api/content/video/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          creatorType,
          idea,
          theme: idea,
          platform,
          aspectRatio,
          targetDurationSec: duration,
          assetIds: selectedAssetIds,
          executionMode: 'plan_only',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '生成分镜失败')
      const videoPlan = json?.remote?.result || json?.result
      setPlan(videoPlan)
      setRows(buildRows(videoPlan))
    } catch (err: any) {
      setError(err?.message || '生成分镜失败')
    } finally {
      setPlanning(false)
    }
  }

  const handleGenerateRow = async (row: SceneRow) => {
    if (!plan || !row.job) return
    if (row.assetIds.length === 0) {
      setError(`第 ${Number(row.scene.id)} 镜至少需要一个素材`)
      return
    }
    setRow(row.rowId, { busy: true })
    setError(null)
    try {
      const refs = assetRefsForRow(row.assetIds)
      const sceneJob = {
        ...row.job,
        request: {
          ...row.job.request,
          prompt: row.prompt,
          references: refs,
          ratio: aspectRatio,
          duration: row.scene.durationSec,
          resolution: '480p',
          generateAudio: false,
        },
      }
      const res = await fetch('/api/content/video/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          creatorType,
          idea,
          theme: idea,
          platform,
          aspectRatio,
          targetDurationSec: row.scene.durationSec,
          assetIds: row.assetIds,
          executionMode: 'submit',
          plan: {
            ...plan,
            scenes: [row.scene],
            seedanceJobs: [sceneJob],
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '生成分镜视频失败')
      setRow(row.rowId, { execution: json.execution, busy: false })
    } catch (err: any) {
      setError(err?.message || '生成分镜视频失败')
      setRow(row.rowId, { busy: false })
    }
  }

  const handleCheckRow = async (row: SceneRow) => {
    const taskId = row.execution?.providerTaskIds?.[0]
    if (!taskId) return
    setRow(row.rowId, { busy: true })
    setError(null)
    try {
      const res = await fetch('/api/content/video/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          taskId,
          title: `${plan?.title || idea} - 第 ${Number(row.scene.id)} 镜`,
          assetIds: row.assetIds,
          videoRole: 'scene',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '刷新分镜失败')
      setRow(row.rowId, { execution: json.execution, busy: false })
    } catch (err: any) {
      setError(err?.message || '刷新分镜失败')
      setRow(row.rowId, { busy: false })
    }
  }

  const handleGenerateFinal = async () => {
    if (!plan || selectedFinalUrls.length === 0) return
    setFinalBusy(true)
    setError(null)
    try {
      const finalJob = {
        id: 'seedance-final-assembly-01',
        provider: 'seedance',
        mode: 'reference_to_video',
        modelHint: 'dreamina-seedance-2-0-fast-260128',
        request: {
          prompt: [
            `把这些已生成分镜合成为一条完整的${selectedCreator.label}短视频。`,
            `整体目标：${idea}`,
            `平台：${platform}，比例：${aspectRatio}。`,
            `按以下分镜剧本顺序组织成片：${selectedFinalRows.map((row, index) => `${index + 1}. ${sceneTitle(row.scene)}：${row.prompt}`).join('\n')}`,
            `保持画面连续、节奏清楚、转场自然、商家信息真实。`,
          ].join('\n'),
          ratio: aspectRatio,
          duration: Math.max(4, Math.min(15, duration)),
          resolution: '480p',
          generateAudio: false,
          references: selectedFinalUrls.map((url) => ({ url, mimeType: 'video/mp4' })),
          negativePrompt: '错乱文字, 伪造价格, 伪造地址, 多余logo, 低清晰度',
        },
      }
      const res = await fetch('/api/content/video/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          creatorType,
          idea,
          theme: idea,
          platform,
          aspectRatio,
          targetDurationSec: duration,
          mediaUrls: selectedFinalUrls,
          executionMode: 'submit',
          plan: {
            ...plan,
            title: `${plan.title || idea} - 最终成片`,
            scenes: [],
            seedanceJobs: [finalJob],
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '生成最终视频失败')
      setFinalExecution(json.execution)
    } catch (err: any) {
      setError(err?.message || '生成最终视频失败')
    } finally {
      setFinalBusy(false)
    }
  }

  const handleCheckFinal = async () => {
    const taskId = finalExecution?.providerTaskIds?.[0]
    if (!taskId) return
    setFinalBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/content/video/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          taskId,
          title: `${plan?.title || idea} - 最终成片`,
          videoRole: 'final',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '刷新最终视频失败')
      setFinalExecution(json.execution)
    } catch (err: any) {
      setError(err?.message || '刷新最终视频失败')
    } finally {
      setFinalBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3">
          <button onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <div className="flex items-center gap-2 text-sm font-black">
            <Film className="h-4 w-4 text-indigo-600" />
            AI 生视频
          </div>
          <div className="w-14" />
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-4 px-3 py-4 sm:px-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black">整体视频设定</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {creatorOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectCreator(item.id)}
                    className={`rounded-lg border p-3 text-left ${
                      creatorType === item.id ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-black">{item.label}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{item.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] font-black text-slate-500">视频目标</span>
              <textarea
                value={idea}
                onChange={(event) => {
                  setIdea(event.target.value)
                  resetPlan()
                }}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] font-black text-slate-500">
                平台
                <select value={platform} onChange={(e) => { setPlatform(e.target.value); resetPlan() }} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="google_business">Google</option>
                </select>
              </label>
              <label className="text-[11px] font-black text-slate-500">
                比例
                <select value={aspectRatio} onChange={(e) => { setAspectRatio(e.target.value); resetPlan() }} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="4:5">4:5</option>
                  <option value="16:9">16:9</option>
                </select>
              </label>
              <label className="text-[11px] font-black text-slate-500">
                秒数
                <input value={duration} onChange={(e) => { setDuration(Number(e.target.value) || selectedCreator.duration); resetPlan() }} type="number" min={4} max={15} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" />
              </label>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-700">{selectedCreator.flow}</p>
              <p className="mt-1 truncate text-[11px] text-slate-500">{selectedAssetIds.length} 个素材 · {duration} 秒 · {aspectRatio}</p>
            </div>
            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={planning || selectedAssetIds.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成分镜表
            </button>
          </div>
        </section>

        {error && <p className="rounded-lg bg-rose-50 p-3 text-xs font-black text-rose-600">{error}</p>}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="grid flex-1 grid-cols-[minmax(220px,280px)_80px_minmax(320px,1fr)_190px_220px] gap-3 text-[11px] font-black text-slate-500 max-xl:hidden">
              <span>素材</span>
              <span>镜头</span>
              <span>设定</span>
              <span>操作</span>
              <span>预览</span>
            </div>
            <button
              type="button"
              onClick={handleAddRow}
              disabled={!plan && rows.length === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              添加分镜
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="grid min-h-[240px] place-items-center p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <Film className="h-5 w-5" />
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <div key={row.rowId} className="grid min-h-[148px] grid-cols-1 gap-3 px-4 py-3 xl:grid-cols-[minmax(220px,280px)_80px_minmax(320px,1fr)_190px_220px]">
                  <div className="self-start">
                    <div className="grid grid-cols-5 gap-1.5">
                      {selectedAssetsForRow(row).slice(0, 4).map((asset) => (
                        <button key={asset.id} type="button" onClick={() => toggleRowAsset(row.rowId, asset.id)} className="relative aspect-square overflow-hidden rounded-md border border-indigo-500 ring-2 ring-indigo-100">
                          <img src={asset.url} alt={asset.filename || 'asset'} className="h-full w-full object-cover" />
                          <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-indigo-600 p-0.5 text-white" />
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setExpandedAssetRowId(expandedAssetRowId === row.rowId ? null : row.rowId)}
                        className="grid aspect-square place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {expandedAssetRowId === row.rowId && (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setAssetFilter('unused')} className={`rounded-md px-2 py-1 text-[10px] font-black ${assetFilter === 'unused' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>未使用</button>
                            <button onClick={() => setAssetFilter('all')} className={`rounded-md px-2 py-1 text-[10px] font-black ${assetFilter === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>全部</button>
                          </div>
                          {loadingAssets && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                        </div>
                        <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
                          {visibleAssets.slice(0, assetPageSize).map((asset) => {
                            const active = row.assetIds.includes(asset.id)
                            return (
                              <button key={asset.id} type="button" onClick={() => toggleRowAsset(row.rowId, asset.id)} className={`relative aspect-square overflow-hidden rounded-md border ${active ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                                <img src={asset.url} alt={asset.filename || 'asset'} className="h-full w-full object-cover" />
                                {active && <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-indigo-600 p-0.5 text-white" />}
                              </button>
                            )
                          })}
                        </div>
                        {visibleAssets.length > assetPageSize && (
                          <button onClick={() => setAssetPageSize((size) => size + 12)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-600">更多素材</button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-3 xl:block">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700">{index + 1}</span>
                    <div className="min-w-0 xl:mt-2">
                      <p className="text-xs font-black">{sceneTitle(row.scene)}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{row.scene.durationSec} 秒</p>
                    </div>
                  </div>

                  <div className="min-w-0 self-start">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-black text-slate-400">字幕</p>
                        <p className="mt-1 line-clamp-2 text-xs font-bold text-indigo-700">{row.scene.textOverlay}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-black text-slate-400">镜头</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{sceneMotion(row.scene)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-black text-slate-400">目的</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{sceneIntent(row.scene)}</p>
                      </div>
                    </div>
                    <details className="mt-2 rounded-lg border border-slate-200 p-2">
                      <summary className="cursor-pointer text-[11px] font-black text-slate-500">提示词</summary>
                      <textarea
                        value={row.prompt}
                        onChange={(event) => setRow(row.rowId, { prompt: event.target.value, execution: undefined })}
                        rows={5}
                        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] leading-relaxed outline-none focus:border-indigo-400"
                      />
                    </details>
                  </div>

                  <div className="flex flex-col gap-2 self-start">
                    <button
                      type="button"
                      onClick={() => setRow(row.rowId, { includeInFinal: !row.includeInFinal })}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-black ${
                        row.includeInFinal ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                      加入成片
                    </button>
                    <button
                      type="button"
                      onClick={() => row.execution?.status && row.execution.status !== 'completed' ? handleCheckRow(row) : handleGenerateRow(row)}
                      disabled={row.busy}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {row.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : row.execution?.status === 'completed' ? <RefreshCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {row.execution?.status === 'completed' ? '重新生成' : row.execution ? '刷新结果' : '生成分镜'}
                    </button>
                    <span className={`rounded-full px-2 py-1 text-center text-[10px] font-black ${row.execution?.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : row.execution ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.execution?.status === 'completed' ? '已完成' : row.execution ? '生成中' : '待生成'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(row.rowId)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-100 bg-white px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除分镜
                    </button>
                  </div>

                  <div className="self-start">
                    {row.execution?.outputUrl ? (
                      <video src={row.execution.outputUrl} className="aspect-video w-full rounded-lg bg-black object-contain" controls playsInline />
                    ) : (
                      <div className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                        <Film className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {rows.length > 0 && (
          <section className="sticky bottom-3 z-10 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                  <Film className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black">最终视频</p>
                  <p className="text-xs text-slate-500">{selectedFinalUrls.length}/{rows.filter((row) => row.includeInFinal).length} 个已选分镜可用</p>
                </div>
              </div>

              {finalExecution?.outputUrl && (
                <video src={finalExecution.outputUrl} className="h-24 rounded-lg bg-black" controls playsInline />
              )}

              <div className="flex gap-2">
                {finalExecution && finalExecution.status !== 'completed' ? (
                  <button onClick={handleCheckFinal} disabled={finalBusy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                    {finalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    刷新最终视频
                  </button>
                ) : (
                  <button onClick={handleGenerateFinal} disabled={finalBusy || selectedFinalUrls.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                    {finalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    合成最终视频
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default function VideoCreatorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">正在打开视频制作页面...</div>}>
      <VideoCreatorPageInner />
    </Suspense>
  )
}
