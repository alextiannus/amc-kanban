import assert from 'node:assert/strict'
import {
  researchMenuPrice,
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

assert.equal(researchMenuPrice('S$3.60'),3.6)
assert.equal(researchMenuPrice('SGD 15.80'),15.8)
assert.equal(researchMenuPrice('69.80'),69.8)
assert.equal(researchMenuPrice('S$1,200.00'),1200)
for(const value of [null,undefined,'','待确认','S$6.80/S$9.80','3.6-3.8','USD 5.00','about 3.60',-1])assert.equal(researchMenuPrice(value),null)
assert.equal(researchMenuPrice('USD 5.00','USD'),5)
console.log('PASS: exact catalog currencies survive Growth input; unknown, currency conflicts and variable prices are never invented')
