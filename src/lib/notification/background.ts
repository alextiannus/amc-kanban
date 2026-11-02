import {createHash} from 'node:crypto'
import {prisma} from '../prisma'
import {canUserAccessBrand} from '../user-management/brandAccess'
import {backgroundOutcome,backgroundMessage,type Outcome} from './background-policy'
import {ensurePushSchema,deliverPushNotices} from './push'
import {ensureBackgroundNoticeSchema} from './background-schema'

type Watch={id:string;kind:string;task_id:string;user_id:string;brand_id:string;created_at:Date;notified_state:string|null}
const idFor=(kind:string,taskId:string,userId:string)=>'background-'+createHash('sha256').update(JSON.stringify([kind,taskId,userId])).digest('hex')
/** Idempotent admission. No retroactive completed-history alerts. */
async function discover(db:any){
 const since=(await db.$queryRawUnsafe(`SELECT started_at FROM amc_background_notice_activation WHERE id=1`))[0].started_at
 const sources:Array<{kind:string;sql:string}>=[
  {kind:'video',sql:`SELECT v.id AS task_id,v."createdBy" AS user_id,v."brandId" AS brand_id,(v."createdAt" AT TIME ZONE 'UTC') AS created_at,(v.status IN ('generating','queued','running','processing','assembling')) AS active FROM "VideoProductionJob" v WHERE v."historyDeletedAt" IS NULL AND v."createdBy" IS NOT NULL AND (v.status IN ('generating','queued','running','processing','assembling') OR (v."updatedAt" AT TIME ZONE 'UTC')>=$1)`},
  {kind:'publish',sql:`SELECT j.id AS task_id,j.payload->>'actorId' AS user_id,j."brandId" AS brand_id,(j."createdAt" AT TIME ZONE 'UTC') AS created_at,(j.status IN ('QUEUED','TRANSFERRING','CREATING_POST','RESULT_UNKNOWN')) AS active FROM "PostfastDeliveryJob" j WHERE (j.status IN ('QUEUED','TRANSFERRING','CREATING_POST','RESULT_UNKNOWN') OR (j."updatedAt" AT TIME ZONE 'UTC')>=$1)`},
  {kind:'publish',sql:`SELECT 'draft:'||d.id AS task_id,a."resolvedBy" AS user_id,d."brandId" AS brand_id,(a."resolvedAt" AT TIME ZONE 'UTC') AS created_at,(d.status IN ('scheduled','publishing')) AS active FROM "ContentDraft" d JOIN "ActionItem" a ON a."draftId"=d.id AND a."brandId"=d."brandId" WHERE a."resolvedBy" IS NOT NULL AND a."resolvedAt" IS NOT NULL AND d.status IN ('scheduled','publishing','published','failed') AND (d.status IN ('scheduled','publishing') OR (d."updatedAt" AT TIME ZONE 'UTC') >=$1) AND NOT EXISTS(SELECT 1 FROM "PostfastDeliveryJob" j WHERE j."draftId"=d.id)`},
  {kind:'insight',sql:`SELECT k."marketingSolution"->'insightRequest'->>'id' AS task_id,COALESCE(k."marketingSolution"->'insightRequest'->>'userId',(SELECT a."actorId" FROM "AuditLog" a WHERE a.action='INSIGHT_REPORT_REQUESTED' AND a."resourceId"=k."brandId" AND a.metadata->>'requestId'=k."marketingSolution"->'insightRequest'->>'id' ORDER BY a.timestamp LIMIT 1)) AS user_id,k."brandId" AS brand_id,(k."marketingSolution"->'insightRequest'->>'createdAt')::timestamptz AS created_at,false AS active FROM "BrandKnowledge" k WHERE k."marketingSolution"->'insightRequest'->>'id' IS NOT NULL AND (k."marketingSolution"->'insightRequest'->>'status' IN ('submitting','processing','review_required') OR (k."marketingSolution"->'insightRequest'->>'createdAt')::timestamptz >=$1)`},
 ]
 const exists=(await db.$queryRawUnsafe(`SELECT to_regclass('amc_ai_requests')::text AS requests,to_regclass('amc_iaic.iaic_tasks')::text AS tasks,to_regclass('amc_iaic_conversation.iaic_tasks')::text AS conversations`))[0]
 if(exists.requests)for(const [lane,schema,ready] of [['default','amc_iaic',exists.tasks],['conversation','amc_iaic_conversation',exists.conversations]])if(ready)sources.push({kind:'ai',sql:`SELECT r.task_id::text,r.subject_id AS user_id,r.intent->>'brandId' AS brand_id,r.created_at,(t.status IN ('queued','running')) AS active FROM amc_ai_requests r JOIN ${schema}.iaic_tasks t ON t.id=r.task_id AND t.erp_user=r.subject_id AND t.employee_id=r.scope_id WHERE r.runtime_lane='${lane}' AND COALESCE(r.intent->>'automaticDaily','false')!='true' AND r.intent->>'autopilotRunId' IS NULL AND (t.status IN ('queued','running','waiting') OR t.updated_at >=$1)`})
 for(const source of sources){
  const rows=await db.$queryRawUnsafe(`SELECT s.* FROM (${source.sql}) s WHERE s.user_id IS NOT NULL AND s.brand_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM amc_background_notice_watch w WHERE w.kind=$2 AND w.task_id=s.task_id AND w.user_id=s.user_id AND (NOT w.done OR NOT s.active)) ORDER BY s.created_at LIMIT 100`,since,source.kind)
  for(const row of rows)await db.$executeRawUnsafe(`INSERT INTO amc_background_notice_watch(id,kind,task_id,user_id,brand_id,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kind,task_id,user_id) DO UPDATE SET done=false,next_check_at=now() WHERE amc_background_notice_watch.done=true`,idFor(source.kind,row.task_id,row.user_id),source.kind,row.task_id,row.user_id,row.brand_id,row.created_at)
 }
}
async function readSource(w:Watch,db:any){
 const base=`/dashboard?brandId=${encodeURIComponent(w.brand_id)}`
 if(w.kind==='video'){
  const job=await db.videoProductionJob.findFirst({where:{id:w.task_id,brandId:w.brand_id,createdBy:w.user_id},select:{status:true,historyDeletedAt:true,finalVideoUrl:true}})
  return {value:job,url:base+'&action=video_review&jobId='+encodeURIComponent(w.task_id)}
 }
 if(w.kind==='publish'){
  if(w.task_id.startsWith('draft:')){
   const draft=await db.contentDraft.findFirst({where:{id:w.task_id.slice(6),brandId:w.brand_id,actionItem:{resolvedBy:w.user_id}},select:{status:true,platformPostId:true}})
   return {value:draft?{status:draft.status,draftStatus:draft.status,postId:draft.platformPostId}:null,url:base+'&action=publishing_result'}
  }
  const job=await db.postfastDeliveryJob.findFirst({where:{id:w.task_id,brandId:w.brand_id},select:{status:true,payload:true,draft:{select:{status:true,platformPostId:true}}}})
  return {value:job&&(job.payload as any)?.actorId===w.user_id?{status:job.status,draftStatus:job.draft.status,postId:job.draft.platformPostId}:null,url:base+'&action=publishing_result'}
 }
 if(w.kind==='insight'){
  const {readInsight,reconcileInsight}=await import('../brand-plan/insight-service')
  let latest=await readInsight(w.brand_id)
  if(latest.request?.id!==w.task_id)return {value:null,url:base+'&action=insight_report'}
  // Reconcile only this already-submitted request. Never creates a paid report.
  if(latest.request.jobId&&['processing','review_required'].includes(latest.request.status)){await reconcileInsight(w.brand_id);latest=await readInsight(w.brand_id)}
  return {value:latest.request?.id===w.task_id?{status:latest.request.status,reportReady:!!latest.report?.content}:null,url:base+'&action=insight_report'}
 }
 const rows=await db.$queryRawUnsafe(`SELECT runtime_lane,intent,planning_result FROM amc_ai_requests WHERE task_id=$1::uuid AND subject_id=$2 AND intent->>'brandId'=$3`,w.task_id,w.user_id,w.brand_id)
 const row=rows[0];if(!row)return {value:null,url:base+'&action=ai_task'}
 const conversation=row.intent.conversationId?'&conversationId='+encodeURIComponent(row.intent.conversationId):''
 const schema=row.runtime_lane==='conversation'?'amc_iaic_conversation':'amc_iaic'
 const state=(await db.$queryRawUnsafe(`SELECT status,waiting_reason,updated_at,result FROM ${schema}.iaic_tasks WHERE id=$1::uuid AND erp_user=$2`,w.task_id,w.user_id))[0]
 const durationMs=state?new Date(state.updated_at).getTime()-new Date(w.created_at).getTime():0
 let resultReady=!!state?.result
 if(state?.status==='succeeded'&&durationMs>=15000){
  const {readNativeTask}=await import('../ai-native/service')
  const result=await readNativeTask(w.user_id,w.brand_id,w.task_id)
  resultReady=!!(result.report||result.artifact||result.candidate||('recommendations' in result&&result.recommendations))
  if(row.intent.autoSavePlanning&&result.planningSave?.state==='retry')return {value:{status:'running'},url:base+'&action=ai_task'}
  if(result.planningSave?.state==='conflict')return {value:{status:'waiting',waitingReason:'input'},url:base+'&action=ai_task&taskId='+w.task_id+conversation}
 }
 return {value:state?{status:state.status,waitingReason:state.waiting_reason,durationMs,resultReady}:null,url:base+'&action=ai_task&taskId='+w.task_id+conversation}
}
/** Kept separate for transaction/idempotency regression testing. */
export async function settleBackgroundNotice(db:any,w:Watch,outcome:Outcome,url:string){
 if(!outcome)return
 await db.$transaction(async(tx:any)=>{
  await tx.$queryRawUnsafe(`SELECT id FROM amc_background_notice_watch WHERE id=$1 FOR UPDATE`,w.id)
  if(outcome!=='silent'){
   const message=backgroundMessage(w.kind,outcome)
   const notificationId=w.kind==='video'&&outcome==='completed'?'video-review-'+createHash('sha256').update(JSON.stringify([w.user_id,w.task_id])).digest('hex'):w.id+':'+outcome
   await tx.notification.upsert({where:{id:notificationId},update:{},create:{id:notificationId,userId:w.user_id,brandId:w.brand_id,type:'BACKGROUND_'+outcome.toUpperCase(),...message,actionUrl:url}})
   if(outcome==='completed')await tx.notification.updateMany({where:{id:{in:[w.id+':failed',w.id+':attention']},status:'UNREAD'},data:{status:'DISMISSED'}})
  }
  await tx.$executeRawUnsafe(`UPDATE amc_background_notice_watch SET notified_state=$2,done=$3 WHERE id=$1`,w.id,outcome,outcome!=='attention')
 })
}
export async function processBackgroundNotices(db:any=prisma){
 await discover(db)
 // Atomic leases keep provider reads bounded across instances; crashes retry in 2 minutes.
 const rows:Watch[]=await db.$queryRawUnsafe(`UPDATE amc_background_notice_watch SET next_check_at=now()+interval '2 minutes' WHERE id IN(SELECT id FROM amc_background_notice_watch WHERE done=false AND next_check_at<=now() ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT 12) RETURNING *`)
 for(const w of rows){
  try{
   const user=await db.user.findFirst({where:{id:w.user_id,status:'ACTIVE'},select:{id:true}})
   if(!user||!await canUserAccessBrand(w.brand_id,w.user_id,'READ',db)){await settleBackgroundNotice(db,w,'silent','');continue}
   const {value,url}=await readSource(w,db)
   await settleBackgroundNotice(db,w,backgroundOutcome(w.kind,value),url)
  }catch{console.warn('[background-notice] check deferred',{kind:w.kind})}
 }
 return {checked:rows.length}
}
const globalWorker=globalThis as typeof globalThis&{amcBackgroundNoticeWorker?:boolean}
export async function startBackgroundNoticeWorker(){
 if(globalWorker.amcBackgroundNoticeWorker)return
 await ensureBackgroundNoticeSchema();await ensurePushSchema();globalWorker.amcBackgroundNoticeWorker=true
 let busy=false,stopped=false
 const run=async()=>{if(busy||stopped)return;busy=true;try{try{await processBackgroundNotices()}catch{console.warn('[background-notice] scan deferred')}try{await deliverPushNotices()}catch{console.warn('[background-notice] delivery deferred')}}finally{busy=false}}
 const timer=setInterval(()=>void run(),30000);timer.unref();void run()
 process.once('SIGTERM',()=>{stopped=true;clearInterval(timer)})
}
