import type { Pool } from 'pg'
import { nativePool } from './store'
import { prisma } from '../prisma'
import { actorFor, nativeError } from './contract'
import { requireActor } from './application'
import { requireActorPermission } from '../role-permissions/delegation'

let database: Promise<Pool> | undefined
export async function autopilotDb() {
  if (!database) database = (async () => { const pool = nativePool(); await initializeAutopilot(pool); return pool })().catch(error => { database = undefined; throw error })
  return database
}
export async function initializeAutopilot(pool: Pool) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS amc_iaic;
    CREATE TABLE IF NOT EXISTS amc_iaic.autopilot_settings (
      brand_id text PRIMARY KEY REFERENCES public."Brand"(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 0,
      owner_id text NOT NULL REFERENCES public."User"(id), account_id text,
      daily_limit integer NOT NULL DEFAULT 1 CHECK(daily_limit BETWEEN 1 AND 3),
      objective text NOT NULL DEFAULT 'Prepare source-backed brand planning and reviewable content drafts.',
      cadence text NOT NULL DEFAULT 'daily' CHECK(cadence IN ('daily','weekly','monthly')),
      budget_limit_cents integer NOT NULL DEFAULT 0 CHECK(budget_limit_cents BETWEEN 0 AND 100000000),
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS amc_iaic.autopilot_runs (
      id text PRIMARY KEY, brand_id text NOT NULL REFERENCES public."Brand"(id) ON DELETE CASCADE,
      local_day text NOT NULL, owner_id text NOT NULL, account_id text NOT NULL,
      config_revision integer NOT NULL, daily_limit integer NOT NULL,
      objective text NOT NULL DEFAULT 'Prepare source-backed brand planning and reviewable content drafts.',
      cadence text NOT NULL DEFAULT 'daily', budget_limit_cents integer NOT NULL DEFAULT 0,
      step text NOT NULL DEFAULT 'profile', status text NOT NULL DEFAULT 'pending',
      evidence jsonb NOT NULL DEFAULT '{}', error text, updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(brand_id,local_day));
    ALTER TABLE amc_iaic.autopilot_runs ADD COLUMN IF NOT EXISTS task_id uuid;
    ALTER TABLE amc_iaic.autopilot_settings ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT 'Prepare source-backed brand planning and reviewable content drafts.';
    ALTER TABLE amc_iaic.autopilot_settings ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'daily';
    ALTER TABLE amc_iaic.autopilot_settings ADD COLUMN IF NOT EXISTS budget_limit_cents integer NOT NULL DEFAULT 0;
    ALTER TABLE amc_iaic.autopilot_runs ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT 'Prepare source-backed brand planning and reviewable content drafts.';
    ALTER TABLE amc_iaic.autopilot_runs ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'daily';
    ALTER TABLE amc_iaic.autopilot_runs ADD COLUMN IF NOT EXISTS budget_limit_cents integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS amc_iaic.autopilot_outputs (
      id text PRIMARY KEY, run_id text NOT NULL REFERENCES amc_iaic.autopilot_runs(id) ON DELETE CASCADE,
      brand_id text NOT NULL REFERENCES public."Brand"(id) ON DELETE CASCADE,
      creative_id text NOT NULL, revision_id text NOT NULL, source jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending', result jsonb, draft_id text, error text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(brand_id,creative_id));
    ALTER TABLE amc_iaic.autopilot_settings ALTER COLUMN enabled SET DEFAULT false;`)
  // Retire only untouched SYSTEM defaults. Explicit human choices survive restarts.
  await pool.query(`WITH disabled AS (
    UPDATE amc_iaic.autopilot_settings s SET enabled=false,revision=s.revision+1,updated_at=now()
    WHERE s.enabled=true AND s.revision=1
      AND EXISTS (SELECT 1 FROM public."AuditLog" a WHERE a."resourceId"=s.brand_id
        AND a."resourceType"='Brand' AND a."actorType"='SYSTEM' AND a.action='AUTOPILOT_DEFAULT_ENABLED'
        AND a.metadata->>'policy'='amcmm-user-ai-default-on-v1')
      AND NOT EXISTS (SELECT 1 FROM public."AuditLog" a WHERE a."resourceId"=s.brand_id
        AND a."resourceType"='Brand' AND a.action='AUTOPILOT_CONFIGURED')
    RETURNING s.brand_id,s.revision
  ) INSERT INTO public."AuditLog"(id,"actorType",action,"resourceType","resourceId",metadata,timestamp)
    SELECT gen_random_uuid()::text,'SYSTEM','AUTOPILOT_DEFAULT_DISABLED','Brand',brand_id,
      jsonb_build_object('policy','amcmm-user-ai-default-off-v1','previousEnabled',true,'previousRevision',1,'revision',revision,'publish',false),now()
    FROM disabled`)
}
export async function requireAutopilotOwner(userId: string, brandId: string, generate = true) {
  await requireActor(actorFor(brandId,userId))
  if (!await prisma.crewMember.findFirst({ where: { userId, active:true, role:{in:['PRINCIPAL','OWNER']}, crew:{brandId,brand:{status:'ACTIVE'}} } })) throw nativeError('autopilot_principal_required',403)
  if (generate) await requireActorPermission(userId,'draft.create',brandId)
}
export async function autopilotSettings(userId:string,brandId:string,body?:any) {
  await requireActor(actorFor(brandId,userId))
  const pool = await autopilotDb()
  if (body !== undefined) {
    await requireAutopilotOwner(userId,brandId,body.enabled===true)
    const objective=typeof body.objective==='string'?body.objective.trim():'Prepare source-backed brand planning and reviewable content drafts.'
    const cadence=typeof body.cadence==='string'?body.cadence:'daily'
    const budgetLimitCents=body.budgetLimitCents??0
    if (typeof body.enabled!=='boolean'||!Number.isInteger(body.revision)||body.revision<0||!Number.isInteger(body.dailyLimit)||body.dailyLimit<1||body.dailyLimit>3||objective.length<10||objective.length>500||!['daily','weekly','monthly'].includes(cadence)||!Number.isInteger(budgetLimitCents)||budgetLimitCents<0||budgetLimitCents>100000000) throw nativeError('invalid_autopilot_settings')
    const accountId=typeof body.accountId==='string'?body.accountId:null
    if (body.enabled && (!accountId || !await prisma.socialAccount.findFirst({where:{id:accountId,brandId,unboundAt:null,platformId:{in:['instagram','facebook','xiaohongshu','google_business']}}}))) throw nativeError('autopilot_account_required')
    const c=await pool.connect()
    try {
      await c.query('BEGIN')
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`social-account-sync:${brandId}`])
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`autopilot-config:${brandId}`])
      if (body.enabled && !(await c.query('SELECT id FROM public."SocialAccount" WHERE id=$1 AND "brandId"=$2 AND "unboundAt" IS NULL', [accountId, brandId])).rowCount) throw nativeError('autopilot_account_required')
      const old=(await c.query('SELECT * FROM amc_iaic.autopilot_settings WHERE brand_id=$1',[brandId])).rows[0]
      if ((old?.revision||0)!==body.revision) throw nativeError('autopilot_settings_conflict',409)
      await c.query(`INSERT INTO amc_iaic.autopilot_settings(brand_id,owner_id,enabled,revision,account_id,daily_limit,objective,cadence,budget_limit_cents) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8)
        ON CONFLICT(brand_id) DO UPDATE SET enabled=$3,revision=autopilot_settings.revision+1,owner_id=$2,account_id=$4,daily_limit=$5,objective=$6,cadence=$7,budget_limit_cents=$8,updated_at=now()`,[brandId,userId,body.enabled,accountId,body.dailyLimit,objective,cadence,budgetLimitCents])
      await c.query(`INSERT INTO public."AuditLog"(id,"actorId","actorType",action,"resourceType","resourceId",metadata,timestamp) VALUES($1,$2,'HUMAN','AUTOPILOT_CONFIGURED','Brand',$3,$4,now())`,[crypto.randomUUID(),userId,brandId,JSON.stringify({enabled:body.enabled,accountId,dailyLimit:body.dailyLimit,objective,cadence,budgetLimitCents,revision:body.revision+1,publish:false})])
      await c.query('COMMIT')
    } catch(e) { await c.query('ROLLBACK'); throw e } finally { c.release() }
  }
  const settings=(await pool.query('SELECT enabled,revision,account_id AS "accountId",daily_limit AS "dailyLimit",objective,cadence,budget_limit_cents AS "budgetLimitCents",updated_at AS "updatedAt" FROM amc_iaic.autopilot_settings WHERE brand_id=$1',[brandId])).rows[0]||{enabled:false,revision:0,accountId:null,dailyLimit:1,objective:'Prepare source-backed brand planning and reviewable content drafts.',cadence:'daily',budgetLimitCents:0}
  const runs=(await pool.query('SELECT id,task_id,local_day,step,status,error,evidence,updated_at FROM amc_iaic.autopilot_runs WHERE brand_id=$1 ORDER BY local_day DESC LIMIT 7',[brandId])).rows
  const outputs=(await pool.query('SELECT id,creative_id,status,draft_id,error,created_at FROM amc_iaic.autopilot_outputs WHERE brand_id=$1 ORDER BY created_at DESC LIMIT 21',[brandId])).rows
  const accounts=await prisma.socialAccount.findMany({where:{brandId,unboundAt:null,platformId:{in:['instagram','facebook','xiaohongshu','google_business']}},select:{id:true,platformId:true,displayName:true,handle:true}})
  if(settings.revision===0)settings.accountId=preferredAutopilotAccount(accounts)?.id||null
  let canManage=true;try { await requireAutopilotOwner(userId,brandId,false) } catch { canManage=false }
  return {settings,runs,outputs,accounts,canManage,publishRequiresConfirmation:true}
}

// Initialize disabled defaults only. Enabling requires an explicit principal/OWNER save.
export function preferredAutopilotAccount(accounts:Array<{id:string;platformId:string}>){
 const order=['instagram','facebook','xiaohongshu','google_business']
 return [...accounts].sort((a,b)=>order.indexOf(a.platformId)-order.indexOf(b.platformId)||a.id.localeCompare(b.id))[0]
}
export async function initializeBrandAutopilotDefault(brandId:string){
 const pool=await autopilotDb()
 if((await pool.query('SELECT 1 FROM amc_iaic.autopilot_settings WHERE brand_id=$1',[brandId])).rowCount)return
 const members=await prisma.crewMember.findMany({where:{active:true,role:{in:['PRINCIPAL','OWNER']},crew:{brandId,brand:{status:'ACTIVE'}},user:{type:'HUMAN',status:'ACTIVE'}},orderBy:{joinedAt:'asc'},select:{userId:true}})
 const accounts=await prisma.socialAccount.findMany({where:{brandId,unboundAt:null,platformId:{in:['instagram','facebook','xiaohongshu','google_business']}},select:{id:true,platformId:true}})
 const account=preferredAutopilotAccount(accounts)
 if(!account)return
 for(const member of members){
  try{await requireAutopilotOwner(member.userId,brandId)}catch{continue}
  const c=await pool.connect()
  try{
   await c.query('BEGIN')
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`social-account-sync:${brandId}`])
   if (!(await c.query('SELECT id FROM public."SocialAccount" WHERE id=$1 AND "brandId"=$2 AND "unboundAt" IS NULL', [account.id, brandId])).rowCount) {
    await c.query('ROLLBACK');return
   }
   const saved=await c.query(`INSERT INTO amc_iaic.autopilot_settings(brand_id,owner_id,enabled,revision,account_id,daily_limit) VALUES($1,$2,false,1,$3,1) ON CONFLICT DO NOTHING RETURNING brand_id`,[brandId,member.userId,account.id])
   if(saved.rowCount)await c.query(`INSERT INTO public."AuditLog"(id,"actorType",action,"resourceType","resourceId",metadata,timestamp) VALUES($1,'SYSTEM','AUTOPILOT_DEFAULT_DISABLED','Brand',$2,$3,now())`,[crypto.randomUUID(),brandId,JSON.stringify({policy:'amcmm-user-ai-default-off-v1',principalId:member.userId,accountId:account.id,dailyLimit:1,publish:false})])
   await c.query('COMMIT');return
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
 }
}
