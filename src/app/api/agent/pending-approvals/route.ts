import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest, requireCapability } from '@/lib/auth-v2'

async function getAgent(request: Request) {
  const principal = await authenticateRequest(request)
  return principal
}

// GET /api/agent/pending-approvals
// Agent polls for approved drafts ready to publish (status = "publishing")
// Returns drafts with account info for PostFast to use
export async function GET(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (brandId) {
    try {
      await requireCapability(agent, 'draft.read', { brandId })
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const drafts = await prisma.contentDraft.findMany({
    where: {
      status: 'publishing',
      agentId: agent.userId,
      ...(brandId ? { brandId } : {}),
    },
    include: {
      account: {
        select: { platformId: true, handle: true, accessToken: true },
      },
      assetRefs: {
        include: { asset: { select: { url: true, mimeType: true } } },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { updatedAt: 'asc' },
    take: 20,
  })

  return NextResponse.json(drafts)
}

// POST /api/agent/pending-approvals — Agent reports publish result
// Body: { draftId, success, platformPostId?, error? }
export async function POST(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { draftId, success, platformPostId, postUrl, error } = body

  if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

  const draft = await prisma.contentDraft.findFirst({
    where: { id: draftId, agentId: agent.userId },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  try {
    await requireCapability(agent, 'content.publish', { brandId: draft.brandId })
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.contentDraft.update({
    where: { id: draftId },
    data: success
      ? { status: 'published', publishedAt: new Date(), platformPostId: platformPostId || null, postUrl: postUrl || null }
      : { status: 'draft', agentNote: `发布失败: ${error || 'unknown error'}` },
  })

  return NextResponse.json({ ok: true })
}
