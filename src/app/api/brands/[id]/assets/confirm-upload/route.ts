import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { triggerDesignerAutoTag } from '@/lib/designer'

type Params = { params: Promise<{ id: string }> }

interface ConfirmUploadRequest {
  filename: string
  mimeType: string
  sizeBytes?: number
  url: string
  key: string
  folder?: string
  aiTags?: string[]
  aiCaption?: string
  /** userId passed by amc-mm when using internal fast-path (to attribute the upload correctly) */
  userId?: string
}

/**
 * Validates an internal service call from amc-mm.
 * When the MM_INTERNAL_SECRET header is present and matches, we skip the
 * expensive canSessionAccessBrandProject ACL cascade (4 DB queries) because
 * amc-mm already verified the user's JWT locally before making this call.
 */
function isInternalMmRequest(request: Request): boolean {
  const secret = process.env.MM_INTERNAL_SECRET
  if (!secret) return false
  const token = request.headers.get('x-mm-internal-token')
  return token === secret
}

export async function POST(request: Request, { params }: Params) {
  const t0 = Date.now()

  // ── Internal fast-path for amc-mm service calls ────────────────────────
  // amc-mm validates the user's JWT locally, then calls kanban with an
  // internal secret token so we can skip the 4-query ACL check here.
  if (isInternalMmRequest(request)) {
    const { id: brandId } = await params
    const body: ConfirmUploadRequest = await request.json().catch(() => ({}))
    const { filename, mimeType, sizeBytes, url, key, folder, aiTags, aiCaption, userId } = body

    if (!filename || !mimeType || !url || !key) {
      return NextResponse.json(
        { error: 'filename, mimeType, url, and key are required' },
        { status: 400 }
      )
    }

    try {
      const asset = await prisma.mediaAsset.create({
        data: {
          brandId,
          url,
          filename,
          mimeType,
          sizeBytes: sizeBytes ?? null,
          aiTags: Array.isArray(aiTags) ? aiTags : [],
          aiCategory: folder || '素材库',
          aiCaption: aiCaption || null,
          aiReady: true,
          uploadedBy: userId ?? 'mm-service',
          sourceType: 'huawei_obs',
        },
      })

      // Trigger auto-tagging in background (non-blocking)
      if (asset.mimeType.startsWith('image/')) {
        void triggerDesignerAutoTag(asset.id).catch((err) => {
          console.error('[confirm-upload] Failed to auto-tag asset in background:', err)
        })
      }

      console.log(`[confirm-upload] ✅ internal fast-path ${Date.now() - t0}ms brand=${brandId}`)
      return NextResponse.json({
        ok: true,
        assetId: asset.id,
        assetUrl: asset.url,
        storageKey: key,
        storageEngine: 'huawei_obs',
        asset,
        uploadedAt: new Date().toISOString(),
      })
    } catch (error: any) {
      console.error('[confirm-upload] DB error (internal path):', error)
      return NextResponse.json(
        { error: error?.message || 'Database creation failed' },
        { status: 500 }
      )
    }
  }

  // ── Standard auth path (browser / API key calls) ───────────────────────
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

  const body: ConfirmUploadRequest = await request.json().catch(() => ({}))
  const { filename, mimeType, sizeBytes, url, key, folder, aiTags, aiCaption } = body

  if (!filename || !mimeType || !url || !key) {
    return NextResponse.json(
      { error: 'filename, mimeType, url, and key are required' },
      { status: 400 }
    )
  }

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        brandId,
        url,
        filename,
        mimeType,
        sizeBytes: sizeBytes ?? null,
        aiTags: Array.isArray(aiTags) ? aiTags : [],
        aiCategory: folder || '素材库',
        aiCaption: aiCaption || null,
        aiReady: true,
        uploadedBy: user.id,
        sourceType: 'huawei_obs',
      },
    })

    // Trigger platform Designer auto-tagging in the background
    if (asset.mimeType.startsWith('image/')) {
      void triggerDesignerAutoTag(asset.id).catch((err) => {
        console.error('[confirm-upload] Failed to auto-tag asset in background:', err)
      })
    }

    console.log(`[confirm-upload] ✅ standard path ${Date.now() - t0}ms brand=${brandId}`)
    return NextResponse.json({
      ok: true,
      assetId: asset.id,
      assetUrl: asset.url,
      storageKey: key,
      storageEngine: 'huawei_obs',
      asset,
      uploadedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Assets Confirm] Unexpected database error:', error)
    return NextResponse.json(
      { error: error?.message || 'Database creation failed' },
      { status: 500 }
    )
  }
}
