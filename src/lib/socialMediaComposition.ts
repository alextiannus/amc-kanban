/** PostFast composition rules shared by draft editors and server preflight.
 * Keep the MM copy in sync; media technical limits remain in mediaValidation.
 */
export type SocialMediaKind = 'image' | 'video'
export type CompositionIssue = {
  field: 'mediaCount' | 'mediaMix' | 'instagramPublishType'
  actual: string | number
  limit: string | number
  message: string
  messageEn: string
}

export function mediaKind(item: { mimeType?: string | null; url?: string | null }): SocialMediaKind {
  if (item.mimeType?.startsWith('video/')) return 'video'
  if (item.mimeType?.startsWith('image/')) return 'image'
  return /\.(mp4|mov|avi|webm|ogg|m4v|3gp)(?:[?#]|$)/i.test(item.url || '') ? 'video' : 'image'
}

export function socialMediaCompositionIssues(
  platform: string,
  kinds: readonly SocialMediaKind[],
  instagramPublishType?: string | null,
): CompositionIssue[] {
  const normalized = platform.trim().toLowerCase()
  if (!['instagram', 'tiktok'].includes(normalized)) return []
  const count = kinds.length
  const videos = kinds.filter(kind => kind === 'video').length
  const images = count - videos
  const issues: CompositionIssue[] = []
  const add = (field: CompositionIssue['field'], actual: string | number, limit: string | number, message: string, messageEn: string) =>
    issues.push({ field, actual, limit, message, messageEn })
  if (count === 0 || count > 10) {
    add('mediaCount', count, '1-10', '请选择 1–10 个素材；轮播最多 10 项。', 'Choose 1–10 media items. A carousel supports up to 10 items.')
  }
  if (normalized === 'tiktok') {
    if (images > 0 && videos > 0) add('mediaMix', images + ' images, ' + videos + ' videos', 'images only or one video',
      'TikTok 图片轮播只支持图片，不能与视频混排。', 'TikTok photo carousels support images only. Remove the videos or publish them separately.')
    else if (videos > 1) add('mediaCount', videos, 'exactly 1 video',
      'TikTok 每条帖子只能包含一个视频，不支持多视频轮播。', 'TikTok supports one video per post, not a multi-video carousel.')
  } else if (instagramPublishType) {
    if (!['TIMELINE', 'REEL', 'STORY'].includes(instagramPublishType)) add('instagramPublishType', instagramPublishType, 'TIMELINE, REEL, STORY',
      'Instagram 发布类型无效。', 'Invalid Instagram publish type.')
    else if (instagramPublishType === 'REEL' && (count !== 1 || videos !== 1)) add('instagramPublishType', instagramPublishType, 'exactly 1 video',
      'Instagram Reel 必须只包含一个视频；多个素材请使用轮播帖。', 'Instagram Reel requires exactly one video. Use Timeline for a carousel.')
    else if (instagramPublishType === 'STORY' && count !== 1) add('instagramPublishType', instagramPublishType, 'exactly 1 item',
      'Instagram Story 必须只包含一个图片或视频。', 'Instagram Story requires exactly one image or video.')
    else if (instagramPublishType === 'TIMELINE' && count === 1 && videos === 1) add('instagramPublishType', instagramPublishType, 'REEL or STORY',
      'Instagram 单视频请使用 REEL 或 STORY。', 'Use Reel or Story for a single Instagram video.')
  }
  return issues
}

export function socialMediaNotice(platform: string, kinds: readonly SocialMediaKind[], english = false, publishType?: string | null) {
  const issue = socialMediaCompositionIssues(platform, kinds, publishType)[0]
  if (issue) return { error: true, text: english ? issue.messageEn : issue.message }
  const normalized = platform.trim().toLowerCase()
  if (!['instagram', 'tiktok'].includes(normalized)) return null
  const count = kinds.length
  const carousel = count > 1
  const label = normalized === 'tiktok'
    ? (english ? 'TikTok photo carousel' : 'TikTok 图片轮播')
    : (english ? 'Instagram carousel' : 'Instagram 轮播帖')
  return { error: false, text: carousel
    ? label + ' · ' + count + '/10'
    : normalized === 'tiktok'
      ? (english ? 'TikTok: one video, or up to 10 photos.' : 'TikTok：单视频，或最多 10 张图片轮播。')
      : (english ? 'Instagram: one video defaults to Reel; 2–10 items form a carousel.' : 'Instagram：单视频默认 Reel，2–10 项素材为轮播帖。') }
}

