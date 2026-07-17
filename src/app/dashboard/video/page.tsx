'use client'

/* eslint-disable @next/next/no-img-element */
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Film, Loader2, Play, Sparkles, Wand2 } from 'lucide-react'

type Asset = {
  id: string
  url: string
  filename?: string | null
  mimeType: string
  aiTags?: string[]
  aiCaption?: string | null
  brandName?: string
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
  { id: 'product_showcase', label: '产品展示', hint: '多图生成产品/菜品动态展示' },
  { id: 'story_campaign', label: '剧情短片', hint: 'idea + 素材生成多段剧情视频' },
  { id: 'review_to_video', label: '好评视频', hint: '把顾客评价变成信任素材' },
  { id: 'event_offer', label: '活动促销', hint: '节日、开业、限时优惠' },
  { id: 'menu_recommendation', label: '菜单推荐', hint: '今日推荐 / 套餐视频' },
  { id: 'local_discovery', label: '本地发现', hint: '附近场景与商圈搜索' },
]

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
  const [idea, setIdea] = useState('Showcase selected merchant assets as a short social video')
  const [platform, setPlatform] = useState('tiktok')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [duration, setDuration] = useState(10)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

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

  const videoPlan = result?.remote?.result || result?.result
  const scenes: VideoScene[] = videoPlan?.scenes || []

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => prev.includes(assetId)
      ? prev.filter((id) => id !== assetId)
      : [...prev, assetId])
  }

  const handleGeneratePlan = async () => {
    if (!brandId) {
      setError('缺少 brandId')
      return
    }
    if (!idea.trim()) {
      setError('请输入视频 idea 或营销目标')
      return
    }
    if (selectedAssetIds.length === 0) {
      setError('请至少选择一个素材')
      return
    }

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
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '生成视频方案失败')
      setResult(json)
    } catch (err: any) {
      setError(err?.message || '生成视频方案失败')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <div className="flex items-center gap-2 text-sm font-black">
            <Film className="h-4 w-4 text-indigo-600" />
            AI Video Creator
          </div>
          <div className="w-14" />
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-[360px_1fr]">
        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-indigo-600" />
              <h1 className="text-sm font-black">视频制作设置</h1>
            </div>

            <label className="mb-1 block text-[11px] font-bold text-slate-500">视频目标</label>
            <div className="grid grid-cols-2 gap-2">
              {creatorOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCreatorType(item.id)}
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

            <label className="mb-1 mt-4 block text-[11px] font-bold text-slate-500">Idea / 活动目标</label>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
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
              disabled={generating}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成视频方案
            </button>
            {error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-600">{error}</p>}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-black text-slate-700">已选素材</h2>
            <p className="mt-1 text-[11px] text-slate-500">{selectedAssetIds.length} 个素材将作为视频参考</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {selectedAssets.map((asset) => (
                <button key={asset.id} onClick={() => toggleAsset(asset.id)} className="relative aspect-square overflow-hidden rounded-lg border border-indigo-300">
                  {asset.mimeType.startsWith('video/') ? (
                    <video src={`${asset.url}#t=0.1`} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={asset.url} alt={asset.filename || 'asset'} className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black">素材选择</h2>
                <p className="text-[11px] text-slate-500">可继续补选素材，生成前后都不会修改原素材。</p>
              </div>
              {loadingAssets && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-5 xl:grid-cols-6">
              {assets.slice(0, 36).map((asset) => {
                const checked = selectedAssetIds.includes(asset.id)
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleAsset(asset.id)}
                    className={`group relative aspect-square overflow-hidden rounded-lg border ${checked ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'}`}
                  >
                    {asset.mimeType.startsWith('video/') ? (
                      <>
                        <video src={`${asset.url}#t=0.1`} className="h-full w-full object-cover" muted />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                          <Play className="h-5 w-5 fill-white" />
                        </span>
                      </>
                    ) : (
                      <img src={asset.url} alt={asset.filename || 'asset'} className="h-full w-full object-cover transition group-hover:scale-105" />
                    )}
                    {checked && <span className="absolute right-1.5 top-1.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black text-white">选中</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black">生成结果</h2>
            {!videoPlan ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                生成后将在这里看到分镜、Seedance 任务和拼接计划。
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-black">{videoPlan.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{videoPlan.strategy}</p>
                </div>

                <div className="space-y-3">
                  {scenes.map((scene) => (
                    <div key={scene.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black">{scene.id}. {scene.title}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{scene.intent}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{scene.durationSec}s</span>
                      </div>
                      <p className="mt-2 text-xs font-bold text-indigo-700">{scene.textOverlay}</p>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{scene.cameraMotion}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-black">Seedance Jobs</p>
                  <div className="mt-2 space-y-1">
                    {(videoPlan.seedanceJobs || []).map((job: any) => (
                      <p key={job.id} className="text-[11px] text-slate-600">
                        {job.id} · {job.mode} · {job.modelHint} · {job.request?.duration}s
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
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
