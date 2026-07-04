import { prisma } from './prisma.ts'

// ── 内存缓存：避免每次语音对话都查 DB 获取 API Key ───────────────────────────
// Gemini Key 几乎不会变，5 分钟缓存完全安全。
const _keyCache: Record<string, { value: string | null; ts: number }> = {}
const KEY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCachedKey(name: string): string | null | undefined {
  const entry = _keyCache[name]
  if (entry && Date.now() - entry.ts < KEY_CACHE_TTL) return entry.value
  return undefined // miss
}
function setCachedKey(name: string, value: string | null) {
  _keyCache[name] = { value, ts: Date.now() }
}

export async function ensureSystemConfig() {
  const existing = await prisma.systemConfig.findUnique({ where: { id: 'default' } })
  if (existing) return existing

  return prisma.systemConfig.create({
    data: {
      id: 'default',
      geminiApiKey: null,
      metaAppId: null,
      metaAppSecret: null,
      metaRedirectUri: null,
      googleClientId: null,
      googleClientSecret: null,
      googleRedirectUri: null,
      tiktokClientKey: null,
      tiktokClientSecret: null,
      tiktokRedirectUri: null,
      useDirectPublishing: false,
      minimaxApiKey: process.env.MINIMAX_API_KEY || null,
    },
  })
}

export interface DirectMetaConfig {
  appId: string
  appSecret: string
  redirectUri: string
}

export interface DirectGoogleConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface DirectTikTokConfig {
  clientKey: string
  clientSecret: string
  redirectUri: string
}

export async function getDirectMetaConfig(): Promise<DirectMetaConfig | null> {
  try {
    const config = await ensureSystemConfig()
    if (!config.metaAppId || !config.metaAppSecret || !config.metaRedirectUri) return null
    return {
      appId: config.metaAppId,
      appSecret: config.metaAppSecret,
      redirectUri: config.metaRedirectUri,
    }
  } catch (error) {
    console.error('[getDirectMetaConfig Error]', error)
    return null
  }
}

export async function getDirectGoogleConfig(): Promise<DirectGoogleConfig | null> {
  try {
    const config = await ensureSystemConfig()
    if (!config.googleClientId || !config.googleClientSecret || !config.googleRedirectUri) return null
    return {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri,
    }
  } catch (error) {
    console.error('[getDirectGoogleConfig Error]', error)
    return null
  }
}

export async function getDirectTikTokConfig(): Promise<DirectTikTokConfig | null> {
  try {
    const config = await ensureSystemConfig()
    if (!config.tiktokClientKey || !config.tiktokClientSecret || !config.tiktokRedirectUri) return null
    return {
      clientKey: config.tiktokClientKey,
      clientSecret: config.tiktokClientSecret,
      redirectUri: config.tiktokRedirectUri,
    }
  } catch (error) {
    console.error('[getDirectTikTokConfig Error]', error)
    return null
  }
}

export async function isDirectPublishingEnabled(): Promise<boolean> {
  try {
    const config = await ensureSystemConfig()
    return !!config.useDirectPublishing
  } catch {
    return false
  }
}

/**
 * @deprecated AI keys are now managed via Admin → AI 模型配置 (LLMConfig table).
 * This function only checks the GEMINI_API_KEY env var as a last resort.
 * Do NOT add calls to this function — configure Google models in LLMConfig instead.
 */
export async function getGeminiApiKey(): Promise<string | null> {
  return process.env.GEMINI_API_KEY || null
}


/**
 * @deprecated AI keys are now managed via Admin → AI 模型配置 (LLMConfig table).
 * MiniMax TTS key should be stored in a LLMConfig row with provider='minimax', taskTags=['tts'].
 * This function only checks the MINIMAX_API_KEY env var as a last resort.
 */
export async function getMiniMaxApiKey(): Promise<string | null> {
  return process.env.MINIMAX_API_KEY || null
}





/** ─── Publishing Standards ─────────────────────────────────────────────────
 * 系统统一发布频率标准。
 * Admin → System Config UI 中可覆盖，否则使用 DEFAULT_PUBLISHING_STANDARDS。
 *
 * 两种频率检查模式（可组合使用）：
 *   maxDaysBetweenPosts  — 上次发布距今不超过 N 天（高频平台：Instagram/XHS）
 *   minPerWeek           — 过去 7 天发布总数不低于 N 篇（低频平台：Google/Facebook）
 */
export interface PlatformStandard {
  maxDaysBetweenPosts?: number  // 上次发布距今不超过N天（违反则沉默告警）
  minPerWeek?: number           // 过去7天发布篇数不低于N篇（违反则频率不足告警）
}

export interface PublishingStandards {
  maxDaysSilent: number                        // 全局沉默告警阈值（兜底）
  minTotalPerWeek: number                      // 全平台汇总每周最低总篇数
  platforms: Record<string, PlatformStandard>  // per-platform 标准，key = platform slug
}

export const DEFAULT_PUBLISHING_STANDARDS: PublishingStandards = {
  maxDaysSilent: 3,           // 某平台 ≥ 3 天无发布即告警
  minTotalPerWeek: 4,
  platforms: {
    // 高频平台：检查上次发布间隔（不超过2天）
    instagram:   { maxDaysBetweenPosts: 2 },
    xiaohongshu: { maxDaysBetweenPosts: 2 },
    // 低频平台：检查每周发布总量（≥2篇/周）
    google:      { minPerWeek: 2 },
    facebook:    { minPerWeek: 2 },
    tiktok:      { minPerWeek: 1 },
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
