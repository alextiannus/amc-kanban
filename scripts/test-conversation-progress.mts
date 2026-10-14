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

const {conversationFrom}=await import('../src/lib/ai-native/contract.ts')
const intent={kind:'conversation' as const,topic:'brand_planning' as const,brandId:'brand',userId:'user',history:[],goal:'Discuss',artifactPath:'work/test.json',requestKey:'key'}
const reply={kind:'conversation',brandId:'brand',content:'Which direction?',contextDigest:'0'.repeat(64)}
const parse=(extra:Record<string,unknown>)=>conversationFrom(JSON.stringify({...reply,...extra}),intent)
assert.equal(parse({}).planningProgress,undefined,'old replies remain readable')
assert.deepEqual(parse({planningProgress:{stage:'interview',summary:'User prefers families; budget unknown.'}}).planningProgress,{stage:'interview',summary:'User prefers families; budget unknown.'})
for(const value of [null,[],{stage:'complete',summary:'Done'},{stage:'interview',summary:''},{stage:'interview',summary:'x'.repeat(501)},{stage:'interview',summary:'Save',approved:true}])assert.throws(()=>parse({planningProgress:value}),/invalid_planning_progress/)
assert.throws(()=>conversationFrom(JSON.stringify({...reply,planningProgress:{stage:'interview',summary:'Text'}}),{...intent,topic:'general'}),/invalid_planning_progress/)
assert.throws(()=>conversationFrom(JSON.stringify({...reply,planningProgress:{stage:'annual',summary:'Text'}}),{...intent,planningScope:{stage:'quarter',mode:'discuss',startMonth:'2027-01',quarter:0}}),/planning_progress_scope_mismatch/)
console.log('PASS: discussion stage bounds, scope binding, no approval fields, old reply compatibility')
assert.deepEqual(parse({suggestedReplies:['A','B','C','D']}).suggestedReplies,['A','B','C'],'a fourth presentation choice does not trigger another model turn')
assert.deepEqual(parse({suggestedReplies:['A',' A ','B']}).suggestedReplies,['A','B'])
assert.throws(()=>parse({suggestedReplies:[{content:'not text'}]}),/invalid_suggested_replies/)
console.log('PASS: choice presentation normalization preserves reply content without generation retries')
