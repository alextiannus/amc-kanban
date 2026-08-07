export type GrowthGoogleLinks = {
  place?: string | null
  reviews?: string | null
  write_review?: string | null
  directions?: string | null
  photos?: string | null
}

export type GrowthGoogleProfile = {
  businessStatus?: string | null
  nationalPhoneNumber?: string | null
  internationalPhoneNumber?: string | null
  websiteUri?: string | null
  regularOpeningHours?: { weekdayDescriptions?: string[] | null } | null
}

export type GrowthMerchantLocation = {
  location_key?: string | null
  name?: string | null
  address?: string | null
  phone?: string | null
  status?: string | null
  last_observed_at?: string | null
  google?: {
    place_id?: string | null
    confirmation_status?: string | null
    observed_at?: string | null
    expires_at?: string | null
    freshness?: string | null
    links?: GrowthGoogleLinks | null
    profile?: GrowthGoogleProfile | null
  } | null
}

export type KanbanGrowthStore = {
  locationKey?: string
  name?: string
  address?: string
  phone?: string
  businessHours?: string
  status?: string
  lastObservedAt?: string
  isPrimary?: boolean
  googleBusiness?: {
    placeId: string
    businessUrl?: string
    reviewUrl?: string
    reviewsUrl?: string
    directionsUrl?: string
    photosUrl?: string
    source: 'amc-growth:google-places'
    observedAt: string
    expiresAt: string
  }
}

function time(value?: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export function isFreshConfirmedGoogle(location: GrowthMerchantLocation, now = new Date()) {
  const google = location.google
  if (!google?.place_id || google.confirmation_status !== 'confirmed') return false
  if (!google.observed_at || !google.expires_at || time(google.expires_at) <= now.getTime()) return false
  if (['expired', 'needs_full_refresh'].includes(google.freshness || '')) return false
  return Boolean(google.links?.place || google.links?.reviews || google.links?.write_review || google.links?.directions || google.links?.photos)
}

function isActiveLocation(location: GrowthMerchantLocation) {
  const status = String(location.status || '').toLowerCase()
  return status === 'active' || status === 'confirmed' || location.google?.profile?.businessStatus === 'OPERATIONAL'
}

export function selectPrimaryGrowthLocation(locations: GrowthMerchantLocation[]) {
  if (!locations.length) return null
  const active = locations.filter(isActiveLocation)
  const pool = active.length ? active : locations
  return [...pool].sort((left, right) => time(right.google?.observed_at || right.last_observed_at) - time(left.google?.observed_at || left.last_observed_at))[0]
}

export function normalizeGrowthStores(locations: GrowthMerchantLocation[], now = new Date()): KanbanGrowthStore[] {
  const primary = selectPrimaryGrowthLocation(locations)
  return locations.map((location) => {
    const google = location.google
    const profile = google?.profile || {}
    const hours = profile.regularOpeningHours?.weekdayDescriptions?.filter(Boolean).join('; ')
    const store: KanbanGrowthStore = {
      ...(location.location_key ? { locationKey: location.location_key } : {}),
      ...(location.name ? { name: location.name } : {}),
      ...(location.address ? { address: location.address } : {}),
      ...(location.phone || profile.nationalPhoneNumber || profile.internationalPhoneNumber
        ? { phone: location.phone || profile.nationalPhoneNumber || profile.internationalPhoneNumber || undefined }
        : {}),
      ...(hours ? { businessHours: hours } : {}),
      ...(location.status ? { status: location.status } : {}),
      ...(location.last_observed_at ? { lastObservedAt: location.last_observed_at } : {}),
      isPrimary: location === primary,
    }
    if (isFreshConfirmedGoogle(location, now) && google) {
      store.googleBusiness = {
        placeId: google.place_id!,
        ...(google.links?.place ? { businessUrl: google.links.place } : {}),
        ...(google.links?.write_review ? { reviewUrl: google.links.write_review } : {}),
        ...(google.links?.reviews ? { reviewsUrl: google.links.reviews } : {}),
        ...(google.links?.directions ? { directionsUrl: google.links.directions } : {}),
        ...(google.links?.photos ? { photosUrl: google.links.photos } : {}),
        source: 'amc-growth:google-places',
        observedAt: google.observed_at!,
        expiresAt: google.expires_at!,
      }
    }
    return store
  })
}

function storeIdentity(store: Record<string, any>) {
  return store.locationKey || store.googleBusiness?.placeId || `${String(store.name || '').toLowerCase()}|${String(store.address || '').toLowerCase()}`
}

export function preserveExistingGoogleValues(growthStores: KanbanGrowthStore[], existingStores: unknown, now = new Date()) {
  if (!Array.isArray(existingStores)) return growthStores
  const existing = existingStores.filter((item) => item && typeof item === 'object') as Array<Record<string, any>>
  return growthStores.map((store) => {
    if (store.googleBusiness) return store
    const identity = storeIdentity(store as Record<string, any>)
    const match = existing.find((item) => storeIdentity(item) === identity)
      || existing.find((item) => String(item.name || '').toLowerCase() === String(store.name || '').toLowerCase()
        && String(item.address || '').toLowerCase() === String(store.address || '').toLowerCase())
    const existingGoogle = match?.googleBusiness
    if (!existingGoogle) return store
    if (existingGoogle.source === 'amc-growth:google-places'
      && (!existingGoogle.expiresAt || time(existingGoogle.expiresAt) <= now.getTime())) return store
    return { ...store, googleBusiness: existingGoogle }
  })
}

export function primaryGoogleMirror(stores: KanbanGrowthStore[]) {
  return stores.find((store) => store.isPrimary)?.googleBusiness || null
}

export function expiredGrowthLegacyClearPatch(meta: unknown, now = new Date()) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const value = meta as Record<string, unknown>
  if (value.source !== 'amc-growth:google-places') return null
  const expiresAt = typeof value.expiresAt === 'string' ? time(value.expiresAt) : 0
  if (expiresAt > now.getTime()) return null
  return {
    googlePlaceId: null,
    googleBusinessUrl: null,
    googleReviewUrl: null,
    googleLinksMeta: {
      source: value.source,
      observedAt: value.observedAt || null,
      expiresAt: value.expiresAt || null,
      freshness: 'expired',
    },
  }
}
