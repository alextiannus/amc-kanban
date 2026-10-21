export type DirectUploadedAsset = {
  id: string
  url: string
  filename?: string | null
  mimeType?: string | null
  aiCaption?: string | null
  aiTags?: string[] | null
  [key: string]: unknown
}

type DirectAssetUploadOptions = {
  folder?: string
  aiTags?: string[]
  aiCaption?: string
  creativeId?: string
}

type ClientMediaMetadata = {
  kind: 'image' | 'video'
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
}

const IMAGE_LIMIT = 10_000_000
const VIDEO_LIMIT = 250_000_000
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

function inferMimeType(file: File) {
  if (file.type) return file.type.split(';')[0].trim().toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase()
  return ({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  } as Record<string, string>)[extension || ''] || 'application/octet-stream'
}

function loadVideoMetadata(file: File) {
  return new Promise<Pick<ClientMediaMetadata, 'width' | 'height' | 'durationSeconds'>>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const result = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
      }
      cleanup()
      resolve(result)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('无法读取视频参数，文件可能损坏或格式不受支持'))
    }
    video.src = objectUrl
  })
}

async function loadImageMetadata(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      const result = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return result
    } catch {
      // Older WebViews and some image codecs need the HTMLImageElement path.
    }
  }
  return new Promise<Pick<ClientMediaMetadata, 'width' | 'height'>>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => {
      image.removeAttribute('src')
      URL.revokeObjectURL(objectUrl)
    }
    image.onload = () => {
      const result = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      }
      cleanup()
      resolve(result)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('无法读取图片参数，文件可能损坏或格式不受支持'))
    }
    image.src = objectUrl
  })
}

async function inspectClientMedia(file: File): Promise<ClientMediaMetadata> {
  const mimeType = inferMimeType(file)
  if (IMAGE_MIMES.has(mimeType)) {
    if (file.size > IMAGE_LIMIT) {
      throw new Error(`图片不能超过 10 MB（当前 ${(file.size / 1_000_000).toFixed(1)} MB）`)
    }
    try {
      return { kind: 'image' as const, mimeType, ...(await loadImageMetadata(file)) }
    } catch {
      throw new Error('无法读取图片参数，文件可能损坏或格式不受支持')
    }
  }
  if (VIDEO_MIMES.has(mimeType)) {
    if (file.size > VIDEO_LIMIT) {
      throw new Error(`视频不能超过 250 MB（当前 ${(file.size / 1_000_000).toFixed(1)} MB）`)
    }
    return { kind: 'video', mimeType, ...(await loadVideoMetadata(file)) }
  }
  throw new Error('仅支持 JPEG、PNG、GIF、WebP 图片或 MP4、MOV、WebM 视频')
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback
  const data = payload as {
    error?: string
    message?: string
    issues?: Array<{ filename?: string; message?: string }>
  }
  const issueText = data.issues
    ?.map((issue) => `${issue.filename ? `${issue.filename}: ` : ''}${issue.message || ''}`)
    .filter(Boolean)
    .join('；')
  return issueText || data.error || data.message || fallback
}

export async function uploadAssetDirect(
  file: File,
  brandId: string,
  options: DirectAssetUploadOptions = {},
): Promise<DirectUploadedAsset> {
  const folder = options.folder ?? '素材库'
  const metadata = await inspectClientMedia(file)
  const params = new URLSearchParams({
    filename: file.name,
    mimeType: metadata.mimeType,
    sizeBytes: String(file.size),
    folder,
  })
  if (metadata.width) params.set('width', String(metadata.width))
  if (metadata.height) params.set('height', String(metadata.height))
  if (metadata.durationSeconds !== undefined) {
    params.set('durationSeconds', String(metadata.durationSeconds))
  }

  let presignData: Record<string, any>
  try {
    const presignRes = await fetch(`/api/brands/${brandId}/assets/presign-upload?${params}`)
    presignData = await presignRes.json().catch(() => ({}))
    if (!presignRes.ok) {
      throw new Error(apiErrorMessage(presignData, `HTTP ${presignRes.status}`))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法连接服务器'
    throw new Error(`素材上传失败：${message}`)
  }

  if (presignData.useDirectApi) {
    throw new Error('素材上传失败：云存储服务尚未配置，请联系管理员。')
  }

  const putRes = await fetch(presignData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': metadata.mimeType },
    body: file,
  })
  if (!putRes.ok) {
    const details = await putRes.text().catch(() => '')
    throw new Error(`素材上传失败：OBS 直传异常（HTTP ${putRes.status}）${details ? `：${details.slice(0, 160)}` : ''}`)
  }

  const confirmRes = await fetch(`/api/brands/${brandId}/assets/confirm-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: metadata.mimeType,
      sizeBytes: file.size,
      width: metadata.width,
      height: metadata.height,
      durationSeconds: metadata.durationSeconds,
      url: presignData.assetUrl,
      key: presignData.key,
      folder,
      aiTags: options.aiTags ?? ['待创作'],
      aiCaption: options.aiCaption,
      creativeId: options.creativeId,
    }),
  })
  const confirmData = await confirmRes.json().catch(() => ({}))
  if (!confirmRes.ok) {
    throw new Error(`素材入库失败：${apiErrorMessage(confirmData, `HTTP ${confirmRes.status}`)}`)
  }

  const asset = confirmData.asset || confirmData
  if (!asset.id) throw new Error('文件已上传，但服务器未返回素材 ID。')
  return {
    ...asset,
    url: asset.url ?? presignData.assetUrl,
    mimeType: asset.mimeType ?? metadata.mimeType,
  }
}
