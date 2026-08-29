import { prisma } from '@/lib/prisma'

type VideoProviderConfig = {
  id: string
  provider: string
  displayName: string
  modelName: string
  apiKey: string
  baseUrl: string
  timeoutMs: number
}

type VideoExecution = {
  ok: true
  jobId: string
  status: 'queued' | 'submitted' | 'processing' | 'completed' | 'failed'
  provider: 'seedance' | 'minimax' | 'kieai' | 'volcengine' | 'fal'
  providerTaskIds?: string[]
  outputUrl?: string
  asset?: unknown
  raw?: unknown
}

type SeedanceJob = {
  id?: string
  request?: {
    prompt?: string
    ratio?: string
    duration?: number
    references?: Array<{ id?: string; url?: string; mimeType?: string }>
    negativePrompt?: string
    generateAudio?: boolean
    resolution?: string
  }
}

type SubmitVideoInput = {
  brandId: string
  actorId: string
  creatorType?: string
  platform?: string
  plan?: {
    title?: string
    seedanceJobs?: SeedanceJob[]
  }
  seedanceJobs?: SeedanceJob[]
  assetIds?: string[]
  imageUrls?: string[]
}

const VIDEO_PROVIDERS = ['seedance', 'minimax', 'kieai', 'volcengine', 'fal']

export async function submitVideoGeneration(input: SubmitVideoInput): Promise<VideoExecution> {
  const config = await getVideoProviderConfig()
  const job = firstVideoJob(input)
  if (!job?.request?.prompt?.trim()) throw Object.assign(new Error('Video prompt is required'), { status: 400 })

  if (config.provider === 'minimax') return submitMiniMax(config, job)
  if (config.provider === 'kieai' || config.provider === 'seedance') return submitKieMarket(config, job)

  throw Object.assign(
    new Error(`Video provider ${config.provider} is configured but not supported by the AMC video production runner yet.`),
    { status: 501 },
  )
}

export async function refreshVideoGeneration(input: { brandId: string; taskId: string; actorId: string }): Promise<VideoExecution> {
  const parsed = parseProviderTaskId(input.taskId)
  const config = await getVideoProviderConfig(parsed.provider)

  const execution = config.provider === 'minimax'
    ? await refreshMiniMax(config, parsed.taskId)
    : config.provider === 'kieai' || config.provider === 'seedance'
      ? await refreshKieMarket(config, parsed.taskId)
      : null

  if (!execution) {
    throw Object.assign(
      new Error(`Video provider ${config.provider} status refresh is not supported yet.`),
      { status: 501 },
    )
  }

  if (execution.outputUrl) {
    const asset = await persistGeneratedVideoAsset({
      brandId: input.brandId,
      actorId: input.actorId,
      url: execution.outputUrl,
      sourceType: 'ai_video',
      tags: ['AI视频', '分镜视频', config.provider],
      caption: `${config.displayName} generated video ${parsed.taskId}`,
    })
    return { ...execution, asset }
  }
  return execution
}

export async function assembleVideo(input: {
  brandId: string
  actorId: string
  title?: string
  clipUrls: string[]
  finalText?: string
  referenceAssetIds?: string[]
  parentAssetIds?: string[]
}): Promise<VideoExecution> {
  const serviceUrl = process.env.AMC_VIDEO_ASSEMBLY_SERVICE_URL?.replace(/\/+$/, '')
  const token = process.env.AMC_VIDEO_ASSEMBLY_SERVICE_TOKEN?.trim()
  if (!serviceUrl) {
    throw Object.assign(new Error('AMC_VIDEO_ASSEMBLY_SERVICE_URL is not configured for deterministic final video assembly'), { status: 501 })
  }

  const response = await fetch(`${serviceUrl}/v1/video/assemble`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    cache: 'no-store',
    signal: AbortSignal.timeout(115000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(new Error(data?.error || `Video assembly failed with ${response.status}`), { status: response.status })
  }
  const outputUrl = outputUrlFrom(data)
  const asset = outputUrl
    ? await persistGeneratedVideoAsset({
        brandId: input.brandId,
        actorId: input.actorId,
        url: outputUrl,
        sourceType: 'ai_video_final',
        tags: ['AI视频', '最终成片'],
        caption: input.finalText || input.title || 'AI video final cut',
      })
    : undefined
  return {
    ok: true,
    jobId: text(data.jobId) || `assembly:${Date.now()}`,
    status: outputUrl ? 'completed' : normalizeStatus(data.status),
    provider: 'seedance',
    providerTaskIds: stringArray(data.providerTaskIds),
    outputUrl,
    asset,
    raw: data,
  }
}

async function getVideoProviderConfig(providerHint?: string): Promise<VideoProviderConfig> {
  const where = {
    isEnabled: true,
    OR: [
      { taskTags: { has: 'video_generation' } },
      { taskTags: { has: 'image_to_video' } },
      { capabilities: { has: 'video_output' } },
    ],
  }
  const configs = await prisma.lLMConfig.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
  })
  const config = configs.find((item: { provider: string }) => providerHint ? item.provider.toLowerCase() === providerHint : VIDEO_PROVIDERS.includes(item.provider.toLowerCase()))
    || configs.find((item: { provider: string }) => VIDEO_PROVIDERS.includes(item.provider.toLowerCase()))
  if (!config) throw Object.assign(new Error('Video generation provider is not configured in Admin AI model settings'), { status: 503 })
  if (!config.apiKey?.trim()) throw Object.assign(new Error(`Video provider ${config.displayName} is missing an API key`), { status: 503 })
  return {
    id: config.id,
    provider: config.provider.toLowerCase(),
    displayName: config.displayName,
    modelName: config.modelName,
    apiKey: config.apiKey,
    baseUrl: (config.baseUrl || defaultBaseUrl(config.provider)).replace(/\/+$/, ''),
    timeoutMs: config.timeoutMs || 120000,
  }
}

async function submitMiniMax(config: VideoProviderConfig, job: SeedanceJob): Promise<VideoExecution> {
  const req = job.request!
  const references = (req.references || []).map((ref) => text(ref.url)).filter(Boolean)
  const content: any[] = [{ type: 'text', text: req.prompt }]
  references.slice(0, 9).forEach((url, index) => {
    content.push({
      type: 'image_url',
      role: references.length === 1 ? 'first_frame' : 'reference_image',
      image_url: { url },
    })
  })
  const response = await fetch(`${config.baseUrl}/v2/video_generation`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.modelName || 'MiniMax-H3',
      content,
      resolution: normalizeMiniMaxResolution(req.resolution),
      duration: clampDuration(req.duration),
      ratio: references.length === 1 ? 'adaptive' : normalizeRatio(req.ratio),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || data?.message || `MiniMax video generation failed with ${response.status}`), { status: response.status })
  const taskId = text(data?.task_id || data?.taskId || data?.id)
  if (!taskId) throw Object.assign(new Error('MiniMax did not return a task id'), { status: 502 })
  return { ok: true, jobId: taskId, status: 'submitted', provider: 'minimax', providerTaskIds: [`minimax:${taskId}`], raw: data }
}

async function refreshMiniMax(config: VideoProviderConfig, taskId: string): Promise<VideoExecution> {
  const response = await fetch(`${config.baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
    headers: { authorization: `Bearer ${config.apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 60000)),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || data?.message || `MiniMax video status failed with ${response.status}`), { status: response.status })
  const task = data?.task || data
  const status = normalizeStatus(task?.status)
  const directUrl = outputUrlFrom(task)
  const fileId = text(task?.file_id || task?.fileId || task?.file?.file_id)
  const outputUrl = directUrl || (status === 'completed' && fileId ? await retrieveMiniMaxFileUrl(config, fileId) : undefined)
  return {
    ok: true,
    jobId: taskId,
    status,
    provider: 'minimax',
    providerTaskIds: [`minimax:${taskId}`],
    outputUrl,
    raw: data,
  }
}

async function retrieveMiniMaxFileUrl(config: VideoProviderConfig, fileId: string): Promise<string | undefined> {
  const response = await fetch(`${config.baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`, {
    headers: { authorization: `Bearer ${config.apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 60000)),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(new Error(data?.error?.message || data?.message || `MiniMax video file retrieval failed with ${response.status}`), { status: response.status })
  }
  return outputUrlFrom(data)
}

async function submitKieMarket(config: VideoProviderConfig, job: SeedanceJob): Promise<VideoExecution> {
  const req = job.request!
  const references = (req.references || []).map((ref) => text(ref.url)).filter(Boolean)
  const model = config.modelName || 'bytedance/seedance-2'
  const seedanceInput: Record<string, unknown> = {
    prompt: req.prompt,
    aspect_ratio: normalizeRatio(req.ratio),
    aspectRatio: normalizeRatio(req.ratio),
    duration: clampDuration(req.duration),
    generate_audio: req.generateAudio === true,
    resolution: normalizeKieResolution(req.resolution),
    web_search: false,
  }
  if (references.length === 1) {
    seedanceInput.first_frame_url = references[0]
  } else if (references.length === 2) {
    seedanceInput.first_frame_url = references[0]
    seedanceInput.last_frame_url = references[1]
  } else if (references.length > 2) {
    seedanceInput.reference_image_urls = references.slice(0, 9)
  }
  const response = await fetch(`${config.baseUrl}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      input: seedanceInput,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.error || `KIE video generation failed with ${response.status}`), { status: response.status })
  if (!isKieSuccess(data)) {
    throw Object.assign(new Error(kieErrorMessage(data)), { status: 502 })
  }
  const taskId = marketTaskId(data)
  if (!taskId) throw Object.assign(new Error(`KIE did not return a task id (${kieResponseSummary(data)})`), { status: 502 })
  const provider = config.provider === 'minimax' ? 'minimax' : config.provider === 'kieai' ? 'kieai' : 'seedance'
  return { ok: true, jobId: taskId, status: 'submitted', provider, providerTaskIds: [`${provider}:${taskId}`], raw: data }
}

async function refreshKieMarket(config: VideoProviderConfig, taskId: string): Promise<VideoExecution> {
  const response = await fetch(`${config.baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { authorization: `Bearer ${config.apiKey}`, accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 60000)),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.error || `KIE video status failed with ${response.status}`), { status: response.status })
  const record = data?.data || data
  const provider = config.provider === 'kieai' ? 'kieai' : 'seedance'
  return {
    ok: true,
    jobId: taskId,
    status: normalizeStatus(record?.status || record?.state),
    provider,
    providerTaskIds: [`${provider}:${taskId}`],
    outputUrl: outputUrlFrom(record),
    raw: data,
  }
}

async function persistGeneratedVideoAsset(input: {
  brandId: string
  actorId: string
  url: string
  sourceType: string
  tags: string[]
  caption: string
}) {
  const existing = await prisma.mediaAsset.findFirst({
    where: { brandId: input.brandId, url: input.url },
    select: { id: true, url: true, mimeType: true, filename: true },
  })
  if (existing) return existing
  return prisma.mediaAsset.create({
    data: {
      brandId: input.brandId,
      url: input.url,
      filename: input.url.split('/').pop()?.split('?')[0] || 'ai-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 0,
      aiReady: true,
      aiCategory: 'AI生视频',
      aiTags: Array.from(new Set(input.tags)),
      aiCaption: input.caption,
      sourceType: input.sourceType,
      uploadedBy: input.actorId,
    },
    select: { id: true, url: true, mimeType: true, filename: true },
  })
}

function firstVideoJob(input: SubmitVideoInput): SeedanceJob | null {
  const jobs = Array.isArray(input.seedanceJobs) && input.seedanceJobs.length
    ? input.seedanceJobs
    : Array.isArray(input.plan?.seedanceJobs) ? input.plan.seedanceJobs : []
  return jobs[0] || null
}

function parseProviderTaskId(value: string) {
  const [provider, ...rest] = value.split(':')
  if (rest.length > 0 && VIDEO_PROVIDERS.includes(provider)) return { provider, taskId: rest.join(':') }
  return { provider: undefined, taskId: value }
}

function defaultBaseUrl(provider: string) {
  if (provider.toLowerCase() === 'minimax') return 'https://api.minimax.io'
  if (provider.toLowerCase() === 'kieai' || provider.toLowerCase() === 'seedance') return 'https://api.kie.ai'
  return ''
}

function clampDuration(value: unknown) {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : 5
  return Math.max(4, Math.min(15, Math.round(parsed)))
}

function normalizeRatio(value: unknown) {
  const ratio = text(value)
  return ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'].includes(ratio) ? ratio : '9:16'
}

function normalizeMiniMaxResolution(value: unknown) {
  const resolution = text(value).toUpperCase()
  return resolution === '2K' ? '2K' : '768P'
}

function normalizeKieResolution(value: unknown) {
  const resolution = text(value).toLowerCase()
  return ['480p', '720p', '1080p'].includes(resolution) ? resolution : '720p'
}

function normalizeStatus(value: unknown): VideoExecution['status'] {
  const status = text(value).toLowerCase()
  if (['succeeded', 'success', 'completed', 'done'].includes(status)) return 'completed'
  if (['failed', 'fail', 'error', 'cancelled', 'canceled'].includes(status)) return 'failed'
  if (['running', 'generating', 'processing', 'preparing', 'queueing'].includes(status)) return 'processing'
  return status ? 'submitted' : 'queued'
}

function outputUrlFrom(value: any): string | undefined {
  return text(value?.outputUrl)
    || text(value?.output_url)
    || text(value?.url)
    || text(value?.content?.url)
    || text(value?.file?.download_url)
    || text(value?.file?.downloadUrl)
    || text(value?.download_url)
    || text(value?.downloadUrl)
    || text(value?.resultUrl)
    || text(value?.result_url)
    || text(value?.response?.resultUrls?.[0])
    || text(value?.resultUrls?.[0])
    || text(value?.result_urls?.[0])
    || text(value?.outputs?.[0]?.url)
}

function isKieSuccess(value: any): boolean {
  const code = value?.code ?? value?.statusCode
  if (code === undefined || code === null || code === '') return true
  if (typeof code === 'number') return code >= 200 && code < 300
  const textCode = text(code)
  return textCode === '200' || textCode.toLowerCase() === 'success'
}

function marketTaskId(value: any): string {
  return text(
    value?.task_id
      || value?.taskId
      || value?.id
      || value?.data?.taskId
      || value?.data?.task_id
      || value?.data?.id
      || value?.data?.task?.taskId
      || value?.data?.task?.task_id
      || value?.data?.task?.id
      || value?.result?.taskId
      || value?.result?.task_id
      || value?.result?.id
  )
}

function kieErrorMessage(value: any): string {
  return text(value?.message)
    || text(value?.msg)
    || text(value?.error?.message)
    || text(value?.error)
    || `KIE video generation was not accepted (${kieResponseSummary(value)})`
}

function kieResponseSummary(value: any): string {
  if (!value || typeof value !== 'object') return 'empty response'
  return JSON.stringify({
    code: value.code ?? value.statusCode,
    msg: value.msg ?? value.message,
    error: typeof value.error === 'string' ? value.error : value.error?.message,
    dataKeys: value.data && typeof value.data === 'object' ? Object.keys(value.data).slice(0, 8) : undefined,
    resultKeys: value.result && typeof value.result === 'object' ? Object.keys(value.result).slice(0, 8) : undefined,
  })
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
