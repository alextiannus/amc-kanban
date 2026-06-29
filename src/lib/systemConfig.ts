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

/** ─── Publishing Standards ─────────────────────────────────────────────────
 * 系统统一发布频率标准。
 * Admin → System Config UI 中可覆盖，否则使用 DEFAULT_PUBLISHING_STANDARDS。
 */
export interface PlatformStandard {
  minPerWeek: number   // 每周最低发布篇数
}

export interface PublishingStandards {
  maxDaysSilent: number                        // 某平台超过N天无发布即告警
  minTotalPerWeek: number                      // 全平台汇总每周最低总篇数
  platforms: Record<string, PlatformStandard>  // per-platform 标准，key = platform slug
}

export const DEFAULT_PUBLISHING_STANDARDS: PublishingStandards = {
  maxDaysSilent: 4,
  minTotalPerWeek: 3,
  platforms: {
    instagram:    { minPerWeek: 2 },
    xiaohongshu:  { minPerWeek: 2 },
    google:       { minPerWeek: 1 },
    facebook:     { minPerWeek: 1 },
    tiktok:       { minPerWeek: 1 },
  },
}

export async function getPublishingStandards(): Promise<PublishingStandards> {
  try {
    const config = await ensureSystemConfig()
    if (config.publishingStandards) {
      const stored = config.publishingStandards as Partial<PublishingStandards>
      return {
        ...DEFAULT_PUBLISHING_STANDARDS,
        ...stored,
        platforms: {
          ...DEFAULT_PUBLISHING_STANDARDS.platforms,
          ...(stored.platforms ?? {}),
        },
      }
    }
    return DEFAULT_PUBLISHING_STANDARDS
  } catch {
    return DEFAULT_PUBLISHING_STANDARDS
  }
}
