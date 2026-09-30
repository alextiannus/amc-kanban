import { readPreference, changePreference } from './preferences'
import type { Application, ArtifactReference } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type { Pool } from 'pg'
import { composeApplication, requireActor, type WorkspacePort } from './application'
import { centralModels } from './models'
import { nativePool, initializeHost, admitIntent, intentBy, intentForTask, type PublicTaskIndex } from './store'
import { actorFor, candidateFrom, briefFrom, digest, nativeError, requestKey, TASK_ALLOWANCE, DAILY_ALLOWANCE, CORE_VERSION, type NativeActor, type NativeIntent } from './contract'
import { readCreativeRevisions, saveCreativeRevision } from '../brand-plan/creativeRevisions'
import { canReadOperations } from './operations'
import { runtimeConfig } from '../model-management/registry'

type Host={pool:Pool;app:Application;tools:string[];modelRevision:number}
const globalState=globalThis as typeof globalThis & {amcNativeHost?:Promise<Host>;amcNativeStartup?:boolean;amcNativeError?:string;amcNativeStopping?:boolean}
export async function getNativeHost():Promise<Host>{
  if(!globalState.amcNativeHost)globalState.amcNativeHost=(async()=>{
    const pool=nativePool()
    try{
      await initializeHost(pool)
      const lock=await pool.connect()
      try{
        await lock.query("SELECT pg_advisory_lock(hashtextextended('amc-iaic-initialize',0))")
        const models=await centralModels(),{app,tools}=await composeApplication(pool,models)
        app.start()
        return {pool,app,tools,modelRevision:Number(models.profiles[0].id.replace('central-',''))}
      }finally{await lock.query("SELECT pg_advisory_unlock(hashtextextended('amc-iaic-initialize',0))");lock.release()}
    }catch(e){await pool.end();throw e}
  })().catch(e=>{globalState.amcNativeHost=undefined;globalState.amcNativeError='ai_runtime_unavailable';throw e})
  return globalState.amcNativeHost
}
export function startNativeWorker(){
  if(globalState.amcNativeStartup)return
  globalState.amcNativeStartup=true
  let checking=false
  const maintain=async()=>{
    if(checking||globalState.amcNativeStopping)return
    checking=true
    try{
      const host=await getNativeHost(),current=await runtimeConfig()
      if(current.version!==host.modelRevision){
        const result=await host.app.runtime.drain({timeoutMs:20000})
        if(result.drained){await host.pool.end();globalState.amcNativeHost=undefined;await getNativeHost()}
      }
    }catch(e){console.error('[amc-ai] host unavailable',e instanceof Error?e.name:'unknown')}finally{checking=false}
  }
  void maintain()
  const timer=setInterval(()=>void maintain(),60000);timer.unref()
  process.once('SIGTERM',()=>{globalState.amcNativeStopping=true;clearInterval(timer);void (async()=>{if(!globalState.amcNativeHost)return;const host=await globalState.amcNativeHost.catch(()=>null);if(host){const result=await host.app.runtime.drain({timeoutMs:20000});if(result.drained)await host.pool.end()}})()})
}
async function authorizedHost(userId:string,brandId:string){const actor=actorFor(brandId,userId);await requireActor(actor);return {actor,...await getNativeHost()}}
export async function createNativeTask(userId:string,brandId:string,body:any){
  const {actor,pool,app,tools,modelRevision}=await authorizedHost(userId,brandId)
  const key=requestKey(body?.requestKey)
  if(typeof body.goal!=='string'||!body.goal.trim()||body.goal.length>6000)throw nativeError('invalid_ai_goal')
  const kind=body.kind||'creative'
  if(!['creative','brand_brief'].includes(kind))throw nativeError('invalid_task_kind')
  const common={brandId,userId,goal:body.goal.trim(),requestKey:key,artifactPath:`work/${digest([actor,key])}.json`}
  let intent:NativeIntent
  if(kind==='creative'){
    if(typeof body.creativeId!=='string'||typeof body.month!=='string'||typeof body.expectedRevision!=='string')throw nativeError('invalid_creative_task')
    intent={...common,kind,creativeId:body.creativeId,month:body.month,expectedRevision:body.expectedRevision}
  }else{
    if(!await canReadOperations(actor))throw nativeError('operations_access_denied',403)
    intent={...common,kind:'brand_brief'}
  }
  let prior;try{prior=await intentBy(pool,actor,'request_key',key)}catch(e){if((e as any).statusCode!==404)throw e}
  if(prior){if(digest(prior.intent)!==digest(intent))throw nativeError('request_key_reused',409);const existing=prior.task_id?{id:prior.task_id}:await (app.tasks as PublicTaskIndex).findRequest(actor,'agent.work',key);if(existing){await intentForTask(pool,app,actor,existing.id);return publicTask(app,actor,existing.id)}}
  if(intent.kind==='creative'){
    const current=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,intent.month,intent.creativeId)
    if(current.expectedRevision!==intent.expectedRevision)throw nativeError('creative_revision_conflict',409)
  }
  if((await runtimeConfig()).version!==modelRevision)throw nativeError('model_policy_changed_restart_required',503)
  const row=await admitIntent(pool,actor,intent)
  await app.ledger.grant(await app.scope(actor),{reference:`amc-request-${row.id}`,amount:TASK_ALLOWANCE,evidence:{kind:'explicit-ai-task',requestId:row.id,policy:'amc-ai-allowance-v1',requestedBy:userId}})
  const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:tools.filter(t=>intent.kind==='creative'?t!=='amc.operations':t!=='amc.creative')},{actor,callId:key})
  await pool.query('UPDATE amc_ai_requests SET task_id=$1 WHERE id=$2 AND (task_id IS NULL OR task_id=$1)',[receipt.id,row.id])
  return publicTask(app,actor,receipt.id)
}
async function publicTask(app:Application,actor:NativeActor,id:string){
  const task=await app.runtime.get(actor,id)
  return {id:task.id,status:task.status,waitingReason:task.waiting_reason,inputRequest:task.inputRequest,result:task.result,goal:task.input.goal,version:task.version,updatedAt:task.updated_at}
}
export async function listNativeTasks(userId:string,brandId:string,cursor?:string){
  const {actor,app,pool}=await authorizedHost(userId,brandId)
  const page=await app.dispatcher.invoke('tasks.list',{limit:20,...(cursor?{cursor}:{})},{actor})
  const listing=page as {items:Array<{id:string}>;nextCursor:string|null}
  const items=await Promise.all(listing.items.map(async item=>{try{const row=await intentForTask(pool,app,actor,item.id);return {...item,goal:row.intent.goal,kind:row.intent.kind,creativeId:row.intent.kind==='creative'?row.intent.creativeId:null}}catch{return item}}))
  return {page:{...listing,items},coreVersion:CORE_VERSION,limits:{taskAllowance:TASK_ALLOWANCE,dailyAllowance:DAILY_ALLOWANCE},balance:await app.ledger.balance(await app.scope(actor))}
}
export async function readNativeTask(userId:string,brandId:string,id:string){
  const {actor,app,pool}=await authorizedHost(userId,brandId)
  const row=await intentForTask(pool,app,actor,id),task=await publicTask(app,actor,id)
  const usage=await app.ledger.taskUsage(await app.scope(actor),id)
  let candidate=null,report=null,artifact:ArtifactReference|null=null
  if(task.status==='succeeded'&&task.result){
    artifact=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)||null
    if(artifact){const content=(await (app.workspace as WorkspacePort).read(actor,artifact)).content;if(row.intent.kind==='creative')candidate=candidateFrom(content,row.intent);else report=briefFrom(content,row.intent)}
  }
  const history=candidate?await app.runtime.get(actor,id,{history:true}):null
  const sourceCall=history?.calls.find(c=>c.capability==='amc.creative'&&c.status==='succeeded')?.result as {current?:unknown}|undefined
  return {...task,kind:row.intent.kind,candidate,report,artifact,usage,original:sourceCall?.current||null,...(row.intent.kind==='creative'?{creativeId:row.intent.creativeId,month:row.intent.month}:{})}
}
export async function controlNativeTask(userId:string,brandId:string,id:string,body:any){
  const {actor,app}=await authorizedHost(userId,brandId)
  if(!['cancel','resume','provide_input','control_result'].includes(body?.action))throw nativeError('invalid_task_action')
  const key=requestKey(body.requestKey)
  if(body.action==='resume'&&!(await app.ledger.taskUsage(await app.scope(actor),id)).complete)throw nativeError('usage_reconciliation_required',409)
  const input={id,...(body.action==='provide_input'?{input:body.input}:{}),...(body.action==='control_result'?{requestKey:key}:{})}
  const receipt=await app.dispatcher.invoke(`tasks.${body.action}`,input,{actor,callId:key})
  return {receipt,task:await app.runtime.state(actor,id).then(t=>({id:t.id,status:t.status,waitingReason:t.waiting_reason}))}
}
export async function adoptNativeCandidate(userId:string,brandId:string,id:string,body:any){
  const {actor,app,pool}=await authorizedHost(userId,brandId)
  requestKey(body?.requestKey)
  const task=await app.runtime.get(actor,id)
  if(task.status!=='succeeded'||!task.result)throw nativeError('candidate_not_ready',409)
  const row=await intentForTask(pool,app,actor,id),ref=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)
  if(row.intent.kind!=='creative')throw nativeError('creative_task_required',400)
  if(!ref||body.artifactDigest!==ref.digest)throw nativeError('candidate_changed',409)
  const candidate=candidateFrom((await (app.workspace as WorkspacePort).read(actor,ref)).content,row.intent)
  const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,{expectedRevision:row.intent.expectedRevision,idempotencyKey:`ai-${digest([id,ref.digest])}`,patch:candidate.patch},undefined,{taskId:id,agentId:'amc-mm-user-ai',artifact:ref,requestedBy:userId,contextDigest:candidate.contextDigest})
  const verified=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,saved.receipt.id)
  if(verified.revisions[0]?.contentHash!==saved.receipt.contentHash)throw nativeError('creative_save_unverified',503)
  return {verified:true,receipt:saved.receipt}
}

export async function nativePreference(userId:string,brandId:string,body?:unknown){
  const {actor,app}=await authorizedHost(userId,brandId)
  return body?changePreference(app,actor,body):readPreference(app,actor)
}
