import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { archiveTopicFeed, getTopicFeed, updateTopicFeed } from '@/lib/topicFeed'

type Params = { params: Promise<{ id: string; topicId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

async function ensureAccess(request: Request, brandId: string) {
  const actor = await getActor(request)
  if (!actor) return null
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  return ok ? actor : null
}

export async function GET(request: Request, { params }: Params) {
  const { id: brandId, topicId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const topic = await getTopicFeed(brandId, topicId)
  if (!topic) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ topic })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: brandId, topicId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (actor.type !== 'AI_AGENT') return NextResponse.json({ error: 'Hot Topics can only be updated by AMC Agents through API/MCP' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const result = await updateTopicFeed({
    brandId,
    topicId,
    title: body.title,
    markdown: body.markdown,
    summary: body.summary,
    tags: body.tags,
    sourceUrl: body.sourceUrl,
    status: body.status,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, topic: result.topic })
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: brandId, topicId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (actor.type !== 'AI_AGENT') return NextResponse.json({ error: 'Hot Topics can only be archived by AMC Agents through API/MCP' }, { status: 403 })

  const result = await archiveTopicFeed(brandId, topicId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, topic: result.topic })
}
