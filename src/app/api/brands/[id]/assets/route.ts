/**
 * Unified Asset Upload API
 * 
 * Route: POST /api/brands/[id]/assets/upload
 * 
 * This endpoint handles file uploads to the brand's asset library.
 * The backend automatically selects the appropriate storage:
 * - Lark Drive (if configured)
 * - PostFast media storage (if configured)
 * - Local storage (fallback)
 * 
 * Returns a public asset URL for use in posts, emails, etc.
 */

import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postfastGetSignedUploadUrls, postfastUploadFile } from '@/lib/integrations/postfast'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

interface UploadAssetRequest {
  filename: string      // original filename with extension
  mimeType: string      // e.g., 'image/jpeg', 'video/mp4'
  fileBase64: string    // base64-encoded file data (no 'data:' prefix)
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
    // ═══════════════════════════════════════════════════════════════════════════
    // Storage Backend Selection Logic
    // ═══════════════════════════════════════════════════════════════════════════
    // Priority: PostFast > Lark > Local

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

      return NextResponse.json({
        ok: true,
        assetId: slot.storageKey || slot.fileToken || filename,
        assetUrl: `https://postfast.media.example.com/${slot.storageKey}`, // TODO: get real URL from PostFast
        storageEngine: 'postfast',
        filename,
        mimeType,
        uploadedAt: new Date().toISOString(),
      })
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Future: Lark Drive Upload
    // if (brand.larkAppId && brand.larkAppSecret && brand.larkDriveFolderId) {
    //   return uploadToLarkDrive(...)
    // }

    // ═══════════════════════════════════════════════════════════════════════════
    // Future: Local Storage
    // if (process.env.ENABLE_LOCAL_STORAGE) {
    //   return uploadLocally(...)
    // }

    return NextResponse.json(
      {
        error: 'No asset storage backend configured for this brand',
        hint: 'Configure PostFast API Key, Lark credentials, or enable local storage',
      },
      { status: 400 }
    )

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

  // TODO: Implement list assets endpoint
  // - Query PostFast for uploaded media
  // - Query Lark for uploaded files
  // - Return unified format with pagination
  
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
