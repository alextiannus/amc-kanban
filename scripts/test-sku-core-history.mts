import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import ts from 'typescript'
import {AgentRuntime} from '@immedi/iaic-core/agent/runtime.js'
import {ContextAssembler} from '@immedi/iaic-core/context/index.js'
import {TaskStore} from '@immedi/iaic-core/tasks/store.js'
import {HostTaskContext} from '@immedi/iaic-core/context/host.js'
import {defineCapability} from '@immedi/iaic-core/capabilities/index.js'
import * as visibility from '@immedi/iaic-core/capabilities/visibility.js'
import * as contract from '../src/lib/ai-native/contract.ts'
import * as sku from '../src/lib/brand-plan/creativeSkuContract.ts'
import {CreativeRevisionError} from '../src/lib/brand-plan/creativeRevisionContract.ts'
const compile=(path:string,deps:any)=>{const mod={exports:{} as any};const source=process.env.TASK5_BASELINE?execFileSync('git',['show',process.env.TASK5_BASELINE+':'+path],{encoding:'utf8'}):readFileSync(path,'utf8');new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports);return mod.exports}
const actor=contract.actorFor('brand','human'),taskId='11111111-1111-4111-8111-111111111111'
let currentRevision='a'.repeat(64),revoked=false,historyReads=0,saves=0,receiptReads=0,dispatches=0,fault:any=null,receipt:any=null
const facts={id:'brand',name:'Brand',description:'Original description',knowledge:{menuItems:[{id:'sku',name:'Alpha'}]}},catalog=sku.skuCatalog(facts)
const source:any={inspirationCreativeId:'cre_source',sourceRevision:'s1',sourceDigest:'b'.repeat(64),evidenceStatus:'full_source',timeline:[{id:'shot-1',order:1,startSec:0,endSec:3}]}
const binding={brandId:'brand',creativeId:'idea',month:'2026-11',expectedRevision:currentRevision,catalogDigest:sku.catalogDigest(catalog),sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest}
const decision=sku.confirmSkuDecision({...binding,selectedSkuIds:['sku'],recommendations:[{skuId:'sku',skuName:'Alpha',roles:['hero'],rationale:'Fits source',sourceShotIds:['shot-1']}]},catalog,source,'human',currentRevision)
const intent={...binding,kind:'creative_adaptation',decisionDigest:decision.digest,userId:'human',goal:'Adapt confirmed SKU',requestKey:'core-history-task',artifactPath:'work/history.json'}
const produced={...binding,kind:'creative_adaptation',decisionDigest:decision.digest,contextDigest:contract.digest(facts),mode:'source_adaptation',title:'Alpha story',aiCaption:'Alpha',materialRequirements:['Film Alpha'],shots:[{sourceShotId:'shot-1',skuIds:['sku'],visualDescription:'Alpha',subjectAction:'Present Alpha',voiceover:'',onScreenText:'',sound:'',transition:''}]}
const artifact={path:intent.artifactPath,digest:contract.digest(produced),revision:1}
const ctx=()=>({binding:{...binding,expectedRevision:currentRevision},current:{canOverwrite:true,current:{skuDecision:decision}},catalog,facts,source})
const workflow=compile('src/lib/ai-native/sku-workflow.ts',{'./contract':contract,'../brand-plan/creativeSkuContract':sku,'../brand-plan/creativeSkuDecision':{
  readBoundSkuContext:async(_a:any,b:any)=>{if(fault)throw fault;if(b.expectedRevision!==currentRevision)throw new CreativeRevisionError('creative_revision_conflict',409);sku.assertConfirmedDecision(decision,b,catalog,source);return ctx()},
}})
const request:any={id:'request-1',intent,task_id:taskId,digest:contract.digest(intent),request_key:intent.requestKey}
const task:any={id:taskId,employee_id:actor.scopeId,erp_user:actor.subjectId,capability:'agent.work',input:{goal:intent.goal},version:'fixture',status:'succeeded',result:{artifacts:[artifact]},trusted_context:null,updated_at:new Date().toISOString()}
let calls:any[]=[]
const pool:any={query:async(sql:string,args:any[])=>{
  if(sql.includes('SELECT runtime_lane'))return {rows:args[0]===task.id&&args[1]===actor.subjectId&&args[2]==='brand'?[{runtime_lane:'default'}]:[]}
  if(sql.includes('FROM amc_ai_requests'))return {rows:args[0]===actor.scopeId&&args[1]===actor.subjectId&&[request.id,request.request_key].includes(args[2])?[request]:[]}
  if(sql.includes('FROM iaic_tasks'))return {rows:args[0]===task.id&&args[1]===actor.scopeId&&args[2]===actor.subjectId?[structuredClone(task)]:[]}
  if(sql.includes('FROM iaic_task_events'))return {rows:[]}
  if(sql.includes('FROM iaic_calls')){historyReads++;return {rows:structuredClone(calls)}}
  throw Error('Unexpected SQL: '+sql)
}}
const storeModule=compile('src/lib/ai-native/store.ts',{'./contract':contract})
const tasks=new TaskStore({pool})
let config:any
const app:any={tasks,workspace:{read:async(_a:any,ref:any)=>{assert.deepEqual(ref,artifact);return {content:JSON.stringify(produced)}}},ledger:{taskUsage:async()=>({})},scope:async()=>actor}
const application=compile('src/lib/ai-native/application.ts',{
  './runtime-application.mjs':{openApplication:async(c:any)=>{config=c;return app}},'./contract':contract,'./store':storeModule,'./sku-workflow':workflow,
  './autopilot-capabilities':{AUTOPILOT_TOOLS:[],autopilotCapabilities:()=>[]},
  '@immedi/iaic-core/capabilities/index.js':{defineCapability},'node:crypto':await import('node:crypto'),'node:path':await import('node:path'),
})
const authorize=async(a:any)=>!revoked&&a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId
await application.composeApplication(pool,{}, {version:'fixture',authorize,readContext:async()=>facts})
const hostContext=new HostTaskContext({...config.hostContext,readTask:(a:any,id:string)=>tasks.get(a,id)})
task.trusted_context=await hostContext.bind({actor,capability:{name:'agent.work'},idempotencyKey:intent.requestKey,version:'fixture'})
const contextCapability=config.extraCapabilities.find((c:any)=>c.name==='amc.context')
const fixedContext=await contextCapability.implementation.execute({}, {actor,taskId})
calls=[{id:'call-context',task_id:taskId,capability:'amc.context',input:{},status:'succeeded',result:fixedContext}]
app.dispatcher={capabilities:new Map([['agent.work',{name:'agent.work',authorize}],...config.extraCapabilities.map((c:any)=>[c.name,c])]),invoke:async()=>{dispatches++;throw Error('Unexpected dispatch')}}
app.runtime=new AgentRuntime({store:tasks,dispatcher:app.dispatcher,context:new ContextAssembler({skillRoot:'skills'}),version:'fixture',model:{name:'no-model-used'},trustedContext:hostContext})
;(globalThis as any).amcNativeHost=Promise.resolve({pool,app,tools:[],modelRevision:1})
const service=compile('src/lib/ai-native/service.ts',{
  './contract':contract,'./store':storeModule,'./sku-workflow':workflow,'./application':{requireActor:async(a:any)=>{if(!await authorize(a))throw contract.nativeError('ai_access_denied',403)}},
  './recommendations':{adaptedScriptReceipt:async()=>{receiptReads++;return receipt}},
  './conversation-progress':{conversationInsight:()=>null},
  '@immedi/iaic-core/capabilities/visibility.js':visibility,
  '../brand-plan/creativeRevisions':{saveCreativeRevision:async(...args:any[])=>{saves++;currentRevision='f'.repeat(64);receipt={verified:true,month:'2026-11',creativeId:'idea',receipt:{id:'revision-saved',ai:args[6],contentHash:'saved',content:{id:'idea',adaptationStatus:'adapted'}}};return receipt},readCreativeRevisions:async()=>({revisions:[{contentHash:'saved'}]})},
})
const body={requestKey:'adopt-core-history',artifactDigest:artifact.digest}
assert.equal((await service.readNativeTask('human','brand',taskId)).candidate.title,produced.title)
assert.equal((await service.readNativeTask('human','brand',taskId)).contextState,'was_current')
for(const field of ['name','description'] as const){
  const original=facts[field];facts[field]='Changed '+field
  const live=await app.runtime.get(actor,taskId,{history:true})
  assert.notEqual(live.calls[0].result.contextDigest,fixedContext.contextDigest,'Core returns current authoritative facts digest without a revision conflict')
  const changed=await service.readNativeTask('human','brand',taskId)
  assert.equal(changed.contextState,'stale')
  assert.equal(changed.candidate.title,produced.title)
  assert.equal(changed.contextSnapshot.contextDigest,fixedContext.contextDigest)
  assert.equal(changed.contextSnapshot.brand[field],original,'history remains the original immutable snapshot')
  facts[field]=original
}
assert.equal((await service.readNativeTask('human','brand',taskId)).contextState,'was_current')
const saved=await service.adoptNativeCandidate('human','brand',taskId,body)
assert.equal(saved.receipt.id,'revision-saved');assert.equal(saves,1)
// Real Core AgentRuntime.get invokes real ContextAssembler revalidation and fails.
await assert.rejects(()=>app.runtime.get(actor,taskId,{history:true}),(e:any)=>e.status===409)
const historical=await service.readNativeTask('human','brand',taskId)
assert.equal(historical.candidate.contextState,'stale');assert.equal(historical.candidate.title,produced.title);assert.equal(historical.adoption.receipt.id,'revision-saved')
assert.equal(historical.contextSnapshot.intent.expectedRevision,binding.expectedRevision)
assert.equal(historical.contextSnapshot.source.sourceRevision,source.sourceRevision)
const beforeReplay=historyReads
assert.equal((await service.adoptNativeCandidate('human','brand',taskId,body)).receipt.id,'revision-saved')
assert.equal(historyReads,beforeReplay,'receipt-first retry never calls Core history revalidation')
await assert.rejects(()=>service.adoptNativeCandidate('human','brand',taskId,{...body,artifactDigest:'0'.repeat(64)}),/creative_request_key_reused/)
assert.equal(historyReads,beforeReplay);assert.equal(saves,1)
const priorReceiptReads=receiptReads
await assert.rejects(()=>service.adoptNativeCandidate('human','brand','22222222-2222-4222-8222-222222222222',body),/Task not found/)
assert.equal(receiptReads,priorReceiptReads,'task ownership precedes receipt lookup')
const fixedOwner=task.trusted_context.owner
task.trusted_context.owner={...fixedOwner,subjectId:'forged'}
await assert.rejects(()=>service.adoptNativeCandidate('human','brand',taskId,body),/Host context access denied/)
assert.equal(receiptReads,priorReceiptReads,'immutable Host identity precedes receipt lookup')
task.trusted_context.owner=fixedOwner
revoked=true;await assert.rejects(()=>service.adoptNativeCandidate('human','brand',taskId,body),/ai_access_denied/);revoked=false
// A distinct, never-adopted task with a stale fixed revision still fails closed.
task.id='22222222-2222-4222-8222-222222222222';request.task_id=task.id;calls[0].task_id=task.id;receipt=null
await assert.rejects(()=>service.adoptNativeCandidate('human','brand',task.id,body),/creative_revision_conflict/);assert.equal(saves,1)
fault=Object.assign(new Error('core_status_code_conflict'),{statusCode:409})
assert.equal((await service.readNativeTask('human','brand',task.id)).candidate.contextState,'stale')
fault=Object.assign(new Error('content_unavailable'),{statusCode:503})
await assert.rejects(()=>service.readNativeTask('human','brand',task.id),/content_unavailable/)
fault=null
for(const input of [{adaptToBrand:true},{kind:'creative',adaptToBrand:'true'},{adaptToBrand:'false'}]){
  await assert.rejects(()=>service.createNativeTask('human','brand',input),/sku_confirmation_required_use_sku_proposal|invalid_input/)
}
assert.match(readFileSync('src/lib/ai-native/autopilot.ts','utf8'),/SKU 决策必须由人工确认；空目录也须人工确认/)
assert.doesNotMatch(readFileSync('src/lib/ai-native/autopilot.ts','utf8'),/无需逐步人工批准/)
assert.equal(dispatches,0)
delete (globalThis as any).amcNativeHost
console.log('PASS real Core TaskStore/HostTaskContext/AgentRuntime/ContextAssembler: saved history snapshot, receipt-first replay, payload conflict, identity/revocation, stale new adoption, status/statusCode and pre-dispatch normalization')
