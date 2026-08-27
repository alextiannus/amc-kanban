type CalendarInspirationSource = {
  inspirationCreativeId?: string
  sampleVideoUrl?: string
  sampleThumbnailUrl?: string
}

export function resolveInspirationCreativeId(item: CalendarInspirationSource): string | undefined {
  const mediaAssetId = [item.sampleVideoUrl, item.sampleThumbnailUrl]
    .map(inspirationAssetIdFromMediaUrl)
    .find(Boolean)
  if (mediaAssetId) return `cre_${mediaAssetId}`

  const explicitCreativeId = item.inspirationCreativeId?.trim()
  return explicitCreativeId && /^cre_[A-Za-z0-9_-]+$/.test(explicitCreativeId)
    ? explicitCreativeId
    : undefined
}

function inspirationAssetIdFromMediaUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const segments = decodeURIComponent(new URL(value, 'https://amc.invalid').pathname)
      .split('/')
      .filter(Boolean)
    const rootIndex = segments.indexOf('content-library')
    const assetId = rootIndex >= 0 ? segments[rootIndex + 3] : undefined
    return assetId && /^ins_[A-Za-z0-9_-]+$/.test(assetId) ? assetId : undefined
  } catch {
    return undefined
  }
}
