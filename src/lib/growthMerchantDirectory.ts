import { timingSafeEqual } from 'node:crypto'

export function growthDirectoryAuthorized(request: Request) {
  const expected = process.env.CONTENT_SERVICE_INTERNAL_TOKEN || ''
  const supplied = request.headers.get('x-content-service-token') || ''
  return !!expected && Buffer.byteLength(expected) === Buffer.byteLength(supplied)
    && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
}

export const growthMerchantSelect = {
  id: true, name: true, industry: true, location: true, address: true, phone: true, website: true,
  status: true, updatedAt: true, growthBrandKey: true, googlePlaceId: true, googleBusinessUrl: true, googleReviewUrl: true,
  knowledge: { select: { stores: true, market: true } },
  accounts: { where: { unboundAt: null, NOT: { handle: 'unconfigured' } }, select: {
    id: true, platformId: true, handle: true, profileUrl: true, displayName: true, updatedAt: true,
  } },
} as const

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const record = (value: any) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
export function directoryPlatform(value: string) {
  const key = value.toLowerCase().replaceAll('-', '_')
  if (key.includes('instagram')) return 'instagram'
  if (key.includes('tiktok')) return 'tiktok'
  if (key.includes('xiaohongshu') || key === 'xhs') return 'xiaohongshu'
  if (key.includes('google') || ['gbp','gmb'].includes(key)) return 'google'
  if (key.includes('facebook') || key === 'fb') return 'facebook'
  return ''
}

export function publicAccountUrl(platform: string, value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const domains = platform === 'xiaohongshu' ? ['xiaohongshu.com','xhslink.com'] : [`${platform}.com`]
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password
      && domains.some(domain => host === domain || host.endsWith(`.${domain}`)) ? url.href : ''
  } catch { return '' }
}

export function growthMerchantRecord(raw: any) {
  const stores = Array.isArray(raw.knowledge?.stores) && raw.knowledge.stores.length ? raw.knowledge.stores : [{
    storeId: `${raw.id}:primary`, name: raw.name, address: raw.address, phone: raw.phone,
    googlePlaceId: raw.googlePlaceId, googleMapsUrl: raw.googleBusinessUrl || raw.googleReviewUrl, isPrimary: true,
  }]
  const locations = stores.map((value: any, index: number) => {
    const store = record(value), google = record(store.google)
    const fallback = (stores.length === 1 || store.isPrimary === true) && (!store.address || !raw.address || text(store.address) === text(raw.address))
    return { id: text(store.storeId || store.locationId || store.locationKey) || `${raw.id}:location:${index + 1}`,
      name: text(store.name) || raw.name, address: text(store.address), phone: text(store.phone),
      google_place_id: text(store.googlePlaceId || store.google_place_id || google.placeId || google.place_id || (fallback ? raw.googlePlaceId : '')),
      google_maps_url: text(store.googleMapsUrl || store.googleBusinessUrl || google.mapsUrl || google.maps_url || (fallback ? raw.googleBusinessUrl || raw.googleReviewUrl : '')),
      is_primary: Boolean(store.isPrimary ?? index === 0) }
  })
  const accounts = (raw.accounts || []).flatMap((account: any) => {
    const platform = directoryPlatform(text(account.platformId))
    if (!platform || account.unboundAt || ['unconfigured','未配置'].includes(text(account.handle).toLowerCase())) return []
    const profile_url = publicAccountUrl(platform, text(account.profileUrl))
    const handle = /^@?[\w.-]+$/.test(text(account.handle)) ? text(account.handle) : ''
    if (!profile_url && !handle) return []
    return [{ id: account.id, platform, profile_url, handle, display_name: text(account.displayName),
      scope: 'brand', updated_at: account.updatedAt }]
  })
  return { id: raw.id, name: raw.name, market: text(raw.knowledge?.market || raw.location), category: text(raw.industry),
    address: text(raw.address), phone: text(raw.phone), website: text(raw.website), status: raw.status,
    growth_brand_key: text(raw.growthBrandKey), updated_at: raw.updatedAt, locations, accounts }
}

export async function listGrowthMerchants(db: any, params: URLSearchParams) {
  if (['page','limit'].some(key => params.has(key) && !/^[1-9]\d*$/.test(params.get(key) || ''))) throw new Error('invalid_pagination')
  const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1))
  const limit = Math.max(1, Math.min(50, Number(params.get('limit')) || 20))
  if (!Number.isInteger(page) || !Number.isInteger(limit)) throw new Error('invalid_pagination')
  const q = (params.get('q') || '').trim().slice(0, 200)
  const where = { status: { not: 'ARCHIVED' }, ...(q ? { OR: [
    { name: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } },
    { address: { contains: q, mode: 'insensitive' } },
  ] } : {}) }
  const [rows, total] = await Promise.all([db.brand.findMany({ where, select: growthMerchantSelect,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }), db.brand.count({ where })])
  return { items: rows.map((row: any) => { const detail = growthMerchantRecord(row); return {
    id: detail.id, name: detail.name, market: detail.market, status: detail.status,
    location_count: detail.locations.length, platforms: [...new Set(detail.accounts.map((account: any) => account.platform))],
  } }), total, page, limit }
}
