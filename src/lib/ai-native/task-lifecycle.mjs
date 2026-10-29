import {TaskStore} from '@immedi/iaic-core';
import pg from 'pg';

export const MAX_TASK_AGE_MS=24*60*60*1000;
const terminal=new Set(['succeeded','failed','cancelled']);
export function lifecycleDecision(task,{now=Date.now(),version,recovered=false,hasEffects=true}={}){
 if(terminal.has(task.status))return null;
 if(now-new Date(task.created_at).getTime()>=MAX_TASK_AGE_MS)return 'expired';
 if(task.status!=='waiting')return null;
 if(task.waiting_reason==='interrupted')return task.version===version&&!recovered&&!hasEffects?'recover_once':'interrupted_requires_new_request';
 if(['result_wait','external_result'].includes(task.waiting_reason))return null;
 return task.waiting_reason==='input'?'user_action_belongs_in_completed_reply':`stopped_${task.waiting_reason||'unknown'}`;
}
export async function initializeLifecycle(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS amc_iaic.task_lifecycle_actions (
  schema_name text NOT NULL, task_id uuid NOT NULL, action text NOT NULL,
  original_reason text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(schema_name,task_id,action));
 CREATE TABLE IF NOT EXISTS amc_iaic.task_lifecycle_sweeps (
  day date PRIMARY KEY, lease_until timestamptz NOT NULL, completed_at timestamptz);`);
}
export async function settleTask({pool,store,task,version,schema}){
 if(!/^[a-z0-9_]+$/.test(schema))throw new Error('Invalid lifecycle schema');
 if(terminal.has(task.status))return task;
 const actor=store.actor(task),current=await store.get(actor,task.id);
 if(terminal.has(current.status))return current;
 let hasEffects=true,recovered=false;
 if(current.status==='waiting'&&current.waiting_reason==='interrupted'){
  const row=(await pool.query(`SELECT EXISTS(SELECT 1 FROM "${schema}".iaic_calls WHERE task_id=$1) OR EXISTS(SELECT 1 FROM "${schema}".iaic_task_events WHERE task_id=$1 AND kind='model_requested') AS effects,
   EXISTS(SELECT 1 FROM amc_iaic.task_lifecycle_actions WHERE schema_name=$2 AND task_id=$1 AND action='recover_once') AS recovered`,[task.id,schema])).rows[0];
  hasEffects=row.effects;recovered=row.recovered;
 }
 let action=lifecycleDecision(current,{version,hasEffects,recovered});
 if(!action&&current.status==='waiting'&&current.waiting_reason==='external_result'){
  const uncertain=(await pool.query(`SELECT 1 FROM "${schema}".iaic_calls WHERE task_id=$1 AND status IN ('running','unknown') LIMIT 1`,[task.id])).rowCount;
  if(uncertain)action='external_outcome_requires_reconciliation';
 }
 if(!action)return current;
 // Reserve a recovery before resuming: crashes may lose a retry, never duplicate it.
 const reservation=await pool.query(`INSERT INTO amc_iaic.task_lifecycle_actions(schema_name,task_id,action,original_reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING task_id`,[schema,task.id,action,current.waiting_reason]);
 if(action==='recover_once'&&!reservation.rowCount)return current;
 try{
  const result=await store.transition(actor,task.id,{action:action==='recover_once'?'resume':'cancel',version:current.version,...(action==='recover_once'?{requestKey:'lifecycle:recover_once'}:{})});
  console.warn('[amc-task-lifecycle]',JSON.stringify({schema,taskId:task.id,action,status:result.status,reason:current.waiting_reason}));
  return result;
 }catch(error){
  const latest=await store.get(actor,task.id);
  if(terminal.has(latest.status))return latest;
  throw error;
 }
}
export function dailyGate(run){
 let next=0,busy=false;
 return async()=>{const now=Date.now();if(busy||now<next)return;busy=true;
  try{await run();next=now+MAX_TASK_AGE_MS;}catch(error){next=now+60*60*1000;console.error('[amc-task-lifecycle-sweep-failed]',error?.name||'Error');}finally{busy=false;}
 };
}
export async function sweepLifecycle(pool,version){
 const lease=await pool.query(`INSERT INTO amc_iaic.task_lifecycle_sweeps(day,lease_until) VALUES(CURRENT_DATE,now()+interval '30 minutes')
 ON CONFLICT(day) DO UPDATE SET lease_until=EXCLUDED.lease_until WHERE task_lifecycle_sweeps.completed_at IS NULL AND task_lifecycle_sweeps.lease_until<now() RETURNING day`);
 if(!lease.rowCount)return;
 const schemas=(await pool.query(`SELECT table_schema FROM information_schema.tables WHERE table_name='iaic_tasks'`)).rows.map(row=>row.table_schema).filter(schema=>/^(amc_iaic|amc_iaic_conversation|(?:coherent|discussion|latency|navigation|planning)_acceptance_[a-z0-9_]+)$/.test(schema));
 let processed=0;
 for(const schema of schemas){
  if(processed>=500){console.warn('[amc-task-lifecycle-sweep-limit]',{processed});break;}
  const scoped=new pg.Pool({...pool.options,max:1,options:`-c search_path=${schema} -c statement_timeout=15000`});
  try{
   await scoped.query(`CREATE INDEX IF NOT EXISTS iaic_tasks_lifecycle_active ON iaic_tasks(created_at,id) WHERE status NOT IN ('succeeded','failed','cancelled')`);
   const rows=(await scoped.query(`SELECT * FROM iaic_tasks WHERE status NOT IN ('succeeded','failed','cancelled') AND (created_at<now()-interval '24 hours' OR $2::boolean AND status='waiting' ) ORDER BY created_at,id LIMIT $1`,[Math.min(100,500-processed),schema==='amc_iaic'||schema==='amc_iaic_conversation'])).rows;
   const store=new TaskStore({pool:scoped});
   for(const task of rows){await settleTask({pool,store,task,version,schema});processed++;}
   if(rows.length===100)console.warn('[amc-task-lifecycle-sweep-backlog]',{schema,limit:100});
  }finally{await scoped.end();}
 }
 await pool.query('UPDATE amc_iaic.task_lifecycle_sweeps SET completed_at=now() WHERE day=$1',[lease.rows[0].day]);
}
