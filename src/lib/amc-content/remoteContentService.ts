import type { ContentGenerationRequest, ContentGenerationResult, ViralCopyScriptExperimentAssignment, ViralCopyScriptRecommendation } from './types.ts'

type RemoteContentResult = {
  success: true
  result: {
    caption: string
    hashtags: string[]
    quality?: unknown
    provenance?: unknown
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
    throw new Error(data?.error || `Remote content service failed with ${response.status}`)
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
    }),
    cache: 'no-store',
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `Remote video creator failed with ${response.status}`)
  }
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
