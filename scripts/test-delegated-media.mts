import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
import * as contract from '../src/lib/model-management/executionContract.ts'

const pg=new PGlite()
await pg.exec('CREATE TABLE "ModelExecutionLog" (id text)')
await pg.exec(readFileSync(new URL('../prisma/migrations/20260916190000_delegated_media/migration.sql',import.meta.url),'utf8'))
const db={$queryRawUnsafe:async(sql:string,...args:any[])=>(await pg.query(sql,args)).rows,$executeRawUnsafe:async(sql:string,...args:any[])=>(await pg.query(sql,args)).affectedRows}
let version=1,active=true,submits=0,timeout=false,failure=0,badProtocol=false
const records=new Map<string,any>(),bindings:number[]=[]
const runtime=(v=version)=>({active,version:v,selection:{defaults:{speech_synthesis:'voice-'+v},exceptions:{}},models:[{id:'voice-'+v,protocol:'minimax',legacyId:'kanban:voice-'+v,definition:{capabilities:['speech_synthesis'],inputCapabilities:['audio_output']}}]})
const dependencies:any={
 'node:crypto':crypto,'../prisma.ts':{prisma:db},'./runtime.ts':{boundModels:async()=>runtime()},
 './registry.ts':{runtimeConfig:async({version}:any)=>runtime(version)},'./executionContract.ts':contract,
 '../global-text/policy.ts':{signBinding:(b:any)=>{bindings.push(b.version);assert.equal(b.source,'kanban');assert.equal(b.modelRevision,b.version);return 'signed-'+b.version}},
}
const exports:any={}
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/model-management/delegatedMedia.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,require:(id:string)=>{assert.ok(dependencies[id],id);return dependencies[id]},AbortSignal,process:{env:{AMC_CONTENT_SERVICE_URL:'https://content.fixture',CONTENT_SERVICE_INTERNAL_TOKEN:'service-fixture'}},
 fetch:async(url:string,options:any)=>{
  assert.equal(options.headers['x-content-service-token'],'service-fixture')
  const body=JSON.parse(options.body);assert.equal(options.headers['x-amc-text-binding'],'signed-'+body.version)
  assert.ok(!options.body.includes('service-fixture'))
  if(failure)return new Response('<!DOCTYPE html>',{status:failure})
  if(url.endsWith('/submit')){submits++;records.set(body.id,{protocolVersion:contract.EXECUTION_CONTRACT_VERSION,id:body.id,version:body.version,result:{jobId:'content-job',status:'submitted',provider:'baidu_seedance'}});if(timeout){timeout=false;throw new Error('submit timeout')}}
  const value=records.get(body.id)
  return value?Response.json({...value,...(badProtocol?{version:999}:{})}):Response.json({error:'not found'},{status:404})
 },
})
try{
 const input={brandId:'brand',actorId:'actor',platform:'tiktok',idempotencyKey:'one',plan:{seedanceJobs:[{request:{prompt:'first'}}]}}
 active=false;assert.equal(await exports.delegateMedia('video_generation',input),null);assert.equal(submits,0);active=true
 timeout=true
 const first=await exports.delegateMedia('video_generation',input);assert.equal(first.result.jobId,'content-job');assert.equal(submits,1,'lost response recovered without resubmission')
 version=2;await exports.delegateMedia('video_generation',input);assert.equal(submits,1);assert.equal(bindings.at(-1),1)
 await assert.rejects(()=>exports.delegateMedia('video_generation',{...input,plan:{changed:true}}),/different input/)
 await assert.rejects(()=>exports.queryDelegatedMedia({taskId:first.id,brandId:'other',actorId:'actor'}),/not found/)
 await exports.queryDelegatedMedia({taskId:first.id,brandId:'brand',actorId:'authorized-colleague'});assert.equal(bindings.at(-1),1)
 for(const status of [401,404,429]){failure=status;await assert.rejects(()=>exports.queryDelegatedMedia({taskId:first.id,brandId:'brand',actorId:'actor'}),new RegExp('HTTP '+status))}failure=0
 badProtocol=true;await assert.rejects(()=>exports.queryDelegatedMedia({taskId:first.id,brandId:'brand',actorId:'actor'}),/version mismatch/);badProtocol=false
 const speech={brandId:'brand',actorId:'actor',text:'hello',configId:'voice-2',idempotencyKey:'speech'}
 await exports.delegateMedia('tts_generation',speech);version=3;await exports.delegateMedia('tts_generation',speech);assert.equal(bindings.at(-1),2)
 await assert.rejects(()=>exports.delegateMedia('tts_generation',{...speech,configId:'voice-3'}),/VOICE_CONFIG_UNAVAILABLE/)
 const rows=await db.$queryRawUnsafe('SELECT * FROM "ModelDelegatedJob"');assert.equal(rows.length,2);assert.ok(rows.every((r:any)=>r.contentJobId==='content-job'))
 assert.ok(!JSON.stringify(rows).includes('prompt'))
 const fresh={brandId:'brand',actorId:'actor',text:'new request'}
 const before=await exports.delegateMedia('tts_generation',fresh);version=4
 const after=await exports.delegateMedia('tts_generation',fresh);assert.notEqual(before.id,after.id,'unkeyed new requests after publication must use the new version')
 console.log('PASS delegated migration, pre-publication routing, timeout recovery, immutable versions, ownership, conflicts, HTTP/protocol failures and voice rotation')
}finally{await pg.close()}
