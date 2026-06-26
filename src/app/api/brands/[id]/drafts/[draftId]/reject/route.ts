import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string; draftId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user || session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, draftId } = await params
  const ok = await canHumanAccessBrandProject(brandId, session.user.id, session.user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) return NextResponse.json({ error: 'note is required' }, { status: 400 })

  const draft = await prisma.contentDraft.findFirst({ where: { id: draftId, brandId }, select: { id: true } })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.$transaction(async (tx: any) => {
    const nextDraft = await tx.contentDraft.update({
      where: { id: draftId },
      data: { status: 'draft', rejectionNote: note },
      include: {
        account: { select: { id: true, platformId: true, handle: true, displayName: true } },
        assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
      },
    })

    await tx.actionItem.updateMany({
      where: { draftId, brandId, status: 'pending' },
      data: {
        status: 'rejected',
        resolvedAt: new Date(),
        resolvedBy: session.user.id,
        resolvedNote: note,
      },
    })

    return nextDraft
  })

  return NextResponse.json({ ok: true, draft: updated })
}
