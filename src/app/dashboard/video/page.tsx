'use client'

/* eslint-disable @next/next/no-img-element */
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Film, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react'

type Asset = {
  id: string
  url: string
  filename?: string | null
  mimeType: string
  aiTags?: string[]
  aiCaption?: string | null
  brandName?: string
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

const creatorOptions = [
  {
    id: 'product_showcase',
    label: '产品展示',
    hint: '多图生成产品/菜品动态展示',
    defaultIdea: '把选中的产品/菜品素材做成一条有质感的短视频展示',
    duration: 6,
    flow: '主打画面 → 细节展示 → 到店/下单引导',
    basis: '更重视产品细节、质感、真实商家场景和简洁行动引导。',
  },
  {
    id: 'story_campaign',
    label: '剧情短片',
    hint: 'idea + 素材生成多段剧情视频',
    defaultIdea: '用已选素材讲一个顾客发现并选择商家的短故事',
    duration: 12,
    flow: '开场问题 → 发现商家 → 体验过程 → 行动引导',
    basis: '会把素材组织成一个有起承转合的顾客场景故事。',
  },
  {
    id: 'review_to_video',
    label: '好评视频',
    hint: '把顾客评价变成信任素材',
    defaultIdea: '把一条顾客好评变成可信、有画面感的社交视频',
    duration: 6,
    flow: '顾客证明 → 可信细节 → 尝试引导',
    basis: '更重视评论证据、真实体验和低压力的信任建立。',
  },
  {
    id: 'event_offer',
    label: '活动促销',
    hint: '节日、开业、限时优惠',
    defaultIdea: '用已选素材介绍一个限时优惠、节日活动或开业促销',
    duration: 8,
    flow: '优惠亮点 → 价值说明 → 领取/预约方式',
    basis: '会突出时间感、优惠内容、使用方式和清晰 CTA。',
  },
  {
    id: 'menu_recommendation',
    label: '菜单推荐',
    hint: '今日推荐 / 套餐视频',
    defaultIdea: '用菜品图片推荐今日主打、套餐或菜单亮点',
    duration: 6,
    flow: '今日推荐 → 菜单细节 → 下单引导',
    basis: '更适合把菜品、套餐、价格和推荐理由说清楚。',
  },
  {
    id: 'local_discovery',
    label: '本地发现',
    hint: '附近场景与商圈搜索',
    defaultIdea: '把这个商家介绍成附近值得发现和收藏的本地选择',
    duration: 6,
    flow: '附近发现 → 到店理由 → 找到商家',
    basis: '会围绕商圈、附近需求、门店可发现性来组织画面。',
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
  'Stop the scroll with a specific local or product hook.': '用一个明确的产品或本地场景开场，先抓住注意力。',
  'Prove the claim with product, store, review, or offer evidence.': '用产品、门店、评价或优惠细节证明卖点。',
  'Finish with one clear merchant-friendly call to action.': '用一个清楚的行动引导收尾。',
  'Show the customer situation before the merchant appears.': '先呈现顾客遇到的真实场景或需求。',
  'Introduce the merchant as the practical answer.': '把商家作为这个需求的自然解决方案引出。',
  'Show the product or service being enjoyed.': '展示产品或服务被体验、享用的过程。',
  'Close with one simple next step.': '用一个简单下一步完成转化。',
}

const cameraMotionMap: Record<string, string> = {
  'cinematic push-in, product detail motion, natural light': '自然光下缓慢推进，突出产品细节。',
  'close-up detail sweep, subtle parallax, appetizing or service-focused motion': '近距离扫过细节，轻微视差，突出食欲或服务感。',
  'clean branded end frame, gentle zoom, no visual clutter': '干净的品牌收尾画面，轻微放大，不堆信息。',
  'slow push-in with natural handheld energy': '自然手持感的慢速推进。',
  'quick reveal, rack focus to hero product or storefront': '快速揭示，焦点转到主打产品或门店。',
  'smooth lateral move across details, warm motion accents': '横向平滑移动，带一点温暖的动态细节。',
  'clean end frame with gentle zoom and readable text': '清楚的结束画面，轻微放大，文字保持可读。',
}

function displaySceneTitle(scene: VideoScene) {
  return sceneTitleMap[scene.title] || scene.title
}

function displayIntent(scene: VideoScene) {
  return intentMap[scene.intent] || scene.intent
}

function displayCameraMotion(scene: VideoScene) {
  return cameraMotionMap[scene.cameraMotion] || scene.cameraMotion
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
  const [assetTypeFilter, setAssetTypeFilter] = useState<'unused' | 'all'>('unused')
  const [assetPageSize, setAssetPageSize] = useState(12)
  const [creatorType, setCreatorType] = useState('product_showcase')
  const [idea, setIdea] = useState(creatorOptions[0].defaultIdea)
  const [platform, setPlatform] = useState('tiktok')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [duration, setDuration] = useState(creatorOptions[0].duration)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [submittingVideo, setSubmittingVideo] = useState(false)
  const [checkingVideo, setCheckingVideo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({})

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

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [assets, selectedAssetIds],
  )
  const availableAssets = useMemo(() => {
    const selected = new Set(selectedAssetIds)
    const imageAssets = assets.filter((asset) => !asset.mimeType?.startsWith('video/'))
    const filtered = assetTypeFilter === 'unused'
      ? imageAssets.filter((asset: any) => (asset.usedCount ?? 0) === 0 || selected.has(asset.id))
      : imageAssets
    return [...filtered].sort((a: any, b: any) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tB - tA
    })
  }, [assets, assetTypeFilter, selectedAssetIds])

  const videoPlan = result?.remote?.result || result?.result
  const execution = result?.execution
  const scenes: VideoScene[] = videoPlan?.scenes || []
  const selectedCreator = useMemo(
    () => creatorOptions.find((item) => item.id === creatorType) || creatorOptions[0],
    [creatorType],
  )
  const editablePlan = useMemo(() => {
    if (!videoPlan) return null
    const jobs = (videoPlan.seedanceJobs || []).map((job: any) => ({
      ...job,
      request: {
        ...job.request,
        prompt: promptDrafts[job.id] || job.request?.prompt || '',
      },
    }))
    return {
      ...videoPlan,
      seedanceJobs: jobs,
      scenes: (videoPlan.scenes || []).map((scene: VideoScene) => {
        const job = jobs.find((item: any) => item.id.endsWith(`-${scene.id}`))
        return job ? { ...scene, visualPrompt: job.request.prompt } : scene
      }),
    }
  }, [promptDrafts, videoPlan])
  const planReady = Boolean(videoPlan)
  const videoReady = execution?.status === 'completed'
  const currentStep = execution ? 3 : planReady ? 2 : 1
  const stepCards = [
    {
      step: 1,
      title: '选择素材与目标',
      description: '选择图片，告诉 AI 这条视频要表达什么。',
      status: currentStep > 1 ? '已完成' : '正在进行',
    },
    {
      step: 2,
      title: '生成并编辑分镜',
      description: '先让 AI 写好每个镜头，再按你的判断修改。',
      status: currentStep > 2 ? '已完成' : currentStep === 2 ? '正在进行' : '待开始',
    },
    {
      step: 3,
      title: '生成视频并保存',
      description: '确认分镜后调用 Seedance，生成结果会回到素材库。',
      status: videoReady ? '已完成' : currentStep === 3 ? '生成中' : '待开始',
    },
  ]

  useEffect(() => {
    if (!videoPlan?.seedanceJobs?.length) return
    setPromptDrafts(Object.fromEntries(
      videoPlan.seedanceJobs.map((job: any) => [job.id, job.request?.prompt || '']),
    ))
  }, [videoPlan])

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => prev.includes(assetId)
      ? prev.filter((id) => id !== assetId)
      : [...prev, assetId])
    setResult(null)
    setError(null)
  }

  const handleSelectCreator = (creatorId: string) => {
    const next = creatorOptions.find((item) => item.id === creatorId)
    setCreatorType(creatorId)
    setResult(null)
    setError(null)
    if (next) {
      setIdea(next.defaultIdea)
      setDuration(next.duration)
    }
  }

  const validateInput = () => {
    if (!brandId) {
      setError('缺少 brandId')
      return false
    }
    if (!idea.trim()) {
      setError('请输入视频 idea 或营销目标')
      return false
    }
    if (selectedAssetIds.length === 0) {
      setError('请至少选择一个素材')
      return false
    }
    return true
  }

  const handleGeneratePlan = async () => {
    if (!validateInput()) return
    setGenerating(true)
    setError(null)
    setResult(null)
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
      if (!res.ok) throw new Error(json.error || '生成剧本失败')
      setResult(json)
    } catch (err: any) {
      setError(err?.message || '生成剧本失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmitVideo = async () => {
    if (!validateInput() || !editablePlan) return
    setSubmittingVideo(true)
    setError(null)
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
          executionMode: 'submit',
          plan: editablePlan,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '生成视频失败')
      setResult(json)
    } catch (err: any) {
      setError(err?.message || '生成视频失败')
    } finally {
      setSubmittingVideo(false)
    }
  }

  const handleCheckVideo = async () => {
    const taskId = execution?.providerTaskIds?.[0]
    if (!taskId) {
      setError('还没有可查询的视频任务。请先点击生成视频。')
      return
    }
    setCheckingVideo(true)
    setError(null)
    try {
      const res = await fetch('/api/content/video/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          taskId,
          title: videoPlan?.title || idea,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '检查视频结果失败')
      setResult((prev: any) => ({
        ...prev,
        execution: json.execution,
      }))
    } catch (err: any) {
      setError(err?.message || '检查视频结果失败')
    } finally {
      setCheckingVideo(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
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

      <main className="mx-auto max-w-[1800px] space-y-3 px-3 py-3 sm:space-y-4 sm:px-5 sm:py-5">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {stepCards.map((item) => {
            const active = item.step === currentStep
            const done = item.step < currentStep || (item.step === 3 && videoReady)
            return (
              <div
                key={item.step}
                className={`rounded-lg border bg-white p-4 shadow-sm ${
                  active ? 'border-indigo-300 ring-2 ring-indigo-100' : done ? 'border-emerald-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                    done ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.step}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    done ? 'bg-emerald-50 text-emerald-700' : active ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-400'
                  }`}>
                    {item.status}
                  </span>
                </div>
                <h2 className="mt-3 text-sm font-black text-slate-900">{item.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
              </div>
            )
          })}
        </section>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
        <section className="space-y-3 sm:space-y-4 lg:sticky lg:top-[76px] lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-indigo-600" />
              <h1 className="text-sm font-black">选择素材与目标</h1>
            </div>

            <label className="mb-1 block text-[11px] font-bold text-slate-500">视频目标</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {creatorOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectCreator(item.id)}
                  className={`rounded-lg border p-2 text-left transition ${
                    creatorType === item.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-black">{item.label}</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{item.hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-[11px] font-black text-indigo-800">{selectedCreator.flow}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-indigo-700">{selectedCreator.basis}</p>
            </div>

            <label className="mb-1 mt-4 block text-[11px] font-bold text-slate-500">视频想表达什么</label>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              placeholder="例如：突出招牌菜、展示门店环境、介绍本周优惠"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />

            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-[11px] font-bold text-slate-500">
                平台
                <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="google_business">Google</option>
                </select>
              </label>
              <label className="text-[11px] font-bold text-slate-500">
                比例
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs">
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="4:5">4:5</option>
                  <option value="16:9">16:9</option>
                </select>
              </label>
              <label className="text-[11px] font-bold text-slate-500">
                秒数
                <input value={duration} onChange={(e) => setDuration(Number(e.target.value) || 10)} type="number" min={4} max={24} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs" />
              </label>
            </div>

            <button
              onClick={handleGeneratePlan}
              disabled={generating || selectedAssetIds.length === 0}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成可编辑分镜
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xs font-black text-slate-700">素材选择</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  已选 {selectedAssetIds.length} 个素材，可继续添加或移除。
                </p>
              </div>
              {loadingAssets && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {[
                  { key: 'unused', label: '未使用' },
                  { key: 'all', label: '全部' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setAssetTypeFilter(item.key as 'unused' | 'all')
                      setAssetPageSize(12)
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                      assetTypeFilter === item.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-1 text-[11px] text-slate-500">
              系统会根据这些图片生成每个镜头的画面描述。
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-3">
              {selectedAssets.map((asset) => (
                <div key={asset.id} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                  {asset.mimeType.startsWith('video/') ? (
                    <video src={`${asset.url}#t=0.1`} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={asset.url} alt={asset.filename || 'asset'} className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => toggleAsset(asset.id)}
                    className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                    title="移除素材"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {!loadingAssets && selectedAssets.length === 0 && (
                <div className="col-span-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-[11px] text-slate-400">
                  请从下方素材库添加至少一张图片。
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-black text-slate-500">从素材库添加</p>
                <p className="text-[10px] text-slate-400">{availableAssets.length} 个可选素材</p>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-3">
                {availableAssets.slice(0, assetPageSize).map((asset) => {
                  const selected = selectedAssetIds.includes(asset.id)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => toggleAsset(asset.id)}
                      className={`group relative aspect-square overflow-hidden rounded-lg border ${
                        selected ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <img src={asset.url} alt={asset.filename || 'asset'} className="h-full w-full object-cover transition group-hover:scale-105" />
                      <span className={`absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        selected ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-600'
                      }`}>
                        {selected ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  )
                })}
              </div>
              {availableAssets.length > assetPageSize && (
                <button
                  type="button"
                  onClick={() => setAssetPageSize((size) => size + 12)}
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  加载更多素材
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="min-h-[calc(100vh-112px)] rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black">编辑分镜并生成视频</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  按卡片顺序完成：先生成分镜，修改画面描述，最后生成视频。
                </p>
              </div>
              {(generating || submittingVideo || checkingVideo) && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
            </div>
            {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-bold leading-relaxed text-rose-600">{error}</p>}
            {!videoPlan ? (
              <div className="mt-4 grid min-h-[420px] place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-700">等待分镜</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
                <aside className="space-y-3 xl:sticky xl:top-[92px] xl:self-start">
                  {execution?.outputUrl && (
                    <div className="overflow-hidden rounded-lg border border-emerald-200 bg-black shadow-sm">
                      <video src={execution.outputUrl} className="max-h-[520px] w-full" controls playsInline />
                      <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 text-xs font-black text-emerald-700">
                        <span>已保存到素材库</span>
                        <span>AI 视频</span>
                      </div>
                    </div>
                  )}
                  {execution && (
                    <div className={`rounded-lg border p-3 text-xs font-bold ${
                      execution.status === 'completed'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      <div className="flex items-center justify-between gap-3">
                        <span>{execution.status === 'completed' ? '已完成' : '生成中'}</span>
                        {execution.status !== 'completed' && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                      {execution.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={handleCheckVideo}
                          disabled={checkingVideo}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          {checkingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          刷新结果
                        </button>
                      ) : null}
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-sm font-black">第 2 步：检查视频方案</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{videoPlan.strategy}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-black text-slate-700">分镜依据</p>
                    <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-500">
                      <p>目标：{selectedCreator.label}</p>
                      <p>结构：{selectedCreator.flow}</p>
                      <p>素材：{selectedAssetIds.length} 个已选素材</p>
                      <p>平台与比例：{platform} · {aspectRatio} · {duration} 秒</p>
                      <p>Idea：{idea}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmitVideo}
                    disabled={submittingVideo || generating || (execution && execution.status !== 'completed')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {submittingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {execution?.status === 'completed' ? '重新生成视频' : execution ? '生成中' : '第 3 步：生成视频'}
                  </button>

                  <details className="rounded-lg border border-slate-200 p-3">
                    <summary className="cursor-pointer text-xs font-black text-slate-600">高级信息：任务编号与模型参数</summary>
                    <div className="mt-2 space-y-1">
                      {(videoPlan.seedanceJobs || []).map((job: any) => (
                        <p key={job.id} className="break-all text-[11px] text-slate-500">
                          {job.id} · {job.mode} · {job.modelHint} · {job.request?.duration}s
                        </p>
                      ))}
                    </div>
                  </details>
                </aside>

                <div className="grid min-w-0 grid-cols-1 gap-3">
                  {scenes.map((scene) => {
                    const job = videoPlan.seedanceJobs?.find((item: any) => item.id.endsWith(`-${scene.id}`))
                    return (
                    <div key={scene.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black">第 {Number(scene.id)} 镜 · {displaySceneTitle(scene)}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{displayIntent(scene)}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{scene.durationSec} 秒</span>
                      </div>
                      <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="font-black text-slate-500">画面字幕</p>
                          <p className="mt-1 font-bold text-indigo-700">{scene.textOverlay}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <p className="font-black text-slate-500">镜头运动</p>
                          <p className="mt-1 text-slate-600">{displayCameraMotion(scene)}</p>
                        </div>
                      </div>
                      {job && (
                        <details className="mt-3 rounded-lg border border-slate-200 p-3">
                          <summary className="cursor-pointer text-[11px] font-black text-slate-500">
                            高级：查看或修改 Seedance 提示词
                          </summary>
                          <textarea
                            value={promptDrafts[job.id] || ''}
                            onChange={(event) => {
                              setPromptDrafts((prev) => ({ ...prev, [job.id]: event.target.value }))
                            }}
                            rows={7}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-700 outline-none focus:border-indigo-400"
                          />
                        </details>
                      )}
                    </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
        </div>
      </main>
    </div>
  )
}

export default function VideoCreatorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading video creator...</div>}>
      <VideoCreatorPageInner />
    </Suspense>
  )
}
