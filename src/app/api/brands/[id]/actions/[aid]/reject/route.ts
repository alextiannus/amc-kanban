import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'

type Params = { params: Promise<{ id: string; aid: string }> }

// PATCH /api/brands/[id]/actions/[aid]/reject
// Body: { note?: string } — optional reason sent back to Agent
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, aid } = await params

  const brand = await prisma.brand.findFirst({ where: { id: brandId, ownerId: session.user.id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await prisma.actionItem.findFirst({ where: { id: aid, brandId } })
  if (!item) return NextResponse.json({ error: 'Action item not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 409 })

  const body = await request.json().catch(() => ({}))

  const resolved = await prisma.actionItem.update({
    where: { id: aid },
    data: {
      status: 'rejected',
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
      resolvedNote: body.note || null,
    },
  })

  // If linked to a content draft → reset to draft so Agent can rewrite
  if (item.draftId) {
    await prisma.contentDraft.update({
      where: { id: item.draftId },
      data: {
        status: 'draft',
        rejectionNote: body.note || '老板驳回，请重新生成',
      },
    })
    // TODO Phase 4: notify Agent via webhook/polling that draft needs rewrite
  }

  eventEmitter.emit('board_update')

  return NextResponse.json(resolved)
}
