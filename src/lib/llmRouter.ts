import { prisma } from './prisma.ts'
import { getGeminiApiKey, getMiniMaxApiKey } from './systemConfig.ts'

export interface LLMCallResult {
  text: string | null
  provider: string
  modelName: string
  error?: string
}

// ============================================================
// In-memory Circuit Breaker
// Tracks providers that have recently returned 429 / rate limit
// errors. They are skipped for RATE_LIMIT_COOLDOWN_MS to allow
// quota to recover, enabling seamless transparent switching.
// ============================================================
const rateLimitedUntil = new Map<string, number>()
const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

function circuitKey(provider: string, modelName: string): string {
  return `${provider}/${modelName}`
}

function isCircuitOpen(provider: string, modelName: string): boolean {
  const key = circuitKey(provider, modelName)
  const until = rateLimitedUntil.get(key)
  if (!until) return false
  if (Date.now() >= until) {
    rateLimitedUntil.delete(key)
    console.log(`[LLM Router] Circuit reset for ${key} — cooling period expired.`)
    return false
  }
  const remaining = Math.ceil((until - Date.now()) / 1000)
  console.log(`[LLM Router] Circuit OPEN for ${key} — skipping (${remaining}s remaining).`)
  return true
}

function tripCircuit(provider: string, modelName: string): void {
  const key = circuitKey(provider, modelName)
  rateLimitedUntil.set(key, Date.now() + RATE_LIMIT_COOLDOWN_MS)
  console.warn(`[LLM Router] Circuit tripped for ${key} — rate-limited for ${RATE_LIMIT_COOLDOWN_MS / 60000} min.`)
}

/**
 * Executes a single API call for a specific LLM provider.
 */
async function executeSingleLLMCall(
  provider: string,
  modelName: string,
  apiKey: string,
  baseUrl: string | null,
  prompt: string,
  maxTokens: number
): Promise<LLMCallResult & { rateLimited?: boolean }> {
  try {
    let responseText: string | null = null
    let errorMsg: string | undefined = undefined
    let rateLimited = false

    if (provider === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      })

      if (response.ok) {
        const json = await response.json()
        responseText = json.candidates?.[0]?.content?.parts?.[0]?.text || null
      } else {
        const errText = await response.text().catch(() => '')
        if (response.status === 429) {
          rateLimited = true
          errorMsg = `Gemini API quota/token limit exceeded (Rate limit / 429). Please check your billing or limit settings.`
        } else if (response.status === 400) {
          errorMsg = `Gemini API error (400 Bad Request / Token limit exceeded). Details: ${errText.slice(0, 150)}`
        } else {
          errorMsg = `Gemini API call failed with status ${response.status}: ${response.statusText}`
        }
        console.error(`[LLM Router] ${errorMsg}`)
      }
    }
    else if (provider === 'openai' || provider === 'deepseek' || provider === 'custom_shim' || provider === 'minimax') {
      const defaultEndpoint = provider === 'deepseek'
        ? 'https://api.deepseek.com/v1'
        : provider === 'minimax'
        ? 'https://api.minimaxi.chat/v1'
        : 'https://api.openai.com/v1'
      const endpoint = `${baseUrl || defaultEndpoint}/chat/completions`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
      })

      if (response.ok) {
        const json = await response.json()
        responseText = json.choices?.[0]?.message?.content || null
      } else {
        const errText = await response.text().catch(() => '')
        if (response.status === 429) {
          rateLimited = true
          errorMsg = `CUSTOM_SHIM API quota/token limit exceeded (Rate limit / 429). Please check your billing or limit settings.`
        } else if (response.status === 400) {
          errorMsg = `${provider.toUpperCase()} API error (400 Bad Request / Token limit exceeded). Details: ${errText.slice(0, 150)}`
        } else {
          errorMsg = `${provider.toUpperCase()} API call failed with status ${response.status}: ${response.statusText}`
        }
        console.error(`[LLM Router] ${errorMsg}`)
      }
    }
    else if (provider === 'anthropic') {
      const endpoint = `${baseUrl || 'https://api.anthropic.com/v1'}/messages`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (response.ok) {
        const json = await response.json()
        responseText = json.content?.[0]?.text || null
      } else {
        const errText = await response.text().catch(() => '')
        if (response.status === 429) {
          rateLimited = true
          errorMsg = `Anthropic API rate/token limit exceeded (429).`
        } else if (response.status === 400) {
          errorMsg = `Anthropic API error (400 Bad Request). Details: ${errText.slice(0, 150)}`
        } else {
          errorMsg = `Anthropic API call failed with status ${response.status}: ${response.statusText}`
        }
        console.error(`[LLM Router] ${errorMsg}`)
      }
    }
    else {
      errorMsg = `Unsupported LLM provider: ${provider}`
      console.error(`[LLM Router] ${errorMsg}`)
    }

    return {
      text: responseText ? responseText.trim() : null,
      provider,
      modelName,
      error: errorMsg,
      rateLimited,
    }
  } catch (error: any) {
    const errorMsg = `Request failed for ${provider}/${modelName}: ${error.message || error}`
    console.error(`[LLM Router]`, error)
    return { text: null, provider, modelName, error: errorMsg, rateLimited: false }
  }
}

// ============================================================
// Multi-turn Chat types and callLLMChat()
// Supports history + system prompt, works with Gemini and any
// OpenAI-compatible provider (GLM-4-Flash, DeepSeek, etc.)
// ============================================================
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMChatResult {
  text: string | null
  provider: string
  modelName: string
  error?: string
  rateLimited?: boolean
}

/**
 * Execute a multi-turn chat call against a single provider.
 * - Google → Gemini generateContent format
 * - openai / deepseek / custom_shim (GLM etc.) → OpenAI messages format
 * - anthropic → Anthropic messages format
 */
async function executeSingleLLMChatCall(
  provider: string,
  modelName: string,
  apiKey: string,
  baseUrl: string | null,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<LLMChatResult & { rateLimited?: boolean }> {
  try {
    let responseText: string | null = null
    let errorMsg: string | undefined
    let rateLimited = false

    if (provider === 'google') {
      // Convert OpenAI-style messages → Gemini contents format
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
      const sysMsg = messages.find(m => m.role === 'system')
      if (sysMsg) {
        contents.push({ role: 'user', parts: [{ text: `[System]\n${sysMsg.content}` }] })
        contents.push({ role: 'model', parts: [{ text: '好的，了解。' }] })
      }
      for (const m of messages.filter(m => m.role !== 'system')) {
        contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens } }),
      })
      if (res.ok) {
        const json = await res.json()
        responseText = json.candidates?.[0]?.content?.parts?.[0]?.text || null
      } else {
        const errText = await res.text().catch(() => '')
        if (res.status === 429) { rateLimited = true; errorMsg = `Gemini 429 rate-limited` }
        else errorMsg = `Gemini ${res.status}: ${errText.slice(0, 120)}`
        console.error(`[LLM Chat] ${errorMsg}`)
      }
    }
    else if (provider === 'openai' || provider === 'deepseek' || provider === 'custom_shim' || provider === 'minimax') {
      // OpenAI-compatible — works for GLM-4-Flash, DeepSeek, MiniMax, and any OpenAI-format endpoint
      const defaultBase = provider === 'deepseek'
        ? 'https://api.deepseek.com/v1'
        : provider === 'minimax'
        ? 'https://api.minimaxi.chat/v1'
        : 'https://api.openai.com/v1'
      const endpoint = `${baseUrl || defaultBase}/chat/completions`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelName, messages, max_tokens: maxTokens }),
      })
      if (res.ok) {
        const json = await res.json()
        responseText = json.choices?.[0]?.message?.content || null
      } else {
        const errText = await res.text().catch(() => '')
        if (res.status === 429) { rateLimited = true; errorMsg = `${provider} 429 rate-limited` }
        else errorMsg = `${provider} ${res.status}: ${errText.slice(0, 120)}`
        console.error(`[LLM Chat] ${errorMsg}`)
      }
    }
    else if (provider === 'anthropic') {
      const sysContent = messages.find(m => m.role === 'system')?.content
      const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant', content: m.content,
      }))
      const endpoint = `${baseUrl || 'https://api.anthropic.com/v1'}/messages`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelName, max_tokens: maxTokens, ...(sysContent ? { system: sysContent } : {}), messages: chatMsgs }),
      })
      if (res.ok) {
        const json = await res.json()
        responseText = json.content?.[0]?.text || null
      } else {
        const errText = await res.text().catch(() => '')
        if (res.status === 429) { rateLimited = true; errorMsg = `Anthropic 429 rate-limited` }
        else errorMsg = `Anthropic ${res.status}: ${errText.slice(0, 120)}`
        console.error(`[LLM Chat] ${errorMsg}`)
      }
    }
    else {
      errorMsg = `Unsupported provider for chat: ${provider}`
      console.error(`[LLM Chat] ${errorMsg}`)
    }

    return { text: responseText?.trim() || null, provider, modelName, error: errorMsg, rateLimited }
  } catch (err: any) {
    return { text: null, provider, modelName, error: `Chat request failed: ${err.message}`, rateLimited: false }
  }
}

/**
 * callLLMChat — Multi-turn chat with automatic model failover.
 *
 * Same failover chain as callLLM() but accepts OpenAI-style messages[]
 * (system + user + assistant history) instead of a plain prompt.
 *
 * How to add GLM to the fallback chain (Admin → LLM Config):
 *   provider:   "openai"   (OpenAI-compatible endpoint)
 *   baseUrl:    "https://open.bigmodel.cn/api/paas/v4"
 *   modelName:  "glm-4-flash"
 *   taskTags:   ["companion", "copywriting", "default"]
 *   isDefault:  true
 *   priority:   80  (below Gemini at 100 → Gemini tried first)
 */
export async function callLLMChat(
  taskTag: string,
  messages: ChatMessage[],
  maxTokens = 500,
): Promise<LLMChatResult> {
  // 1. Task-tagged configs sorted by priority
  const matchingConfigs = await prisma.lLMConfig.findMany({
    where: { isEnabled: true, taskTags: { has: taskTag } },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })
  const matchingIds = matchingConfigs.map((c: any) => c.id)

  // 2. Default configs not already matched
  const defaultConfigs = await prisma.lLMConfig.findMany({
    where: { isEnabled: true, isDefault: true, NOT: { id: { in: matchingIds } } },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const configsToTry = [...matchingConfigs, ...defaultConfigs]
  const errors: string[] = []

  for (const config of configsToTry) {
    const { provider, modelName, baseUrl } = config
    if (isCircuitOpen(provider, modelName)) { errors.push(`${config.displayName}: circuit open`); continue }

    let apiKey = config.apiKey || ''
    if (!apiKey) {
      if (provider === 'google') apiKey = (await getGeminiApiKey()) || process.env.GEMINI_API_KEY || ''
      else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY || ''
      else if (provider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY || ''
      else if (provider === 'deepseek') apiKey = process.env.DEEPSEEK_API_KEY || ''
      else if (provider === 'minimax') apiKey = (await getMiniMaxApiKey()) || process.env.MINIMAX_API_KEY || ''
    }
    if (!apiKey) { errors.push(`${config.displayName}: no API key`); continue }

    console.log(`[LLM Chat] Trying: ${config.displayName} (${provider}/${modelName})`)
    const result = await executeSingleLLMChatCall(provider, modelName, apiKey, baseUrl, messages, maxTokens)
    if (result.text && !result.error) {
      console.log(`[LLM Chat] ✅ Success via ${config.displayName}`)
      return result
    }
    if (result.rateLimited) tripCircuit(provider, modelName)
    errors.push(`${config.displayName}: ${result.error}`)
    console.warn(`[LLM Chat] ${config.displayName} failed, trying next…`)
  }

  // 3. System env fallback
  const sysProvider = process.env.SYSTEM_DEFAULT_LLM_PROVIDER || 'google'
  const sysModel = process.env.SYSTEM_DEFAULT_LLM_MODEL || 'gemini-2.0-flash'
  let sysKey = process.env.SYSTEM_DEFAULT_LLM_API_KEY || ''
  if (!sysKey && sysProvider === 'google') sysKey = (await getGeminiApiKey()) || process.env.GEMINI_API_KEY || ''

  if (sysKey && !isCircuitOpen(sysProvider, sysModel)) {
    const result = await executeSingleLLMChatCall(sysProvider, sysModel, sysKey, null, messages, maxTokens)
    if (result.text && !result.error) {
      console.log(`[LLM Chat] ✅ System env fallback success`)
      return result
    }
    if (result.rateLimited) tripCircuit(sysProvider, sysModel)
    errors.push(`System fallback: ${result.error}`)
  }

  console.error('[LLM Chat] All providers failed:', errors)
  return { text: null, provider: sysProvider, modelName: sysModel, error: errors.join('; ') }
}

/**
 * Dynamically routes and calls the appropriate LLM model for a given task tag.
 *
 * Implements a transparent failover chain:
 * 1. DB configs tagged with taskTag, sorted by priority DESC
 * 2. DB configs marked isDefault (not already included), sorted by priority DESC
 * 3. System env-var fallback
 *
 * Rate-limited providers (429) are instantly skipped via an in-memory circuit
 * breaker and won't be retried for RATE_LIMIT_COOLDOWN_MS (5 min). This makes
 * LLM switching completely seamless to the caller when at least one fallback
 * provider is healthy.
 */
export async function callLLM(
  taskTag: string,
  prompt: string,
  maxTokens: number = 1000
): Promise<LLMCallResult> {
  // 1. Fetch all matching enabled configurations, sorted by priority DESC
  const matchingConfigs = await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
      taskTags: { has: taskTag },
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  // 2. Fetch default enabled configurations not already matched, sorted by priority DESC
  const matchingIds = matchingConfigs.map((c: any) => c.id)
  const defaultConfigs = await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
      isDefault: true,
      NOT: { id: { in: matchingIds } }
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const configsToTry = [...matchingConfigs, ...defaultConfigs]
  const errors: string[] = []

  // Try each configuration in sequence (circuit breaker skips rate-limited ones)
  for (const config of configsToTry) {
    const provider = config.provider
    const modelName = config.modelName
    const baseUrl = config.baseUrl

    // Skip immediately if circuit is open (recent 429)
    if (isCircuitOpen(provider, modelName)) {
      errors.push(`${config.displayName} (${provider}): skipped — circuit open (rate-limited)`)
      continue
    }

    let apiKey = config.apiKey || ''

    // Resolve API key fallbacks if empty
    if (!apiKey) {
      if (provider === 'google') {
        apiKey = (await getGeminiApiKey()) || process.env.GEMINI_API_KEY || ''
      } else if (provider === 'openai') {
        apiKey = process.env.OPENAI_API_KEY || ''
      } else if (provider === 'anthropic') {
        apiKey = process.env.ANTHROPIC_API_KEY || ''
      } else if (provider === 'deepseek') {
        apiKey = process.env.DEEPSEEK_API_KEY || ''
      } else if (provider === 'minimax') {
        apiKey = (await getMiniMaxApiKey()) || process.env.MINIMAX_API_KEY || ''
      }
    }

    if (!apiKey) {
      const errorMsg = `API key missing for provider: ${provider}, model: ${modelName}`
      console.warn(`[LLM Router] Failover warning: ${errorMsg}`)
      errors.push(`${config.displayName} (${provider}): ${errorMsg}`)
      continue
    }

    console.log(`[LLM Router] Trying: ${config.displayName} (${provider}/${modelName})`)
    const result = await executeSingleLLMCall(provider, modelName, apiKey, baseUrl, prompt, maxTokens)

    if (result.text && !result.error) {
      console.log(`[LLM Router] \u2705 Success via ${config.displayName} (${provider}/${modelName})`)
      return result
    }

    // Trip circuit on rate limit so this provider is skipped for the next 5 min
    if (result.rateLimited) {
      tripCircuit(provider, modelName)
    }

    const errDetail = result.error || 'Unknown error'
    console.warn(`[LLM Router] ${config.displayName} failed: ${errDetail}. Trying next...`)
    errors.push(`${config.displayName} (${provider}): ${errDetail}`)
  }

  // 3. Fallback to system env / default config
  console.log('[LLM Router] All database configurations exhausted. Trying system env fallback...')

  const sysProvider = process.env.SYSTEM_DEFAULT_LLM_PROVIDER || 'google'
  const sysModelName = process.env.SYSTEM_DEFAULT_LLM_MODEL || 'gemini-2.0-flash'
  let sysApiKey = process.env.SYSTEM_DEFAULT_LLM_API_KEY || ''

  if (!sysApiKey) {
    if (sysProvider === 'google') {
      sysApiKey = (await getGeminiApiKey()) || process.env.GEMINI_API_KEY || ''
    } else if (sysProvider === 'openai') {
      sysApiKey = process.env.OPENAI_API_KEY || ''
    } else if (sysProvider === 'anthropic') {
      sysApiKey = process.env.ANTHROPIC_API_KEY || ''
    } else if (sysProvider === 'deepseek') {
      sysApiKey = process.env.DEEPSEEK_API_KEY || ''
    }
  }

  if (sysApiKey) {
    if (isCircuitOpen(sysProvider, sysModelName)) {
      errors.push(`System Fallback (${sysProvider}): skipped — circuit open (rate-limited)`)
    } else {
      const result = await executeSingleLLMCall(sysProvider, sysModelName, sysApiKey, null, prompt, maxTokens)
      if (result.text && !result.error) {
        console.log(`[LLM Router] \u2705 Success via system env fallback (${sysProvider}/${sysModelName})`)
        return result
      }
      if (result.rateLimited) {
        tripCircuit(sysProvider, sysModelName)
      }
      errors.push(`System Fallback (${sysProvider}): ${result.error || 'Unknown error'}`)
    }
  } else {
    errors.push(`System Fallback (${sysProvider}): API key missing`)
  }

  const combinedError = `All LLM configurations in fallback chain failed:\n- ` + errors.join('\n- ')
  console.error(`[LLM Router] ${combinedError}`)

  return {
    text: null,
    provider: sysProvider,
    modelName: sysModelName,
    error: combinedError
  }
}

/**
 * Validates a single LLM configuration by running a probe request.
 */
export async function validateLLMConfig(
  provider: string,
  modelName: string,
  apiKey: string,
  baseUrl: string | null
): Promise<{ success: boolean; error?: string }> {
  console.log(`[LLM Router] Validating config for ${provider}/${modelName}...`)
  const result = await executeSingleLLMCall(
    provider,
    modelName,
    apiKey,
    baseUrl,
    "Hello, are you online?",
    10
  )

  if (result.text && !result.error) {
    return { success: true }
  }

  return {
    success: false,
    error: result.error || 'Connection check failed (empty response).'
  }
}

/**
 * Expose circuit breaker status for admin/diagnostics.
 */
export function getCircuitBreakerStatus(): Record<string, { rateLimitedUntil: string }> {
  const status: Record<string, { rateLimitedUntil: string }> = {}
  for (const [key, until] of rateLimitedUntil.entries()) {
    status[key] = { rateLimitedUntil: new Date(until).toISOString() }
  }
  return status
}
