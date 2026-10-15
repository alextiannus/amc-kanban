import { CreativeRevisionError, record } from './creativeRevisionContract.ts'

export type CreativeStatus = 'idea_pending' | 'needs_materials' | 'needs_revision' | 'ready' | 'archived'
export type CreativeSourceReference = {
  inspirationCreativeId: string
  creativeCandidateId: string | null
  sourceRevision: string | null
  contentMatchRequestId: string | null
  capturedAt: string
  evidenceStatus: 'full_source' | 'partial_source' | 'source_unavailable'
  libraryDigest: string
  title: string
  platform: string | null
  originalPostUrl: string | null
  originalVideoUrl: string | null
  internalDetailPath: string
  scriptContent: unknown
  timeline: Array<Record<string, unknown>>
}
export type CreativeSkuDecision = {
  status: 'proposed' | 'confirmed' | 'adjusted'
  recommendations: Array<{ skuId: string; skuName: string; roles: string[]; rationale: string; sourceShotIds: string[] }>
  selectedSkuIds: string[]
  adjustmentNote: string | null
  decidedBy: string | null
  decidedAt: string | null
}
export type CreativeScheduleLink = {
  draftId: string
  scheduledAt: string
  platform: string
  scheduledBy: string
  scheduledAtRevisionId: string
}
export type CreativeWorkspaceItem = {
  id: string
  brandId: string
  title: string
  status: CreativeStatus
  platformTargets: string[]
  contentType: string
  planning: string
  materialRequirements: string[]
  aiCaption: string
  aiTags: string[]
  source: CreativeSourceReference | null
  skuDecision: CreativeSkuDecision | null
  currentRevisionId: string
  derivedFromCreativeId: string | null
  schedule: CreativeScheduleLink | null
  createdAt: string
  updatedAt: string
  legacy?: { date?: string; platform?: string; status?: string }
}

const statuses: CreativeStatus[] = ['idea_pending', 'needs_materials', 'needs_revision', 'ready', 'archived']
const editable = new Set(['title', 'status', 'platformTargets', 'contentType', 'planning', 'materialRequirements', 'aiCaption', 'aiTags'])
const stringFields = new Set(['title', 'contentType', 'planning', 'aiCaption'])
const listFields = new Set(['platformTargets', 'materialRequirements', 'aiTags'])
const string = (value: unknown) => typeof value === 'string' ? value : ''
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

export function validateCreativeWorkspacePatch(value: unknown): Partial<Pick<CreativeWorkspaceItem, 'title' | 'status' | 'platformTargets' | 'contentType' | 'planning' | 'materialRequirements' | 'aiCaption' | 'aiTags'>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CreativeRevisionError('invalid_creative_patch')
  const input = record(value)
  if (!Object.keys(input).length || Object.keys(input).some(key => !editable.has(key))) throw new CreativeRevisionError('invalid_creative_patch')
  const patch: Record<string, any> = {}
  for (const [key, entry] of Object.entries(input)) {
    if (key === 'status') {
      if (!statuses.includes(entry as CreativeStatus)) throw new CreativeRevisionError('invalid_creative_patch')
      patch.status = entry
    } else if (stringFields.has(key)) {
      const limit = key === 'planning' || key === 'aiCaption' ? 20000 : 500
      if (typeof entry !== 'string' || entry.length > limit || (key === 'title' || key === 'contentType') && !entry.trim()) throw new CreativeRevisionError('invalid_creative_patch')
      patch[key] = entry.trim()
    } else if (listFields.has(key)) {
      if (!Array.isArray(entry) || entry.length > 100 || entry.some(item => typeof item !== 'string' || item.length > 2000 || (key === 'platformTargets' && !item.trim()))) throw new CreativeRevisionError('invalid_creative_patch')
      patch[key] = entry.map(item => item.trim()).filter(Boolean)
    }
  }
  return patch
}

export function normalizeCreativeWorkspaceItem(value: unknown, context: { brandId?: string; currentRevisionId?: string; createdAt?: string; updatedAt?: string } = {}): CreativeWorkspaceItem {
  const input = record(value)
  const rawStatus = string(input.status)
  const legacy: NonNullable<CreativeWorkspaceItem['legacy']> = {}
  if (typeof input.date === 'string') legacy.date = input.date
  if (typeof input.platform === 'string') legacy.platform = input.platform
  if (rawStatus && !statuses.includes(rawStatus as CreativeStatus)) legacy.status = rawStatus
  const status: CreativeStatus = statuses.includes(rawStatus as CreativeStatus) ? rawStatus as CreativeStatus : rawStatus === 'archived' || rawStatus === '归档' ? 'archived' : 'idea_pending'
  const schedule = record(input.schedule)
  const completeSchedule = ['draftId', 'scheduledAt', 'platform', 'scheduledBy', 'scheduledAtRevisionId'].every(key => typeof schedule[key] === 'string' && schedule[key])
  return {
    id: string(input.id), brandId: string(context.brandId || input.brandId), title: string(input.title), status,
    platformTargets: Array.isArray(input.platformTargets) ? list(input.platformTargets) : input.platform ? [string(input.platform)] : [],
    contentType: string(input.contentType), planning: string(input.planning), materialRequirements: list(input.materialRequirements),
    aiCaption: string(input.aiCaption), aiTags: list(input.aiTags),
    source: input.source && typeof input.source === 'object' && !Array.isArray(input.source) ? input.source as CreativeSourceReference : null,
    skuDecision: input.skuDecision && typeof input.skuDecision === 'object' && !Array.isArray(input.skuDecision) ? input.skuDecision as CreativeSkuDecision : null,
    currentRevisionId: string(context.currentRevisionId || input.currentRevisionId),
    derivedFromCreativeId: string(input.derivedFromCreativeId || input.copiedFrom?.creativeId) || null,
    schedule: completeSchedule ? schedule as CreativeScheduleLink : null,
    createdAt: string(context.createdAt || input.createdAt), updatedAt: string(context.updatedAt || input.updatedAt),
    ...(Object.keys(legacy).length ? { legacy } : {}),
  }
}
