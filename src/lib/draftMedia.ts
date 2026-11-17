/** Ordered draft media; URL order is authoritative, references enrich metadata.
 * Keep the MM/Kanban copies in sync.
 */
export type DraftMedia = {
  id: string; type: 'asset' | 'url'; url: string; mimeType: string
  filename?: string | null; sourceType?: string | null; thumbnailUrl?: string | null
}
type DraftMediaInput = {
  mediaUrls?: string[] | null
  assetRefs?: Array<{ order?: number; asset?: {
    id: string; url?: string | null; mimeType?: string | null
    filename?: string | null; sourceType?: string | null; thumbnailUrl?: string | null
  } | null }> | null
}
export function draftMediaIdentity(url: string) {
  try {
    const parsed = new URL(url, 'https://local.invalid')
    if (parsed.pathname.startsWith('/api/integrations/postfast/file/'))
      return 'key:' + parsed.pathname.split('/').slice(6).join('/')
  } catch { /* Non-URL storage keys are supported by the legacy adapter. */ }
  return !url.startsWith('http') && !url.startsWith('/') ? 'key:' + url : 'url:' + url
}
export function orderedDraftMedia(draft: DraftMediaInput): DraftMedia[] {
  const refs = [...(draft.assetRefs || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
  const byIdentity = new Map<string, DraftMedia>()
  for (const { asset } of refs) {
    if (!asset?.url) continue
    byIdentity.set(draftMediaIdentity(asset.url), {
      ...asset, url: asset.url, mimeType: asset.mimeType || '', type: 'asset',
    })
  }
  const seen = new Set<string>(), items: DraftMedia[] = []
  for (const url of [...(draft.mediaUrls || []), ...refs.map(ref => ref.asset?.url || '')]) {
    if (!url) continue
    const key = draftMediaIdentity(url)
    if (seen.has(key)) continue
    seen.add(key)
    const ref = byIdentity.get(key)
    items.push(ref ? { ...ref, url } : { id: url, type: 'url', url, mimeType: '' })
  }
  return items
}
export function orderedMediaUrls(items: readonly { url: string; sourceType?: string | null }[]) {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = draftMediaIdentity(item.url)
    if (seen.has(key)) return false
    seen.add(key); return true
  }).map(item => {
    try {
      const url = new URL(item.url, 'https://local.invalid')
      if (url.pathname.startsWith('/api/integrations/postfast/file/')) return url.pathname
    } catch { /* Keep the original source for server inspection. */ }
    return item.url
  })
}

