import { NextResponse } from 'next/server'
import type { IndustryVertical } from 'amc-content'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { generateContentWithFallback } from '@/lib/amc-content/contentGenerationService'

export const maxDuration = 120

const industryVerticals = new Set([
  'food_beverage',
  'beauty_wellness',
  'fitness_pilates',
  'home_renovation',
  'pet_services',
  'education_training',
  'healthcare_clinic',
  'retail_specialty',
  'events_entertainment',
  'professional_services',
  'general_local_service',
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
    const platform = stringOrEmpty(body.platform)
    const theme = stringOrEmpty(body.theme || body.idea)
    const industryVertical = optionalIndustryVertical(body.industryVertical)

    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    if (!platform) return NextResponse.json({ error: 'platform is required' }, { status: 400 })
    if (!theme && !body.taskId) return NextResponse.json({ error: 'theme or taskId is required' }, { status: 400 })
    if (body.industryVertical && !industryVertical) {
      return NextResponse.json({ error: 'Unsupported industryVertical' }, { status: 400 })
    }

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const startedAt = Date.now()
    const result = await generateContentWithFallback({
      brandId,
      platform,
      theme,
      idea: theme,
      industryVertical,
      angle: optionalString(body.angle),
      customerIntent: optionalString(body.customerIntent),
      offerType: optionalString(body.offerType),
      targetEmotion: optionalString(body.targetEmotion),
      formatHint: optionalString(body.formatHint),
      locationFocus: optionalString(body.locationFocus),
      localProof: stringArray(body.localProof),
      mustMention: stringArray(body.mustMention),
      mustAvoid: stringArray(body.mustAvoid),
      mediaUrls: stringArray(body.mediaUrls),
      assetIds: stringArray(body.assetIds),
      draftId: optionalString(body.draftId) ?? null,
      taskId: optionalString(body.taskId) ?? null,
      fallbackToLegacy: body.fallbackToLegacy !== false,
      actorId: actor.id,
    })

    return NextResponse.json({
      success: true,
      latencyMs: Date.now() - startedAt,
      ...result,
    })
  } catch (err: any) {
    console.error('[ContentGenerate] failed:', err)
    return NextResponse.json({ error: err.message || 'Content generation failed' }, { status: 500 })
  }
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalString(value: unknown): string | undefined {
  const text = stringOrEmpty(value)
  return text || undefined
}

function optionalIndustryVertical(value: unknown): IndustryVertical | undefined {
  const text = optionalString(value)
  if (!text) return undefined
  return industryVerticals.has(text) ? text as IndustryVertical : undefined
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => stringOrEmpty(item)).filter(Boolean)
  if (typeof value === 'string') return value.split('\n').map((item) => item.trim()).filter(Boolean)
  return []
}
