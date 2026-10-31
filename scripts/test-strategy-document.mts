import assert from 'node:assert/strict'
import {strategyDocumentBinding,strategyDocumentCall,strategyDocumentTools} from '../src/lib/ai-native/strategy-document.ts'
import {conversationFrom} from '../src/lib/ai-native/contract.ts'
import {mergePlanningDraft,planningDraftContract} from '../src/lib/ai-native/planning-workspace-contract.ts'
import {strategyChanges} from '../src/lib/ai-native/strategy-receipt.ts'
const intent:any={kind:'conversation',topic:'brand_planning',brandId:'brand-a',artifactPath:'work/a.json',planningScope:{stage:'marketing_plan',mode:'draft',startMonth:'2026-11'}}
const context={id:'context',capability:'amc.context',status:'succeeded',result:{intent,contextDigest:'a'.repeat(64),planningContext:{workspace:{revision:'b'.repeat(64)}}}}
const skill={capability:'assistant.skills.read',status:'succeeded',input:{id:'amc-marketing-expert/SKILL.md'}}
const request=(calls:any[])=>({messages:[{role:'user',content:JSON.stringify({calls})}]})
const binding=strategyDocumentBinding(request([context,skill]),intent)!
assert(binding)
const text='\n# 东北人餐厅\n\n人均 S$20–30，朋友聚餐。\n\n| 推广点 | 创意关键词 |\n|---|---|\n| 自助餐/上门制作 | 开锅、聚会 |\n\n保留"引号"、\\反斜线、emoji 🍲 和空白。\n'
const call=strategyDocumentCall(text,binding,'my_write_workspace'),args=JSON.parse(call.function.arguments)
const reply=conversationFrom(args.content,intent),merged=mergePlanningDraft({},reply.planningDraft!,'task')
assert.equal(reply.planningDraft?.data,undefined)
assert.equal(merged.marketingPlan.content,text);assert.equal(merged.coCreation.marketing_plan.content,text)
assert.equal(merged.marketingPlan.documentFormat,'markdown')
assert.deepEqual(strategyChanges(merged.marketingPlan,{...merged.marketingPlan,content:text+'修改'}),['content'])
assert.equal(planningDraftContract(intent.planningScope).documentOutput?.format,'markdown')
assert.throws(()=>strategyDocumentCall(' ',binding,'write'))
assert.throws(()=>strategyDocumentCall('x'.repeat(24001),binding,'write'))
assert.equal(strategyDocumentBinding(request([context]),intent),null)
assert.equal(strategyDocumentBinding(request([context,{...skill,status:'failed'}]),intent),null)
assert.equal(strategyDocumentBinding(request([context,skill]),{...intent,brandId:'other'}),null)
assert.equal(strategyDocumentBinding(request([context,skill]),{...intent,planningScope:{...intent.planningScope,mode:'discuss'}}),null)
assert.equal(strategyDocumentBinding(request([{...context,result:{...context.result,contextDigest:'invalid'}},skill]),intent),null)
const writer={name:'my_write_workspace',parameters:{properties:{path:{},content:{},expectedRevision:{}}}}
assert.deepEqual(strategyDocumentTools([writer,{name:'iaic_finish'},{name:'iaic_wait'},{name:'amc.documents'}]),[{name:'amc.documents'}])
const next=strategyDocumentBinding(request([context,skill,{capability:'my_write_workspace',status:'succeeded',result:{reference:{path:intent.artifactPath,revision:2}}}]),intent)!
assert.equal(JSON.parse(strategyDocumentCall(text,next,'my_write_workspace').function.arguments).expectedRevision,2)
console.log('PASS: raw strategy text roundtrip, host metadata, edited version diff, tool pruning, skill/brand/digest isolation and scoped retry revision')

const {latestPreviewWriter}=await import('../src/lib/ai-native/latest-preview.ts')
let release!:()=>void;const gate=new Promise<void>(r=>release=r),written:string[]=[]
const previews=latestPreviewWriter(async text=>{written.push(text);if(written.length===1)await gate})
previews.push('first');for(let i=0;i<100;i++)previews.push('latest-'+i)
release();await previews.flush();assert.deepEqual(written,['first','latest-99'])
console.log('PASS: slow preview storage coalesces 100 updates into the latest write rather than delaying final completion')

const discussion={...intent,planningScope:{...intent.planningScope,mode:'discuss'}}
const selected=strategyDocumentBinding(request([{...context,result:{...context.result,intent:discussion}},skill,{capability:'amc.strategy_document',status:'succeeded',result:{format:'markdown'}}]),discussion)!
assert(selected)
assert.equal(conversationFrom(JSON.parse(strategyDocumentCall(text,selected,'my_write_workspace').function.arguments).content,discussion).planningDraft?.content,text)
assert.equal(strategyDocumentBinding(request([context,skill,{capability:'amc.strategy_document',status:'failed',result:{format:'markdown'}}]),discussion),null)
console.log('PASS: discussion stays unchanged until document mode is explicitly selected; full revisions use the same raw document path')

// Exercise actual Core wire aliases, not only the unencoded capability names.
const {wireToolNames}=await import('@immedi/iaic-core/agent/tool-names.js')
const originalTools=[{name:'amc.strategy_document'},{name:'amc.documents'},writer]
const wireNames=wireToolNames(originalTools)
const filtered=strategyDocumentTools(originalTools.map((t,i)=>({...t,name:wireNames[i]})))
assert.deepEqual(filtered.map(t=>t.name),['amc_documents'])
assert.deepEqual(strategyChanges({content:'old',monthlyPlans:[{month:'2026-11'}]},merged.marketingPlan),['content'])
assert.deepEqual(strategyChanges({...merged.marketingPlan,monthlyPlans:[]},merged.marketingPlan),[])
let unblock!:()=>void
const blocked=new Promise<void>(r=>unblock=r)
const slow=latestPreviewWriter(()=>blocked)
slow.push('pending preview')
const flushed=await Promise.race([slow.flush(10).then(()=>true),new Promise<boolean>(r=>setTimeout(()=>r(false),100))])
assert(flushed,'a stalled preview must not prevent the authoritative artifact from completing')
unblock();await slow.flush()
const rejected=latestPreviewWriter(async()=>{throw new Error('preview storage unavailable')})
rejected.push('best effort');await rejected.flush()
console.log('PASS: actual provider alias pruning, document-only change receipts and bounded/rejected preview storage')
