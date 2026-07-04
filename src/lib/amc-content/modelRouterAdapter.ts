import type { ModelRequest, ModelRouter } from 'amc-content'
import { callLLM } from '../llmRouter.ts'

export function createAmcContentModelRouter(): ModelRouter {
  return {
    async generateJson<T>(input: ModelRequest): Promise<{ data: T; modelId?: string }> {
      const result = await callLLM('copywriting', input.prompt, input.maxTokens ?? 1200)
      if (!result.text) {
        throw new Error(result.error || `Empty LLM response for ${input.task}`)
      }

      return {
        data: parseJsonResponse<T>(result.text),
        modelId: result.modelName || result.provider,
      }
    },
  }
}

function parseJsonResponse<T>(text: string): T {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    const objectCandidate = extractJsonCandidate(cleaned, '{', '}')
    if (objectCandidate) {
      return JSON.parse(objectCandidate) as T
    }

    const arrayCandidate = extractJsonCandidate(cleaned, '[', ']')
    if (arrayCandidate) {
      return JSON.parse(arrayCandidate) as T
    }

    throw new Error(`Unable to parse JSON response: ${cleaned.slice(0, 240)}`)
  }
}

function extractJsonCandidate(text: string, startToken: string, endToken: string): string | null {
  const start = text.indexOf(startToken)
  const end = text.lastIndexOf(endToken)
  if (start === -1 || end === -1 || end <= start) return null
  return text.slice(start, end + 1)
}
