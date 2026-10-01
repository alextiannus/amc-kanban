import {AUTOPILOT_TOOLS} from './autopilot-capabilities'
import {autopilotRun} from './autopilot'
import {selectPoolIdea} from './idea-pool'
import { brandContext } from './application'
import { discoveryFrom, type LibrarySnapshot } from './library'
import { recommendationReceipts, saveRecommendation, adaptedScriptReceipt } from './recommendations'
import { readPreference, changePreference, preferenceSettings } from './preferences'
import type { Application, ArtifactReference, TaskView } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type { Pool } from 'pg'
import { composeApplication, requireActor, type WorkspacePort } from './application'
import { centralModels } from './models'
import { nativePool, initializeHost, admitIntent, intentBy, intentForTask, type PublicTaskIndex } from './store'
import { actorFor, dailyActorFor, candidateFrom, briefFrom, digest, nativeError, requestKey, TASK_ALLOWANCE, DAILY_ALLOWANCE, CORE_VERSION, type NativeActor, type NativeIntent } from './contract'
import { readCreativeRevisions, saveCreativeRevision } from '../brand-plan/creativeRevisions'
import { canReadOperations } from './operations'
import { runtimeConfig } from '../model-management/registry'

type Host={pool:Pool;app:Application;tools:string[];modelRevision:number}
const globalState=globalThis as typeof globalThis & {amcNativeHost?:Promise<Host>;amcNativeStartup?:boolean;amcNativeError?:string;amcNativeStopping?:boolean}
export async function getNativeHost(start=true):Promise<Host>{
  if(!globalState.amcNativeHost)globalState.amcNativeHost=(async()=>{
    const pool=nativePool()
    try{
      await initializeHost(pool)
      const lock=await pool.connect()
      try{
        await lock.query("SELECT pg_advisory_lock(hashtextextended('amc-iaic-initialize',0))")
        const models=await centralModels(),{app,tools}=await composeApplication(pool,models)
        if(start)app.start()
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
async function authorizedHost(userId:string,brandId:string,daily=false){const actor=daily?dailyActorFor(brandId,userId):actorFor(brandId,userId);await requireActor(actor);return {actor,...await getNativeHost()}}
async function taskHost(userId:string,brandId:string,id:string){
 const host=await authorizedHost(userId,brandId)
 if(!/^[0-9a-f-]{36}$/i.test(id))throw nativeError('task_not_found',404)
 const daily=(await host.pool.query("SELECT 1 FROM amc_ai_requests WHERE task_id=$1 AND subject_id=$2 AND intent->>'brandId'=$3 AND intent->>'automaticDaily'='true'",[id,userId,brandId])).rowCount
 if(daily){const actor=dailyActorFor(brandId,userId);await requireActor(actor);return {...host,actor}}
 return host
}
export async function createNativeTask(userId:string,brandId:string,body:any,automaticDaily=false,autopilotRunId?:string){
  const {actor,pool,app,tools,modelRevision}=await authorizedHost(userId,brandId,automaticDaily)
  if(autopilotRunId)await autopilotRun(userId,brandId,autopilotRunId)
  if(automaticDaily&&!(body?.kind==='creative_discovery'&&body.poolIdeaId))throw nativeError('daily_pool_idea_required')
  if(body?.kind==='creative_discovery'&&body.poolIdeaId){
    const idea=await selectPoolIdea(brandId,body.poolIdeaId)
    body={kind:'creative_discovery',poolIdeaId:idea.id,goal:'仅借鉴选中原创意的创作方向，根据当前品牌资料改写可直接审阅的完整脚本，包含开场、分镜/正文、口播、行动提示及对应素材需求。有产品目录时使用真实 SKU；无目录时直接完成品牌通用稿并返回空 skuIds，不补问产品、不留待填内容、不要求先补 SKU。未知产品、价格、优惠与卖点改为不依赖它们的表达；使用当前品牌名称。供主理人审阅后保存或添加素材。',requestKey:automaticDaily?`daily-general-v2-${digest([brandId,idea.id])}`:`pool-general-v2-${digest([brandId,userId,idea.id,await brandContext(actor)])}`}
  }
  if(body?.kind==='creative_discovery'&&body.proactive===true){
    body={kind:'creative_discovery',goal:'根据当前品牌真实资料，从原创意库推荐最多三个适合该品牌的创意，供主理人审阅修改后制作或保存到发布计划。',requestKey:`proactive-${digest([brandId,userId,new Date().toISOString().slice(0,10),await brandContext(actor)])}`}
  }
  if(body?.kind==='creative'&&body.adaptToBrand===true){
    if(typeof body.creativeId!=='string'||typeof body.month!=='string')throw nativeError('invalid_creative_task')
    const current=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,body.month,body.creativeId)
    body={kind:'creative',adaptToBrand:true,creativeId:body.creativeId,month:body.month,expectedRevision:current.expectedRevision,goal:'自动把选中创意改写为当前品牌可直接审阅的完整脚本。先读取amc-creative/SKILL.md、品牌与productCatalog。有目录时选择真实SKU并写出其名称；无目录时直接完成品牌通用稿，skuIds为空，并将product设为品牌内容，不补问产品、不留待填内容、不要求先补SKU。planning包含当前品牌名称、开场、分镜/正文、口播、行动提示及对应素材需求。原稿只借鉴表达结构，未知产品、价格、优惠或卖点改写为不依赖这些信息的表达。只有本次明确任务不可缺少的事实才补问。供主理人修改后保存或制作。',requestKey:`adapt-general-v3-${digest([brandId,userId,body.creativeId,body.month,current.expectedRevision,await brandContext(actor),new Date().toISOString().slice(0,10)])}`}
  }
  const key=requestKey(body?.requestKey)
  if(typeof body.goal!=='string'||!body.goal.trim()||body.goal.length>6000)throw nativeError('invalid_ai_goal')
  const kind=body.kind||'creative'
  if(!['creative','brand_brief','creative_discovery','autopilot'].includes(kind))throw nativeError('invalid_task_kind')
  const common={brandId,userId,goal:body.goal.trim(),requestKey:key,artifactPath:`work/${digest([actor,key])}.json`}
  let intent:NativeIntent
  if(kind==='autopilot'){if(key!==`autopilot-${body.runId}`)throw nativeError('autopilot_request_key_required');await autopilotRun(userId,brandId,body.runId);intent={...common,kind,runId:body.runId}}else if(kind==='creative'){
    if(typeof body.creativeId!=='string'||typeof body.month!=='string'||typeof body.expectedRevision!=='string')throw nativeError('invalid_creative_task')
    intent={...common,kind,...(autopilotRunId?{autopilotRunId}:{}),requireMaterials:true,...(body.adaptToBrand?{adaptToBrand:true}:{}),creativeId:body.creativeId,month:body.month,expectedRevision:body.expectedRevision}
  }else if(kind==='creative_discovery'){intent={...common,kind,requireMaterials:true,...(body.poolIdeaId?{poolIdeaId:body.poolIdeaId}:{}),...(automaticDaily?{automaticDaily:true}:{})}}else{
    if(!await canReadOperations(actor))throw nativeError('operations_access_denied',403)
    intent={...common,kind:'brand_brief'}
  }
  let prior;try{prior=await intentBy(pool,actor,'request_key',key)}catch(e){if((e as any).statusCode!==404)throw e}
  if(prior){if(prior.intent.kind!=='brand_brief'&&prior.intent.kind!=='autopilot'&&!prior.intent.requireMaterials&&'requireMaterials' in intent)delete intent.requireMaterials;if(prior.digest!==digest(intent))throw nativeError('request_key_reused',409);const existing=prior.task_id?{id:prior.task_id}:await (app.tasks as PublicTaskIndex).findRequest(actor,'agent.work',key);if(existing){await intentForTask(pool,app,actor,existing.id);return publicTask(app,actor,existing.id)}}
  if(intent.kind==='creative'){
    const current=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,intent.month,intent.creativeId)
    if(current.expectedRevision!==intent.expectedRevision)throw nativeError('creative_revision_conflict',409)
  }
  if((await runtimeConfig()).version!==modelRevision)throw nativeError('model_policy_changed_restart_required',503)
  const row=await admitIntent(pool,actor,intent)
  await app.ledger.grant(await app.scope(actor),{reference:`amc-request-${row.id}`,amount:TASK_ALLOWANCE,evidence:{kind:automaticDaily?'daily-brand-planning':'explicit-ai-task',requestId:row.id,policy:'amc-ai-allowance-v1',requestedBy:userId}})
  const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:tools.filter(t=>(!AUTOPILOT_TOOLS.includes(t)||intent.kind==='autopilot')&&(!['amc.creative','amc.operations','amc.library'].includes(t)||t===(intent.kind==='creative'?'amc.creative':intent.kind==='creative_discovery'?'amc.library':'amc.operations')))},{actor,callId:key})
  await pool.query('UPDATE amc_ai_requests SET task_id=$1 WHERE id=$2 AND (task_id IS NULL OR task_id=$1)',[receipt.id,row.id])
  return publicTask(app,actor,receipt.id)
}
async function publicTask(app:Application,actor:NativeActor,id:string){
  return projectTask({...await app.runtime.state(actor,id),result:null,inputRequest:null,trusted_context:null})
}
function projectTask(task:TaskView){
  return {id:task.id,status:task.status,waitingReason:task.waiting_reason,inputRequest:task.inputRequest,result:task.result,goal:task.input.goal,version:task.version,updatedAt:task.updated_at}
}
export async function listNativeTasks(userId:string,brandId:string,cursor?:string){
  const {actor,app,pool}=await authorizedHost(userId,brandId)
  const page=await app.dispatcher.invoke('tasks.list',{limit:20,...(cursor?{cursor}:{})},{actor})
  const listing=page as {items:Array<{id:string}>;nextCursor:string|null}
  const items=await Promise.all(listing.items.map(async item=>{try{const row=await intentForTask(pool,app,actor,item.id);return {...item,goal:row.intent.goal,kind:row.intent.kind,creativeId:row.intent.kind==='creative'?row.intent.creativeId:null}}catch{return item}}))
  if(!cursor){
    const dailyActor=dailyActorFor(brandId,userId)
    try{
      await requireActor(dailyActor)
      const daily=await app.dispatcher.invoke('tasks.list',{limit:20},{actor:dailyActor}) as {items:Array<{id:string}>}
      for(const item of daily.items){const row=await intentForTask(pool,app,dailyActor,item.id);items.push({...item,goal:'每日自动策划 · '+row.intent.goal,kind:row.intent.kind,creativeId:null} as any)}
    }catch{/* A normal brand collaborator need not have principal delegation. */}
  }
  return {page:{...listing,items},coreVersion:CORE_VERSION,limits:{taskAllowance:TASK_ALLOWANCE,dailyAllowance:DAILY_ALLOWANCE},balance:await app.ledger.balance(await app.scope(actor))}
}
// Status/control must remain available when Core refuses stale source or Skill revisions.
// This never returns unvalidated historical sources or bypasses current authorization.
export async function nativeTaskHistory(app:Application,actor:NativeActor,id:string){
  try{return {history:await app.runtime.get(actor,id,{history:true}),historyUnavailable:null as string|null}}
  catch(error){
    if((error as {statusCode?:number}).statusCode!==409)throw error
    const state=await app.runtime.state(actor,id)
    return {history:{...state,result:null,inputRequest:null,trusted_context:null,calls:[],events:[]},historyUnavailable:'revision_conflict'}
  }
}
export async function readNativeTask(userId:string,brandId:string,id:string){
  const {actor,app,pool}=await taskHost(userId,brandId,id)
  const row=await intentForTask(pool,app,actor,id),view=await nativeTaskHistory(app,actor,id),history=view.history,task=projectTask(history)
  const usage=await app.ledger.taskUsage(await app.scope(actor),id)
  let candidate=null,report=null,recommendations=null,artifact:ArtifactReference|null=null
  if(task.status==='succeeded'&&task.result){
    artifact=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)||null
    if(artifact){const content=(await (app.workspace as WorkspacePort).read(actor,artifact)).content;if(row.intent.kind==='creative')candidate=candidateFrom(content,row.intent);else if(row.intent.kind==='creative_discovery')recommendations=discoveryFrom(content,row.intent);else if(row.intent.kind==='brand_brief')report=briefFrom(content,row.intent);else report=JSON.parse(content)}
  }
  const operations=history.calls.find(c=>c.capability==='amc.operations'&&c.status==='succeeded')?.result as {draftTotal?:number;accountTotal?:number;operationsDigest?:string;retrievedAt?:string}|undefined
  const currentOperations=report&&typeof operations?.draftTotal==='number'&&typeof operations?.accountTotal==='number'?{draftTotal:operations.draftTotal,accountTotal:operations.accountTotal,retrievedAt:operations.retrievedAt,changed:operations.operationsDigest!==report.operationsDigest}:null
  const sourceCall=history.calls.find(c=>c.capability==='amc.creative'&&c.status==='succeeded')?.result as {current?:unknown}|undefined
  const adoptions=row.intent.kind==='creative_discovery'?await recommendationReceipts(userId,brandId,id):[]
  const adoption=row.intent.kind==='creative'&&row.intent.adaptToBrand?await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId):null
  const library=history.calls.slice().reverse().find(c=>c.capability==='amc.library'&&c.status==='succeeded')?.result as LibrarySnapshot|undefined
  return {...task,automaticDaily:row.intent.kind==='creative_discovery'&&row.intent.automaticDaily===true,historyUnavailable:view.historyUnavailable,kind:row.intent.kind,candidate,report,recommendations,adoptions,adoption,library:library?{retrievedAt:library.retrievedAt,sources:library.sources}:null,artifact,usage,currentOperations,original:sourceCall?.current||null,...(row.intent.kind==='creative'?{creativeId:row.intent.creativeId,month:row.intent.month,adaptToBrand:row.intent.adaptToBrand===true}:{})}
}
export async function controlNativeTask(userId:string,brandId:string,id:string,body:any){
  const {actor,app}=await taskHost(userId,brandId,id)
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
  const task=await app.runtime.get(actor,id,{history:true})
  if(task.status!=='succeeded'||!task.result)throw nativeError('candidate_not_ready',409)
  const row=await intentForTask(pool,app,actor,id),ref=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)
  if(!ref||body.artifactDigest!==ref.digest)throw nativeError('candidate_changed',409)
  if(row.intent.kind==='creative_discovery'){
    const library=task.calls.slice().reverse().find(c=>c.capability==='amc.library'&&c.status==='succeeded')?.result as LibrarySnapshot|undefined
    if(!library)throw nativeError('recommendation_source_mismatch',409)
    return saveRecommendation(userId,brandId,id,row.intent,ref,(await (app.workspace as WorkspacePort).read(actor,ref)).content,library,body)
  }
  if(row.intent.kind!=='creative')throw nativeError('creative_task_required',400)
  const candidate=candidateFrom((await (app.workspace as WorkspacePort).read(actor,ref)).content,row.intent)
  const reviewed=body.patch===undefined?candidate.patch:body.patch
  if(!reviewed||Object.keys(reviewed).some(k=>!['title','planning','aiCaption','aiTags','product','materialRequirements'].includes(k)))throw nativeError('candidate_patch_invalid')
  if(row.intent.requireMaterials&&row.intent.adaptToBrand&&(!Array.isArray(reviewed.materialRequirements)||!reviewed.materialRequirements.some((item:unknown)=>typeof item==='string'&&item.trim())))throw nativeError('material_requirements_required')
  const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,{expectedRevision:row.intent.expectedRevision,idempotencyKey:`ai-${digest([id,ref.digest])}`,patch:reviewed},undefined,{taskId:id,agentId:'amc-mm-user-ai',artifact:ref,requestedBy:userId,contextDigest:candidate.contextDigest})
  const verified=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,saved.receipt.id)
  if(verified.revisions[0]?.contentHash!==saved.receipt.contentHash)throw nativeError('creative_save_unverified',503)
  return {verified:true,receipt:saved.receipt,month:row.intent.month,creativeId:row.intent.creativeId}
}

export async function nativePreference(userId:string,brandId:string,body?:unknown){
  const {actor,app}=await authorizedHost(userId,brandId)
  const preference=body?await changePreference(app,actor,body):await readPreference(app,actor)
  const facts=await brandContext(actor)
  if(!facts)throw nativeError('brand_context_unavailable',404)
  return preferenceSettings(preference,facts)
}
