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
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postfastGetSignedUploadUrls, postfastUploadFile } from '@/lib/integrations/postfast'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

interface UploadAssetRequest {
  filename: string      // original filename with extension
  mimeType: string      // e.g., 'image/jpeg', 'video/mp4'
  fileBase64: string    // base64-encoded file data (no 'data:' prefix)
}

interface UploadAssetResponse {
  ok: boolean
  assetId: string       // unique identifier in asset library
  assetUrl: string      // public URL to access the asset
  storageEngine: string // 'postfast', 'lark', or 'local'
  filename: string
  mimeType: string
  uploadedAt: string    // ISO 8601 timestamp
}

// POST /api/brands/[id]/assets/upload
// Upload a file to the brand's asset library
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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

  } catch (error: any) {
    console.error(`[Assets] Unexpected error for brand ${brandId}:`, error)
    return NextResponse.json(
      {
        error: error.message || 'Upload failed',
        details: error.code || undefined,
      },
      { status: 500 }
    )
  }
}

// GET /api/brands/[id]/assets
// List all assets in the brand's asset library (future endpoint)
export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // TODO: Implement list assets endpoint
  // - Query PostFast for uploaded media
  // - Query Lark for uploaded files
  // - Return unified format with pagination
  
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
