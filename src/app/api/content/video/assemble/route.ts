import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { assembleRemoteVideo } from '@/lib/amc-content/remoteContentService'

export const maxDuration = 120

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
    const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
    const title = typeof body?.title === 'string' ? body.title.trim() : '最终成片'
    const clipUrls = Array.isArray(body?.clipUrls)
      ? body.clipUrls.map((item: unknown) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
      : []
    const scriptSummary = typeof body?.scriptSummary === 'string' ? body.scriptSummary.trim() : undefined

    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    if (clipUrls.length < 2) return NextResponse.json({ error: '至少选择两个已生成分镜视频。' }, { status: 400 })

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const execution = await assembleRemoteVideo({
      brandId,
      actorId: actor.id,
      actorType: actor.type,
      actorRole: actor.role,
      title,
      clipUrls,
      voiceoverUrl: optionalString(body.voiceoverUrl),
      musicUrl: optionalString(body.musicUrl),
      logoUrl: optionalString(body.logoUrl),
      subtitles: Array.isArray(body.subtitles) ? body.subtitles : undefined,
      addressText: optionalString(body.addressText),
      ctaText: optionalString(body.ctaText),
      finalText: optionalString(body.finalText) || scriptSummary,
      referenceTexts: stringArray(body.referenceTexts),
      referenceAssetIds: stringArray(body.referenceAssetIds),
      projectId: optionalString(body.projectId),
      variantId: optionalString(body.variantId),
      promptBundleVersionId: optionalString(body.promptBundleVersionId),
      parentAssetIds: stringArray(body.parentAssetIds),
    })

    return NextResponse.json({ success: true, execution })
  } catch (err: any) {
    console.error('[VideoAssemble] failed:', err)
    return NextResponse.json({ error: err.message || 'Video assembly failed' }, { status: 500 })
  }
}

function optionalString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : []
}
