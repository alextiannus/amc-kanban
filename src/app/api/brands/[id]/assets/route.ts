/**
 * Unified Asset Upload API
 * 
 * Route: POST /api/brands/[id]/assets/upload
 * 
 * This endpoint handles file uploads to the brand's asset library.
 * The backend automatically selects the appropriate storage:
 * - Huawei OBS (required in production)
 * - PostFast media storage (if configured)
 * - Lark Drive (if configured)
 * - Local storage (fallback)
 * 
 * Returns a public asset URL for use in posts, emails, etc.
 */

import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postfastGetSignedUploadUrls, postfastUploadFile } from '@/lib/integrations/postfast'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { uploadToLarkDrive } from '@/lib/integrations/lark'
import { getHuaweiObsConfig, makeBrandAssetKey, uploadHuaweiObsObject } from '@/lib/integrations/huaweiObs'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

type Params = { params: Promise<{ id: string }> }

interface UploadAssetRequest {
  filename: string      // original filename with extension
  mimeType: string      // e.g., 'image/jpeg', 'video/mp4'
  fileBase64: string    // base64-encoded file data (no 'data:' prefix)
  folder?: string
  aiCategory?: string
  aiTags?: string[]
  aiCaption?: string
}

function sanitizeFilename(filename: string) {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
  return `${base}-${Date.now()}${ext || ''}`
}

// POST /api/brands/[id]/assets/upload
// Upload a file to the brand's asset library
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  let user = session?.user
  if (apiKey && authenticatedAgent) {
    user = {
      id: authenticatedAgent.id,
      email: authenticatedAgent.email,
      type: authenticatedAgent.type,
      role: 'USER',
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId } = await params
  const ok = await canSessionAccessBrandProject(brandId, user.id, user.type ?? 'HUMAN', user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: {
      postfastApiKey: true,
      larkAppId: true,
      larkAppSecret: true,
      larkDriveFolderId: true,
    }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const body: UploadAssetRequest = await request.json()
  const { filename, mimeType, fileBase64 } = body

  if (!filename || !mimeType || !fileBase64) {
    return NextResponse.json(
      { error: 'filename, mimeType, and fileBase64 are required' },
      { status: 400 }
    )
  }

  try {
    const isProduction = process.env.NODE_ENV === 'production'

    // ═══════════════════════════════════════════════════════════════════════════
    // Storage Backend Selection Logic
    // ═══════════════════════════════════════════════════════════════════════════
    // Priority: Huawei OBS > PostFast > Lark > Local

    const obsConfig = getHuaweiObsConfig()
    if (obsConfig) {
      const fileBuffer = Buffer.from(fileBase64, 'base64')
      const key = makeBrandAssetKey({ brandId, folder: body.folder || body.aiCategory || '素材库', filename })
      const uploadResult = await uploadHuaweiObsObject({ key, body: fileBuffer, contentType: mimeType })

      if (!uploadResult.ok) {
        return NextResponse.json({ error: uploadResult.error || 'Huawei OBS upload failed' }, { status: 400 })
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          brandId,
          url: uploadResult.url,
          filename,
          mimeType,
          sizeBytes: fileBuffer.length,
          aiTags: Array.isArray(body.aiTags) ? body.aiTags : [],
          aiCategory: body.folder || body.aiCategory || '素材库',
          aiCaption: body.aiCaption || null,
          aiReady: true,
          uploadedBy: user.id,
          sourceType: 'huawei_obs',
        },
      })

      return NextResponse.json({
        ok: true,
        assetId: asset.id,
        assetUrl: asset.url,
        storageKey: uploadResult.key,
        storageEngine: 'huawei_obs',
        asset,
        uploadedAt: new Date().toISOString(),
      })
    }

    // In production we require real cloud storage and never fall back to local files.
    if (isProduction) {
      return NextResponse.json(
        {
          error: 'OSS is not configured. Configure HUAWEI_OBS_* (or OBS_*) variables for production uploads.',
        },
        { status: 503 }
      )
    }

    if (brand.postfastApiKey) {
      // PostFast upload is a two-step process:
      // 1. Get a signed upload URL
      // 2. Upload the file to that URL

      // Step 1: Get signed upload URL
      const sizeBytes = Math.ceil((fileBase64.length * 3) / 4) // base64 to bytes
      const slotResult = await postfastGetSignedUploadUrls(brand.postfastApiKey, [
        { filename, mimeType, sizeBytes }
      ])

      if (!slotResult.success || !slotResult.slots.length) {
        console.error(`[Assets] PostFast signed URL failed for brand ${brandId}:`, slotResult.error)
        return NextResponse.json(
          { error: slotResult.error || 'Failed to get upload URL' },
          { status: 400 }
        )
      }

      const slot = slotResult.slots[0]

      // Step 2: Upload file using signed URL
      const fileBuffer = Buffer.from(fileBase64, 'base64')
      const uploadResult = await postfastUploadFile(slot.uploadUrl, fileBuffer, mimeType)

      if (!uploadResult.success) {
        console.error(`[Assets] PostFast file upload failed for brand ${brandId}:`, uploadResult.error)
        return NextResponse.json(
          { error: uploadResult.error || 'Upload failed' },
          { status: 400 }
        )
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          brandId,
          url: slot.storageKey || slot.fileToken || filename,
          filename,
          mimeType,
          sizeBytes,
          aiTags: Array.isArray(body.aiTags) ? body.aiTags : [],
          aiCategory: body.folder || body.aiCategory || '素材库',
          aiCaption: body.aiCaption || null,
          aiReady: true,
          uploadedBy: user.id,
          sourceType: 'postfast',
        },
      })

      return NextResponse.json({
        ok: true,
        assetId: asset.id,
        assetUrl: asset.url,
        storageKey: slot.storageKey || slot.fileToken || undefined,
        storageEngine: 'postfast',
        asset,
        uploadedAt: new Date().toISOString(),
      })
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Lark Drive Upload
    if (brand.larkAppId && brand.larkAppSecret && brand.larkDriveFolderId) {
      const fileBuffer = Buffer.from(fileBase64, 'base64')
      const uploadResult = await uploadToLarkDrive({
        appId: brand.larkAppId,
        appSecret: brand.larkAppSecret,
        folderId: brand.larkDriveFolderId,
        filename,
        mimeType,
        fileBuffer,
      })

      if (!uploadResult.success || !uploadResult.fileToken) {
        return NextResponse.json({ error: uploadResult.error || 'Lark upload failed' }, { status: 400 })
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          brandId,
          url: uploadResult.downloadUrl || uploadResult.fileToken,
          filename,
          mimeType,
          sizeBytes: fileBuffer.length,
          aiTags: Array.isArray(body.aiTags) ? body.aiTags : [],
          aiCategory: body.folder || body.aiCategory || '素材库',
          aiCaption: body.aiCaption || null,
          aiReady: true,
          uploadedBy: user.id,
          sourceType: 'lark',
        },
      })

      return NextResponse.json({
        ok: true,
        assetId: asset.id,
        assetUrl: asset.url,
        storageEngine: 'lark',
        asset,
        uploadedAt: new Date().toISOString(),
      })
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Local fallback for Phase 1 development and brands without OSS credentials.
    const fileBuffer = Buffer.from(fileBase64, 'base64')
    const safeName = sanitizeFilename(filename)
    const relativeDir = path.join('uploads', 'brand-assets', brandId)
    const absoluteDir = path.join(process.cwd(), 'public', relativeDir)
    await mkdir(absoluteDir, { recursive: true })
    await writeFile(path.join(absoluteDir, safeName), fileBuffer)
    const assetUrl = `/${relativeDir.replace(/\\/g, '/')}/${safeName}`

    const asset = await prisma.mediaAsset.create({
      data: {
        brandId,
        url: assetUrl,
        filename,
        mimeType,
        sizeBytes: fileBuffer.length,
        aiTags: Array.isArray(body.aiTags) ? body.aiTags : [],
        aiCategory: body.folder || body.aiCategory || '素材库',
        aiCaption: body.aiCaption || null,
        aiReady: true,
        uploadedBy: user.id,
        sourceType: 'local',
      },
    })

    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      assetUrl: asset.url,
      storageEngine: 'local',
      asset,
      uploadedAt: new Date().toISOString(),
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    const details = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : undefined
    console.error(`[Assets] Unexpected error for brand ${brandId}:`, error)
    return NextResponse.json(
      {
        error: message,
        details: details || undefined,
      },
      { status: 500 }
    )
  }
}

// GET /api/brands/[id]/assets
// List all assets in the brand's asset library (future endpoint)
export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  let user = session?.user
  if (apiKey && authenticatedAgent) {
    user = {
      id: authenticatedAgent.id,
      email: authenticatedAgent.email,
      type: authenticatedAgent.type,
      role: 'USER',
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId } = await params
  const ok = await canSessionAccessBrandProject(brandId, user.id, user.type ?? 'HUMAN', user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const query = (url.searchParams.get('q') || '').trim().toLowerCase()
  const folder = (url.searchParams.get('folder') || '').trim()

  const assets = await prisma.mediaAsset.findMany({
    where: {
      brandId,
      ...(folder ? { aiCategory: folder } : {}),
      ...(query ? {
        OR: [
          { filename: { contains: query, mode: 'insensitive' } },
          { aiCaption: { contains: query, mode: 'insensitive' } },
          { aiTags: { has: query } },
        ],
      } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const folders = Array.from(new Set(assets.map((asset) => asset.aiCategory || '素材库')))
  return NextResponse.json({ assets, folders })
}
