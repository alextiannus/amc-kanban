import type { Application } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import { Pool } from 'pg'
import { DAILY_ALLOWANCE, TASK_ALLOWANCE, digest, nativeError, type NativeIntent, type NativeActor } from './contract'

export function nativePool(connectionString=process.env.DATABASE_URL){
  if(!connectionString)throw nativeError('database_unavailable',503)
  return new Pool({connectionString,max:8,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,options:'-c search_path=amc_iaic -c statement_timeout=30000'})
}
export async function initializeHost(pool:Pool){
  await pool.query('CREATE SCHEMA IF NOT EXISTS amc_iaic')
  // This application-owned table binds admission, not a duplicate task lifecycle.
  await pool.query(`CREATE TABLE IF NOT EXISTS amc_ai_requests (
    id text PRIMARY KEY, scope_id text NOT NULL, subject_id text NOT NULL,
    request_key text NOT NULL, digest text NOT NULL, intent jsonb NOT NULL,
    allowance integer NOT NULL, task_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(scope_id,subject_id,request_key));
    CREATE INDEX IF NOT EXISTS amc_ai_requests_daily ON amc_ai_requests(subject_id,created_at);`)
}
export async function admitIntent(pool:Pool,actor:NativeActor,intent:NativeIntent){
  const id=digest([actor.scopeId,actor.subjectId,intent.requestKey]),hash=digest(intent)
  const c=await pool.connect()
  try{
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['amc-ai-admission:'+actor.subjectId])
    const old=(await c.query('SELECT * FROM amc_ai_requests WHERE id=$1',[id])).rows[0]
    if(old){if(old.digest!==hash)throw nativeError('request_key_reused',409);await c.query('COMMIT');return old}
    const used=Number((await c.query("SELECT COALESCE(sum(allowance),0) AS used FROM amc_ai_requests WHERE subject_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",[actor.subjectId])).rows[0].used)
    if(used+TASK_ALLOWANCE>DAILY_ALLOWANCE)throw nativeError('daily_task_budget_exhausted',429)
    const row=(await c.query('INSERT INTO amc_ai_requests(id,scope_id,subject_id,request_key,digest,intent,allowance) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,actor.scopeId,actor.subjectId,intent.requestKey,hash,JSON.stringify(intent),TASK_ALLOWANCE])).rows[0]
    await c.query('COMMIT');return row
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function intentBy(pool:Pool,actor:NativeActor,field:'id'|'request_key'|'task_id',value:string){
  const row=(await pool.query(`SELECT * FROM amc_ai_requests WHERE scope_id=$1 AND subject_id=$2 AND ${field}=$3`,[actor.scopeId,actor.subjectId,value])).rows[0]
  if(!row)throw nativeError('task_not_found',404)
  return row as {id:string;digest:string;intent:NativeIntent;task_id:string|null;request_key:string;allowance:number}
}

// Recover the application index from Core's public binding after an accepted
// task response or the subsequent index update was lost. Core remains truth.
export async function intentForTask(pool:Pool,app:Application,actor:NativeActor,id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw nativeError('task_not_found',404)
  const task=await (app.tasks as PublicTaskIndex).get(actor,id)
  if(!task.trusted_context)throw nativeError('task_not_found',404)
  const row=await intentBy(pool,actor,'id',task.trusted_context.reference)
  if(row.task_id&&row.task_id!==id)throw nativeError('task_binding_conflict',409)
  if(!row.task_id)await pool.query('UPDATE amc_ai_requests SET task_id=$1 WHERE id=$2 AND task_id IS NULL',[id,row.id])
  return {...row,task_id:id}
}
export type PublicTaskIndex={
  get(actor:NativeActor,id:string):Promise<{id:string;trusted_context:{reference:string}|null}>
  findRequest(actor:NativeActor,capability:string,key:string):Promise<{id:string}|null>
}
