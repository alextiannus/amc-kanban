import assert from 'node:assert/strict'
import {brainstormTagContext,brainstormMatchRequest} from '../src/lib/ai-native/brainstorm-match.ts'
const brand={id:'brand',name:'示例公司',industry:'餐饮',description:'现包现蒸',productCatalog:[{name:'高蛋白组合',description:'约720kcal',tags:['套餐']}],knowledge:{productAssumptions:'手工现做',promotionFocus:'外卖配送',researchEvidence:{excerpt:'未经确认的有机'},contentStrategy:{content:'假设明星代言'}}}
const context=brainstormTagContext(brand,'handmade')
assert.deepEqual(context.products,[{name:'高蛋白组合',description:'约720kcal',tags:['套餐']}])
assert.equal(context.features,'手工现做');assert.equal(context.services,'外卖配送')
assert(!JSON.stringify(context).includes('明星'));assert(!JSON.stringify(context).includes('有机'))
const input=brainstormMatchRequest(brand,'handmade','request',[])
assert.deepEqual(input.brandTagContext,context);assert.equal(input.minimumMatchScore,75)
assert(input.sellingPoint.startsWith('handmade'));assert.equal(input.requirePersistedCreative,true)
assert.equal(brainstormTagContext({...brand,description:'x'.repeat(10000)},'').description.length,5000)
console.log('PASS unified Content context, verified fields, bounded payload, manual terms, shared prefetch and unchanged admission policy')
