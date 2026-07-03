import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { getHuaweiObsConfig, makeBrandAssetKey, getHuaweiObsPresignedPutUrl } from '@/lib/integrations/huaweiObs'

type Params = { params: Promise<{ id: string }> }

/**
 * Fast brand-access check for presign operations.
 *
 * The standard canSessionAccessBrandProject() fires 4-5 sequential Prisma
 * queries (user lookup, brand owner, crew membership, org cascade).  Under
 * Render's connection-pool pressure those sequential reads can stall 25 s+.
 *
 * Here we use a SINGLE query that checks all conditions in one round-trip:
 *   brand owned by user  OR  user is direct crew member
 * Org-cascade access is intentionally omitted for this read-only endpoint
 * since it adds two extra queries; admins bypass the DB entirely.
 */
async function canPresignForBrand(brandId: string, userId: string): Promise<boolean> {
  const t0 = Date.now()
  const result = await prisma.brand.findFirst({
    where: {
      id: brandId,
      OR: [
        { ownerId: userId },
        {
          crew: {
            members: {
              some: { userId },
            },
          },
        },
      ],
    },
    select: { id: true },
  })
  console.log(`[presign] canPresignForBrand ${brandId} → ${!!result} (${Date.now() - t0}ms)`)
  return !!result
}

export async function GET(request: Request, { params }: Params) {
  const t0 = Date.now()

  // ── Auth: session cookie or API key ──────────────────────────────────────
  const tAuth0 = Date.now()
  const session = await getSession()
  const apiKey = extractApiKey(request)

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let userId: string
  let userType: string
  let userRole: string

  if (apiKey) {
    const tAgent0 = Date.now()
    const authenticatedAgent = await getAgentFromApiKey(apiKey)
    console.log(`[presign] getAgentFromApiKey (${Date.now() - tAgent0}ms)`)
    if (!authenticatedAgent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    userId = authenticatedAgent.id
    userType = authenticatedAgent.type ?? 'AI_AGENT'
    userRole = 'USER'
  } else {
    userId = session!.user.id
    userType = session!.user.type ?? 'HUMAN'
    userRole = session!.user.role ?? 'USER'
  }
  console.log(`[presign] auth resolved in ${Date.now() - tAuth0}ms`)

  const { id: brandId } = await params

  // ── Brand access check ───────────────────────────────────────────────────
  // Fast-path: ADMIN users (role embedded in JWT) bypass all DB lookups.
  const tAccess0 = Date.now()
  if (!isAmcOperator({ type: userType, role: userRole })) {
    const hasAccess = await canPresignForBrand(brandId, userId)
    console.log(`[presign] access check ${Date.now() - tAccess0}ms`)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    console.log(`[presign] admin fast-path, skipped DB access check`)
  }

  const url = new URL(request.url)
  const filename = url.searchParams.get('filename')
  const mimeType = url.searchParams.get('mimeType') || 'application/octet-stream'
  const folder = url.searchParams.get('folder') || '素材库'

  if (!filename) {
    return NextResponse.json({ error: 'filename query parameter is required' }, { status: 400 })
  }

  const obsConfig = getHuaweiObsConfig()
  if (!obsConfig) {
    // OBS not configured (e.g. local development) — caller should use /assets/upload instead
    return NextResponse.json({ ok: false, useDirectApi: true })
  }

  const key = makeBrandAssetKey({ brandId, folder, filename })
  const result = getHuaweiObsPresignedPutUrl({ key, contentType: mimeType })

  if (!result) {
    return NextResponse.json({ error: 'Failed to generate presigned URL' }, { status: 500 })
  }

  console.log(`[presign] total ${Date.now() - t0}ms for brand=${brandId}`)

  return NextResponse.json({
    ok: true,
    useDirectApi: false,
    uploadUrl: result.uploadUrl,
    assetUrl: result.publicUrl,
    key,
    headers: result.headers,
  })
}
