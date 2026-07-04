import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { submitDraftForDelivery } from '@/lib/draftSubmission'

type Params = { params: Promise<{ id: string; draftId: string }> }

async function handleApprove(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, draftId } = await params
  const ok = await canWriteBrandProject(brandId, session.user.id)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const result = await submitDraftForDelivery({
    brandId,
    draftId,
    actorId: session.user.id,
    forcePublish: true,
    note: typeof body.note === 'string' ? body.note.trim() || null : null,
    immediatePublish: body.publishType === 'immediate',
  })

  if (!result.ok) return NextResponse.json({ error: result.error, draft: result.draft }, { status: result.status })
  return NextResponse.json(result)
}

export const POST = handleApprove
export const PATCH = handleApprove
