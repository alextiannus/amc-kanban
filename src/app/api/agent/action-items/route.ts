import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'

// Authenticate by Agent apiKey in Authorization header
async function getAgent(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace('Bearer ', '').trim()
  if (!key) return null
  return prisma.user.findFirst({ where: { apiKey: key, type: 'AI_AGENT' } })
}

// POST /api/agent/action-items
// Agent pushes a new action item (diff review alert, content approval request, etc.)
// Body: { brandId, accountId?, type, priority?, title, description, payload?, draftData? }
export async function POST(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { brandId, accountId, type, priority, title, description, payload, draftData } = body

  if (!brandId || !type || !title || !description) {
    return NextResponse.json({ error: 'brandId, type, title, description required' }, { status: 400 })
  }

  // Verify brand exists (no ownership check — agent trusts the brand assigned to it)
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  let draftId: string | undefined

  // If agent includes draft content, create the draft first
  if (draftData && type === 'content_approval') {
    const draft = await prisma.contentDraft.create({
      data: {
        brandId,
        accountId: accountId || null,
        caption: draftData.caption || '',
        captionLang: draftData.captionLang || 'en',
        mediaUrls: draftData.mediaUrls || [],
        hashtags: draftData.hashtags || [],
        scheduledAt: draftData.scheduledAt ? new Date(draftData.scheduledAt) : null,
        status: 'pending_review',
        agentId: agent.id,
        agentNote: draftData.agentNote || null,
      },
    })
    draftId = draft.id
  }

  const item = await prisma.actionItem.create({
    data: {
      brandId,
      accountId: accountId || null,
      type,
      priority: priority || 'normal',
      title,
      description,
      payload: payload || null,
      agentId: agent.id,
      draftId: draftId || null,
      // autoPilot: if brand has autoPilot ON, immediately auto-approve
      status: brand.autoPilot ? 'auto_resolved' : 'pending',
      resolvedAt: brand.autoPilot ? new Date() : null,
      resolvedBy: brand.autoPilot ? 'auto_pilot' : null,
    },
  })

  // If brand is in autoPilot and this is content_approval — advance draft immediately
  if (brand.autoPilot && draftId) {
    await prisma.contentDraft.update({
      where: { id: draftId },
      data: { status: 'publishing' },
    })
  }

  // Push SSE to connected dashboard clients
  eventEmitter.emit('board_update')

  return NextResponse.json(item, { status: 201 })
}
