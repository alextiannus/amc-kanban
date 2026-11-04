/** Native Kanban editor entry points. The sidebar video-production route opens Content separately. No credentials or user text in native editor URLs. */
export type VideoEditorEntryParams = Record<string, string | string[] | undefined>
const contextKeys = ['brandId', 'assetIds', 'videoDraft', 'videoCreativeId', 'videoRevision', 'videoMonth', 'videoOrigin', 'videoView'] as const
export function unifiedVideoEditorUrl(params: VideoEditorEntryParams = {}): string {
  const query = new URLSearchParams({videoEditor: '1'})
  for (const key of contextKeys) {
    const value = params[key]
    if (typeof value === 'string' && value.trim()) query.set(key, value.trim())
  }
  return `/dashboard/video?${query}`
}
export function isUnifiedVideoModule(module: string): boolean {
  return module === 'video-making' || module === 'video-production'
}
