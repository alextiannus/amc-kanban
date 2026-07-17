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
  const [assetTypeFilter, setAssetTypeFilter] = useState<'unused' | 'all'>('unused')
  const [assetPageSize, setAssetPageSize] = useState(12)
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

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => prev.includes(assetId)
      ? prev.filter((id) => id !== assetId)
      : [...prev, assetId])
    setResult(null)
    setError(null)
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
          executionMode: 'submit',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '生成视频失败')
      setResult(json)
    } catch (err: any) {
      setError(err?.message || '生成视频失败')
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
              disabled={generating || selectedAssetIds.length === 0}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成视频
            </button>
            {error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-600">{error}</p>}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xs font-black text-slate-700">素材选择</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  已选 {selectedAssetIds.length} 个素材，可继续从素材库添加。
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
              当前视频会按这些素材生成分镜提示。
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
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
              <div className="grid grid-cols-3 gap-2">
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

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-black">视频生成结果</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  系统会先生成剧本分镜，再按分镜提示调用已配置的视频 API。
                </p>
              </div>
              {generating && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
            </div>
            {!videoPlan ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                点击生成后将在这里看到剧本分镜、生成状态和视频结果。
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {execution?.outputUrl && (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-black">
                    <video src={execution.outputUrl} className="max-h-[520px] w-full" controls playsInline />
                  </div>
                )}
                {execution && (
                  <div className={`rounded-lg p-3 text-xs font-bold ${
                    execution.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    视频生成状态：{execution.status === 'completed' ? '已完成并保存到素材库' : '已提交，视频仍在处理中'}
                    {execution.providerTaskIds?.length ? ` · Provider Task: ${execution.providerTaskIds.join(', ')}` : ''}
                  </div>
                )}
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
