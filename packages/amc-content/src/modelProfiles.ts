import type { ModelRequest, PlatformType } from './types.ts'

export type ContentModelProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'custom_shim'
  | 'minimax'

export type ContentModelTask = ModelRequest['task']

export interface ContentModelProviderConfig {
  id: string
  provider: ContentModelProviderType
  displayName: string
  apiKeyEnv: string
  baseUrl?: string
  baseUrlEnv?: string
}

export interface ContentModelProfile {
  id: string
  displayName: string
  providerId: string
  modelName: string
  temperature: number
  jsonMode: boolean
  maxTokensByTask: Partial<Record<ContentModelTask, number>>
  fallbackProfileIds: string[]
  rationale: string
}

export interface ResolvedContentModelProfile extends ContentModelProfile {
  provider: ContentModelProviderConfig
}

export const contentModelProviders: Record<string, ContentModelProviderConfig> = {
  openai_primary: {
    id: 'openai_primary',
    provider: 'openai',
    displayName: 'OpenAI Primary',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  anthropic_primary: {
    id: 'anthropic_primary',
    provider: 'anthropic',
    displayName: 'Anthropic Primary',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  google_primary: {
    id: 'google_primary',
    provider: 'google',
    displayName: 'Google Gemini Primary',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
  deepseek_primary: {
    id: 'deepseek_primary',
    provider: 'deepseek',
    displayName: 'DeepSeek Primary',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
}

export const contentModelProfiles: Record<string, ContentModelProfile> = {
  local_social_balanced_v1: {
    id: 'local_social_balanced_v1',
    displayName: 'Local Social Balanced v1',
    providerId: 'openai_primary',
    modelName: 'gpt-4.1-mini',
    temperature: 0.72,
    jsonMode: true,
    maxTokensByTask: {
      hook_generation: 900,
      body_composition: 1400,
      quality_rewrite: 1200,
    },
    fallbackProfileIds: ['local_social_gemini_fallback_v1'],
    rationale: 'Default profile for reliable local lifestyle captions with moderate creativity.',
  },
  local_social_creative_v1: {
    id: 'local_social_creative_v1',
    displayName: 'Local Social Creative v1',
    providerId: 'openai_primary',
    modelName: 'gpt-4.1',
    temperature: 0.88,
    jsonMode: true,
    maxTokensByTask: {
      hook_generation: 1000,
      body_composition: 1600,
      quality_rewrite: 1400,
    },
    fallbackProfileIds: ['local_social_balanced_v1', 'local_social_gemini_fallback_v1'],
    rationale: 'Higher creativity profile for Xiaohongshu and richer lifestyle posts.',
  },
  local_seo_precise_v1: {
    id: 'local_seo_precise_v1',
    displayName: 'Local SEO Precise v1',
    providerId: 'openai_primary',
    modelName: 'gpt-4.1-mini',
    temperature: 0.32,
    jsonMode: true,
    maxTokensByTask: {
      hook_generation: 700,
      body_composition: 900,
      quality_rewrite: 900,
    },
    fallbackProfileIds: ['local_social_gemini_fallback_v1'],
    rationale: 'Low-variance profile for Google Business content that needs factual clarity and CTA discipline.',
  },
  short_video_native_v1: {
    id: 'short_video_native_v1',
    displayName: 'Short Video Native v1',
    providerId: 'openai_primary',
    modelName: 'gpt-4.1-mini',
    temperature: 0.82,
    jsonMode: true,
    maxTokensByTask: {
      hook_generation: 800,
      body_composition: 900,
      quality_rewrite: 800,
    },
    fallbackProfileIds: ['local_social_balanced_v1', 'local_social_gemini_fallback_v1'],
    rationale: 'Compact, spoken, high-hook-energy profile for TikTok captions and short video prompts.',
  },
  local_social_gemini_fallback_v1: {
    id: 'local_social_gemini_fallback_v1',
    displayName: 'Local Social Gemini Fallback v1',
    providerId: 'google_primary',
    modelName: 'gemini-2.0-flash',
    temperature: 0.65,
    jsonMode: true,
    maxTokensByTask: {
      hook_generation: 900,
      body_composition: 1400,
      quality_rewrite: 1200,
    },
    fallbackProfileIds: [],
    rationale: 'Cost-aware fallback profile that keeps content generation available when the primary provider fails.',
  },
}

export const platformModelProfiles: Record<PlatformType, Partial<Record<ContentModelTask, string>>> = {
  instagram: {
    hook_generation: 'local_social_balanced_v1',
    body_composition: 'local_social_balanced_v1',
    quality_rewrite: 'local_social_balanced_v1',
  },
  facebook: {
    hook_generation: 'local_social_balanced_v1',
    body_composition: 'local_social_balanced_v1',
    quality_rewrite: 'local_social_balanced_v1',
  },
  google_business: {
    hook_generation: 'local_seo_precise_v1',
    body_composition: 'local_seo_precise_v1',
    quality_rewrite: 'local_seo_precise_v1',
  },
  xiaohongshu: {
    hook_generation: 'local_social_creative_v1',
    body_composition: 'local_social_creative_v1',
    quality_rewrite: 'local_social_creative_v1',
  },
  tiktok: {
    hook_generation: 'short_video_native_v1',
    body_composition: 'short_video_native_v1',
    quality_rewrite: 'short_video_native_v1',
  },
}

export function resolveContentModelProfile(
  platform: PlatformType,
  task: ContentModelTask,
  explicitProfileId?: string,
): ResolvedContentModelProfile {
  const profileId = explicitProfileId
    || platformModelProfiles[platform]?.[task]
    || 'local_social_balanced_v1'
  const profile = contentModelProfiles[profileId] ?? contentModelProfiles.local_social_balanced_v1
  const provider = contentModelProviders[profile.providerId]
  if (!provider) {
    throw new Error(`Unknown content model provider: ${profile.providerId}`)
  }
  return { ...profile, provider }
}

export function resolveContentModelProfileById(profileId: string): ResolvedContentModelProfile {
  const profile = contentModelProfiles[profileId]
  if (!profile) throw new Error(`Unknown content model profile: ${profileId}`)
  const provider = contentModelProviders[profile.providerId]
  if (!provider) {
    throw new Error(`Unknown content model provider: ${profile.providerId}`)
  }
  return { ...profile, provider }
}

export function listContentModelProfiles(): ResolvedContentModelProfile[] {
  return Object.values(contentModelProfiles).map((profile) => {
    const provider = contentModelProviders[profile.providerId]
    if (!provider) throw new Error(`Unknown content model provider: ${profile.providerId}`)
    return { ...profile, provider }
  })
}
