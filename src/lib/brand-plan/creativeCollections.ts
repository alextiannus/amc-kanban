import { ensureScriptCollection, type CollectionSlotInput } from '@/lib/asset-library/collections'

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
export function collectionSlotsFromCreative(creative: any): CollectionSlotInput[] {
  const result: CollectionSlotInput[] = [], seen = new Set<string>()
  const add = (slotKey: string, title: string, requirement: string, tags: string[]) => {
    const normalized = text(requirement); if (!normalized || seen.has(normalized.toLowerCase())) return
    seen.add(normalized.toLowerCase()); result.push({ slotKey, title, requirement: normalized, expectedTags: [...new Set(tags.filter(Boolean))], order: result.length })
  }
  ;(Array.isArray(creative?.materialRequirements) ? creative.materialRequirements : []).forEach((item: unknown, index: number) => add(`material-${index + 1}`, `素材 ${index + 1}`, text(item), Array.isArray(creative?.aiTags) ? creative.aiTags : []))
  ;(Array.isArray(creative?.videoScript?.shots) ? creative.videoScript.shots : []).forEach((shot: any, index: number) => add(`shot-${index + 1}`, `镜头 ${index + 1}`, text(shot?.visual || shot?.scene || shot?.description), [text(shot?.captureType), ...(Array.isArray(shot?.tags) ? shot.tags : [])]))
  if (!result.length) add('material-1', '脚本素材', text(creative?.planning || creative?.title), Array.isArray(creative?.aiTags) ? creative.aiTags : [])
  return result
}
export function creativeWaitsForAssets(creative: any) { return ['已确认', 'confirmed', 'waiting_for_assets'].includes(text(creative?.status).toLowerCase()) || creative?.status === '已确认' }
export async function syncConfirmedCreativeCollection(input: { brandId: string; month: string; creativeId: string; creativeVersion: number; creative: any; createdById?: string }) {
  if (!creativeWaitsForAssets(input.creative)) return null
  return ensureScriptCollection({ brandId: input.brandId, creativeId: input.creativeId, creativeVersion: input.creativeVersion, month: input.month, name: text(input.creative?.title) || `脚本 ${input.creativeId}`, createdById: input.createdById, slots: collectionSlotsFromCreative(input.creative) })
}
