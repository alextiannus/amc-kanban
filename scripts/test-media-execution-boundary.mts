import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
;(globalThis as any).prisma={$extends(){return this}}
const { delegatedVideoResult }=await import('../src/lib/model-management/delegatedMedia.ts')
const native=createRequire(import.meta.url)
let active=false,submits=0,queries=0,providerCalls=0,pinned:number|undefined
const config={id:'legacy',provider:'seedance',displayName:'Old',modelName:'old',apiKey:'fixture-key',baseUrl:'https://old.fixture',timeoutMs:1000}
const dependencies:any={
 '@/lib/model-management/runtime':{selectedExecution:async()=>pinned?{...config,policyVersion:pinned}:null,withModels:async(r:any,run:any)=>{pinned=r.version;return run()},recordExecution:async()=>{}},
 '@/lib/model-management/registry':{runtimeConfig:async(v:any)=>v},
 '@/lib/prisma':{prisma:{lLMConfig:{findMany:async()=>[config]}}},
 '@/lib/model-management/delegatedMedia':{delegateMedia:async()=>{if(!active)return null;submits++;return {id:'delegate:fixture',result:{provider:'baidu_seedance',status:'submitted'}}},queryDelegatedMedia:async()=>{queries++;return {id:'delegate:fixture',result:{provider:'baidu_seedance',status:'processing'}}},delegatedVideoResult},
 '@/lib/integrations/huaweiObs':{},
}
const exports:any={};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/videoProduction.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:(id:string)=>id.startsWith('node:')?native(id):dependencies[id],AbortSignal,fetch:async()=>{providerCalls++;return Response.json({id:'old-task',status:'running'})},Buffer,process})
const input={brandId:'brand',actorId:'actor',seedanceJobs:[{request:{prompt:'fixture'}}]}
await exports.submitVideoGeneration(input);assert.equal(providerCalls,1);assert.equal(submits,0)
active=true;const current=await exports.submitVideoGeneration(input);assert.equal(current.jobId,'delegate:fixture');assert.equal(providerCalls,1)
await exports.refreshVideoGeneration({...input,taskId:'delegate:fixture'});assert.equal(queries,1);assert.equal(providerCalls,1)
await exports.refreshVideoGeneration({...input,taskId:'seedance:old-task'});assert.equal(providerCalls,2);assert.equal(queries,1)
const old=await exports.refreshVideoGeneration({...input,taskId:'central:5:seedance%3Aold-task'});assert.equal(pinned,5);assert.match(old.jobId,/^central:5:/);assert.equal(providerCalls,3)
console.log('PASS public video delegation boundary, pre-publication direct execution, old provider queries and historical central version')
