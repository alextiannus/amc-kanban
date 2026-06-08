import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { submitDraftForDelivery } from '@/lib/draftSubmission'

type Params = { params: Promise<{ id: string; draftId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: brandId, draftId } = await params
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const result = await submitDraftForDelivery({
    brandId,
    draftId,
    actorId: actor.id,
    note: typeof body.note === 'string' ? body.note : null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error, draft: result.draft }, { status: result.status })
  return NextResponse.json(result)
}
