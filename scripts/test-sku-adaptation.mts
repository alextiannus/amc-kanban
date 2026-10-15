import assert from 'node:assert/strict'
import {skuCatalog, catalogDigest, proposalFrom, adaptationFrom, confirmSkuDecision} from '../src/lib/brand-plan/creativeSkuContract.ts'
import {skuFacts,validateSkuReferences} from '../src/lib/ai-native/facts.ts'
const catalog=skuCatalog({knowledge:{menuItems:[{id:'a',name:'甲'},{id:'b',name:'乙'},{id:'c',name:'丙'}]}})
const source:any={inspirationCreativeId:'cre_original',sourceRevision:'rev1',sourceDigest:'f'.repeat(64),evidenceStatus:'full_source',timeline:[{id:'s1',order:1},{id:'s2',order:2}]}
const intent:any={kind:'sku_proposal',brandId:'brand',creativeId:'idea',month:'2026-11',expectedRevision:'r',sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest,catalogDigest:catalogDigest(catalog)}
const rec=(skuId:string,skuName:string)=>({skuId,skuName,roles:['hero'],rationale:'Fits the source action',sourceShotIds:['s1','s2']})
const base:any={...intent,contextDigest:'e'.repeat(64),mode:'source_adaptation',recommendations:[rec('a','甲'),rec('b','乙')]}
assert.equal(proposalFrom(JSON.stringify(base),intent,catalog,source).recommendations.length,2)
assert.throws(()=>proposalFrom(JSON.stringify({...base,finalScript:'premature'}),intent,catalog,source),/proposal/)
assert.throws(()=>proposalFrom(JSON.stringify({...base,recommendations:[rec('a','甲')]}),intent,catalog,source),/count/)
assert.throws(()=>proposalFrom(JSON.stringify({...base,recommendations:[rec('a','wrong'),rec('b','乙')]}),intent,catalog,source),/sku/)
assert.throws(()=>proposalFrom(JSON.stringify({...base,recommendations:[{...rec('a','甲'),sourceShotIds:['unknown']},rec('b','乙')]}),intent,catalog,source),/shot/)
const input:any={...base,selectedSkuIds:['b','c'],recommendations:[rec('b','乙'),rec('c','丙')],adjustmentNote:'Change product mix'}
const decision=confirmSkuDecision(input,catalog,source,'human','r')
assert.deepEqual(decision.selectedSkuIds,['b','c'])
const adaptIntent:any={...intent,kind:'creative_adaptation',decisionDigest:decision.digest}
const output:any={...adaptIntent,contextDigest:'e'.repeat(64),mode:'source_adaptation',title:'Brand story',aiCaption:'',materialRequirements:['Film selected products'],shots:source.timeline.map((s:any)=>({sourceShotId:s.id,skuIds:['b','c'],visualDescription:'乙 丙',subjectAction:'Present products',voiceover:'',onScreenText:'',sound:'',transition:''}))}
assert.equal(adaptationFrom(JSON.stringify(output),adaptIntent,catalog,source,decision).patch.planning.includes('甲'),false)
assert.throws(()=>adaptationFrom(JSON.stringify({...output,shots:output.shots.slice(0,1)}),adaptIntent,catalog,source,decision),/shot/)
assert.throws(()=>adaptationFrom(JSON.stringify({...output,title:'甲'}),adaptIntent,catalog,source,decision),/unselected/)
assert.throws(()=>confirmSkuDecision({...input,catalogDigest:'stale'},catalog,source,'human','r'),/catalog/)
assert.throws(()=>confirmSkuDecision({...input,selectedSkuIds:['deleted']},catalog,source,'human','r'),/sku/)
assert.throws(()=>confirmSkuDecision({...input,sourceRevision:'old'},catalog,source,'human','r'),/source/)
const one=catalog.slice(0,1),oneIntent={...intent,catalogDigest:catalogDigest(one)}
assert.equal(proposalFrom(JSON.stringify({...base,...oneIntent,recommendations:[rec('a','甲')]}),oneIntent,one,source).recommendations.length,1)
const emptyIntent={...intent,catalogDigest:catalogDigest([]),sourceRevision:null,sourceDigest:null}
const empty={...base,...emptyIntent,mode:'ordinary_brand_content',notice:'普通品牌内容，非爆款复刻',recommendations:[]}
assert.equal(proposalFrom(JSON.stringify(empty),emptyIntent,[],null).mode,'ordinary_brand_content')
assert.throws(()=>proposalFrom(JSON.stringify({...empty,mode:'source_adaptation'}),emptyIntent,[],null),/mode/)
const emptyDecision=confirmSkuDecision({...emptyIntent,selectedSkuIds:[],recommendations:[]},[],null,'human','r')
const emptyAdapt={...emptyIntent,kind:'creative_adaptation',decisionDigest:emptyDecision.digest}
assert.match(adaptationFrom(JSON.stringify({...output,...emptyAdapt,mode:'ordinary_brand_content',notice:'普通品牌内容，非爆款复刻',shots:[{...output.shots[0],sourceShotId:null,skuIds:[],visualDescription:'品牌介绍',subjectAction:'展示品牌'}]}),emptyAdapt,[],null,emptyDecision).patch.planning,/非爆款复刻/)
assert.throws(()=>confirmSkuDecision({...input,selectedSkuIds:['a','b','c','d','e']},catalog,source,'human','r'),/selection/)
assert.throws(()=>proposalFrom(JSON.stringify(base),intent,catalog,{...source,evidenceStatus:'partial_source'}),/complete_source/)
assert.throws(()=>adaptationFrom(JSON.stringify(output),{...adaptIntent,decisionDigest:'forged'},catalog,source,decision),/confirmation/)
assert.throws(()=>confirmSkuDecision({...input,sourceDigest:'wrong'},catalog,source,'human','r'),/source/)
assert.deepEqual(skuCatalog({id:'brand',knowledge:{menuItems:[{id:'foreign',brandId:'another',name:'Foreign'},{id:'deleted',name:'Gone',deletedAt:'today'}]}}),[])
assert.notEqual(catalogDigest(skuCatalog({knowledge:{menuItems:[{id:'a',name:'Alpha',price:1}]}})),catalogDigest(skuCatalog({knowledge:{menuItems:[{id:'a',name:'Alpha',price:2}]}})))
// Preserve legacy snapshot/privacy regressions for historical task readers.
const legacyRaw=[{id:'sku_a',name:'Noodles',price:'8.50',currency:'SGD',apiKey:'secret'},'Tea']
const legacyCatalog=skuFacts(legacyRaw)
assert.deepEqual(skuFacts(legacyRaw),legacyCatalog)
assert.equal(legacyCatalog[1].currency,'');assert(!JSON.stringify(legacyCatalog).includes('secret'))
assert(validateSkuReferences({skuIds:['sku_a'],planning:'Noodles'},{productCatalog:legacyCatalog}))
assert(!validateSkuReferences({skuIds:['foreign'],planning:'Noodles'},{productCatalog:legacyCatalog}))
assert(!validateSkuReferences({skuIds:[],patch:{planning:'Brand introduction',product:'Reference Burger'}},{productCatalog:[]}))
assert(validateSkuReferences({skuIds:[],patch:{planning:'Brand introduction',product:'品牌内容'}},{productCatalog:[]}))
console.log('PASS SKU proposal, human selection, source binding, full shots and unselected product rejection')
