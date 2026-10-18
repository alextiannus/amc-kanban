import assert from 'node:assert/strict'
import {planningCreativeBrief,planningCreativeReferences,searchPlanningCreatives} from '../src/lib/ai-native/planning-creative-search.ts'
const facts={id:'brand-one',name:'真实品牌',industry:'餐饮',description:'手工包子',productCatalog:[{name:'爆汁包'}],knowledge:{market:'Singapore'}}
const workspace={workspace:{marketingInputs:{brandPositioning:{content:'家庭午晚餐'},principalStrategy:{content:'推广家庭分享'},platformPlanning:{knownBrandPlatforms:['instagram']}},marketingPlan:{coreSellingPoints:['现做与汤汁']}}}
const brief=planningCreativeBrief(facts,workspace)
assert.equal(brief.positioning,'家庭午晚餐');assert.deepEqual(brief.sellingPoints,['现做与汤汁']);assert.equal(brief.principal,'推广家庭分享')
const source=(id:string,score:number,link='https://example.com/original')=>({inspirationCreativeId:id,matchScore:score,sourceVideo:{title:'真实来源',sourceUrl:link,platform:'instagram'},contentAngle:'制作过程',matchedTags:['手工','家庭']})
const ranked=planningCreativeReferences([source('cre_a',9),source('fake',99),source('cre_b',3),source('cre_c',18,'javascript:alert(1)'),source('cre_a',9)])
assert.deepEqual(ranked.map(v=>v.sourceCreativeId),['cre_c','cre_a']);assert.equal(ranked[0].sourceUrl,null);assert(ranked.every(v=>v.popularityStatus==='unverified'))
let request:any
const found=await searchPlanningCreatives(facts,workspace,'2026-10',async v=>{request=v;return {contentMatchRequestId:'match-real',libraryVersions:{version:'v1'},creativeCandidates:[source('cre_a',9)],contentLibraryGaps:[],candidateAssetNeeds:[],candidateStoreVisitNeeds:[],candidateMaterialPrintNeeds:[]}})
assert.equal(found.status,'available');assert.equal(found.contentMatchRequestId,'match-real');assert(request.requirePersistedCreative);assert(request.sellingPoint.includes('家庭午晚餐'));assert(request.sellingPoint.includes('现做与汤汁'));assert.deepEqual(request.platforms,['instagram']);assert(found.dailyNotice.includes('每天持续更新'))
const empty=await searchPlanningCreatives(facts,workspace,'2026-10',async()=>({contentMatchRequestId:'empty',libraryVersions:{},creativeCandidates:[],contentLibraryGaps:[],candidateAssetNeeds:[],candidateStoreVisitNeeds:[],candidateMaterialPrintNeeds:[]}))
assert.equal(empty.status,'empty')
const failed=await searchPlanningCreatives(facts,workspace,'2026-10',async()=>{throw Error('private provider failure')})
assert.equal(failed.status,'unavailable');assert(!JSON.stringify(failed).includes('private provider'))
console.log('PASS: mandatory brand positioning/selling-point retrieval input, real IDs, relevance ranking, safe source links, daily notice and empty/unavailable distinction')
