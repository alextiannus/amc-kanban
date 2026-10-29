import type { Application } from '@immedi/iaic-core/developer/templates/agent/app.mjs'
import { Pool, type PoolClient } from 'pg'
import { isDailyActor, digest, sameSkuIntent, nativeError, type NativeIntent, type NativeActor } from './contract'

export type RuntimeLane='default'|'conversation'
export function nativePool(connectionString=process.env.DATABASE_URL,lane:RuntimeLane='default'){
  if(!connectionString)throw nativeError('database_unavailable',503)
  return new Pool({connectionString,max:8,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,options:`-c search_path=${lane==='conversation'?'amc_iaic_conversation':'amc_iaic'} -c statement_timeout=30000`})
}
export async function initializeHost(pool:Pool){
  await pool.query('CREATE SCHEMA IF NOT EXISTS amc_iaic')
  await pool.query(`CREATE TABLE IF NOT EXISTS amc_conversation_context (
    cache_key text PRIMARY KEY, source_revision text NOT NULL, payload text NOT NULL,
    expires_at timestamptz NOT NULL);
    CREATE INDEX IF NOT EXISTS amc_conversation_context_expiry ON amc_conversation_context(expires_at);`)
  // This application-owned table binds admission, not a duplicate task lifecycle.
  await pool.query(`CREATE TABLE IF NOT EXISTS amc_ai_requests (
    id text PRIMARY KEY, scope_id text NOT NULL, subject_id text NOT NULL,
    request_key text NOT NULL, digest text NOT NULL, intent jsonb NOT NULL,
    allowance integer NOT NULL, task_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(scope_id,subject_id,request_key));
    CREATE INDEX IF NOT EXISTS amc_ai_requests_daily ON amc_ai_requests(subject_id,created_at);
    ALTER TABLE amc_ai_requests ADD COLUMN IF NOT EXISTS runtime_lane text NOT NULL DEFAULT 'default';
    ALTER TABLE amc_ai_requests ADD COLUMN IF NOT EXISTS planning_result jsonb;
    ALTER TABLE amc_ai_requests ADD COLUMN IF NOT EXISTS operation_key text;
    CREATE INDEX IF NOT EXISTS amc_ai_requests_operation ON amc_ai_requests(scope_id,subject_id,runtime_lane,operation_key,created_at DESC);
    ALTER TABLE amc_ai_requests ADD COLUMN IF NOT EXISTS conversation_preview text;
    ALTER TABLE amc_ai_requests ADD COLUMN IF NOT EXISTS planning_checked_at timestamptz;
    CREATE INDEX IF NOT EXISTS amc_ai_requests_conversation ON amc_ai_requests(subject_id,(intent->>'brandId'),(intent->>'conversationId'),created_at);`)
}
export async function admitIntent(pool:Pool,actor:NativeActor,intent:NativeIntent,lane:RuntimeLane='default',readStatus?:(id:string,connection:PoolClient)=>Promise<string>){
  const operationKey=digest({...intent,requestKey:undefined,artifactPath:undefined})
  const id=digest([actor.scopeId,actor.subjectId,intent.requestKey]),hash=digest(intent)
  const c=await pool.connect()
  try{
    await c.query('BEGIN')
    const autopilot=intent.kind==='autopilot'||intent.kind==='creative'&&!!intent.autopilotRunId
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['amc-ai-admission:'+(autopilot?`autopilot:${intent.brandId}`:isDailyActor(actor)?actor.scopeId:actor.subjectId)])
    const old=(await c.query('SELECT * FROM amc_ai_requests WHERE id=$1',[id])).rows[0]
    if(old){if(old.digest!==hash&&!sameSkuIntent(old.intent,intent))throw nativeError('request_key_reused',409);await c.query('COMMIT');return old}
    if(readStatus){
      const candidates=(await c.query(`SELECT * FROM amc_ai_requests WHERE scope_id=$1 AND subject_id=$2 AND runtime_lane=$3 AND operation_key=$4 AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 10`,[actor.scopeId,actor.subjectId,lane,operationKey])).rows
      for(const candidate of candidates){
        if(!candidate.task_id||['queued','running','waiting'].includes(await readStatus(candidate.task_id,c))){await c.query('COMMIT');return candidate}
      }
    }
    const row=(await c.query('INSERT INTO amc_ai_requests(id,scope_id,subject_id,request_key,digest,intent,allowance,runtime_lane,operation_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id,actor.scopeId,actor.subjectId,intent.requestKey,hash,JSON.stringify(intent),0,lane,operationKey])).rows[0]
    await c.query('COMMIT');return row
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function intentBy(pool:Pool,actor:NativeActor,field:'id'|'request_key'|'task_id',value:string){
  const row=(await pool.query(`SELECT * FROM amc_ai_requests WHERE scope_id=$1 AND subject_id=$2 AND ${field}=$3`,[actor.scopeId,actor.subjectId,value])).rows[0]
  if(!row)throw nativeError('task_not_found',404)
  return row as {conversation_preview?:string;id:string;digest:string;intent:NativeIntent;task_id:string|null;request_key:string;allowance:number;runtime_lane:RuntimeLane;created_at:Date}
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
