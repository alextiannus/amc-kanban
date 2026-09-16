import mediaInfoFactory from 'mediainfo.js'

export const MAX_VOICE_BYTES = 20_000_000

export function validateVoiceMetadata(info: { format: string; duration: number; audioCount: number; videoCount: number }) {
  if (!['Wave', 'MPEG Audio', 'MPEG-4'].includes(info.format) || info.audioCount !== 1 || info.videoCount > 0) {
    throw new Error('VOICE_AUDIO_FORMAT: Only MP3, M4A or WAV with one audio track is supported')
  }
  if (!Number.isFinite(info.duration) || info.duration < 10 || info.duration > 300) {
    throw new Error('VOICE_AUDIO_DURATION: Recording must be 10–300 seconds')
  }
}

export async function inspectVoiceAudio(body: Buffer) {
  if (!body.length || body.length > MAX_VOICE_BYTES) throw new Error('VOICE_AUDIO_SIZE: Recording must be at most 20 MB')
  const parser = await mediaInfoFactory({ format: 'object' })
  try {
    const result = await parser.analyzeData(() => body.length, (size, offset) => body.subarray(offset, offset + size))
    const tracks = result.media?.track || []
    const general = tracks.find(t => t['@type'] === 'General')
    const info = {
      format: String(general?.Format || ''),
      duration: Number(general?.Duration),
      audioCount: tracks.filter(t => t['@type'] === 'Audio').length,
      videoCount: tracks.filter(t => t['@type'] === 'Video').length,
    }
    validateVoiceMetadata(info)
    return info
  } finally { parser.close() }
}

export async function measureAudioDuration(body: Buffer) {
  const parser = await mediaInfoFactory({ format: 'object' })
  try {
    const result = await parser.analyzeData(() => body.length, (size, offset) => body.subarray(offset, offset + size))
    const duration = Number(result.media?.track?.find(t => t['@type'] === 'General')?.Duration)
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('TTS returned invalid audio')
    return duration
  } finally { parser.close() }
}
