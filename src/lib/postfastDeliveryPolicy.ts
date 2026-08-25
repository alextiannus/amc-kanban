export const POSTFAST_ASYNC_VIDEO_THRESHOLD_BYTES = 50_000_000
export const POSTFAST_MAX_UPLOAD_BYTES = 250_000_000

type DeliveryMediaCandidate = {
  mimeType?: string | null
  metadata?: {
    kind?: 'image' | 'video'
    sizeBytes?: number
  }
}

export function shouldQueuePostfastDelivery(mediaItems: DeliveryMediaCandidate[]) {
  return mediaItems.some((item) => {
    const isVideo = item.metadata?.kind === 'video'
      || String(item.mimeType ?? '').toLowerCase().startsWith('video/')
    return isVideo && Number(item.metadata?.sizeBytes ?? 0) >= POSTFAST_ASYNC_VIDEO_THRESHOLD_BYTES
  })
}
