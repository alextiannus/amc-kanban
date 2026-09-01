import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { assembleVideo } from '@/lib/videoProduction'
import { generateRemoteTts } from '@/lib/amc-content/remoteContentService'

export const maxDuration = 120

type VoiceoverMediaSegment = {
  url: string
  offsetSec?: number
  shotDurationSec: number
  shotId?: string
  shotIndex?: number
}

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
    const voiceoverVoiceId = optionalString(body?.voiceoverVoiceId)
    const voiceoverSegmentsInput = normalizeVoiceoverSegments(body?.voiceoverSegments)

    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    if (clipUrls.length < 1) return NextResponse.json({ error: '至少选择一个已生成分镜视频。' }, { status: 400 })
    if (voiceoverSegmentsInput.length && !voiceoverVoiceId) {
      return NextResponse.json({ error: 'voiceoverVoiceId is required when voiceoverSegments are provided' }, { status: 400 })
    }

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const voiceoverSegments: VoiceoverMediaSegment[] | undefined = voiceoverVoiceId && voiceoverSegmentsInput.length
      ? (await Promise.all(voiceoverSegmentsInput.map(async (segment) => {
          const tts = await generateRemoteTts({
            text: segment.text,
            voiceId: voiceoverVoiceId,
            brandId,
            actorId: actor.id,
            actorType: actor.type,
            actorRole: actor.role,
          })
          const url = typeof (tts.asset as any)?.url === 'string' ? (tts.asset as any).url : ''
          if (!url) {
            throw Object.assign(new Error('TTS did not return an audio URL for a voiceover segment'), { status: 502 })
          }
          return {
            url,
            offsetSec: segment.offsetSec,
            shotDurationSec: segment.shotDurationSec,
            shotId: segment.shotId,
            shotIndex: segment.shotIndex,
          }
        })))
      : undefined

    const execution = await assembleVideo({
      brandId,
      actorId: actor.id,
      title,
      clipUrls,
      aspectRatio: optionalString(body.aspectRatio),
      finalText: optionalString(body.finalText) || scriptSummary,
      referenceAssetIds: stringArray(body.referenceAssetIds),
      parentAssetIds: stringArray(body.parentAssetIds),
      voiceoverSegments,
    })

    return NextResponse.json({ success: true, execution })
  } catch (err: any) {
    console.error('[VideoAssemble] failed:', err)
    return NextResponse.json({ error: err.message || 'Video assembly failed' }, { status: statusFromError(err) })
  }
}

function normalizeVoiceoverSegments(value: unknown): Array<{
  text: string
  offsetSec?: number
  shotDurationSec: number
  shotId?: string
  shotIndex?: number
}> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const text = optionalString(record.text)
    const shotDurationSec = numberOrUndefined(record.shotDurationSec) || numberOrUndefined(record.durationSec) || 4
    if (!text) return []
    return [{
      text,
      offsetSec: numberOrUndefined(record.offsetSec),
      shotDurationSec,
      shotId: optionalString(record.shotId),
      shotIndex: numberOrUndefined(record.shotIndex) ?? index,
    }]
  })
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function statusFromError(err: any): number {
  return typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500
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
