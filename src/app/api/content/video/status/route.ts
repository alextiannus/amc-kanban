import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { refreshVideoGenerationTask } from '@/lib/videoGeneration'

export const maxDuration = 60

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function POST(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
    const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : ''
    const title = typeof body?.title === 'string' ? body.title.trim() : undefined

    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 })

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const execution = await refreshVideoGenerationTask({
      brandId,
      actorId: actor.id,
      taskId,
      title,
    })

    return NextResponse.json({ success: true, execution })
  } catch (err: any) {
    console.error('[VideoStatus] failed:', err)
    return NextResponse.json({ error: err.message || 'Video status check failed' }, { status: 500 })
  }
}
