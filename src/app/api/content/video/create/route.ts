import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { createRemoteVideoPlan } from '@/lib/amc-content/remoteContentService'

export const maxDuration = 120

const creatorTypes = new Set([
  'product_showcase',
  'story_campaign',
  'review_to_video',
  'event_offer',
  'menu_recommendation',
  'local_discovery',
  'monthly_report',
  'brand_refresh',
])

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function POST(request: Request) {
  try {
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const brandId = stringOrEmpty(body.brandId)
    const creatorType = stringOrEmpty(body.creatorType)
    const theme = stringOrEmpty(body.theme || body.idea)
    const assetIds = stringArray(body.assetIds)
    const mediaUrls = stringArray(body.mediaUrls)

    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    if (!creatorTypes.has(creatorType)) return NextResponse.json({ error: 'Unsupported video creator' }, { status: 400 })
    if (!theme) return NextResponse.json({ error: 'theme or idea is required' }, { status: 400 })
    const executionMode = stringOrEmpty(body.executionMode)
    if (executionMode === 'submit' && assetIds.length === 0 && mediaUrls.length === 0 && creatorType !== 'monthly_report') {
      return NextResponse.json({ error: 'Select at least one media asset for this video creator' }, { status: 400 })
    }

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const startedAt = Date.now()
    const suppliedPlan = body.plan && typeof body.plan === 'object' ? body.plan : null
    const result = suppliedPlan
      ? { success: true, result: suppliedPlan }
      : await createRemoteVideoPlan({
          brandId,
          creatorType,
          platform: optionalString(body.platform) || 'tiktok',
          theme,
          idea: optionalString(body.idea) || theme,
          objective: optionalString(body.objective),
          industryVertical: optionalString(body.industryVertical),
          assetIds,
          mediaUrls,
          aspectRatio: optionalString(body.aspectRatio),
          targetDurationSec: numberOrUndefined(body.targetDurationSec),
          language: optionalString(body.language),
          offer: optionalString(body.offer),
          reviews: Array.isArray(body.reviews) ? body.reviews : undefined,
          menuItems: Array.isArray(body.menuItems) ? body.menuItems : undefined,
          usageReport: body.usageReport && typeof body.usageReport === 'object' ? body.usageReport : undefined,
          scriptPresetId: optionalString(body.scriptPresetId),
          scriptDraft: body.scriptDraft && typeof body.scriptDraft === 'object' ? body.scriptDraft : undefined,
          executionMode: executionMode === 'submit' ? 'submit' : 'plan_only',
          projectId: optionalString(body.projectId),
          referenceAnalysisAssetId: optionalString(body.referenceAnalysisAssetId),
          approvedAssetVersionIds: body.approvedAssetVersionIds && typeof body.approvedAssetVersionIds === 'object' ? body.approvedAssetVersionIds : undefined,
          providerProfileId: optionalString(body.providerProfileId),
          providerProfileIdsByVariant: body.providerProfileIdsByVariant && typeof body.providerProfileIdsByVariant === 'object' ? body.providerProfileIdsByVariant : undefined,
          modelProfileIds: body.modelProfileIds && typeof body.modelProfileIds === 'object' ? body.modelProfileIds : undefined,
          generationReferences: Array.isArray(body.generationReferences) ? body.generationReferences : undefined,
          actorId: actor.id,
          actorType: actor.type,
          actorRole: actor.role,
        })

    let execution: unknown = undefined
    if (executionMode === 'submit') {
      const remoteResult = result as { result?: any; execution?: any; remote?: { result?: any; execution?: any } }
      execution = remoteResult.execution || remoteResult.remote?.execution
      if (!execution) return NextResponse.json({ error: 'AMC-Content did not execute the approved video plan' }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      latencyMs: Date.now() - startedAt,
      remote: result,
      execution,
    })
  } catch (err: any) {
    console.error('[VideoCreate] failed:', err)
    return NextResponse.json({ error: err.message || 'Video creator failed' }, { status: 500 })
  }
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalString(value: unknown): string | undefined {
  const text = stringOrEmpty(value)
  return text || undefined
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => stringOrEmpty(item)).filter(Boolean)
  if (typeof value === 'string') return value.split('\n').map((item) => item.trim()).filter(Boolean)
  return []
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
