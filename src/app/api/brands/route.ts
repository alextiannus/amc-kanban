import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createBrandWorkspace } from '@/lib/integrations/lark'

// GET /api/brands — list all brands for the logged-in user
export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const brands = await prisma.brand.findMany({
      where: { ownerId: session.user.id },
      include: {
        accounts: {
          orderBy: { createdAt: 'asc' },
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
        },
        _count: {
          select: {
            actionItems: { where: { status: 'pending' } },
            contents: { where: { status: 'pending_review' } },
          },
        },
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

  // 2. Auto-create Lark workspace folder (non-blocking — brand is returned regardless)
  try {
    const workspace = await createBrandWorkspace(brand.name)
    if (workspace.success && workspace.folderToken) {
      await prisma.brand.update({
        where: { id: brand.id },
        data: { larkDriveFolderId: workspace.folderToken },
      })
      console.log(`[Brand] Created Lark workspace for "${brand.name}": ${workspace.folderUrl}`)
      return NextResponse.json({ ...brand, larkDriveFolderId: workspace.folderToken, larkFolderUrl: workspace.folderUrl }, { status: 201 })
    } else {
      // Lark not configured or failed — still return brand without workspace
      console.warn(`[Brand] Lark workspace not created: ${workspace.error}`)
    }
  } catch (e) {
    console.warn('[Brand] Lark workspace creation failed (non-fatal):', e)
  }

  return NextResponse.json(brand, { status: 201 })
}
