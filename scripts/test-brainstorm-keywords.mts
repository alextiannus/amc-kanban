import assert from 'node:assert/strict'
import {brainstormMatchingTags,brainstormMatchRequest} from '../src/lib/ai-native/brainstorm-match.ts'
const brand={id:'brand',name:'示例公司',industry:'餐饮',description:'手工现包，开放式厨房，现点现蒸。不要使用低价促销。',productCatalog:[{name:'普通饮品'},{name:'鲜肉包',isSignature:true,description:'手工现包',tags:['招牌','现点现蒸']},{name:'早餐套餐',isMerchantPick:true}],knowledge:{productAssumptions:'招牌早餐，手工现包',promotionFocus:'早餐外带',researchEvidence:{excerpt:'未经确认的进口有机食材'},contentStrategy:{content:'假设明星代言'}}}
const tags=brainstormMatchingTags(brand,'')
assert.deepEqual(tags.slice(0,2),['鲜肉包','早餐套餐'])
for(const term of ['手工现包','现点现蒸','开放式厨房','早餐外带'])assert(tags.includes(term),term)
for(const term of ['示例公司','餐饮','招牌','低价促销','未经确认的进口有机食材','假设明星代言'])assert(!tags.includes(term),term)
assert.equal(new Set(tags).size,tags.length);assert(tags.length<=12)
const input=brainstormMatchRequest(brand,'','request',[])
assert(input.sellingPoint.startsWith(tags.join('，')));assert(input.promotionGoal.includes(tags.join('，')))
assert.deepEqual(brainstormMatchingTags(brand,'新品，手工包子'),['新品','手工包子'])
assert(brainstormMatchRequest(brand,'custom phrase','request',[]).sellingPoint.startsWith('custom phrase'))
assert.deepEqual(brainstormMatchingTags({name:'Sparse brand',industry:'Pilates'},''),['Pilates','Sparse brand'])
assert(!brainstormMatchingTags({...brand,description:'x'.repeat(5000),productCatalog:[],knowledge:{}},'').some(t=>t.length>80))
console.log('PASS factual product/USP keywords, priority, deduplication, manual override, sparse profiles and matcher/UI parity')

const account=brainstormMatchingTags({name:'AI Marketing Crew',description:'AI Marketing Crew 是面向新加坡本地生活商家的 AI 自媒体代运营与增长服务品牌。本账号分享内容主要为本地美食探店，寻找共同的美食爱好者。'},'')
assert.equal(account[0],'本地美食探店');assert(!account.includes('AI'));assert(!account.includes('Marketing'))
console.log('PASS explicit account content positioning takes priority over corporate boilerplate')
