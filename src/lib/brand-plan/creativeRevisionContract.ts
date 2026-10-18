import { createHash } from 'node:crypto'

export const CREATIVE_REVISION_KIND = 'CREATIVE_ITEM'
export class CreativeRevisionError extends Error {
  constructor(public code: string, public status = 400) { super(code) }
}
export function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export function creativeDigest(value: unknown) { return createHash('sha256').update(stableJson(value)).digest('hex') }
export function revisionPeriod(month: string, itemId: string) { return creativeDigest([month,itemId]) }
export function validateCreativeId(itemId: string) {
  if (typeof itemId !== 'string' || !itemId || itemId.length > 200) throw new CreativeRevisionError('invalid_creative_address')
}
export function validateCreativeAddress(month: string, itemId: string) {
  validateCreativeId(itemId)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new CreativeRevisionError('invalid_creative_address')
}
export function creativeWorkspace(knowledge: any) {
  return { ...record(knowledge?.brandPlan), ...record(knowledge?.marketingSolution) }
}
export function monthItems(workspace: any, month: string): Record<string, any>[] {
  const items = workspace?.publishingCalendar?.months?.[month]
  return Array.isArray(items) ? items : []
}
export function findCreative(workspace: any, month: string, id: string) {
  const found = monthItems(workspace, month).filter(item => item.id === id)
  if (found.length !== 1) throw new CreativeRevisionError('creative_not_found_or_ambiguous', 404)
  return found[0]
}
// Only pre-workspace AI matching may still submit this historical calendar shape.
// Merchant revision writes use validateCreativeWorkspacePatch instead.
export const CREATIVE_EDIT_FIELDS = ['date','title','platform','contentType','product','planning','materialRequirements','aiCaption','aiTags'] as const
export function validateCreativePatch(value: unknown, month: string, options: {allowUndatedEditor?:boolean} = {}) {
  const input = record(value)
  if (!Object.keys(input).length || Object.keys(input).some(key => !CREATIVE_EDIT_FIELDS.includes(key as any))) throw new CreativeRevisionError('invalid_creative_patch')
  const patch: Record<string, any> = {}
  for (const [key,value] of Object.entries(input)) {
    if (key === 'materialRequirements' || key === 'aiTags') {
      if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || v.length > 2000)) throw new CreativeRevisionError('invalid_creative_patch')
      patch[key] = value.map(v => v.trim()).filter(Boolean)
    } else {
      if (typeof value !== 'string' || value.length > (['planning','aiCaption'].includes(key) ? 20000 : 500)) throw new CreativeRevisionError('invalid_creative_patch')
      patch[key] = value.trim()
      if (['date','title','platform','contentType','product'].includes(key) && !patch[key] && !(options.allowUndatedEditor && !input.date && ['date','platform','product'].includes(key))) throw new CreativeRevisionError('invalid_creative_patch')
    }
  }
  if (patch.date) {
    const date = new Date(`${patch.date}T12:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.date) || patch.date.slice(0,7) !== month || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== patch.date) throw new CreativeRevisionError('creative_date_must_remain_in_month')
  }
  if (patch.platform) {
    const platforms: Record<string,string> = { instagram:'instagram',ig:'instagram',tiktok:'tiktok','tik tok':'tiktok',xiaohongshu:'xiaohongshu','小红书':'xiaohongshu',facebook:'facebook',google:'google_business',google_business:'google_business','google business':'google_business','google maps':'google_business',gbp:'google_business' }
    const slug = platforms[patch.platform.toLowerCase()]
    if (!slug) throw new CreativeRevisionError('invalid_creative_platform')
    patch.platformSlug = slug
  }
  return patch
}
// Historical plans carry excerpts, not the immutable full Content creative.
export function originalSource(item: Record<string, any>, capturedAt: string) {
  const canonical = record(item.source)
  if (typeof canonical.inspirationCreativeId === 'string' && canonical.inspirationCreativeId.trim()) {
    return {system:'amc-content',creativeId:canonical.inspirationCreativeId,inspirationCreativeId:canonical.inspirationCreativeId,
      version:typeof canonical.sourceRevision==='string'?canonical.sourceRevision:null,
      evidence:canonical.evidenceStatus || 'source_unavailable',evidenceStatus:canonical.evidenceStatus || 'source_unavailable',
      capturedAt:canonical.capturedAt || capturedAt,snapshot:canonical,
      digest:typeof canonical.libraryDigest==='string'&&canonical.libraryDigest?canonical.libraryDigest:creativeDigest(canonical)}
  }
  const snapshot = Object.fromEntries(['inspirationCreativeId','inspirationSourceTitle','inspirationSourceSummary','selectedCreativeCandidateId','sampleOriginalUrl','sampleVideoUrl','sampleSourcePlatform','creativeMechanism','videoScript','nativeSourceSnapshot','nativeCandidate'].filter(key => item[key] !== undefined).map(key => [key,item[key]]))
  return { system: item.inspirationCreativeId ? 'amc-content' : 'amc-kanban', creativeId: item.inspirationCreativeId || null, version: null, evidence: item.inspirationCreativeId ? 'plan_snapshot' : 'unresolved', capturedAt, snapshot, digest: creativeDigest(snapshot) }
}
export function revisionSource(item: Record<string, any>, stored: unknown, capturedAt: string): Record<string, any> {
  const canonicalId = record(item.source).inspirationCreativeId
  if (typeof canonicalId === 'string' && canonicalId.trim()) return originalSource(item,capturedAt)
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? record(stored) : originalSource(item,capturedAt)
}
