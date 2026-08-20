import { NextResponse } from 'next/server'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { getHuaweiObsConfig, getHuaweiObsPresignedPutUrl, makeBrandAssetKey } from '@/lib/integrations/huaweiObs'
import { assertUploadMedia, inspectMediaUrl, mediaValidationResponse, mediaValidationStatus } from '@/lib/mediaValidation'
import { prisma } from '@/lib/prisma'

export const maxDuration = 30

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as any
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const brandId = text(body.brandId)
  const actorId = text(body.actorId)
  const actorType = text(body.actorType) || 'HUMAN'
  const actorRole = text(body.actorRole) || 'USER'
  if (!brandId || !actorId) return NextResponse.json({ error: 'brandId and actorId are required' }, { status: 400 })
  if (!await canSessionAccessBrandProject(brandId, actorId, actorType, actorRole)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (body.action === 'list') return listAssets(brandId, body, new URL(request.url).origin)
  if (body.action === 'presign') return presignAsset(brandId, body)
  if (body.action === 'confirm') return confirmAsset(brandId, actorId, body)
  return NextResponse.json({ error: 'action must be list, presign, or confirm' }, { status: 400 })
}

async function listAssets(brandId: string, body: any, requestOrigin: string) {
  const page = Math.max(1, Number(body.page) || 1)
  const pageSize = Math.min(60, Math.max(1, Number(body.pageSize) || 24))
  const query = text(body.q)
  const where = {
    brandId,
    mimeType: { startsWith: 'image/' },
    ...(query ? { OR: [
      { filename: { contains: query, mode: 'insensitive' as const } },
      { aiCaption: { contains: query, mode: 'insensitive' as const } },
      { aiTags: { has: query.toLowerCase() } },
    ] } : {}),
  }
  const [assets, total] = await Promise.all([
    prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.mediaAsset.count({ where }),
  ])
  return NextResponse.json({
    items: assets.map((asset: any) => ({
      id: asset.id, url: readableAssetUrl(brandId, asset, requestOrigin), filename: asset.filename, mimeType: asset.mimeType,
      width: asset.width, height: asset.height, sizeBytes: asset.sizeBytes,
      caption: asset.aiCaption, category: asset.aiCategory, tags: asset.aiTags,
      createdAt: asset.createdAt.toISOString(),
    })),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

async function presignAsset(brandId: string, body: any) {
  const filename = text(body.filename)
  const mimeType = text(body.mimeType).toLowerCase()
  const sizeBytes = Number(body.sizeBytes)
  if (!filename || !mimeType.startsWith('image/')) {
    return NextResponse.json({ error: 'An image filename and mimeType are required' }, { status: 400 })
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10_000_000) {
    return NextResponse.json({ error: 'Image size must be between 1 byte and 10 MB' }, { status: 422 })
  }
  if (!getHuaweiObsConfig()) return NextResponse.json({ error: 'Huawei OBS is not configured' }, { status: 503 })
  const key = makeBrandAssetKey({ brandId, folder: text(body.folder) || '视频生产', filename })
  const result = getHuaweiObsPresignedPutUrl({ key, contentType: mimeType })
  if (!result) return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
  return NextResponse.json({ ok: true, uploadUrl: result.uploadUrl, assetUrl: result.publicUrl, key, headers: result.headers })
}

async function confirmAsset(brandId: string, actorId: string, body: any) {
  const filename = text(body.filename)
  const mimeType = text(body.mimeType).toLowerCase()
  const url = text(body.url)
  const key = text(body.key)
  const config = getHuaweiObsConfig()
  if (!filename || !mimeType.startsWith('image/') || !url || !key || !config || !key.startsWith(`brands/${brandId}/assets/`)) {
    return NextResponse.json({ error: 'Upload confirmation does not match the brand image scope' }, { status: 400 })
  }
  try {
    const actual = new URL(url)
    const base = new URL(config.publicBaseUrl)
    if (actual.origin !== base.origin || !decodeURIComponent(actual.pathname).endsWith(`/${key}`)) {
      return NextResponse.json({ error: 'Upload URL does not match the configured OBS scope' }, { status: 400 })
    }
    const existing = await prisma.mediaAsset.findFirst({ where: { brandId, url } })
    if (existing) return NextResponse.json({ ok: true, asset: existing, idempotentReplay: true })
    const metadata = await inspectMediaUrl(url, { filename, mimeType, sizeBytes: Number(body.sizeBytes) || undefined })
    assertUploadMedia(metadata, { filename })
    const asset = await prisma.mediaAsset.create({ data: {
      brandId, url, filename, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes,
      width: metadata.width ?? null, height: metadata.height ?? null, technicalMetadata: metadata,
      aiTags: [], aiCategory: text(body.folder) || '视频生产', aiReady: true,
      uploadedBy: actorId, sourceType: 'huawei_obs',
    } })
    return NextResponse.json({ ok: true, asset })
  } catch (error) {
    return NextResponse.json(mediaValidationResponse(error), { status: mediaValidationStatus(error) })
  }
}

function isAuthorized(request: Request) {
  const local = process.env.NODE_ENV !== 'production' || process.env.APP_BASE_URL?.includes('localhost')
  const expected = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim() || (local ? 'local-internal-token' : '')
  return Boolean(expected) && request.headers.get('x-content-service-token')?.trim() === expected
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readableAssetUrl(brandId: string, asset: { url: string; sourceType?: string | null }, requestOrigin: string) {
  let value = asset.url
  if (!value.startsWith('http') && !value.startsWith('/') && asset.sourceType === 'postfast') {
    value = `/api/integrations/postfast/file/${encodeURIComponent(brandId)}/${encodeURIComponent(value)}`
  }
  if (value.startsWith('/')) {
    const base = process.env.APP_BASE_URL?.replace(/\/+$/, '') || requestOrigin
    return base ? `${base}${value}` : value
  }
  return value
}
