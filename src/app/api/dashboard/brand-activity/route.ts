import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  const ownerLinks = await prisma.brandOwner.findMany({
    where: { userId },
    select: { brandId: true },
  })
  const ownerBrandIds = ownerLinks.map((link: any) => link.brandId)
  const legacyBrands = await prisma.brand.findMany({
    where: { ownerId: userId, id: { notIn: ownerBrandIds } },
    select: { id: true },
  })

  return [...ownerBrandIds, ...legacyBrands.map((brand: any) => brand.id)]
}

/**
 * GET /api/dashboard/brand-activity
 * Returns the last published date for each accessible brand.
 * Response: { brands: [{ id, name, lastPublishedAt: ISO string | null }] }
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brandIds = await getAccessibleBrandIds(
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role
  )

  if (brandIds.length === 0) return NextResponse.json({ brands: [] })

  // Fetch the most recent published draft for each brand
  const latestPublished = await prisma.contentDraft.findMany({
    where: {
      brandId: { in: brandIds },
      status: 'published',
      publishedAt: { not: null },
    },
    select: {
      brandId: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: 'desc' },
  })

  // Group by brandId → keep only the latest
  const lastPublishedByBrand = new Map<string, string>()
  for (const draft of latestPublished) {
    if (!lastPublishedByBrand.has(draft.brandId) && draft.publishedAt) {
      lastPublishedByBrand.set(draft.brandId, draft.publishedAt.toISOString())
    }
  }

  const brands = await prisma.brand.findMany({
    where: { id: { in: brandIds } },
    select: { id: true, name: true },
  })

  return NextResponse.json({
    brands: brands.map((b: any) => ({
      id: b.id,
      name: b.name,
      lastPublishedAt: lastPublishedByBrand.get(b.id) ?? null,
    })),
  })
}
