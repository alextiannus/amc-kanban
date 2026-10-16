import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {CapabilityDispatcher,defineCapability} from '@immedi/iaic-core/capabilities/index.js'
import * as contract from '../src/lib/ai-native/contract.ts'
import * as sku from '../src/lib/brand-plan/creativeSkuContract.ts'
import * as guards from '../src/lib/ai-native/model-guards.ts'
const compile=(path:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports);return mod.exports}
const runId='a'.repeat(64),taskId='11111111-1111-4111-8111-111111111111',actor=contract.actorFor('brand','human')
let accountPresent=true,dispatches=0,grants=0,receiptReads=0,reads=0,saves=0,config:any,lastIntent:any
const active={id:runId,brand_id:'brand',owner_id:'human',enabled:true,current_owner:'human',current_account:'account',account_id:'account',daily_limit:1,current_limit:1}
let run={...active}
const runPool={query:async(_sql:string,args:any[])=>({rows:args[0]===run.id&&args[1]===run.brand_id&&args[2]===run.owner_id?[run]:[]})}
const autopilot=compile('src/lib/ai-native/autopilot.ts',{'./contract':contract,'./autopilot-store':{autopilotDb:async()=>runPool,requireAutopilotOwner:async()=>{}},'../prisma':{prisma:{socialAccount:{findFirst:async({where}:any)=>accountPresent&&where.id==='account'&&where.brandId==='brand'?{id:'account'}:null}}}})
const facts={id:'brand',name:'Brand',knowledge:{menuItems:[]}},catalog=sku.skuCatalog(facts)
const binding={brandId:'brand',creativeId:'idea',month:'2026-11',expectedRevision:'b'.repeat(64),catalogDigest:sku.catalogDigest(catalog),sourceRevision:null,sourceDigest:null}
const decision=sku.confirmSkuDecision({...binding,selectedSkuIds:[],recommendations:[]},catalog,null,'human',binding.expectedRevision)
const ctx={binding,facts,catalog,source:null,current:{canOverwrite:true,current:{skuDecision:decision}}}
const skuDeps={readSkuContext:async()=>ctx,readBoundSkuContext:async(_actor:any,b:any)=>{sku.assertConfirmedDecision(decision,b,catalog,null);return ctx}}
const workflow=compile('src/lib/ai-native/sku-workflow.ts',{'./contract':contract,'../brand-plan/creativeSkuDecision':skuDeps,'../brand-plan/creativeSkuContract':sku})
const rows=new Map<string,any>()
const store={intentBy:async(_p:any,_a:any,field:string,key:string)=>{const row=field==='id'?[...rows.values()].find(r=>r.id===key):rows.get(key);if(!row)throw contract.nativeError('not_found',404);return row},intentForTask:async()=>({intent:lastIntent}),admitIntent:async(_p:any,_a:any,intent:any)=>{
  lastIntent=JSON.parse(JSON.stringify(intent));const row={id:'intent-record',intent:lastIntent,digest:contract.digest(lastIntent),task_id:taskId};rows.set(intent.requestKey,row);return row
}}
const pool={query:async()=>({rows:[]})}
const app:any={tasks:{get:async()=>({id:taskId,trusted_context:{reference:'intent-record'}})},runtime:{state:async()=>({id:taskId,status:'succeeded',input:{goal:'Adapt'},version:1})},dispatcher:{invoke:async()=>{dispatches++;return {id:taskId}}},ledger:{taskUsage:async()=>({platformUnits:0,requests:0}),grant:async()=>{grants++}},scope:async()=>actor}
;(globalThis as any).amcNativeHost=Promise.resolve({pool,app,tools:[],modelRevision:1})
const service=compile('src/lib/ai-native/service.ts',{
  './contract':contract,'./store':store,'./autopilot':autopilot,'./application':{requireActor:async()=>{}},'../model-management/registry':{runtimeConfig:async()=>({version:1})},'./autopilot-capabilities':{AUTOPILOT_TOOLS:[]},
  '../brand-plan/creativeSkuDecision':skuDeps,'./sku-workflow':workflow,'./recommendations':{adaptedScriptReceipt:async()=>{receiptReads++;return null}},
  '../brand-plan/creativeRevisions':{saveCreativeRevision:async(...args:any[])=>{saves++;assert.equal(args[6].autopilotRunId,runId);return {receipt:{id:'saved',contentHash:'hash'}}},readCreativeRevisions:async()=>({revisions:[{contentHash:'hash'}]})},
})
const body={...binding,kind:'creative_adaptation',decisionDigest:decision.digest,requestKey:'autopilot-confirmed',goal:'Adapt after human confirmation'}
await service.createNativeTask('human','brand',body,false,runId)
assert.equal(lastIntent.autopilotRunId,runId,'admission must persist the trusted run binding across JSON serialization')
const application=compile('src/lib/ai-native/application.ts',{
  './runtime-application.mjs':{openApplication:async(c:any)=>{config=c;return app}},'./contract':contract,'./store':store,'./autopilot':autopilot,'./model-guards':guards,
  './autopilot-capabilities':{AUTOPILOT_TOOLS:[],autopilotCapabilities:()=>[]},'@immedi/iaic-core/capabilities/index.js':{defineCapability:(v:any)=>v},
  'node:crypto':await import('node:crypto'),'node:path':await import('node:path'),
})
await application.composeApplication(pool,{}, {version:'fixture',authorize:async()=>true})
const bound=await config.hostContext.bind({actor,requestKey:body.requestKey})
assert.equal(bound.projection.autopilotRunId,runId)
assert.equal((await config.hostContext.resolve({actor,binding:{reference:bound.reference}})).autopilotRunId,runId)
await service.createNativeTask('human','brand',body,false,runId)
assert.equal(dispatches,1,'same trusted run replays without a new task')
const policy=()=>config.executionPolicy.check({actor,taskId,capability:{name:'agent.work',implementation:{kind:'agent'}},input:{},phase:'agent'})
const admissionPolicy=()=>config.executionPolicy.check({actor,callId:body.requestKey,capability:{name:'agent.work',implementation:{kind:'agent'}},input:{},phase:'admission'})
let modelResolutions=0
const coreAdmission=new CapabilityDispatcher({capabilities:[defineCapability({name:'agent.work',description:'Fixture admission',input:{type:'object'},output:{type:'object'},effect:'write',retry:'idempotent',authorize:async()=>true,implementation:{kind:'agent',instructions:'Fixture',tools:[],verify:async()=>true}})],tasks:{create:async()=>{modelResolutions++;return {id:taskId,status:'queued'}}},executionPolicy:config.executionPolicy})
await coreAdmission.invoke('agent.work',{}, {actor,callId:body.requestKey})
assert.equal(modelResolutions,1)
assert.equal((await admissionPolicy()).allowed,true);assert.equal(grants,0)
assert.equal((await policy()).allowed,true);assert.equal(grants,1)
for(const mutation of [{enabled:false},{current_owner:'other'},{current_account:'other'},{brand_id:'other'}]){
  run={...active,...mutation};const before={dispatches,grants,receiptReads}
  assert.equal((await policy()).allowed,false)
  assert.equal((await admissionPolicy()).allowed,false,'Core admission rechecks after intent persistence and before model resolution')
  await assert.rejects(()=>coreAdmission.invoke('agent.work',{}, {actor,callId:body.requestKey}))
  assert.equal(modelResolutions,1,'the real Core dispatcher must not enter model resolution after revocation')
  await assert.rejects(()=>service.createNativeTask('human','brand',{...body,requestKey:'disabled-new'},false,runId),/autopilot_/)
  // Direct adoption supplies no run parameter: the durable intent must enforce it.
  await assert.rejects(()=>service.adoptNativeCandidate('human','brand',taskId,{requestKey:'adopt-disabled',artifactDigest:'c'.repeat(64)}),/autopilot_/)
  assert.deepEqual({dispatches,grants,receiptReads},before);assert.equal(saves,0)
}
run={...active};accountPresent=false
assert.equal((await policy()).allowed,false);assert.equal(grants,1)
await assert.rejects(()=>service.adoptNativeCandidate('human','brand',taskId,{requestKey:'adopt-no-account',artifactDigest:'c'.repeat(64)}),/autopilot_account_unavailable/)
accountPresent=true
await assert.rejects(()=>service.createNativeTask('human','brand',body),/request_key_reused/,'an interactive retry cannot strip the persisted run')
const produced={...binding,kind:'creative_adaptation',decisionDigest:decision.digest,contextDigest:contract.digest(facts),mode:'ordinary_brand_content',notice:'普通品牌内容，非爆款复刻',title:'Brand story',aiCaption:'Brand',materialRequirements:['Film brand'],shots:[{contractVersion:2,sourceShotId:null,skuIds:[],visualDescription:'Brand shop',subjectAction:'Open door',spokenText:'Meet Brand',captionMode:'mirror_spoken',overlayText:'Brand',soundDesign:'Continuous instrumental bed',transition:'Fade out',narrativePurpose:'Introduce brand',continuityRequirements:['Keep the same doorway'],sourcePreservation:{hookRole:'not_applicable',narrativeRole:'preserved',pacingRole:'preserved',changeReasons:[]}}]}
const artifact={path:lastIntent.artifactPath,digest:contract.digest(produced),revision:1}
app.runtime.get=async()=>{reads++;return {status:'succeeded',result:{artifacts:[artifact]},calls:[]}}
app.workspace={read:async()=>({content:JSON.stringify(produced)})}
await service.adoptNativeCandidate('human','brand',taskId,{requestKey:'adopt-enabled',artifactDigest:artifact.digest})
assert.equal(saves,1);assert.equal(reads,1);assert.equal(grants,1)
delete (globalThis as any).amcNativeHost
console.log('PASS actual admission, JSON intent binding, executionPolicy closure and autopilotRun gates: disabled/owner/account/brand reject before meter grant or adoption; empty-catalog confirmed adaptation retains run provenance')
