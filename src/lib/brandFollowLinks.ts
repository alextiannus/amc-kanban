import { activityLinkKey, type ActivityPage } from './activityPage'
export type FollowBrand = {
  activityPage?: ActivityPage
  name?: string
  address?: string | null
  location?: string | null
  googleMapEntries?: GoogleMapEntry[]
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

export type GoogleMapEntry = { url: string; handle: string; kind: 'place' | 'search' }
const isGooglePlatform = (platform: string) => ['google', 'googlebusiness', 'googlebusinessprofile', 'googlemybusiness', 'googlemaps', 'gbp', 'gmb'].includes(platform.toLowerCase().replace(/[\s_-]/g, ''))
const cleanMapText = (value: unknown) => typeof value === 'string' && !/^(unconfigured|undefined|null)$/i.test(value.trim()) ? value.trim() : ''
const mapObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** A search is a usable destination, never evidence of a verified listing or Place ID. */
export function brandGoogleMapsEntries(brand: Pick<FollowBrand, 'name' | 'address' | 'location' | 'googleBusinessUrl' | 'googlePlaceId' | 'accounts'>, stores?: unknown): GoogleMapEntry[] {
  const destination = (name: string, address: string, placeId: unknown, rawUrl: unknown, handle = ''): GoogleMapEntry | null => {
    const direct = publicHttpUrl(typeof rawUrl === 'string' ? rawUrl : null)
    if (direct) return { url: direct, handle, kind: 'place' }
    const id = cleanMapText(placeId)
    const validId = id.length <= 512 ? id : ''
    const query = [name, address, cleanMapText(brand.location)].filter(Boolean).join(' ')
    if (!query && !validId) return null
    const url = new URL('https://www.google.com/maps/search/')
    url.searchParams.set('api', '1')
    url.searchParams.set('query', query || validId)
    if (validId) url.searchParams.set('query_place_id', validId)
    return { url: url.href, handle, kind: validId ? 'place' : 'search' }
  }
  const rows = Array.isArray(stores) ? stores.map(mapObject).filter(store => !['closed', 'archived', 'inactive'].includes(String(store.status || '').toLowerCase())) : []
  const exact = destination(cleanMapText(brand.name), cleanMapText(brand.address), brand.googlePlaceId, brand.googleBusinessUrl)
  if (rows.length <= 1 && exact?.kind === 'place') return [exact]
  const accounts = (brand.accounts || []).filter(account => isGooglePlatform(account.platformId) && publicHttpUrl(account.profileUrl))
  if (rows.length <= 1 && accounts.length) return accounts.map(account => ({ url: publicHttpUrl(account.profileUrl)!, handle: account.handle || '', kind: 'place' }))
  // Each branch keeps its own address and identity; no arbitrary first-location selection.
  if (rows.length) return rows.flatMap(store => {
    const google = mapObject(store.googleBusiness)
    const entry = destination(cleanMapText(store.name) || cleanMapText(brand.name), cleanMapText(store.address), store.googlePlaceId || google.placeId || (rows.length === 1 ? brand.googlePlaceId : null), store.googleBusinessUrl || google.businessUrl || (rows.length === 1 ? brand.googleBusinessUrl : null), rows.length > 1 ? [cleanMapText(store.name), cleanMapText(store.address)].filter(Boolean).join(' · ') : '')
    return entry ? [entry] : []
  })
  return exact ? [exact] : []
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
  const currentMaps = brand ? brandGoogleMapsEntries(brand) : []
  const mapsEntries = brand?.googleMapEntries && !(brand.googleMapEntries.length <= 1 && currentMaps[0]?.kind === 'place') ? brand.googleMapEntries : currentMaps
  if (mapsEntries.length) {
    for (let i = links.length - 1; i >= 0; i--) if (links[i].platform === 'google_maps') { seen.delete(links[i].url); links.splice(i, 1) }
  }
  if (!links.some(link => link.platform === 'google_maps')) {
    for (const entry of mapsEntries) {
      const url = publicHttpUrl(entry.url)
      if (url && !seen.has(url)) { links.push({ platform: 'google_maps', handle: entry.handle, url, review: false }); seen.add(url) }
    }
  }
  const review = publicHttpUrl(brand?.googleReviewUrl) || (configuredPlaceId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(configuredPlaceId)}` : null)
  if (review) links.push({ platform: 'google', handle: '', url: review, review: true })
  return links.map(link => {
    const key = activityLinkKey(link.platform, link.review ? 'review' : link.handle)
    return { ...link, mapSearch: link.platform === 'google_maps' && mapsEntries.some(entry => entry.url === link.url && entry.kind === 'search'), key, originalUrl: link.url, url: publicHttpUrl(brand?.activityPage?.links?.[key]) || link.url }
  })
}

// Derive app routes only from the configured, validated profile URL.
// Other platforms keep their universal HTTPS links; no guessed handles or IDs.
export function followAppUrl(platform: string, profileUrl: string): string | null {
  const safe = publicHttpUrl(profileUrl)
  if (!safe) return null
  const url = new URL(safe)
  const host = url.hostname.toLowerCase()
  // Instagram universal HTTPS links preserve the account route across installed app versions.
  if (platform === 'xiaohongshu' && ['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'].includes(host)) {
    return `xhsdiscover://webview?url=${encodeURIComponent(safe)}`
  }
  return null
}
