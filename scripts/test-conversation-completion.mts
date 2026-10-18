import assert from 'node:assert/strict'
import {prepareConversationCompletion} from '../src/lib/ai-native/conversation-completion.ts'
const ref={path:'work/reply.json',revision:1,digest:'a'.repeat(64)}
const context={id:'context',capability:'amc.context',status:'succeeded',result:{intent:{kind:'conversation',topic:'brand_planning',artifactPath:ref.path}}}
const write={id:'write',capability:'my_write_workspace',status:'succeeded',result:{reference:ref}}
const event={kind:'call_settled',data:{callId:write.id}}
const make=(calls:any[],events:any[])=>({messages:[{role:'user',content:JSON.stringify({calls,events})}],tools:[{name:'my_write_workspace'}],delegationSchema:{type:'object'},signal:new AbortController().signal,billingContext:{taskId:'same-task'}})
const ready=make([context,write],[event]),result=prepareConversationCompletion(ready)
assert.deepEqual(result.tools,[]);assert.equal(result.delegationSchema,null)
assert.equal(result.signal,ready.signal);assert.equal(result.billingContext,ready.billingContext)
assert.equal(ready.tools.length,1,'never mutate the provider or Runtime tool configuration')
assert(result.messages.at(-1)?.content.includes(JSON.stringify(ref)))
for(const next of [{kind:'verification',data:{verified:false,feedback:'Fix metadata'}},{kind:'input',data:{message:'New requirement'}},{kind:'feedback',data:{error:'Invalid result'}}]){
 const request=make([context,write],[event,next]);assert.equal(prepareConversationCompletion(request),request,'correction or new user input retains tools')
}
for(const invalid of [{...write,status:'unknown'},{...write,result:{}},{...write,result:{reference:{...ref,path:'other'}}},{...write,result:{reference:{...ref,digest:'invalid'}}}]){
 const request=make([context,invalid],[event]);assert.equal(prepareConversationCompletion(request),request)
}
const general=make([{...context,result:{intent:{kind:'conversation',topic:'general'}}},write],[event]);assert.equal(prepareConversationCompletion(general),general)
const noWrite=make([context],[]);assert.equal(prepareConversationCompletion(noWrite),noWrite)
console.log('PASS: submit only successful scoped receipts; retain original model billing/signal; restore tools for verification feedback, new input, unknown write and unrelated intents')
// Large source results can be omitted from bounded model context. Bind to the
// admission record rather than depending on the old amc.context result body.
const omitted=make([{...context,result:null,resultOmitted:true},write],[event])
const scoped=prepareConversationCompletion(omitted,context.result.intent)
assert.deepEqual(scoped.tools,[])
assert(scoped.messages.at(-1)?.content.includes(JSON.stringify(ref)))
assert.equal(prepareConversationCompletion(make([write],[event]),{kind:'conversation',topic:'general',artifactPath:ref.path}).tools.length,1)
const rejected=make([write],[event,{kind:'verification',data:{verified:false}}])
assert.equal(prepareConversationCompletion(rejected,context.result.intent),rejected)
console.log('PASS: trusted admission restores finish guidance when bounded history omits source results; failed verification still restores repair tools')
