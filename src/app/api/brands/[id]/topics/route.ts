import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { createTopicFeed, listTopicFeeds } from '@/lib/topicFeed'

type Params = { params: Promise<{ id: string }> }

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
  const { id: brandId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const topics = await listTopicFeeds({
    brandId,
    q: url.searchParams.get('q') || undefined,
    tag: url.searchParams.get('tag') || undefined,
    status: url.searchParams.get('status') || undefined,
    limit: Number(url.searchParams.get('limit') || 50),
  })

  return NextResponse.json({ topics })
}

export async function POST(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const result = await createTopicFeed({
    brandId,
    title: body.title,
    markdown: body.markdown,
    summary: body.summary,
    tags: body.tags,
    sourceUrl: body.sourceUrl,
    createdById: actor.id,
    createdByType: actor.type,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, topic: result.topic }, { status: 201 })
}
