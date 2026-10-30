import assert from 'node:assert/strict'
import { scopeActivityBrand, activityStores } from '../src/lib/activityStores'
import { brandFollowLinks } from '../src/lib/brandFollowLinks'
import { normalizeActivityPage, activityPageDraftSnapshot } from '../src/lib/activityPage'
import { getPermanentGameUrl } from '../src/lib/gameQr'
import { shareActivityPage } from '../src/lib/activityShare'
const stores = [{storeId:'a', name:'North', address:'1 North Road', isPrimary:true}, {storeId:'b',name:'South',address:'2 South Road'}, {storeId:'c',name:'Closed',status:'closed'}]
const brand = { name:'Cafe', address:'1 North Road', googlePlaceId:'north-id', googleBusinessUrl:'https://maps.google.com/?cid=north', googleReviewUrl:'https://search.google.com/local/writereview?placeid=north-id', accounts:[{platformId:'GOOGLE_MAPS',profileUrl:'https://maps.google.com/?cid=north'}], activityPage:normalizeActivityPage({links:{'google_maps:':'https://maps.google.com/?cid=old'}}) }
assert.equal(scopeActivityBrand(brand, stores).storeSelectionRequired,true)
assert.equal(brandFollowLinks(scopeActivityBrand(brand,stores)).filter(l=>l.platform==='google_maps').length,0)
const north=scopeActivityBrand(brand,stores,'a'),south=scopeActivityBrand(brand,stores,'b')
assert.equal(north.googleMapEntries.length,1)
assert.equal(south.googleMapEntries.length,1)
assert.equal(brandFollowLinks(north).find(l=>l.platform==='google_maps')?.url,brand.googleBusinessUrl)
const southLink=brandFollowLinks(south).find(l=>l.platform==='google_maps')!
assert.ok(southLink.url.includes('2+South+Road'))
assert.ok(!southLink.url.includes('north'))
assert.equal(south.googlePlaceId,null)
assert.equal(south.googleReviewUrl,null)
assert.ok(!brandFollowLinks(south).some(l=>l.review))
assert.notEqual(southLink.key,brandFollowLinks(north).find(l=>l.platform==='google_maps')?.key)
for(const id of ['unknown','c']) assert.throws(()=>scopeActivityBrand(brand,stores,id),/not found/)
assert.equal(scopeActivityBrand(brand,[stores[0]]).activityStoreId,'a')
assert.equal(activityStores([{name:'Missing ID'}],brand)[0].id,'')
assert.equal(activityStores(undefined,brand)[0].id,'main')
assert.notEqual(getPermanentGameUrl('brand','a'),getPermanentGameUrl('brand','b'))
assert.equal(new URL(getPermanentGameUrl('brand','a&b')).searchParams.get('store'),'a&b')
assert.equal(scopeActivityBrand(brand,stores.map(s=>s.storeId==='b'?{...s,name:'Renamed',address:'New Road'}:s),'b').activityStoreId,'b')
let shared='';await shareActivityPage('brand','title','text',{clipboard:{writeText:async value=>{shared=value}}},'b');assert.equal(shared,getPermanentGameUrl('brand','b'))
const page=normalizeActivityPage({manualAccounts:[{platformId:'xiaohongshu',handle:'Cafe XHS',profileUrl:'https://www.xiaohongshu.com/user/profile/123'}]})
assert.equal(brandFollowLinks({...south,activityPage:page}).filter(l=>l.platform==='xiaohongshu').length,1)
assert.equal(activityPageDraftSnapshot(page,''),activityPageDraftSnapshot(normalizeActivityPage(JSON.parse(JSON.stringify(page))),''))
for(const profileUrl of ['javascript:alert(1)','http://www.xiaohongshu.com/user/profile/1','https://xiaohongshu.com.evil.test/user/1','https://user:pass@www.xiaohongshu.com/user/1','https://www.xiaohongshu.com/']) assert.throws(()=>normalizeActivityPage({manualAccounts:[{platformId:'xiaohongshu',handle:'Cafe',profileUrl}]}))
assert.throws(()=>normalizeActivityPage({manualAccounts:[...page.manualAccounts!,...page.manualAccounts!]}))
console.log('PASS store URL identity, map/review isolation, legacy selection, invalid/closed stores, scoped share, and manual Xiaohongshu validation')
