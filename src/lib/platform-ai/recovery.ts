import type {Pool} from 'pg'
import {PLATFORM_ACTOR,REVIEW_ACTOR} from './engineering-capabilities'
import {engineeringConfig,evidence} from './engineering-store'
import {hash} from './engineering-policy'
import {EngineeringGitHub} from './github'

// Reconcile original effects through read-only provider queries. Never dispatch a replacement.
export async function recoverEngineeringCall(pool:Pool,team:any,reportId:string,call:any){
  if(call.input?.reportId!==reportId||!call.capability.startsWith('engineering.'))return null
  const action=call.capability.slice('engineering.'.length),input=call.input
  const config=await engineeringConfig(pool);if(!config?.enabled)return null
  const gh=new EngineeringGitHub(config)
  let original:any
  if(action==='patch')original={repo:input.repo,base:input.base,files:input.files,test:input.test}
  else if(action==='check_start')original={patchOperationId:input.patchOperationId}
  else if(action==='review')original={checkOperationId:input.checkOperationId}
  else if(action==='publish')original={reviewOperationId:input.reviewOperationId}
  else if(action==='conclude'){
    const row=(await pool.query('SELECT result FROM public.amc_bug_reports WHERE id=$1',[reportId])).rows[0]
    return row?.result?.disposition===input.disposition&&row.result.summary===input.summary?{recorded:true,...row.result}:null
  }else return null
  const id=hash([reportId,action,original]),row=(await pool.query('SELECT result FROM public.amc_platform_operations WHERE id=$1 AND report_id=$2',[id,reportId])).rows[0]
  if(!row)return null
  let result=row.result
  if(!result){
    if(action==='patch')result=await gh.patch(reportId,id,original,true)
    if(action==='check_start'){
      const patch=(await evidence(pool,reportId,input.patchOperationId,'patch')).result
      const run=await gh.checks(patch,id,false)
      if(run.runId)result={checkKey:id,patchOperationId:input.patchOperationId,sha:patch.sha}
    }
    if(action==='publish'){
      const review=await evidence(pool,reportId,input.reviewOperationId,'review'),patch=(await evidence(pool,reportId,review.result.patchOperationId,'patch')).result
      result=await gh.publish(patch,true)
    }
    if(!result)return null
    await pool.query('UPDATE public.amc_platform_operations SET result=$2 WHERE id=$1 AND result IS NULL',[id,JSON.stringify(result)])
  }
  if(action==='review')await team.reviews.record(REVIEW_ACTOR,{id,target:result.artifact,verdict:result.verdict,findings:result.findings})
  return {operationId:id,...result}
}

export async function reconcileEngineeringTask(pool:Pool,team:any,reportId:string,taskId:string){
  const history=await team.runtime.get(PLATFORM_ACTOR,taskId,{history:true})
  const calls=history.calls.filter((call:any)=>call.status==='unknown')
  if(!calls.length)return 'none'
  for(const call of calls){
    const result=await recoverEngineeringCall(pool,team,reportId,call)
    if(!result)return 'pending'
    await team.tasks.resolveCall(PLATFORM_ACTOR,taskId,call.id,result)
  }
  await team.runtime.transition(PLATFORM_ACTOR,taskId,{action:'resume',requestKey:`effects-${hash(calls.map((call:any)=>call.id))}`})
  return 'recovered'
}
