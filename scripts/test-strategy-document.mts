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
