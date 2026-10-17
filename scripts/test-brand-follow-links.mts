import assert from 'node:assert/strict'
import { brandFollowLinks, publicHttpUrl, followAppUrl } from '../src/lib/brandFollowLinks.ts'
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
