export function parseGoogleMapsEntry(value: unknown) {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('INVALID_MAP_LINK')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('INVALID_MAP_LINK') }
  const host = url.hostname.toLowerCase()
  const regular = ['google.com', 'www.google.com', 'google.com.sg', 'www.google.com.sg'].includes(host) && /^\/maps(?:\/|$)/.test(url.pathname)
  const maps = host === 'maps.google.com'
  const short = host === 'maps.app.goo.gl' && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
  const legacy = host === 'goo.gl' && /^\/maps\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !(regular || maps || short || legacy)) throw new Error('INVALID_MAP_LINK')
  const rawPlaceId = url.searchParams.get('query_place_id') || url.searchParams.get('place_id') || url.searchParams.get('placeid')
  if (rawPlaceId && !/^[a-zA-Z0-9_-]{6,512}$/.test(rawPlaceId)) throw new Error('INVALID_MAP_LINK')
  return { googleBusinessUrl: url.href, googlePlaceId: rawPlaceId || null, googleReviewUrl: rawPlaceId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(rawPlaceId)}` : null }
}
