import { draftMediaIdentity } from './draftMedia'
import { SHORT_VIDEO_CAROUSEL } from './shortVideoCarousel'
import { mediaKind } from './socialMediaComposition'

type PreviewMedia = { url: string; mimeType?: string | null }

export function instagramDraftMedia(
  items: readonly PreviewMedia[],
  { cover, mediaMode, publishType }: {
    cover?: { url?: string | null; mimeType?: string | null } | null
    mediaMode?: string | null
    publishType?: string | null
  } = {},
): { items: readonly PreviewMedia[]; poster?: string } {
  const coverUrl = cover?.url
  if (!coverUrl || mediaMode === SHORT_VIDEO_CAROUSEL) return { items }

  if (items.some(item => mediaKind(item) === 'video')) {
    return { items, poster: items.length === 1 && (!publishType || publishType === 'REEL') ? coverUrl : undefined }
  }

  const coverKey = draftMediaIdentity(coverUrl)
  return {
    items: [
      { url: coverUrl, mimeType: cover?.mimeType || 'image/jpeg' },
      ...items.filter(item => draftMediaIdentity(item.url) !== coverKey),
    ],
  }
}
