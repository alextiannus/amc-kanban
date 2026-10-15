import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as contract from '../src/lib/ai-native/contract.ts'
import * as sku from '../src/lib/brand-plan/creativeSkuContract.ts'
const compile=(path:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports);return mod.exports}
let revoked=false,currentRevision='a'.repeat(64),dispatches=0,lastIntent:any,allowedTools:string[]=[]
const facts={id:'brand',name:'Brand',knowledge:{menuItems:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}]}},catalog=sku.skuCatalog(facts)
const source:any={inspirationCreativeId:'cre_source',sourceRevision:'s1',sourceDigest:'b'.repeat(64),evidenceStatus:'full_source',timeline:[{id:'shot-1',order:1,startSec:0,endSec:3}]}
const binding=()=>({brandId:'brand',creativeId:'idea',month:'2026-11',expectedRevision:currentRevision,catalogDigest:sku.catalogDigest(catalog),sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest})
let confirmed:any=null
const ctx=()=>({binding:binding(),current:{canOverwrite:!revoked,current:{skuDecision:confirmed}},catalog,facts,source})
const skuDeps={readSkuContext:async()=>ctx(),readBoundSkuContext:async(_actor:any,b:any)=>{
  if(b.expectedRevision!==currentRevision)throw contract.nativeError('creative_revision_conflict',409)
  sku.checkSkuBinding(b,catalog,source)
  if(b.decisionDigest)sku.assertConfirmedDecision(confirmed,b,catalog,source)
  return ctx()
}}
const workflow=compile('src/lib/ai-native/sku-workflow.ts',{'../brand-plan/creativeSkuDecision':skuDeps,'../brand-plan/creativeSkuContract':sku,'./contract':contract})
const rows=new Map<string,any>(),taskId='11111111-1111-4111-8111-111111111111'
const pool={query:async()=>({rows:[]})},app={runtime:{state:async()=>({id:taskId,status:'queued',input:{goal:'SKU'},version:1,updated_at:'now'})},dispatcher:{invoke:async(_name:string,input:any)=>{dispatches++;allowedTools=input.allowedTools;return {id:taskId}}}}
;(globalThis as any).amcNativeHost=Promise.resolve({pool,app,tools:['amc.context','amc.creative','amc.library','amc.operations','my_write_workspace'],modelRevision:1})
const service=compile('src/lib/ai-native/service.ts',{
  './contract':contract,'./application':{requireActor:async()=>{if(revoked)throw contract.nativeError('ai_access_denied',403)}},'../model-management/registry':{runtimeConfig:async()=>({version:1})},
  './autopilot-capabilities':{AUTOPILOT_TOOLS:[]},'../brand-plan/creativeSkuDecision':skuDeps,'./sku-workflow':workflow,
  './recommendations':{adaptedScriptReceipt:async()=>null},
  './store':{intentBy:async(_p:any,_a:any,_f:any,key:string)=>{const r=rows.get(key);if(!r)throw contract.nativeError('not_found',404);return r},admitIntent:async(_p:any,_a:any,intent:any)=>{lastIntent=intent;const r={id:'request',intent,digest:contract.digest(intent),task_id:taskId};rows.set(intent.requestKey,r);return r},intentForTask:async()=>({intent:lastIntent})},
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
confirmed=sku.confirmSkuDecision({...binding(),selectedSkuIds:['a'],recommendations:[recommendation]},catalog,source,'human',currentRevision)
await service.createNativeTask('human','brand',{...body,kind:'creative_adaptation',requestKey:'adapt-confirmed',decisionDigest:confirmed.digest})
const adaptationContext=await workflow.skuTaskContext(lastIntent)
assert.deepEqual(adaptationContext.productCatalog.map((s:any)=>s.id),['a'])
assert.equal(adaptationContext.decision.digest,confirmed.digest)
const produced={...binding(),kind:'creative_adaptation',decisionDigest:confirmed.digest,contextDigest:contract.digest(facts),mode:'source_adaptation',title:'Alpha story',aiCaption:'',materialRequirements:['Film Alpha'],shots:[{sourceShotId:'shot-1',skuIds:['a'],visualDescription:'Alpha',subjectAction:'Present Alpha',voiceover:'',onScreenText:'',sound:'',transition:''}]}
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
delete (globalThis as any).amcNativeHost
console.log('PASS SKU task admission, restricted tools, selected-only context, validated artifact, replay and revoked access')
