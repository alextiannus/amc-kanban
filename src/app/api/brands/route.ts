import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/brands — list brands for the logged-in user
// - HUMAN users: brands they own (ownerId)
// - AI_AGENT users: brands linked via BrandAgent table
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountsSelect = {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      platformId: true,
      handle: true,
      displayName: true,
      autoPilot: true,
      followerCount: true,
      followerDelta: true,
      ratingScore: true,
      snapshotAt: true,
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
          brand: {
            include: { accounts: accountsSelect, _count: countsSelect },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
      return NextResponse.json(agentLinks.map(l => l.brand))
    }

    // Human user — return brands they own
    const brands = await prisma.brand.findMany({
      where: { ownerId: session.user.id },
      include: {
        accounts: accountsSelect,
        _count: countsSelect,
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(brands)
  } catch (e: any) {
    console.error('[GET /api/brands]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/brands — create a new brand
export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, location, timezone } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // 1. Create brand record first
  const brand = await prisma.brand.create({
    data: {
      ownerId: session.user.id,
      name: name.trim(),
      location: location?.trim() || null,
      timezone: timezone || 'America/New_York',
    },
  })

  // Brand record created — Lark workspace will be auto-created when the brand's
  // Lark credentials are saved for the first time via PATCH /api/brands/[id]/settings
  return NextResponse.json(brand, { status: 201 })
}
