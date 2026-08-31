type UnknownRecord = Record<string, unknown>

export type GrowthResearchLocationIdentity = {
  location_id: string
  google_place_id: string
  is_primary?: boolean
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return ''
}

export function researchStoreGooglePlaceId(store: UnknownRecord, fallback = ''): string {
  const google = record(store.googleBusiness)
  return firstText(store.googlePlaceId, store.google_place_id, google.placeId, google.place_id, fallback)
}

export function researchStoreGoogleMapsUrl(store: UnknownRecord, fallback = ''): string {
  const google = record(store.googleBusiness)
  return firstText(
    store.googleMapsUrl,
    store.google_maps_url,
    google.businessUrl,
    google.placeUrl,
    google.mapsUrl,
    google.reviewUrl,
    google.reviewsUrl,
    fallback,
  )
}

export function researchReportTimezone(timezone: unknown, market: unknown, addresses: unknown[] = []): string {
  const normalizedTimezone = text(timezone)
  const marketAndAddresses = [market, ...addresses].map(text).join(' ').toLowerCase()
  if (/\bsingapore\b/.test(marketAndAddresses)) return 'Asia/Singapore'
  return normalizedTimezone || 'Asia/Singapore'
}

function reviewPlaceId(raw: UnknownRecord): string {
  const parent = record(raw.parentData)
  const searchInput = record(raw.searchInput)
  const place = record(raw.place)
  return firstText(
    raw.googlePlaceId,
    raw.google_place_id,
    raw.placeId,
    raw.place_id,
    parent.placeId,
    parent.place_id,
    searchInput.placeId,
    searchInput.place_id,
    place.id,
  )
}

export function researchReviewLocationId(rawValue: unknown, locations: GrowthResearchLocationIdentity[]): string {
  const raw = record(rawValue)
  const explicitLocationId = firstText(raw.locationId, raw.location_id, raw.storeId, raw.store_id)
  if (explicitLocationId && locations.some((location) => location.location_id === explicitLocationId)) {
    return explicitLocationId
  }

  const placeId = reviewPlaceId(raw)
  if (placeId) {
    return locations.find((location) => location.google_place_id === placeId)?.location_id || ''
  }

  return locations.length === 1 ? locations[0].location_id : ''
}
