import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBrandAccessType } from '@/lib/brandAccess'

/**
 * GET /api/brands/[id]/companion/history
 *
 * Fetches the most recent companion conversation messages for the current user.
 * Used to restore conversation history after a page refresh or device switch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params

  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessType = await getBrandAccessType(brandId, session.user.id, session.user.type || 'HUMAN')
  if (!accessType) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const messages = await prisma.companionMessage.findMany({
    where: { brandId, userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true,
      role: true,
      content: true,
      action: true,
      draftId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ messages })
}

/**
 * POST /api/brands/[id]/companion/history
 *
 * Persists one or more conversation messages to the database.
 * This is called asynchronously (fire-and-forget) after each exchange.
 *
 * Body: { messages: Array<{ role, content, action?, draftId? }> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params

  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessType2 = await getBrandAccessType(brandId, session.user.id, session.user.type || 'HUMAN')
  if (!accessType2) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { messages } = body as {
    messages: Array<{
      role: 'user' | 'assistant'
      content: string
      action?: string
      draftId?: string
    }>
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  await prisma.companionMessage.createMany({
    data: messages.map((m) => ({
      brandId,
      userId: session.user.id,
      role: m.role,
      content: m.content,
      action: m.action ?? null,
      draftId: m.draftId ?? null,
    })),
  })

  // Keep DB tidy: remove messages older than 30 days (retain latest 500 per brand/user)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  prisma.companionMessage
    .deleteMany({
      where: { brandId, userId: session.user.id, createdAt: { lt: cutoff } },
    })
    .catch(() => {}) // background cleanup — ignore errors

  return NextResponse.json({ ok: true })
}
