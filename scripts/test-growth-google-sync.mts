import assert from 'node:assert/strict'
import {
  adoptedGrowthLegacyGooglePatch,
  adoptedGrowthStoreGooglePlace,
  expiredGrowthLegacyClearPatch,
  googleWriteReviewUrl,
  isFreshConfirmedGoogle,
  normalizeGrowthStores,
  preserveExistingGoogleValues,
  primaryGoogleMirror,
  selectPrimaryGrowthLocation,
  type GrowthMerchantLocation,
} from '../src/lib/growthGooglePlaces.ts'

const now = new Date('2026-08-07T00:00:00.000Z')
const locations: GrowthMerchantLocation[] = [
  {
    location_key: 'orchard',
    name: 'AMC Orchard',
    status: 'active',
    last_observed_at: '2026-08-05T00:00:00.000Z',
    google: {
      place_id: 'place-orchard',
      confirmation_status: 'confirmed',
      observed_at: '2026-08-05T00:00:00.000Z',
      expires_at: '2026-09-02T00:00:00.000Z',
      freshness: 'fresh',
      links: {
        place: 'https://maps.google.com/place-orchard',
        reviews: 'https://maps.google.com/place-orchard/reviews',
        write_review: 'https://maps.google.com/place-orchard/review/new',
        provider_write_review: 'https://www.google.com/maps/place/orchard/review/new',
        directions: 'https://maps.google.com/place-orchard/directions',
        photos: 'https://maps.google.com/place-orchard/photos',
      },
      profile: { businessStatus: 'OPERATIONAL' },
    },
  },
  {
    location_key: 'bugis',
    name: 'AMC Bugis',
    status: 'active',
    last_observed_at: '2026-08-01T00:00:00.000Z',
    google: {
      place_id: 'place-bugis',
      confirmation_status: 'confirmed',
      observed_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-06T00:00:00.000Z',
      freshness: 'expired',
      links: { place: 'https://maps.google.com/place-bugis' },
    },
  },
  {
    location_key: 'closed',
    name: 'AMC Closed',
    status: 'inactive',
    last_observed_at: '2026-08-06T00:00:00.000Z',
  },
]

assert.equal(selectPrimaryGrowthLocation(locations)?.location_key, 'orchard', 'latest active location must be primary')
assert.equal(googleWriteReviewUrl('ChIJ test/id'), 'https://search.google.com/local/writereview?placeid=ChIJ%20test%2Fid')
assert.equal(googleWriteReviewUrl(''), null)
assert.equal(isFreshConfirmedGoogle(locations[0], now), true)
assert.equal(isFreshConfirmedGoogle(locations[1], now), false, 'expired Google data must not be treated as current')

const stores = normalizeGrowthStores(locations, now)
assert.equal(stores.length, 3)
assert.equal(stores[0].isPrimary, true)
assert.deepEqual(stores[0].googleBusiness, {
  placeId: 'place-orchard',
  businessUrl: 'https://maps.google.com/place-orchard',
  reviewUrl: 'https://search.google.com/local/writereview?placeid=place-orchard',
  appReviewUrl: 'https://www.google.com/maps/place/orchard/review/new',
  reviewsUrl: 'https://maps.google.com/place-orchard/reviews',
  directionsUrl: 'https://maps.google.com/place-orchard/directions',
  photosUrl: 'https://maps.google.com/place-orchard/photos',
  source: 'amc-growth:google-places',
  observedAt: '2026-08-05T00:00:00.000Z',
  expiresAt: '2026-09-02T00:00:00.000Z',
})
assert.equal(stores[1].googleBusiness, undefined, 'expired Growth links must not be copied as current')
assert.equal(primaryGoogleMirror(stores)?.placeId, 'place-orchard')

const preserved = preserveExistingGoogleValues(stores, [{
  locationKey: 'bugis',
  name: 'AMC Bugis',
  googleBusiness: { placeId: 'manual-place', reviewUrl: 'https://manual.example/review', source: 'manual' },
}])
assert.equal(preserved[1].googleBusiness?.placeId, 'manual-place', 'invalid Growth data must not erase an existing manual value')
const expiredGrowth = preserveExistingGoogleValues(stores, [{
  locationKey: 'bugis',
  googleBusiness: { placeId: 'expired-growth', source: 'amc-growth:google-places', expiresAt: '2026-08-06T00:00:00.000Z' },
}], now)
assert.equal(expiredGrowth[1].googleBusiness, undefined, 'expired Growth cache must not be preserved as current')
assert.deepEqual(expiredGrowthLegacyClearPatch({
  source: 'amc-growth:google-places',
  observedAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-08-06T00:00:00.000Z',
}, now), {
  googlePlaceId: null,
  googleBusinessUrl: null,
  googleReviewUrl: null,
  googleLinksMeta: {
    source: 'amc-growth:google-places',
    observedAt: '2026-07-01T00:00:00.000Z',
    expiresAt: '2026-08-06T00:00:00.000Z',
    freshness: 'expired',
  },
})
assert.equal(expiredGrowthLegacyClearPatch({ source: 'manual', expiresAt: '2026-08-06T00:00:00.000Z' }, now), null)

const clearedForeignPlace = adoptedGrowthStoreGooglePlace({
  storeId: 'main',
  googlePlaceId: 'foreign-place',
  googleBusiness: { placeId: 'foreign-place', reviewUrl: 'https://example.com/review' },
  googleReviewUrl: 'https://example.com/review',
}, null)
assert.equal(clearedForeignPlace.googlePlaceId, '')
assert.equal('googleBusiness' in clearedForeignPlace, false, 'adopting an empty Growth value must remove stale store Google metadata')
assert.equal('googleReviewUrl' in clearedForeignPlace, false)
assert.deepEqual(adoptedGrowthLegacyGooglePatch(null), {
  googlePlaceId: null,
  googleBusinessUrl: null,
  googleReviewUrl: null,
  googleLinksMeta: null,
})

const partial: GrowthMerchantLocation = {
  status: 'active',
  google: {
    place_id: 'partial',
    confirmation_status: 'confirmed',
    observed_at: '2026-08-05T00:00:00.000Z',
    expires_at: '2026-09-02T00:00:00.000Z',
    freshness: 'fresh',
    links: {},
  },
}
assert.equal(isFreshConfirmedGoogle(partial, now), false, 'missing links must not create fabricated Google values')
partial.google!.links = { directions: 'https://maps.google.com/directions/partial' }
assert.equal(isFreshConfirmedGoogle(partial, now), true, 'a valid partial response may sync only the links Google returned')

console.log('growth Google Places store sync tests passed')
