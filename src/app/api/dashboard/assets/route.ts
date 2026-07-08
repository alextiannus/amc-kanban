import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

async function getAccessibleBrandIds(userId: string, userType: string, role: string) {
  if (userType === 'AI_AGENT') {
    const links = await prisma.brandAgent.findMany({
      where: { agentId: userId, active: true },
      select: { brandId: true },
    })
    return links.map((link: any) => link.brandId)
  }

  if (role === 'ADMIN') {
    const brands = await prisma.brand.findMany({ select: { id: true } })
    return brands.map((brand: any) => brand.id)
  }

  // Regular human user
  const [ownerLinks, legacyOwnedBrands, delegatedAgentPermissions, organizationMemberships] = await Promise.all([
    prisma.brandOwner.findMany({
      where: { userId },
      select: { brandId: true },
    }),
    prisma.brand.findMany({
      where: { ownerId: userId },
      select: { id: true },
    }),
    prisma.agentPermission.findMany({
      where: { humanId: userId },
      select: { agentId: true },
    }),
    prisma.organizationMember.findMany({
      where: { memberId: userId },
      select: { ownerId: true },
    }),
  ])

  const ownedBrandIds = new Set([
    ...ownerLinks.map((link: any) => link.brandId),
    ...legacyOwnedBrands.map((brand: any) => brand.id),
  ])

  const permittedAgentIds = delegatedAgentPermissions.map((perm: any) => perm.agentId)
  const delegatedBrandLinks = permittedAgentIds.length
    ? await prisma.brandAgent.findMany({
        where: {
          agentId: { in: permittedAgentIds },
          active: true,
        },
        select: { brandId: true },
      })
    : []

  const delegatedBrandIds = delegatedBrandLinks.map((link: any) => link.brandId)
  const organizationOwnerIds = organizationMemberships.map((m: any) => m.ownerId)

  let organizationBrandIds: string[] = []
  if (organizationOwnerIds.length > 0) {
    const organizationBrands = await prisma.brand.findMany({
      where: {
        OR: [
          { ownerId: { in: organizationOwnerIds } },
          {
            owners: {
              some: {
                role: 'owner',
                userId: { in: organizationOwnerIds },
              },
            },
          },
        ],
      },
      select: { id: true },
    })
    organizationBrandIds = organizationBrands.map((brand: any) => brand.id)
  }

  return Array.from(new Set([
    ...ownedBrandIds,
    ...delegatedBrandIds,
    ...organizationBrandIds,
  ]))
}

// GET /api/dashboard/assets?brandId=<id>
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const requestedBrandId = url.searchParams.get('brandId')

  let scopedBrandIds: string[] = []
  if (requestedBrandId) {
    const ok = await canSessionAccessBrandProject(requestedBrandId, session.user.id, session.user.type ?? 'HUMAN', session.user.role)
    scopedBrandIds = ok ? [requestedBrandId] : []
  } else {
    scopedBrandIds = await getAccessibleBrandIds(session.user.id, session.user.type ?? 'HUMAN', session.user.role)
  }

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

  const brandMap = new Map(brands.map((brand: any) => [brand.id, brand.name]))
  const payload = assets.map((asset: any) => ({
    id: asset.id,
    brandId: asset.brandId,
    brandName: brandMap.get(asset.brandId) || asset.brand.name,
    url: (() => {
      const url = asset.url || ''
      if (url.startsWith('http') || url.startsWith('/')) {
        return url
      }
      if (asset.sourceType === 'postfast') {
        return `/api/integrations/postfast/file/${asset.brandId}/${url}`
      }
      return url
    })(),
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