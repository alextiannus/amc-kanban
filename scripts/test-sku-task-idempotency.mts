import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import ts from 'typescript'
import * as contract from '../src/lib/ai-native/contract.ts'

// PGlite runs PostgreSQL's actual JSONB serialization and the production store's
// SQL. Core dispatch/context are controlled ports; no model or external DB runs.
const compile=(path:string,deps:Record<string,any>)=>{
  const source=process.env.TASK5_BASELINE?execFileSync('git',['show',`${process.env.TASK5_BASELINE}:${path}`],{encoding:'utf8'}):readFileSync(path,'utf8')
  const mod={exports:{} as any}
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports)
  return mod.exports
}
const db=new PGlite(),actor=contract.actorFor('brand','human')
let connections=0,dispatches=0,created=0,contextReads=0,runChecks=0,revoked=false,runEnabled=true,contextAvailable=true
let failure:'none'|'before_dispatch'|'accepted_response'|'index_update'='none'
let hiddenRequestKey='',hiddenReads=0
const query=async(sql:string,args?:any[])=>{
  if(sql.trim().startsWith('CREATE'))return (await db.exec(sql)).at(-1)!
  return db.query(sql,args)
}
const pool:any={
  query:async(sql:string,args?:any[])=>{
    if(hiddenReads&&sql.includes('AND request_key=$3')&&args?.[2]===hiddenRequestKey){hiddenReads--;return {rows:[]}}
    if(failure==='index_update'&&sql.startsWith('UPDATE amc_ai_requests SET task_id')){failure='none';throw Error('index_update_lost')}
    return query(sql,args)
  },
  connect:async()=>{connections++;return {query,release:()=>{}}},
}
const store=compile('src/lib/ai-native/store.ts',{'./contract':contract})
await store.initializeHost(pool)
const revision='a'.repeat(64),decisionDigest='d'.repeat(64),runId='b'.repeat(64)
const binding={brandId:'brand',creativeId:'idea',month:'2026-11',expectedRevision:revision,catalogDigest:'c'.repeat(64),sourceRevision:'source-1',sourceDigest:'e'.repeat(64)}
const tasks=new Map<string,any>()
const getTask=async(a:any,id:string)=>{
  const task=[...tasks.values()].find(t=>t.id===id&&t.actor.scopeId===a.scopeId&&t.actor.subjectId===a.subjectId)
  if(!task)throw contract.nativeError('task_not_found',404)
  return task
}
const app:any={
  tasks:{get:getTask,findRequest:async(a:any,_capability:string,key:string)=>{const t=tasks.get(key);return t&&t.actor.scopeId===a.scopeId&&t.actor.subjectId===a.subjectId?{id:t.id}:null}},
  runtime:{state:async(a:any,id:string)=>({...await getTask(a,id),status:'queued',version:1,updated_at:'fixture'})},
  dispatcher:{invoke:async(_name:string,input:any,{actor:a,callId}:any)=>{
    dispatches++
    if(failure==='before_dispatch'){failure='none';throw Error('dispatch_unavailable')}
    if(tasks.has(callId))return {id:tasks.get(callId).id}
    const row=await store.intentBy(pool,a,'request_key',callId)
    const task={id:randomUUID(),actor:a,input,trusted_context:{reference:row.id}}
    tasks.set(callId,task);created++
    if(failure==='accepted_response'){failure='none';throw Error('accepted_response_lost')}
    return {id:task.id}
  }},
}
;(globalThis as any).amcNativeHost=Promise.resolve({pool,app,tools:[],modelRevision:1})
const service=compile('src/lib/ai-native/service.ts',{
  './contract':contract,'./store':store,'./autopilot-capabilities':{AUTOPILOT_TOOLS:[]},
  './application':{requireActor:async()=>{if(revoked)throw contract.nativeError('ai_access_denied',403)}},
  './autopilot':{autopilotRun:async()=>{runChecks++;if(!runEnabled)throw contract.nativeError('autopilot_disabled',409)}},
  '../model-management/registry':{runtimeConfig:async()=>({version:1})},
  '../brand-plan/creativeSkuDecision':{
    readSkuContext:async()=>{contextReads++;if(!contextAvailable)throw Error('source_unavailable');return {binding,current:{canOverwrite:true}}},
    readBoundSkuContext:async()=>{if(!contextAvailable)throw Error('source_unavailable')},
  },
})
const bodyFor=(kind:string,key:string)=>({kind,creativeId:'idea',month:'2026-11',expectedRevision:revision,requestKey:key,goal:'  SKU task  ',...(kind==='creative_adaptation'?{decisionDigest}:{})})
const rowFor=(key:string)=>store.intentBy(pool,actor,'request_key',key)
const conflict=(fn:()=>Promise<unknown>)=>assert.rejects(fn,(e:any)=>e.code==='request_key_reused'&&e.statusCode===409)

try{
  for(const kind of ['sku_proposal','creative_adaptation'])for(const autopilot of [false,true])for(const mode of ['none','before_dispatch','accepted_response','index_update'] as const){
    contextAvailable=true
    const key=`${kind}-${autopilot?'auto':'manual'}-${mode}`,body=bodyFor(kind,key),run=autopilot?runId:undefined
    const beforeCreated=created
    failure=mode
    if(mode==='none')await service.createNativeTask('human','brand',body,false,run)
    else await assert.rejects(()=>service.createNativeTask('human','brand',body,false,run),/dispatch_unavailable|accepted_response_lost|index_update_lost/)
    const saved=await rowFor(key),before={dispatches,connections,contextReads,runChecks}
    assert.notEqual(saved.digest,contract.digest(saved.intent),'actual JSONB key order differs from the original persisted digest')
    assert.equal(saved.task_id===null,mode!=='none')
    contextAvailable=false // Replay must keep the admitted snapshot even after live source changes.
    const replay=await service.createNativeTask('human','brand',{...body,goal:'SKU task'},false,run)
    assert.equal(replay.id,tasks.get(key).id)
    assert.equal(dispatches,before.dispatches+(mode==='before_dispatch'?1:0))
    assert.equal(created,beforeCreated+1,'every loss window produces exactly one task')
    assert.equal(connections,before.connections,'matching replay reuses the existing admission')
    assert.equal(contextReads,before.contextReads,'no live source read on an admitted retry')
    assert.equal(runChecks,before.runChecks+(autopilot?1:0),'autopilot authority is still rechecked')
    const after=await rowFor(key)
    assert.equal(after.task_id,replay.id,'lost task_id index is repaired')
    assert.equal(after.digest,saved.digest,'stored historical digest is never rewritten')
    assert.deepEqual(after.intent,saved.intent)
    for(const changed of [{goal:'different'},{creativeId:'other'},{month:'2026-12'},{expectedRevision:'f'.repeat(64)},{decisionDigest:'0'.repeat(64)},{kind:kind==='sku_proposal'?'creative_adaptation':'sku_proposal',decisionDigest}]){
      await conflict(()=>service.createNativeTask('human','brand',{...body,...changed},false,run))
    }
    await conflict(()=>service.createNativeTask('human','brand',body,false,autopilot?undefined:runId))
    if(autopilot)await conflict(()=>service.createNativeTask('human','brand',body,false,'f'.repeat(64)))
    assert.equal(dispatches,before.dispatches+(mode==='before_dispatch'?1:0),'conflicts cannot dispatch')
  }

  // Old records have the previous order-sensitive digest, arbitrary insertion
  // order and nested JSON evidence. Compare values, retain the original record.
  for(const kind of ['sku_proposal','creative_adaptation'])for(const autopilot of [false,true]){
    const key=`legacy-${kind}-${autopilot}`,body=bodyFor(kind,key)
    const legacy:any={kind,sourceEvidence:{timeline:[{visual:{movement:'pan',shot:'wide'},id:'shot-1'},{visual:{movement:'hold',shot:'close'},id:'shot-2'}],origin:{title:'Original',id:'source'}},...binding,requestKey:key,artifactPath:`work/${contract.digest([actor,key])}.json`,goal:'SKU task',userId:'human',...(autopilot?{autopilotRunId:runId}:{}),...(kind==='creative_adaptation'?{decisionDigest}:{})}
    const old=await store.admitIntent(pool,actor,legacy)
    assert.notEqual(contract.digest(legacy),contract.digest(old.intent))
    assert.notDeepEqual(Object.keys(old.intent.sourceEvidence.origin),Object.keys(legacy.sourceEvidence.origin),'nested objects really passed through JSONB')
    assert.equal((await store.admitIntent(pool,actor,old.intent)).id,old.id,'store collision path also compares normalized SKU payloads')
    assert.equal((await rowFor(key)).digest,old.digest)
    for(const change of [{brandId:'other'},{userId:'other'},{goal:'changed'},{artifactPath:'work/other.json'},{creativeId:'other'},{month:'2026-12'},{expectedRevision:'f'.repeat(64)},{catalogDigest:'f'.repeat(64)},{sourceRevision:'source-2'},{sourceDigest:'f'.repeat(64)},{decisionDigest:'f'.repeat(64)},{autopilotRunId:autopilot?undefined:runId},{requireMaterials:true},{sourceEvidence:{...legacy.sourceEvidence,origin:{...legacy.sourceEvidence.origin,title:'Changed'}}},{sourceEvidence:{...legacy.sourceEvidence,timeline:[...legacy.sourceEvidence.timeline].reverse()}}]){
      await conflict(()=>store.admitIntent(pool,actor,{...legacy,...change}))
    }
    contextAvailable=false
    const replay=await service.createNativeTask('human','brand',body,false,autopilot?runId:undefined)
    assert.equal((await rowFor(key)).task_id,replay.id)
    assert.equal((await rowFor(key)).digest,old.digest)
    assert.deepEqual((await rowFor(key)).intent,old.intent)
  }

  // A concurrent admission can appear after both service lookups. Its original
  // order may differ, so the store's locked comparison must also be JSONB-safe.
  const raceBody=bodyFor('sku_proposal','sku-late-admission'),raceIntent:any={kind:'sku_proposal',...binding,userId:'human',goal:'SKU task',requestKey:raceBody.requestKey,artifactPath:`work/${contract.digest([actor,raceBody.requestKey])}.json`}
  const raced=await store.admitIntent(pool,actor,raceIntent)
  hiddenRequestKey=raceBody.requestKey;hiddenReads=2;contextAvailable=true
  const racedTask=await service.createNativeTask('human','brand',raceBody)
  assert.equal(hiddenReads,0);assert.equal((await rowFor(raceBody.requestKey)).task_id,racedTask.id)
  assert.equal((await rowFor(raceBody.requestKey)).digest,raced.digest)

  const original:any={kind:'brand_brief',brandId:'brand',userId:'human',goal:'Legacy brief',requestKey:'non-sku-legacy',artifactPath:'work/brief.json'}
  const nonSku=await store.admitIntent(pool,actor,original)
  assert.equal((await store.admitIntent(pool,actor,original)).id,nonSku.id)
  assert.notEqual(nonSku.digest,contract.digest(nonSku.intent))
  await conflict(()=>store.admitIntent(pool,actor,nonSku.intent))
  assert.notEqual(contract.digest({longKey:1,a:2}),contract.digest({a:2,longKey:1}),'global digest stays order-sensitive for existing contracts')
  const existingBody=bodyFor('creative_adaptation','creative_adaptation-auto-none'),beforeRevoked={dispatches,created}
  runEnabled=false
  await assert.rejects(()=>service.createNativeTask('human','brand',existingBody,false,runId),/autopilot_disabled/)
  runEnabled=true;revoked=true
  await assert.rejects(()=>service.createNativeTask('human','brand',existingBody,false,runId),/ai_access_denied/)
  assert.deepEqual({dispatches,created},beforeRevoked)
  console.log('PASS actual PGlite JSONB and production admission SQL: proposal/adaptation, manual/autopilot, legacy digests, recursive object order, array/content conflicts, all task_id recovery windows, admission race and revoked authority')
}finally{
  delete (globalThis as any).amcNativeHost
  await db.close()
}
