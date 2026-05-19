import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getAccessibleBrandIds(userId: string, userType: string, role: string) {
  if (userType === 'AI_AGENT') {
    const links = await prisma.brandAgent.findMany({
      where: { agentId: userId, active: true },
      select: { brandId: true },
    })
    return links.map(link => link.brandId)
  }

  if (role === 'ADMIN') {
    const brands = await prisma.brand.findMany({ select: { id: true } })
    return brands.map(brand => brand.id)
  }

  const ownerLinks = await prisma.brandOwner.findMany({
    where: { userId },
    select: { brandId: true },
  })
  const ownerBrandIds = ownerLinks.map(link => link.brandId)
  const legacyBrands = await prisma.brand.findMany({
    where: { ownerId: userId, id: { notIn: ownerBrandIds } },
    select: { id: true },
  })

  return [...ownerBrandIds, ...legacyBrands.map(brand => brand.id)]
}

// GET /api/dashboard/assets?brandId=<id>
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const requestedBrandId = url.searchParams.get('brandId')

  const brandIds = await getAccessibleBrandIds(session.user.id, session.user.type ?? 'HUMAN', session.user.role)
  if (brandIds.length === 0) return NextResponse.json({ assets: [] })

  const scopedBrandIds = requestedBrandId
    ? (brandIds.includes(requestedBrandId) ? [requestedBrandId] : [])
    : brandIds

  if (scopedBrandIds.length === 0) return NextResponse.json({ assets: [] })

  const [brands, assets] = await Promise.all([
    prisma.brand.findMany({
      where: { id: { in: scopedBrandIds } },
      select: { id: true, name: true },
    }),
    prisma.mediaAsset.findMany({
      where: { brandId: { in: scopedBrandIds } },
      include: {
        brand: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])

  const brandMap = new Map(brands.map(brand => [brand.id, brand.name]))
  const payload = assets.map(asset => ({
    id: asset.id,
    brandId: asset.brandId,
    brandName: brandMap.get(asset.brandId) || asset.brand.name,
    url: asset.url,
    filename: asset.filename,
    mimeType: asset.mimeType,
    aiTags: asset.aiTags,
    aiCategory: asset.aiCategory,
    aiCaption: asset.aiCaption,
    aiReady: asset.aiReady,
    usedCount: asset.usedCount,
    lastUsedAt: asset.lastUsedAt?.toISOString() ?? null,
    sourceType: asset.sourceType,
    createdAt: asset.createdAt.toISOString(),
  }))

  return NextResponse.json({ assets: payload })
}