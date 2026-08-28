import { prisma } from '@/lib/prisma'

const DEFAULT_MINIMAX_TTS_ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2'
const DEFAULT_MINIMAX_TTS_MODEL = 'speech-2.8-hd'
const DEFAULT_MINIMAX_VOICE_ID = 'Chinese (Mandarin)_Warm_Bestie'
const DEFAULT_TTS_TIMEOUT_MS = 12_000
const MAX_TTS_TIMEOUT_MS = 20_000

export type TtsExecution = {
  audio: Buffer
  contentType: string
  provenance: {
    profileId: string
    provider: string
    modelName: string
    fallbackPath: string[]
    latencyMs: number
  }
}

type TtsConfig = {
  id: string
  provider: string
  modelName: string
  apiKey: string
  baseUrl: string | null
  timeoutMs: number | null
}

type MiniMaxTtsProfileCandidate = TtsConfig & {
  taskTags?: unknown
}

function normalizeTaskTag(tag: unknown): string {
  return String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function isMiniMaxTtsProfile(config: MiniMaxTtsProfileCandidate): config is MiniMaxTtsProfileCandidate {
  if (String(config.provider || '').trim().toLowerCase() !== 'minimax') return false
  const tags = Array.isArray(config.taskTags) ? config.taskTags.map(normalizeTaskTag) : []
  const model = String(config.modelName || '').trim().toLowerCase()
  const endpoint = String(config.baseUrl || '').trim().toLowerCase()
  return tags.includes('tts') || tags.includes('tts_generation') || model.startsWith('speech-') || endpoint.includes('/t2a')
}

function ttsTimeout(configTimeoutMs: number | null | undefined) {
  const configured = Number(configTimeoutMs) || DEFAULT_TTS_TIMEOUT_MS
  return Math.max(3_000, Math.min(configured, MAX_TTS_TIMEOUT_MS))
}

async function getActiveMiniMaxTtsConfigs(): Promise<TtsConfig[]> {
  const configs: MiniMaxTtsProfileCandidate[] = await prisma.lLMConfig.findMany({
    where: {
      isEnabled: true,
    },
    orderBy: [
      { isDefault: 'desc' },
      { priority: 'desc' },
      { updatedAt: 'desc' },
    ],
    select: {
      id: true,
      provider: true,
      modelName: true,
      apiKey: true,
      baseUrl: true,
      timeoutMs: true,
      taskTags: true,
    },
  })

  return configs.filter(isMiniMaxTtsProfile).map((config) => ({
    id: config.id,
    provider: config.provider,
    modelName: config.modelName,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
  }))
}

async function callMiniMaxTts(config: TtsConfig, input: { text: string; voiceId?: string }) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ttsTimeout(config.timeoutMs))

  try {
    const response = await fetch(config.baseUrl || DEFAULT_MINIMAX_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.modelName || DEFAULT_MINIMAX_TTS_MODEL,
        text: input.text,
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: input.voiceId || DEFAULT_MINIMAX_VOICE_ID,
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
      throw new Error(`MiniMax TTS HTTP ${response.status}: ${raw.slice(0, 180) || response.statusText}`)
    }

    let payload: any = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      throw new Error('MiniMax TTS returned a non-JSON response')
    }

    const statusCode = payload?.base_resp?.status_code
    const statusMsg = payload?.base_resp?.status_msg
    const audioHex = payload?.data?.audio
    if (statusCode !== 0 || typeof audioHex !== 'string' || !audioHex) {
      throw new Error(`MiniMax TTS ${statusCode ?? 'unknown'}: ${statusMsg ?? 'empty audio'}`)
    }

    return {
      audio: Buffer.from(audioHex, 'hex'),
      contentType: 'audio/mpeg',
      latencyMs: Date.now() - startedAt,
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`MiniMax TTS timeout after ${ttsTimeout(config.timeoutMs)}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateTtsAudio(input: {
  text: string
  voiceId?: string
  brandId?: string
  projectId?: string
  actorId?: string
  actorType?: string
  actorRole?: string
}): Promise<TtsExecution> {
  const configs = await getActiveMiniMaxTtsConfigs()
  if (!configs.length) throw new Error('TTS_MODEL_NOT_CONFIGURED')

  const fallbackPath: string[] = []
  let lastError: unknown = null

  for (const config of configs) {
    try {
      const result = await callMiniMaxTts(config, input)
      return {
        audio: result.audio,
        contentType: result.contentType,
        provenance: {
          profileId: config.id,
          provider: config.provider,
          modelName: config.modelName,
          fallbackPath,
          latencyMs: result.latencyMs,
        },
      }
    } catch (error) {
      lastError = error
      fallbackPath.push(config.id)
      console.warn(`[TTS] MiniMax profile ${config.id} failed:`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('TTS generation failed')
}
