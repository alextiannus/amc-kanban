import {laneCursors,nextLaneCursor} from './runtime-routing'
import {activeConversationStatus,wakeConversationWorker} from './conversation-status'
import {conversationProgress,conversationInsight} from './conversation-progress'
import {savePlanningDraft} from './planning-workspace-save'
import {assertUsageSettled} from './model-guards'
import {AUTOPILOT_TOOLS} from './autopilot-capabilities'
import {autopilotRun} from './autopilot'
import {selectPoolIdea} from './idea-pool'
import { applicationVersion, brandContext } from './application'
import { recoveryRequestKey } from './daily-recovery'
import { discoveryFrom, type LibrarySnapshot } from './library'
import { recommendationReceipts, saveRecommendation, adaptedScriptReceipt } from './recommendations'
import { readPreference, changePreference, preferenceSettings } from './preferences'
import type { Application, ArtifactReference, TaskView } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import type { Pool } from 'pg'
import { composeApplication, requireActor, type WorkspacePort } from './application'
import { centralModels } from './models'
import { nativePool, initializeHost, admitIntent, intentBy, intentForTask, type PublicTaskIndex, type RuntimeLane } from './store'
import { conversationFrom, conversationInput, actorFor, dailyActorFor, candidateFrom, briefFrom, digest, nativeError, requestKey, USAGE_POLICY, CORE_VERSION, type NativeActor, type NativeIntent } from './contract'
import { readCreativeRevisions, saveCreativeRevision } from '../brand-plan/creativeRevisions'
import { canReadOperations } from './operations'
import { runtimeConfig } from '../model-management/registry'
import {readSkuContext,readBoundSkuContext} from '../brand-plan/creativeSkuDecision'
import {validateSkuArtifact} from './sku-workflow'

type Host={pool:Pool;taskPool?:Pool;lane?:RuntimeLane;app:Application;tools:string[];modelRevision:number}
const globalState=globalThis as typeof globalThis & {amcNativeHost?:Promise<Host>;amcConversationHost?:Promise<Host>;amcNativeStartup?:boolean;amcNativeError?:string;amcNativeStopping?:boolean}
const hostKey=(lane:RuntimeLane)=>lane==='conversation'?'amcConversationHost' as const:'amcNativeHost' as const
async function closeHostPools(host:Host){if(host.taskPool)await host.taskPool.end();await host.pool.end()}
export async function getNativeHost(start=true,lane:RuntimeLane='default'):Promise<Host>{
  const key=hostKey(lane)
  if(!globalState[key])globalState[key]=(async()=>{
    const pool=nativePool(),taskPool=lane==='conversation'?nativePool(process.env.DATABASE_URL,'conversation'):undefined
    try{
      const lock=await pool.connect()
      try{
        await lock.query("SELECT pg_advisory_lock(hashtextextended('amc-iaic-initialize',0))")
        await initializeHost(pool)
        if(taskPool)await pool.query('CREATE SCHEMA IF NOT EXISTS amc_iaic_conversation')
        const models=await centralModels(),{app,tools}=await composeApplication(pool,models,{taskPool})
        if(start)app.start()
        else await app.runtime.drain({timeoutMs:0})
        return {pool,taskPool,lane,app,tools,modelRevision:Number(models.profiles[0].id.replace('central-',''))}
      }finally{await lock.query("SELECT pg_advisory_unlock(hashtextextended('amc-iaic-initialize',0))");lock.release()}
    }catch(e){if(taskPool)await taskPool.end();await pool.end();throw e}
  })().catch(e=>{globalState[key]=undefined;globalState.amcNativeError='ai_runtime_unavailable';throw e})
  return globalState[key]!
}
export function startNativeWorker(){
  if(globalState.amcNativeStartup)return
  globalState.amcNativeStartup=true
  const checking=new Set<RuntimeLane>()
  const maintain=async(lane:RuntimeLane)=>{
    if(checking.has(lane)||globalState.amcNativeStopping)return
    checking.add(lane)
    try{
      const host=await getNativeHost(true,lane),current=await runtimeConfig()
      if(current.version!==host.modelRevision){
        const result=await host.app.runtime.drain({timeoutMs:20000})
        if(result.drained){await closeHostPools(host);globalState[hostKey(lane)]=undefined;await getNativeHost(true,lane)}
      }
    }catch(e){console.error('[amc-ai] host unavailable',lane,e instanceof Error?e.name:'unknown')}finally{checking.delete(lane)}
  }
  const maintainAll=()=>{void maintain('default');void maintain('conversation')}
  maintainAll()
  const timer=setInterval(maintainAll,60000);timer.unref()
  process.once('SIGTERM',()=>{globalState.amcNativeStopping=true;clearInterval(timer);void Promise.allSettled((['default','conversation'] as const).map(async lane=>{const pending=globalState[hostKey(lane)];if(!pending)return;const host=await pending.catch(()=>null);if(host){const result=await host.app.runtime.drain({timeoutMs:20000});if(result.drained)await closeHostPools(host)}}))})
}
async function authorizedHost(userId:string,brandId:string,daily=false){const actor=daily?dailyActorFor(brandId,userId):actorFor(brandId,userId);await requireActor(actor);return {actor,...await getNativeHost()}}
async function taskHost(userId:string,brandId:string,id:string){
 let host=await authorizedHost(userId,brandId)
 if(!/^[0-9a-f-]{36}$/i.test(id))throw nativeError('task_not_found',404)
 const row=(await host.pool.query("SELECT runtime_lane,intent->>'automaticDaily' AS daily FROM amc_ai_requests WHERE task_id=$1 AND subject_id=$2 AND intent->>'brandId'=$3",[id,userId,brandId])).rows[0]
 if(row?.runtime_lane==='conversation')host={...host,...await getNativeHost(true,'conversation')}
 else if(!row){
   // Recover accepted conversation tasks whose application index update was lost.
   const conversation=await getNativeHost(true,'conversation')
   try{await (conversation.app.tasks as PublicTaskIndex).get(host.actor,id);host={...host,...conversation}}catch(error){if((error as {statusCode?:number}).statusCode!==404)throw error}
 }
 if(row?.daily==='true'){const actor=dailyActorFor(brandId,userId);await requireActor(actor);return {...host,actor}}
 return host
}
export async function createNativeTask(userId:string,brandId:string,body:any,automaticDaily=false,autopilotRunId?:string,planningRequest?:import('./contract').PlanningBinding){
  let host=await authorizedHost(userId,brandId,automaticDaily)
  if(body?.kind==='conversation'){
    let prior;try{prior=await intentBy(host.pool,host.actor,'request_key',requestKey(body.requestKey))}catch(error){if((error as {statusCode?:number}).statusCode!==404)throw error}
    if(!prior||prior.runtime_lane==='conversation')host={...host,...await getNativeHost(true,'conversation')}
  }
  const {actor,pool,app,tools,modelRevision}=host
  // A rolling-deploy standby can admit durable interactive work, but automatic
  // tasks must wait until this process owns the sole Core executor. Otherwise
  // the retiring executor can claim a new-version task and pause it immediately.
  if((automaticDaily||planningRequest)&&!(await app.runtime.deploymentState()).ownsExecutor)throw nativeError('daily_executor_standby',503)
  if(autopilotRunId)await autopilotRun(userId,brandId,autopilotRunId)
  if(automaticDaily&&!(body?.kind==='creative_discovery'&&body.poolIdeaId))throw nativeError('daily_pool_idea_required')
  if(body?.recoveryOfTaskId&&!automaticDaily)throw nativeError('daily_recovery_scope_required',403)
  if(body?.kind==='creative_discovery'&&body.poolIdeaId){
    const recoveryOfTaskId=typeof body.recoveryOfTaskId==='string'&&/^[0-9a-f-]{36}$/i.test(body.recoveryOfTaskId)?body.recoveryOfTaskId:null
    if(body.recoveryOfTaskId&&!recoveryOfTaskId)throw nativeError('invalid_recovery_task')
    const recoveryVersion=recoveryOfTaskId?await applicationVersion():null
    const idea=await selectPoolIdea(brandId,body.poolIdeaId)
    body={kind:'creative_discovery',poolIdeaId:idea.id,goal:'读取 amc-discovery/SKILL.md 和 amc.library，仅选择适合品牌的来源候选，返回来源ID、标题和理由。等待人工确认 SKU 后才生成适配脚本；不得直接选品或生成最终脚本。',requestKey:recoveryOfTaskId?recoveryRequestKey(brandId,idea.id,recoveryVersion!):automaticDaily?`daily-general-v2-${digest([brandId,idea.id])}`:`pool-general-v2-${digest([brandId,userId,idea.id,await brandContext(actor)])}`,...(recoveryOfTaskId?{recoveryOfTaskId,recoveryVersion}:{})}
  }
  if(body?.kind==='creative_discovery'&&body.proactive===true){
    body={kind:'creative_discovery',goal:'根据当前品牌真实资料，从原创意库推荐最多三个适合该品牌的创意，供主理人审阅修改后制作或保存到发布计划。',requestKey:`proactive-${digest([brandId,userId,new Date().toISOString().slice(0,10),await brandContext(actor)])}`}
  }
  if(body?.kind==='creative'&&body.adaptToBrand===true)throw nativeError('sku_confirmation_required_use_sku_proposal',409)
  const key=requestKey(body?.requestKey)
  if(typeof body.goal!=='string'||!body.goal.trim()||body.goal.length>6000)throw nativeError('invalid_ai_goal')
  const kind=body.kind||'creative'
  if(!['creative','brand_brief','creative_discovery','autopilot','conversation','sku_proposal','creative_adaptation'].includes(kind))throw nativeError('invalid_task_kind')
  const common={brandId,userId,goal:body.goal.trim(),requestKey:key,artifactPath:`work/${digest([actor,key])}.json`}
  let intent:NativeIntent
  if(kind==='sku_proposal'||kind==='creative_adaptation'){
    if(kind==='creative_adaptation'&&(typeof body.decisionDigest!=='string'||!/^[a-f0-9]{64}$/.test(body.decisionDigest)))throw nativeError('sku_confirmation_required',409)
    let existing
    try{existing=await intentBy(pool,actor,'request_key',key)}catch(error){if((error as any).statusCode!==404)throw error}
    if(existing){
      const saved=existing.intent
      if(saved.kind!==kind||!('creativeId' in saved)||saved.creativeId!==body.creativeId||saved.month!==body.month||saved.expectedRevision!==body.expectedRevision||saved.goal!==common.goal||('decisionDigest' in saved?saved.decisionDigest:undefined)!==body.decisionDigest)throw nativeError('request_key_reused',409)
      intent=saved
    }else{
      const ctx=await readSkuContext({id:userId,type:'HUMAN'},brandId,body.month,body.creativeId)
      if(!ctx.current.canOverwrite)throw nativeError('creative_edit_forbidden',403)
      if(body.expectedRevision!==ctx.binding.expectedRevision)throw nativeError('creative_revision_conflict',409)
      intent={...common,...ctx.binding,kind,...(kind==='creative_adaptation'?{decisionDigest:body.decisionDigest}:{})}
      await readBoundSkuContext({id:userId,type:'HUMAN'},{...ctx.binding,...(kind==='creative_adaptation'?{decisionDigest:body.decisionDigest}:{})})
    }
  }else if(kind==='conversation'){intent={...common,kind,...conversationInput(body)}}else if(kind==='autopilot'){if(key!==`autopilot-${body.runId}`)throw nativeError('autopilot_request_key_required');await autopilotRun(userId,brandId,body.runId);intent={...common,kind,runId:body.runId}}else if(kind==='creative'){
    if(typeof body.creativeId!=='string'||typeof body.month!=='string'||typeof body.expectedRevision!=='string')throw nativeError('invalid_creative_task')
    if(body.draftScript!==undefined&&(typeof body.draftScript!=='string'||!body.draftScript.trim()||body.draftScript.length>20000))throw nativeError('invalid_draft_script')
    if(body.draftMaterialRequirements!==undefined&&(!Array.isArray(body.draftMaterialRequirements)||body.draftMaterialRequirements.length>100||body.draftMaterialRequirements.some((item:unknown)=>typeof item!=='string'||item.length>2000)))throw nativeError('invalid_draft_material_requirements')
    if(body.editMode!==undefined&&(body.editMode!=='materials'||typeof body.draftScript!=='string'||body.adaptToBrand))throw nativeError('invalid_creative_edit_mode')
    intent={...common,kind,...(body.editMode?{editMode:body.editMode}:{}),...(body.draftMaterialRequirements!==undefined?{draftMaterialRequirements:body.draftMaterialRequirements}:{}),...(body.draftScript!==undefined?{draftScript:body.draftScript}:{}),...(autopilotRunId?{autopilotRunId}:{}),requireMaterials:true,...(body.adaptToBrand?{adaptToBrand:true}:{}),creativeId:body.creativeId,month:body.month,expectedRevision:body.expectedRevision}
  }else if(kind==='creative_discovery'){intent={...common,kind,skuWorkflow:true,requireMaterials:true,...(planningRequest?{planningRequest}:{}),...(body.poolIdeaId?{poolIdeaId:body.poolIdeaId}:{}),...(automaticDaily?{automaticDaily:true}:{})}}else{
    if(!await canReadOperations(actor))throw nativeError('operations_access_denied',403)
    intent={...common,kind:'brand_brief'}
  }
  let prior;try{prior=await intentBy(pool,actor,'request_key',key)}catch(e){if((e as any).statusCode!==404)throw e}
  if(prior){if(prior.intent.kind!=='brand_brief'&&prior.intent.kind!=='autopilot'&&prior.intent.kind!=='conversation'&&!prior.intent.requireMaterials&&'requireMaterials' in intent)delete intent.requireMaterials;if(prior.digest!==digest(intent))throw nativeError('request_key_reused',409);const existing=prior.task_id?{id:prior.task_id}:await (app.tasks as PublicTaskIndex).findRequest(actor,'agent.work',key);if(existing){await intentForTask(pool,app,actor,existing.id);return publicTask(app,actor,existing.id)}}
  if(intent.kind==='creative'){
    const current=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,intent.month,intent.creativeId)
    if(current.expectedRevision!==intent.expectedRevision)throw nativeError('creative_revision_conflict',409)
    if(intent.editMode!=='materials'&&['awaiting_sku','sku_confirmed'].includes(current.current?.adaptationStatus))throw nativeError('sku_confirmation_required_use_creative_adaptation',409)
  }
  if((await runtimeConfig()).version!==modelRevision)throw nativeError('model_policy_changed_restart_required',503)
  const row=await admitIntent(pool,actor,intent,host.lane||'default')
  if((row.runtime_lane||'default')!==(host.lane||'default'))return createNativeTask(userId,brandId,body,automaticDaily,autopilotRunId,planningRequest)
  const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:tools.filter(t=>(!['amc.growth_insight','amc.planning_budget','amc.marketing_workspace'].includes(t)||intent.kind==='conversation'&&intent.topic==='brand_planning')&&(!AUTOPILOT_TOOLS.includes(t)||intent.kind==='autopilot')&&(!['amc.creative','amc.operations','amc.library'].includes(t)||t===(intent.kind==='creative'?'amc.creative':intent.kind==='creative_discovery'?'amc.library':['conversation','sku_proposal','creative_adaptation'].includes(intent.kind)?'':'amc.operations')))},{actor,callId:key})
  await pool.query('UPDATE amc_ai_requests SET task_id=$1 WHERE id=$2 AND (task_id IS NULL OR task_id=$1)',[receipt.id,row.id])
  const task=await publicTask(app,actor,receipt.id)
  if(intent.kind==='conversation')wakeConversationWorker(app)
  return task
}
async function publicTask(app:Application,actor:NativeActor,id:string){
  return projectTask({...await app.runtime.state(actor,id),result:null,inputRequest:null,trusted_context:null})
}
function projectTask(task:TaskView){
  return {id:task.id,status:task.status,waitingReason:task.waiting_reason,inputRequest:task.inputRequest,result:task.result,goal:task.input.goal,version:task.version,updatedAt:task.updated_at}
}
export async function listNativeTasks(userId:string,brandId:string,cursor?:string){
  const {actor,app,pool}=await authorizedHost(userId,brandId)
  const cursors=laneCursors(cursor)
  const readPage=async(lane:RuntimeLane)=>{
    if(cursors[lane]===null)return {items:[],nextCursor:null}
    const selected=lane==='default'?{app,pool}:await getNativeHost(true,lane)
    const page=await selected.app.dispatcher.invoke('tasks.list',{limit:20,...(cursors[lane]?{cursor:cursors[lane]}:{})},{actor}) as {items:Array<{id:string}>;nextCursor:string|null}
    const items=await Promise.all(page.items.map(async item=>{const row=await intentForTask(selected.pool,selected.app,actor,item.id);return {...item,createdAt:row.created_at,goal:row.intent.goal,kind:row.intent.kind,creativeId:row.intent.kind==='creative'?row.intent.creativeId:null}}))
    return {items,nextCursor:page.nextCursor}
  }
  const [background,conversation]=await Promise.all([readPage('default'),readPage('conversation')])
  const items=[...background.items,...conversation.items]
  const listing={nextCursor:nextLaneCursor({default:background.nextCursor,conversation:conversation.nextCursor})}
  if(!cursor){
    const dailyActor=dailyActorFor(brandId,userId)
    try{
      await requireActor(dailyActor)
      const daily=await app.dispatcher.invoke('tasks.list',{limit:20},{actor:dailyActor}) as {items:Array<{id:string}>}
      for(const item of daily.items){const row=await intentForTask(pool,app,dailyActor,item.id);items.push({...item,createdAt:row.created_at,goal:'每日自动策划 · '+row.intent.goal,kind:row.intent.kind,creativeId:null} as any)}
    }catch{/* A normal brand collaborator need not have principal delegation. */}
  }
  items.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
  return {page:{...listing,items},coreVersion:CORE_VERSION,limits:USAGE_POLICY}
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
  const host=await taskHost(userId,brandId,id)
  const row=await intentForTask(host.pool,host.app,host.actor,id)
  return readNativeTaskResult(host,userId,brandId,id,row)
}
export async function readNativeTaskStatus(userId:string,brandId:string,id:string){
  const host=await taskHost(userId,brandId,id)
  const row=await intentForTask(host.pool,host.app,host.actor,id)
  return await activeConversationStatus(host.app,host.actor,id,row.intent.kind)||readNativeTaskResult(host,userId,brandId,id,row)
}
async function readNativeTaskResult({actor,app}:Awaited<ReturnType<typeof taskHost>>,userId:string,brandId:string,id:string,row:Awaited<ReturnType<typeof intentForTask>>){
  const view=await nativeTaskHistory(app,actor,id),history=view.history,task=projectTask(history)
  // Read usage after the result snapshot: otherwise completion can race an earlier pending ledger read.
  const usage=await app.ledger.taskUsage(await app.scope(actor),id)
  let candidate=null,report=null,recommendations=null,artifact:ArtifactReference|null=null,skuAdoption=null
  if(task.status==='succeeded'&&task.result){
    artifact=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)||null
    if(artifact){const content=(await (app.workspace as WorkspacePort).read(actor,artifact)).content;if(row.intent.kind==='creative')candidate=candidateFrom(content,row.intent);else if(row.intent.kind==='creative_discovery')recommendations=discoveryFrom(content,row.intent);else if(row.intent.kind==='brand_brief')report=briefFrom(content,row.intent);else if(row.intent.kind==='conversation')report=conversationFrom(content,row.intent);else report=JSON.parse(content)}
  }
  const sourceInsight=conversationInsight(history.calls)
  if(artifact&&(row.intent.kind==='sku_proposal'||row.intent.kind==='creative_adaptation')){
    skuAdoption=row.intent.kind==='creative_adaptation'?await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId):null
    if(skuAdoption){candidate={...report,historical:true};report=null}
    else{
      const validated=await validateSkuArtifact((await (app.workspace as WorkspacePort).read(actor,artifact)).content,row.intent)
      if(row.intent.kind==='sku_proposal')report=validated.result
      else{candidate=validated.result;report=null}
    }
  }
  const insight=row.intent.kind==='conversation'&&sourceInsight?{status:sourceInsight.status,reportVersionId:sourceInsight.reportVersionId||null,partial:sourceInsight.partial===true,generatedAt:typeof sourceInsight.generatedAt==='string'?sourceInsight.generatedAt:null}:null
  const operations=history.calls.find(c=>c.capability==='amc.operations'&&c.status==='succeeded')?.result as {draftTotal?:number;accountTotal?:number;operationsDigest?:string;retrievedAt?:string}|undefined
  const currentOperations=report&&typeof operations?.draftTotal==='number'&&typeof operations?.accountTotal==='number'?{draftTotal:operations.draftTotal,accountTotal:operations.accountTotal,retrievedAt:operations.retrievedAt,changed:operations.operationsDigest!==report.operationsDigest}:null
  const sourceCall=history.calls.find(c=>c.capability==='amc.creative'&&c.status==='succeeded')?.result as {current?:unknown}|undefined
  const adoptions=row.intent.kind==='creative_discovery'?await recommendationReceipts(userId,brandId,id):[]
  const adoption=skuAdoption||(row.intent.kind==='creative'&&row.intent.adaptToBrand?await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId):null)
  const library=history.calls.slice().reverse().find(c=>c.capability==='amc.library'&&c.status==='succeeded')?.result as LibrarySnapshot|undefined
  return {...task,...(row.intent.kind==='conversation'?{progress:conversationProgress(task.status,history.calls,!!view.historyUnavailable)}:{}),insight,automaticDaily:row.intent.kind==='creative_discovery'&&row.intent.automaticDaily===true,historyUnavailable:view.historyUnavailable,kind:row.intent.kind,candidate,report,recommendations,adoptions,adoption,library:library?{retrievedAt:library.retrievedAt,sources:library.sources}:null,artifact,usage,currentOperations,original:sourceCall?.current||null,...(['creative','sku_proposal','creative_adaptation'].includes(row.intent.kind)&&'creativeId' in row.intent?{creativeId:row.intent.creativeId,month:row.intent.month,adaptToBrand:row.intent.kind==='creative'&&row.intent.adaptToBrand===true}:{})}
}
export async function controlNativeTask(userId:string,brandId:string,id:string,body:any){
  const {actor,app}=await taskHost(userId,brandId,id)
  if(!['cancel','resume','provide_input','control_result'].includes(body?.action))throw nativeError('invalid_task_action')
  const key=requestKey(body.requestKey)
  if(['resume','provide_input'].includes(body.action))assertUsageSettled(await app.ledger.taskUsage(await app.scope(actor),id))
  const input={id,...(body.action==='provide_input'?{input:body.input}:{}),...(body.action==='control_result'?{requestKey:key}:{})}
  const receipt=await app.dispatcher.invoke(`tasks.${body.action}`,input,{actor,callId:key})
  return {receipt,task:await app.runtime.state(actor,id).then(t=>({id:t.id,status:t.status,waitingReason:t.waiting_reason}))}
}
export async function adoptNativeCandidate(userId:string,brandId:string,id:string,body:any,autopilotRunId?:string){
  const {actor,app,pool}=await authorizedHost(userId,brandId)
  if(autopilotRunId)await autopilotRun(userId,brandId,autopilotRunId)
  requestKey(body?.requestKey)
  if(body.saveMode!==undefined&&!['copy','overwrite'].includes(body.saveMode))throw nativeError('invalid_script_save_mode')
  const task=await app.runtime.get(actor,id,{history:true})
  if(task.status!=='succeeded'||!task.result)throw nativeError('candidate_not_ready',409)
  const row=await intentForTask(pool,app,actor,id),ref=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)
  if(!ref||body.artifactDigest!==ref.digest)throw nativeError('candidate_changed',409)
  if(row.intent.kind==='creative_discovery'){
    const library=task.calls.slice().reverse().find(c=>c.capability==='amc.library'&&c.status==='succeeded')?.result as LibrarySnapshot|undefined
    if(!library)throw nativeError('recommendation_source_mismatch',409)
    return saveRecommendation(userId,brandId,id,row.intent,ref,(await (app.workspace as WorkspacePort).read(actor,ref)).content,library,body)
  }
  if(row.intent.kind==='sku_proposal')throw nativeError('human_sku_confirmation_required',409)
  if(row.intent.kind==='creative_adaptation'){
    if(body.patch!==undefined||body.saveMode!==undefined)throw nativeError('adaptation_artifact_must_be_adopted_exactly')
    const prior=await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId)
    if(prior)return {...prior,replayed:true}
    const {result,ctx}=await validateSkuArtifact((await (app.workspace as WorkspacePort).read(actor,ref)).content,row.intent)
    const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,{expectedRevision:row.intent.expectedRevision,idempotencyKey:`sku-adapt-${digest([id,ref.digest])}`,patch:result.patch},undefined,{...(autopilotRunId?{autopilotRunId}:{}),taskId:id,agentId:'amc-mm-user-ai',requestedBy:userId,contextDigest:result.contextDigest,artifact:ref,skuBinding:{...row.intent,decisionDigest:row.intent.decisionDigest!},skuSource:ctx.source})
    const verified=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,saved.receipt.id)
    if(verified.revisions[0]?.contentHash!==saved.receipt.contentHash)throw nativeError('creative_save_unverified',503)
    return {verified:true,receipt:saved.receipt,month:row.intent.month,creativeId:row.intent.creativeId}
  }
  if(row.intent.kind!=='creative')throw nativeError('creative_task_required',400)
  if(row.intent.adaptToBrand){
    const prior=await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId)
    if(prior)return {...prior,replayed:true}
    throw nativeError('sku_confirmation_required_use_creative_adaptation',409)
  }
  const candidate=candidateFrom((await (app.workspace as WorkspacePort).read(actor,ref)).content,row.intent)
  const reviewed=body.patch===undefined?candidate.patch:body.patch
  if(!reviewed||Object.keys(reviewed).some(k=>!['title','planning','aiCaption','aiTags','product','materialRequirements'].includes(k)))throw nativeError('candidate_patch_invalid')
  if(row.intent.requireMaterials&&row.intent.adaptToBrand&&(!Array.isArray(reviewed.materialRequirements)||!reviewed.materialRequirements.some((item:unknown)=>typeof item==='string'&&item.trim())))throw nativeError('material_requirements_required')
  const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,{expectedRevision:row.intent.expectedRevision,idempotencyKey:body.saveMode?`ai-${digest([id,ref.digest,body.requestKey])}`:`ai-${digest([id,ref.digest])}`,...(body.saveMode?{saveMode:body.saveMode}:{}),patch:reviewed,feedback:body.feedback},undefined,{instruction:row.intent.goal,taskId:id,agentId:'amc-mm-user-ai',artifact:ref,requestedBy:userId,contextDigest:candidate.contextDigest})
  const verified=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,row.intent.month,saved.receipt.content.id,saved.receipt.id)
  if(verified.revisions[0]?.contentHash!==saved.receipt.contentHash)throw nativeError('creative_save_unverified',503)
  return {verified:true,receipt:saved.receipt,month:row.intent.month,creativeId:saved.receipt.content.id}
}

export async function nativePreference(userId:string,brandId:string,body?:unknown){
  const {actor,app}=await authorizedHost(userId,brandId)
  const preference=body?await changePreference(app,actor,body):await readPreference(app,actor)
  const facts=await brandContext(actor)
  if(!facts)throw nativeError('brand_context_unavailable',404)
  return preferenceSettings(preference,facts)
}

export async function adoptNativePlanningDraft(userId:string,brandId:string,taskId:string){
 const task=await readNativeTask(userId,brandId,taskId)
 const draft=task.kind==='conversation'&&task.status==='succeeded'?(task.report as any)?.planningDraft:null
 if(!draft)throw nativeError('planning_draft_unavailable',409)
 return savePlanningDraft(userId,brandId,taskId,draft)
}
