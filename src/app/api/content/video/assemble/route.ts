import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { assembleVideoClips } from '@/lib/videoGeneration'

export const maxDuration = 120

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
    const title = typeof body?.title === 'string' ? body.title.trim() : '最终成片'
    const aspectRatio = typeof body?.aspectRatio === 'string' ? body.aspectRatio.trim() : '9:16'
    const clipUrls = Array.isArray(body?.clipUrls)
      ? body.clipUrls.map((item: unknown) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
      : []
    const scriptSummary = typeof body?.scriptSummary === 'string' ? body.scriptSummary.trim() : undefined

    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    if (clipUrls.length < 2) return NextResponse.json({ error: '至少选择两个已生成分镜视频。' }, { status: 400 })

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const execution = await assembleVideoClips({
      brandId,
      actorId: actor.id,
      title,
      clipUrls,
      aspectRatio,
      scriptSummary,
    })

    return NextResponse.json({ success: true, execution })
  } catch (err: any) {
    console.error('[VideoAssemble] failed:', err)
    return NextResponse.json({ error: err.message || 'Video assembly failed' }, { status: 500 })
  }
}
