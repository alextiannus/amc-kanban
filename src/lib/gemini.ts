import { callLLM } from './llmRouter.ts'
import { prisma } from './prisma'

/**
 * Call the best available LLM to generate text.
 * Routes through LLMConfig by taskTag — no hardcoded provider.
 */
export async function generateText(prompt: string, maxTokens: number = 800): Promise<string | null> {
  const result = await callLLM('copywriting', prompt, maxTokens)
  if (result.text) return result.text
  console.warn('[generateText] All LLM providers failed:', result.error)
  return null
}

/**
 * Call a Google Gemini model with multimodal input (text + image inlineData).
 *
 * Reads the API key from the first enabled LLMConfig row with provider='google'.
 * If no Google LLMConfig is configured, returns null (feature is silently unavailable).
 *
 * To enable: Admin → AI 模型配置 → 新建 → provider=google, modelName=gemini-2.0-flash, apiKey=<key>
 */
export async function generateMultimodalText(
  prompt: string,
  mimeType: string,
  base64Data: string,
  maxTokens: number = 500
): Promise<string | null> {
  // Look up Google config from LLMConfig — no SystemConfig dependency
  const googleConfig = await prisma.lLMConfig.findFirst({
    where: { isEnabled: true, provider: 'google' },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  if (!googleConfig?.apiKey) {
    console.warn('[generateMultimodalText] No Google LLMConfig with API key found. Skipping multimodal request.')
    return null
  }

  const { apiKey, modelName } = googleConfig

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      }
    )

    if (!response.ok) {
      console.error(`[generateMultimodalText] API failed ${response.status}: ${response.statusText}`)
      return null
    }

    const json = await response.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? text.trim() : null
  } catch (error) {
    console.error('[generateMultimodalText] Request failed:', error)
    return null
  }
}
