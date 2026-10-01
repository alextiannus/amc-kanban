import {reconcileRetiredDailyPlans} from '../brand-plan/creativeRevisions'
import type {Pool} from 'pg'
import {prisma} from '../prisma'
import {requireActor} from './application'
import {dailyActorFor} from './contract'
import {createNativeTask,getNativeHost} from './service'
import {intentForTask} from './store'
import {saveRecommendation} from './recommendations'
import {discoveryFrom,type LibrarySnapshot} from './library'
import type {WorkspacePort} from './application'
import {applicationVersion} from './application'
import {brandDay,IDEA_POOL_MIN} from './idea-pool'
import {dailyRecoverySlots,isRecoverableDailyWait} from './daily-recovery'

// This is a binding/reconciliation loop. IAIC owns execution, retries, usage and task state.
export async function advanceDailyPlanning(pool:Pool,brandId:string,ports={createTask:createNativeTask,getHost:getNativeHost,currentVersion:applicationVersion}){
 const lock=await pool.connect()
 try{
  if(!(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[`daily-planning:${brandId}`])).rows[0].acquired)return
  const retired=(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NOT NULL AND task_id IS NOT NULL AND plan_id IS NULL AND last_error IS DISTINCT FROM $2',[brandId,'daily_retired'])).rows
  for(const row of retired){try{const actor=dailyActorFor(brandId,row.owner_id);await requireActor(actor);const host=await ports.getHost();const task=await host.app.runtime.state(actor,row.task_id);if(['queued','running','waiting'].includes(task.status))await host.app.dispatcher.invoke('tasks.cancel',{id:row.task_id},{actor,callId:`daily-retire-${row.id}`});await pool.query('UPDATE amc_iaic.brand_ideas SET last_error=$2 WHERE id=$1',[row.id,'daily_retired'])}catch{}}
  const active=(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY created_at,id',[brandId])).rows
  const rows=active.filter(row=>!row.plan_id)
  const needsRecoveryCheck=rows.some(row=>row.task_id&&row.last_error)
  const currentVersion=needsRecoveryCheck?await (ports.currentVersion||applicationVersion)():''
  let recoverySlots=dailyRecoverySlots(active,currentVersion,IDEA_POOL_MIN)
  const principals=await prisma.crewMember.findMany({where:{active:true,role:{in:['PRINCIPAL','OWNER']},crew:{brandId,brand:{status:'ACTIVE'}},user:{type:'HUMAN',status:'ACTIVE'}},orderBy:{joinedAt:'asc'},select:{userId:true}})
  for(const principal of principals){try{await requireActor(dailyActorFor(brandId,principal.userId));await reconcileRetiredDailyPlans(brandId,principal.userId);break}catch{}}
  for(const row of rows){
   try{
    let owner=row.owner_id
    if(!owner){for(const member of principals){try{await requireActor(dailyActorFor(brandId,member.userId));owner=member.userId;break}catch{}}}
    if(!owner)throw new Error('daily_principal_required')
    const actor=dailyActorFor(brandId,owner);await requireActor(actor)
    await pool.query('UPDATE amc_iaic.brand_ideas SET owner_id=$2 WHERE id=$1 AND owner_id IS NULL',[row.id,owner])
    const host=await ports.getHost()
    let taskId=row.task_id
    if(!taskId){const receipt=await ports.createTask(owner,brandId,{kind:'creative_discovery',poolIdeaId:row.id},true);taskId=receipt.id;await pool.query('UPDATE amc_iaic.brand_ideas SET task_id=$2,last_error=NULL WHERE id=$1',[row.id,taskId]);if(recoverySlots>0)recoverySlots--}
    const task=await host.app.runtime.get(actor,taskId,{history:true})
    if(task.status!=='succeeded'){
     if(currentVersion&&recoverySlots>0&&row.recovery_version!==currentVersion&&['interrupted','limit'].includes(String(task.waiting_reason||''))){
      const usage=await host.app.ledger.taskUsage(await host.app.scope(actor),taskId)
      if(isRecoverableDailyWait(task.status,task.waiting_reason,usage.complete===true)){
       const recovery=await ports.createTask(owner,brandId,{kind:'creative_discovery',poolIdeaId:row.id,recoveryOfTaskId:taskId},true)
       if(recovery.version!==currentVersion)throw new Error('daily_recovery_version_mismatch')
       const swapped=await pool.query('UPDATE amc_iaic.brand_ideas SET task_id=$2,recovery_of_task_id=$3,recovery_version=$4,last_error=NULL WHERE id=$1 AND task_id=$3 AND plan_id IS NULL',[row.id,recovery.id,taskId,currentVersion])
       if(swapped.rowCount)recoverySlots--
       continue
      }
     }
     await pool.query('UPDATE amc_iaic.brand_ideas SET last_error=$2 WHERE id=$1',[row.id,['failed','cancelled','waiting'].includes(task.status)?`daily_task_${task.status}`:null]);continue
    }
    const binding=await intentForTask(host.pool,host.app,actor,taskId)
    if(binding.intent.kind!=='creative_discovery'||!binding.intent.automaticDaily)throw new Error('daily_task_required')
    const ref=task.result?.artifacts.find(item=>item.path===binding.intent.artifactPath)
    const library=task.calls.slice().reverse().find(call=>call.capability==='amc.library'&&call.status==='succeeded')?.result as LibrarySnapshot|undefined
    if(!ref||!library)throw new Error('daily_artifact_unavailable')
    const content=(await (host.app.workspace as WorkspacePort).read(actor,ref)).content
    const candidate=discoveryFrom(content,binding.intent,library).recommendations.find(item=>item.sourceCreativeId===row.source_id)
    if(!candidate)throw new Error('daily_no_adapted_script')
    // Pin the planning date before the save so an unknown commit can be reconciled across midnight.
    const brand=await prisma.brand.findUniqueOrThrow({where:{id:brandId},select:{timezone:true}})
    const date=(await pool.query('UPDATE amc_iaic.brand_ideas SET plan_date=COALESCE(plan_date,$2) WHERE id=$1 RETURNING plan_date',[row.id,brandDay(brand.timezone)])).rows[0].plan_date
    const saved=await saveRecommendation(owner,brandId,taskId,binding.intent,ref,content,library,{sourceCreativeId:row.source_id,patch:{title:candidate.title,planning:candidate.planning,aiCaption:candidate.aiCaption,materialRequirements:candidate.materialRequirements,date,platform:['instagram','tiktok','xiaohongshu','facebook','google_business'].includes(row.source.sourceVideo?.platform||row.source.sourcePost?.platform)?row.source.sourceVideo?.platform||row.source.sourcePost?.platform:'instagram'}},true)
    await pool.query('UPDATE amc_iaic.brand_ideas SET plan_id=$2,plan_month=$3,last_error=NULL WHERE id=$1',[row.id,saved.creativeId,saved.month])
   }catch(error){await pool.query('UPDATE amc_iaic.brand_ideas SET last_error=$2 WHERE id=$1',[row.id,/^[a-z][a-z0-9_]{2,100}$/.test(String((error as any).code||(error as Error).message))?String((error as any).code||(error as Error).message):'daily_planning_unavailable'])}
  }
 }finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`daily-planning:${brandId}`]);lock.release()}
}
