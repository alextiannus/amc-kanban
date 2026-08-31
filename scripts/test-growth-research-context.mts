import assert from 'node:assert/strict'
import {
  researchReportTimezone,
  researchReviewLocationId,
  researchStoreGoogleMapsUrl,
  researchStoreGooglePlaceId,
} from '../src/lib/growthResearchContext.ts'

const locations = [
  { location_id: 'jalan-besar', google_place_id: 'place-jalan', is_primary: true },
  { location_id: 'compassvale', google_place_id: 'place-compassvale' },
]

const nestedGoogle = {
  googleBusiness: {
    placeId: 'place-jalan',
    businessUrl: 'https://www.google.com/maps/place/?q=place_id:place-jalan',
  },
}

assert.equal(researchStoreGooglePlaceId(nestedGoogle), 'place-jalan')
assert.equal(researchStoreGoogleMapsUrl(nestedGoogle), 'https://www.google.com/maps/place/?q=place_id:place-jalan')
assert.equal(researchReviewLocationId({ placeId: 'place-compassvale' }, locations), 'compassvale')
assert.equal(researchReviewLocationId({ locationId: 'jalan-besar' }, locations), 'jalan-besar')
assert.equal(researchReviewLocationId({}, locations), '')
assert.equal(researchReviewLocationId({}, [locations[0]]), 'jalan-besar')
assert.equal(researchReportTimezone('America/New_York', 'Singapore'), 'Asia/Singapore')
assert.equal(researchReportTimezone('Europe/London', 'United Kingdom'), 'Europe/London')

console.log('Growth research context tests passed.')
