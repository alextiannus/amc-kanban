import { prisma } from '@/lib/prisma'

type VideoAsset = {
  id: string
  url: string
  mimeType?: string | null
  filename?: string | null
  aiTags?: string[] | null
  aiCaption?: string | null
  aiCategory?: string | null
}

type SeedanceJob = {
  id: string
  provider: 'seedance'
  mode: 'text_to_video' | 'image_to_video' | 'reference_to_video'
  modelHint?: string
  request: {
    prompt: string
    ratio?: string
    duration?: number
    references?: Array<{ id?: string; url: string; mimeType?: string }>
    negativePrompt?: string
  }
}

export type VideoGenerationExecution = {
  ok: true
  jobId: string
  status: 'submitted' | 'processing' | 'completed'
  provider: string
  providerTaskIds: string[]
  outputUrl?: string
  assets?: Array<{ id: string; url: string; mimeType: string; filename?: string | null }>
}

type VideoProviderConfig = {
  id: string
  provider: string
  modelName: string
  apiKey: string | null
  baseUrl: string | null
}

const VIDEO_PROVIDERS = ['seedance', 'fal', 'kieai', 'volcengine']

export async function validateVideoProviderConfig(input: {
  provider: string
  modelName: string
  apiKey: string
  baseUrl: string | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const provider = input.provider.trim().toLowerCase()
  const apiKey = input.apiKey.trim()
  if (!apiKey) return { success: false, error: 'API key cannot be empty' }

  try {
    if (provider === 'seedance' || provider === 'volcengine') {
      const baseUrl = seedanceBaseUrl(input.baseUrl)
      const response = await fetch(`${baseUrl}/v1/tasks/amc_config_validation`, {
        headers: { authorization: `Bearer ${apiKey}` },
      })
      const json = await response.json().catch(() => null)
      if (response.status === 401 || json?.error?.code === 'invalid_api_key') {
        return { success: false, error: json?.error?.message || 'Invalid or revoked API key.' }
      }
      if (response.status === 403) {
        return { success: false, error: json?.error?.message || 'API key does not have video generation permission.' }
      }
      if (response.status === 404 || json?.error?.code === 'not_found') return { success: true }
      if (response.ok) return { success: true }
      return { success: false, error: json?.error?.message || json?.message || `Seedance validation failed with ${response.status}` }
    }

    if (provider === 'kieai') {
      const baseUrl = (input.baseUrl || 'https://api.kie.ai').replace(/\/+$/, '')
      const response = await fetch(`${baseUrl}/api/v1/veo/record-info?taskId=amc_config_validation`, {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
      })
      const json = await response.json().catch(() => null)
      const message = String(json?.message || json?.error || '').toLowerCase()
      if (response.status === 401 || response.status === 403 || message.includes('invalid') && message.includes('key')) {
        return { success: false, error: json?.message || 'Invalid or revoked API key.' }
      }
      return { success: true }
    }

    return { success: false, error: `Unsupported video provider: ${input.provider}` }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Video provider validation request failed' }
  }
}

async function getVideoProviderConfig(): Promise<VideoProviderConfig | null> {
  return prisma.lLMConfig.findFirst({
    where: {
      isEnabled: true,
      provider: { in: VIDEO_PROVIDERS },
      OR: [
        { taskTags: { has: 'video_generation' } },
        { taskTags: { has: 'image_to_video' } },
        { taskTags: { has: 'video_provider' } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })
}

export async function generateVideoFromPlan(input: {
  brandId: string
  actorId: string
  plan: { title?: string; strategy?: string; scenes?: unknown[]; seedanceJobs?: SeedanceJob[] }
  assetIds?: string[]
  imageUrls?: string[]
  aspectRatio?: string
}): Promise<VideoGenerationExecution> {
  const config = await getVideoProviderConfig()
  if (!config?.apiKey) {
    throw new Error('视频生成模型未配置。请在 Admin → AI 模型配置中启用 provider=seedance，taskTags=video_generation。')
  }

  const assets = input.assetIds?.length
    ? await prisma.mediaAsset.findMany({
        where: { brandId: input.brandId, id: { in: input.assetIds } },
        select: { id: true, url: true, mimeType: true, filename: true, aiTags: true, aiCaption: true, aiCategory: true },
      })
    : []

  const jobs = input.plan.seedanceJobs?.length
    ? input.plan.seedanceJobs
    : [fallbackJob(input)]

  if (config.provider === 'kieai') {
    return generateWithKieAi({ config, input, assets, job: jobs[0] })
  }

  if (config.provider === 'seedance' || config.provider === 'volcengine') {
    return generateWithSeedanceGateway({ config, input, assets, jobs: jobs.slice(0, 1) })
  }

  throw new Error(`Unsupported video provider for execution: ${config.provider}`)
}

async function generateWithSeedanceGateway(args: {
  config: VideoProviderConfig
  input: { brandId: string; actorId: string; plan: { title?: string }; assetIds?: string[]; imageUrls?: string[] }
  assets: VideoAsset[]
  jobs: SeedanceJob[]
}): Promise<VideoGenerationExecution> {
  const { config, input, assets, jobs } = args
  const baseUrl = seedanceBaseUrl(config.baseUrl)
  const providerTaskIds: string[] = []
  const createdAssets: VideoGenerationExecution['assets'] = []

  for (const job of jobs) {
    const imageUrls = resolveJobImageUrls(job, assets, input.imageUrls)
    const generationType = job.mode === 'reference_to_video'
      ? 'reference-to-video'
      : job.mode === 'image_to_video'
      ? 'image-to-video'
      : 'text-to-video'

    const response = await fetch(`${baseUrl}/v1/videos/generations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName || job.modelHint || 'seedance-2-0',
        input: {
          prompt: job.request.prompt,
          generation_type: generationType,
          image_urls: imageUrls,
          duration: job.request.duration || 5,
          aspect_ratio: job.request.ratio || '9:16',
          negative_prompt: job.request.negativePrompt,
        },
      }),
    })

    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(json?.error?.message || json?.message || `Seedance task creation failed with ${response.status}`)
    }

    const taskId = String(json?.id || json?.task_id || json?.taskId || json?.data?.id || json?.data?.task_id || '')
    if (!taskId) throw new Error('Seedance provider did not return a task id')
    providerTaskIds.push(taskId)

    const outputUrl = await pollSeedanceGateway(baseUrl, config.apiKey!, taskId)
    if (outputUrl) {
      const asset = await createVideoAsset({
        brandId: input.brandId,
        actorId: input.actorId,
        url: outputUrl,
        filename: `seedance-${taskId}.mp4`,
        caption: `Seedance video: ${input.plan.title || job.id}`,
        sourceAssets: assets,
      })
      createdAssets.push(asset)
    }
  }

  return {
    ok: true,
    jobId: providerTaskIds[0],
    status: createdAssets.length ? 'completed' : 'processing',
    provider: config.provider,
    providerTaskIds,
    outputUrl: createdAssets[0]?.url,
    assets: createdAssets,
  }
}

async function pollSeedanceGateway(baseUrl: string, apiKey: string, taskId: string): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3500))
    const response = await fetch(`${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) continue
    const status = String(json?.status || json?.data?.status || '').toLowerCase()
    const outputUrl = extractVideoUrl(json)
    if (outputUrl) return outputUrl
    if (status.includes('fail') || status.includes('cancel') || status.includes('error')) {
      throw new Error(json?.error?.message || json?.message || `Seedance task ${taskId} failed`)
    }
  }
  return ''
}

function seedanceBaseUrl(baseUrl: string | null): string {
  return (baseUrl || 'https://api.seedance2.ai').replace(/\/+$/, '').replace(/\/v1$/, '')
}

async function generateWithKieAi(args: {
  config: VideoProviderConfig
  input: { brandId: string; actorId: string; plan: { title?: string }; imageUrls?: string[]; aspectRatio?: string }
  assets: VideoAsset[]
  job: SeedanceJob
}): Promise<VideoGenerationExecution> {
  const { config, input, assets, job } = args
  const baseUrl = (config.baseUrl || 'https://api.kie.ai').replace(/\/+$/, '')
  const imageUrls = resolveJobImageUrls(job, assets, input.imageUrls)
  if (imageUrls.length === 0) throw new Error('至少需要一张图片素材才能生成图生视频。')

  const response = await fetch(`${baseUrl}/api/v1/veo/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      prompt: job.request.prompt,
      imageUrls: imageUrls.slice(0, 9),
      model: config.modelName || 'veo3_fast',
      aspectRatio: job.request.ratio || input.aspectRatio || '9:16',
    }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || (json?.code !== undefined && json.code !== 200 && json.code !== 201)) {
    throw new Error(json?.message || `Kie.ai video task creation failed with ${response.status}`)
  }

  const taskId = String(json?.data?.taskId || json?.taskId || '')
  if (!taskId) throw new Error('Kie.ai did not return a task id')
  const outputUrl = await pollKieAi(baseUrl, config.apiKey!, taskId)
  if (!outputUrl) {
    return { ok: true, jobId: taskId, status: 'processing', provider: config.provider, providerTaskIds: [taskId] }
  }

  const asset = await createVideoAsset({
    brandId: input.brandId,
    actorId: input.actorId,
    url: outputUrl,
    filename: `kieai-${taskId}.mp4`,
    caption: `VideoDirector video: ${input.plan.title || job.id}`,
    sourceAssets: assets,
  })
  return {
    ok: true,
    jobId: taskId,
    status: 'completed',
    provider: config.provider,
    providerTaskIds: [taskId],
    outputUrl: asset.url,
    assets: [asset],
  }
}

async function pollKieAi(baseUrl: string, apiKey: string, taskId: string): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3500))
    const response = await fetch(`${baseUrl}/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
    })
    const json = await response.json().catch(() => null)
    const outputUrl = json?.data?.response?.resultUrls?.[0]
    if (outputUrl) return String(outputUrl)
    if (json?.code !== undefined && json.code !== 200 && json.code !== 202 && json.code !== 400) {
      throw new Error(json?.message || `Kie.ai task ${taskId} failed`)
    }
  }
  return ''
}

async function createVideoAsset(input: {
  brandId: string
  actorId: string
  url: string
  filename: string
  caption: string
  sourceAssets: VideoAsset[]
}) {
  const tags = Array.from(new Set([
    ...input.sourceAssets.flatMap((asset) => asset.aiTags || []),
    'AI视频',
    'Seedance',
  ]))
  const asset = await prisma.mediaAsset.create({
    data: {
      brandId: input.brandId,
      url: input.url,
      filename: input.filename,
      mimeType: 'video/mp4',
      aiReady: true,
      aiCategory: input.sourceAssets[0]?.aiCategory || '素材库',
      aiTags: tags,
      aiCaption: input.caption,
      sourceType: 'ai_video',
      uploadedBy: input.actorId,
    },
  })
  return { id: asset.id, url: asset.url, mimeType: asset.mimeType, filename: asset.filename }
}

function resolveJobImageUrls(job: SeedanceJob, assets: VideoAsset[], imageUrls?: string[]): string[] {
  const refs = job.request.references || []
  const urls = refs.map((ref) => ref.url).filter(Boolean)
  if (urls.length) return urls.slice(0, 9)
  const assetUrls = assets.filter((asset) => asset.mimeType?.startsWith('image/')).map((asset) => asset.url)
  return Array.from(new Set([...(imageUrls || []), ...assetUrls])).slice(0, 9)
}

function fallbackJob(input: { plan: { title?: string; strategy?: string }; imageUrls?: string[]; aspectRatio?: string }): SeedanceJob {
  return {
    id: 'seedance-fallback-01',
    provider: 'seedance',
    mode: input.imageUrls?.length ? 'image_to_video' : 'text_to_video',
    modelHint: 'seedance-2.0-fast',
    request: {
      prompt: [input.plan.title, input.plan.strategy].filter(Boolean).join('\n\n') || 'Create a short product showcase video.',
      ratio: input.aspectRatio || '9:16',
      duration: 5,
      references: [],
      negativePrompt: 'distorted text, inaccurate logo, fake price, fake address, low quality, watermark',
    },
  }
}

function extractVideoUrl(json: any): string {
  const candidates = [
    json?.output?.video_url,
    json?.output?.url,
    json?.video_url,
    json?.url,
    json?.data?.output?.video_url,
    json?.data?.output?.url,
    json?.data?.video_url,
    json?.data?.url,
    json?.data?.result?.video_url,
    json?.data?.result?.url,
    json?.data?.response?.resultUrls?.[0],
    json?.output?.videos?.[0]?.url,
    json?.data?.output?.videos?.[0]?.url,
  ]
  return String(candidates.find((value) => typeof value === 'string' && value) || '')
}
