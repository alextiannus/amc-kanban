import type {VideoEditorInput} from '@/vendor/mm-video/lib/video-editor'
/**
 * types.ts
 * ──────────────────────────────────────────────────────
 * Shared TypeScript interfaces used across amc-mm components.
 */

export interface ContentDraft {
  id: string
  caption: string
  hashtags?: string[]
  mediaUrls: string[]
  assetIds?: string[]
  scheduledAt?: string | null
  publishedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  status: string
  platform: string
  platformPostId?: string | null
  postfastControls?: Record<string, unknown> | null
  postUrl?: string | null
  impressions?: number
  reach?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  engagement?: number
  engRate?: number
  rejectionNote?: string | null
  agentNote?: string | null
  creativeHooks?: string | null
  deliveryFailureCode?: string | null
  deliveryFailureAt?: string | null
  account?: {
    id: string
    platformId: string
    handle?: string | null
    displayName?: string | null
  } | null
}

export interface CalendarCreativeOption {
  replicationRequest?: {action:'copy';scriptMode?:'original';requestKey:string;creativeId?:string;sourceId?:string;poolIdeaId?:string}
  originalScript?: string
  historical?: boolean
  brainstorm?: {sourceId:string;matchScore:number;likedBy:string;likedAt:string}
  revisionId?: string
  month?: string
  nativeDaily?: {poolIdeaId:string;taskId:string}
  nativeReviewStatus?:string
  revisionToken?: string
  id: string
  date: string
  title: string
  platform: string
  platformSlug: string
  contentType: string
  productionFormats?: Array<'post' | 'video'>
  product: string
  planning: string
  materialRequirements: string[]
  suggestedFolder: string
  aiTags: string[]
  aiCaption: string
  draftId?: string | null
  postUrl?: string | null
}

export interface BasicVideoScript {
  id: string
  name: string
  nameZh?: string
  nameEn?: string
  description?: string
  descriptionZh?: string
  descriptionEn?: string
  creatorType: string
  vertical?: string
  bestFor?: string[]
  structure?: string
  structureZh?: string
  structureEn?: string
  shotDrafts?: Array<{
    title: string
    titleZh?: string
    titleEn?: string
    visualPrompt: string
    visualPromptZh?: string
    visualPromptEn?: string
    cameraMotion: string
    cameraMotionZh?: string
    cameraMotionEn?: string
    textOverlay: string
    textOverlayZh?: string
    textOverlayEn?: string
    voiceover?: string
    voiceoverZh?: string
    voiceoverEn?: string
  }>
}

export interface BasicVideoTemplate {
  id: string
  name: string
  description?: string
  status?: string
  sortOrder?: number
  eligibleCreativeCount?: number
  creativeIds?: string[]
  creatives?: Array<{
    id: string
    title?: string
    status?: string
    scriptKind?: string
  }>
  builtinScript?: BasicVideoScript
}

export interface GeneratedDraft {
  id?: string
  platform: string
  accountId?: string
  displayName?: string
  copywriterId?: string
  copywriterName?: string
  copywriter?: {
    id: string
    name: string
    handle: string
    specialty?: string
    language?: string
  }
  contentCopywriter?: {
    id?: string
    name?: string
    description?: string
    personality?: string
    style?: string
    promptStyle?: string
  }
  caption: string
  hashtags?: string[]
  originalCaption?: string
  originalHashtags?: string[]
  editedByUser?: boolean
  mediaUrls?: string[]
  assetIds?: string[]
  scheduledAt?: string | null
  selected?: boolean
  isConnected?: boolean
  generationStatus?: 'pending' | 'completed' | 'failed' | 'paused'
  generationError?: string
  generationHttpStatus?: number
  generationDiagnostics?: unknown
  contentEngine?: string
  contentService?: unknown
  fallbackUsed?: boolean
  fallbackReason?: string
  requestId?: string
  provenance?: unknown
  generationLatencyMs?: number
  generationStartedAt?: number
}

export interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  autoPilot: boolean
  logoUrl?: string | null
}

export interface DashboardAsset {
  technicalMetadata?: {videoDraft?: {editor: VideoEditorInput}}
  id: string
  brandId: string
  brandName: string
  url: string
  filename: string | null
  mimeType: string
  aiTags: string[]
  aiCategory: string | null
  aiCaption: string | null
  aiReady: boolean
  usedCount: number
  lastUsedAt: string | null
  sourceType: string
  createdAt: string
}

export type VideoProductionStatus = 'queued' | 'generating' | 'ready_for_review' | 'assembling' | 'completed' | 'failed' | 'cancelled'

export interface VideoShotTextV2 {
  contractVersion: 2
  spokenText: string
  captionMode: 'mirror_spoken' | 'off'
  overlayText: string
  language: 'zh' | 'en' | 'id' | 'ms' | 'bilingual'
  textRevision: number
  spokenTextHash: string
  overlayTextHash: string
  captionText: string
  legacyTextStatus?: 'legacy_confirmed'
}

export interface VideoShotTextCapabilities {
  schemaVersion: 'shot-text-write@1'
  optimisticConcurrency: true
  actions: Array<'save_shot_text' | 'classify_legacy_text'>
  revisionFeedback?: {
    schemaVersion:'video-revision-feedback@1'
    actions:Array<'save_scene'|'save_shot_text'|'save_feedback'>
    fields:Array<'reasons'|'note'|'instruction'|'candidateAdopted'>
    request:'revision_feedback_write_request@1'
    acknowledgment:'revision_feedback_write@1'
    revision:'revision_feedback_revision@1'
    sceneWrite:{atomic:true;fields:Array<'prompt'|'spokenText'|'captionMode'|'overlayText'>}
  }
}

export interface VideoScene {
  contractVersion?: 2 | null
  textContractVersion?: 2 | null
  spokenText?: string
  captionMode?: VideoShotTextV2['captionMode']
  overlayText?: string
  language?: VideoShotTextV2['language']
  textRevision?: number
  spokenTextHash?: string
  overlayTextHash?: string
  captionText?: string
  onScreenText?: string
  legacyTextStatus?: 'legacy_unverified' | 'legacy_confirmed'
  sourceShotIds?:string[]
  relatedSceneIds?:string[]
  id: string
  index: number
  title: string
  prompt: string
  assetIds: string[]
  mediaUrls: string[]
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled'
  clipUrl?: string | null
  notes?: string | null
  subtitle?: string | null
  voiceoverText?: string | null
  sceneKind?: 'shot' | 'generation_segment'
  editable?: boolean
  durationSec?: number
}

export interface VideoProductionJob {
  language?: 'en'|'zh'|'id'|'ms'|'bilingual'
  ownedByCurrentActor?: boolean
  shotTextCapabilities?: VideoShotTextCapabilities
  scriptVersion?: string
  creativeRevisionId?:string|null
  revisions?: import('@/vendor/mm-video/lib/video-revisions').VideoRevision[]
  revisionsHasMore?: boolean
  editor?: VideoEditorInput
  brandVoiceLabel?: string | null
  id: string
  brandId: string
  title: string
  platform: string
  creativeId?: string | null
  idea: string
  status: VideoProductionStatus
  scenes: VideoScene[]
  finalVideoUrl?: string | null
  thumbnailUrl?: string | null
  narration?: string | null
  musicBrief?: string | null
  selectedMusicPrompt?: string | null
  musicUrl?: string | null
  createdAt: string
  updatedAt: string
  generationStage?: string
  progress: number
  basicVideoProjectId?: string | null
  creationMode?: 'text' | 'script'
  generationMode?: 'per_shot' | 'timeline'
  error?: string | null
}
