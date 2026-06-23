import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLarkTenantToken, LARK_BASE } from '@/lib/integrations/lark'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ fileToken: string }> }

export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fileToken } = await params
  if (!fileToken) {
    return NextResponse.json({ error: 'fileToken is required' }, { status: 400 })
  }

  // 1. Find the MediaAsset that contains this fileToken in its URL
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      OR: [
        { url: fileToken },
        { url: { contains: fileToken } }
      ]
    },
    include: {
      brand: {
        select: {
          id: true,
          larkAppId: true,
          larkAppSecret: true,
        }
      }
    }
  })

  if (!asset) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // 2. Verify authorization
  const isAuthorized = await canSessionAccessBrandProject(
    asset.brandId,
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role
  )

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { larkAppId, larkAppSecret } = asset.brand
  if (!larkAppId || !larkAppSecret) {
    return NextResponse.json({ error: 'Lark integration is not configured' }, { status: 422 })
  }

  // 3. Fetch tenant access token
  const token = await getLarkTenantToken(larkAppId, larkAppSecret)
  if (!token) {
    return NextResponse.json({ error: 'Failed to retrieve Lark tenant token' }, { status: 500 })
  }

  // 4. Download file from Lark
  try {
    const res = await fetch(`${LARK_BASE}/drive/v1/medias/${fileToken}/download`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Lark API returned ${res.status}` }, { status: res.status })
    }

    const buffer = await res.arrayBuffer()
    return new Response(Buffer.from(buffer), {
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  } catch (error: any) {
    console.error('[Lark Proxy] Error downloading media file:', error)
    return NextResponse.json({ error: error?.message || 'Failed to download file from Lark' }, { status: 500 })
  }
}
