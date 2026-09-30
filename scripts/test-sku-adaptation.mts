import assert from 'node:assert/strict'
import {skuFacts,validateSkuReferences} from '../src/lib/ai-native/facts.ts'
const raw=[{id:'sku_a',name:'Noodles',price:'8.50',currency:'SGD',apiKey:'secret'},'Tea',{id:'sku_b',name:'Soup'}]
const productCatalog=skuFacts(raw)
assert.deepEqual(skuFacts(raw),productCatalog,'legacy missing IDs must have stable snapshot identity')
assert.equal(productCatalog[1].currency,'','do not invent default currency')
assert(!JSON.stringify(productCatalog).includes('secret'))
assert(validateSkuReferences({skuIds:['sku_a'],patch:{planning:'Noodles: open on preparation, close on finished product.'}},{productCatalog}))
assert(!validateSkuReferences({skuIds:['not-this-brand'],planning:'Noodles'},{productCatalog}))
assert(!validateSkuReferences({skuIds:['sku_a'],planning:'A different product'},{productCatalog}))
assert(!validateSkuReferences({skuIds:[],planning:'Generic copy'},{productCatalog}))
assert(validateSkuReferences({skuIds:[],planning:'Brand story'},{productCatalog:[]}))
console.log('PASS: deterministic SKU snapshot, no inferred currency, whitelist, foreign SKU and generic script rejection, empty-catalog brand story')

assert(!validateSkuReferences({skuIds:[],patch:{planning:'Brand introduction'}},{productCatalog:[]}),'missing product patch must not retain source product')
assert(!validateSkuReferences({skuIds:[],patch:{planning:'Brand introduction',product:'Reference Burger'}},{productCatalog:[]}),'source product must not survive generic adaptation')
assert(validateSkuReferences({skuIds:[],patch:{planning:'Brand introduction',product:'品牌内容'}},{productCatalog:[]}))
console.log('PASS: general adaptation explicitly replaces reference product metadata')
