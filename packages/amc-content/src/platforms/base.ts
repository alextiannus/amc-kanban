import type {
  HookCategory,
  PlatformType,
  QualityIssue,
} from '../types.ts'

export interface HashtagRules {
  min?: number
  max?: number
  allowHashtags: boolean
}

export interface MediaRules {
  required?: boolean
  maxItems?: number
  allowVideo?: boolean
  allowImages?: boolean
}

export interface PlatformContentProvider {
  platform: PlatformType
  displayName: string
  skillVersion: string
  defaultLanguage: 'zh' | 'en'
  maxCaptionLength: number
  hookCategories: HookCategory[]
  hashtagRules: HashtagRules
  mediaRules: MediaRules
  aiToneBannedPhrases: string[]
  requiredFields?: Array<'address' | 'phone' | 'website' | 'cta'>
  validateText(input: { caption: string; hashtags: string[] }): QualityIssue[]
}

export function createBasicPlatformValidator(provider: PlatformContentProvider) {
  return ({ caption, hashtags }: { caption: string; hashtags: string[] }): QualityIssue[] => {
    const issues: QualityIssue[] = []
    if (caption.length > provider.maxCaptionLength) {
      issues.push({
        code: 'caption_too_long',
        severity: 'error',
        message: `Caption exceeds ${provider.maxCaptionLength} characters.`,
      })
    }
    if (!provider.hashtagRules.allowHashtags && hashtags.length > 0) {
      issues.push({
        code: 'hashtags_not_allowed',
        severity: 'error',
        message: `${provider.displayName} should not use hashtags.`,
      })
    }
    if (
      provider.hashtagRules.allowHashtags
      && provider.hashtagRules.min !== undefined
      && hashtags.length < provider.hashtagRules.min
    ) {
      issues.push({
        code: 'too_few_hashtags',
        severity: 'warning',
        message: `${provider.displayName} should use at least ${provider.hashtagRules.min} hashtags.`,
      })
    }
    if (provider.hashtagRules.max !== undefined && hashtags.length > provider.hashtagRules.max) {
      issues.push({
        code: 'too_many_hashtags',
        severity: 'error',
        message: `${provider.displayName} allows at most ${provider.hashtagRules.max} hashtags.`,
      })
    }
    for (const phrase of provider.aiToneBannedPhrases) {
      if (caption.toLowerCase().includes(phrase.toLowerCase())) {
        issues.push({
          code: 'ai_tone_phrase',
          severity: 'error',
          message: `Caption contains AI-tone phrase: ${phrase}`,
        })
      }
    }
    return issues
  }
}
