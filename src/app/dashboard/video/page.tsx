'use client'

/* eslint-disable @next/next/no-img-element */
import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, ExternalLink, Film, Loader2, Play, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import type { VideoScriptPreset } from '@/lib/videoScriptPresets'

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

type VideoPreview = {
  url: string
  title: string
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

const textMap: Record<string, string> = {
  'Hook -> Proof/Body -> CTA': '开场钩子 → 证明/主体 → 行动引导',
  'Problem -> Solution -> CTA': '问题场景 → 解决方案 → 行动引导',
  'Discovery -> Reason -> Action': '发现商家 → 到店理由 → 下一步行动',
  'Before -> Turning point -> After -> CTA': '之前状态 → 转折点 → 之后效果 → 行动引导',
  'Review quote -> Visual proof -> CTA': '评价引用 → 画面证明 → 行动引导',
  'Reason 1 -> Reason 2 -> Reason 3 -> CTA': '理由一 → 理由二 → 理由三 → 行动引导',
  'Offer hook -> Value -> Deadline/CTA': '优惠钩子 → 价值说明 → 截止/行动',
  'Occasion -> Atmosphere -> CTA': '活动时刻 → 现场氛围 → 行动引导',
  'Menu reveal -> Hero detail -> Order cue': '菜单亮相 → 主打细节 → 下单提示',
  'Ingredient -> Cooking detail -> Taste cue': '食材亮点 → 做法细节 → 口感提示',
  'Show use -> Show benefit -> CTA': '展示使用 → 展示好处 → 行动引导',
  'Before -> Process -> After': '之前状态 → 过程细节 → 之后效果',
  'Daily moment -> Merchant fit -> Outcome -> Save cue': '日常时刻 → 商家出现 → 体验结果 → 收藏提示',
  'POV discovery -> Walk in -> Try it -> Save': '第一视角发现 → 走近细节 → 体验瞬间 → 收藏',
  'Comment hook -> Proof montage -> CTA': '评论钩子 → 素材证明 → 行动引导',
  'Review signal -> Merchant care -> Invitation': '好评信号 → 商家用心 → 邀请体验',
  'Bundle reveal -> Value stack -> Claim cue': '套餐亮相 → 价值展示 → 领取提示',
  'Reminder -> Reason -> Action': '提醒 → 理由 → 行动',
  'Price hook -> What you get -> Order cue': '价位钩子 → 包含内容 → 下单提示',
  'Staff pick -> Detail -> Try next': '店家推荐 → 推荐理由 → 试试它',
  'Nearby cue -> Route clue -> Store detail -> Save': '附近提示 → 路线线索 → 门店细节 → 收藏',
  'Plan idea -> Experience detail -> Invite': '计划灵感 → 体验细节 → 邀请收尾',
  'Month -> Output -> Signals -> Next': '本月概览 → 内容产出 → 客户信号 → 下月重点',
  'Before -> Work done -> After -> Next': '之前状态 → 完成工作 → 现在状态 → 下一步',
  'Usage -> Output -> Approval -> Value': '使用记录 → 产出证明 → 审批过程 → 价值总结',
  'Signal -> Insight -> Recommendation -> Action': '关键信号 → 洞察 → 建议 → 行动',
  'Old asset -> Improvement -> New presentation': '旧素材状态 → 优化过程 → 新呈现',
  'Missing context -> Updated presence -> Easier choice': '信息不完整 → 资料补齐 → 更容易选择',
  'Scattered -> Systemized -> Consistent': '零散状态 → 系统化 → 持续输出',
  'Assets -> Message -> Launch ready': '素材准备 → 信息清楚 → 准备上线',
  'Fresh from the wok': '刚出锅的鲜香',
  'Rich color, aroma, and texture': '色香与质感都看得见',
  'Ready to enjoy': '可以开吃了',
  'Worth a closer look': '值得仔细看看',
  'Real details, clearly shown': '真实细节，清楚呈现',
  'Save this for later': '先收藏起来',
  'Need a better local option?': '想找个更好的附近选择？',
  'Found nearby': '附近发现',
  'Easy to choose': '更容易选择',
  'Save for next time': '下次就选它',
  'Hard to choose?': '选择困难？',
  'Then this stood out': '这个细节让人记住',
  'Now it makes sense': '现在选择更清楚',
  'Try it next': '下次试试',
  'Customers noticed this': '顾客提到了这个细节',
  'Real words, real details': '真实评价，真实细节',
  'See why locals save it': '看看为什么本地人会收藏',
  'Reason 1': '理由一',
  'Reason 2': '理由二',
  'Reason 3': '理由三',
  'Save this option': '收藏这个选择',
  'Limited-time offer': '限时优惠',
  'Worth checking out': '值得了解',
  'Book, visit, or message today': '今天预约、到店或咨询',
  'Happening now': '活动进行中',
  'A local reason to visit': '一个到店理由',
  'Visit today': '今天来看看',
  'Today recommendation': '今日推荐',
  'Fresh details': '新鲜细节',
  'Ask today': '今天可以咨询',
  'Fresh ingredient detail': '食材细节',
  'Made with care': '用心制作',
  'Ready to try': '可以试试',
  'Near you': '就在附近',
  'A practical local pick': '实用的附近选择',
  'Save this place': '收藏这个地方',
  'Lunch nearby?': '附近午餐？',
  'A practical pick': '一个实用选择',
  'Save for next meal': '下次用餐收藏',
  'See it in action': '看看实际效果',
  'The useful detail': '有用的细节',
  'Before': '之前',
  'After': '之后',
  'In a normal day': '日常的一刻',
  'This fits the moment': '正好适合这个场景',
  'Found this nearby': '附近发现这个',
  'Closer look': '靠近看看',
  'Worth trying': '值得试试',
  'Save this': '收藏起来',
}

function localizeText(value?: string) {
  if (!value) return value || ''
  return textMap[value] || value
}

function hasChinese(value?: string) {
  return Boolean(value && /[\u3400-\u9fff]/.test(value))
}

function localizeVisualPrompt(shot: VideoScriptPreset['shotDrafts'][number]) {
  if (hasChinese(shot.visualPrompt)) return shot.visualPrompt
  const overlay = localizeText(shot.textOverlay)
  return `${shot.title}：使用已选素材生成真实商家短视频画面。突出“${overlay}”这个表达，动作自然，细节清楚，避免虚构价格、虚假招牌、夸张承诺或不真实画面。`
}

function localizeVoiceover(shot: VideoScriptPreset['shotDrafts'][number]) {
  if (!shot.voiceover || hasChinese(shot.voiceover)) return shot.voiceover
  return `围绕“${localizeText(shot.textOverlay)}”做一句自然、简短的中文旁白。`
}

function localizeScriptPreset(preset: VideoScriptPreset): VideoScriptPreset {
  return {
    ...preset,
    structure: localizeText(preset.structure),
    shotDrafts: preset.shotDrafts.map((shot) => ({
      ...shot,
      visualPrompt: localizeVisualPrompt(shot),
      textOverlay: localizeText(shot.textOverlay),
      cameraMotion: motionMap[shot.cameraMotion] || shot.cameraMotion,
      voiceover: localizeVoiceover(shot),
    })),
  }
}

function prepareScriptPresetForLanguage(preset: VideoScriptPreset, language: 'zh' | 'en'): VideoScriptPreset {
  if (language === 'en') return preset
  return localizeScriptPreset(preset)
}

function resolveVideoLanguage(mode: 'auto' | 'zh' | 'en', idea: string, platform: string): 'zh' | 'en' {
  if (mode === 'zh' || mode === 'en') return mode
  if (hasChinese(idea)) return 'zh'
  if (/[A-Za-z]/.test(idea)) return 'en'
  if (platform === 'xiaohongshu') return 'zh'
  return 'en'
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

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => text(item)).find(Boolean) || ''
  return text(value)
}

function executionOutputUrl(value: any): string {
  return text(value?.outputUrl)
    || text(value?.output_url)
    || text(value?.url)
    || text(value?.asset?.url)
    || text(value?.assetUrl)
    || text(value?.asset_url)
    || text(value?.content?.url)
    || text(value?.file?.downloadUrl)
    || text(value?.file?.download_url)
    || text(value?.downloadUrl)
    || text(value?.download_url)
    || text(value?.data?.output?.videoUrl)
    || text(value?.data?.output?.video_url)
    || text(value?.data?.videoUrl)
    || text(value?.data?.video_url)
    || text(value?.resultUrls?.[0])
    || text(value?.result_urls?.[0])
    || text(value?.response?.resultUrls?.[0])
    || text(value?.data?.response?.resultUrls?.[0])
    || ''
}

function executionProviderTaskIds(value: any): string[] {
  const ids = Array.isArray(value?.providerTaskIds)
    ? value.providerTaskIds.map((item: unknown) => text(item)).filter(Boolean)
    : []
  const taskId = firstString(value?.taskId || value?.task_id || value?.jobId || value?.job_id || value?.id)
  return ids.length || !taskId ? ids : [taskId]
}

function normalizeVideoExecution(value: any) {
  if (!value || typeof value !== 'object') return value
  const outputUrl = executionOutputUrl(value)
  const providerTaskIds = executionProviderTaskIds(value)
  return {
    ...value,
    ...(outputUrl ? { outputUrl } : {}),
    providerTaskIds,
    status: outputUrl ? 'completed' : (text(value.status) || (providerTaskIds.length ? 'submitted' : 'queued')),
  }
}

function splitSceneDurations(totalDuration: number, sceneCount: number): number[] {
  if (sceneCount <= 0) return []
  const safeTotal = Math.max(sceneCount * 4, Math.round(totalDuration || sceneCount * 4))
  const base = Math.floor(safeTotal / sceneCount)
  const durations = Array.from({ length: sceneCount }, () => base)
  let remainder = safeTotal - base * sceneCount
  let index = 0
  while (remainder > 0) {
    durations[index % sceneCount] += 1
    remainder -= 1
    index += 1
  }
  return durations.map((value) => Math.max(4, value))
}

function withBalancedDurations(rows: SceneRow[], totalDuration: number): SceneRow[] {
  const durations = splitSceneDurations(totalDuration, rows.length)
  return rows.map((row, index) => {
    const durationSec = durations[index] || row.scene.durationSec || 4
    return {
      ...row,
      scene: { ...row.scene, durationSec },
      job: row.job ? { ...row.job, request: { ...row.job.request, duration: durationSec } } : row.job,
    }
  })
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
  const [videoLanguageMode, setVideoLanguageMode] = useState<'auto' | 'zh' | 'en'>('auto')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [duration, setDuration] = useState(creatorOptions[0].duration)
  const [assetFilter, setAssetFilter] = useState<'unused' | 'all'>('unused')
  const [assetPageSize, setAssetPageSize] = useState(12)
  const [expandedAssetRowId, setExpandedAssetRowId] = useState<string | null>(null)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [loadingPresets, setLoadingPresets] = useState(false)
  const [scriptPresets, setScriptPresets] = useState<VideoScriptPreset[]>([])
  const [selectedScriptId, setSelectedScriptId] = useState('')
  const [scriptDraft, setScriptDraft] = useState<VideoScriptPreset | null>(null)
  const [planning, setPlanning] = useState(false)
  const [finalBusy, setFinalBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<any>(null)
  const [rows, setRows] = useState<SceneRow[]>([])
  const [finalExecution, setFinalExecution] = useState<any>(null)
  const [videoPreview, setVideoPreview] = useState<VideoPreview | null>(null)

  const selectedCreator = useMemo(
    () => creatorOptions.find((item) => item.id === creatorType) || creatorOptions[0],
    [creatorType],
  )

  const videoLanguage = useMemo(
    () => resolveVideoLanguage(videoLanguageMode, idea, platform),
    [videoLanguageMode, idea, platform],
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

  useEffect(() => {
    setLoadingPresets(true)
    fetch(`/api/content/video/presets?creatorType=${encodeURIComponent(creatorType)}`)
      .then((res) => res.json())
      .then((json) => {
        const presets = Array.isArray(json.presets)
          ? json.presets.map((preset: VideoScriptPreset) => prepareScriptPresetForLanguage(preset, videoLanguage))
          : []
        setScriptPresets(presets)
        const next = presets[0] || null
        setSelectedScriptId(next?.id || '')
        setScriptDraft(next ? structuredClone(next) : null)
      })
      .catch(() => {
        setScriptPresets([])
        setSelectedScriptId('')
        setScriptDraft(null)
      })
      .finally(() => setLoadingPresets(false))
  }, [creatorType, videoLanguage])

  const assetIdsInRows = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.assetIds))),
    [rows],
  )

  const visibleAssets = useMemo(() => {
    const selected = new Set([...selectedAssetIds, ...assetIdsInRows])
    const imageAssets = assets.filter((asset) => !asset.mimeType?.startsWith('video/'))
    const filtered = assetFilter === 'unused'
      ? imageAssets.filter((asset: any) => (asset.usedCount ?? 0) === 0 || selected.has(asset.id))
      : imageAssets
    return [...filtered].sort((a: any, b: any) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tB - tA
    })
  }, [assets, assetFilter, selectedAssetIds, assetIdsInRows])

  const selectedFinalRows = rows.filter((row) => row.includeInFinal && executionOutputUrl(row.execution))
  const selectedFinalUrls = selectedFinalRows
    .map((row) => executionOutputUrl(row.execution))
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

  const handleSelectScript = (scriptId: string) => {
    const preset = scriptPresets.find((item) => item.id === scriptId) || null
    setSelectedScriptId(scriptId)
    setScriptDraft(preset ? structuredClone(preset) : null)
    resetPlan()
  }

  const updateScriptShot = (index: number, patch: Partial<VideoScriptPreset['shotDrafts'][number]>) => {
    setScriptDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        shotDrafts: prev.shotDrafts.map((shot, shotIndex) => shotIndex === index ? { ...shot, ...patch } : shot),
      }
    })
    resetPlan()
  }

  const toggleRowAsset = (rowId: string, assetId: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.rowId !== rowId) return row
      const next = row.assetIds.includes(assetId)
        ? row.assetIds.filter((id) => id !== assetId)
        : [...row.assetIds, assetId]
      return { ...row, assetIds: next, execution: undefined }
    }))
    setFinalExecution(null)
  }

  const updateRowDuration = (rowId: string, durationSec: number) => {
    const nextDuration = Math.max(4, Math.min(15, Math.round(durationSec || 4)))
    setRows((prev) => prev.map((row) => row.rowId === rowId
      ? {
          ...row,
          scene: { ...row.scene, durationSec: nextDuration },
          job: row.job ? { ...row.job, request: { ...row.job.request, duration: nextDuration } } : row.job,
          execution: undefined,
        }
      : row))
    setFinalExecution(null)
  }

  const assetRefsForRow = (assetIds: string[]) => assets
    .filter((asset) => assetIds.includes(asset.id))
    .map((asset) => ({ id: asset.id, url: asset.url, mimeType: asset.mimeType }))

  const selectedAssetsForRow = (row: SceneRow) => assets.filter((asset) => row.assetIds.includes(asset.id))

  const buildRows = (videoPlan: any): SceneRow[] => {
    const scenes: VideoScene[] = videoPlan?.scenes || []
    const jobs: any[] = videoPlan?.seedanceJobs || []
    const builtRows = scenes.map((scene, index) => {
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
    return withBalancedDurations(builtRows, duration)
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
    const nextRows = [...rows, {
      rowId: `custom-${Date.now()}`,
      scene,
      job,
      prompt: job.request.prompt || scene.visualPrompt,
      assetIds: [],
      includeInFinal: true,
    }]
    const nextDuration = Math.max(duration, nextRows.length * 4)
    if (nextDuration !== duration) setDuration(nextDuration)
    setRows(withBalancedDurations(nextRows, nextDuration))
    setFinalExecution(null)
  }

  const handleDeleteRow = (rowId: string) => {
    setRows((prev) => withBalancedDurations(prev.filter((row) => row.rowId !== rowId), duration))
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
          language: videoLanguage,
          assetIds: selectedAssetIds,
          scriptPresetId: selectedScriptId,
          scriptDraft,
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
          language: videoLanguage,
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
      setRow(row.rowId, { execution: normalizeVideoExecution(json.execution), busy: false })
    } catch (err: any) {
      setError(err?.message || '生成分镜视频失败')
      setRow(row.rowId, { busy: false })
    }
  }

  const handleCheckRow = async (row: SceneRow, auto = false) => {
    const taskId = row.execution?.providerTaskIds?.[0]
    if (!taskId) return
    if (!auto) setRow(row.rowId, { busy: true })
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
      setRow(row.rowId, { execution: normalizeVideoExecution(json.execution), busy: false })
    } catch (err: any) {
      if (!auto) setError(err?.message || '刷新分镜失败')
      setRow(row.rowId, { busy: false })
    }
  }

  const handleGenerateFinal = async () => {
    if (!plan) {
      setError('请先确认剧本并生成分镜表。')
      return
    }
    if (selectedFinalUrls.length === 0) {
      setError('请先生成至少一个已完成的分镜视频，再合成最终视频。')
      return
    }
    setFinalBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/content/video/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          title: `${plan.title || idea} - 最终成片`,
          aspectRatio,
          clipUrls: selectedFinalUrls,
          scriptSummary: selectedFinalRows.map((row, index) => `${index + 1}. ${sceneTitle(row.scene)}：${row.prompt}`).join('\n'),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '合成最终视频失败')
      const execution = normalizeVideoExecution(json.execution)
      setFinalExecution(execution)
      if (!execution?.outputUrl && execution?.providerTaskIds?.length === 0) {
        setError('合成任务已提交，但服务没有返回可刷新任务 ID。请稍后重试或检查视频合成服务配置。')
      }
    } catch (err: any) {
      setError(err?.message || '合成最终视频失败')
    } finally {
      setFinalBusy(false)
    }
  }

  const handleCheckFinal = async () => {
    const taskId = finalExecution?.providerTaskIds?.[0]
    if (!taskId) {
      setError('当前最终视频任务没有可刷新任务 ID，请重新点击合成最终视频。')
      return
    }
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
      setFinalExecution(normalizeVideoExecution(json.execution))
    } catch (err: any) {
      setError(err?.message || '刷新最终视频失败')
    } finally {
      setFinalBusy(false)
    }
  }

  useEffect(() => {
    const pendingRows = rows.filter((row) => row.execution?.providerTaskIds?.[0] && row.execution?.status !== 'completed' && !row.busy)
    if (pendingRows.length === 0) return
    const timer = window.setInterval(() => {
      setRows((currentRows) => {
        currentRows
          .filter((row) => row.execution?.providerTaskIds?.[0] && row.execution?.status !== 'completed' && !row.busy)
          .forEach((row) => void handleCheckRow(row, true))
        return currentRows
      })
    }, 8000)
    return () => window.clearInterval(timer)
  }, [rows])

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

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black text-slate-700">剧本草稿</p>
                  <p className="mt-1 text-[11px] text-slate-500">{localizeText(scriptDraft?.structure) || selectedCreator.flow}</p>
                </div>
                <select
                  value={selectedScriptId}
                  onChange={(event) => handleSelectScript(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                >
                  {loadingPresets && <option value="">加载中...</option>}
                  {!loadingPresets && scriptPresets.length === 0 && <option value="">默认剧本</option>}
                  {scriptPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
              </div>
              {scriptDraft?.description && <p className="mt-2 text-xs text-slate-600">{scriptDraft.description}</p>}
              {scriptDraft && (
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {scriptDraft.shotDrafts.map((shot, index) => (
                    <div key={`${scriptDraft.id}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2">
                      <input
                        value={shot.title}
                        onChange={(event) => updateScriptShot(index, { title: event.target.value })}
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs font-black outline-none focus:border-indigo-400"
                      />
                      <textarea
                        value={shot.visualPrompt}
                        onChange={(event) => updateScriptShot(index, { visualPrompt: event.target.value })}
                        rows={3}
                        className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[11px] leading-relaxed outline-none focus:border-indigo-400"
                      />
                      <input
                        value={shot.textOverlay}
                        onChange={(event) => updateScriptShot(index, { textOverlay: event.target.value })}
                        className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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
                成片语言
                <select
                  value={videoLanguageMode}
                  onChange={(e) => {
                    setVideoLanguageMode(e.target.value as 'auto' | 'zh' | 'en')
                    resetPlan()
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                >
                  <option value="auto">自动 ({videoLanguage === 'zh' ? '中文' : 'English'})</option>
                  <option value="en">English</option>
                  <option value="zh">中文</option>
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
                <input
                  value={duration}
                  onChange={(e) => {
                    const nextDuration = Math.max(4, Number(e.target.value) || selectedCreator.duration)
                    setDuration(nextDuration)
                    if (rows.length > 0) {
                      setRows(withBalancedDurations(rows, nextDuration).map((row) => ({ ...row, execution: undefined })))
                      setFinalExecution(null)
                    } else {
                      resetPlan()
                    }
                  }}
                  type="number"
                  min={4}
                  max={60}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-700">{selectedCreator.flow}</p>
              <p className="mt-1 truncate text-[11px] text-slate-500">{rows.length || '自动'} 个分镜 · {duration} 秒 · {aspectRatio} · {videoLanguage === 'zh' ? '中文' : 'English'}</p>
            </div>
            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={planning}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              确认剧本并生成分镜表
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
                      <label className="rounded-lg bg-slate-50 p-2">
                        <span className="text-[10px] font-black text-slate-400">秒数</span>
                        <input
                          value={row.scene.durationSec}
                          onChange={(event) => updateRowDuration(row.rowId, Number(event.target.value))}
                          type="number"
                          min={4}
                          max={15}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 outline-none focus:border-indigo-400"
                        />
                      </label>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-black text-slate-400">字幕</p>
                        <p className="mt-1 line-clamp-2 text-xs font-bold text-indigo-700">{localizeText(row.scene.textOverlay)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-black text-slate-400">镜头</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{sceneMotion(row.scene)}</p>
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
                      <button
                        type="button"
                        onClick={() => setVideoPreview({ url: row.execution.outputUrl, title: `第 ${index + 1} 镜预览` })}
                        className="group grid aspect-video w-full place-items-center rounded-lg bg-slate-950 text-white shadow-sm transition hover:bg-slate-900"
                      >
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 text-indigo-600 shadow-lg transition group-hover:scale-105">
                          <Play className="h-5 w-5 fill-indigo-600" />
                        </span>
                      </button>
                    ) : row.execution ? (
                      <div className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-amber-200 bg-amber-50 text-amber-700">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-[11px] font-black">视频生成中</span>
                        </div>
                      </div>
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
                <button
                  type="button"
                  onClick={() => setVideoPreview({ url: finalExecution.outputUrl, title: '最终视频预览' })}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                >
                  <Play className="h-4 w-4" />
                  播放最终视频
                </button>
              )}

              <div className="flex gap-2">
                {finalExecution && finalExecution.status !== 'completed' ? (
                  <button onClick={handleCheckFinal} disabled={finalBusy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                    {finalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    刷新最终视频
                  </button>
                ) : (
                  <button onClick={handleGenerateFinal} disabled={finalBusy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">
                    {finalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    合成最终视频
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {videoPreview && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm" onClick={() => setVideoPreview(null)}>
          <div className="relative w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <p className="truncate text-sm font-black">{videoPreview.title}</p>
              <div className="flex items-center gap-2">
                <a href={videoPreview.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" title="新标签页打开">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button onClick={() => setVideoPreview(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" title="关闭">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <video src={videoPreview.url} className="max-h-[82vh] w-full rounded-lg bg-black object-contain shadow-2xl" controls autoPlay playsInline preload="metadata" />
          </div>
        </div>
      )}
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
