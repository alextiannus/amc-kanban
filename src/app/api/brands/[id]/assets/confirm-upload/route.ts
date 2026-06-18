import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

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
}

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
