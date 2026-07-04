import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { callLLMChat, type ChatMessage } from '@/lib/llmRouter'

export const dynamic = 'force-dynamic'

/**
 * POST /api/llm/chat
 *
 * Generic server-side LLM chat endpoint.
 * Replaces the old browser-direct Gemini calls (gemini-direct.ts) — keys never
 * leave the server. Routes through LLMConfig for any configured model.
 *
 * Request body:
 *   systemPrompt  string          System context / persona
 *   history       ChatTurn[]      Previous turns ({ role: 'user'|'model', content: string })
 *   message       string          Latest user message
 *   taskTag?      string          LLMConfig task tag (default: 'companion')
 *   maxTokens?    number          Max output tokens (default: 500)
 *
 * Response (same shape as DirectChatResult from gemini-direct.ts):
 *   { reply, action, params?, direct: false }
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let systemPrompt = ''
  let history: Array<{ role: string; content: string }> = []
  let message = ''
  let taskTag = 'companion'
  let maxTokens = 500

  try {
    const body = await req.json()
    systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : ''
    history = Array.isArray(body.history) ? body.history : []
    message = typeof body.message === 'string' ? body.message.trim() : ''
    taskTag = typeof body.taskTag === 'string' ? body.taskTag : 'companion'
    maxTokens = typeof body.maxTokens === 'number' ? body.maxTokens : 500
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  // Build OpenAI-style messages array
  const messages: ChatMessage[] = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  // Accept both 'user'/'model' (Gemini style) and 'user'/'assistant' (OpenAI style) in history
  for (const turn of history.slice(-10)) {
    const role = turn.role === 'user' ? 'user' : 'assistant'
    messages.push({ role, content: turn.content })
  }
  messages.push({ role: 'user', content: message })

  const result = await callLLMChat(taskTag, messages, maxTokens)

  if (!result.text) {
    return NextResponse.json(
      { reply: '抱歉，AI 服务暂时不可用，请稍后再试。', action: 'NONE', params: {}, direct: false },
      { status: 200 }
    )
  }

  // Parse structured JSON response (action + params) if present
  let reply = result.text
  let action = 'NONE'
  let params: Record<string, any> = {}

  try {
    const cleaned = reply.replace(/```json/g, '').replace(/```/g, '').trim()
    if (cleaned.startsWith('{')) {
      const parsed = JSON.parse(cleaned)
      if (parsed.reply) {
        reply = parsed.reply
        action = parsed.action || 'NONE'
        params = parsed.params || {}
      }
    }
  } catch {
    // Plain text — no JSON wrapper
  }

  return NextResponse.json({ reply, action, params, direct: false })
}
