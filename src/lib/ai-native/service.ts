import {videoInput,videoProgress,videoDigest,serializeVideo,validateVideoArtifact} from './video-rewrite'
import {videoReviewPath} from './video-review'
import {readVideoRewriteFacts} from './facts'
import {dailyGate,sweepLifecycle} from './task-lifecycle.mjs'
import {NATIVE_RUNTIME_LIMITS} from './assistant-policy'
import {AMC_CONTEXT_MAX_BYTES} from './runtime-application.mjs'
import {inspectAssistantHistory,inspectAssistantUsage} from './assistant-inspection'
import {agentSkills,readAgentSkill} from '../agent-skills/store'
import {USER_AI} from '../agent-skills/catalog'
import {strategyChanges} from './strategy-receipt'
import {creativeIsSelected} from '../brand-plan/creativeVisibility'
import {prisma} from '../prisma'
import {createHash} from 'node:crypto'
import {laneCursors,nextLaneCursor} from './runtime-routing'
import {activeConversationStatus,wakeConversationWorker} from './conversation-status'
import {conversationProgress,conversationInsight,planningWriteRecovery} from './conversation-progress'
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
import { conversationFrom, conversationInput, actorFor, dailyActorFor, candidateFrom, briefFrom, digest, sameSkuIntent, nativeError, requestKey, USAGE_POLICY, CORE_VERSION, type NativeActor, type NativeIntent } from './contract'
import { readCreativeRevisions, saveCreativeRevision,readCreativeQualityReview } from '../brand-plan/creativeRevisions'
import {assertPassedQualityReview} from '../brand-plan/creativeFidelity'
import { canReadOperations } from './operations'
import { runtimeConfig } from '../model-management/registry'
import {readSkuContext,readBoundSkuContext} from '../brand-plan/creativeSkuDecision'
import {validateSkuArtifact} from './sku-workflow'
import {assertModelHistory} from '@immedi/iaic-core/capabilities/visibility.js'
import type {Capability,History} from '@immedi/iaic-core/capabilities/index.js'

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
        const models=await centralModels(),{app,tools}=await composeApplication(pool,models,{taskPool,requestExecutorHandoff:start})
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
  const sweep=dailyGate(async()=>{const host=await getNativeHost();await sweepLifecycle(host.pool,await applicationVersion())})
  const maintainAll=()=>{void maintain('default');void maintain('conversation');void sweep()}
  maintainAll()
  const timer=setInterval(maintainAll,60000);timer.unref()
  let saving=false
  const saves=setInterval(()=>{if(saving||globalState.amcNativeStopping)return;saving=true;void finalizePlanningTasks().catch(()=>{}).finally(()=>{saving=false})},15000);saves.unref()
  process.once('SIGTERM',()=>{globalState.amcNativeStopping=true;clearInterval(timer);clearInterval(saves);void Promise.allSettled((['default','conversation'] as const).map(async lane=>{const pending=globalState[hostKey(lane)];if(!pending)return;const host=await pending.catch(()=>null);if(host){const result=await host.app.runtime.drain({timeoutMs:20000});if(result.drained)await closeHostPools(host)}}))})
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
  if(!body||typeof body!=='object'||Array.isArray(body)||body.kind!==undefined&&typeof body.kind!=='string'||body.adaptToBrand!==undefined&&typeof body.adaptToBrand!=='boolean')throw nativeError('invalid_input')
  body={...body,kind:body.kind===undefined?'creative':body.kind}
  if(body.kind==='creative'&&body.adaptToBrand===true)throw nativeError('sku_confirmation_required_use_sku_proposal',409)
  let host=await authorizedHost(userId,brandId,automaticDaily)
  if(body?.kind==='conversation'){
    let prior;try{prior=await intentBy(host.pool,host.actor,'request_key',requestKey(body.requestKey))}catch(error){if((error as {statusCode?:number}).statusCode!==404)throw error}
    if(!prior||prior.runtime_lane==='conversation')host={...host,...await getNativeHost(true,'conversation')}
  }
  const {actor,pool,app,tools,modelRevision}=host
  // Wait before admitting planning work until this process owns the sole Core
  // executor. Otherwise the retiring executor can claim a new-version task
  // and pause it before its first model call. Same request keys remain reusable.
  if((body.kind==='video_rewrite'||automaticDaily||planningRequest||body.kind==='conversation'&&body.topic==='brand_planning')&&!(await app.runtime.deploymentState()).ownsExecutor)throw nativeError('daily_executor_standby',503)
  if(autopilotRunId)await autopilotRun(userId,brandId,autopilotRunId)
  if(automaticDaily||body?.kind==='creative_discovery'&&body.proactive===true)throw nativeError('interactive_keyword_matching_only',409)
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
  const kind=body.kind
  if(!['creative','brand_brief','creative_discovery','autopilot','conversation','sku_proposal','creative_adaptation','video_rewrite'].includes(kind))throw nativeError('invalid_task_kind')
  const common={brandId,userId,goal:body.goal.trim(),requestKey:key,artifactPath:`work/${digest([actor,key])}.json`}
  let intent:NativeIntent
  if(kind==='video_rewrite'){
    const fields=videoInput(body)
    if(fields.predecessorTaskId){const predecessor=await intentForTask(pool,app,actor,fields.predecessorTaskId);if(predecessor.intent.kind!=='video_rewrite')throw nativeError('invalid_video_predecessor',409)}
    let old;try{old=await intentBy(pool,actor,'request_key',key)}catch(e){if((e as any).statusCode!==404)throw e}
    if(old){
      if(old.intent.kind!=='video_rewrite'||videoDigest({...old.intent,...common,...fields})!==videoDigest(old.intent))throw nativeError('request_key_reused',409)
      intent=old.intent
    }else{
      const facts=await readVideoRewriteFacts(prisma,brandId)
      if(!facts)throw nativeError('brand_not_found',404)
      intent={...common,...fields,kind:'video_rewrite',facts,factsDigest:videoDigest(facts)}
    }
  }else if(kind==='sku_proposal'||kind==='creative_adaptation'){
    if(kind==='creative_adaptation'&&(typeof body.decisionDigest!=='string'||!/^[a-f0-9]{64}$/.test(body.decisionDigest)))throw nativeError('sku_confirmation_required',409)
    let existing
    try{existing=await intentBy(pool,actor,'request_key',key)}catch(error){if((error as any).statusCode!==404)throw error}
    if(existing){
      const saved=existing.intent
      if((saved.kind!=='sku_proposal'&&saved.kind!=='creative_adaptation')||saved.kind!==kind)throw nativeError('request_key_reused',409)
      // Only these normalized request fields come from the caller. Catalog and
      // source pins remain the admitted server snapshot, even after it changes.
      const requested={...saved,...common,creativeId:body.creativeId,month:body.month,expectedRevision:body.expectedRevision,decisionDigest:body.decisionDigest,autopilotRunId}
      if(!sameSkuIntent(saved,requested))throw nativeError('request_key_reused',409)
      intent=saved
    }else{
      const ctx=await readSkuContext({id:userId,type:'HUMAN'},brandId,body.month,body.creativeId)
      if(!creativeIsSelected(ctx.current.current))throw nativeError('idea_not_selected_for_calendar',409)
      if(!ctx.current.canOverwrite)throw nativeError('creative_edit_forbidden',403)
      if(body.expectedRevision!==ctx.binding.expectedRevision)throw nativeError('creative_revision_conflict',409)
      intent={...common,...ctx.binding,kind,...(autopilotRunId?{autopilotRunId}:{}),...(kind==='creative_adaptation'?{decisionDigest:body.decisionDigest}:{})}
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
  if(intent.kind==='conversation'&&intent.afterTaskId){
    const predecessor=await taskHost(userId,brandId,intent.afterTaskId)
    const previous=await intentForTask(predecessor.pool,predecessor.app,actor,intent.afterTaskId)
    if(previous.intent.kind!=='conversation'||!intent.conversationId||(previous.intent.conversationId||previous.intent.contextSessionId)!==intent.conversationId||previous.runtime_lane!=='conversation')throw nativeError('conversation_predecessor_mismatch',409)
  }
  let prior;try{prior=await intentBy(pool,actor,'request_key',key)}catch(e){if((e as any).statusCode!==404)throw e}
  const skuIntent=intent.kind==='sku_proposal'||intent.kind==='creative_adaptation'
  if(prior){
    if(!skuIntent&&prior.intent.kind!=='brand_brief'&&prior.intent.kind!=='autopilot'&&prior.intent.kind!=='conversation'&&prior.intent.kind!=='video_rewrite'&&!prior.intent.requireMaterials&&'requireMaterials' in intent)delete intent.requireMaterials
    if(skuIntent?!sameSkuIntent(prior.intent,intent):intent.kind==='video_rewrite'?videoDigest(prior.intent)!==videoDigest(intent):prior.digest!==digest(intent))throw nativeError('request_key_reused',409)
    const existing=prior.task_id?{id:prior.task_id}:await (app.tasks as PublicTaskIndex).findRequest(actor,'agent.work',key)
    if(existing){await intentForTask(pool,app,actor,existing.id);return publicTask(app,actor,existing.id)}
  }
  if(intent.kind==='conversation'){
    const required=intent.topic==='brand_planning'?'amc-marketing-expert/SKILL.md':'amc-conversation/SKILL.md'
    try{await readAgentSkill(USER_AI,required)}catch(e){if((e as any).statusCode===404)throw nativeError('required_skill_not_installed',409);throw e}
  }
  if(intent.kind==='creative'){
    const current=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,intent.month,intent.creativeId)
    if(!creativeIsSelected(current.current))throw nativeError('idea_not_selected_for_calendar',409)
    if(current.expectedRevision!==intent.expectedRevision)throw nativeError('creative_revision_conflict',409)
    if(intent.editMode!=='materials'&&['awaiting_sku','sku_confirmed'].includes(current.current?.adaptationStatus))throw nativeError('sku_confirmation_required_use_creative_adaptation',409)
  }
  if((await runtimeConfig()).version!==modelRevision)throw nativeError('model_policy_changed_restart_required',503)
  // An admitted SKU request may not yet have reached Core. Resume it with the
  // same identity and stored digest instead of re-admitting its JSONB readback.
  const row=(skuIntent||intent.kind==='video_rewrite')&&prior?prior:await admitIntent(pool,actor,intent,host.lane||'default',async(id,connection)=>(await connection.query(`SELECT status FROM ${host.lane==='conversation'?'amc_iaic_conversation':'amc_iaic'}.iaic_tasks WHERE id=$1 AND employee_id=$2 AND erp_user=$3`,[id,actor.scopeId,actor.subjectId])).rows[0]?.status||'missing')
  if(row.request_key!==key){if(row.task_id)return publicTask(app,actor,row.task_id);throw nativeError('task_admission_pending_retry',503)}
  if((row.runtime_lane||'default')!==(host.lane||'default'))return createNativeTask(userId,brandId,body,automaticDaily,autopilotRunId,planningRequest)
  const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:tools.filter(t=>(t!=='amc.documents'||intent.kind==='conversation')&&(intent.kind!=='video_rewrite'||['tasks.plan.read','tasks.plan.update','assistant.skills.list','assistant.skills.read','my_write_workspace','my_read_workspace','amc.context','amc.video_facts','amc.video_review'].includes(t))&&(!['amc.video_review','amc.video_facts'].includes(t)||intent.kind==='video_rewrite')&&(!['amc.growth_insight','amc.planning_budget','amc.marketing_workspace'].includes(t)||intent.kind==='conversation'&&intent.topic==='brand_planning')&&(!AUTOPILOT_TOOLS.includes(t)||intent.kind==='autopilot')&&(!['amc.creative','amc.operations','amc.library'].includes(t)||t===(intent.kind==='creative'?'amc.creative':intent.kind==='creative_discovery'?'amc.library':['conversation','sku_proposal','creative_adaptation','video_rewrite'].includes(intent.kind)?'':'amc.operations')))},{actor,callId:key})
  await pool.query('UPDATE amc_ai_requests SET task_id=$1 WHERE id=$2 AND (task_id IS NULL OR task_id=$1)',[receipt.id,row.id])
  const task=await publicTask(app,actor,receipt.id)
  wakeConversationWorker(app)
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
    const items=await Promise.all(page.items.map(async item=>{const row=await intentForTask(selected.pool,selected.app,actor,item.id);return {...item,createdAt:row.created_at,goal:row.intent.goal,kind:row.intent.kind,conversationId:row.intent.kind==='conversation'?(row.intent.conversationId||row.intent.contextSessionId||null):null,creativeId:row.intent.kind==='creative'?row.intent.creativeId:null}}))
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
// Status/control remain available on revision conflict. Terminal SKU display may
// use fixed evidence, but never bypasses current task/Host/capability authority.
export async function nativeTaskHistory(app:Application,actor:NativeActor,id:string,terminalSnapshot=false){
  let live:TaskView&History,stale=false
  try{live=await app.runtime.get(actor,id,{history:true})}
  catch(error){
    if(Number((error as any).statusCode??(error as any).status)!==409)throw error
    stale=true
    live={...await app.runtime.state(actor,id),result:null,inputRequest:null,trusted_context:null,calls:[],events:[]}
  }
  if(terminalSnapshot&&['succeeded','failed','cancelled'].includes(live.status)){
    // Current task/Host identity authorization above remains mandatory. For
    // display only, retain immutable evidence instead of refreshing old context.
    const store=app.tasks as unknown as {get(actor:NativeActor,id:string):Promise<TaskView>;history(actor:NativeActor,id:string):Promise<History>}
    const fixed=await store.get(actor,id),records=await store.history(actor,id)
    assertModelHistory(records,app.dispatcher)
    if(!stale){
      // Core returns the currently revalidated host digest. Compare it with the
      // durable call's digest, never mutable copy or heuristics about text.
      for(const call of records.calls.filter(c=>c.capability==='amc.context'&&c.status==='succeeded')){
        const original=(call.result as {contextDigest?:unknown})?.contextDigest
        const current=(live.calls.find(c=>c.id===call.id&&c.capability==='amc.context'&&c.status==='succeeded')?.result as {contextDigest?:unknown})?.contextDigest
        if(typeof original!=='string'||!/^[a-f0-9]{64}$/.test(original)||current!==original)stale=true
      }
    }
    const calls=[]
    for(const call of records.calls){
      const capability=app.dispatcher.capabilities.get(call.capability)! as Capability<unknown,unknown,NativeActor>
      if(await capability.authorize(actor,call.input)!==true)throw nativeError('historical_call_forbidden',403)
      const input=typeof capability.projectHistoryInput==='function'?await capability.projectHistoryInput(structuredClone(call.input),{actor,callId:String(call.id),status:call.status}):call.input
      if(capability.projectHistoryInput&&(!input||typeof input!=='object'||Array.isArray(input)))throw nativeError('invalid_history_input_projection',503)
      calls.push({...call,input,...(capability.projectHistoryInput?{inputProjected:true}:{})})
    }
    return {history:{...fixed,inputRequest:null,...records,calls},historyUnavailable:null,contextState:stale?'stale':'was_current'}
  }
  return stale?{history:{...live,result:null,inputRequest:null,trusted_context:null,calls:[],events:[]},historyUnavailable:'revision_conflict',contextState:'stale'}:{history:live,historyUnavailable:null,contextState:null}
}
export async function readNativeTask(userId:string,brandId:string,id:string){
  const host=await taskHost(userId,brandId,id)
  const row=await intentForTask(host.pool,host.app,host.actor,id)
  return row.intent.kind==='conversation'?readConversationSnapshot(host,userId,brandId,id,row):readNativeTaskResult(host,userId,brandId,id,row)
}
export async function readNativeTaskStatus(userId:string,brandId:string,id:string){
  const host=await taskHost(userId,brandId,id)
  const row=await intentForTask(host.pool,host.app,host.actor,id)
  const active=await activeConversationStatus(host.app,host.actor,id,row.intent.kind)
  return (active?{...active,preview:row.conversation_preview?{text:row.conversation_preview,verified:false}:null}:null)||(row.intent.kind==='conversation'?readConversationSnapshot(host,userId,brandId,id,row):readNativeTaskResult(host,userId,brandId,id,row))
}

/** Completed conversation artifacts are immutable history. Revalidate ownership,
 * not old source freshness after the strategy itself has advanced the revision. */
async function readConversationSnapshot(host:Awaited<ReturnType<typeof taskHost>>,userId:string,brandId:string,id:string,row:Awaited<ReturnType<typeof intentForTask>>){
 if(row.intent.kind!=='conversation')throw nativeError('conversation_required',409)
 const {app,actor,pool}=host
 const state=await app.runtime.state(actor,id)
 const raw=await (app.tasks as any).get(actor,id)
 const history=await (app.tasks as any).history(actor,id)
 let report=null,planningSave:any=null
 if(state.status==='succeeded'){
  const ref=raw.result?.artifacts?.find((a:ArtifactReference)=>a.path===row.intent.artifactPath)
  if(!ref)throw nativeError('reply_unavailable',503)
  report=conversationFrom((await (app.workspace as WorkspacePort).read(actor,ref)).content,row.intent)
  if(row.intent.autoSavePlanning){
   if(report.planningDraft?.scope.stage==='marketing_plan')planningSave=await finalizePlanningResult(pool,userId,brandId,id,report.planningDraft,history.calls)
   else{planningSave={state:'not_changed',verified:false};await pool.query('UPDATE amc_ai_requests SET planning_result=$1 WHERE task_id=$2 AND subject_id=$3',[JSON.stringify(planningSave),id,userId])}
  }
 }
 const usage=await app.ledger.taskUsage(await app.scope(actor),id)
 const source=conversationInsight(history.calls)
 return {id,version:state.version,inputRequest:null,candidate:null,artifact:null,month:undefined,creativeId:undefined,status:state.status,waitingReason:state.waiting_reason,kind:'conversation',goal:row.intent.goal,updatedAt:state.updated_at,report,planningSave,usage,historyUnavailable:null,progress:conversationProgress(state.status,history.calls),planningRecovery:planningWriteRecovery(row.intent,state.status,state.waiting_reason||undefined,history.calls),insight:source?{status:source.status,reportVersionId:source.reportVersionId,partial:source.partial,generatedAt:source.generatedAt}:null}
}

async function readNativeTaskResult({actor,app,pool}:Awaited<ReturnType<typeof taskHost>>,userId:string,brandId:string,id:string,row:Awaited<ReturnType<typeof intentForTask>>){
  const view=await nativeTaskHistory(app,actor,id,['sku_proposal','creative_adaptation','video_rewrite'].includes(row.intent.kind)),history=view.history,task=projectTask(history)
  // Read usage after the result snapshot: otherwise completion can race an earlier pending ledger read.
  const usage=await app.ledger.taskUsage(await app.scope(actor),id)
  const qualityReview=row.intent.kind==='creative_adaptation'?await readCreativeQualityReview({id:userId,type:'HUMAN'},brandId,id):null
  let candidate=null,report=null,recommendations=null,artifact:ArtifactReference|null=null,skuAdoption=null
  if(task.status==='succeeded'&&task.result){
    artifact=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)||null
    if(artifact){const content=(await (app.workspace as WorkspacePort).read(actor,artifact)).content;if(row.intent.kind==='creative')candidate=candidateFrom(content,row.intent);else if(row.intent.kind==='creative_discovery')recommendations=discoveryFrom(content,row.intent);else if(row.intent.kind==='brand_brief')report=briefFrom(content,row.intent);else if(row.intent.kind==='conversation')report=conversationFrom(content,row.intent);else if(row.intent.kind==='video_rewrite'){try{report=JSON.parse(content)}catch{report={rawDraft:content}}}else report=qualityReview?.status==='needs_revision'?qualityReview.attempts.at(-1)!.adapted:JSON.parse(content)}
  }
  if(row.intent.kind==='video_rewrite'&&artifact){
    const review=JSON.parse((await (app.workspace as WorkspacePort).read(actor,{path:videoReviewPath(id,artifact.revision)})).content)
    if(review.artifactDigest!==artifact.digest||review.artifactRevision!==artifact.revision)throw nativeError('video_review_stale',409)
    Object.assign(task,{qualityReview:review,...(review.status!=='passed'?{status:'needs_revision'}:{})})
    if(review.status==='passed')report={...report,script:serializeVideo(validateVideoArtifact(JSON.stringify(report),row.intent).artifact),qualityReview:review,baseEditorRevision:row.intent.editorRevision,originalScriptUnchanged:true}
  }
  const sourceInsight=conversationInsight(history.calls)
  if(qualityReview)Object.assign(task,{runtimeStatus:task.status,qualityReview,...(qualityReview.status==='needs_revision'?{status:'needs_revision'}:{})})
  if(artifact&&(row.intent.kind==='sku_proposal'||row.intent.kind==='creative_adaptation')){
    skuAdoption=row.intent.kind==='creative_adaptation'?await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId):null
    // Succeeded artifacts were verified against this task's fixed context.
    // Reading them is not a new adoption; that operation revalidates live data.
    if(row.intent.kind==='sku_proposal')report={...report,historical:true,contextState:view.contextState}
    else{candidate={...report,historical:true,contextState:view.contextState,qualityReview};report=null}
  }
  const insight=row.intent.kind==='conversation'&&sourceInsight?{status:sourceInsight.status,reportVersionId:sourceInsight.reportVersionId||null,partial:sourceInsight.partial===true,generatedAt:typeof sourceInsight.generatedAt==='string'?sourceInsight.generatedAt:null}:null
  const operations=history.calls.find(c=>c.capability==='amc.operations'&&c.status==='succeeded')?.result as {draftTotal?:number;accountTotal?:number;operationsDigest?:string;retrievedAt?:string}|undefined
  const currentOperations=report&&typeof operations?.draftTotal==='number'&&typeof operations?.accountTotal==='number'?{draftTotal:operations.draftTotal,accountTotal:operations.accountTotal,retrievedAt:operations.retrievedAt,changed:operations.operationsDigest!==report.operationsDigest}:null
  const sourceCall=history.calls.find(c=>c.capability==='amc.creative'&&c.status==='succeeded')?.result as {current?:unknown}|undefined
  const adoptions=row.intent.kind==='creative_discovery'?await recommendationReceipts(userId,brandId,id):[]
  const adoption=skuAdoption||(row.intent.kind==='creative'&&row.intent.adaptToBrand?await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId):null)
  const library=history.calls.slice().reverse().find(c=>c.capability==='amc.library'&&c.status==='succeeded')?.result as LibrarySnapshot|undefined
  const contextSnapshot=row.intent.kind==='sku_proposal'||row.intent.kind==='creative_adaptation'?history.calls.find(c=>c.capability==='amc.context'&&c.status==='succeeded')?.result||null:null
  const planningSave=row.intent.kind==='conversation'&&row.intent.autoSavePlanning&&task.status==='succeeded'&&report?.planningDraft?.scope.stage==='marketing_plan'?await finalizePlanningResult(pool,userId,brandId,id,report.planningDraft,history.calls):null
  return {...task,planningSave,planningRecovery:planningWriteRecovery(row.intent,task.status,task.waitingReason||undefined,history.calls),...(row.intent.kind==='video_rewrite'?{progress:{stage:videoProgress(task.status,history.calls)}}:{}),...(row.intent.kind==='conversation'?{progress:conversationProgress(task.status,history.calls,!!view.historyUnavailable)}:{}),insight,automaticDaily:row.intent.kind==='creative_discovery'&&row.intent.automaticDaily===true,historyUnavailable:view.historyUnavailable,contextState:view.contextState,contextSnapshot,kind:row.intent.kind,autopilotRunId:'autopilotRunId' in row.intent?row.intent.autopilotRunId:null,candidate,report,recommendations,adoptions,adoption,library:library?{retrievedAt:library.retrievedAt,sources:library.sources}:null,artifact,usage,currentOperations,original:sourceCall?.current||null,...(['creative','sku_proposal','creative_adaptation'].includes(row.intent.kind)&&'creativeId' in row.intent?{creativeId:row.intent.creativeId,month:row.intent.month,adaptToBrand:row.intent.kind==='creative'&&row.intent.adaptToBrand===true}:{})}
}
export async function controlNativeTask(userId:string,brandId:string,id:string,body:any){
  const {actor,app,pool}=await taskHost(userId,brandId,id)
  if(!['cancel','resume','provide_input','control_result'].includes(body?.action))throw nativeError('invalid_task_action')
  const key=requestKey(body.requestKey)
  if(['resume','provide_input'].includes(body.action)){
    const row=await intentForTask(pool,app,actor,id)
    if(row.intent.kind==='creative_discovery'&&row.intent.automaticDaily)throw nativeError('interactive_keyword_matching_only',409)
  }
  if(['resume','provide_input'].includes(body.action))assertUsageSettled(await app.ledger.taskUsage(await app.scope(actor),id))
  const input={id,...(body.action==='provide_input'?{input:body.input}:{}),...(body.action==='control_result'?{requestKey:key}:{})}
  const receipt=await app.dispatcher.invoke(`tasks.${body.action}`,input,{actor,callId:key})
  if(['resume','provide_input'].includes(body.action))wakeConversationWorker(app)
  return {receipt,task:await app.runtime.state(actor,id).then(t=>({id:t.id,status:t.status,waitingReason:t.waiting_reason}))}
}
export async function adoptNativeCandidate(userId:string,brandId:string,id:string,body:any,autopilotRunId?:string){
  const {actor,app,pool}=await authorizedHost(userId,brandId)
  if(autopilotRunId)await autopilotRun(userId,brandId,autopilotRunId)
  const adoptionKey=requestKey(body?.requestKey)
  if(body.saveMode!==undefined&&!['copy','overwrite'].includes(body.saveMode))throw nativeError('invalid_script_save_mode')
  // Core's scoped task store and immutable trusted binding prove ownership
  // without revalidating a source revision changed by our own successful save.
  const row=await intentForTask(pool,app,actor,id)
  const boundRunId='autopilotRunId' in row.intent?row.intent.autopilotRunId:undefined
  if(autopilotRunId&&boundRunId!==autopilotRunId)throw nativeError('autopilot_task_binding_mismatch',409)
  if(boundRunId)await autopilotRun(userId,brandId,boundRunId)
  let adoptionRequest:{requestKey:string;payloadDigest:string}|undefined
  if(row.intent.kind==='creative_adaptation'){
    await app.runtime.state(actor,id)
    if(Object.keys(body).some(key=>!['requestKey','artifactDigest'].includes(key)))throw nativeError('adaptation_artifact_must_be_adopted_exactly')
    if(typeof body.artifactDigest!=='string'||!body.artifactDigest||body.artifactDigest.length>200)throw nativeError('invalid_input')
    adoptionRequest={requestKey:adoptionKey,payloadDigest:digest({artifactDigest:body.artifactDigest})}
    const prior=await adaptedScriptReceipt(userId,brandId,id,row.intent.month,row.intent.creativeId)
    if(prior){
      const ai=prior.receipt.ai
      if(ai?.adoptionRequest?ai.adoptionRequest.payloadDigest!==adoptionRequest.payloadDigest:ai?.artifact?.digest!==body.artifactDigest)throw nativeError('creative_request_key_reused',409)
      return {...prior,replayed:true}
    }
  }
  const task=await app.runtime.get(actor,id,{history:true})
  if(task.status!=='succeeded'||!task.result)throw nativeError('candidate_not_ready',409)
  const ref=task.result.artifacts.find(r=>r.path===row.intent.artifactPath)
  if(!ref||body.artifactDigest!==ref.digest)throw nativeError('candidate_changed',409)
  if(row.intent.kind==='creative_discovery'){
    const library=task.calls.slice().reverse().find(c=>c.capability==='amc.library'&&c.status==='succeeded')?.result as LibrarySnapshot|undefined
    if(!library)throw nativeError('recommendation_source_mismatch',409)
    return saveRecommendation(userId,brandId,id,row.intent,ref,(await (app.workspace as WorkspacePort).read(actor,ref)).content,library,body)
  }
  if(row.intent.kind==='sku_proposal')throw nativeError('human_sku_confirmation_required',409)
  if(row.intent.kind==='creative_adaptation'){
    const qualityReview=await readCreativeQualityReview({id:userId,type:'HUMAN'},brandId,id)
    assertPassedQualityReview(qualityReview,ref.digest)
    const {result,ctx}=await validateSkuArtifact((await (app.workspace as WorkspacePort).read(actor,ref)).content,row.intent)
    const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,{expectedRevision:row.intent.expectedRevision,idempotencyKey:`sku-adapt-${digest([id,ref.digest])}`,patch:result.patch},undefined,{qualityReview:qualityReview!,reviewChanges:[],...(boundRunId?{autopilotRunId:boundRunId}:{}),adoptionRequest,taskId:id,agentId:'amc-mm-user-ai',requestedBy:userId,contextDigest:result.contextDigest,artifact:ref,skuBinding:{...row.intent,decisionDigest:row.intent.decisionDigest!},skuSource:ctx.source})
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
  const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,row.intent.month,row.intent.creativeId,{expectedRevision:row.intent.expectedRevision,idempotencyKey:body.saveMode?`ai-${digest([id,ref.digest,body.requestKey])}`:`ai-${digest([id,ref.digest])}`,...(body.saveMode?{saveMode:body.saveMode}:{}),patch:reviewed,feedback:body.feedback},undefined,{candidatePatch:candidate.patch,instruction:row.intent.goal,taskId:id,agentId:'amc-mm-user-ai',artifact:ref,requestedBy:userId,contextDigest:candidate.contextDigest})
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
 const host=await taskHost(userId,brandId,taskId)
 const history=(await nativeTaskHistory(host.app,host.actor,taskId,false)).history
 let provenance=planningProvenance(history.calls,draft)
 let adoptionDraft=draft
 if(draft.scope.stage==='interview'){
  const audit=await prisma.auditLog.findFirst({where:{actorId:userId,resourceId:`interview-info:${brandId}:${taskId}`,action:'INTERVIEW_INFORMATION_SOURCES'}})
  const binding=await intentForTask(host.pool,host.app,host.actor,taskId)
  if(binding.intent.requestKey.startsWith('interview-info-')&&!audit)throw nativeError('interview_sources_unavailable',409)
  const input=audit?.metadata as any
  if(input){
   const {readInterviewInformationSources}=await import('../brand-plan/interview-information')
   const current=await readInterviewInformationSources(brandId,input.language)
   if(current.sourceRevision!==input.sourceRevision)throw nativeError('interview_sources_changed',409)
   provenance={...provenance,informationRevision:input.sourceRevision,sourceHashes:input.sourceHashes,interviewInput:input.interviewInput,organizedContentHash:null}
   // Use the same canonical hashing as the source reader.
   const {planningRevision}=await import('./planning-workspace-contract');provenance.organizedContentHash=planningRevision(draft.content)
   adoptionDraft={...draft,expectedRevision:current.workspaceRevision}
  }
 }
 return savePlanningDraft(userId,brandId,taskId,adoptionDraft,provenance)
}

function planningProvenance(calls:readonly {capability:string;status:string;result?:unknown}[],draft:any){
 const source=(calls.find(c=>c.capability==='amc.context'&&c.status==='succeeded')?.result as any)?.planningContext
 const actualSkill=calls.find(c=>c.capability==='assistant.skills.read'&&c.status==='succeeded'&&(c as any).input?.id==='amc-marketing-expert/SKILL.md'&&!(c as any).input?.resource)?.result as any
 const skillContent=actualSkill?.content||source?.skill?.content
 const provenance:Record<string,any>={skill:'amc-marketing-expert',skillVersion:typeof actualSkill?.skillVersion==='string'?actualSkill.skillVersion:typeof skillContent==='string'?createHash('sha256').update(skillContent).digest('hex'):null,reportId:source?.insight?.reportVersionId||null,reportGeneratedAt:source?.insight?.generatedAt||null,workspaceRevision:draft.expectedRevision}
 if(draft.scope.stage==='marketing_plan'){
  if(source?.creativeSearch||draft.data?.brandCreatives?.some((v:unknown)=>typeof v==='string'&&/cre_ins_[a-zA-Z0-9_-]+/.test(v)))throw nativeError('strategy_scope_changed',409)
  provenance.strategyInputs=source?.workspace?.workspace?.marketingInputs||null
 }
 return provenance
}
const planningSavesInFlight=new Map<string,Promise<any>>()
async function finalizePlanningResult(pool:Pool,userId:string,brandId:string,id:string,draft:any,calls:readonly {capability:string;status:string;result?:unknown}[]){
 const key=JSON.stringify([userId,brandId,id]),pending=planningSavesInFlight.get(key)
 if(pending)return pending
 const work=finalizePlanningResultOnce(pool,userId,brandId,id,draft,calls).finally(()=>planningSavesInFlight.delete(key))
 planningSavesInFlight.set(key,work);return work
}
async function finalizePlanningResultOnce(pool:Pool,userId:string,brandId:string,id:string,draft:any,calls:readonly {capability:string;status:string;result?:unknown}[]){
 try{
  // savePlanningDraft replays the original receipt before checking revisions.
  // It also re-reads committed history; persisted status is not authorization.
  const result=await savePlanningDraft(userId,brandId,id,draft,planningProvenance(calls,draft))
  await pool.query('UPDATE amc_ai_requests SET planning_result=$1 WHERE task_id=$2 AND subject_id=$3',[JSON.stringify(result),id,userId])
  return result
 }catch(error){
  const e=error as {statusCode?:number;code?:string;message?:string}
  console.warn('[amc-planning-save]',JSON.stringify({taskId:id,code:typeof e.code==='string'&&/^[a-zA-Z0-9_]{1,100}$/.test(e.code)?e.code:'unavailable',status:e.statusCode||null}))
  const result={state:e.statusCode===409?'conflict':'retry',verified:false,code:typeof e.code==='string'&&/^[a-z_]{1,100}$/.test(e.code)?e.code:e.statusCode===409?'planning_revision_conflict':'planning_save_unavailable'}
  if(e.statusCode===409)await pool.query('UPDATE amc_ai_requests SET planning_result=$1 WHERE task_id=$2 AND subject_id=$3',[JSON.stringify(result),id,userId])
  return result
 }
}
/** Server-owned completion, independent of browser polling. Never generates or publishes. */
export async function finalizePlanningTasks(){
 const {pool}=await getNativeHost()
 const rows=(await pool.query("SELECT task_id,subject_id,intent->>'brandId' AS brand_id FROM amc_ai_requests WHERE intent->>'autoSavePlanning'='true' AND task_id IS NOT NULL AND planning_result IS NULL AND (planning_checked_at IS NULL OR planning_checked_at < now()-interval '30 seconds') ORDER BY planning_checked_at NULLS FIRST,created_at LIMIT 12")).rows
 for(const row of rows){
  try{
   await pool.query('UPDATE amc_ai_requests SET planning_checked_at=now() WHERE task_id=$1 AND subject_id=$2',[row.task_id,row.subject_id])
   const host=await taskHost(row.subject_id,row.brand_id,row.task_id),state=await host.app.runtime.state(host.actor,row.task_id)
   if(state.status==='succeeded')await readNativeTask(row.subject_id,row.brand_id,row.task_id)
   else if(['cancelled','failed'].includes(state.status))await pool.query("UPDATE amc_ai_requests SET planning_result=$1 WHERE task_id=$2 AND subject_id=$3",[JSON.stringify({state:'not_saved',reason:state.status}),row.task_id,row.subject_id])
  }catch{/* Permission and transport errors never authorize a write. Retry later. */}
 }
}

/** Conversations are projections of persisted task admissions, not client-authored receipts. */
export async function nativeConversations(userId:string,brandId:string,id?:string,before?:string,query?:string){
 const {actor,pool}=await authorizedHost(userId,brandId)
 // Repair an accepted Core task whose admission-index acknowledgement was lost.
 const unlinked=(await pool.query("SELECT request_key,runtime_lane FROM amc_ai_requests WHERE scope_id=$1 AND subject_id=$2 AND intent->>'kind'='conversation' AND task_id IS NULL ORDER BY created_at DESC LIMIT 12",[actor.scopeId,userId])).rows
 for(const request of unlinked){
  const host=await getNativeHost(true,request.runtime_lane||'default')
  const existing=await (host.app.tasks as PublicTaskIndex).findRequest(actor,'agent.work',request.request_key)
  if(existing)await intentForTask(pool,host.app,actor,existing.id)
 }
 const session="COALESCE(intent->>'conversationId',intent->>'contextSessionId',task_id::text)"
 if(query!==undefined&&(typeof query!=='string'||query.length>100))throw nativeError('invalid_search')
 if(!id){
  const rows=(await pool.query(`SELECT ${session} AS id,(array_agg(intent->>'goal' ORDER BY created_at,id))[1] AS title,max(created_at) AS updated_at,count(*)::integer AS turns FROM amc_ai_requests WHERE scope_id=$1 AND subject_id=$2 AND intent->>'kind'='conversation' AND task_id IS NOT NULL GROUP BY ${session} ${query?"HAVING bool_or(position(lower($3) in lower(intent->>'goal'))>0)":''} ORDER BY max(created_at) DESC LIMIT 50`,[actor.scopeId,userId,...(query?[query]:[])])).rows
  return {items:rows.map(r=>({id:r.id,title:r.title.slice(0,80),updatedAt:r.updated_at,turns:r.turns}))}
 }
 if(!/^[0-9a-f-]{36}$/i.test(id))throw nativeError('invalid_conversation_id')
 let cursor:null|{date:string;id:string}=null
 if(before){try{cursor=JSON.parse(Buffer.from(before,'base64url').toString());if(!cursor||typeof cursor.date!=='string'||!Number.isFinite(Date.parse(cursor.date))||typeof cursor.id!=='string'||!/^[a-f0-9]{64}$/.test(cursor.id))throw Error()}catch{throw nativeError('invalid_cursor')}}
 const rows=(await pool.query(`SELECT id,task_id,intent,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_date FROM amc_ai_requests WHERE scope_id=$1 AND subject_id=$2 AND intent->>'kind'='conversation' AND ${session}=$3 AND task_id IS NOT NULL ${cursor?'AND (created_at,id)<($4::timestamptz,$5)':''} ORDER BY created_at DESC,id DESC LIMIT 11`,[actor.scopeId,userId,id,...(cursor?[cursor.date,cursor.id]:[])])).rows
 if(!rows.length&&!before)throw nativeError('conversation_not_found',404)
 const page=rows.slice(0,10),items=[]
 for(const row of page.reverse()){
  const task=await readNativeTaskStatus(userId,brandId,row.task_id)
  const {userId:owner,brandId:brand,artifactPath,autoSavePlanning,...body}=row.intent
  items.push({taskId:row.task_id,body:{...body,autoSavePlanning},task,createdAt:row.created_at})
 }
 const last=page[0]
 return {id,items,nextCursor:rows.length>10?Buffer.from(JSON.stringify({date:last.cursor_date,id:last.id})).toString('base64url'):null}
}
export async function strategyVersions(userId:string,brandId:string){
 await authorizedHost(userId,brandId)
 const rows=await prisma.brandMarketingSolution.findMany({where:{brandId,kind:'MARKETING_PLAN'},orderBy:{createdAt:'desc'},take:21,select:{id:true,version:true,period:true,createdAt:true,output:true}})
 return {items:rows.slice(0,20).map((r:any,i:number)=>({id:r.id,version:r.version,period:r.period,createdAt:r.createdAt,content:(r.output as any)?.content||'',changes:strategyChanges(rows[i+1]?.output,r.output)}))}
}

/** On-demand diagnostics, never part of the high-frequency progress polling. */
export async function nativeAssistantRuntime(userId:string,brandId:string){
 await authorizedHost(userId,brandId)
 const skills=await agentSkills(USER_AI)
 return {coreVersion:CORE_VERSION,harness:{...NATIVE_RUNTIME_LIMITS,contextMaxBytes:AMC_CONTEXT_MAX_BYTES},usagePolicy:USAGE_POLICY,skills:skills.map(({id,name,version,installed,source})=>({id,name,version,installed,source})),skillManagement:'administrator',workspace:{persistent:true,scope:'brand_and_user',writes:'task_artifact_only'},memory:{scope:'brand_and_user',writes:'explicit_user_only'}}
}
export async function inspectNativeTask(userId:string,brandId:string,id:string){
 const {app,pool,actor}=await taskHost(userId,brandId,id)
 const row=await intentForTask(pool,app,actor,id)
 const state=await app.runtime.state(actor,id)
 const raw=await (app.tasks as any).get(actor,id)
 const history=await (app.tasks as any).history(actor,id)
 const usage=await app.ledger.taskUsage(await app.scope(actor),id)
 return {id,status:state.status,allowedTools:Array.isArray(raw.input?.allowedTools)?raw.input.allowedTools.filter((name:unknown)=>typeof name==='string'):[],...inspectAssistantHistory(history.calls,raw.result?.artifacts||[],row.intent.artifactPath),usage:inspectAssistantUsage(usage),usagePolicy:USAGE_POLICY}
}
