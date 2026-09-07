import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionWriteBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { completeInboxWrite, reserveInboxWrite } from '@/lib/postfastInbox'
import { postfastPrivateReplyInboxItem } from '@/lib/integrations/postfast'
import { writeAuditLog } from '@/lib/audit'

type Params = { params: Promise<{ id: string; conversationId: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const { id, conversationId } = await params
  if (!session?.user || session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Human write access required' }, { status: 403 })
  if (!await canSessionWriteBrandProject(id, session.user.id, 'HUMAN')) return NextResponse.json({ error: 'Unauthorized brand access' }, { status: 403 })
  const body = await request.json().catch(() => null) as { itemId?: string; text?: string; confirmed?: boolean; idempotencyKey?: string } | null
  const key = request.headers.get('idempotency-key') || body?.idempotencyKey
  if (!body?.itemId || !body.text?.trim() || body.confirmed !== true || !key) return NextResponse.json({ error: 'itemId, text, confirmed, and idempotency key required' }, { status: 400 })
  const item = await prisma.postfastInboxItem.findFirst({ where: { providerId: body.itemId, conversation: { brandId: id, providerId: conversationId, platform: 'instagram' } } })
  if (!item) return NextResponse.json({ error: 'Instagram inbox item not found' }, { status: 404 })
  if (!item.canPrivateReply || (item.replyWindowEndsAt && item.replyWindowEndsAt <= new Date())) return NextResponse.json({ error: 'PostFast does not allow a private reply for this item' }, { status: 409 })
  if (item.maxPrivateReplyLengthBytes && Buffer.byteLength(body.text, 'utf8') > item.maxPrivateReplyLengthBytes) return NextResponse.json({ error: `Reply exceeds PostFast maximum byte length (${item.maxPrivateReplyLengthBytes})` }, { status: 400 })
  const brand = await prisma.brand.findUnique({ where: { id }, select: { postfastApiKey: true } })
  if (!brand?.postfastApiKey) return NextResponse.json({ error: 'PostFast not configured' }, { status: 422 })
  const scope = `postfast-inbox:private-reply:${id}:${body.itemId}`
  const reservation = await reserveInboxWrite({ scope, key, payload: { text: body.text } })
  if ('conflict' in reservation) return NextResponse.json({ error: 'Idempotency key conflict' }, { status: 409 })
  if ('replay' in reservation) return NextResponse.json(reservation.replay || { error: 'Request outcome is pending' }, { status: reservation.replay ? 200 : 409 })
  if ('pending' in reservation) return NextResponse.json({ error: 'Request outcome is pending' }, { status: 409 })
  const result = await postfastPrivateReplyInboxItem({ apiKey: brand.postfastApiKey, itemId: body.itemId, text: body.text, idempotencyKey: key })
  if (!result.success && result.status === 0) {
    return NextResponse.json({ error: 'PostFast request outcome is unknown. Retry with the same idempotency key after the reservation lease.' }, { status: 503 })
  }
  const response = result.success ? { ok: true } : { error: result.error || 'PostFast private reply failed' }
  await completeInboxWrite(scope, key, response, result.success ? 200 : 502)
  if (result.success) await writeAuditLog({
    actor: { id: session.user.id, type: 'HUMAN' }, action: 'POSTFAST_INBOX_PRIVATE_REPLY',
    resourceId: item.id, resourceType: 'PostfastInboxItem', metadata: { brandId: id, conversationId, providerItemId: body.itemId },
  })
  return NextResponse.json(response, { status: result.success ? 200 : 502 })
}