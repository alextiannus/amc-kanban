import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as contract from '../src/lib/ai-native/contract.ts'
import * as sku from '../src/lib/brand-plan/creativeSkuContract.ts'
import * as fidelity from '../src/lib/brand-plan/creativeFidelity.ts'
const compile=(path:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports);return mod.exports}
let revoked=false,currentRevision='a'.repeat(64),dispatches=0,lastIntent:any,allowedTools:string[]=[],saves=0,savedReceipt:any=null
const facts={id:'brand',name:'Brand',knowledge:{menuItems:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}]}},catalog=sku.skuCatalog(facts)
const source:any={inspirationCreativeId:'cre_source',sourceRevision:'s1',sourceDigest:'b'.repeat(64),evidenceStatus:'full_source',timeline:[{id:'shot-1',order:1,startSec:0,endSec:3}]}
const binding=()=>({brandId:'brand',creativeId:'idea',month:'2026-11',expectedRevision:currentRevision,catalogDigest:sku.catalogDigest(catalog),sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest})
let confirmed:any=null
const ctx=()=>({binding:binding(),current:{canOverwrite:!revoked,current:{skuDecision:confirmed}},catalog,facts,source})
const skuDeps={readSkuContext:async()=>ctx(),readBoundSkuContext:async(_actor:any,b:any)=>{
  if(b.expectedRevision!==currentRevision)throw contract.nativeError('creative_revision_conflict',409)
  sku.checkSkuBinding(b,catalog,source)
  if('decisionDigest' in b)sku.assertConfirmedDecision(confirmed,b,catalog,source)
  return ctx()
}}
const workflow=compile('src/lib/ai-native/sku-workflow.ts',{'../brand-plan/creativeSkuDecision':skuDeps,'../brand-plan/creativeSkuContract':sku,'./contract':contract})
const rows=new Map<string,any>(),taskId='11111111-1111-4111-8111-111111111111'
const pool={query:async()=>({rows:[]})},app={runtime:{state:async()=>({id:taskId,status:'queued',input:{goal:'SKU'},version:1,updated_at:'now'})},dispatcher:{invoke:async(_name:string,input:any)=>{dispatches++;allowedTools=input.allowedTools;return {id:taskId}}}}
;(globalThis as any).amcNativeHost=Promise.resolve({pool,app,tools:['amc.context','amc.creative','amc.library','amc.operations','my_write_workspace'],modelRevision:1})
const service=compile('src/lib/ai-native/service.ts',{
  './conversation-status':{wakeConversationWorker:()=>{}},
  '../brand-plan/creativeVisibility':{creativeIsSelected:()=>true},
  '../brand-plan/creativeFidelity':fidelity,
  './contract':contract,'./application':{requireActor:async()=>{if(revoked)throw contract.nativeError('ai_access_denied',403)}},'../model-management/registry':{runtimeConfig:async()=>({version:1})},
  './autopilot-capabilities':{AUTOPILOT_TOOLS:[]},'../brand-plan/creativeSkuDecision':skuDeps,'./sku-workflow':workflow,
  './recommendations':{adaptedScriptReceipt:async()=>savedReceipt},
  './autopilot':{autopilotRun:async()=>({})},
  '../brand-plan/creativeRevisions':{readCreativeQualityReview:async()=>quality,saveCreativeRevision:async(...args:any[])=>{saves++;assert(args[6].skuBinding.decisionDigest);return {receipt:{id:'saved-adaptation',contentHash:'saved-hash',content:{id:'idea',adaptationStatus:'adapted'}}}},readCreativeRevisions:async()=>({revisions:[{contentHash:'saved-hash'}]})},
  './store':{intentBy:async(_p:any,_a:any,_f:any,key:string)=>{const r=rows.get(key);if(!r)throw contract.nativeError('not_found',404);return r},admitIntent:async(_p:any,_a:any,intent:any)=>{lastIntent=intent;const r={id:'request',intent,request_key:intent.requestKey,digest:contract.digest(intent),task_id:taskId};rows.set(intent.requestKey,r);return r},intentForTask:async()=>({intent:lastIntent})},
})
const body={kind:'sku_proposal',creativeId:'idea',month:'2026-11',expectedRevision:currentRevision,goal:'Suggest SKU roles',requestKey:'proposal-one'}
await service.createNativeTask('human','brand',body)
assert.equal(lastIntent.kind,'sku_proposal');assert.equal(lastIntent.catalogDigest,binding().catalogDigest)
assert.deepEqual(allowedTools,['amc.context','my_write_workspace'])
const proposalContext=await workflow.skuTaskContext(lastIntent)
assert.equal(proposalContext.productCatalog.length,2)
assert.equal(proposalContext.artifactContract.example.finalScript,undefined)
const recommendation={skuId:'a',skuName:'Alpha',roles:['hero'],rationale:'Fits action',sourceShotIds:['shot-1']}
await assert.rejects(()=>service.createNativeTask('human','brand',{...body,kind:'creative_adaptation',requestKey:'adapt-no-decision'}),/sku_confirmation_required/)
const beforeInvalid=dispatches
for(const decisionDigest of ['', ' ', 'a', 'g'.repeat(64), 'a'.repeat(65)]){
  await assert.rejects(()=>service.createNativeTask('human','brand',{...body,kind:'creative_adaptation',requestKey:'adapt-invalid-digest',decisionDigest}),/sku_confirmation_required/)
}
assert.equal(dispatches,beforeInvalid,'invalid digest is rejected before dispatch or metering')
confirmed=sku.confirmSkuDecision({...binding(),selectedSkuIds:['a'],recommendations:[recommendation]},catalog,source,'human',currentRevision)
await assert.rejects(()=>service.createNativeTask('human','brand',{...body,kind:'creative_adaptation',requestKey:'adapt-wrong-digest',decisionDigest:'0'.repeat(64)}),/sku_confirmation_required/)
assert.equal(dispatches,beforeInvalid)
await service.createNativeTask('human','brand',{...body,kind:'creative_adaptation',requestKey:'adapt-confirmed',decisionDigest:confirmed.digest})
const adaptationContext=await workflow.skuTaskContext(lastIntent)
assert.deepEqual(adaptationContext.productCatalog.map((s:any)=>s.id),['a'])
assert.equal(adaptationContext.decision.digest,confirmed.digest)
const produced={...binding(),kind:'creative_adaptation',decisionDigest:confirmed.digest,contextDigest:contract.digest(facts),mode:'source_adaptation',title:'Alpha story',aiCaption:'',materialRequirements:['Film Alpha'],shots:[{contractVersion:2,sourceShotId:'shot-1',skuIds:['a'],visualDescription:'Alpha',subjectAction:'Present Alpha',spokenText:'Meet Alpha',captionMode:'mirror_spoken',overlayText:'Alpha',soundDesign:'Continuous instrumental bed',transition:'Match cut',narrativePurpose:'Introduce Alpha',continuityRequirements:['Keep the same subject'],sourcePreservation:{hookRole:'preserved',narrativeRole:'preserved',pacingRole:'preserved',changeReasons:[]}}]}
const quality=fidelity.completeFidelityAttempt(fidelity.beginFidelityAttempt(null,source,sku.adaptationFrom(JSON.stringify(produced),{...lastIntent,decisionDigest:confirmed.digest},catalog,source,confirmed),{path:lastIntent.artifactPath,revision:1,digest:'artifact-digest'}),{candidateDigest:'artifact-digest',dimensions:fidelity.FIDELITY_DIMENSIONS.map(key=>({key,status:'passed',issues:[]}))})
assert.equal((await workflow.validateSkuArtifact(JSON.stringify(produced),lastIntent)).result.shots.length,1)
await assert.rejects(()=>workflow.validateSkuArtifact(JSON.stringify({...produced,title:'Beta'}),lastIntent),/unselected_sku/)
const dispatched=dispatches;currentRevision='f'.repeat(64)
await service.createNativeTask('human','brand',body)
assert.equal(dispatches,dispatched,'idempotent task admission replays after creative changes')
await assert.rejects(()=>service.createNativeTask('human','brand',{...body,goal:'different'}),/request_key_reused/)
await assert.rejects(()=>service.createNativeTask('human','brand',{kind:'creative',adaptToBrand:true}),/sku_confirmation_required/)
lastIntent={...body,kind:'creative',adaptToBrand:true,brandId:'brand',artifactPath:'work/legacy.json'}
;(app.runtime as any).get=async()=>({status:'succeeded',result:{artifacts:[{path:lastIntent.artifactPath,digest:'legacy-digest'}]},calls:[]})
await assert.rejects(()=>service.adoptNativeCandidate('human','brand',taskId,{requestKey:'adopt-legacy',artifactDigest:'legacy-digest'}),/sku_confirmation_required_use_creative_adaptation/)
revoked=true;await assert.rejects(()=>service.createNativeTask('human','brand',body),/ai_access_denied/)
revoked=false;currentRevision='a'.repeat(64)
// Exercise the actual application verifier closure, not a substitute verifier.
const libraryModule=compile('src/lib/ai-native/library.ts',{'./contract':contract,'../brand-plan/creativeRevisionContract':await import('../src/lib/brand-plan/creativeRevisionContract.ts')})
let configured:any,artifactContent=''
const application=compile('src/lib/ai-native/application.ts',{
  '../brand-plan/creativeFidelity':fidelity,'../brand-plan/creativeRevisions':{prepareCreativeQualityReview:async()=>quality},
  './runtime-application.mjs':{openApplication:async(config:any)=>{configured=config;return {workspace:{read:async()=>({content:artifactContent})}}}},
  './contract':contract,'./store':{intentBy:async()=>({intent:lastIntent,task_id:taskId})},'./library':libraryModule,'./sku-workflow':workflow,
  './autopilot-capabilities':{AUTOPILOT_TOOLS:[],autopilotCapabilities:()=>[]},
  '@immedi/iaic-core/capabilities/index.js':{defineCapability:(v:any)=>v},'node:crypto':await import('node:crypto'),'node:path':await import('node:path'),
})
await application.composeApplication(pool,{}, {skillRoot:'skills',version:'fixture',authorize:async()=>true,readContext:async()=>facts})
const snapshot={libraryDigest:'c'.repeat(64),contextDigest:contract.digest(facts),sources:[{inspirationCreativeId:'cre_source'}]}
const verify=async(skill='amc-discovery/SKILL.md')=>configured.verifyOutcome({}, {artifacts:[{path:lastIntent.artifactPath}]},{actor:contract.actorFor('brand','human'),history:{calls:[
  {capability:'amc.context',status:'succeeded',result:{intent:lastIntent}},
  {capability:'assistant.skills.read',status:'succeeded',input:{id:skill}},
  {capability:'amc.library',status:'succeeded',result:snapshot},
]}})
lastIntent={kind:'creative_discovery',brandId:'brand',skuWorkflow:true,requestKey:'verify-discovery',artifactPath:'work/test.json'}
const discovery={kind:'creative_discovery',brandId:'brand',contextDigest:snapshot.contextDigest,libraryDigest:snapshot.libraryDigest,summary:'Awaiting confirmation',recommendations:[{sourceCreativeId:'cre_source',title:'Source',rationale:'Fits brand'}]}
artifactContent=JSON.stringify({...discovery,recommendations:[{...discovery.recommendations[0],planning:'legacy full script'}]})
let outcome=await verify();assert.equal(outcome.verified,false);assert.match(outcome.feedback,/ONLY sourceCreativeId, title, rationale/);assert.doesNotMatch(outcome.feedback,/requires.*planning/)
artifactContent=JSON.stringify(discovery);assert.equal((await verify()).verified,true)
lastIntent={...body,...binding(),kind:'sku_proposal',userId:'human',artifactPath:'work/test.json'}
artifactContent='{}';outcome=await verify('amc-creative/SKILL.md');assert.equal(outcome.verified,false);assert.match(outcome.feedback,/recommendations/);assert.doesNotMatch(outcome.feedback,/Return title, aiCaption/)
lastIntent={...lastIntent,kind:'creative_adaptation',decisionDigest:confirmed.digest}
artifactContent='{}';outcome=await verify('amc-creative/SKILL.md');assert.equal(outcome.verified,false);assert.match(outcome.feedback,/complete ordered shots/)
artifactContent=JSON.stringify(produced);assert.equal((await verify('amc-creative/SKILL.md')).verified,true)
// Actual executeAutopilot delegates to the same real adoption service.
lastIntent={...lastIntent,autopilotRunId:'run'}
const run:any={id:'run',enabled:true,current_owner:'human',current_account:'account',account_id:'account',daily_limit:2,current_limit:2,evidence:{adaptations:{idea:taskId}}}
let legacyTask=true,unlocks=0
const autopilotPool={connect:async()=>({query:async(sql:string)=>{if(sql.includes('unlock'))unlocks++;return {rows:[]}},release:()=>{}}),query:async(sql:string,args:any[])=>{
  if(sql.includes('SELECT r.*'))return {rows:[structuredClone(run)]}
  if(sql.includes('SET step=')){run.evidence=JSON.parse(args[2]);return {rows:[]}}
  throw Error(sql)
}}
const autopilot=compile('src/lib/ai-native/autopilot.ts',{
  '../prisma':{prisma:{socialAccount:{findFirst:async()=>({id:'account'})}}},
  './autopilot-store':{autopilotDb:async()=>autopilotPool,requireAutopilotOwner:async()=>{}},'./contract':contract,
  './service':{adoptNativeCandidate:service.adoptNativeCandidate,readNativeTask:async()=>({kind:legacyTask?'creative':'creative_adaptation',status:'succeeded',creativeId:'idea',month:'2026-11',candidate:{patch:{planning:'old one-stage'}},artifact:{path:lastIntent.artifactPath,digest:'artifact-digest'}})},
})
;(app as any).workspace={read:async()=>({content:artifactContent})}
;(app.runtime as any).get=async()=>({status:'succeeded',result:{artifacts:[{path:lastIntent.artifactPath,digest:'artifact-digest'}]},calls:[]})
for(const action of ['adapt','save_adaptation','generate']){
 const handoff=await autopilot.executeAutopilot('human','brand','run',action,{creativeId:'idea'})
 assert.equal(handoff.waitingForUser,true);assert.match(handoff.note,/handoff report and finish/);assert.equal(saves,0)
}
assert.equal(unlocks,3)
assert.match(readFileSync('src/lib/ai-native/calendar-planning.ts','utf8'),/每条仅输出 sourceCreativeId、title、rationale/)
delete (globalThis as any).amcNativeHost
console.log('PASS actual composeApplication verifier correction and executeAutopilot handoff without unauthorized production')
console.log('PASS SKU task admission, restricted tools, selected-only context, validated artifact, replay and revoked access')
