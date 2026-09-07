import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { completeInboxWrite, reserveInboxWrite } from '@/lib/postfastInbox'
import { postfastSetInboxItemState } from '@/lib/integrations/postfast'
import { writeAuditLog } from '@/lib/audit'

type Params = { params: Promise<{ id: string; conversationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const { id, conversationId } = await params
  if (!session?.user || session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Human write access required' }, { status: 403 })
  if (!await canSessionWriteBrandProject(id, session.user.id, 'HUMAN')) return NextResponse.json({ error: 'Unauthorized brand access' }, { status: 403 })
  const body = await request.json().catch(() => null) as { itemId?: string; state?: string; confirmed?: boolean; confirmDelete?: boolean; idempotencyKey?: string } | null
  const key = request.headers.get('idempotency-key') || body?.idempotencyKey
  if (!body?.itemId || !body.state?.trim() || body.confirmed !== true || !key) return NextResponse.json({ error: 'itemId, state, confirmed, and idempotency key required' }, { status: 400 })
  const state = body.state.trim().toUpperCase()
  if (state !== 'HIDE' && state !== 'UNHIDE' && state !== 'DELETE') return NextResponse.json({ error: 'state must be HIDE, UNHIDE, or DELETE' }, { status: 400 })
  if (state === 'DELETE' && body.confirmDelete !== true) return NextResponse.json({ error: 'confirmDelete must be true when deleting a comment' }, { status: 400 })
  const item = await prisma.postfastInboxItem.findFirst({ where: { providerId: body.itemId, conversation: { brandId: id, providerId: conversationId } } })
  if (!item) return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 })
  const brand = await prisma.brand.findUnique({ where: { id }, select: { postfastApiKey: true } })
  if (!brand?.postfastApiKey) return NextResponse.json({ error: 'PostFast not configured' }, { status: 422 })
  const scope = `postfast-inbox:state:${id}:${body.itemId}`
  const reservation = await reserveInboxWrite({ scope, key, payload: { state, confirmDelete: body.confirmDelete === true } })
  if ('conflict' in reservation) return NextResponse.json({ error: 'Idempotency key conflict' }, { status: 409 })
  if ('replay' in reservation) return NextResponse.json(reservation.replay || { error: 'Request outcome is pending' }, { status: reservation.replay ? 200 : 409 })
  if ('pending' in reservation) return NextResponse.json({ error: 'Request outcome is pending' }, { status: 409 })
  const result = await postfastSetInboxItemState({ apiKey: brand.postfastApiKey, itemId: body.itemId, state, idempotencyKey: key })
  if (!result.success && result.status === 0) {
    return NextResponse.json({ error: 'PostFast request outcome is unknown. Retry with the same idempotency key after the reservation lease.' }, { status: 503 })
  }
  const response = result.success ? { ok: true, state } : { error: result.error || 'PostFast state update failed' }
  await completeInboxWrite(scope, key, response, result.success ? 200 : 502)
  if (result.success) {
    await prisma.postfastInboxItem.update({ where: { id: item.id }, data: { state } })
    await writeAuditLog({
      actor: { id: session.user.id, type: 'HUMAN' }, action: 'POSTFAST_INBOX_MODERATION',
      resourceId: item.id, resourceType: 'PostfastInboxItem', oldValue: { state: item.state }, newValue: { state },
      metadata: { brandId: id, conversationId, providerItemId: body.itemId },
    })
  }
  return NextResponse.json(response, { status: result.success ? 200 : 502 })
}