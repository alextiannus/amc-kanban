export type FollowBrand = {
  name?: string
  followRewardDescription?: string | null
  googlePlaceId?: string | null
  googleReviewUrl?: string | null
  googleBusinessUrl?: string | null
  accounts?: { platformId: string; profileUrl?: string | null; handle?: string | null }[]
}

export function publicHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch { return null }
}

export function brandFollowLinks(brand?: FollowBrand) {
  const seen = new Set<string>()
  const links: { platform: string; handle: string; url: string; review: boolean }[] = []
  for (const account of brand?.accounts ?? []) {
    const url = publicHttpUrl(account.profileUrl)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const rawPlatform = account.platformId.toLowerCase()
    const platform = ['google', 'googlebusiness', 'googlebusinessprofile', 'googlemybusiness', 'googlemaps', 'gbp', 'gmb'].includes(rawPlatform.replace(/[\s_-]/g, '')) ? 'google_maps' : rawPlatform
    links.push({ platform, handle: account.handle || '', url, review: false })
  }
  const placeId = brand?.googlePlaceId?.trim()
  const configuredPlaceId = placeId && placeId.length <= 512 && !/^(unconfigured|undefined|null)$/i.test(placeId) ? placeId : null
  let placeMapsUrl: string | null = null
  if (configuredPlaceId && !links.some(link => link.platform === 'google_maps')) {
    const url = new URL('https://www.google.com/maps/search/')
    url.searchParams.set('api', '1')
    url.searchParams.set('query', brand?.name?.trim() || configuredPlaceId)
    url.searchParams.set('query_place_id', configuredPlaceId)
    placeMapsUrl = url.href
  }
  const maps = publicHttpUrl(brand?.googleBusinessUrl) || placeMapsUrl
  if (maps) {
    const existing = links.find(link => link.url === maps)
    if (existing) existing.platform = 'google_maps'
    else links.push({ platform: 'google_maps', handle: '', url: maps, review: false })
  }
  const review = publicHttpUrl(brand?.googleReviewUrl) || (configuredPlaceId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(configuredPlaceId)}` : null)
  if (review) links.push({ platform: 'google', handle: '', url: review, review: true })
  return links
}

// Derive app routes only from the configured, validated profile URL.
// Other platforms keep their universal HTTPS links; no guessed handles or IDs.
export function followAppUrl(platform: string, profileUrl: string): string | null {
  const safe = publicHttpUrl(profileUrl)
  if (!safe) return null
  const url = new URL(safe)
  const host = url.hostname.toLowerCase()
  if (platform === 'instagram' && ['instagram.com', 'www.instagram.com'].includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean)
    const username = parts[0]
    if (parts.length === 1 && /^[a-zA-Z0-9_.]+$/.test(username) &&
        !['explore', 'reels', 'reel', 'p', 'stories', 'accounts', 'direct'].includes(username.toLowerCase())) {
      return `instagram://user?username=${encodeURIComponent(username)}`
    }
  }
  if (platform === 'xiaohongshu' && ['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'].includes(host)) {
    return `xhsdiscover://webview?url=${encodeURIComponent(safe)}`
  }
  return null
}
