import type { PlatformType } from '../types.ts'
import type { PlatformContentProvider } from './base.ts'
import { createBasicPlatformValidator } from './base.ts'

const commonAiToneBannedPhrases = [
  'as an ai',
  'discover the secrets',
  'game-changer',
  "in today's fast-paced world",
  'revolutionary',
  'cutting-edge',
  'state-of-the-art',
]

function provider(input: Omit<PlatformContentProvider, 'validateText'>): PlatformContentProvider {
  const base = input as PlatformContentProvider
  base.validateText = createBasicPlatformValidator(base)
  return base
}

export const platformProviders: Record<PlatformType, PlatformContentProvider> = {
  xiaohongshu: provider({
    platform: 'xiaohongshu',
    displayName: 'Xiaohongshu',
    skillVersion: 'xiaohongshu@1.0.0',
    defaultLanguage: 'zh',
    maxCaptionLength: 1000,
    hookCategories: ['surprise', 'geo', 'fomo', 'pain_point', 'counter_intuitive'],
    hashtagRules: { allowHashtags: true, min: 3, max: 10 },
    mediaRules: { required: false, maxItems: 18, allowImages: true, allowVideo: true },
    aiToneBannedPhrases: [
      ...commonAiToneBannedPhrases,
      '我不允许还有人不知道',
      '作为AI',
      '截至我的知识截止日期',
      '综上所述',
      '总的来说',
    ],
  }),
  instagram: provider({
    platform: 'instagram',
    displayName: 'Instagram',
    skillVersion: 'instagram@1.0.0',
    defaultLanguage: 'en',
    maxCaptionLength: 2200,
    hookCategories: ['benefit', 'social_proof', 'geo', 'fomo'],
    hashtagRules: { allowHashtags: true, min: 5, max: 15 },
    mediaRules: { required: true, maxItems: 10, allowImages: true, allowVideo: true },
    aiToneBannedPhrases: commonAiToneBannedPhrases,
  }),
  facebook: provider({
    platform: 'facebook',
    displayName: 'Facebook',
    skillVersion: 'facebook@1.0.0',
    defaultLanguage: 'en',
    maxCaptionLength: 5000,
    hookCategories: ['community', 'benefit', 'social_proof', 'fomo'],
    hashtagRules: { allowHashtags: true, min: 0, max: 3 },
    mediaRules: { required: false, maxItems: 10, allowImages: true, allowVideo: true },
    aiToneBannedPhrases: commonAiToneBannedPhrases,
  }),
  google_business: provider({
    platform: 'google_business',
    displayName: 'Google Business Profile',
    skillVersion: 'google_business@1.0.0',
    defaultLanguage: 'en',
    maxCaptionLength: 1500,
    hookCategories: ['seo', 'benefit', 'geo'],
    hashtagRules: { allowHashtags: false, min: 0, max: 0 },
    mediaRules: { required: false, maxItems: 1, allowImages: true, allowVideo: false },
    aiToneBannedPhrases: commonAiToneBannedPhrases,
    requiredFields: ['address', 'cta'],
  }),
  tiktok: provider({
    platform: 'tiktok',
    displayName: 'TikTok',
    skillVersion: 'tiktok@1.0.0',
    defaultLanguage: 'en',
    maxCaptionLength: 300,
    hookCategories: ['fomo', 'pain_point', 'counter_intuitive', 'benefit'],
    hashtagRules: { allowHashtags: true, min: 2, max: 5 },
    mediaRules: { required: true, maxItems: 1, allowImages: true, allowVideo: true },
    aiToneBannedPhrases: commonAiToneBannedPhrases,
  }),
}

export function getPlatformProvider(platform: PlatformType): PlatformContentProvider {
  return platformProviders[platform]
}

export function listPlatformProviders(): PlatformContentProvider[] {
  return Object.values(platformProviders)
}
