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

// GET /api/dashboard/calendar?month=YYYY-MM
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const month = url.searchParams.get('month')
  const monthDate = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date()
  const year = monthDate.getUTCFullYear()
  const monthIndex = monthDate.getUTCMonth()
  const rangeStart = new Date(Date.UTC(year, monthIndex, 1))
  const rangeEnd = new Date(Date.UTC(year, monthIndex + 1, 1))

  const brandIds = await getAccessibleBrandIds(session.user.id, session.user.type ?? 'HUMAN', session.user.role)
  if (brandIds.length === 0) return NextResponse.json({ events: [] })

  const drafts = await prisma.contentDraft.findMany({
    where: {
      brandId: { in: brandIds },
      scheduledAt: { gte: rangeStart, lt: rangeEnd },
    },
    include: {
      brand: { select: { id: true, name: true } },
      account: { select: { platformId: true, handle: true, displayName: true } },
    },
    orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'desc' }],
  })

  const events = drafts.map(draft => {
    const scheduledAt = draft.scheduledAt ?? draft.updatedAt
    const platform = draft.account?.platformId || '全平台'
    const status = draft.status === 'published'
      ? 'done'
      : draft.status === 'publishing'
        ? 'scheduled'
        : draft.status === 'pending_review'
          ? 'pending'
          : 'scheduled'

    return {
      id: draft.id,
      brandId: draft.brandId,
      brandName: draft.brand.name,
      platform,
      title: draft.caption,
      status,
      time: scheduledAt.toISOString(),
      scheduledAt: scheduledAt.toISOString(),
      mediaUrls: draft.mediaUrls,
      captionLang: draft.captionLang,
    }
  })

  return NextResponse.json({ events })
}