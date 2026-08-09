import { generateRemoteTts } from '@/lib/amc-content/remoteContentService'

export type TtsExecution = {
  audio: Buffer
  contentType: string
  provenance: {
    profileId: string
    provider: string
    modelName: string
    fallbackPath: string[]
    latencyMs: number
  }
}

export async function generateTtsAudio(input: {
  text: string
  voiceId?: string
  brandId?: string
  projectId?: string
  actorId?: string
  actorType?: string
  actorRole?: string
}): Promise<TtsExecution> {
  const result = await generateRemoteTts(input)
  const provenance = result.provenance && typeof result.provenance === 'object'
    ? result.provenance as TtsExecution['provenance']
    : { profileId: 'amc-content', provider: 'amc-content', modelName: 'remote', fallbackPath: [], latencyMs: 0 }
  return { audio: result.audio, contentType: result.contentType, provenance }
}
