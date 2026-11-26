export const SHORT_VIDEO_CAROUSEL = 'SHORT_VIDEO_CAROUSEL'
export const SHORT_VIDEO_LIMIT = 5
export type DraftMediaMode = typeof SHORT_VIDEO_CAROUSEL | null
export type MediaPickerFilter = 'all' | 'image' | 'video'

export function shortVideoIssue(platform: string, kinds: readonly string[], forPublish = false) {
  if (platform.toLowerCase().trim() !== 'instagram') return {
    field: 'platform', actual: platform, limit: 'instagram',
    zh: '多段视频仅支持 Instagram，请调整发布账号。', en: 'Multi-clip video is available for Instagram accounts only.',
  }
  if (kinds.includes('image')) return {
    field: 'mediaMix', actual: 'image', limit: 'video',
    zh: '多段视频仅支持视频，请先移除图片。', en: 'Multi-clip video accepts videos only. Remove any photos first.',
  }
  if (kinds.length > SHORT_VIDEO_LIMIT || (forPublish && kinds.length < 2)) return {
    field: 'mediaCount', actual: kinds.length, limit: forPublish ? '2–5' : SHORT_VIDEO_LIMIT,
    zh: kinds.length > SHORT_VIDEO_LIMIT ? '多段视频最多添加 5 段。' : '请添加至少 2 段视频后再提交。',
    en: kinds.length > SHORT_VIDEO_LIMIT ? 'You can add up to 5 clips.' : 'Add at least 2 clips before submitting.',
  }
}

export function shortVideoDurationOutsideRange(seconds: unknown): seconds is number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && (seconds < 3 || seconds > 5)
}
