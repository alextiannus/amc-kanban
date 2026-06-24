import { getGeminiApiKey } from './systemConfig.ts'

/**
 * Call the Gemini 2.0 Flash API to generate text.
 * Falls back to null if the API key is not configured or the call fails.
 */
export async function generateText(prompt: string, maxTokens: number = 800): Promise<string | null> {
  const apiKey = await getGeminiApiKey()
  if (!apiKey) {
    console.warn('[Gemini] API Key is missing. Skipping LLM request.')
    return null
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      }
    )

    if (!response.ok) {
      console.error(`[Gemini] API failed with status ${response.status}: ${response.statusText}`)
      return null
    }

    const json = await response.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? text.trim() : null
  } catch (error) {
    console.error('[Gemini] Request failed:', error)
    return null
  }
}

/**
 * Call the Gemini 2.0 Flash API with multimodal input (text prompt + image inlineData).
 */
export async function generateMultimodalText(
  prompt: string,
  mimeType: string,
  base64Data: string,
  maxTokens: number = 500
): Promise<string | null> {
  const apiKey = await getGeminiApiKey()
  if (!apiKey) {
    console.warn('[Gemini Multimodal] API Key is missing. Skipping request.')
    return null
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      }
    )

    if (!response.ok) {
      console.error(`[Gemini Multimodal] API failed with status ${response.status}: ${response.statusText}`)
      return null
    }

    const json = await response.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? text.trim() : null
  } catch (error) {
    console.error('[Gemini Multimodal] Request failed:', error)
    return null
  }
}
