import assert from 'node:assert/strict'
import {conversationKnowledge,conversationProgress,conversationInsight} from '../src/lib/ai-native/conversation-progress.ts'
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
for(const value of [null,[],{stage:'complete',summary:'Done'},{stage:'interview',summary:''}]){const result=parse({planningProgress:value});assert.equal(result.planningProgress,undefined);assert.equal(result.content,reply.content)}
assert.deepEqual(parse({planningProgress:{stage:'interview',summary:'Save',approved:true}}).planningProgress,{stage:'interview',summary:'Save'})
assert.equal(parse({planningProgress:{stage:'interview',summary:'x'.repeat(501)}}).planningProgress?.summary.length,500)
assert.equal(conversationFrom(JSON.stringify({...reply,planningProgress:{stage:'interview',summary:'Text'}}),{...intent,topic:'general'}).planningProgress,undefined)
assert.equal(conversationFrom(JSON.stringify({...reply,planningProgress:{stage:'annual',summary:'Text'}}),{...intent,planningScope:{stage:'quarter',mode:'discuss',startMonth:'2027-01',quarter:0}}).planningProgress,undefined)
assert.deepEqual(parse({suggestedReplies:['A','B','C','D']}).suggestedReplies,['A','B','C'])
assert.deepEqual(parse({suggestedReplies:['A',' A ','B',null,{content:'invalid'}]}).suggestedReplies,['A','B'])
assert.deepEqual(parse({suggestedReplies:[{content:'not text'}]}).suggestedReplies,[])
assert.equal(parse({suggestedReplies:'not a list'}).suggestedReplies,undefined)
assert.equal(parse({uiAction:{page:'https://invalid.example',mode:'open'}}).uiAction,undefined)
assert.deepEqual(parse({uiAction:{page:'calendar',mode:'open',note:'display only'}}).uiAction,{page:'calendar',mode:'open'})
assert.equal(parse({uiAction:{page:'calendar',mode:'open',month:'invalid'}}).content,reply.content)
assert.throws(()=>parse({contextDigest:'invalid'}),/reply_context_digest_invalid/)
assert.throws(()=>parse({brandId:'other'}),/reply_brand_id_mismatch/)
console.log('PASS optional display metadata never rejects prose; unsafe navigation omitted, known fields normalized, identity and source validation retained')

const bundled={capability:'amc.context',status:'succeeded',result:{planningContext:{insight:{status:'missing'}}}}
assert.equal(conversationProgress('running',[bundled]).stage,'reply')
assert.deepEqual(conversationInsight([bundled]),{status:'missing'})
assert.deepEqual(conversationInsight([bundled,{capability:'amc.growth_insight',status:'succeeded',result:{status:'available'}}]),{status:'available'})
assert.equal(conversationInsight([{...bundled,status:'failed'}]),undefined)
console.log('PASS: bundled current-source progress, explicit missing report, legacy source compatibility')
const {planningWriteRecovery}=await import('../src/lib/ai-native/conversation-progress.ts')
const planning={kind:'conversation',topic:'brand_planning',planningScope:{stage:'marketing_plan'}}
const internal=[{capability:'amc.context',status:'succeeded'},{capability:'my_write_workspace',status:'unknown'}]
assert.equal(planningWriteRecovery(planning,'waiting','external_result',internal),'draft_write_unresolved')
assert.equal(planningWriteRecovery(planning,'waiting','external_result',[{capability:'amc.calendar_notes',status:'succeeded'},{capability:'amc.strategy_document',status:'succeeded'},...internal]),'draft_write_unresolved','calendar and strategy reads cannot disable internal draft-write recovery')
assert.equal(planningWriteRecovery(planning,'waiting','external_result',[{capability:'amc.calendar_notes',status:'unknown'},...internal]),undefined,'an unknown read still requires original-operation reconciliation')
for(const calls of [[{capability:'external.publish',status:'unknown'}],[{capability:'my_write_workspace',status:'running'}],[...internal,{capability:'amc.context',status:'unknown'}]])assert.equal(planningWriteRecovery(planning,'waiting','external_result',calls),undefined)
assert.equal(planningWriteRecovery({...planning,topic:'general'},'waiting','external_result',internal),undefined)
assert.equal(planningWriteRecovery(planning,'waiting','usage_reconciliation',internal),undefined)
console.log('PASS: presentation recovery is limited to internal planning writes; uncertain external actions and usage retain their original handling')
