import { createHash } from 'node:crypto'
import { prisma } from '../prisma.ts'
import { boundModels } from './runtime.ts'
import { runtimeConfig } from './registry.ts'
import { signBinding } from '../global-text/policy.ts'
import { EXECUTION_CONTRACT_VERSION, resolveMediaModel } from './executionContract.ts'

function stableJson(value:any):string{return JSON.stringify(value===undefined?null:Array.isArray(value)?value.map(v=>JSON.parse(stableJson(v))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,JSON.parse(stableJson(value[k]))])):value)}
const hash=(value:any)=>createHash('sha256').update(stableJson(value)).digest('hex')
const fail=(message:string,status=503)=>Object.assign(new Error(message),{status})
async function request(record:any,path:string,input?:any){
 const base=process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/,''),token=process.env.CONTENT_SERVICE_INTERNAL_TOKEN
 if(!base||!token)throw fail('Content media execution is not configured')
 const binding=signBinding({version:record.version,modelRevision:record.version,source:'kanban',enabled:true,connectionId:null,fingerprint:null,expires:Date.now()+15*60_000})
 const r=await fetch(`${base}/v1/internal/media/${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-content-service-token':token,'x-amc-text-binding':binding},body:JSON.stringify({...record,input}),signal:AbortSignal.timeout(110000),cache:'no-store'})
 const value=await r.json().catch(()=>null)
 if(!r.ok)throw fail(typeof value?.error==='string'?value.error:`Content media HTTP ${r.status}`,r.status)
 if(value?.protocolVersion!==EXECUTION_CONTRACT_VERSION||value.id!==record.id||value.version!==record.version)throw fail('Content media execution protocol or version mismatch')
 await prisma.$executeRawUnsafe('UPDATE "ModelDelegatedJob" SET "contentJobId"=$2,status=$3,"updatedAt"=now() WHERE id=$1',record.id,value.result?.jobId||null,value.result?.status||'unknown')
 return value.result
}
export async function delegateMedia(task:'video_generation'|'tts_generation',input:any){
 const runtime=await boundModels();if(!runtime.active)return null
 const {idempotencyKey,configId,actorRole,actorType,...payload}=input
 const identity={source:'kanban',brandId:input.brandId||'',actorId:input.actorId||'kanban-service',task,platform:input.platform||'',input:payload}
 const inputHash=hash(identity),id='delegate:'+hash({source:'kanban',brandId:identity.brandId,actorId:identity.actorId,task,key:idempotencyKey||`${runtime.version}:${inputHash}`})
 await prisma.$executeRawUnsafe('INSERT INTO "ModelDelegatedJob" (id,source,"brandId","actorId",task,platform,version,"inputHash") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING',id,'kanban',identity.brandId,identity.actorId,task,identity.platform,runtime.version,inputHash)
 const record=(await prisma.$queryRawUnsafe('SELECT * FROM "ModelDelegatedJob" WHERE id=$1',id))[0]
 if(record.inputHash!==inputHash)throw fail('Idempotency key was already used with different input',409)
 if(task==='tts_generation'&&configId){
  const pinned=record.version===runtime.version?runtime:await runtimeConfig({version:record.version})
  const m=resolveMediaModel(pinned,'kanban',task,record.platform)
  if(m.id!==configId&&m.legacyId!==`kanban:${configId}`)throw fail('VOICE_CONFIG_UNAVAILABLE: voice account differs from selected model',409)
 }
 // Lookup is mandatory even for a retry after the caller lost the submission response.
 try{return {id,result:await request(record,'query')}}catch(error:any){if(error.status!==404)throw error}
 try{return {id,result:await request(record,'submit',payload)}}catch(error){
  try{return {id,result:await request(record,'query')}}catch{throw error}
 }
}
export async function queryDelegatedMedia(input:{taskId:string;brandId:string;actorId:string}){
 const record=(await prisma.$queryRawUnsafe('SELECT * FROM "ModelDelegatedJob" WHERE id=$1 AND "brandId"=$2',input.taskId,input.brandId))[0]
 if(!record)throw fail('Delegated video task not found',404)
 return {id:record.id,result:await request(record,'query')}
}
export function delegatedVideoResult(value:{id:string;result:any}){
 const r=value.result
 if(r.status==='unknown')throw fail('Video submission outcome unknown; query this task instead of resubmitting',409)
 return {ok:true as const,...r,jobId:value.id,provider:r.provider||'content',status:r.status==='partial'?'processing':r.status,providerTaskIds:[value.id]}
}
