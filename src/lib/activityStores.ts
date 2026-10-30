import { brandGoogleMapsEntries, type FollowBrand } from './brandFollowLinks'
type Row = Record<string, unknown>
const obj = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {}
const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
export function activityStores(value: unknown, brand: { name?: string; address?: string | null }) {
  const rows = Array.isArray(value) ? value.map(obj).filter(s => !['closed','archived','inactive'].includes(str(s.status).toLowerCase())) : []
  if (!Array.isArray(value) || !value.length) return [{ id: 'main', name: brand.name || '', address: brand.address || '' }]
  return rows.map(s => ({ id: str(s.storeId), name: str(s.name) || brand.name || '', address: str(s.address) }))
}
export function scopeActivityBrand<T extends FollowBrand>(brand: T, value: unknown, requested = '') {
  const stores = activityStores(value, brand)
  const selected = requested ? stores.find(s => s.id && s.id === requested) : stores.length === 1 && stores[0].id ? stores[0] : undefined
  if (requested && !selected) throw new Error('Activity store not found')
  const rows = Array.isArray(value) ? value.map(obj) : []
  const row = selected ? rows.find(s => str(s.storeId) === selected.id) : undefined
  const google = obj(row?.googleBusiness)
  const primary = !row || row.isPrimary === true || Boolean(selected?.address && brand.address && selected.address.toLowerCase() === brand.address.toLowerCase())
  const scoped = {
    ...brand, activityStores: stores, activityStoreId: selected?.id, activityStoreName: selected?.name,
    storeSelectionRequired: !selected, address: selected?.address || null, location: row ? null : brand.location,
    googlePlaceId: selected ? str(row?.googlePlaceId || google.placeId || (primary ? brand.googlePlaceId : null)) || null : null,
    googleBusinessUrl: selected ? str(row?.googleBusinessUrl || google.businessUrl || (primary ? brand.googleBusinessUrl : null)) || null : null,
    googleReviewUrl: selected ? str(row?.googleReviewUrl || google.reviewUrl || (primary ? brand.googleReviewUrl : null)) || null : null,
    googleReviewAppUrl: null,
    accounts: (brand.accounts || []).filter(a => !['google','googlebusiness','googlebusinessprofile','googlemybusiness','googlemaps','gbp','gmb'].includes(a.platformId.toLowerCase().replace(/[\s_-]/g,''))),
  }
  return { ...scoped, googleMapEntries: selected ? brandGoogleMapsEntries({ ...scoped, name: selected.name === brand.name ? brand.name : [brand.name, selected.name].filter(Boolean).join(' ') }).slice(0,1) : [] }
}
