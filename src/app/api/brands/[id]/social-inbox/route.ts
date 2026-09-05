import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: Params) {
  const session = await getSession()
  const { id } = await params
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await canSessionAccessBrandProject(id, session.user.id, session.user.type ?? 'HUMAN', session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized brand access' }, { status: 403 })
  }
  const conversations = await prisma.postfastInboxConversation.findMany({
    where: { brandId: id },
    orderBy: [{ needsAttention: 'desc' }, { unreadCount: 'desc' }, { lastMessageAt: 'desc' }],
  })
  return NextResponse.json({ conversations })
}