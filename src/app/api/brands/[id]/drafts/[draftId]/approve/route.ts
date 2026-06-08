import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { submitDraftForDelivery } from '@/lib/draftSubmission'

type Params = { params: Promise<{ id: string; draftId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user || session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, draftId } = await params
  const ok = await canHumanAccessBrandProject(brandId, session.user.id, session.user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const result = await submitDraftForDelivery({
    brandId,
    draftId,
    actorId: session.user.id,
    forcePublish: true,
    note: typeof body.note === 'string' ? body.note.trim() || null : null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error, draft: result.draft }, { status: result.status })
  return NextResponse.json(result)
}
