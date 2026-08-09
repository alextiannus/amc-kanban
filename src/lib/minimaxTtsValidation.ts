const DEFAULT_MINIMAX_TTS_ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2'
const DEFAULT_MINIMAX_TTS_MODEL = 'speech-2.8-hd'
const DEFAULT_MINIMAX_VOICE_ID = 'Chinese (Mandarin)_Warm_Bestie'
const VALIDATION_TIMEOUT_MS = 10_000

export function isMiniMaxTtsConfig(provider: unknown, modelName: unknown, baseUrl: unknown, taskTags: unknown): boolean {
  if (String(provider).trim().toLowerCase() !== 'minimax') return false
  const tags = Array.isArray(taskTags)
    ? taskTags.map(tag => String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_'))
    : []
  const model = String(modelName || '').trim().toLowerCase()
  const endpoint = String(baseUrl || '').trim().toLowerCase()

  return tags.includes('tts') || tags.includes('tts_generation') || model.startsWith('speech-') || endpoint.includes('/t2a')
}

export async function validateMiniMaxTtsConfig(input: {
  modelName: string
  apiKey: string
  baseUrl: string | null
}): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

  try {
    const response = await fetch(input.baseUrl || DEFAULT_MINIMAX_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.modelName || DEFAULT_MINIMAX_TTS_MODEL,
        text: 'MiniMax TTS configuration check.',
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: DEFAULT_MINIMAX_VOICE_ID,
          speed: 1,
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

    const raw = await response.text().catch(() => '')
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${raw.slice(0, 180) || response.statusText}` }
    }

    let payload: any = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      return { success: false, error: 'MiniMax returned a non-JSON response.' }
    }

    const statusCode = payload?.base_resp?.status_code
    const statusMsg = payload?.base_resp?.status_msg
    const audioHex = payload?.data?.audio
    if (statusCode !== 0 || typeof audioHex !== 'string' || !audioHex) {
      return { success: false, error: `${statusCode ?? 'unknown'} - ${statusMsg ?? 'empty audio'}` }
    }

    return { success: true }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { success: false, error: 'MiniMax TTS validation timed out.' }
    }
    return { success: false, error: error?.message || 'MiniMax TTS validation failed.' }
  } finally {
    clearTimeout(timeout)
  }
}
