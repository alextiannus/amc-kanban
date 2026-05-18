import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'

type Params = { params: Promise<{ id: string }> }

// GET /api/brands/[id]/actions — pending action items for the brand
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify ownership
  const brand = await prisma.brand.findFirst({ where: { id, ownerId: session.user.id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(_req.url)
  const statusFilter = url.searchParams.get('status') || 'pending'

  const items = await prisma.actionItem.findMany({
    where: { brandId: id, status: statusFilter },
    orderBy: [
      // urgent first, then high, then normal
      { priority: 'asc' },
      { createdAt: 'asc' },
    ],
    include: {
      account: { select: { platformId: true, handle: true, displayName: true } },
      draft: { select: { id: true, caption: true, mediaUrls: true, scheduledAt: true, captionLang: true } },
    },
  })

  return NextResponse.json(items)
}
