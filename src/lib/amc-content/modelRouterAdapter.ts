import {
  resolveContentModelProfile,
  resolveContentModelProfileById,
  type ModelRequest,
  type ModelRouter,
  type ResolvedContentModelProfile,
} from 'amc-content'
import { callLLM, callLLMWithContentModelProfile } from '../llmRouter.ts'

export function createAmcContentModelRouter(): ModelRouter {
  return {
    async generateJson<T>(input: ModelRequest): Promise<{ data: T; modelId?: string }> {
      const profile = resolveContentModelProfile(input.platform, input.task, input.modelProfileId)
      const profilesToTry = resolveProfileChain(profile)
      const errors: string[] = []

      for (const candidate of profilesToTry) {
        const maxTokens = input.maxTokens ?? candidate.maxTokensByTask[input.task] ?? 1200
        const result = await callLLMWithContentModelProfile(candidate, input.prompt, maxTokens)
        if (result.text) {
          return {
            data: parseJsonResponse<T>(result.text),
            modelId: `${candidate.id}:${result.modelName || result.provider}`,
          }
        }
        errors.push(`${candidate.id}: ${result.error || 'empty response'}`)
      }

      const result = await callLLM('copywriting', input.prompt, input.maxTokens ?? profile.maxTokensByTask[input.task] ?? 1200)
      if (!result.text) {
        throw new Error([
          `Empty LLM response for ${input.task}`,
          ...errors,
          result.error || 'legacy router returned empty response',
        ].join('; '))
      }

      return {
        data: parseJsonResponse<T>(result.text),
        modelId: `legacy-copywriting:${result.modelName || result.provider}`,
      }
    },
  }
}

function resolveProfileChain(profile: ResolvedContentModelProfile): ResolvedContentModelProfile[] {
  const seen = new Set<string>()
  const chain: ResolvedContentModelProfile[] = []
  const queue = [profile]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current.id)) continue
    seen.add(current.id)
    chain.push(current)
    for (const fallbackId of current.fallbackProfileIds) {
      try {
        queue.push(resolveContentModelProfileById(fallbackId))
      } catch {
        // Ignore stale fallback ids so one bad config does not block the whole chain.
      }
    }
  }
  return chain
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
