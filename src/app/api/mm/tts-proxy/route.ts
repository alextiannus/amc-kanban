import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateTtsAudio } from '@/lib/ttsGeneration'

export const dynamic = 'force-dynamic'

const MAX_TEXT_LENGTH = 600

/**
 * Server-side TTS proxy. The execution profile is dynamically selected from
 * LLMConfig taskTags=tts_generation; the legacy tts tag remains compatible.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let text = ''
  let voiceId = ''
  try {
    const body = await req.json()
    text = typeof body?.text === 'string' ? body.text.trim() : ''
    voiceId = typeof body?.voiceId === 'string' ? body.voiceId.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `text must be ${MAX_TEXT_LENGTH} characters or fewer` }, { status: 400 })
  }

  try {
    const result = await generateTtsAudio({
      text,
      voiceId,
      actorId: session.user.id,
      actorType: session.user.type ?? 'HUMAN',
      actorRole: session.user.role,
    })
    return new Response(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.audio.length),
        'Cache-Control': 'private, no-store',
        'Server-Timing': `tts;dur=${result.provenance.latencyMs}`,
        'X-TTS-Provider': result.provenance.provider,
        'X-TTS-Model': result.provenance.modelName,
        'X-TTS-Profile': result.provenance.profileId,
        'X-TTS-Fallback-Path': result.provenance.fallbackPath.join(','),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TTS generation failed'
    if (message === 'TTS_MODEL_NOT_CONFIGURED') {
      return NextResponse.json({ error: 'TTS is not configured. Add an enabled tts_generation model profile.' }, { status: 503 })
    }
    if (message.toLowerCase().includes('timeout')) return NextResponse.json({ error: 'TTS timed out' }, { status: 504 })
    console.error('[TTS Proxy] request failed:', error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
