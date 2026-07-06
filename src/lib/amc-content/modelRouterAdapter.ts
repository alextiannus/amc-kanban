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
          try {
            return {
              data: parseJsonResponse<T>(result.text),
              modelId: `${candidate.id}:${result.modelName || result.provider}`,
            }
          } catch (error: any) {
            errors.push(`${candidate.id}: ${error?.message || 'invalid JSON response'}`)
            continue
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
        data: await parseOrRepairJsonResponse<T>(result.text, input, errors),
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

async function parseOrRepairJsonResponse<T>(
  text: string,
  input: ModelRequest,
  errors: string[],
): Promise<T> {
  try {
    return parseJsonResponse<T>(text)
  } catch (error: any) {
    errors.push(`legacy-copywriting: ${error?.message || 'invalid JSON response'}`)
    const repair = await callLLM(
      'copywriting',
      [
        'Convert the following model output into strict JSON only.',
        `Expected schema: ${jsonSchemaHint(input.task)}`,
        'Do not add markdown fences, comments, explanations, or extra keys.',
        'If a field is missing, infer the safest empty value that preserves publishable meaning.',
        '',
        'MODEL OUTPUT:',
        text.slice(0, 6000),
      ].join('\n'),
      Math.min(input.maxTokens ?? 1200, 900),
    )
    if (!repair.text) {
      throw new Error([
        `Unable to parse JSON response: ${text.slice(0, 240)}`,
        ...errors,
        repair.error || 'JSON repair returned empty response',
      ].join('; '))
    }
    try {
      return parseJsonResponse<T>(repair.text)
    } catch (repairError: any) {
      throw new Error([
        repairError?.message || `Unable to parse JSON repair response: ${repair.text.slice(0, 240)}`,
        ...errors,
      ].join('; '))
    }
  }
}

function jsonSchemaHint(task: ModelRequest['task']): string {
  if (task === 'hook_generation') {
    return '{ "hooks": [{ "text": string, "category": string, "score": number, "reason": string }] }'
  }
  return '{ "caption": string, "hashtags": string[] }'
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
