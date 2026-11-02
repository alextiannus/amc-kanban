import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as types from '../src/lib/model-management/types.ts'
import * as contract from '../src/lib/model-management/executionContract.ts'
import * as deadline from '../src/lib/global-text/deadline.ts'
const model=(id:string,cap:string,protocol:string)=>({id,connectionId:id,secretRef:id,protocol,definition:{name:id,modelName:id,capabilities:[cap],inputCapabilities:['text_input','structured_json']}})
const selection={defaults:{text:'text',image_understanding:'image',video_generation:'video'},exceptions:{}}
const runtime={active:true,version:-1,selection,models:[model('text','text','kopix'),model('image','image_understanding','cn_gateway'),model('video','video_generation','baidu_seedance')],secrets:{text:'fixture'}}
let tasks:any[]=[{source:'kanban',executor:'content',task:'video_generation',modelName:'video',version:-1,passed:true}],http=200,bodyCalls=0,conversationMismatch=false
const requests:any[]=[]
let timeoutProbe=false,gateText=false,gateServices=false
let textWaiters:Array<()=>void>=[],serviceWaiters:Array<()=>void>=[]
const dependencies:any={
 'node:crypto':crypto,'./types.ts':types,'./executionContract.ts':contract,
 '../global-text/deadline.ts':deadline,
 '../prisma.ts':{prisma:{$executeRawUnsafe:async()=>{}}},
 './registry.ts':{configurationRuntime:async()=>runtime,configurationFingerprint:()=> 'fixture'},
 '../global-text/transport.ts':{complete:async(c:any,p:any)=>{
  requests.push({connection:c,input:p})
  if(gateText){await new Promise<void>(resolve=>{textWaiters.push(resolve);if(textWaiters.length===5){gateText=false;textWaiters.forEach(done=>done())}})}
  if(timeoutProbe&&p.messages[0].content==='Reply OK')throw Object.assign(new Error('timeout'),{name:'TimeoutError'})
  if(p.task==='body_composition'){bodyCalls++;assert.equal(p.maxTokens,2048);return {text:'{"caption":"Lunch nearby","hashtags":[]}',message:{role:'assistant'}}}
  if(p.tools)return {message:{role:'assistant',tool_calls:[{id:'tool',function:{name:'echo_probe'}}]}}
  const tool=p.messages.find((m:any)=>m.role==='tool')
  if(conversationMismatch&&!tool&&p.messages.length>1)return {text:'wrong-private-response',message:{role:'assistant'}}
  const text=tool?tool.content:p.messages.length>1?p.messages[0].content.replace('Remember this verification code: ',''):p.messages[0].content.includes('JSON')?'{"ok":true}':'OK'
  return {message:{role:'assistant',content:text},text}
 }},
}
const exports:any={};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/model-management/validation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,Error,AbortSignal,require:(id:string)=>{assert.ok(dependencies[id],id);return dependencies[id]},process:{env:{AMC_CONTENT_SERVICE_URL:'https://content.fixture',AMC_MM_SERVICE_URL:'https://mm.fixture',CONTENT_SERVICE_INTERNAL_TOKEN:'fixture'}},
 fetch:async(url:string)=>{
  if(gateServices)await new Promise<void>(resolve=>{serviceWaiters.push(resolve);if(serviceWaiters.length===2){gateServices=false;serviceWaiters.forEach(done=>done())}})
  return url.includes('content.fixture')?Response.json({protocolVersion:2,executionContractVersion:1,delegatedMedia:true,success:tasks.every(t=>t.passed),tasks},{status:http}):Response.json({protocolVersion:2,success:true})
 },
})
const passed=await exports.validateSelection(selection);assert.equal(passed.passed,true,'media defaults do not require Kanban provider adapters');assert.equal(passed.checks['system.kanban'],true)
runtime.models[0].definition.modelName='glm-5.3'
Object.assign(runtime.models[0].definition,{timeoutMs:120000})
requests.length=0;gateText=true;gateServices=true
let watchdog:ReturnType<typeof setTimeout>|undefined
const parallel=await Promise.race([exports.validateSelection(selection),new Promise<never>((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('Independent probes or services were serialized')),1000)})]).finally(()=>clearTimeout(watchdog))
assert.equal(parallel.checks.body_composition,true);assert.equal(bodyCalls,1)
assert.equal(requests.length,6,'five independent probes plus the ordered tool result; no retries')
assert.equal(textWaiters.length,5);assert.equal(serviceWaiters.length,2)
assert.ok(requests.every(r=>r.connection.timeoutMs===110000),'120-second model timeout respects shared transport cap')
assert.ok(requests.filter(r=>r.input.task!=='body_composition').every(r=>r.connection.reasoningEffort==='low'))
assert.equal(requests.find(r=>r.input.task==='body_composition').connection.reasoningEffort,undefined,'business task retains central/default transport reasoning')
assert.equal(requests.at(-1).input.messages.some((m:any)=>m.role==='tool'),true,'tool result waits for tool call')
assert.equal(parallel.diagnostics.conversation.timeoutMs,110000)
assert.equal(parallel.diagnostics.conversation.matchesExpected,true)
assert.equal(typeof parallel.diagnostics.conversation.latencyMs,'number')
Object.assign(runtime.models[0].definition,{timeoutMs:45000,reasoningEffort:'high'})
requests.length=0
await exports.validateSelection(selection)
assert.ok(requests.every(r=>r.connection.timeoutMs===45000&&r.connection.reasoningEffort==='high'),'central timeout and explicit reasoning are authoritative')
timeoutProbe=true;requests.length=0
const timedOut=await exports.validateSelection(selection)
assert.equal(timedOut.passed,false);assert.equal(timedOut.errors.text,'Preflight request timed out after 45000 ms')
assert.equal(requests.filter(r=>r.input.messages[0].content==='Reply OK').length,1,'timeout is not retried')
timeoutProbe=false
conversationMismatch=true
const wrongRecall=await exports.validateSelection(selection)
assert.equal(wrongRecall.passed,false);assert.equal(wrongRecall.checks['system.content'],true)
assert.equal(wrongRecall.checks['system.kanban'],false)
assert.match(wrongRecall.errors.conversation,/exactly repeat/)
assert.equal(wrongRecall.errors['system.kanban'],'Kanban text preflight failed: conversation')
assert.doesNotMatch(JSON.stringify(wrongRecall),/wrong-private-response/)
assert.equal(wrongRecall.diagnostics.conversation.matchesExpected,false)
assert.equal(wrongRecall.diagnostics.conversation.containsExpected,false)
assert.equal(wrongRecall.diagnostics.conversation.responseChars,'wrong-private-response'.length)
assert.doesNotMatch(JSON.stringify(wrongRecall),/Remember this verification code|"apiKey"|"secrets"/)
tasks=[{...tasks[0],passed:false,error:'unsupported input'}]
const bothFailed=await exports.validateSelection(selection)
assert.match(bothFailed.errors['system.kanban'],/conversation/)
assert.match(bothFailed.errors['system.kanban'],/Content media task video_generation: unsupported input/)
conversationMismatch=false
tasks=[{...tasks[0],passed:false,error:'unsupported input'}];assert.equal((await exports.validateSelection(selection)).passed,false)
tasks=[{...tasks[0],passed:true,version:999}];const mismatch=await exports.validateSelection(selection);assert.equal(mismatch.passed,false);assert.match(mismatch.errors['system.content'],/version or executor mismatch/)
http=401;assert.equal((await exports.validateSelection(selection)).passed,false)
console.log('PASS Kanban preflight delegates media defaults, preserves failed tasks and rejects mismatched versions/authentication')
