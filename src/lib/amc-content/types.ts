export type PlatformType =
  | 'xiaohongshu'
  | 'instagram'
  | 'facebook'
  | 'google_business'
  | 'tiktok'

export type IndustryVertical =
  | 'food_beverage'
  | 'beauty_wellness'
  | 'fitness_pilates'
  | 'home_renovation'
  | 'pet_services'
  | 'education_training'
  | 'healthcare_clinic'
  | 'retail_specialty'
  | 'events_entertainment'
  | 'professional_services'
  | 'general_local_service'

export type MediaAssetContext = {
  id?: string
  url: string
  mimeType?: string
  tags?: string[]
  category?: string
  caption?: string
}

export type ResolvedContentModelProfile = {
  id: string
  providerId: string
  provider: {
    id: string
    provider: string
    displayName: string
    apiKeyEnv: string
    baseUrlEnv?: string
    baseUrl?: string | null
  }
  modelName: string
  temperature?: number
  jsonMode?: boolean
  maxTokensByTask: Record<string, number>
  fallbackProfileIds: string[]
}

export type ContentGenerationRequest = {
  brandId: string
  platform: string
  theme?: string
  idea?: string
  industryVertical?: IndustryVertical
  angle?: string
  customerIntent?: string
  offerType?: string
  targetEmotion?: string
  formatHint?: string
  locationFocus?: string
  localProof?: string[]
  mustMention?: string[]
  mustAvoid?: string[]
  mediaUrls?: string[]
  assetIds?: string[]
  copywriterId?: string
  copywriterName?: string
  draftId?: string | null
  taskId?: string | null
  fallbackToLegacy?: boolean
  actorId?: string
  actorType?: string
  actorRole?: string
}

export type ContentGenerationResult = {
  caption: string
  hashtags: string[]
  contentEngine: 'amc-content' | 'legacy-copywriter' | 'rule-based-fallback'
  fallbackUsed: boolean
  fallbackReason?: string
  quality?: unknown
  provenance?: unknown
}
