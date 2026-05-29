import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getConversation, listMessages } from '@/lib/chat/conversationStore'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { conversationId } = await params
  const conversation = getConversation(conversationId)

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  if (conversation.userId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    conversationId,
    brandId: conversation.brandId,
    taskId: conversation.taskId,
    messages: listMessages(conversationId),
    updatedAt: conversation.updatedAt,
  })
}
