import { getGeminiApiKey } from './systemConfig'
import { callLLMChat, type ChatMessage } from './llmRouter'

/**
 * A single turn in a conversation (Gemini multi-turn format).
 */
export interface ChatTurn {
  role: 'user' | 'model'
  content: string
}

/**
 * A function/tool declaration for Gemini Function Calling.
 */
interface FunctionDeclaration {
  name: string
  description: string
  parameters?: {
    type: string
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
}

/**
 * Result of a gemini-chat call.
 */
export interface GeminiChatResult {
  reply: string
  action: string
  params?: Record<string, any>
  toolCallName?: string
  toolCallArgs?: Record<string, any>
}

/**
 * Companion tool declarations for function calling.
 */
export const COMPANION_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_calendar_events',
    description: 'Get the brand\'s scheduled and published content for a given time period. Use when user asks about content schedule, what was posted, when posts are planned, or how many posts this week/month.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Time period to query: today, this_week, this_month',
          enum: ['today', 'this_week', 'this_month'],
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_action_items',
    description: 'Get pending action items for the brand, such as drafts awaiting approval. Use when user asks about pending reviews, drafts to approve, or what needs their attention.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'approve_draft',
    description: 'Approve a content draft for publishing. Use when the user agrees to publish a draft they have been shown (e.g., "发出去", "可以", "就这样发吧").',
    parameters: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'The ID of the draft to approve',
        },
        note: {
          type: 'string',
          description: 'Optional approval note from the brand owner',
        },
      },
      required: ['draftId'],
    },
  },
  {
    name: 'reschedule_draft',
    description: 'Change the scheduled publish time of a draft. Use when the user wants to change when a post goes out (e.g., "明天早上10点发", "推迟到下午6点").',
    parameters: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'The ID of the draft to reschedule',
        },
        scheduledAt: {
          type: 'string',
          description: 'New scheduled time in ISO 8601 format',
        },
      },
      required: ['draftId', 'scheduledAt'],
    },
  },
  {
    name: 'reject_draft',
    description: 'Reject a content draft and request it to be rewritten. Use when user is unhappy with a draft (e.g., "重新写", "风格不对", "换个方向").',
    parameters: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'The ID of the draft to reject',
        },
        reason: {
          type: 'string',
          description: 'The reason for rejection / direction for rewrite',
        },
      },
      required: ['draftId'],
    },
  },
]

/**
 * Map function call names to action strings returned to the frontend.
 */
const TOOL_TO_ACTION: Record<string, string> = {
  get_calendar_events: 'QUERY_CALENDAR',
  get_action_items: 'QUERY_ACTIONS',
  approve_draft: 'APPROVE_DRAFT',
  reschedule_draft: 'RESCHEDULE_DRAFT',
  reject_draft: 'REJECT_DRAFT',
}

/**
 * Call LLM with multi-turn history and optional function calling support.
 *
 * Failover strategy:
 *   1. Try Gemini directly (supports native tool/function calling)
 *   2. On failure/rate-limit → fallback to callLLMChat() which tries all
 *      configured providers (GLM, DeepSeek, etc.) via the LLMConfig table.
 *
 * Note: Non-Gemini providers do NOT support Gemini's functionDeclarations format.
 * When falling back, tool-call is disabled and the AI responds with plain text.
 * The frontend action will be NONE; callers should handle gracefully.
 *
 * @param systemPrompt  The system context prompt (brand knowledge, persona, etc.)
 * @param history       Previous conversation turns (user/model alternating)
 * @param userMessage   The latest user message
 * @param enableTools   Whether to enable function declarations (defaults true)
 * @param maxTokens     Max output tokens
 */
export async function callGeminiChat(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
  enableTools = true,
  maxTokens = 500,
  customTools?: any[],
): Promise<GeminiChatResult> {
  const apiKey = await getGeminiApiKey()

  // ─── Attempt 1: Gemini (native tool-call support) ───────────────────────────
  if (apiKey) {
    // Build the contents array: system prompt as first user turn, then history, then current message
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    // Inject system context as the first user/model exchange
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: `[System Context]\n${systemPrompt}` }] })
      contents.push({ role: 'model', parts: [{ text: '好的，我已了解品牌信息，随时为您服务！' }] })
    }

    // Inject conversation history (keep last 20 turns to manage token usage)
    const recentHistory = history.slice(-20)
    for (const turn of recentHistory) {
      contents.push({
        role: turn.role === 'user' ? 'user' : 'model',
        parts: [{ text: turn.content }],
      })
    }

    // Current user message
    contents.push({ role: 'user', parts: [{ text: userMessage }] })

    const body: Record<string, any> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    }

    if (enableTools) {
      body.tools = [{ functionDeclarations: customTools || COMPANION_TOOLS }]
      body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )

      if (response.ok) {
        const json = await response.json()
        const candidate = json.candidates?.[0]
        if (candidate) {
          const parts = candidate.content?.parts || []

          // Check for function call
          const funcCallPart = parts.find((p: any) => p.functionCall)
          if (funcCallPart?.functionCall) {
            const { name, args } = funcCallPart.functionCall
            const action = TOOL_TO_ACTION[name] || 'NONE'
            return {
              reply: '', // Frontend will handle reply after tool execution
              action,
              toolCallName: name,
              toolCallArgs: args || {},
              params: args || {},
            }
          }

          // Text response
          const text = parts.find((p: any) => p.text)?.text?.trim()
          if (text) {
            // Attempt to parse JSON action from text (legacy support)
            try {
              const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim()
              if (cleaned.startsWith('{')) {
                const parsed = JSON.parse(cleaned)
                if (parsed.reply) {
                  return { reply: parsed.reply, action: parsed.action || 'NONE', params: parsed.params }
                }
              }
            } catch {
              // Not JSON — treat as plain text reply
            }
            return { reply: text, action: 'NONE' }
          }
        }
      } else if (response.status !== 429 && response.status !== 503) {
        // Non-rate-limit error (e.g. 400 bad request) — don't fallback
        const errText = await response.text().catch(() => '')
        console.error(`[GeminiChat] API error ${response.status}:`, errText)
        return { reply: '不好意思，您能再说一遍吗？', action: 'NONE' }
      }
      // 429 / 503 / empty response → fall through to fallback
      console.warn(`[GeminiChat] Gemini unavailable (${response.status}) — trying LLM fallback`)
    } catch (error) {
      console.warn('[GeminiChat] Gemini request failed — trying LLM fallback:', error)
    }
  } else {
    console.warn('[GeminiChat] No Gemini API key — trying LLM fallback directly')
  }

  // ─── Attempt 2: LLM Router fallback (GLM, DeepSeek, etc.) ──────────────────
  // Tool-call is disabled for non-Gemini providers (no native support).
  // Build OpenAI-compatible messages array.
  const messages: ChatMessage[] = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  for (const turn of history.slice(-20)) {
    messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content })
  }
  messages.push({ role: 'user', content: userMessage })

  const fallbackResult = await callLLMChat('companion', messages, maxTokens)
  if (fallbackResult.text) {
    console.log(`[GeminiChat] ✅ Fallback succeeded via ${fallbackResult.provider}/${fallbackResult.modelName}`)
    return { reply: fallbackResult.text, action: 'NONE' }
  }

  // All providers exhausted
  console.error('[GeminiChat] All LLM providers failed')
  return { reply: '抱歉，AI 服务暂时不可用，请稍后再试。', action: 'NONE' }
}

