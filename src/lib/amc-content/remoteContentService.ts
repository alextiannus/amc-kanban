import type {
  ContentGenerationRequest,
  ContentGenerationResult,
  MultiPlatformContentGenerationRequest,
  MultiPlatformContentGenerationResult,
  ViralCopyScriptExperimentAssignment,
  ViralCopyScriptRecommendation,
} from './types.ts'

type RemoteContentResult = {
  success: true
  result: {
    caption: string
    hashtags: string[]
    quality?: unknown
    provenance?: unknown
  }
}

export class RemoteContentServiceError extends Error {
  status: number
  diagnostics?: unknown

  constructor(message: string, status = 502, diagnostics?: unknown) {
    super(message)
    this.name = 'RemoteContentServiceError'
    this.status = status
    this.diagnostics = diagnostics
  }
}

export type RemoteVideoCreatorRequest = {
  brandId: string
  platform?: string
  creatorType: string
  theme?: string
  idea?: string
  objective?: string
  industryVertical?: string
  assetIds?: string[]
  mediaUrls?: string[]
  aspectRatio?: string
  targetDurationSec?: number
  language?: string
  offer?: string
  reviews?: Array<{ author?: string; rating?: number; text: string; source?: string }>
  menuItems?: Array<{ name: string; price?: string; description?: string; assetId?: string }>
  usageReport?: Record<string, unknown>
  scriptPresetId?: string
  scriptDraft?: unknown
  executionMode?: 'plan_only' | 'submit'
  projectId?: string
  referenceAnalysisAssetId?: string
  approvedAssetVersionIds?: Record<string, string>
  providerProfileId?: string
  providerProfileIdsByVariant?: Partial<Record<'variant-a' | 'variant-b' | 'variant-c', string>>
  modelProfileIds?: Record<string, string>
  generationReferences?: Array<{
    assetId: string
    sourceType: 'owned' | 'licensed' | 'competitor'
    allowedUses: Array<'analysis' | 'generation_reference' | 'publish_derivative'>
    confirmedBy?: string
    confirmedRole?: string
    expiresAt?: string
  }>
  actorId?: string
  actorType?: string
  actorRole?: string
}

export async function tryGenerateWithRemoteContentService(
  input: ContentGenerationRequest,
): Promise<ContentGenerationResult | null> {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
    || (isLocal ? 'http://localhost:4010' : undefined)
  if (!baseUrl || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') return null

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()
    || (isLocal ? 'local-service-token' : undefined)
  if (token) headers.authorization = `Bearer ${token}`
  if (input.actorId) headers['x-amc-actor-id'] = input.actorId
  if (input.actorType) headers['x-amc-actor-type'] = input.actorType
  if (input.actorRole) headers['x-amc-actor-role'] = input.actorRole

  const response = await fetch(`${baseUrl}/v1/content/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      brandId: input.brandId,
      platform: input.platform,
      theme: input.theme || input.idea,
      industryVertical: input.industryVertical,
      brief: {
        industryVertical: input.industryVertical,
        theme: input.theme || input.idea,
        angle: input.angle,
        customerIntent: input.customerIntent,
        offerType: input.offerType,
        targetEmotion: input.targetEmotion,
        formatHint: input.formatHint,
        locationFocus: input.locationFocus,
        localProof: input.localProof,
        mustMention: input.mustMention,
        mustAvoid: input.mustAvoid,
      },
      mediaUrls: input.mediaUrls,
      assetIds: input.assetIds,
      copywriterId: input.copywriterId,
      copywriterName: input.copywriterName,
      draftId: input.draftId,
      taskId: input.taskId,
      copyScriptId: input.copyScriptId,
      copyScriptVersionId: input.copyScriptVersionId,
      scriptSelection: input.scriptSelection,
      experimentAssignmentId: input.experimentAssignmentId,
      experimentId: input.experimentId,
      experimentArm: input.experimentArm,
      experimentOverridden: input.experimentOverridden,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new RemoteContentServiceError(
      data?.error || `Remote content service failed with ${response.status}`,
      response.status,
      data?.diagnostics,
    )
  }

  const remote = data as RemoteContentResult
  return {
    caption: remote.result.caption,
    hashtags: remote.result.hashtags || [],
    contentEngine: 'amc-content',
    fallbackUsed: false,
    quality: remote.result.quality,
    provenance: remote.result.provenance,
  }
}

export async function generateMultiPlatformWithRemoteContentService(
  input: MultiPlatformContentGenerationRequest,
): Promise<MultiPlatformContentGenerationResult | null> {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
    || (isLocal ? 'http://localhost:4010' : undefined)
  if (!baseUrl || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') return null

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()
    || (isLocal ? 'local-service-token' : undefined)
  if (token) headers.authorization = `Bearer ${token}`
  if (input.actorId) headers['x-amc-actor-id'] = input.actorId
  if (input.actorType) headers['x-amc-actor-type'] = input.actorType
  if (input.actorRole) headers['x-amc-actor-role'] = input.actorRole

  const response = await fetch(`${baseUrl}/v1/content/generate-multi-platform`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      brandId: input.brandId,
      platforms: input.platforms,
      theme: input.theme || input.idea,
      industryVertical: input.industryVertical,
      brief: {
        industryVertical: input.industryVertical,
        theme: input.theme || input.idea,
        angle: input.angle,
        customerIntent: input.customerIntent,
        offerType: input.offerType,
        targetEmotion: input.targetEmotion,
        formatHint: input.formatHint,
        locationFocus: input.locationFocus,
        localProof: input.localProof,
        mustMention: input.mustMention,
        mustAvoid: input.mustAvoid,
      },
      mediaUrls: input.mediaUrls,
      assetIds: input.assetIds,
      taskId: input.taskId,
      continueOnError: input.continueOnError ?? true,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new RemoteContentServiceError(
      data?.error || `Remote content service failed with ${response.status}`,
      response.status,
      data?.diagnostics,
    )
  }

  return data as MultiPlatformContentGenerationResult
}

export async function recommendRemoteCopyScripts(input: {
  platform: string
  market?: string
  industry?: string
  primaryCategoryId?: string
  language?: string
  contentFormat?: string
  theme?: string
  brandId?: string
}): Promise<ViralCopyScriptRecommendation[]> {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '') || (isLocal ? 'http://localhost:4010' : undefined)
  if (!baseUrl || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') return []
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : undefined)
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${baseUrl}/v1/copy-scripts/recommend`, {
    method: 'POST', headers, body: JSON.stringify(input), cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `Copy script recommendation failed with ${response.status}`)
  return Array.isArray(data?.items) ? data.items : []
}

export async function assignRemoteCopyScriptExperiment(input: {
  scriptId: string
  scriptVersionId: string
  brandId: string
  draftId: string
  accountId?: string
  platform: string
  contentFormat?: string
  overrideArm?: 'treatment' | 'control'
}): Promise<ViralCopyScriptExperimentAssignment> {
  return callRemoteContentJson('/v1/copy-scripts/experiments/assign', input)
}

export async function recordRemoteCopyScriptOutcome(input: {
  assignmentId?: string
  draftId?: string
  platformPostId?: string
  source: 'postfast' | 'manual'
  observedAt?: string
  publishedAt?: string
  windowHours?: number
  metrics: Record<string, number | undefined>
  platformMetrics?: Record<string, unknown>
  idempotencyKey?: string
}): Promise<unknown> {
  return callRemoteContentJson('/v1/copy-scripts/outcomes', input)
}

async function callRemoteContentJson<T>(path: string, body: unknown): Promise<T> {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '') || (isLocal ? 'http://localhost:4010' : undefined)
  if (!baseUrl || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') throw new Error('AMC content service is not configured')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : undefined)
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `AMC content service failed with ${response.status}`)
  return data as T
}

export async function createRemoteVideoPlan(input: RemoteVideoCreatorRequest): Promise<unknown> {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
    || (isLocal ? 'http://localhost:4010' : undefined)
  if (!baseUrl || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') {
    throw new Error('AMC content service is not configured for video planning')
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()
    || (isLocal ? 'local-service-token' : undefined)
  if (token) headers.authorization = `Bearer ${token}`
  if (input.actorId) headers['x-amc-actor-id'] = input.actorId
  if (input.actorType) headers['x-amc-actor-type'] = input.actorType
  if (input.actorRole) headers['x-amc-actor-role'] = input.actorRole

  const response = await fetch(`${baseUrl}/v1/video/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      brandId: input.brandId,
      platform: input.platform,
      creatorType: input.creatorType,
      theme: input.theme || input.idea,
      idea: input.idea,
      objective: input.objective,
      industryVertical: input.industryVertical,
      assetIds: input.assetIds,
      mediaUrls: input.mediaUrls,
      aspectRatio: input.aspectRatio,
      targetDurationSec: input.targetDurationSec,
      language: input.language,
      offer: input.offer,
      reviews: input.reviews,
      menuItems: input.menuItems,
      usageReport: input.usageReport,
      scriptPresetId: input.scriptPresetId,
      scriptDraft: input.scriptDraft,
      executionMode: input.executionMode || 'plan_only',
      projectId: input.projectId,
      referenceAnalysisAssetId: input.referenceAnalysisAssetId,
      approvedAssetVersionIds: input.approvedAssetVersionIds,
      providerProfileId: input.providerProfileId,
      providerProfileIdsByVariant: input.providerProfileIdsByVariant,
      modelProfileIds: input.modelProfileIds,
      generationReferences: input.generationReferences,
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `Remote video creator failed with ${response.status}`)
  }
  return data
}

export async function executeRemoteVideoPlan(input: {
  brandId: string
  actorId: string
  actorType?: string
  actorRole?: string
  plan: unknown
  videoGenerationJobs?: unknown[]
  assetIds?: string[]
  imageUrls?: string[]
}): Promise<any> {
  return callRemoteVideoJson('/v1/video/execute', input, input)
}

export async function refreshRemoteVideoJob(input: {
  jobId: string
  brandId: string
  actorId: string
  actorType?: string
  actorRole?: string
}): Promise<any> {
  return callRemoteVideoJson(`/v1/video/jobs/${encodeURIComponent(input.jobId)}/refresh`, { brandId: input.brandId }, input)
}

export async function assembleRemoteVideo(input: {
  actorId: string
  actorType?: string
  actorRole?: string
  [key: string]: unknown
}): Promise<any> {
  return callRemoteVideoJson('/v1/video/assemble', input, input)
}

export async function generateRemoteTts(input: {
  text: string
  voiceId?: string
  profileId?: string
  brandId?: string
  projectId?: string
  actorId?: string
  actorType?: string
  actorRole?: string
}): Promise<{ audio: Buffer; contentType: string; asset?: unknown; provenance?: unknown }> {
  const data = await callRemoteVideoJson('/v1/tts/generate', input, input)
  if (typeof data?.audioBase64 !== 'string' || !data.audioBase64) throw new Error('AMC-Content TTS returned no audio')
  return {
    audio: Buffer.from(data.audioBase64, 'base64'),
    contentType: typeof data.contentType === 'string' ? data.contentType : 'audio/mpeg',
    asset: data.asset,
    provenance: data.provenance,
  }
}

async function callRemoteVideoJson(
  path: string,
  body: unknown,
  actor: { actorId?: string; actorType?: string; actorRole?: string },
): Promise<any> {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '') || (isLocal ? 'http://localhost:4010' : undefined)
  if (!baseUrl || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') throw new Error('AMC content service is not configured for video execution')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : undefined)
  if (token) headers.authorization = `Bearer ${token}`
  if (actor.actorId) headers['x-amc-actor-id'] = actor.actorId
  if (actor.actorType) headers['x-amc-actor-type'] = actor.actorType
  if (actor.actorRole) headers['x-amc-actor-role'] = actor.actorRole
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(120000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `AMC content video request failed with ${response.status}`)
  return data
}

export async function fetchRemoteContentCatalog(): Promise<unknown> {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
    || (isLocal ? 'http://localhost:4010' : undefined)
  if (!baseUrl || process.env.AMC_CONTENT_REMOTE_ENABLED === 'false') {
    throw new Error('AMC content service is not configured')
  }

  const headers: Record<string, string> = {}
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()
    || (isLocal ? 'local-service-token' : undefined)
  if (token) headers.authorization = `Bearer ${token}`

  const response = await fetch(`${baseUrl}/v1/platforms`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `Remote content catalog failed with ${response.status}`)
  }
  return data
}
