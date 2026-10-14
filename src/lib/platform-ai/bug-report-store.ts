import {randomUUID} from 'node:crypto'
import type {Pool} from 'pg'
import {conversationInput,digest,nativeError,requestKey} from '../ai-native/contract'

export const isBugCommand=(value:unknown):value is string=>typeof value==='string'&&/^\/bug(?:\s|$)/i.test(value.trim())

export function bugInput(body:any){
  if(!isBugCommand(body?.goal)||body.goal.length>6000)throw nativeError('invalid_bug_command')
  // Only explicitly whitelisted conversation fields enter the engineering inbox.
  const {history,currentPage,contextSessionId}=conversationInput({history:body.history,currentPage:body.currentPage,contextSessionId:body.contextSessionId})
  return {requestKey:requestKey(body.requestKey),description:body.goal.trim().slice(4).trim(),history,currentPage,contextSessionId}
}

export async function initializeBugReports(pool:Pool){
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('amc-bug-reports-init',0))")
    await client.query(`CREATE TABLE IF NOT EXISTS public.amc_bug_reports (
    id uuid PRIMARY KEY, user_id text NOT NULL, brand_id text NOT NULL,
    request_key text NOT NULL, input_digest text NOT NULL, evidence jsonb NOT NULL,
    status text NOT NULL DEFAULT 'waiting_executor' ,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,brand_id,request_key)
    )`)
    await client.query(`ALTER TABLE public.amc_bug_reports DROP CONSTRAINT IF EXISTS amc_bug_reports_status_check;
      ALTER TABLE public.amc_bug_reports ADD COLUMN IF NOT EXISTS task_id uuid;
      ALTER TABLE public.amc_bug_reports ADD COLUMN IF NOT EXISTS result jsonb;
      ALTER TABLE public.amc_bug_reports ADD COLUMN IF NOT EXISTS runtime_closed_at timestamptz;
      CREATE TABLE IF NOT EXISTS public.amc_platform_settings (id text PRIMARY KEY, encrypted_config text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS public.amc_platform_operations (
        id text PRIMARY KEY, report_id uuid NOT NULL REFERENCES public.amc_bug_reports(id),
        action text NOT NULL, input jsonb NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now());`)
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

function receipt(row:any){
  return {kind:'bug_report' as const,id:row.id,status:row.status,createdAt:row.created_at,...(row.result?{result:row.result}:{})}
}

export async function saveBugReport(pool:Pool,userId:string,brandId:string,body:unknown){
  const input=bugInput(body),hash=digest(input)
  const evidence={...input,requestKey:undefined,source:'user_report',trusted:false,release:process.env.RENDER_GIT_COMMIT||null}
  const result=await pool.query(`INSERT INTO public.amc_bug_reports(id,user_id,brand_id,request_key,input_digest,evidence)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,brand_id,request_key) DO NOTHING RETURNING *`,
    [randomUUID(),userId,brandId,input.requestKey,hash,JSON.stringify(evidence)])
  const row=result.rows[0]||(await pool.query('SELECT * FROM public.amc_bug_reports WHERE user_id=$1 AND brand_id=$2 AND request_key=$3',[userId,brandId,input.requestKey])).rows[0]
  if(!row||row.input_digest!==hash)throw nativeError('request_key_reused',409)
  return receipt(row)
}

export async function readBugReport(pool:Pool,userId:string,brandId:string,id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw nativeError('bug_report_not_found',404)
  const row=(await pool.query('SELECT id,status,created_at,result FROM public.amc_bug_reports WHERE id=$1 AND user_id=$2 AND brand_id=$3',[id,userId,brandId])).rows[0]
  if(!row)throw nativeError('bug_report_not_found',404)
  return receipt(row)
}
