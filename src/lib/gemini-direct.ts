/**
 * gemini-direct.ts
 *
 * Server-routed LLM chat client.
 *
 * Previously called Gemini directly from the browser (key exposed in DevTools).
 * Now routes all calls through /api/llm/chat on the server, which picks the
 * best available model from LLMConfig (any provider: GLM, DeepSeek, Gemini, etc.)
 * The interface is unchanged — all callers continue to use callGeminiDirect().
 */

export interface DirectChatTurn {
  role: 'user' | 'model'
  content: string
}

export interface DirectChatResult {
  reply: string
  action: string
  toolCallName?: string
  toolCallArgs?: Record<string, any>
  params?: Record<string, any>
  /** Always false — calls now go through the server, not directly to an LLM */
  direct: boolean
}

/**
 * @deprecated No longer returns a usable key. Keys are server-side only.
 * Kept for backward compatibility — callers that prefetch this can be removed.
 */
export async function getClientGeminiKey(): Promise<string | null> {
  return null
}

/**
 * Call the server-side LLM chat endpoint, which routes through LLMConfig.
 * Functionally identical to the old direct Gemini call from the caller's perspective.
 * The API key never leaves the server. Any configured model can be used.
 */
export async function callGeminiDirect(
  systemPrompt: string,
  history: DirectChatTurn[],
  userMessage: string,
  _enableTools = true,  // reserved for future tool-calling support via server
  maxTokens = 500,
): Promise<DirectChatResult> {
  try {
    const t0 = Date.now()
    const response = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        history: history.map(t => ({ role: t.role, content: t.content })),
        message: userMessage,
        taskTag: 'companion',
        maxTokens,
      }),
    })

    if (!response.ok) {
      console.warn(`[LLM Chat] Server error ${response.status}`)
      return { reply: '不好意思，您能再说一遍吗？', action: 'NONE', direct: false }
    }

    const data = await response.json()
    console.log(`[LLM Chat] ✅ ${Date.now() - t0}ms (server-routed via LLMConfig)`)

    return {
      reply: data.reply || '不好意思，您能再说一遍吗？',
      action: data.action || 'NONE',
      params: data.params,
      direct: false,
    }
  } catch (error) {
    console.error('[LLM Chat] Request failed:', error)
    return { reply: '不好意思，您能再说一遍吗？', action: 'NONE', direct: false }
  }
}
