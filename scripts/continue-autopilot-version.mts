// Reviewed version transition through public IAIC controls. Never edits Core tables.
import {getNativeHost} from '../src/lib/ai-native/service.ts'
import {applicationVersion} from '../src/lib/ai-native/application.ts'
import {actorFor,digest,TASK_ALLOWANCE} from '../src/lib/ai-native/contract.ts'
import {intentForTask,admitIntent} from '../src/lib/ai-native/store.ts'
import {autopilotRun} from '../src/lib/ai-native/autopilot.ts'
import {prisma} from '../src/lib/prisma.ts'
const apply=process.argv.includes('--apply'),host=await getNativeHost(false)
try {
 if(!(await host.app.runtime.drain({timeoutMs:5000})).drained)throw new Error('Local runtime still active')
 const version=await applicationVersion()
 const rows=(await host.pool.query("SELECT DISTINCT ON (brand_id) * FROM amc_iaic.autopilot_runs WHERE task_id IS NOT NULL AND status NOT IN ('succeeded','cancelled','failed') ORDER BY brand_id,local_day,id")).rows
 for(const row of rows){
  const lock=await host.pool.connect()
  try{
   if(!(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok',[`autopilot-admission:${row.brand_id}`])).rows[0].ok)continue
   const actor=actorFor(row.brand_id,row.owner_id),run=await autopilotRun(row.owner_id,row.brand_id,row.id)
   const old=await host.app.runtime.state(actor,run.task_id),usage=await host.app.ledger.taskUsage(await host.app.scope(actor),old.id)
   const calls=await host.app.tasks.operationReceipts(actor,old.id)
   if(old.version===version||!['queued','waiting','cancelled'].includes(old.status)||!usage.complete||calls.some((call:{status:string})=>['running','unknown'].includes(call.status))){console.log(JSON.stringify({runId:row.id,action:'skipped',status:old.status,usageComplete:usage.complete}));continue}
   const binding=await intentForTask(host.pool,host.app,actor,old.id)
   if(binding.intent.kind!=='autopilot'||binding.intent.runId!==row.id)throw new Error('Task/run mismatch')
   const key=`autopilot-upgrade-${digest([old.id,version])}`
   if(!apply){console.log(JSON.stringify({runId:row.id,predecessor:old.id,action:'eligible'}));continue}
   const intent={...binding.intent,requestKey:key,artifactPath:`work/${digest([actor,key])}.json`}
   const request=await admitIntent(host.pool,actor,intent)
   await host.app.ledger.grant(await host.app.scope(actor),{reference:`amc-request-${request.id}`,amount:TASK_ALLOWANCE,evidence:{kind:'reviewed-version-continuation',predecessor:old.id,runId:row.id}})
   await host.pool.query("UPDATE amc_iaic.autopilot_runs SET status='waiting',evidence=jsonb_set(evidence,'{versionContinuationPending}',$2::jsonb) WHERE id=$1",[row.id,JSON.stringify({predecessor:old.id,version})])
   await host.app.dispatcher.invoke('tasks.cancel',{id:old.id},{actor,callId:`upgrade-cancel-${digest([old.id,version])}`})
   const receipt=await host.app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:host.tools.filter(tool=>!['amc.creative','amc.library'].includes(tool))},{actor,callId:key})
   await intentForTask(host.pool,host.app,actor,receipt.id)
   await host.pool.query("UPDATE amc_iaic.autopilot_runs SET task_id=$2,status='queued',error=NULL,evidence=jsonb_set(evidence-'versionContinuationPending','{taskContinuation}',$3::jsonb),updated_at=now() WHERE id=$1 AND task_id=$4",[row.id,receipt.id,JSON.stringify({predecessor:old.id,taskId:receipt.id,version,reason:'reviewed-code-skill-upgrade',originalEffectsRetained:true}),old.id])
   console.log(JSON.stringify({runId:row.id,predecessor:old.id,taskId:receipt.id,action:'continued',newBusinessRuns:0}))
  }catch(error){console.log(JSON.stringify({runId:row.id,action:'needs_attention',error:(error as Error).message}))}
  finally{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`autopilot-admission:${row.brand_id}`]);lock.release()}
 }
}finally{await host.pool.end();await prisma.$disconnect()}
