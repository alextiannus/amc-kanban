import {Pool} from 'pg'
// @ts-expect-error Core exports the public TaskStore JavaScript port without declarations.
import {TaskStore} from '@immedi/iaic-core/tasks/store.js'
import {actorFor} from '../ai-native/contract'
import {runtimeConfig} from '../model-management/registry'

export async function reportDiagnostics(pool:Pool,report:any){
  let model:any={available:false}
  try{const config=await runtimeConfig();model={available:config.active,policyVersion:config.version}}catch{}
  if(!report.evidence.contextSessionId)return {model,conversationTasks:[],scope:'No conversation session was attached.'}
  const rows=(await pool.query("SELECT task_id,runtime_lane,created_at FROM amc_iaic.amc_ai_requests WHERE subject_id=$1 AND intent->>'brandId'=$2 AND intent->>'contextSessionId'=$3 AND task_id IS NOT NULL ORDER BY created_at DESC LIMIT 5",[report.user_id,report.brand_id,report.evidence.contextSessionId])).rows
  const tasks=[]
  for(const row of rows){
    const taskPool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,options:`-c search_path=${row.runtime_lane==='conversation'?'amc_iaic_conversation':'amc_iaic'} -c statement_timeout=5000`})
    try{
      // Trust the already authorized report's actor/session binding, never a model-supplied task ID.
      const state=await new TaskStore({pool:taskPool}).get(actorFor(report.brand_id,report.user_id),row.task_id)
      tasks.push({id:row.task_id,createdAt:row.created_at,status:state.status,waitingReason:state.waiting_reason||null,updatedAt:state.updated_at})
    }catch{tasks.push({id:row.task_id,status:'unavailable'})}finally{await taskPool.end()}
  }
  return {model,conversationTasks:tasks,checkedAt:new Date().toISOString()}
}
