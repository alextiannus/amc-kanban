import { tryGenerateWithRemoteContentService } from './remoteContentService.ts'
import type { ContentGenerationRequest, ContentGenerationResult } from './types.ts'

export async function generateContentDirect(
  input: ContentGenerationRequest,
): Promise<ContentGenerationResult> {
  try {
    const remote = await tryGenerateWithRemoteContentService(input)
    if (remote) return remote
  } catch (err: unknown) {
    console.warn('[ContentGenerationService] remote amc-content failed; no legacy fallback:', errorMessage(err))
    throw err
  }

  throw new Error('amc-content service is not configured or did not generate content')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
