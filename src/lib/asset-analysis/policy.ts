export const ANALYSIS_MODEL = 'doubao-seed-2.1-turbo'
export const ANALYSIS_VERSION = 'asset-image-v1'
export const PROTECTED_FOLDERS = ['素材库', 'raw', '封面图', '视频原片', 'AI视频', '已使用', 'all']
export const INITIAL_FOLDERS = ['产品', '环境', '活动', '封面图', '视频原片', 'AI视频']

export function folderName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Folder name is required')
  const name = value.trim().normalize('NFC')
  if (!name || name.length > 80 || /[/\\\u0000-\u001f]/.test(name)) throw new Error('Invalid folder name (1–80 characters, no slashes)')
  if (PROTECTED_FOLDERS.includes(name)) throw new Error('System folder name is reserved')
  return name
}

export interface ImageAnalysisResult {
  contentType: string
  caption: string
  tags: string[]
  needsReview: boolean
}
export function parseImageAnalysis(value: any): ImageAnalysisResult {
  if (!value || typeof value.contentType !== 'string' || !value.contentType.trim() || value.contentType.length > 80 ||
    typeof value.caption !== 'string' || !value.caption.trim() || value.caption.length > 1000 ||
    !Array.isArray(value.tags) || value.tags.length < 3 || value.tags.length > 7 ||
    value.tags.some((tag: unknown) => typeof tag !== 'string' || !tag.trim() || tag.length > 80) || typeof value.needsReview !== 'boolean') {
    throw new Error('Invalid image analysis result')
  }
  return { contentType: value.contentType.trim(), caption: value.caption.trim(), tags: [...new Set<string>(value.tags.map((t: string) => t.trim()))], needsReview: value.needsReview }
}

// Only remove tags owned by our previous analysis. User and workflow tags survive.
export function mergeAnalysisTags(current: string[], previousGenerated: string[], generated: string[]) {
  return [...new Set([...current.filter(t => !previousGenerated.includes(t)), ...generated])]
}
