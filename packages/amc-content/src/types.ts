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

export type ContentType = 'feed_post' | 'story' | 'reel' | 'short_video' | 'local_update' | 'event' | 'offer'

export interface CopyBrief {
  industryVertical: IndustryVertical
  offerType?: string
  customerIntent?: string
  theme: string
  angle?: string
  targetEmotion?: string
  contentType?: ContentType
  formatHint?: string
  mustMention?: string[]
  mustAvoid?: string[]
  locationFocus?: string
  localProof?: string[]
}

export interface BrandContext {
  id: string
  name: string
  description?: string
  tone?: string
  address?: string
  location?: string
  website?: string
  phone?: string
  negativePrompts?: string[]
  requiredTerms?: string[]
  slang?: Record<string, string>
}

export interface MediaAssetContext {
  id?: string
  url: string
  mimeType?: string
  tags?: string[]
  category?: string
  caption?: string
}

export interface KnowledgeEntry {
  id: string
  level: 'platform' | 'vertical' | 'brand' | 'generated'
  platform?: PlatformType
  vertical?: IndustryVertical
  category: 'hook' | 'template' | 'example' | 'format_rule' | 'compliance_rule'
  title: string
  content: string
  qualityScore?: number
}

export interface KnowledgeQuery {
  brandId: string
  platform: PlatformType
  vertical: IndustryVertical
  theme: string
  categories?: KnowledgeEntry['category'][]
  limit?: number
}

export interface KnowledgeRepository {
  retrieve(input: KnowledgeQuery): Promise<KnowledgeEntry[]>
}

export interface ModelRequest {
  task:
    | 'brief_normalizer'
    | 'hook_generation'
    | 'body_composition'
    | 'quality_rewrite'
    | 'quality_judge'
  platform: PlatformType
  vertical: IndustryVertical
  prompt: string
  modelProfileId?: string
  maxTokens?: number
}

export interface ModelRouter {
  generateJson<T>(input: ModelRequest): Promise<{ data: T; modelId?: string }>
  generateText?(input: ModelRequest): Promise<{ text: string; modelId?: string }>
}

export interface PromptTuningQuery {
  task: ModelRequest['task']
  platform: PlatformType
  vertical: IndustryVertical
}

export interface PromptTuningRepository {
  getTuningNotes(input: PromptTuningQuery): Promise<string | null>
}

export interface GenerationLog {
  brandId: string
  platform: PlatformType
  vertical: IndustryVertical
  draftId?: string
  promptVersion: string
  modelId?: string
  input: unknown
  output: unknown
  quality?: QualityResult
  provenance?: ContentProvenance
}

export interface ContentLogger {
  logGeneration(event: GenerationLog): Promise<void>
}

export interface ContentAdapters {
  modelRouter: ModelRouter
  knowledgeRepository?: KnowledgeRepository
  promptTuningRepository?: PromptTuningRepository
  logger?: ContentLogger
}

export type HookCategory =
  | 'surprise'
  | 'geo'
  | 'fomo'
  | 'pain_point'
  | 'counter_intuitive'
  | 'benefit'
  | 'social_proof'
  | 'community'
  | 'seo'

export interface HookCandidate {
  text: string
  category: HookCategory
  score: number
  reason?: string
}

export interface ComposedContent {
  caption: string
  hashtags: string[]
}

export interface QualityIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
}

export interface QualityResult {
  passed: boolean
  score: number
  issues: QualityIssue[]
  rewriteInstruction?: string
}

export interface ContentProvenance {
  platformSkillVersion: string
  verticalSkillVersion: string
  knowledgeEntryIds: string[]
  modelId?: string
  modelProfileId?: string
  promptVersion: string
}

export interface PlatformContentInput {
  brand: BrandContext
  brief: CopyBrief
  platform: PlatformType
  media?: MediaAssetContext[]
  draftId?: string
  recentHooks?: HookCandidate[]
  adapters: ContentAdapters
}

export interface PlatformContentResult {
  platform: PlatformType
  vertical: IndustryVertical
  caption: string
  hashtags: string[]
  hook: HookCandidate
  quality: QualityResult
  provenance: ContentProvenance
}
