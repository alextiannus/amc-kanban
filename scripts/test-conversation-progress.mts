import assert from 'node:assert/strict'
import {conversationKnowledge,conversationProgress} from '../src/lib/ai-native/conversation-progress.ts'
const sku={id:'sku',name:'招牌',price:'20',isSignature:true}
const facts={name:'Brand',productCatalog:[sku],creativePortfolio:[{id:'creative'}],knowledge:{menuItems:[sku],researchEvidence:{excerpt:'old'},brandTone:'friendly'}}
const before=JSON.stringify(facts),view=conversationKnowledge(facts,true)
assert.equal(JSON.stringify(facts),before,'projection never mutates authoritative facts or digest')
assert.deepEqual(view,{name:'Brand',knowledge:{brandTone:'friendly'}})
assert.deepEqual((conversationKnowledge(facts,false) as any).knowledge.researchEvidence,{excerpt:'old'})
assert.deepEqual((conversationKnowledge({knowledge:{menuItems:[sku]}},true) as any).knowledge.menuItems,[sku],'no catalog means raw menu must survive')
assert.equal(conversationProgress('running',[]).stage,'context')
assert.equal(conversationProgress('queued',[]).stage,'queued')
assert.equal(conversationProgress('running',[{capability:'amc.context',status:'succeeded'}]).stage,'planning')
assert.equal(conversationProgress('running',[{capability:'amc.growth_insight',status:'started'}]).stage,'context','started reads are not completed evidence')
assert.equal(conversationProgress('running',[{capability:'amc.marketing_workspace',status:'succeeded'}]).stage,'insight')
assert.equal(conversationProgress('running',[{capability:'amc.growth_insight',status:'succeeded'}]).stage,'reply')
assert.equal(conversationProgress('running',[{capability:'my_write_workspace',status:'succeeded'}]).stage,'finalizing')
assert.equal(conversationProgress('running',[],true).stage,'checking')
assert.equal(conversationProgress('succeeded',[]).stage,'complete')
console.log('PASS: factual progress and deduplicated non-mutating conversation context')
