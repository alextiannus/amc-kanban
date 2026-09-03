import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { getHuaweiObsConfig, getHuaweiObsPresignedPutUrl, makeBrandAssetKey, makeBrandVideoOriginalKey } from '@/lib/integrations/huaweiObs'
import { assertUploadMedia, inspectMediaUrl, MediaValidationError, mediaValidationResponse, mediaValidationStatus, type MediaTechnicalMetadata } from '@/lib/mediaValidation'
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
  if (body.action === 'createShootBatch') return createShootBatch(brandId, actorId, body)
  if (body.action === 'updateShootBatch') return updateShootBatch(brandId, body)
  if (body.action === 'unlinkVideoProject') return unlinkVideoProject(brandId, body)
  if (body.action === 'listShootBatches') return listShootBatches(brandId, body)
  if (body.action === 'presign') return presignAsset(brandId, body)
  if (body.action === 'confirm') return confirmAsset(brandId, actorId, body)
  return NextResponse.json({ error: 'Unsupported content asset action' }, { status: 400 })
}

async function listAssets(brandId: string, body: any, requestOrigin: string) {
  const page = Math.max(1, Number(body.page) || 1)
  const pageSize = Math.min(60, Math.max(1, Number(body.pageSize) || 24))
  const query = text(body.q)
  const queryDate = /^\d{4}-\d{2}-\d{2}$/.test(query) ? new Date(`${query}T00:00:00.000Z`) : null
  const requestedMediaKind = text(body.mediaKind)
  const mediaKind = requestedMediaKind === 'image' || requestedMediaKind === 'video' ? requestedMediaKind : 'all'
  const shootBatchId = text(body.shootBatchId)
  const videoProjectId = text(body.videoProjectId)
  const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map(text).filter(Boolean).slice(0, 60) : []
  const filters: Prisma.MediaAssetWhereInput[] = [mediaKind === 'all'
    ? { OR: [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }] }
    : { mimeType: { startsWith: `${mediaKind}/` } }]
  if (query) filters.push({ OR: [
    { filename: { contains: query, mode: 'insensitive' } },
    { originalFilename: { contains: query, mode: 'insensitive' } },
    { uploadedBy: { contains: query, mode: 'insensitive' } },
    { videoProjectId: { contains: query, mode: 'insensitive' } },
    { shootBatch: { is: { name: { contains: query, mode: 'insensitive' } } } },
    ...(queryDate ? [{ captureDate: queryDate }] : []),
    { aiCaption: { contains: query, mode: 'insensitive' } },
    { aiTags: { has: query.toLowerCase() } },
  ] })
  const where: Prisma.MediaAssetWhereInput = {
    brandId,
    AND: filters,
    ...(assetIds.length ? { id: { in: assetIds } } : {}),
    ...(shootBatchId ? { shootBatchId } : {}),
    ...(videoProjectId ? { videoProjectId } : {}),
  }
  const [assets, total] = await Promise.all([
    prisma.mediaAsset.findMany({ where, include: { shootBatch: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.mediaAsset.count({ where }),
  ])
  return NextResponse.json({
    items: assets.map((asset: any) => ({
      id: asset.id, url: readableAssetUrl(brandId, asset, requestOrigin), filename: asset.filename, mimeType: asset.mimeType,
      width: asset.width, height: asset.height, sizeBytes: asset.sizeBytes,
      caption: asset.aiCaption, category: asset.aiCategory, tags: asset.aiTags,
      shootBatchId: asset.shootBatchId, shootBatchName: asset.shootBatch?.name,
      videoProjectId: asset.videoProjectId, creativeId: asset.creativeId,
      creativeVersion: asset.creativeVersion, extractionVersion: asset.extractionVersion,
      captureDate: asset.captureDate?.toISOString(), originalFilename: asset.originalFilename,
      rightsStatus: asset.rightsStatus,
      uploadedBy: asset.uploadedBy,
      createdAt: asset.createdAt.toISOString(),
    })),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

async function presignAsset(brandId: string, body: any) {
  const filename = text(body.filename)
  const mimeType = text(body.mimeType).toLowerCase()
  const sizeBytes = Number(body.sizeBytes)
  const mediaKind = mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('image/') ? 'image' : ''
  if (!filename || !mediaKind) {
    return NextResponse.json({ error: 'An image or video filename and mimeType are required' }, { status: 400 })
  }
  const limit = mediaKind === 'video' ? 250_000_000 : 10_000_000
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > limit) {
    return NextResponse.json({ error: `${mediaKind === 'video' ? 'Video' : 'Image'} size must be between 1 byte and ${Math.round(limit / 1_000_000)} MB` }, { status: 422 })
  }
  if (!getHuaweiObsConfig()) return NextResponse.json({ error: 'Huawei OBS is not configured' }, { status: 503 })
  const projectId = text(body.videoProjectId)
  const basicVideoReference = text(body.usage) === 'basic_video_reference'
  const captureDate = normalizeDate(body.captureDate)
  if (mediaKind === 'video' && !projectId && !basicVideoReference) return NextResponse.json({ error: 'videoProjectId is required for original video uploads' }, { status: 400 })
  const key = mediaKind === 'video'
    ? basicVideoReference
      ? makeBrandAssetKey({ brandId, folder: '视频制作参考', filename })
      : makeBrandVideoOriginalKey({ brandId, captureDate, projectId, filename })
    : makeBrandAssetKey({ brandId, folder: text(body.folder) || '视频生产', filename })
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
  const mediaKind = mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('image/') ? 'image' : ''
  const shootBatchId = text(body.shootBatchId)
  const videoProjectId = text(body.videoProjectId)
  const basicVideoReference = text(body.usage) === 'basic_video_reference'
  if (!filename || !mediaKind || !url || !key || !config || !key.startsWith(`brands/${brandId}/assets/`)) {
    return NextResponse.json({ error: 'Upload confirmation does not match the brand asset scope' }, { status: 400 })
  }
  if (mediaKind === 'video' && !basicVideoReference && (!shootBatchId || !videoProjectId || !key.includes('/assets/视频原片/'))) {
    return NextResponse.json({ error: 'Original video confirmation requires a shoot batch and video project scope' }, { status: 400 })
  }
  if (mediaKind === 'video' && basicVideoReference && !key.includes('/assets/视频制作参考/')) {
    return NextResponse.json({ error: 'Basic video reference confirmation does not match its upload scope' }, { status: 400 })
  }
  try {
    const actual = new URL(url)
    const base = new URL(config.publicBaseUrl)
    if (actual.origin !== base.origin || !decodeURIComponent(actual.pathname).endsWith(`/${key}`)) {
      return NextResponse.json({ error: 'Upload URL does not match the configured OBS scope' }, { status: 400 })
    }
    const batch = mediaKind === 'video' && !basicVideoReference ? await prisma.videoShootBatch.findFirst({ where: { id: shootBatchId, brandId, videoProjectId } }) : null
    if (mediaKind === 'video' && !basicVideoReference && !batch) return NextResponse.json({ error: 'Shoot batch not found for this brand and project' }, { status: 404 })
    const existing = await prisma.mediaAsset.findFirst({ where: { brandId, url }, include: { shootBatch: true } })
    if (existing) return NextResponse.json({ ok: true, asset: existing, idempotentReplay: true })
    const metadata = await inspectMediaUrl(url, { filename, mimeType, sizeBytes: Number(body.sizeBytes) || undefined })
    assertUploadMedia(metadata, { filename })
    if (mediaKind === 'video') assertProductionVideo(metadata, filename)
    const asset = await prisma.mediaAsset.create({ data: {
      brandId, url, filename, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes,
      width: metadata.width ?? null, height: metadata.height ?? null, technicalMetadata: metadata,
      aiTags: [], aiCategory: mediaKind === 'video' ? (basicVideoReference ? '视频制作参考' : '视频原片') : text(body.folder) || '视频生产', aiReady: true,
      uploadedBy: actorId, sourceType: mediaKind === 'video' ? (basicVideoReference ? 'basic_video_reference' : 'video_production_upload') : 'huawei_obs',
      shootBatchId: batch?.id, videoProjectId: mediaKind === 'video' && !basicVideoReference ? videoProjectId : null,
      creativeId: batch?.creativeId, creativeVersion: batch?.creativeVersion,
      extractionVersion: batch?.extractionVersion, captureDate: batch?.captureDate,
      originalFilename: filename, rightsStatus: text(body.rightsStatus) || (mediaKind === 'video' ? 'owned' : null),
    } })
    return NextResponse.json({ ok: true, asset })
  } catch (error) {
    return NextResponse.json(mediaValidationResponse(error), { status: mediaValidationStatus(error) })
  }
}

async function createShootBatch(brandId: string, actorId: string, body: any) {
  const videoProjectId = text(body.videoProjectId)
  const projectTitle = text(body.projectTitle)
  if (!videoProjectId || !projectTitle) return NextResponse.json({ error: 'videoProjectId and projectTitle are required' }, { status: 400 })
  const existing = await prisma.videoShootBatch.findUnique({ where: { brandId_videoProjectId: { brandId, videoProjectId } } })
  if (existing) return NextResponse.json({ ok: true, batch: existing, idempotentReplay: true })
  const captureDate = new Date(`${normalizeDate(body.captureDate)}T00:00:00.000Z`)
  const requested = text(body.name)
  const baseName = requested || `${captureDate.toISOString().slice(0, 10)} · ${projectTitle}`
  if (baseName.length > 80) return NextResponse.json({ error: 'Shoot batch name must not exceed 80 characters' }, { status: 422 })
  let name = baseName
  for (let suffix = 2; await prisma.videoShootBatch.findUnique({ where: { brandId_name: { brandId, name } } }); suffix += 1) {
    name = `${baseName} · ${String(suffix).padStart(2, '0')}`
    if (name.length > 80) name = `${baseName.slice(0, 73)} · ${String(suffix).padStart(2, '0')}`
  }
  const batch = await prisma.videoShootBatch.create({ data: {
    brandId, name, captureDate, videoProjectId, createdBy: actorId,
    creativeId: text(body.creativeId) || null,
    creativeVersion: positiveInteger(body.creativeVersion),
    extractionVersion: positiveInteger(body.extractionVersion),
  } })
  await prisma.brandFolder.createMany({ data: [{ brandId, name: '视频原片' }], skipDuplicates: true })
  return NextResponse.json({ ok: true, batch }, { status: 201 })
}

async function listShootBatches(brandId: string, body: any) {
  const videoProjectId = text(body.videoProjectId)
  const items = await prisma.videoShootBatch.findMany({
    where: { brandId, ...(videoProjectId ? { videoProjectId } : {}) },
    include: { _count: { select: { mediaAssets: true } } },
    orderBy: [{ captureDate: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })
  return NextResponse.json({ items })
}

async function updateShootBatch(brandId: string, body: any) {
  const id = text(body.shootBatchId)
  const name = text(body.name)
  if (!id || !name) return NextResponse.json({ error: 'shootBatchId and a non-empty name are required' }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: 'Shoot batch name must not exceed 80 characters' }, { status: 422 })
  const current = await prisma.videoShootBatch.findFirst({ where: { id, brandId } })
  if (!current) return NextResponse.json({ error: 'Shoot batch not found' }, { status: 404 })
  const duplicate = await prisma.videoShootBatch.findFirst({ where: { brandId, name, NOT: { id } } })
  if (duplicate) return NextResponse.json({ error: 'Shoot batch name already exists for this brand' }, { status: 409 })
  const batch = await prisma.videoShootBatch.update({ where: { id }, data: { name } })
  return NextResponse.json({ ok: true, batch })
}

async function unlinkVideoProject(brandId: string, body: any) {
  const videoProjectId = text(body.videoProjectId)
  if (!videoProjectId) return NextResponse.json({ error: 'videoProjectId is required' }, { status: 400 })
  const result = await prisma.mediaAsset.updateMany({ where: { brandId, videoProjectId }, data: { videoProjectId: null } })
  return NextResponse.json({ ok: true, unlinkedAssets: result.count })
}

function isAuthorized(request: Request) {
  const local = process.env.NODE_ENV !== 'production' || process.env.APP_BASE_URL?.includes('localhost')
  const expected = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim() || (local ? 'local-internal-token' : '')
  return Boolean(expected) && request.headers.get('x-content-service-token')?.trim() === expected
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDate(value: unknown) {
  const raw = text(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10)
}

function positiveInteger(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function assertProductionVideo(metadata: MediaTechnicalMetadata, filename: string) {
  const issues = []
  if (!metadata.durationSeconds || metadata.durationSeconds <= 0) issues.push({ filename, field: 'durationSeconds', actual: metadata.durationSeconds ?? null, limit: '> 0', message: '无法读取视频时长' })
  if (!metadata.width || !metadata.height) issues.push({ filename, field: 'dimensions', actual: `${metadata.width ?? '?'}x${metadata.height ?? '?'}`, limit: 'readable width and height', message: '无法读取视频分辨率' })
  if (!metadata.videoCodec || !['h264', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg4'].includes(metadata.videoCodec)) {
    issues.push({ filename, field: 'videoCodec', actual: metadata.videoCodec ?? null, limit: 'h264, hevc, vp8, vp9, av1, mpeg4', message: '视频编码不受支持' })
  }
  if (issues.length) throw new MediaValidationError(issues)
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
