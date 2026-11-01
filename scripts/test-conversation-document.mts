import assert from 'node:assert/strict'
import {conversationDocumentBinding,conversationDocumentCall} from '../src/lib/ai-native/conversation-document'
import {conversationFrom} from '../src/lib/ai-native/contract'
import {nativeWireCalls} from '../src/lib/ai-native/tool-wire'
const intent:any={kind:'conversation',brandId:'brand',artifactPath:'work/reply.json',topic:'brand_planning'}
const data={calls:[{capability:'amc.context',status:'succeeded',result:{intent,contextDigest:'a'.repeat(64)}},{capability:'assistant.skills.read',status:'succeeded',input:{id:'amc-marketing-expert/SKILL.md'}}]}
const request=(value:any=data)=>({tools:[{name:'my_write_workspace'}],billingContext:{capability:'agent.work'},messages:[{role:'user',content:JSON.stringify(value)}]})
const binding=conversationDocumentBinding(request(),intent)!
assert(binding)
assert.equal(conversationDocumentBinding({...request(),tools:[]},intent),null)
assert.equal(conversationDocumentBinding(request(),{...intent,planningScope:{stage:'marketing_plan',mode:'draft'}}),null)
assert.equal(conversationDocumentBinding(request(),{...intent,brandId:'other'}),null)
assert.equal(conversationDocumentBinding(request(),{...intent,artifactPath:'elsewhere'}),null)
assert.equal(conversationDocumentBinding(request({calls:data.calls.slice(0,1)}),intent),null)
assert.equal(conversationDocumentBinding({...request(),billingContext:{capability:'amc.video_review'}},intent),null)
const text='品牌：测试品牌｜待补充｜新加坡。\n定位：能力规划，不代表已上线。\n经营目标：待补充。\n目标顾客：商家。\n选择理由与阻碍：待确认。\n竞争与差异：待补充。\n产品与服务：价格待核实。\n表达要求：不夸大。\n待补充：目标与价格。'
const call=conversationDocumentCall(text,binding,'writer')
const writer={name:'writer',parameters:{properties:{path:{},content:{},expectedRevision:{}}}}
const normalized=nativeWireCalls([call],{} as any,[writer],true,intent)
const args=JSON.parse(normalized[0].function.arguments)
assert.equal(args.path,intent.artifactPath);assert.equal(args.expectedRevision,0)
const artifact=conversationFrom(args.content,intent)
assert.deepEqual(artifact.planningProgress,{stage:'direction',summary:text.trim().slice(0,500)},'brand planning verifier requires continuity metadata even without a draft scope');
assert.equal(artifact.content,text);assert.equal(artifact.contextDigest,'a'.repeat(64));assert(artifact.interviewDraft)
const rewritten=conversationDocumentBinding(request({calls:[...data.calls,{capability:'my_write_workspace',status:'succeeded',result:{reference:{path:intent.artifactPath,revision:3}}}]}),intent)!
assert.equal(JSON.parse(conversationDocumentCall('修正回复',rewritten,'writer').function.arguments).expectedRevision,3)
assert.throws(()=>conversationDocumentCall('',binding,'writer'))
assert.throws(()=>conversationDocumentCall('回复',binding,''))
console.log('PASS plain conversation: trusted context/Skill gating, exact text/digest/path/revision, existing verifier and interview draft recovery, structured planning excluded')
