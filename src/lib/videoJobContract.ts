const VOICE_STATE_FIELDS = [
  'voiceSelection', 'voiceTaskId', 'awaitingVoiceover', 'voiceoverRequired', 'voiceoverVoiceId',
  'brandVoiceProfileId', 'brandVoiceLabel', 'musicUrl', 'selectedMusicPrompt', 'script',
] as const

const forbiddenIdentityKey = (key: string) =>
  /^(?:createdBy(?:Id)?|updatedBy(?:Id)?|owner(?:Id)?|actor(?:Id)?|editorActorId|user(?:Id)?)$/i.test(key)

function voiceState(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const state = value as Record<string, unknown>
  return Object.fromEntries(VOICE_STATE_FIELDS.filter(key => state[key] !== undefined).map(key => [key, state[key]]))
}

function redactPublicValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(redactPublicValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key.toLowerCase() !== 'videoreceipt' && !forbiddenIdentityKey(key))
    .map(([key, nested]) => [key, redactPublicValue(nested)]))
}

/** Full server-only persistence shape. Never return this from a session/API-key route. */
export function serializeTrustedVideoJob(job: any) {
  return {
    createdBy: job.createdBy,
    ...voiceState(job.voiceoverState),
    id: job.id,
    brandId: job.brandId,
    creativeId: job.creativeId,
    title: job.title,
    platform: job.platform,
    idea: job.idea,
    status: job.status,
    scenes: Array.isArray(job.scenes) ? job.scenes : [],
    finalVideoUrl: job.finalVideoUrl,
    thumbnailUrl: job.thumbnailUrl,
    narration: job.narration,
    musicBrief: job.musicBrief,
    progress: job.progress,
    error: job.error,
    plan: job.plan,
    creatorType: job.creatorType,
    aspectRatio: job.aspectRatio,
    assetIds: job.assetIds || [],
    mediaUrls: job.mediaUrls || [],
    sceneExecutions: job.sceneExecutions || {},
    finalExecution: job.finalExecution,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : job.updatedAt,
  }
}

/** Merchant/public shape: retain safe UI state while recursively removing identity and signed persistence material. */
export function serializePublicVideoJob(job: any) {
  return { ...(redactPublicValue(serializeTrustedVideoJob(job)) as Record<string, unknown>), ownedByCurrentActor: true }
}
