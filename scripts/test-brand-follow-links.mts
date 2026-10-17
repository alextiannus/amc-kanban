import assert from 'node:assert/strict'
import { brandGoogleMapsEntries, brandFollowLinks, publicHttpUrl, followAppUrl } from '../src/lib/brandFollowLinks.ts'
for (const input of ['javascript:alert(1)', 'data:text/html,test', 'instagram://user?username=test', 'https://user:secret@example.com', 'not a url', '']) assert.equal(publicHttpUrl(input), null)
const links = brandFollowLinks({ accounts: [
  {platformId: 'INSTAGRAM', handle: '@missing'},
  {platformId: 'INSTAGRAM', handle: '@one', profileUrl: 'https://instagram.com/one'},
  {platformId: 'INSTAGRAM', handle: '@two', profileUrl: 'https://instagram.com/two'},
  {platformId: 'INSTAGRAM', handle: '@duplicate', profileUrl: 'https://instagram.com/one'},
  {platformId: 'TIKTOK', profileUrl: 'javascript:alert(1)'},
], googleReviewUrl: 'https://search.google.com/local/writereview?placeid=test' })
assert.equal(links.length, 3)
assert.equal(links[0].platform, 'instagram')
assert.equal(links[1].handle, '@two')
assert.equal(links[2].review, true)
assert.deepEqual(brandFollowLinks(), [])
console.log('Follow links: missing URLs, unsafe schemes, duplicate URLs, multiple accounts and independent review passed.')

assert.equal(followAppUrl('instagram', 'https://www.instagram.com/real.account/?igsh=test'), null, 'Instagram must use its HTTPS universal link instead of an app-version-specific route')
assert.equal(followAppUrl('instagram', 'https://instagram.com.evil.example/real'), null)
assert.equal(followAppUrl('instagram', 'https://www.instagram.com/p/post-id'), null)
assert.equal(followAppUrl('instagram', 'https://www.instagram.com/accounts'), null)
assert.equal(followAppUrl('instagram', 'javascript:alert(1)'), null)
assert.equal(followAppUrl('xiaohongshu', 'https://www.xiaohongshu.com/user/profile/123'), 'xhsdiscover://webview?url=https%3A%2F%2Fwww.xiaohongshu.com%2Fuser%2Fprofile%2F123')
assert.equal(followAppUrl('tiktok', 'https://www.tiktok.com/@real'), null, 'keep universal links rather than guessing an app-only ID')
console.log('App routes: exact hosts, real profile paths, reserved paths and universal-link fallback passed.')

const mapsBrand = {googleBusinessUrl:'https://maps.google.com/?cid=123', googleReviewUrl:'https://search.google.com/local/writereview?placeid=123'}
const mapsLinks = brandFollowLinks(mapsBrand)
assert.equal(mapsLinks.find(link=>link.platform==='google_maps')?.url,mapsBrand.googleBusinessUrl)
assert.equal(mapsLinks.filter(link=>link.review).length,1)
assert.equal(brandFollowLinks({googleBusinessUrl:'javascript:alert(1)'}).length,0)
assert.equal(brandFollowLinks({googleReviewUrl:mapsBrand.googleReviewUrl}).some(link=>link.platform==='google_maps'),false)
assert.equal(brandFollowLinks({googleBusinessUrl:mapsBrand.googleBusinessUrl,accounts:[{platformId:'GOOGLE_MAPS',profileUrl:mapsBrand.googleBusinessUrl}]}).length,1)
console.log('Configured Google Maps entry, independent reviews, absent/unsafe links and deduplication passed.')


for (const platformId of ['GOOGLE_BUSINESS_PROFILE', 'google_business', 'GOOGLE_MAPS', 'GBP', 'gmb']) {
  const [link] = brandFollowLinks({accounts:[{platformId,profileUrl:mapsBrand.googleBusinessUrl}]})
  assert.equal(link.platform,'google_maps')
  assert.equal(link.url,mapsBrand.googleBusinessUrl)
}
const placeIdLinks = brandFollowLinks({name:'TEST Brand',googlePlaceId:'ChIJ_TEST_configured'})
const placeMap = new URL(placeIdLinks.find(link=>link.platform==='google_maps')!.url)
assert.equal(placeMap.origin,'https://www.google.com')
assert.equal(placeMap.searchParams.get('api'),'1')
assert.equal(placeMap.searchParams.get('query_place_id'),'ChIJ_TEST_configured')
assert.equal(placeMap.searchParams.get('query'),'TEST Brand')
assert.equal(placeIdLinks.find(link=>link.review)?.url,'https://search.google.com/local/writereview?placeid=ChIJ_TEST_configured')
assert.equal(brandFollowLinks({googlePlaceId:'  unconfigured  '}).length,0)
assert.equal(brandFollowLinks({accounts:[{platformId:'google_business',profileUrl:null,handle:'unconfigured'}]}).length,0)
const configuredMaps = brandFollowLinks({...mapsBrand,googlePlaceId:'ChIJ_TEST_configured'})
assert.equal(configuredMaps.find(link=>link.platform==='google_maps')?.url,mapsBrand.googleBusinessUrl)
assert.equal(configuredMaps.find(link=>link.review)?.url,mapsBrand.googleReviewUrl)
assert.equal(brandFollowLinks({googlePlaceId:'ChIJ_TEST_configured',accounts:[{platformId:'gbp',profileUrl:mapsBrand.googleBusinessUrl}]}).filter(link=>link.platform==='google_maps').length,1)
console.log('Google aliases, configured Place ID fallback, explicit-link priority, no guessed entries and account deduplication passed.')

// Provider-independent maps, without manufacturing a listing or review target.
const searchBrand = {name: 'TEST Café & Grill', address: '10 Example Road', location: 'Singapore'}
const fallback = brandFollowLinks(searchBrand)
assert.equal(fallback.length, 1)
assert.equal(fallback[0].mapSearch, true)
assert.equal(new URL(fallback[0].url).searchParams.get('query'), 'TEST Café & Grill 10 Example Road Singapore')
assert.equal(new URL(fallback[0].url).searchParams.has('query_place_id'), false)
assert.equal(fallback.some(link => link.review), false)
assert.equal(brandGoogleMapsEntries({...searchBrand,googlePlaceId:'ChIJ_EXACT'})[0].kind,'place')
assert.equal(brandGoogleMapsEntries({...searchBrand,accounts:[{platformId:'GBP',profileUrl:'https://maps.google.com/?cid=321'}]})[0].url,'https://maps.google.com/?cid=321')
const branches = brandGoogleMapsEntries({...searchBrand,googlePlaceId:'ChIJ_BRAND_PRIMARY'}, [
 {storeId:'a',name:'TEST East',address:'10 East Road',googleBusiness:{placeId:'ChIJ_EAST'}},
 {storeId:'b',name:'TEST West',address:'20 West Road'},
 {storeId:'c',name:'TEST Closed',address:'30 Closed Road',status:'closed'},
])
assert.equal(branches.length,2)
assert.equal(new URL(branches[0].url).searchParams.get('query_place_id'),'ChIJ_EAST')
assert.equal(new URL(branches[1].url).searchParams.has('query_place_id'),false)
assert.equal(new URL(branches[1].url).searchParams.get('query'),'TEST Café & Grill TEST West 20 West Road')
assert.equal(brandFollowLinks({...searchBrand,googleMapEntries:branches,accounts:[{platformId:'GBP',profileUrl:'https://maps.google.com/?cid=321'}]}).filter(link=>link.platform==='google_maps').length,2)
assert.equal(brandGoogleMapsEntries({}).length,0)
console.log('PASS provider-independent Maps search, exact-link priority, no invented review/Place ID, per-branch identity and closed-store exclusion.')

assert.equal(brandFollowLinks({...searchBrand,googleBusinessUrl:'https://maps.google.com/?cid=correct',accounts:[{platformId:'GBP',profileUrl:'https://maps.google.com/?cid=old'}]}).find(link=>link.platform==='google_maps')?.url,'https://maps.google.com/?cid=correct')

const matchedStores = brandGoogleMapsEntries({...searchBrand,googleBusinessUrl:'https://maps.google.com/?cid=primary',location:'East District'}, [
 {name:'East',address:'10 Example Road'}, {name:'West',address:'20 West Road'}
])
assert.equal(matchedStores[0].url,'https://maps.google.com/?cid=primary')
assert.equal(matchedStores[0].kind,'place')
assert.equal(matchedStores[1].kind,'search')
assert.equal(new URL(matchedStores[1].url).searchParams.get('query'),'TEST Café & Grill West 20 West Road')
console.log('PASS primary destination matches its stored address, and other branches do not inherit the primary district.')
