import { prisma } from './prisma.ts'

export async function ensureSystemConfig() {
  const existing = await prisma.systemConfig.findUnique({ where: { id: 'default' } })
  if (existing) return existing

  return prisma.systemConfig.create({
    data: {
      id: 'default',
      geminiApiKey: null,
      azureSpeechKey: null,
      azureSpeechRegion: null,
    },
  })
}

export async function getGeminiApiKey(): Promise<string | null> {
  try {
    const config = await ensureSystemConfig()
    return config.geminiApiKey || process.env.GEMINI_API_KEY || null
  } catch (error) {
    console.error('[getGeminiApiKey Error]', error)
    return process.env.GEMINI_API_KEY || null
  }
}

/**
 * Azure Cognitive Speech config (TTS).
 * Credentials are stored in SystemConfig (DB), NOT in environment variables.
 * Configure via the Admin → System Config UI.
 */
export async function getAzureSpeechConfig(): Promise<{ key: string; region: string } | null> {
  try {
    const config = await ensureSystemConfig()
    const key = config.azureSpeechKey
    const region = config.azureSpeechRegion || 'eastasia'
    if (!key) return null
    return { key, region }
  } catch (error) {
    console.error('[getAzureSpeechConfig Error]', error)
    return null
  }
}
