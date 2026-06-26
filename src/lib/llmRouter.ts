import { prisma } from './prisma.ts'
import { getGeminiApiKey } from './systemConfig.ts'

export interface LLMCallResult {
  text: string | null
  provider: string
  modelName: string
  error?: string
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
): Promise<LLMCallResult> {
  try {
    let responseText: string | null = null
    let errorMsg: string | undefined = undefined

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
          errorMsg = `Gemini API quota/token limit exceeded (Rate limit / 429). Please check your billing or limit settings.`
        } else if (response.status === 400) {
          errorMsg = `Gemini API error (400 Bad Request / Token limit exceeded). Details: ${errText.slice(0, 150)}`
        } else {
          errorMsg = `Gemini API call failed with status ${response.status}: ${response.statusText}`
        }
        console.error(`[LLM Router] ${errorMsg}`)
      }
    } 
    else if (provider === 'openai' || provider === 'deepseek' || provider === 'custom_shim') {
      const defaultEndpoint = provider === 'deepseek' 
        ? 'https://api.deepseek.com/v1' 
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
          errorMsg = `${provider.toUpperCase()} API quota/token limit exceeded (Rate limit / 429). Please check your billing or limit settings.`
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
    }
  } catch (error: any) {
    const errorMsg = `Request failed for ${provider}/${modelName}: ${error.message || error}`
    console.error(`[LLM Router]`, error)
    return { text: null, provider, modelName, error: errorMsg }
  }
}

/**
 * Dynamically routes and calls the appropriate LLM model for a given task tag.
 * Implements a failover fallback chain across all configured models in the DB,
 * and falls back to system environment variables as a final resort.
 */
export async function callLLM(
  taskTag: string,
  prompt: string,
  maxTokens: number = 1000
): Promise<LLMCallResult> {
  // 1. Fetch all matching enabled configurations
  const matchingConfigs = await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
      taskTags: { has: taskTag },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // 2. Fetch all default enabled configurations (excluding those already in matchingConfigs)
  const matchingIds = matchingConfigs.map(c => c.id)
  const defaultConfigs = await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
      isDefault: true,
      NOT: { id: { in: matchingIds } }
    },
    orderBy: { updatedAt: 'desc' },
  })

  const configsToTry = [...matchingConfigs, ...defaultConfigs]
  const errors: string[] = []

  // Try each configuration in sequence
  for (const config of configsToTry) {
    let apiKey = config.apiKey || ''
    const provider = config.provider
    const modelName = config.modelName
    const baseUrl = config.baseUrl

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
      }
    }

    if (!apiKey) {
      const errorMsg = `API key missing for provider: ${provider}, model: ${modelName}`
      console.warn(`[LLM Router] Failover warning: ${errorMsg}`)
      errors.push(`${config.displayName} (${provider}): ${errorMsg}`)
      continue
    }

    console.log(`[LLM Router] Trying configuration: ${config.displayName} (${provider}/${modelName})`)
    const result = await executeSingleLLMCall(provider, modelName, apiKey, baseUrl, prompt, maxTokens)

    if (result.text && !result.error) {
      console.log(`[LLM Router] Call succeeded using ${config.displayName} (${provider}/${modelName})`)
      return result
    }

    const errDetail = result.error || 'Unknown error'
    console.warn(`[LLM Router] Configuration ${config.displayName} failed: ${errDetail}. Trying next...`)
    errors.push(`${config.displayName} (${provider}): ${errDetail}`)
  }

  // 3. Fallback to system env / default config
  console.log('[LLM Router] All database configurations failed or none found. Trying system default fallback...')
  
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
    const result = await executeSingleLLMCall(sysProvider, sysModelName, sysApiKey, null, prompt, maxTokens)
    if (result.text && !result.error) {
      console.log(`[LLM Router] Call succeeded using system default fallback (${sysProvider}/${sysModelName})`)
      return result
    }
    errors.push(`System Fallback (${sysProvider}): ${result.error || 'Unknown error'}`)
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

