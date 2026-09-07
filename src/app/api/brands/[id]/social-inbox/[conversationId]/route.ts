import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; conversationId: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await getSession()
  const { id, conversationId } = await params
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await canSessionAccessBrandProject(id, session.user.id, session.user.type ?? 'HUMAN', session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized brand access' }, { status: 403 })
  }
  const conversation = await prisma.postfastInboxConversation.findUnique({
    where: { brandId_providerId: { brandId: id, providerId: conversationId } },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  })
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  return NextResponse.json(conversation)
}