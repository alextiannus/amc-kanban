import { prisma } from './prisma.ts'
import { getGeminiApiKey } from './systemConfig.ts'

export interface LLMCallResult {
  text: string | null
  provider: string
  modelName: string
}

/**
 * Dynamically routes and calls the appropriate LLM model for a given task tag.
 * Implements the 3-tier fallback logic:
 * 1. Task Tag matching config in DB
 * 2. Default config in DB
 * 3. Environment variables / System config fallback (defaults to Gemini)
 */
export async function callLLM(
  taskTag: string,
  prompt: string,
  maxTokens: number = 1000
): Promise<LLMCallResult> {
  // 1. Try to find task-specific configuration in DB
  let config = await prisma.lLMConfig.findFirst({
    where: {
      isEnabled: true,
      taskTags: { has: taskTag },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // 2. Try to find the default configuration in DB
  if (!config) {
    config = await prisma.lLMConfig.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  let provider = 'google'
  let modelName = 'gemini-2.0-flash'
  let apiKey = ''
  let baseUrl: string | null = null

  if (config) {
    provider = config.provider
    modelName = config.modelName
    apiKey = config.apiKey || ''
    baseUrl = config.baseUrl
  } else {
    // 3. Fallback to system env / default config
    provider = process.env.SYSTEM_DEFAULT_LLM_PROVIDER || 'google'
    modelName = process.env.SYSTEM_DEFAULT_LLM_MODEL || 'gemini-2.0-flash'
    apiKey = process.env.SYSTEM_DEFAULT_LLM_API_KEY || ''
  }

  // Robust API key fallback if apiKey is missing/empty
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
    console.warn(`[LLM Router] API key missing for provider: ${provider}, model: ${modelName}. Failed to route.`)
    return { text: null, provider, modelName }
  }

  try {
    let responseText: string | null = null

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
        console.error(`[LLM Router] Gemini API call failed: ${response.status} ${response.statusText}`)
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
        console.error(`[LLM Router] OpenAI-compatible API call failed: ${response.status} ${response.statusText}`)
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
        console.error(`[LLM Router] Anthropic API call failed: ${response.status} ${response.statusText}`)
      }
    } 
    else {
      console.error(`[LLM Router] Unsupported LLM provider: ${provider}`)
    }

    return {
      text: responseText ? responseText.trim() : null,
      provider,
      modelName,
    }
  } catch (error) {
    console.error(`[LLM Router] Request failed for ${provider}/${modelName}:`, error)
    return { text: null, provider, modelName }
  }
}
