import { open, readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import mediaInfoFactory, {
  type AudioTrack,
  type GeneralTrack,
  type MediaInfo,
  type MediaInfoResult,
  type VideoTrack,
} from 'mediainfo.js'
import sharp from 'sharp'

export const MEDIA_UPLOAD_LIMITS = {
  imageBytes: 10_000_000,
  videoBytes: 250_000_000,
} as const

const UPLOAD_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const UPLOAD_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm'])
const MEDIAINFO_POOL_SIZE = 3
const MEDIAINFO_QUEUE_TIMEOUT_MS = 3_000
const MEDIAINFO_ANALYSIS_TIMEOUT_MS = 15_000
const MEDIA_INSPECTION_TOTAL_TIMEOUT_MS = 20_000
const HTTP_REQUEST_TIMEOUT_MS = 5_000
const HTTP_FULL_FALLBACK_LIMIT = 32_000_000
const MEDIAINFO_CHUNK_SIZE = 512 * 1024

export type MediaKind = 'image' | 'video'

export type MediaTechnicalMetadata = {
  kind: MediaKind
  mimeType: string
  sizeBytes: number
  width?: number
  height?: number
  format?: string
  container?: string
  videoCodec?: string
  audioCodec?: string
  frameRate?: number
  durationSeconds?: number
  videoBitrate?: number
  audioSampleRate?: number
}

export type MediaValidationIssue = {
  assetId?: string
  filename: string
  platform?: string
  severity?: 'error' | 'warning'
  field: string
  actual: string | number | null
  limit: string | number
  message: string
}

export function blockingMediaIssues(issues: MediaValidationIssue[]) {
  return issues.filter((issue) => issue.severity !== 'warning')
}

export function mediaValidationWarnings(issues: MediaValidationIssue[]) {
  return issues.filter((issue) => issue.severity === 'warning')
}

export class MediaValidationError extends Error {
  readonly code = 'MEDIA_VALIDATION_FAILED'
  readonly issues: MediaValidationIssue[]

  constructor(issues: MediaValidationIssue[]) {
    super('素材不符合发布要求')
    this.name = 'MediaValidationError'
    this.issues = issues
  }
}

export class MediaInspectionUnavailableError extends Error {
  readonly code = 'MEDIA_INSPECTION_UNAVAILABLE'
  readonly status = 503

  constructor(message = '媒体检测服务暂时不可用，请稍后重试') {
    super(message)
    this.name = 'MediaInspectionUnavailableError'
  }
}

type MediaByteSource = {
  sizeBytes: number
  sourceType: 'buffer' | 'file' | 'http'
  readChunk: (size: number, offset: number, deadlineAt: number) => Promise<Uint8Array> | Uint8Array
  close?: () => Promise<void>
}

type PoolWaiter = {
  resolve: (instance: MediaInfo<'object'>) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let mediaInfoPoolPromise: Promise<void> | null = null
const idleMediaInfoInstances: Array<MediaInfo<'object'>> = []
const mediaInfoWaiters: PoolWaiter[] = []

function normalizeMimeType(value?: string | null) {
  return String(value ?? '').split(';')[0].trim().toLowerCase()
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function imageMime(format?: string) {
  if (format === 'jpeg' || format === 'jpg') return 'image/jpeg'
  if (format === 'png') return 'image/png'
  if (format === 'gif') return 'image/gif'
  if (format === 'webp') return 'image/webp'
  return ''
}

export function normalizeVideoCodec(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized.includes('avc') || normalized === 'h.264' || normalized === 'h264') return 'h264'
  if (normalized.includes('hevc') || ['h.265', 'h265', 'hvc1', 'hev1'].includes(normalized)) return 'hevc'
  if (normalized.includes('vp8')) return 'vp8'
  if (normalized.includes('vp9')) return 'vp9'
  return normalized || undefined
}

function normalizeAudioCodec(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized.includes('aac') || normalized.includes('mp4a')) return 'aac'
  return normalized || undefined
}

function videoMime(container: string, hint?: string | null) {
  const normalizedContainer = container.toLowerCase()
  const normalizedHint = normalizeMimeType(hint)
  const extension = extname(String(hint ?? '')).toLowerCase()
  if (normalizedContainer.includes('webm')) return 'video/webm'
  if (normalizedContainer.includes('quicktime') || extension === '.mov' || normalizedHint === 'video/quicktime') {
    return 'video/quicktime'
  }
  if (normalizedContainer.includes('mpeg-4') || normalizedContainer.includes('mp4')) return 'video/mp4'
  return normalizedHint
}

function looksLikeVideo(filename?: string | null, mimeType?: string | null) {
  return normalizeMimeType(mimeType).startsWith('video/') ||
    VIDEO_EXTENSIONS.has(extname(String(filename ?? '')).toLowerCase())
}

function sizeIssue(filename: string, actual: number, limit: number) {
  return new MediaValidationError([{
    filename,
    field: 'sizeBytes',
    actual,
    limit,
    message: `文件大小超过上传上限 ${Math.round(limit / 1_000_000)} MB`,
  }])
}

function invalidFileIssue(filename: string, mimeType?: string | null) {
  return new MediaValidationError([{
    filename,
    field: 'file',
    actual: normalizeMimeType(mimeType) || 'unknown',
    limit: 'JPEG/PNG/GIF/WebP or MP4/MOV/WebM',
    message: '无法识别媒体文件，文件可能损坏或格式不受支持',
  }])
}

function ensureDeadline(deadlineAt: number) {
  if (Date.now() >= deadlineAt) {
    throw new MediaInspectionUnavailableError('媒体检测超时，请稍后重试')
  }
}

function fetchTimeout(deadlineAt?: number) {
  const remaining = deadlineAt === undefined
    ? HTTP_REQUEST_TIMEOUT_MS
    : Math.min(HTTP_REQUEST_TIMEOUT_MS, Math.max(1, deadlineAt - Date.now()))
  return AbortSignal.timeout(remaining)
}

async function initializeMediaInfoPool() {
  if (!mediaInfoPoolPromise) {
    mediaInfoPoolPromise = Promise.all(Array.from({ length: MEDIAINFO_POOL_SIZE }, () => (
      mediaInfoFactory({ chunkSize: MEDIAINFO_CHUNK_SIZE, format: 'object' })
    ))).then((instances) => {
      idleMediaInfoInstances.push(...instances)
    }).catch((error) => {
      mediaInfoPoolPromise = null
      throw error
    })
  }
  await mediaInfoPoolPromise
}

async function acquireMediaInfo(deadlineAt = Date.now() + MEDIA_INSPECTION_TOTAL_TIMEOUT_MS) {
  try {
    await initializeMediaInfoPool()
  } catch {
    throw new MediaInspectionUnavailableError('媒体检测组件初始化失败，请稍后重试')
  }
  ensureDeadline(deadlineAt)
  const available = idleMediaInfoInstances.shift()
  if (available) return available

  return new Promise<MediaInfo<'object'>>((resolve, reject) => {
    const waitMs = Math.min(MEDIAINFO_QUEUE_TIMEOUT_MS, Math.max(1, deadlineAt - Date.now()))
    const waiter: PoolWaiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = mediaInfoWaiters.indexOf(waiter)
        if (index >= 0) mediaInfoWaiters.splice(index, 1)
        reject(new MediaInspectionUnavailableError('媒体检测任务繁忙，请稍后重试'))
      }, waitMs),
    }
    mediaInfoWaiters.push(waiter)
  })
}

function releaseMediaInfo(instance: MediaInfo<'object'>) {
  instance.reset()
  const waiter = mediaInfoWaiters.shift()
  if (waiter) {
    clearTimeout(waiter.timer)
    waiter.resolve(instance)
  } else {
    idleMediaInfoInstances.push(instance)
  }
}

function metadataFromMediaInfo(result: MediaInfoResult, input: {
  filename: string
  mimeType?: string | null
  sizeBytes: number
}): MediaTechnicalMetadata {
  const tracks = result.media?.track ?? []
  const general = tracks.find((track) => track['@type'] === 'General') as GeneralTrack | undefined
  const video = tracks.find((track) => track['@type'] === 'Video') as VideoTrack | undefined
  if (!video) throw invalidFileIssue(input.filename, input.mimeType)
  const audio = tracks.find((track) => track['@type'] === 'Audio') as AudioTrack | undefined
  const container = String(general?.Format ?? '')
  const codecHint = String(video.CodecID ?? video.Format ?? '')
  const audioHint = String(audio?.CodecID ?? audio?.Format ?? '')

  return {
    kind: 'video',
    mimeType: videoMime(container, input.mimeType || input.filename),
    sizeBytes: input.sizeBytes,
    width: numberValue(video.Width),
    height: numberValue(video.Height),
    container,
    videoCodec: normalizeVideoCodec(codecHint),
    audioCodec: normalizeAudioCodec(audioHint),
    frameRate: numberValue(video.FrameRate),
    durationSeconds: numberValue(video.Duration) ?? numberValue(general?.Duration),
    videoBitrate: numberValue(video.BitRate) ?? numberValue(general?.OverallBitRate),
    audioSampleRate: numberValue(audio?.SamplingRate),
  }
}

async function inspectVideoSource(source: MediaByteSource, input: {
  filename: string
  mimeType?: string | null
}, overallDeadlineAt = Date.now() + MEDIA_INSPECTION_TOTAL_TIMEOUT_MS): Promise<MediaTechnicalMetadata> {
  if (source.sizeBytes > MEDIA_UPLOAD_LIMITS.videoBytes) {
    throw sizeIssue(input.filename, source.sizeBytes, MEDIA_UPLOAD_LIMITS.videoBytes)
  }
  const startedAt = Date.now()
  const instance = await acquireMediaInfo(overallDeadlineAt)
  const deadlineAt = Math.min(Date.now() + MEDIAINFO_ANALYSIS_TIMEOUT_MS, overallDeadlineAt)
  try {
    ensureDeadline(deadlineAt)
    const result = await instance.analyzeData(
      source.sizeBytes,
      (size, offset) => {
        ensureDeadline(deadlineAt)
        return source.readChunk(size, offset, deadlineAt)
      },
    )
    const metadata = metadataFromMediaInfo(result, {
      ...input,
      sizeBytes: source.sizeBytes,
    })
    console.info('[media-validation] inspection complete', {
      source: source.sourceType,
      kind: metadata.kind,
      elapsedMs: Date.now() - startedAt,
    })
    return metadata
  } catch (error) {
    console.warn('[media-validation] inspection failed', {
      source: source.sourceType,
      field: error instanceof MediaInspectionUnavailableError ? 'availability' : 'file',
      elapsedMs: Date.now() - startedAt,
    })
    if (error instanceof MediaValidationError || error instanceof MediaInspectionUnavailableError) throw error
    throw invalidFileIssue(input.filename, input.mimeType)
  } finally {
    releaseMediaInfo(instance)
    await source.close?.()
  }
}

function bufferSource(buffer: Buffer): MediaByteSource {
  return {
    sizeBytes: buffer.length,
    sourceType: 'buffer',
    readChunk: (size, offset, deadlineAt) => {
      ensureDeadline(deadlineAt)
      return buffer.subarray(offset, Math.min(offset + size, buffer.length))
    },
  }
}

async function fileSource(filePath: string): Promise<MediaByteSource> {
  const file = await open(filePath, 'r')
  const details = await file.stat()
  return {
    sizeBytes: details.size,
    sourceType: 'file',
    readChunk: async (size, offset, deadlineAt) => {
      ensureDeadline(deadlineAt)
      const chunk = Buffer.allocUnsafe(Math.min(size, Math.max(0, details.size - offset)))
      const { bytesRead } = await file.read(chunk, 0, chunk.length, offset)
      ensureDeadline(deadlineAt)
      return chunk.subarray(0, bytesRead)
    },
    close: () => file.close(),
  }
}

function parseContentRangeSize(value: string | null) {
  const match = value?.match(/\/(\d+)$/)
  return match ? numberValue(match[1]) : undefined
}

async function getRemoteSize(url: string, deadlineAt = Date.now() + MEDIA_INSPECTION_TOTAL_TIMEOUT_MS) {
  try {
    const head = await fetch(url, { method: 'HEAD', signal: fetchTimeout(deadlineAt) })
    const size = numberValue(head.headers.get('content-length'))
    if (head.ok && size !== undefined) return size
  } catch {
    // Some object stores do not support HEAD. Confirm with a one-byte range request.
  }

  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal: fetchTimeout(deadlineAt),
    })
    const size = parseContentRangeSize(response.headers.get('content-range')) ??
      numberValue(response.headers.get('content-length'))
    await response.body?.cancel()
    if (response.ok && size !== undefined) return size
  } catch {
    // Converted below to a stable availability error without logging the signed URL.
  }
  throw new MediaInspectionUnavailableError('无法确认远程媒体大小，请稍后重试或重新上传')
}

async function httpSource(url: string, knownSize?: number, deadlineAt?: number): Promise<MediaByteSource> {
  const sizeBytes = knownSize ?? await getRemoteSize(url, deadlineAt)
  let fullBuffer: Buffer | null = null
  return {
    sizeBytes,
    sourceType: 'http',
    readChunk: async (size, offset, deadlineAt) => {
      ensureDeadline(deadlineAt)
      if (fullBuffer) return fullBuffer.subarray(offset, Math.min(offset + size, fullBuffer.length))
      let response: Response
      try {
        response = await fetch(url, {
          headers: { Range: `bytes=${offset}-${Math.min(sizeBytes - 1, offset + size - 1)}` },
          signal: fetchTimeout(deadlineAt),
        })
      } catch {
        throw new MediaInspectionUnavailableError('远程媒体读取超时，请稍后重试')
      }
      if (response.status === 206) {
        return new Uint8Array(await response.arrayBuffer())
      }
      if (response.ok && sizeBytes <= HTTP_FULL_FALLBACK_LIMIT) {
        fullBuffer = Buffer.from(await response.arrayBuffer())
        return fullBuffer.subarray(offset, Math.min(offset + size, fullBuffer.length))
      }
      await response.body?.cancel()
      if (response.ok) {
        throw new MediaValidationError([{
          filename: 'remote-media',
          field: 'rangeSupport',
          actual: response.status,
          limit: `HTTP 206 or file <= ${HTTP_FULL_FALLBACK_LIMIT}`,
          message: '远程视频不支持分块读取，请重新上传素材',
        }])
      }
      throw new MediaValidationError([{
        filename: 'remote-media',
        field: 'url',
        actual: response.status,
        limit: 'HTTP 200/206',
        message: '素材源文件不可访问，请重新上传',
      }])
    },
  }
}

async function responseBufferWithLimit(response: Response, maxBytes: number, filename: string) {
  const declared = numberValue(response.headers.get('content-length'))
  if (declared !== undefined && declared > maxBytes) throw sizeIssue(filename, declared, maxBytes)
  const reader = response.body?.getReader()
  if (!reader) return Buffer.from(await response.arrayBuffer())
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw sizeIssue(filename, total, maxBytes)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

export async function inspectMediaBuffer(buffer: Buffer, input: {
  filename?: string | null
  mimeType?: string | null
  deadlineAt?: number
  enforceUploadLimits?: boolean
}): Promise<MediaTechnicalMetadata> {
  const deadlineAt = input.deadlineAt ?? Date.now() + MEDIA_INSPECTION_TOTAL_TIMEOUT_MS
  ensureDeadline(deadlineAt)
  const filename = input.filename || 'unknown'
  if (buffer.length > MEDIA_UPLOAD_LIMITS.videoBytes) {
    throw sizeIssue(filename, buffer.length, MEDIA_UPLOAD_LIMITS.videoBytes)
  }
  try {
    const metadata = await sharp(buffer, { animated: true }).metadata()
    ensureDeadline(deadlineAt)
    const mimeType = imageMime(metadata.format)
    if (mimeType) {
      if (input.enforceUploadLimits !== false && buffer.length > MEDIA_UPLOAD_LIMITS.imageBytes) {
        throw sizeIssue(filename, buffer.length, MEDIA_UPLOAD_LIMITS.imageBytes)
      }
      return {
        kind: 'image',
        mimeType,
        sizeBytes: buffer.length,
        width: metadata.width,
        height: metadata.pageHeight ?? metadata.height,
        format: metadata.format,
      }
    }
  } catch (error) {
    if (error instanceof MediaValidationError) throw error
  }
  return inspectVideoSource(bufferSource(buffer), {
    filename,
    mimeType: input.mimeType,
  }, deadlineAt)
}

export async function inspectMediaFile(filePath: string, input: {
  filename?: string | null
  mimeType?: string | null
  deadlineAt?: number
  enforceUploadLimits?: boolean
} = {}): Promise<MediaTechnicalMetadata> {
  const deadlineAt = input.deadlineAt ?? Date.now() + MEDIA_INSPECTION_TOTAL_TIMEOUT_MS
  ensureDeadline(deadlineAt)
  const filename = input.filename || basename(filePath)
  const details = await stat(filePath)
  if (details.size > MEDIA_UPLOAD_LIMITS.videoBytes) {
    throw sizeIssue(filename, details.size, MEDIA_UPLOAD_LIMITS.videoBytes)
  }
  try {
    const metadata = await sharp(filePath, { animated: true }).metadata()
    ensureDeadline(deadlineAt)
    const mimeType = imageMime(metadata.format)
    if (mimeType) {
      if (input.enforceUploadLimits !== false && details.size > MEDIA_UPLOAD_LIMITS.imageBytes) {
        throw sizeIssue(filename, details.size, MEDIA_UPLOAD_LIMITS.imageBytes)
      }
      return {
        kind: 'image',
        mimeType,
        sizeBytes: details.size,
        width: metadata.width,
        height: metadata.pageHeight ?? metadata.height,
        format: metadata.format,
      }
    }
  } catch (error) {
    if (error instanceof MediaValidationError) throw error
  }
  return inspectVideoSource(await fileSource(filePath), {
    filename,
    mimeType: input.mimeType,
  }, deadlineAt)
}

export async function inspectMediaUrl(url: string, input: {
  filename?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  deadlineAt?: number
  enforceUploadLimits?: boolean
} = {}): Promise<MediaTechnicalMetadata> {
  const deadlineAt = input.deadlineAt ?? Date.now() + MEDIA_INSPECTION_TOTAL_TIMEOUT_MS
  ensureDeadline(deadlineAt)
  const filename = input.filename || decodeURIComponent(basename(new URL(url).pathname)) || 'unknown'
  const hintedVideo = looksLikeVideo(filename, input.mimeType)
  // Client/database size is only a hint. The source response is authoritative.
  const knownSize = await getRemoteSize(url, deadlineAt)

  if (hintedVideo || (input.enforceUploadLimits !== false && knownSize > MEDIA_UPLOAD_LIMITS.imageBytes)) {
    try {
      return await inspectVideoSource(await httpSource(url, knownSize, deadlineAt), {
        filename,
        mimeType: input.mimeType,
      }, deadlineAt)
    } catch (error) {
      if (error instanceof MediaInspectionUnavailableError) throw error
      if (hintedVideo) throw error
      if (input.enforceUploadLimits !== false && knownSize > MEDIA_UPLOAD_LIMITS.imageBytes) {
        throw sizeIssue(filename, knownSize, MEDIA_UPLOAD_LIMITS.imageBytes)
      }
    }
  }

  let response: Response
  try {
    response = await fetch(url, { signal: fetchTimeout(deadlineAt) })
  } catch {
    throw new MediaInspectionUnavailableError('远程媒体读取超时，请稍后重试')
  }
  if (!response.ok) {
    throw new MediaValidationError([{
      filename,
      field: 'url',
      actual: response.status,
      limit: 'HTTP 200',
      message: '素材源文件不可访问，请重新上传',
    }])
  }
  const mimeType = normalizeMimeType(input.mimeType) || normalizeMimeType(response.headers.get('content-type'))
  const inspectionLimit = input.enforceUploadLimits === false
    ? MEDIA_UPLOAD_LIMITS.videoBytes
    : MEDIA_UPLOAD_LIMITS.imageBytes
  const buffer = await responseBufferWithLimit(response, inspectionLimit, filename)
  return inspectMediaBuffer(buffer, {
    filename,
    mimeType,
    deadlineAt,
    enforceUploadLimits: input.enforceUploadLimits,
  })
}

export function validateUploadMedia(metadata: MediaTechnicalMetadata, input: {
  filename?: string | null
  assetId?: string
} = {}): MediaValidationIssue[] {
  const filename = input.filename || 'unknown'
  const issues: MediaValidationIssue[] = []
  const allowed = metadata.kind === 'image' ? UPLOAD_IMAGE_MIMES : UPLOAD_VIDEO_MIMES
  const maxBytes = metadata.kind === 'image' ? MEDIA_UPLOAD_LIMITS.imageBytes : MEDIA_UPLOAD_LIMITS.videoBytes
  if (!allowed.has(metadata.mimeType)) {
    issues.push({
      assetId: input.assetId,
      filename,
      field: 'mimeType',
      actual: metadata.mimeType || 'unknown',
      limit: metadata.kind === 'image' ? 'image/jpeg, image/png, image/gif, image/webp' : 'video/mp4, video/quicktime, video/webm',
      message: '媒体格式不受支持',
    })
  }
  if (metadata.sizeBytes > maxBytes) {
    issues.push({
      assetId: input.assetId,
      filename,
      field: 'sizeBytes',
      actual: metadata.sizeBytes,
      limit: maxBytes,
      message: `文件大小超过上传上限 ${Math.round(maxBytes / 1_000_000)} MB`,
    })
  }
  return issues
}

export function assertUploadMedia(metadata: MediaTechnicalMetadata, input: {
  filename?: string | null
  assetId?: string
} = {}) {
  const issues = validateUploadMedia(metadata, input)
  if (issues.length > 0) throw new MediaValidationError(issues)
}

export function validatePlatformMedia(platform: string, media: Array<{
  filename?: string | null
  assetId?: string
  metadata: MediaTechnicalMetadata
}>): MediaValidationIssue[] {
  const normalized = platform.trim().toLowerCase()
  const uploadIssues = media.flatMap((item) => validateUploadMedia(item.metadata, {
    filename: item.filename,
    assetId: item.assetId,
  })
    .filter((issue) => !(normalized === 'instagram' && item.metadata.kind === 'image' && issue.field === 'sizeBytes'))
    .map((issue) => {
      const oversizedHistoricalImage = item.metadata.kind === 'image' && issue.field === 'sizeBytes'
      return {
        ...issue,
        platform: normalized || undefined,
        severity: oversizedHistoricalImage ? 'warning' as const : issue.severity,
        message: oversizedHistoricalImage
          ? '图片超过当前上传建议值 10 MB，仍将继续提交'
          : issue.message,
      }
    }))
  if (['google', 'google_business', 'google_business_profile', 'gbp'].includes(normalized)) {
    const googleIssues: MediaValidationIssue[] = [...uploadIssues]
    if (media.length > 1) {
      googleIssues.push(...media.map((item) => ({
        assetId: item.assetId,
        filename: item.filename || 'unknown',
        platform: 'google',
        field: 'mediaCount',
        actual: media.length,
        limit: 1,
        message: 'Google Business 每篇帖子只能发布一张图片',
      })))
    }
    for (const item of media) {
      if (item.metadata.kind === 'video') {
        googleIssues.push({
          assetId: item.assetId,
          filename: item.filename || 'unknown',
          platform: 'google',
          field: 'mediaType',
          actual: 'video',
          limit: 'image/jpeg or image/png',
          message: 'Google Business 帖子不支持视频素材',
        })
      }
    }
    return googleIssues
  }
  if (!['instagram', 'tiktok'].includes(normalized)) return uploadIssues
  if (media.length === 0) {
    return [{
      filename: 'draft',
      platform: normalized,
      field: 'mediaCount',
      actual: 0,
      limit: '1-10 images or exactly 1 video',
      message: '该平台发布必须包含图片或视频',
    }]
  }

  const issues: MediaValidationIssue[] = [...uploadIssues]
  const imageCount = media.filter((item) => item.metadata.kind === 'image').length
  const videoCount = media.length - imageCount
  const add = (
    item: typeof media[number],
    field: string,
    actual: string | number | null,
    limit: string | number,
    message: string,
    severity: 'error' | 'warning' = 'error',
  ) => {
    issues.push({
      assetId: item.assetId,
      filename: item.filename || 'unknown',
      platform: normalized,
      severity,
      field,
      actual,
      limit,
      message,
    })
  }

  if (imageCount > 0 && videoCount > 0) {
    for (const item of media) add(item, 'mediaMix', `${imageCount} image(s), ${videoCount} video(s)`, 'images only or one video', '该平台不支持图片与视频混合发布')
    return issues
  }

  if (imageCount > 0 && (imageCount < 1 || imageCount > 10)) {
    for (const item of media) add(item, 'mediaCount', imageCount, '1-10 images', '图片数量必须为 1 至 10 张')
  }
  if (videoCount > 0 && (videoCount !== 1 || media.length !== 1)) {
    for (const item of media) add(item, 'mediaCount', videoCount, 'exactly 1 video', '视频发布必须且只能包含一个视频')
  }

  for (const item of media) {
    const metadata = item.metadata
    if (normalized === 'instagram' && metadata.kind === 'image') {
      if (metadata.mimeType !== 'image/jpeg') add(item, 'mimeType', metadata.mimeType, 'image/jpeg', 'Instagram 建议使用 JPEG 图片，仍将继续提交', 'warning')
      if (metadata.sizeBytes > 8_000_000) add(item, 'sizeBytes', metadata.sizeBytes, 8_000_000, 'Instagram 建议图片不超过 8 MB，仍将继续提交', 'warning')
      if (!metadata.width || metadata.width < 320 || metadata.width > 1440) add(item, 'width', metadata.width ?? null, '320-1440 px', 'Instagram 图片宽度超出建议范围，仍将继续提交', 'warning')
      if (metadata.width && metadata.height) {
        const ratio = metadata.width / metadata.height
        if (ratio < 0.8 || ratio > 1.91) add(item, 'aspectRatio', Number(ratio.toFixed(4)), '0.8-1.91', 'Instagram 图片比例超出建议范围，仍将继续提交', 'warning')
      }
    }

    if (normalized === 'tiktok' && metadata.kind === 'image') {
      if (!['image/jpeg', 'image/webp'].includes(metadata.mimeType)) add(item, 'mimeType', metadata.mimeType, 'image/jpeg or image/webp', 'TikTok 建议使用 JPEG 或 WebP 图片，仍将继续提交', 'warning')
      if (metadata.width && metadata.height) {
        const shortSide = Math.min(metadata.width, metadata.height)
        const longSide = Math.max(metadata.width, metadata.height)
        if (shortSide > 1080 || longSide > 1920) add(item, 'dimensions', `${metadata.width}x${metadata.height}`, 'short side <=1080 and long side <=1920', 'TikTok 图片尺寸超出建议范围，仍将继续提交', 'warning')
      }
    }

    if (metadata.kind === 'video') {
      const isInstagram = normalized === 'instagram'
      const codecs = isInstagram ? ['h264', 'hevc'] : ['h264', 'hevc', 'vp8', 'vp9']
      const mimes = isInstagram ? ['video/mp4', 'video/quicktime'] : ['video/mp4', 'video/quicktime', 'video/webm']
      if (!mimes.includes(metadata.mimeType)) add(item, 'mimeType', metadata.mimeType, mimes.join(', '), `${isInstagram ? 'Instagram' : 'TikTok'} 可能不支持该视频容器格式`, 'warning')
      if (!metadata.videoCodec || !codecs.includes(metadata.videoCodec)) add(item, 'videoCodec', metadata.videoCodec ?? null, codecs.join(', '), '平台可能不支持该视频编码', 'warning')
      if (metadata.frameRate === undefined || metadata.frameRate < 23 || metadata.frameRate > 60) add(item, 'frameRate', metadata.frameRate ?? null, '23-60 fps', '视频帧率超出平台建议范围，仍将继续提交', 'warning')
      if (isInstagram) {
        if (metadata.audioCodec && metadata.audioCodec !== 'aac') add(item, 'audioCodec', metadata.audioCodec, 'aac', 'Instagram 建议使用 AAC 音频，仍将继续提交', 'warning')
        if (metadata.durationSeconds === undefined || metadata.durationSeconds < 3 || metadata.durationSeconds > 900) add(item, 'durationSeconds', metadata.durationSeconds ?? null, '3-900 seconds', 'Instagram 视频时长超出建议范围，仍将继续提交', 'warning')
        if ((metadata.width ?? 0) > 1920) add(item, 'dimensions', `${metadata.width ?? '?'}x${metadata.height ?? '?'}`, 'width <=1920 px', 'Instagram 视频宽度超过建议值，仍将继续提交', 'warning')
        if ((metadata.videoBitrate ?? 0) > 25_000_000) add(item, 'videoBitrate', metadata.videoBitrate ?? null, 25_000_000, 'Instagram 视频码率超过建议值，仍将继续提交', 'warning')
        if ((metadata.audioSampleRate ?? 0) > 48_000) add(item, 'audioSampleRate', metadata.audioSampleRate ?? null, 48_000, 'Instagram 音频采样率超过建议值，仍将继续提交', 'warning')
      } else {
        if (metadata.durationSeconds === undefined || metadata.durationSeconds > 600) add(item, 'durationSeconds', metadata.durationSeconds ?? null, '<=600 seconds', 'TikTok 视频时长超出建议范围，仍将继续提交', 'warning')
        if (!metadata.width || !metadata.height || metadata.width < 360 || metadata.width > 4096 || metadata.height < 360 || metadata.height > 4096) {
          add(item, 'dimensions', `${metadata.width ?? '?'}x${metadata.height ?? '?'}`, 'each side 360-4096 px', 'TikTok 视频尺寸超出建议范围，仍将继续提交', 'warning')
        }
      }
    }
  }
  return issues
}

export function mediaValidationStatus(error: unknown) {
  return error instanceof MediaInspectionUnavailableError ? 503 : 422
}

export function mediaValidationResponse(error: unknown) {
  if (error instanceof MediaInspectionUnavailableError) {
    return {
      code: error.code,
      error: error.message,
      issues: [] as MediaValidationIssue[],
    }
  }
  const issueCarrier = error && typeof error === 'object' && 'issues' in error
    ? (error as { issues?: unknown }).issues
    : undefined
  const issues = error instanceof MediaValidationError
    ? error.issues
    : (Array.isArray(issueCarrier) ? issueCarrier as MediaValidationIssue[] : [{
      filename: 'unknown',
      field: 'file',
      actual: 'unreadable',
      limit: 'valid media',
      message: error instanceof Error ? error.message : '无法读取媒体文件',
    }])
  return {
    code: 'MEDIA_VALIDATION_FAILED',
    error: '素材不符合发布要求',
    issues,
  }
}
