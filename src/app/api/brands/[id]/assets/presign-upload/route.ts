import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { getHuaweiObsConfig, makeBrandAssetKey, getHuaweiObsPresignedPutUrl } from '@/lib/integrations/huaweiObs'

type Params = { params: Promise<{ id: string }> }

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
  const filename = url.searchParams.get('filename')
  const mimeType = url.searchParams.get('mimeType') || 'application/octet-stream'
  const folder = url.searchParams.get('folder') || '素材库'

  if (!filename) {
    return NextResponse.json({ error: 'filename query parameter is required' }, { status: 400 })
  }

  const obsConfig = getHuaweiObsConfig()
  if (!obsConfig) {
    // If OBS is not configured (e.g. in local development), fallback to the local API upload
    return NextResponse.json({ ok: false, useDirectApi: true })
  }

  const key = makeBrandAssetKey({ brandId, folder, filename })
  const result = getHuaweiObsPresignedPutUrl({ key, contentType: mimeType })

  if (!result) {
    return NextResponse.json({ error: 'Failed to generate presigned URL' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    useDirectApi: false,
    uploadUrl: result.uploadUrl,
    assetUrl: result.publicUrl,
    key,
    headers: result.headers,
  })
}
