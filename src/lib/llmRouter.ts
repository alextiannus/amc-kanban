import { prisma } from './prisma.ts'
import type { ResolvedContentModelProfile } from './amc-content/types.ts'

export interface LLMCallResult {
  text: string | null
  provider: string
  modelName: string
  error?: string
  latencyMs?: number
  timedOut?: boolean
  attempts?: LLMCallAttempt[]
  routeDiagnostics?: LLMRouteDiagnostics
}

export interface LLMCallAttempt {
  provider: string
  modelName: string
  latencyMs: number
  status: 'success' | 'failed' | 'timeout' | 'aborted' | 'skipped'
  error?: string
}

export interface LLMCallOptions {
  temperature?: number
  jsonMode?: boolean
  signal?: AbortSignal
  deadlineMs?: number
  attemptTimeoutMs?: number[]
  maxAttempts?: number
  allowDefaultFallback?: boolean
  allowSystemFallback?: boolean
}

export interface LLMRouteDiagnostics {
  taskTag: string
  maxTokens: number
  jsonModeRequested: boolean
  deadlineMs?: number
  maxAttempts?: number
  allowDefaultFallback: boolean
  allowSystemFallback: boolean
  configsConsidered: Array<{
    index: number
    displayName: string
    provider: string
    modelName: string
    timeoutMs?: number | null
    maxRetries?: number | null
    nativeJsonMode: boolean
  }>
}

function supportsNativeJsonMode(provider: string) {
  return provider === 'openai' || provider === 'google' || provider === 'deepseek'
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
  maxTokens: number,
  options: { temperature?: number; jsonMode?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LLMCallResult & { rateLimited?: boolean; aborted?: boolean }> {
  const timeoutSignal = options.timeoutMs && options.timeoutMs > 0
    ? AbortSignal.timeout(options.timeoutMs)
    : null
  const requestSignal = options.signal && timeoutSignal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : options.signal ?? timeoutSignal ?? undefined
  try {
    let responseText: string | null = null
    let errorMsg: string | undefined = undefined
    let rateLimited = false

    if (provider === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: requestSignal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options.jsonMode && supportsNativeJsonMode(provider) ? { responseMimeType: 'application/json' } : {}),
          },
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
        signal: requestSignal,
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.jsonMode && supportsNativeJsonMode(provider) ? { response_format: { type: 'json_object' } } : {}),
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
        signal: requestSignal,
        body: JSON.stringify({
          model: modelName,
          max_tokens: maxTokens,
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
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
    const timedOut = timeoutSignal?.aborted === true && options.signal?.aborted !== true
    const aborted = options.signal?.aborted === true
    const reason = timedOut ? 'timed out' : aborted ? 'was aborted' : (error.message || error)
    const errorMsg = `Request failed for ${provider}/${modelName}: ${reason}`
    console.error(`[LLM Router]`, error)
    return { text: null, provider, modelName, error: errorMsg, rateLimited: false, timedOut, aborted }
  }
}

export async function callLLMWithContentModelProfile(
  profile: ResolvedContentModelProfile,
  prompt: string,
  maxTokens: number,
): Promise<LLMCallResult> {
  const provider = profile.provider.provider
  const modelName = process.env[`AMC_CONTENT_MODEL_${profile.id.toUpperCase()}_MODEL`] || profile.modelName
  const baseUrl = process.env[profile.provider.baseUrlEnv || ''] || profile.provider.baseUrl || null
  const apiKey = process.env[profile.provider.apiKeyEnv] || ''

  if (!apiKey) {
    return {
      text: null,
      provider,
      modelName,
      error: `API key missing for content model provider ${profile.provider.id}; expected env ${profile.provider.apiKeyEnv}`,
    }
  }

  if (isCircuitOpen(provider, modelName)) {
    return {
      text: null,
      provider,
      modelName,
      error: `Circuit open for content model profile ${profile.id}`,
    }
  }

  const result = await executeSingleLLMCall(
    provider,
    modelName,
    apiKey,
    baseUrl,
    prompt,
    maxTokens,
    {
      temperature: profile.temperature,
      jsonMode: profile.jsonMode,
    },
  )

  if (result.rateLimited) tripCircuit(provider, modelName)
  return result
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
 * How to configure GLM (Admin → AI 模型配置):
 *   provider:   "openai"   (OpenAI-compatible endpoint)
 *   baseUrl:    "https://open.bigmodel.cn/api/paas/v4"
 *   modelName:  "glm-4-flash"
 *   taskTags:   ["companion", "copywriting", "default"]
 *   isDefault:  true
 *   priority:   100 (higher = tried first)
 */
export async function callLLMChat(
  taskTag: string,
  messages: ChatMessage[],
  maxTokens = 500,
): Promise<LLMChatResult> {
  // 1. Task-tagged configs sorted by priority
  const matchingConfigs = await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
      OR: [
        { taskTags: { has: taskTag } },
        { contentGenerationTypes: { has: taskTag } },
      ],
    },
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

    // Key must be stored in LLMConfig.apiKey — no SystemConfig fallback.
    const apiKey = config.apiKey || ''
    if (!apiKey) { errors.push(`${config.displayName}: no API key (set it in Admin → AI 模型配置)`); continue }

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

  // 3. System env fallback — only if SYSTEM_DEFAULT_LLM_* vars are fully set.
  // Configure AI models via Admin → AI 模型配置 instead of relying on this.
  const sysProvider = process.env.SYSTEM_DEFAULT_LLM_PROVIDER || ''
  const sysModel = process.env.SYSTEM_DEFAULT_LLM_MODEL || ''
  const sysKey = process.env.SYSTEM_DEFAULT_LLM_API_KEY || ''

  if (sysProvider && sysModel && sysKey && !isCircuitOpen(sysProvider, sysModel)) {
    const result = await executeSingleLLMChatCall(sysProvider, sysModel, sysKey, null, messages, maxTokens)
    if (result.text && !result.error) {
      console.log(`[LLM Chat] ✅ System env fallback success`)
      return result
    }
    if (result.rateLimited) tripCircuit(sysProvider, sysModel)
    errors.push(`System fallback: ${result.error}`)
  }

  console.error('[LLM Chat] All providers failed:', errors)
  return { text: null, provider: 'none', modelName: 'none', error: errors.join('; ') }
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
type LLMRouterConfig = {
  provider: string
  modelName: string
  baseUrl: string | null
  apiKey: string | null
  displayName: string
  timeoutMs?: number | null
  maxRetries?: number | null
}

export async function callLLMWithConfigs(
  configsToTry: LLMRouterConfig[],
  prompt: string,
  maxTokens: number,
  options: LLMCallOptions = {},
): Promise<LLMCallResult> {
  const startedAt = Date.now()
  const attempts: LLMCallAttempt[] = []
  const errors: string[] = []
  const deadlineMs = Number.isFinite(options.deadlineMs) && Number(options.deadlineMs) > 0
    ? Number(options.deadlineMs)
    : Number.POSITIVE_INFINITY
  const maxAttempts = Number.isFinite(options.maxAttempts) && Number(options.maxAttempts) > 0
    ? Math.max(1, Math.floor(Number(options.maxAttempts)))
    : Number.POSITIVE_INFINITY
  let providerCalls = 0
  let timedOut = false

  for (const config of configsToTry) {
    const provider = config.provider
    const modelName = config.modelName
    const baseUrl = config.baseUrl

    if (options.signal?.aborted) {
      attempts.push({ provider, modelName, latencyMs: 0, status: 'aborted', error: 'Caller aborted request' })
      break
    }

    const remainingMs = deadlineMs - (Date.now() - startedAt)
    if (remainingMs <= 0 || providerCalls >= maxAttempts) {
      timedOut = timedOut || remainingMs <= 0
      break
    }

    if (isCircuitOpen(provider, modelName)) {
      const error = 'Skipped because the rate-limit circuit is open'
      attempts.push({ provider, modelName, latencyMs: 0, status: 'skipped', error })
      errors.push(`${config.displayName} (${provider}): ${error}`)
      continue
    }

    const apiKey = config.apiKey || ''
    if (!apiKey) {
      const error = `API key missing for ${provider}/${modelName} — store the key in Admin → AI 模型配置`
      console.warn(`[LLM Router] ${error}`)
      attempts.push({ provider, modelName, latencyMs: 0, status: 'skipped', error })
      errors.push(`${config.displayName} (${provider}): ${error}`)
      continue
    }

    const configuredAttemptTimeout = options.attemptTimeoutMs?.[
      Math.min(providerCalls, Math.max(0, (options.attemptTimeoutMs?.length ?? 1) - 1))
    ] ?? config.timeoutMs ?? undefined
    const hasFiniteRemaining = Number.isFinite(remainingMs) && remainingMs > 0
    const hasConfiguredTimeout = Number.isFinite(configuredAttemptTimeout) && Number(configuredAttemptTimeout) > 0
    const attemptTimeoutMs = hasConfiguredTimeout
      ? Math.max(1, Math.min(hasFiniteRemaining ? remainingMs : Number(configuredAttemptTimeout), Number(configuredAttemptTimeout)))
      : hasFiniteRemaining
        ? Math.max(1, remainingMs)
        : undefined
    const attemptStartedAt = Date.now()
    providerCalls += 1

    console.log(`[LLM Router] Trying: ${config.displayName} (${provider}/${modelName})`)
    const result = await executeSingleLLMCall(provider, modelName, apiKey, baseUrl, prompt, maxTokens, {
      temperature: options.temperature,
      jsonMode: options.jsonMode,
      signal: options.signal,
      timeoutMs: attemptTimeoutMs,
    })
    const latencyMs = Date.now() - attemptStartedAt
    const status: LLMCallAttempt['status'] = result.text && !result.error
      ? 'success'
      : result.aborted
        ? 'aborted'
        : result.timedOut
          ? 'timeout'
          : 'failed'
    attempts.push({
      provider,
      modelName,
      latencyMs,
      status,
      ...(result.error ? { error: result.error } : {}),
    })

    if (result.text && !result.error) {
      console.log(`[LLM Router] ✅ Success via ${config.displayName} (${provider}/${modelName})`)
      return {
        ...result,
        latencyMs: Date.now() - startedAt,
        timedOut,
        attempts,
      }
    }

    if (result.rateLimited) tripCircuit(provider, modelName)
    timedOut = timedOut || Boolean(result.timedOut)
    const errDetail = result.error || 'Unknown error'
    console.warn(`[LLM Router] ${config.displayName} failed: ${errDetail}. Trying next...`)
    errors.push(`${config.displayName} (${provider}): ${errDetail}`)
    if (result.aborted) break
  }

  if (!configsToTry.length) errors.push('No enabled LLM configuration is available')
  const combinedError = `All LLM configurations failed:\n- ` + errors.join('\n- ')
  console.error(`[LLM Router] ${combinedError}`)
  return {
    text: null,
    provider: attempts.at(-1)?.provider || 'none',
    modelName: attempts.at(-1)?.modelName || 'none',
    error: combinedError,
    latencyMs: Date.now() - startedAt,
    timedOut: timedOut || (Number.isFinite(deadlineMs) && Date.now() - startedAt >= deadlineMs),
    attempts,
  }
}

export async function callLLM(
  taskTag: string,
  prompt: string,
  maxTokens: number = 1000,
  options: LLMCallOptions = {},
): Promise<LLMCallResult> {
  // 1. Fetch all matching enabled configurations, sorted by priority DESC
  const matchingConfigs = await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
      OR: [
        { taskTags: { has: taskTag } },
        { contentGenerationTypes: { has: taskTag } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  // 2. Fetch default enabled configurations not already matched, sorted by priority DESC
  const matchingIds = matchingConfigs.map((c: any) => c.id)
  const defaultConfigs = options.allowDefaultFallback === false ? [] : await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
      isDefault: true,
      NOT: { id: { in: matchingIds } }
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const configsToTry: LLMRouterConfig[] = [...matchingConfigs, ...defaultConfigs].flatMap((config) => {
    const attempts = Math.max(1, Math.min(6, 1 + (Number(config.maxRetries) || 0)))
    return Array.from({ length: attempts }, (_item, index) => ({
      provider: config.provider,
      modelName: config.modelName,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      displayName: index === 0 ? config.displayName : `${config.displayName} retry ${index}`,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    }))
  })

  // Preserve the legacy system fallback for existing callers. New credentials must
  // still be configured in LLMConfig through Admin.
  const sysProvider = process.env.SYSTEM_DEFAULT_LLM_PROVIDER || ''
  const sysModelName = process.env.SYSTEM_DEFAULT_LLM_MODEL || ''
  const sysApiKey = process.env.SYSTEM_DEFAULT_LLM_API_KEY || ''
  if (options.allowSystemFallback !== false && sysProvider && sysModelName && sysApiKey) {
    configsToTry.push({
      provider: sysProvider,
      modelName: sysModelName,
      baseUrl: null,
      apiKey: sysApiKey,
      displayName: 'System fallback',
    })
  }

  const routeDiagnostics: LLMRouteDiagnostics = {
    taskTag,
    maxTokens,
    jsonModeRequested: Boolean(options.jsonMode),
    ...(Number.isFinite(options.deadlineMs) ? { deadlineMs: Number(options.deadlineMs) } : {}),
    ...(Number.isFinite(options.maxAttempts) ? { maxAttempts: Number(options.maxAttempts) } : {}),
    allowDefaultFallback: options.allowDefaultFallback !== false,
    allowSystemFallback: options.allowSystemFallback !== false,
    configsConsidered: configsToTry.map((config, index) => ({
      index,
      displayName: config.displayName,
      provider: config.provider,
      modelName: config.modelName,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      nativeJsonMode: supportsNativeJsonMode(config.provider),
    })),
  }

  const result = await callLLMWithConfigs(configsToTry, prompt, maxTokens, options)
  return {
    ...result,
    routeDiagnostics,
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
