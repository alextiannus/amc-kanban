import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getMiniMaxApiKey } from '@/lib/systemConfig'

export const dynamic = 'force-dynamic'

const DEFAULT_ENDPOINT = 'https://api.minimaxi.chat/v1/t2a_v2'
const MAX_TEXT_LENGTH = 600
const UPSTREAM_TIMEOUT_MS = 8_000

/**
 * POST /api/mm/tts-proxy
 *
 * Server-side MiniMax TTS proxy used by amc-mm when the key lives in
 * amc-kanban SystemConfig DB. Requires a valid user session (forwarded
 * cookie from amc-mm).
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = await getMiniMaxApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'MiniMax TTS is not configured. Set the API key in Admin → System Config.' },
      { status: 503 },
    )
  }

  let text = ''
  try {
    const body = await req.json()
    text = typeof body?.text === 'string' ? body.text.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `text must be ${MAX_TEXT_LENGTH} characters or fewer` },
      { status: 400 },
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  const startedAt = performance.now()

  try {
    const response = await fetch(process.env.MINIMAX_TTS_ENDPOINT || DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.MINIMAX_TTS_MODEL || 'speech-02-turbo',
        text,
        stream: false,
        language_boost: 'Chinese',
        output_format: 'hex',
        voice_setting: {
          voice_id: process.env.MINIMAX_TTS_VOICE_ID || 'female-shaonv',
          speed: 0.98,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error('[MiniMax TTS Proxy] Upstream error:', response.status, errText.slice(0, 200))
      return NextResponse.json({ error: 'MiniMax TTS request failed' }, { status: 502 })
    }

    const payload = await response.json()
    const statusCode = payload?.base_resp?.status_code
    const audioHex = payload?.data?.audio

    if (statusCode !== 0 || typeof audioHex !== 'string' || !audioHex) {
      const msg = payload?.base_resp?.status_msg ?? 'unknown'
      const trace = payload?.trace_id ?? ''
      console.error(`[MiniMax TTS Proxy] Invalid response: statusCode=${statusCode} msg="${msg}" trace=${trace}`)
      return NextResponse.json({ error: `MiniMax TTS error: ${statusCode} - ${msg}` }, { status: 502 })
    }

    const audio = Buffer.from(audioHex, 'hex')
    if (audio.length === 0) {
      return NextResponse.json({ error: 'MiniMax TTS returned empty audio' }, { status: 502 })
    }

    const durationMs = Math.round(performance.now() - startedAt)
    console.log(`[MiniMax TTS Proxy] ✅ ${audio.length} bytes in ${durationMs}ms`)

    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'private, no-store',
        'Server-Timing': `minimax;dur=${durationMs}`,
        'X-TTS-Provider': 'minimax',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'MiniMax TTS timed out' }, { status: 504 })
    }
    console.error('[MiniMax TTS Proxy] Request error:', error)
    return NextResponse.json({ error: 'MiniMax TTS request failed' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
