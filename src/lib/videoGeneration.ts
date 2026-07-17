import { prisma } from '@/lib/prisma'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeBrandAssetKey, uploadHuaweiObsObject } from '@/lib/integrations/huaweiObs'

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
    resolution?: '480p' | '720p' | '1080p'
    generateAudio?: boolean
    references?: Array<{ id?: string; url: string; mimeType?: string }>
    negativePrompt?: string
  }
}

type SeedanceReference = { url: string; mimeType?: string | null }

export type VideoGenerationExecution = {
  ok: true
  jobId: string
  status: 'submitted' | 'processing' | 'completed'
  provider: string
  providerTaskIds: string[]
  outputUrl?: string
  assets?: Array<{ id: string; url: string; mimeType: string; filename?: string | null }>
}

export async function assembleVideoClips(input: {
  brandId: string
  actorId: string
  title: string
  clipUrls: string[]
  aspectRatio?: string
  scriptSummary?: string
}): Promise<VideoGenerationExecution> {
  if (input.clipUrls.length === 0) throw new Error('至少需要一个已生成分镜视频才能合成最终视频。')
  if (input.clipUrls.length === 1) throw new Error('至少需要两个分镜视频才能合成最终视频。')

  const workspace = await mkdtemp(join(tmpdir(), 'amc-video-assembly-'))
  try {
    const inputPaths: string[] = []
    for (let index = 0; index < input.clipUrls.length; index += 1) {
      const response = await fetch(input.clipUrls[index])
      if (!response.ok) throw new Error(`下载第 ${index + 1} 个分镜视频失败：HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const filePath = join(workspace, `clip-${index}.mp4`)
      await writeFile(filePath, buffer)
      inputPaths.push(filePath)
    }

    const outputPath = join(workspace, 'final.mp4')
    await runFfmpegConcat(inputPaths, outputPath, input.aspectRatio || '9:16')
    const outputBuffer = await readFile(outputPath)
    const key = makeBrandAssetKey({
      brandId: input.brandId,
      folder: 'AI生视频',
      filename: `ai-video-final-${Date.now()}.mp4`,
    })
    const upload = await uploadHuaweiObsObject({
      key,
      body: outputBuffer,
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000',
    })
    if (!upload.ok) throw new Error(upload.error || '最终视频上传素材库失败')

    const asset = await createVideoAsset({
      brandId: input.brandId,
      actorId: input.actorId,
      url: upload.url,
      filename: key.split('/').pop() || 'ai-video-final.mp4',
      caption: `AI 生视频最终成片：${input.title}${input.scriptSummary ? `\n${input.scriptSummary}` : ''}`,
      sourceAssets: [],
      videoRole: 'final',
    })

    return {
      ok: true,
      jobId: `assembly-${Date.now()}`,
      status: 'completed',
      provider: 'ffmpeg',
      providerTaskIds: [],
      outputUrl: asset.url,
      assets: [asset],
    }
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => undefined)
  }
}

type VideoProviderConfig = {
  id: string
  provider: string
  modelName: string
  apiKey: string | null
  baseUrl: string | null
}

const VIDEO_PROVIDERS = ['seedance', 'fal', 'kieai', 'volcengine']
const BYTEPLUS_ARK_BASE_URL = 'https://ark.ap-southeast.bytepluses.com'

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
      const response = await fetch(seedanceTaskUrl(baseUrl, 'amc_config_validation'), {
        headers: { authorization: `Bearer ${apiKey}` },
      })
      const json = await response.json().catch(() => null)
      if (response.status === 401 || json?.error?.code === 'invalid_api_key') {
        return { success: false, error: json?.error?.message || 'Invalid or revoked API key.' }
      }
      if (response.status === 403) {
        return { success: false, error: json?.error?.message || 'API key does not have video generation permission.' }
      }
      if (response.status === 400 || response.status === 404 || json?.error?.code === 'not_found') return { success: true }
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

export async function refreshVideoGenerationTask(input: {
  brandId: string
  actorId: string
  taskId: string
  title?: string
  assetIds?: string[]
  videoRole?: 'scene' | 'final'
}): Promise<VideoGenerationExecution> {
  const config = await getVideoProviderConfig()
  if (!config?.apiKey) {
    throw new Error('视频生成模型未配置。请在 Admin → AI 模型配置中启用 provider=seedance，taskTags=video_generation。')
  }
  if (config.provider !== 'seedance' && config.provider !== 'volcengine') {
    throw new Error(`当前视频状态查询仅支持 Seedance / BytePlus Ark。当前 provider=${config.provider}`)
  }

  const baseUrl = seedanceBaseUrl(config.baseUrl)
  const response = await fetch(seedanceTaskUrl(baseUrl, input.taskId), {
    headers: { authorization: `Bearer ${config.apiKey}` },
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(seedanceErrorMessage(json) || `Seedance task status check failed with ${response.status}`)
  }

  const status = String(json?.status || json?.data?.status || '').toLowerCase()
  const outputUrl = extractVideoUrl(json)
  if (!outputUrl) {
    if (status.includes('fail') || status.includes('cancel') || status.includes('error')) {
      throw new Error(seedanceErrorMessage(json) || `Seedance task ${input.taskId} failed`)
    }
    return {
      ok: true,
      jobId: input.taskId,
      status: 'processing',
      provider: config.provider,
      providerTaskIds: [input.taskId],
    }
  }

  const sourceAssets = input.assetIds?.length
    ? await prisma.mediaAsset.findMany({
        where: { brandId: input.brandId, id: { in: input.assetIds } },
        select: { id: true, url: true, mimeType: true, filename: true, aiTags: true, aiCaption: true, aiCategory: true },
      })
    : []
  const filenamePrefix = input.videoRole === 'final' ? 'seedance-final' : 'seedance-scene'
  const existing = await prisma.mediaAsset.findFirst({
    where: {
      brandId: input.brandId,
      OR: [
        { filename: `${filenamePrefix}-${input.taskId}.mp4` },
        { filename: `seedance-${input.taskId}.mp4` },
        { url: outputUrl },
      ],
    },
    select: { id: true, url: true, mimeType: true, filename: true },
  })
  const asset = existing || await createVideoAsset({
    brandId: input.brandId,
    actorId: input.actorId,
    url: outputUrl,
    filename: `${filenamePrefix}-${input.taskId}.mp4`,
    caption: `AI 生视频：${input.title || input.taskId}`,
    sourceAssets,
    videoRole: input.videoRole || 'scene',
  })

  return {
    ok: true,
    jobId: input.taskId,
    status: 'completed',
    provider: config.provider,
    providerTaskIds: [input.taskId],
    outputUrl: asset.url,
    assets: [asset],
  }
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

  for (const job of jobs) {
    const references = limitSeedanceReferences(resolveJobReferences(job, assets, input.imageUrls))
    const imageUrls = references.filter((ref) => isImageReference(ref)).map((ref) => ref.url)
    const isBytePlusArk = isBytePlusSeedanceBase(baseUrl)

    const response = await fetch(seedanceCreateTaskUrl(baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(isBytePlusArk
        ? buildBytePlusSeedancePayload({ config, job, references })
        : buildLegacySeedancePayload({ config, job, imageUrls })),
    })

    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(seedanceErrorMessage(json) || `Seedance task creation failed with ${response.status}`)
    }

    const taskId = String(json?.id || json?.task_id || json?.taskId || json?.data?.id || json?.data?.task_id || '')
    if (!taskId) throw new Error('Seedance provider did not return a task id')
    providerTaskIds.push(taskId)
  }

  return {
    ok: true,
    jobId: providerTaskIds[0],
    status: 'submitted',
    provider: config.provider,
    providerTaskIds,
  }
}

async function pollSeedanceGateway(baseUrl: string, apiKey: string, taskId: string): Promise<string> {
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3500))
    const response = await fetch(seedanceTaskUrl(baseUrl, taskId), {
      headers: { authorization: `Bearer ${apiKey}` },
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) continue
    const status = String(json?.status || json?.data?.status || '').toLowerCase()
    const outputUrl = extractVideoUrl(json)
    if (outputUrl) return outputUrl
    if (status.includes('fail') || status.includes('cancel') || status.includes('error')) {
      throw new Error(seedanceErrorMessage(json) || `Seedance task ${taskId} failed`)
    }
  }
  return ''
}

function seedanceBaseUrl(baseUrl: string | null): string {
  return (baseUrl || BYTEPLUS_ARK_BASE_URL)
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '')
    .replace(/\/api\/v3\/contents\/generations\/tasks$/, '')
    .replace(/\/api\/v3$/, '')
}

function normalizeSeedanceModel(modelName: string): string {
  const normalized = modelName.trim().toLowerCase()
  if (!normalized || normalized === 'seedance-2.0-fast' || normalized === 'seedance-2-0-fast' || normalized === 'seedance-2-fast') {
    return 'dreamina-seedance-2-0-fast-260128'
  }
  if (normalized === 'seedance-2-0' || normalized === 'seedance-2.0' || normalized === 'seedance-2.0-standard') {
    return 'dreamina-seedance-2-0-260128'
  }
  return modelName
}

function isBytePlusSeedanceBase(baseUrl: string): boolean {
  return baseUrl.includes('bytepluses.com') || baseUrl.includes('byteplus.com') || baseUrl.includes('/api/v3')
}

function seedanceCreateTaskUrl(baseUrl: string): string {
  if (isBytePlusSeedanceBase(baseUrl)) return `${baseUrl}/api/v3/contents/generations/tasks`
  return `${baseUrl}/v1/videos/generations`
}

function seedanceTaskUrl(baseUrl: string, taskId: string): string {
  if (isBytePlusSeedanceBase(baseUrl)) return `${baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`
  return `${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`
}

function buildBytePlusSeedancePayload(input: {
  config: VideoProviderConfig
  job: SeedanceJob
  references: SeedanceReference[]
}) {
  const { config, job, references } = input
  const content: any[] = [
    { type: 'text', text: job.request.prompt },
    ...references.flatMap((ref) => bytePlusReferenceContent(ref)).slice(0, 15),
  ]
  return {
    model: normalizeSeedanceModel(config.modelName || job.modelHint || 'dreamina-seedance-2-0-fast-260128'),
    content,
    resolution: job.request.resolution || '480p',
    ratio: job.request.ratio || '9:16',
    duration: clampSeedanceDuration(job.request.duration || 5),
    watermark: false,
    generate_audio: Boolean(job.request.generateAudio),
  }
}

function bytePlusReferenceContent(ref: SeedanceReference): any[] {
  if (isVideoReference(ref)) {
    return [{ type: 'video_url', video_url: { url: ref.url }, role: 'reference_video' }]
  }
  if (isAudioReference(ref)) {
    return [{ type: 'audio_url', audio_url: { url: ref.url }, role: 'reference_audio' }]
  }
  return [{ type: 'image_url', image_url: { url: ref.url }, role: 'reference_image' }]
}

function buildLegacySeedancePayload(input: {
  config: VideoProviderConfig
  job: SeedanceJob
  imageUrls: string[]
}) {
  const { config, job, imageUrls } = input
  const generationType = job.mode === 'reference_to_video'
    ? 'reference-to-video'
    : job.mode === 'image_to_video'
    ? 'image-to-video'
    : 'text-to-video'
  return {
    model: config.modelName || job.modelHint || 'seedance-2.0-fast',
    input: {
      prompt: job.request.prompt,
      generation_type: generationType,
      image_urls: imageUrls,
      duration: job.request.duration || 5,
      aspect_ratio: job.request.ratio || '9:16',
      negative_prompt: job.request.negativePrompt,
    },
  }
}

function clampSeedanceDuration(duration: number): number {
  if (!Number.isFinite(duration)) return 5
  return Math.max(4, Math.min(15, Math.round(duration)))
}

function targetVideoSize(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '16:9') return { width: 1280, height: 720 }
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 }
  if (aspectRatio === '4:5') return { width: 864, height: 1080 }
  return { width: 720, height: 1280 }
}

async function runFfmpegConcat(inputPaths: string[], outputPath: string, aspectRatio: string) {
  const { width, height } = targetVideoSize(aspectRatio)
  const inputArgs = inputPaths.flatMap((path) => ['-i', path])
  const filters = inputPaths.map((_, index) =>
    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${index}]`,
  )
  const concatInputs = inputPaths.map((_, index) => `[v${index}]`).join('')
  const filterComplex = `${filters.join(';')};${concatInputs}concat=n=${inputPaths.length}:v=1:a=0[v]`
  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ]

  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk).slice(-4000)
    })
    child.on('error', (error: any) => {
      reject(new Error(error?.code === 'ENOENT' ? '服务器未安装 ffmpeg，无法按分镜顺序拼接最终视频。' : error?.message || 'ffmpeg failed'))
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`))
    })
  })
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
  videoRole?: 'scene' | 'final'
}) {
  const tags = Array.from(new Set([
    ...input.sourceAssets.flatMap((asset) => asset.aiTags || []),
    'AI视频',
    'Seedance',
    input.videoRole === 'final' ? '最终成片' : '分镜视频',
  ]))
  const asset = await prisma.mediaAsset.create({
    data: {
      brandId: input.brandId,
      url: input.url,
      filename: input.filename,
      mimeType: 'video/mp4',
      aiReady: true,
      aiCategory: 'AI生视频',
      aiTags: tags,
      aiCaption: input.caption,
      sourceType: 'ai_video',
      uploadedBy: input.actorId,
    },
  })
  return { id: asset.id, url: asset.url, mimeType: asset.mimeType, filename: asset.filename }
}

function resolveJobImageUrls(job: SeedanceJob, assets: VideoAsset[], imageUrls?: string[]): string[] {
  return resolveJobReferences(job, assets, imageUrls)
    .filter((ref) => isImageReference(ref))
    .map((ref) => ref.url)
    .slice(0, 9)
}

function resolveJobReferences(job: SeedanceJob, assets: VideoAsset[], imageUrls?: string[]): SeedanceReference[] {
  const refs = job.request.references || []
  if (refs.length) {
    return dedupeReferences(refs.map((ref) => ({ url: ref.url, mimeType: ref.mimeType }))).slice(0, 15)
  }
  const directImageRefs = (imageUrls || []).map((url) => ({ url, mimeType: 'image/*' }))
  const assetRefs = assets
    .filter((asset) => asset.mimeType?.startsWith('image/') || asset.mimeType?.startsWith('video/') || asset.mimeType?.startsWith('audio/'))
    .map((asset) => ({ url: asset.url, mimeType: asset.mimeType }))
  return dedupeReferences([...directImageRefs, ...assetRefs]).slice(0, 15)
}

function dedupeReferences(refs: SeedanceReference[]): SeedanceReference[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    if (!ref.url || seen.has(ref.url)) return false
    seen.add(ref.url)
    return true
  })
}

function limitSeedanceReferences(refs: SeedanceReference[]): SeedanceReference[] {
  const images: SeedanceReference[] = []
  const videos: SeedanceReference[] = []
  const audios: SeedanceReference[] = []
  const others: SeedanceReference[] = []
  for (const ref of refs) {
    if (isVideoReference(ref)) videos.push(ref)
    else if (isAudioReference(ref)) audios.push(ref)
    else if (isImageReference(ref)) images.push(ref)
    else others.push(ref)
  }
  return [
    ...images.slice(0, 4),
    ...videos.slice(0, 1),
    ...audios.slice(0, 1),
    ...others.slice(0, 2),
  ]
}

function isImageReference(ref: SeedanceReference): boolean {
  return !ref.mimeType || ref.mimeType.startsWith('image/') || ref.mimeType === 'image/*'
}

function isVideoReference(ref: SeedanceReference): boolean {
  return Boolean(ref.mimeType?.startsWith('video/'))
}

function isAudioReference(ref: SeedanceReference): boolean {
  return Boolean(ref.mimeType?.startsWith('audio/'))
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
    json?.content?.video_url,
    json?.content?.video_url?.url,
    json?.content?.[0]?.video_url,
    json?.content?.[0]?.video_url?.url,
    json?.output?.video_url,
    json?.output?.url,
    json?.output?.content?.video_url,
    json?.output?.content?.[0]?.video_url,
    json?.output?.content?.[0]?.video_url?.url,
    json?.video_url,
    json?.url,
    json?.data?.output?.video_url,
    json?.data?.output?.url,
    json?.data?.content?.video_url,
    json?.data?.content?.video_url?.url,
    json?.data?.content?.[0]?.video_url,
    json?.data?.content?.[0]?.video_url?.url,
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

function seedanceErrorMessage(json: any): string {
  return String(
    json?.error?.message ||
    json?.error?.code ||
    json?.message ||
    json?.code ||
    json?.error ||
    '',
  )
}
