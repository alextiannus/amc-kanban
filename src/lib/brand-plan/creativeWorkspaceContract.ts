import { CreativeRevisionError, record, validateCreativePatch } from './creativeRevisionContract.ts'

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
  digest?: string
  catalogDigest?: string
  sourceRevision?: string | null
  sourceDigest?: string | null
  basedOnRevision?: string
  mode?: 'source_adaptation' | 'ordinary_brand_content'
  status: 'proposed' | 'confirmed' | 'adjusted'
  recommendations: Array<{ skuId: string; skuName: string; roles: string[]; rationale: string; sourceShotIds: string[] }>
  selectedSkuIds: string[]
  adjustmentNote: string | null
  decidedBy: string | null
  decidedAt: string | null
}
export type CreativeScheduleLink = {
  draftId: string
  scheduledAt: string | null
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
  adaptationStatus?: 'awaiting_sku' | 'sku_confirmed' | 'adapted'
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

const legacyClientFields = ['date', 'title', 'platform', 'contentType', 'product', 'planning', 'materialRequirements', 'aiCaption', 'aiTags']
export function validateCreativeRevisionClientPatch(value: unknown, month: string): { patch: Record<string, any>; legacyProduct?: string } {
  const input = record(value)
  const keys = Object.keys(input)
  if (keys.length !== legacyClientFields.length || !legacyClientFields.every(key => Object.hasOwn(input, key))) {
    return { patch: validateCreativeWorkspacePatch(value) }
  }
  // The deployed MM editor submits every historical field. Accept that exact
  // shape while mapping its platform and ignoring its date for scheduling.
  const old = validateCreativePatch(input, month, {allowUndatedEditor:input.date === ''})
  const { date: _date, platform: _platform, platformSlug: _platformSlug, product, ...canonical } = old
  return { patch: validateCreativeWorkspacePatch({ ...canonical, ...(old.platform ? {platformTargets:[old.platform]} : {}) }), legacyProduct: product }
}

export function normalizeCreativeWorkspaceItem(value: unknown, context: { brandId?: string; currentRevisionId?: string; createdAt?: string; updatedAt?: string } = {}): CreativeWorkspaceItem {
  const input = record(value)
  const rawStatus = string(input.status)
  const legacy: NonNullable<CreativeWorkspaceItem['legacy']> = {}
  const storedLegacy = record(input.legacy)
  if (typeof storedLegacy.date === 'string' || typeof input.date === 'string') legacy.date = string(storedLegacy.date || input.date)
  if (typeof storedLegacy.platform === 'string' || typeof input.platform === 'string') legacy.platform = string(storedLegacy.platform || input.platform)
  if (typeof storedLegacy.status === 'string' || rawStatus && !statuses.includes(rawStatus as CreativeStatus)) legacy.status = string(storedLegacy.status || rawStatus)
  const status: CreativeStatus = statuses.includes(rawStatus as CreativeStatus) ? rawStatus as CreativeStatus : rawStatus === 'archived' || rawStatus === '归档' ? 'archived' : 'idea_pending'
  const schedule = record(input.schedule)
  const completeSchedule = ['draftId', 'platform', 'scheduledBy', 'scheduledAtRevisionId'].every(key => typeof schedule[key] === 'string' && schedule[key]) && (schedule.scheduledAt === null || typeof schedule.scheduledAt === 'string' && !!schedule.scheduledAt)
  return {
    id: string(input.id), brandId: string(context.brandId || input.brandId), title: string(input.title), status,
    platformTargets: Array.isArray(input.platformTargets) ? list(input.platformTargets) : input.platform || legacy.platform ? [string(input.platform || legacy.platform)] : [],
    contentType: string(input.contentType), planning: string(input.planning), materialRequirements: list(input.materialRequirements),
    aiCaption: string(input.aiCaption), aiTags: list(input.aiTags),
    source: input.source && typeof input.source === 'object' && !Array.isArray(input.source) ? input.source as CreativeSourceReference : null,
    skuDecision: input.skuDecision && typeof input.skuDecision === 'object' && !Array.isArray(input.skuDecision) ? input.skuDecision as CreativeSkuDecision : null,
    ...(['awaiting_sku','sku_confirmed','adapted'].includes(input.adaptationStatus)?{adaptationStatus:input.adaptationStatus as 'awaiting_sku'|'sku_confirmed'|'adapted'}:{}),
    currentRevisionId: string(context.currentRevisionId || input.currentRevisionId),
    derivedFromCreativeId: string(input.derivedFromCreativeId || input.copiedFrom?.creativeId) || null,
    schedule: completeSchedule ? schedule as CreativeScheduleLink : null,
    createdAt: string(context.createdAt || input.createdAt), updatedAt: string(context.updatedAt || input.updatedAt),
    ...(Object.keys(legacy).length ? { legacy } : {}),
  }
}
