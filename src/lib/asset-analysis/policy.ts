export const ANALYSIS_MODEL = 'doubao-seed-2.1-turbo'
export const ANALYSIS_VERSION = 'asset-image-video-v2'
export const PROTECTED_FOLDERS = ['素材库', 'raw', '封面图', '视频原片', 'AI视频', '已使用', '待确认', '重复素材', '不建议使用', 'all']
export const INITIAL_FOLDERS = ['菜品', '门店环境', '人物', '活动与宴席', '菜单与价格', '视频原片', '待确认', '重复素材', '不建议使用', '封面图', 'AI视频']

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
  subjects: Array<{ type: string; name?: string; confidence: number }>
  captureType: string
  textDetection: { items: Array<{ text: string; type: string; confidence: number }>; hasRiskText: boolean }
  quality: { clarity: number; exposure: number; stability: number; subjectCompleteness: number; overall: number }
  searchText: string
  duplicateHint?: string
  segments: Array<{ segmentKey: string; startMs: number; endMs: number; scene?: string; action?: string; captureType?: string; subjects: Array<{ type: string; name?: string; confidence: number }>; quality?: Record<string, number>; textDetection?: unknown; stabilityScore?: number; roleSuitability: string[]; searchText?: string }>
}
export function parseImageAnalysis(value: any): ImageAnalysisResult {
  if (!value || typeof value.contentType !== 'string' || !value.contentType.trim() || value.contentType.length > 80 ||
    typeof value.caption !== 'string' || !value.caption.trim() || value.caption.length > 1000 ||
    !Array.isArray(value.tags) || value.tags.length < 3 || value.tags.length > 7 ||
    value.tags.some((tag: unknown) => typeof tag !== 'string' || !tag.trim() || tag.length > 80) || typeof value.needsReview !== 'boolean') {
    throw new Error('Invalid image analysis result')
  }
  const score = (candidate: unknown, fallback = 0.5) => typeof candidate === 'number' && candidate >= 0 && candidate <= 1 ? candidate : fallback
  const subjects = Array.isArray(value.subjects) ? value.subjects.slice(0, 20).filter((item: any) => item && typeof item.type === 'string').map((item: any) => ({ type: item.type.trim().slice(0, 80), ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim().slice(0, 120) } : {}), confidence: score(item.confidence) })) : []
  const textItems = Array.isArray(value.textDetection?.items) ? value.textDetection.items.slice(0, 30).filter((item: any) => item && typeof item.text === 'string').map((item: any) => ({ text: item.text.trim().slice(0, 300), type: typeof item.type === 'string' ? item.type.trim().slice(0, 40) : 'other', confidence: score(item.confidence) })) : []
  const quality = { clarity: score(value.quality?.clarity), exposure: score(value.quality?.exposure), stability: score(value.quality?.stability, 1), subjectCompleteness: score(value.quality?.subjectCompleteness), overall: score(value.quality?.overall) }
  const segments = Array.isArray(value.segments) ? value.segments.slice(0, 100).filter((segment: any) => segment && Number.isInteger(segment.startMs) && Number.isInteger(segment.endMs) && segment.startMs >= 0 && segment.endMs > segment.startMs).map((segment: any, index: number) => ({
    segmentKey: typeof segment.segmentKey === 'string' && segment.segmentKey.trim() ? segment.segmentKey.trim().slice(0, 100) : `segment-${index + 1}`,
    startMs: segment.startMs, endMs: segment.endMs,
    ...(typeof segment.scene === 'string' ? { scene: segment.scene.trim().slice(0, 200) } : {}),
    ...(typeof segment.action === 'string' ? { action: segment.action.trim().slice(0, 200) } : {}),
    ...(typeof segment.captureType === 'string' ? { captureType: segment.captureType.trim().slice(0, 80) } : {}),
    subjects: Array.isArray(segment.subjects) ? segment.subjects.slice(0, 12).filter((item: any) => item && typeof item.type === 'string').map((item: any) => ({ type: item.type.trim().slice(0, 80), ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name.trim().slice(0, 120) } : {}), confidence: score(item.confidence) })) : [],
    ...(segment.quality && typeof segment.quality === 'object' ? { quality: segment.quality } : {}),
    ...(segment.textDetection ? { textDetection: segment.textDetection } : {}),
    ...(typeof segment.stabilityScore === 'number' ? { stabilityScore: score(segment.stabilityScore) } : {}),
    roleSuitability: Array.isArray(segment.roleSuitability) ? segment.roleSuitability.filter((item: unknown) => typeof item === 'string').slice(0, 10) : [],
    ...(typeof segment.searchText === 'string' ? { searchText: segment.searchText.trim().slice(0, 1000) } : {}),
  })) : []
  return {
    contentType: value.contentType.trim(), caption: value.caption.trim(),
    tags: [...new Set<string>(value.tags.map((t: string) => t.trim()))], needsReview: value.needsReview,
    subjects, captureType: typeof value.captureType === 'string' ? value.captureType.trim().slice(0, 80) : 'unknown',
    textDetection: { items: textItems, hasRiskText: Boolean(value.textDetection?.hasRiskText || textItems.some(item => ['price', 'english_address', 'watermark'].includes(item.type))) },
    quality, searchText: typeof value.searchText === 'string' && value.searchText.trim() ? value.searchText.trim().slice(0, 3000) : [value.caption, ...value.tags, ...subjects.map(item => item.name || item.type)].join(' '),
    ...(typeof value.duplicateHint === 'string' && value.duplicateHint.trim() ? { duplicateHint: value.duplicateHint.trim().slice(0, 200) } : {}), segments,
  }
}

export function suggestedFolder(result: ImageAnalysisResult) {
  if (result.needsReview) return { topLevel: '待确认' }
  if (result.quality.overall < 0.35) return { topLevel: '不建议使用' }
  const types = new Set(result.subjects.map(subject => subject.type.toLowerCase()))
  const classification = [result.contentType, ...result.tags].join(' ').toLowerCase()
  if (types.has('dish') || types.has('food') || types.has('菜品') || /菜|food|dish|meal|drink|beverage/.test(classification)) {
    const dish = result.subjects.find(subject => ['dish', 'food', '菜品'].includes(subject.type.toLowerCase()) && subject.name && subject.confidence >= 0.8)?.name
    return { topLevel: '菜品', ...(dish ? { child: folderName(dish) } : {}) }
  }
  if (types.has('menu') || types.has('price') || types.has('菜单') || /菜单|价格|menu|price/.test(classification)) return { topLevel: '菜单与价格' }
  if (types.has('person') || types.has('人物') || /人物|顾客|员工|person|people|customer|staff/.test(classification)) return { topLevel: '人物' }
  if (types.has('event') || types.has('banquet') || types.has('活动') || /活动|宴席|event|banquet|party/.test(classification)) return { topLevel: '活动与宴席' }
  if (types.has('store') || types.has('environment') || types.has('门店环境') || /门店|环境|store|interior|exterior|environment/.test(classification)) return { topLevel: '门店环境' }
  return { topLevel: '待确认' }
}

export function isNightlyWindow(at: Date, timezone: string, startHour = 2, durationHours = 4) {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(at))
    return hour >= startHour && hour < startHour + durationHours
  } catch { return false }
}

// Only remove tags owned by our previous analysis. User and workflow tags survive.
export function mergeAnalysisTags(current: string[], previousGenerated: string[], generated: string[]) {
  return [...new Set([...current.filter(t => !previousGenerated.includes(t)), ...generated])]
}
