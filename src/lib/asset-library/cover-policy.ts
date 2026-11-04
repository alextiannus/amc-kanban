export const COVER_MIMES = ['image/jpeg', 'image/png']
export const COVER_VIEW = { id: 'COVERS', name: '封面素材', description: '集中管理发布封面图片，可在新建草稿和排期时选择；原目录与来源类别保留。' } as const
export function coverFlag(value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw Object.assign(new Error('封面用途标记必须为布尔值'), { status: 400 })
  return value
}
export function coverOnly(value: string | null) {
  if (value !== null && value !== 'true' && value !== 'false') throw Object.assign(new Error('封面筛选参数无效'), { status: 400 })
  return value === 'true'
}
export function assertCoverMedia(mimeType: string, metadata: unknown) {
  const m = metadata as { kind?: string; mimeType?: string; sizeBytes?: number } | null
  if (!COVER_MIMES.includes(mimeType.toLowerCase()) || m?.kind !== 'image' || !COVER_MIMES.includes(m.mimeType || '') || m.mimeType !== mimeType.toLowerCase() || !Number.isFinite(m.sizeBytes) || (m.sizeBytes || 0) <= 0) throw Object.assign(new Error('封面素材仅支持实际格式为 JPEG 或 PNG 的图片'), { status: 422 })
}
