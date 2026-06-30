import { getGeminiApiKey } from './systemConfig'
import { callLLMChat, type ChatMessage } from './llmRouter'
import { prisma } from './prisma'

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
  // 1. Query the database to find the configurations to try (prioritize 'companion' tag, then default configs)
  const matchingConfigs = await prisma.lLMConfig.findMany({
    where: { isEnabled: true, taskTags: { has: 'companion' } },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })
  const matchingIds = matchingConfigs.map((c: any) => c.id)

  const defaultConfigs = await prisma.lLMConfig.findMany({
    where: { isEnabled: true, isDefault: true, NOT: { id: { in: matchingIds } } },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const configsToTry = [...matchingConfigs, ...defaultConfigs]
  
  // If no database configs are found, use Gemini as the system fallback
  const sysProvider = process.env.SYSTEM_DEFAULT_LLM_PROVIDER || 'google'
  const sysModel = process.env.SYSTEM_DEFAULT_LLM_MODEL || 'gemini-2.0-flash'
  
  const resolvedConfigs = configsToTry.length > 0 ? configsToTry : [
    {
      id: 'system_default',
      provider: sysProvider,
      displayName: 'System Default',
      modelName: sysModel,
      baseUrl: null,
      apiKey: null
    }
  ]

  for (const config of resolvedConfigs) {
    const { provider, modelName, baseUrl } = config
    let apiKey = config.apiKey || ''
    
    // Resolve API key
    if (!apiKey) {
      if (provider === 'google') apiKey = (await getGeminiApiKey()) || process.env.GEMINI_API_KEY || ''
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY || ''
      else if (provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY || ''
      else if (provider === 'deepseek') apiKey = process.env.DEEPSEEK_API_KEY || ''
    }
    
    if (!apiKey) {
      console.warn(`[callGeminiChat] Skip config ${config.displayName}: No API key`)
      continue
    }

    console.log(`[callGeminiChat] Requesting: ${config.displayName} (${provider}/${modelName}) with enableTools=${enableTools}`)

    try {
      if (provider === 'google') {
        // --- Gemini Tool-Call Flow ---
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
        if (systemPrompt) {
          contents.push({ role: 'user', parts: [{ text: `[System Context]\n${systemPrompt}` }] })
          contents.push({ role: 'model', parts: [{ text: '好的，我已了解品牌信息，随时为您服务！' }] })
        }
        for (const turn of history.slice(-20)) {
          contents.push({ role: turn.role === 'user' ? 'user' : 'model', parts: [{ text: turn.content }] })
        }
        contents.push({ role: 'user', parts: [{ text: userMessage }] })

        const body: Record<string, any> = {
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }
        if (enableTools) {
          body.tools = [{ functionDeclarations: customTools || COMPANION_TOOLS }]
          body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        )

        if (response.ok) {
          const json = await response.json()
          const candidate = json.candidates?.[0]
          if (candidate) {
            const parts = candidate.content?.parts || []
            const funcCallPart = parts.find((p: any) => p.functionCall)
            if (funcCallPart?.functionCall) {
              const { name, args } = funcCallPart.functionCall
              const action = TOOL_TO_ACTION[name] || 'NONE'
              return {
                reply: '',
                action,
                toolCallName: name,
                toolCallArgs: args || {},
                params: args || {},
              }
            }

            const text = parts.find((p: any) => p.text)?.text?.trim()
            if (text) {
              return { reply: text, action: 'NONE' }
            }
          }
        } else {
          const errText = await response.text().catch(() => '')
          console.error(`[callGeminiChat] Gemini error ${response.status}: ${errText}`)
        }
      } 
      else if (provider === 'openai' || provider === 'deepseek' || provider === 'custom_shim') {
        // --- OpenAI-compatible (GLM5.2) Tool-Call Flow ---
        const defaultBase = provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1'
        const endpoint = `${baseUrl || defaultBase}/chat/completions`

        const messages: ChatMessage[] = []
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt })
        }
        for (const turn of history.slice(-20)) {
          messages.push({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content })
        }
        messages.push({ role: 'user', content: userMessage })

        const body: Record<string, any> = {
          model: modelName,
          messages,
          max_tokens: maxTokens,
        }

        if (enableTools) {
          const formattedTools = (customTools || COMPANION_TOOLS).map(t => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }
          }))
          if (formattedTools.length > 0) {
            body.tools = formattedTools
            body.tool_choice = 'auto'
          }
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
        })

        if (response.ok) {
          const json = await response.json()
          const message = json.choices?.[0]?.message
          if (message) {
            if (message.tool_calls && message.tool_calls.length > 0) {
              const toolCall = message.tool_calls[0]
              const { name, arguments: rawArgs } = toolCall.function
              const action = TOOL_TO_ACTION[name] || 'NONE'
              let parsedArgs = {}
              try {
                parsedArgs = JSON.parse(rawArgs || '{}')
              } catch {
                console.error(`[callGeminiChat] Failed to parse tool arguments: ${rawArgs}`)
              }
              
              return {
                reply: '',
                action,
                toolCallName: name,
                toolCallArgs: parsedArgs,
                params: parsedArgs
              }
            }

            const text = message.content?.trim()
            if (text) {
              return { reply: text, action: 'NONE' }
            }
          }
        } else {
          const errText = await response.text().catch(() => '')
          console.error(`[callGeminiChat] OpenAI-compatible error ${response.status}: ${errText}`)
        }
      }
    } catch (err: any) {
      console.warn(`[callGeminiChat] Config ${config.displayName} failed:`, err)
    }
  }

  // All configs exhausted
  console.error('[callGeminiChat] All LLM configs failed')
  return { reply: '抱歉，AI 语音助手服务暂时不可用，请稍后再试。', action: 'NONE' }
}

