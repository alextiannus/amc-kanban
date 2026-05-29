import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  appendMessage,
  getOrCreateConversation,
  listMessages,
} from '@/lib/chat/conversationStore'

export const dynamic = 'force-dynamic'

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function pickAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as Record<string, unknown>

  const direct = data.reply ?? data.message ?? data.content ?? data.text
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  if (Array.isArray(data.messages)) {
    const assistant = [...data.messages].reverse().find((m) => {
      if (!m || typeof m !== 'object') return false
      const item = m as Record<string, unknown>
      return item.role === 'assistant' && typeof item.content === 'string' && item.content.trim()
    }) as Record<string, unknown> | undefined
    if (assistant && typeof assistant.content === 'string') return assistant.content.trim()
  }

  return ''
}

async function resolveWebhookUrl(input: { brandId?: string; webhookUrl?: string }) {
  if (input.webhookUrl && /^https?:\/\//.test(input.webhookUrl.trim())) {
    return input.webhookUrl.trim()
  }

  if (input.brandId) {
    const link = await prisma.brandAgent.findFirst({
      where: {
        brandId: input.brandId,
        active: true,
        agent: {
          type: 'AI_AGENT',
          agentProvider: 'OPENCLAW',
          chatLink: { not: null },
        },
      },
      select: {
        agent: {
          select: {
            chatLink: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const maybeUrl = link?.agent?.chatLink?.trim()
    if (maybeUrl && /^https?:\/\//.test(maybeUrl)) return maybeUrl
  }

  const envUrl = process.env.OPENCLAW_WEBHOOK_URL?.trim()
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl

  return null
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const brandId = typeof body?.brandId === 'string' ? body.brandId : undefined
  const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : undefined
  const webhookUrl = typeof body?.webhookUrl === 'string' ? body.webhookUrl : undefined

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const resolvedWebhookUrl = await resolveWebhookUrl({ brandId, webhookUrl })
  if (!resolvedWebhookUrl) {
    return NextResponse.json({ error: 'Openclaw webhook URL is not configured' }, { status: 400 })
  }

  const conversation = getOrCreateConversation({
    conversationId,
    brandId,
    taskId,
    userId: session.user.id,
  })

  appendMessage(conversation.id, {
    role: 'user',
    content: message,
    brandId,
    taskId,
    userId: session.user.id,
  })

  const outboundPayload = {
    conversationId: conversation.id,
    message,
    brandId,
    taskId,
    userId: session.user.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    },
    source: 'amc-kanban',
    timestamp: new Date().toISOString(),
  }

  let webhookStatus = 0
  let webhookBody: unknown = null

  try {
    const response = await fetch(resolvedWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outboundPayload),
      signal: AbortSignal.timeout(20_000),
    })

    webhookStatus = response.status
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      webhookBody = await response.json()
    } else {
      webhookBody = { text: await response.text() }
    }

    if (!response.ok) {
      const details = asText(webhookBody)
      return NextResponse.json(
        {
          error: 'Webhook request failed',
          webhookStatus,
          details,
          conversationId: conversation.id,
        },
        { status: 502 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to reach webhook',
        details: error instanceof Error ? error.message : 'Unknown error',
        conversationId: conversation.id,
      },
      { status: 502 }
    )
  }

  const assistantReply = pickAssistantText(webhookBody) || '收到消息，我正在处理中。'

  appendMessage(conversation.id, {
    role: 'assistant',
    content: assistantReply,
    brandId,
    taskId,
    userId: session.user.id,
  })

  return NextResponse.json({
    ok: true,
    conversationId: conversation.id,
    reply: assistantReply,
    webhookStatus,
    messages: listMessages(conversation.id),
  })
}
