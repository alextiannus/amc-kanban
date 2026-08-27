import { NextResponse } from 'next/server'
import { extractApiKey, getAgentFromApiKey, getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { triggerDesignerAutoTag } from '@/lib/designer'
import {
  deleteHuaweiObsObject,
  getHuaweiObsConfig,
} from '@/lib/integrations/huaweiObs'
import {
  assertUploadMedia,
  inspectMediaUrl,
  mediaValidationResponse,
  MediaInspectionUnavailableError,
  MediaValidationError,
} from '@/lib/mediaValidation'
import { prisma } from '@/lib/prisma'
import { submitAssetToCalendarCreativeRequirement } from '@/lib/brand-plan/calendarSync'

type Params = { params: Promise<{ id: string }> }

interface ConfirmUploadRequest {
  filename: string
  mimeType: string
  sizeBytes?: number
  width?: number
  height?: number
  durationSeconds?: number
  url: string
  key: string
  folder?: string
  aiTags?: string[]
  aiCaption?: string
  creativeId?: string
  userId?: string
}

function isInternalMmRequest(request: Request) {
  const secret = process.env.MM_INTERNAL_SECRET
  return !!secret && request.headers.get('x-mm-internal-token') === secret
}

function isExpectedObsUpload(brandId: string, url: string, key: string) {
  const config = getHuaweiObsConfig()
  if (!config || !key.startsWith(`brands/${brandId}/assets/`)) return false
  try {
    const actual = new URL(url)
    const base = new URL(config.publicBaseUrl)
    return actual.origin === base.origin && decodeURIComponent(actual.pathname).endsWith(`/${key}`)
  } catch {
    return false
  }
}

async function createConfirmedAsset(input: {
  brandId: string
  body: ConfirmUploadRequest
  uploadedBy: string
  deadlineAt: number
}) {
  const { brandId, body, uploadedBy, deadlineAt } = input
  const { filename, mimeType, url, key, folder, aiTags, aiCaption } = body

  if (!filename || !mimeType || !url || !key) {
    return NextResponse.json(
      { error: 'filename, mimeType, url, and key are required' },
      { status: 400 },
    )
  }
  if (!isExpectedObsUpload(brandId, url, key)) {
    return NextResponse.json(
      { error: 'url/key does not match the brand OBS upload scope' },
      { status: 400 },
    )
  }

  const existing = await prisma.mediaAsset.findFirst({
    where: { brandId, url },
  })
  if (existing) {
    return NextResponse.json({
      ok: true,
      assetId: existing.id,
      assetUrl: existing.url,
      storageKey: key,
      storageEngine: 'huawei_obs',
      asset: existing,
      uploadedAt: existing.createdAt.toISOString(),
      idempotentReplay: true,
    })
  }

  let metadata: Awaited<ReturnType<typeof inspectMediaUrl>>
  try {
    // Browser-provided size/dimension hints are intentionally not persisted.
    // The source object is inspected again and the server result is authoritative.
    metadata = await inspectMediaUrl(url, {
      filename,
      mimeType,
      sizeBytes: body.sizeBytes,
      deadlineAt,
    })
    assertUploadMedia(metadata, { filename })
  } catch (error) {
    if (error instanceof MediaValidationError) {
      // Only a confirmed policy/file rejection removes the object. Temporary
      // inspection or database failures retain it so confirmation can be retried.
      void deleteHuaweiObsObject(key).then((deleted) => {
        console.info('[confirm-upload] rejected object cleanup', { deleted })
      }).catch((deleteError) => {
        console.error('[confirm-upload] Failed to clean rejected OBS object:', deleteError)
      })
      return NextResponse.json(mediaValidationResponse(error), { status: 422 })
    }
    console.error('[confirm-upload] Failed to inspect uploaded media:', error)
    return NextResponse.json(
      error instanceof MediaInspectionUnavailableError
        ? mediaValidationResponse(error)
        : { error: error instanceof Error ? error.message : 'Media inspection failed' },
      { status: error instanceof MediaInspectionUnavailableError ? 503 : 500 },
    )
  }

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        brandId,
        url,
        filename,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        technicalMetadata: metadata,
        aiTags: Array.isArray(aiTags) ? aiTags : [],
        aiCategory: folder || '素材库',
        aiCaption: aiCaption || null,
        creativeId: typeof body.creativeId === 'string' ? body.creativeId.trim() || null : null,
        aiReady: true,
        uploadedBy,
        sourceType: 'huawei_obs',
      },
    })
    if (body.creativeId) {
      await submitAssetToCalendarCreativeRequirement({
        brandId,
        assetId: asset.id,
        creativeId: body.creativeId,
        submittedBy: uploadedBy,
      })
    }

    if (asset.mimeType.startsWith('image/')) {
      void triggerDesignerAutoTag(asset.id).catch((error) => {
        console.error('[confirm-upload] Failed to auto-tag asset:', error)
      })
    }

    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      assetUrl: asset.url,
      storageKey: key,
      storageEngine: 'huawei_obs',
      asset,
      uploadedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[confirm-upload] Database creation failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Database creation failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request, { params }: Params) {
  const startedAt = Date.now()
  const { id: brandId } = await params
  const body: ConfirmUploadRequest = await request.json().catch(() => ({}))

  if (isInternalMmRequest(request)) {
    const response = await createConfirmedAsset({
      brandId,
      body,
      uploadedBy: body.userId ?? 'mm-service',
      deadlineAt: startedAt + 18_000,
    })
    console.log(`[confirm-upload] internal path ${Date.now() - startedAt}ms brand=${brandId}`)
    return response
  }

  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const user = authenticatedAgent
    ? {
        id: authenticatedAgent.id,
        email: authenticatedAgent.email,
        type: authenticatedAgent.type,
        role: 'USER',
      }
    : session?.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasAccess = await canSessionAccessBrandProject(
    brandId,
    user.id,
    user.type ?? 'HUMAN',
    user.role,
  )
  if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const response = await createConfirmedAsset({
    brandId,
    body,
    uploadedBy: user.id,
    deadlineAt: startedAt + 18_000,
  })
  console.log(`[confirm-upload] standard path ${Date.now() - startedAt}ms brand=${brandId}`)
  return response
}
