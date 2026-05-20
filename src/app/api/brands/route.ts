import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/brands — list brands for the logged-in user
// - HUMAN users: brands they own (BrandOwner join table)
// - AI_AGENT users: brands linked via BrandAgent table
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountsSelect = {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true, platformId: true, handle: true, displayName: true,
      autoPilot: true, followerCount: true, followerDelta: true,
      ratingScore: true, snapshotAt: true,
    },
  }
  const countsSelect = {
    select: {
      actionItems: { where: { status: 'pending' } },
      contents: { where: { status: 'pending_review' } },
    },
  }

  try {
    // AI Agent — return brands linked via BrandAgent join table
    if (session.user.type === 'AI_AGENT') {
      const agentLinks = await prisma.brandAgent.findMany({
        where: { agentId: session.user.id, active: true },
        include: {
          brand: { include: { accounts: accountsSelect, _count: countsSelect } },
        },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(agentLinks.map(l => l.brand))
    }

    // ADMIN human — see ALL brands across the system
    // (Agents may create brands with themselves as ownerId; admins need full visibility)
    if (session.user.role === 'ADMIN') {
      const allBrands = await prisma.brand.findMany({
        include: { accounts: accountsSelect, _count: countsSelect },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(allBrands)
    }

    // Regular human user — brands via BrandOwner join table
    const [ownerLinks, legacyOwnedBrands, delegatedAgentPermissions] = await Promise.all([
      prisma.brandOwner.findMany({
        where: { userId: session.user.id },
        include: {
          brand: { include: { accounts: accountsSelect, _count: countsSelect } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.brand.findMany({
        where: { ownerId: session.user.id },
        include: { accounts: accountsSelect, _count: countsSelect },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.agentPermission.findMany({
        where: { humanId: session.user.id },
        select: { agentId: true },
      }),
    ])

    const ownedBrandIds = new Set([
      ...ownerLinks.map((link) => link.brandId),
      ...legacyOwnedBrands.map((brand) => brand.id),
    ])

    const permittedAgentIds = delegatedAgentPermissions.map((perm) => perm.agentId)
    const delegatedBrandLinks = permittedAgentIds.length
      ? await prisma.brandAgent.findMany({
          where: {
            agentId: { in: permittedAgentIds },
            active: true,
            brandId: { notIn: [...ownedBrandIds] },
          },
          select: { brandId: true },
        })
      : []

    const delegatedBrandIds = Array.from(new Set(delegatedBrandLinks.map((link) => link.brandId)))
    const delegatedBrands = delegatedBrandIds.length
      ? await prisma.brand.findMany({
          where: { id: { in: delegatedBrandIds } },
          include: { accounts: accountsSelect, _count: countsSelect },
          orderBy: { createdAt: 'asc' },
        })
      : []

    return NextResponse.json([
      ...ownerLinks.map((link) => link.brand),
      ...legacyOwnedBrands,
      ...delegatedBrands,
    ])
  } catch (e: any) {
    console.error('[GET /api/brands]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/brands — create a new brand (human session required)
export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, location, timezone } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Create brand (ownerId kept for legacy compat)
  const brand = await prisma.brand.create({
    data: {
      ownerId: session.user.id,
      name: name.trim(),
      location: location?.trim() || null,
      timezone: timezone || 'America/New_York',
    },
  })

  // Add creator as first owner in multi-owner table
  await prisma.brandOwner.upsert({
    where: { brandId_userId: { brandId: brand.id, userId: session.user.id } },
    create: { brandId: brand.id, userId: session.user.id },
    update: {},
  })

  return NextResponse.json(brand, { status: 201 })
}
