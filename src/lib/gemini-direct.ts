/**
 * gemini-direct.ts
 *
 * Client-side (browser) Gemini API caller.
 * Calls Gemini directly without going through the Render server,
 * significantly reducing latency for regular chat turns.
 *
 * Architecture (Option C — internal testing):
 *   Browser → Gemini API directly  (pure chat, ~400-800ms)
 *   Browser → Render → DB          (tool calls: approve/query, ~1.5s)
 *
 * ⚠️  The API key is visible in browser DevTools. Acceptable for internal
 *     testing; upgrade to Firebase AI Logic for public production.
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
  /** true = this was a direct client call, false = fell back to server */
  direct: boolean
}

// ─── Tool declarations (mirror of server-side COMPANION_TOOLS) ──────────────
const COMPANION_TOOLS = [
  {
    name: 'get_calendar_events',
    description: 'Query scheduled content from the publishing calendar.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month'],
          description: 'Time period to query',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_action_items',
    description: 'Get pending action items requiring attention.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'approve_draft',
    description: 'Approve a content draft for publishing.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'Draft ID to approve' },
        note: { type: 'string', description: 'Optional note' },
      },
      required: ['draftId'],
    },
  },
  {
    name: 'reschedule_draft',
    description: 'Change the publish time of a draft.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'Draft ID' },
        scheduledAt: { type: 'string', description: 'New time in ISO 8601' },
      },
      required: ['draftId', 'scheduledAt'],
    },
  },
  {
    name: 'reject_draft',
    description: 'Reject a draft and request rewrite.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'Draft ID' },
        reason: { type: 'string', description: 'Reason for rejection' },
      },
      required: ['draftId'],
    },
  },
]

const TOOL_TO_ACTION: Record<string, string> = {
  get_calendar_events: 'QUERY_CALENDAR',
  get_action_items: 'QUERY_ACTIONS',
  approve_draft: 'APPROVE_DRAFT',
  reschedule_draft: 'RESCHEDULE_DRAFT',
  reject_draft: 'REJECT_DRAFT',
}

// ─── In-memory key cache (fetched once per page session) ────────────────────
let _cachedKey: string | null = null
let _fetchPromise: Promise<string | null> | null = null

export async function getClientGeminiKey(): Promise<string | null> {
  if (_cachedKey) return _cachedKey
  if (_fetchPromise) return _fetchPromise

  _fetchPromise = fetch('/api/client-config')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      _cachedKey = d?.geminiApiKey ?? null
      _fetchPromise = null
      return _cachedKey
    })
    .catch(() => {
      _fetchPromise = null
      return null
    })

  return _fetchPromise
}

// ─── Main direct call function ───────────────────────────────────────────────
export async function callGeminiDirect(
  systemPrompt: string,
  history: DirectChatTurn[],
  userMessage: string,
  enableTools = true,
  maxTokens = 500,
): Promise<DirectChatResult> {
  const apiKey = await getClientGeminiKey()
  if (!apiKey) {
    return { reply: '抱歉，AI 服务暂时不可用。', action: 'NONE', direct: false }
  }

  // Build contents array
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: `[System Context]\n${systemPrompt}` }] })
    contents.push({ role: 'model', parts: [{ text: '好的，我已了解品牌信息，随时为您服务！' }] })
  }

  for (const turn of history.slice(-20)) {
    contents.push({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.content }],
    })
  }

  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const body: Record<string, any> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  }

  if (enableTools) {
    body.tools = [{ functionDeclarations: COMPANION_TOOLS }]
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
  }

  try {
    const t0 = Date.now()
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )

    if (!response.ok) {
      console.warn(`[GeminiDirect] API error ${response.status}`)
      return { reply: '不好意思，您能再说一遍吗？', action: 'NONE', direct: true }
    }

    const json = await response.json()
    console.log(`[GeminiDirect] ✅ ${Date.now() - t0}ms (direct browser call)`)

    const candidate = json.candidates?.[0]
    if (!candidate) return { reply: '不好意思，您能再说一遍吗？', action: 'NONE', direct: true }

    const parts = candidate.content?.parts || []

    // Function call → relay to server for DB operation
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
        direct: true,
      }
    }

    // Text response
    const text = parts.find((p: any) => p.text)?.text?.trim()
    if (!text) return { reply: '不好意思，您能再说一遍吗？', action: 'NONE', direct: true }

    // Legacy JSON parse support
    try {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim()
      if (cleaned.startsWith('{')) {
        const parsed = JSON.parse(cleaned)
        if (parsed.reply) {
          return { reply: parsed.reply, action: parsed.action || 'NONE', params: parsed.params, direct: true }
        }
      }
    } catch {
      // Plain text
    }

    return { reply: text, action: 'NONE', direct: true }
  } catch (error) {
    console.error('[GeminiDirect] Request failed:', error)
    return { reply: '不好意思，您能再说一遍吗？', action: 'NONE', direct: false }
  }
}
