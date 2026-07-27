type MediaItem = {
  storageKey?: string
  url?: string
  mimeType?: string
}

type AssetRefLike = {
  asset?: {
    url?: string | null
    mimeType?: string | null
    sourceType?: string | null
  } | null
}

function normalizeMimeType(value?: string | null) {
  return String(value ?? '').split(';')[0].trim().toLowerCase()
}

export function extractPostfastStorageKey(url?: string | null) {
  if (!url) return ''
  if (url.startsWith('/api/integrations/postfast/file/')) {
    return url.split('/').slice(6).join('/')
  }
  if (!url.startsWith('http') && !url.startsWith('/')) return url
  return ''
}

function mediaIdentity(item: MediaItem) {
  return item.storageKey || item.url || ''
}

function upsertMediaItem(items: MediaItem[], seen: Map<string, number>, item: MediaItem) {
  const key = mediaIdentity(item)
  if (!key) return

  const normalizedMimeType = normalizeMimeType(item.mimeType)
  const existingIndex = seen.get(key)
  if (existingIndex === undefined) {
    seen.set(key, items.length)
    items.push({
      ...item,
      ...(normalizedMimeType ? { mimeType: normalizedMimeType } : {}),
    })
    return
  }

  const existing = items[existingIndex]
  if (!normalizeMimeType(existing.mimeType) && normalizedMimeType) {
    items[existingIndex] = { ...existing, mimeType: normalizedMimeType }
  }
}

export function buildPostfastMediaItems(input: {
  mediaUrls?: string[] | null
  assetRefs?: AssetRefLike[] | null
}) {
  const items: MediaItem[] = []
  const seen = new Map<string, number>()

  for (const url of input.mediaUrls || []) {
    const storageKey = extractPostfastStorageKey(url)
    upsertMediaItem(items, seen, storageKey ? { storageKey } : { url })
  }

  for (const ref of input.assetRefs || []) {
    const asset = ref.asset
    if (!asset?.url) continue
    const storageKey = asset.sourceType === 'postfast'
      ? (extractPostfastStorageKey(asset.url) || asset.url)
      : ''
    upsertMediaItem(
      items,
      seen,
      {
        ...(storageKey ? { storageKey } : { url: asset.url }),
        mimeType: asset.mimeType ?? undefined,
      },
    )
  }

  return items
}
