import { resolve, sep } from 'node:path'
import { prisma } from '@/lib/prisma'
import {
  inspectMediaFile,
  inspectMediaUrl,
  MediaInspectionUnavailableError,
  type MediaTechnicalMetadata,
  type MediaValidationIssue,
  validatePlatformMedia,
} from '@/lib/mediaValidation'

const POSTFAST_MEDIA_BASE = 'https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/'

type DraftAssetRef = {
  asset?: {
    id: string
    url: string
    filename?: string | null
    mimeType?: string | null
    sizeBytes?: number | null
    width?: number | null
    height?: number | null
    sourceType?: string | null
    technicalMetadata?: unknown
  } | null
}

function isTechnicalMetadata(value: unknown): value is MediaTechnicalMetadata {
  if (!value || typeof value !== 'object') return false
  const metadata = value as Partial<MediaTechnicalMetadata>
  return (metadata.kind === 'image' || metadata.kind === 'video') &&
    typeof metadata.mimeType === 'string' &&
    typeof metadata.sizeBytes === 'number'
}

export function postfastStorageUrl(storageKey: string) {
  return new URL(storageKey.replace(/^\/+/, ''), POSTFAST_MEDIA_BASE).toString()
}

function postfastKeyFromProxyUrl(url: string) {
  if (!url.startsWith('/api/integrations/postfast/file/')) return ''
  return url.split('?')[0].split('/').slice(6).join('/')
}

function localPublicPath(url: string) {
  const publicRoot = resolve(process.cwd(), 'public')
  const target = resolve(publicRoot, `.${url.split('?')[0]}`)
  if (target !== publicRoot && !target.startsWith(`${publicRoot}${sep}`)) {
    throw new MediaValidationErrorForSource(url, '本地媒体路径无效，请重新上传')
  }
  return target
}

class MediaValidationErrorForSource extends Error {
  readonly issues: MediaValidationIssue[]

  constructor(filename: string, message: string) {
    super(message)
    this.issues = [{
      filename,
      field: 'url',
      actual: 'unreadable',
      limit: 'readable source media',
      message,
    }]
  }
}

export async function inspectStoredMedia(input: {
  url: string
  filename?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  sourceType?: string | null
  deadlineAt?: number
}) {
  const inspectionInput = { ...input, enforceUploadLimits: false }
  const proxyKey = postfastKeyFromProxyUrl(input.url)
  if (proxyKey) {
    return inspectMediaUrl(postfastStorageUrl(proxyKey), inspectionInput)
  }
  if (input.sourceType === 'postfast' && !input.url.startsWith('http') && !input.url.startsWith('/')) {
    return inspectMediaUrl(postfastStorageUrl(input.url), inspectionInput)
  }
  if (!input.url.startsWith('http') && !input.url.startsWith('/')) {
    return inspectMediaUrl(postfastStorageUrl(input.url), inspectionInput)
  }
  if (input.url.startsWith('/')) {
    return inspectMediaFile(localPublicPath(input.url), inspectionInput)
  }
  return inspectMediaUrl(input.url, inspectionInput)
}

function issuesFromInspectionError(error: unknown, input: {
  filename: string
  assetId?: string
  platform: string
}) {
  if (error instanceof MediaInspectionUnavailableError) throw error
  const carriedIssues = error && typeof error === 'object' && 'issues' in error
    ? (error as { issues?: MediaValidationIssue[] }).issues
    : undefined
  return (carriedIssues || [{
    filename: input.filename,
    field: 'technicalMetadata',
    actual: null,
    limit: 'readable source media',
    message: '无法读取媒体技术参数，请重新上传素材',
  }]).map((issue) => ({
    ...issue,
    assetId: issue.assetId || input.assetId,
    platform: issue.platform || input.platform,
  }))
}

export async function validateDraftMediaForPlatform(input: {
  platform: string
  mediaUrls?: string[] | null
  assetRefs?: DraftAssetRef[] | null
}) {
  const media: Array<{
    filename?: string | null
    assetId?: string
    metadata: MediaTechnicalMetadata
  }> = []
  const issues: MediaValidationIssue[] = []
  const seen = new Set<string>()

  for (const ref of input.assetRefs || []) {
    const asset = ref.asset
    if (!asset?.url || seen.has(asset.url)) continue
    seen.add(asset.url)
    let metadata = isTechnicalMetadata(asset.technicalMetadata)
      ? asset.technicalMetadata
      : null

    if (!metadata) {
      try {
        metadata = await inspectStoredMedia(asset)
        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: {
            mimeType: metadata.mimeType,
            sizeBytes: metadata.sizeBytes,
            width: metadata.width ?? null,
            height: metadata.height ?? null,
            technicalMetadata: metadata,
          },
        })
        // Keep the caller's loaded draft graph in sync with the backfill. The
        // same delivery request can then pass metadata into PostFast without
        // downloading and inspecting the source a second time.
        asset.mimeType = metadata.mimeType
        asset.sizeBytes = metadata.sizeBytes
        asset.width = metadata.width ?? null
        asset.height = metadata.height ?? null
        asset.technicalMetadata = metadata
      } catch (error) {
        issues.push(...issuesFromInspectionError(error, {
          assetId: asset.id,
          filename: asset.filename || 'unknown',
          platform: input.platform,
        }))
        continue
      }
    }
    media.push({ filename: asset.filename, assetId: asset.id, metadata })
  }

  for (const url of input.mediaUrls || []) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    try {
      const metadata = await inspectStoredMedia({ url })
      media.push({ filename: url.split('/').pop(), metadata })
    } catch (error) {
      issues.push(...issuesFromInspectionError(error, {
        filename: url,
        platform: input.platform,
      }))
    }
  }

  issues.push(...validatePlatformMedia(input.platform, media))
  return issues
}
