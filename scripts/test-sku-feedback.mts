import assert from 'node:assert/strict'
import {validateSkuReferences,skuReferenceFeedback} from '../src/lib/ai-native/facts.ts'
const facts={productCatalog:[{id:'bundle',name:'家庭盒（6粒组合） Family Box'},...Array.from({length:5},(_,i)=>({id:`part${i}`,name:`单品${i}`}))]}
const tooMany={skuIds:facts.productCatalog.map(s=>s.id),planning:'家庭盒'}
assert.equal(validateSkuReferences(tooMany,facts),false);assert.match(skuReferenceFeedback(tooMany,facts),/maximum is 3/);assert.match(skuReferenceFeedback(tooMany,facts),/single catalog SKU/)
const shortened={skuIds:['bundle'],planning:'家庭盒'}
assert.equal(validateSkuReferences(shortened,facts),false);assert(skuReferenceFeedback(shortened,facts).includes(facts.productCatalog[0].name))
assert.equal(validateSkuReferences({skuIds:['bundle'],planning:'产品标注：家庭盒（6粒组合） Family Box。口播：一家人的包点。'},facts),true)
assert.match(skuReferenceFeedback({skuIds:['invented'],planning:''},facts),/not in productCatalog/)
assert(skuReferenceFeedback(shortened,facts).length<2000)
console.log('PASS: bundle count and exact-name feedback identifies corrections without weakening SKU binding')
