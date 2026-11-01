import assert from 'node:assert/strict'
import {readBrandFacts,readVideoRewriteFacts,savedStrategyContext} from '../src/lib/ai-native/facts.ts'
import {currentPlanningDocuments} from '../src/lib/ai-native/brand-planning.ts'
const solution={marketingPlan:{content:'Current strategy'},coCreation:{marketing_plan:{content:'Current strategy'},direction:{content:'retired'},interview:{content:'Saved interview'}},autopilotStrategy:{content:'old'}}
assert.deepEqual(currentPlanningDocuments(solution),{interview:{content:'Saved interview'}})
assert.equal(savedStrategyContext(solution)?.content,'Current strategy');assert.equal(savedStrategyContext({autopilotStrategy:{content:'old'}}),null)
assert.equal(savedStrategyContext({marketingPlan:{content:'x'.repeat(8000)}})?.partial,true)
const db:any={brand:{findUnique:async({select}:any)=>{
 const projection=select.knowledge.select
 for(const key of ['brandTone','brandVoice','brandImage','audienceAssumptions','productAssumptions','promotionFocus'])assert(!projection[key],key+' must not be selected')
 return {id:'brand',name:'Brand',knowledge:{marketingSolution:solution,negPrompts:['No false claims'],menuItems:[{id:'sku',name:'Soup'}]}}
}}}
for(const facts of [await readBrandFacts(db,'brand'),await readVideoRewriteFacts(db,'brand')]){
 assert.equal(facts.knowledge.contentStrategy.content,'Current strategy');assert.deepEqual(facts.knowledge.negPrompts,['No false claims']);assert.equal(facts.productCatalog[0].name,'Soup');assert(!('marketingSolution' in facts.knowledge))
}
console.log('PASS: current strategy only, retired fields absent, merchant restrictions and SKU facts retained')
const {compareStrategySources,strategyInterviewVersion}=await import('../src/lib/brand-plan/strategy-sources.ts')
const original:any={merchantInterview:{rawNotes:'Original interview'},marketingSolution:{marketingPlan:{content:'Saved strategy'}}}
original.marketingSolution.marketingPlan.provenance={sourceVersions:{interview:strategyInterviewVersion(original),report:'report-1'}}
assert.deepEqual(compareStrategySources(original,{id:'report-1'}).changedSources,[])
assert.deepEqual(compareStrategySources(original,{id:'report-2'}).changedSources,['report'])
assert.deepEqual(compareStrategySources({...original,merchantInterview:{rawNotes:'Revised interview'}},{id:'report-1'}).changedSources,['interview'])
assert.deepEqual(compareStrategySources({...original,merchantInterview:{rawNotes:'Revised interview'}},{id:'report-2'}).changedSources,['interview','report'])
assert.equal(compareStrategySources({marketingSolution:{}},null).baselineKnown,false)
console.log('PASS: both input versions checked, no change, independent/both changes and missing historical baseline')
