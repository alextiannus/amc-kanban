import {readDislikedCreativeSources,creativeIsVisible,creativeSourceId} from '../brand-plan/creativeVisibility'
import {rankedIdeas,matchScore} from './idea-selection-policy'
import {BRAINSTORM_FEED,eligibleBrainstormSource} from './brainstorm-contract'
import {diverseCreatives} from './creative-diversity'
import {calendarCreativeOption} from '../brand-plan/calendarSync'
import type {Pool} from 'pg'
import {nativePool} from './store'
import {actorFor,digest,nativeError} from './contract'
import {requireActor} from './application'
import {prisma} from '../prisma'
import {readBrandFacts} from './facts'
import {sourceExcerpt,type LibrarySnapshot} from './library'
import {matchPromotionStrategyCreativeCandidates} from '../promotion-strategy/clients'

export const IDEA_POOL_MIN=6, IDEA_POOL_MAX=18
const state=globalThis as typeof globalThis & {amcIdeaPool?:Promise<Pool>;amcIdeaPoolWorker?:boolean}
export async function initializeIdeaPool(pool:Pool){
  await pool.query('CREATE SCHEMA IF NOT EXISTS amc_iaic')
  await pool.query(`CREATE TABLE IF NOT EXISTS amc_iaic.brand_idea_days (
    brand_id text NOT NULL, local_day text NOT NULL, status text NOT NULL DEFAULT 'running',
    started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error text,
    added integer NOT NULL DEFAULT 0, PRIMARY KEY(brand_id,local_day));
    ALTER TABLE amc_iaic.brand_idea_days ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS lease_id uuid;
    CREATE TABLE IF NOT EXISTS amc_iaic.brand_ideas (
    id uuid PRIMARY KEY, brand_id text NOT NULL, source_id text NOT NULL,
    source jsonb NOT NULL, context_digest text NOT NULL, match_id text NOT NULL,
    library_versions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    selected_at timestamptz, replaced_at timestamptz);
    CREATE UNIQUE INDEX IF NOT EXISTS brand_ideas_active_source ON amc_iaic.brand_ideas(brand_id,source_id) WHERE replaced_at IS NULL;
    ALTER TABLE amc_iaic.brand_ideas ADD COLUMN IF NOT EXISTS owner_id text, ADD COLUMN IF NOT EXISTS task_id uuid, ADD COLUMN IF NOT EXISTS plan_id text, ADD COLUMN IF NOT EXISTS plan_month text, ADD COLUMN IF NOT EXISTS last_error text, ADD COLUMN IF NOT EXISTS recovery_of_task_id uuid, ADD COLUMN IF NOT EXISTS recovery_version text;
    CREATE INDEX IF NOT EXISTS brand_ideas_brand ON amc_iaic.brand_ideas(brand_id,created_at);`)
}
async function database(){
  if(!state.amcIdeaPool)state.amcIdeaPool=(async()=>{const pool=nativePool();try{await initializeIdeaPool(pool);return pool}catch(e){await pool.end();throw e}})().catch(e=>{state.amcIdeaPool=undefined;throw e})
  return state.amcIdeaPool
}
export function brandDay(timezone:string|null|undefined,now=new Date()){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}catch{return now.toISOString().slice(0,10)}
}
// Original evidence stays immutable; reconciliation archives only unreviewed automatic plans.
export async function rebalanceIdeaPool(pool:Pool,brandId:string){
 const client=await pool.connect()
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`idea-pool:${brandId}`])
  const rows=(await client.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY (selected_at IS NOT NULL) DESC,created_at DESC,id FOR UPDATE',[brandId])).rows
  const keep=diverseCreatives(rows.filter(row=>!row.selected_at).map(row=>({...row.source,poolId:row.id})),[],IDEA_POOL_MAX)
  const ids=new Set(keep.map(source=>source.poolId))
  for(const row of rows)if(!row.selected_at&&!ids.has(row.id))await client.query('UPDATE amc_iaic.brand_ideas SET replaced_at=now() WHERE id=$1',[row.id])
  await client.query('COMMIT')
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
/** Retired: historical callers must not restart background discovery. */
export async function refreshBrandIdeas(_pool:Pool,_facts:any,_match=matchPromotionStrategyCreativeCandidates,_now=new Date()){
 return {skipped:true,reason:'interactive_keyword_matching_only'}
}
export async function readIdeaPool(userId:string,brandId:string){
  await requireActor(actorFor(brandId,userId))
  const pool=await database()
  let items=(await pool.query('SELECT id,source_id,source,created_at,selected_at,plan_id,plan_month,last_error,task_id FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY created_at DESC,id',[brandId])).rows
  const knowledge=await prisma.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true}})
  const disliked=await readDislikedCreativeSources(prisma,brandId,knowledge?.marketingSolution);items=items.filter(item=>!disliked.has(item.source_id))
  const months=(knowledge?.marketingSolution as any)?.publishingCalendar?.months||{}
  for(const item of items)item.creative=item.plan_id?calendarCreativeOption((months[item.plan_month]||[]).find((creative:any)=>creative.id===item.plan_id)||{}):null
  const latest=(await pool.query('SELECT local_day,status,started_at,completed_at,added FROM amc_iaic.brand_idea_days WHERE brand_id=$1 ORDER BY local_day DESC LIMIT 1',[brandId])).rows[0]||null
  if(latest?.status==='running'&&Date.now()-new Date(latest.started_at).getTime()>600000)latest.status='interrupted'
  return {items:rankedIdeas(items).map(item=>({...item,matchScore:matchScore(item),selectedForCalendar:!!item.creative?.draftId})),minimum:IDEA_POOL_MIN,maximum:IDEA_POOL_MAX,shortfall:Math.max(0,IDEA_POOL_MIN-items.length),latest}
}
export async function selectPoolIdea(brandId:string,id:unknown){
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw nativeError('idea_not_found',404)
  const pool=await database()
  // A single update serializes with daily replacement's row locks.
  const idea=(await pool.query('UPDATE amc_iaic.brand_ideas SET selected_at=COALESCE(selected_at,now()) WHERE id=$1 AND brand_id=$2 AND (replaced_at IS NULL OR selected_at IS NOT NULL) RETURNING *',[id,brandId])).rows[0]
  if(!idea)throw nativeError('idea_not_found',404)
  return idea
}
export async function poolIdeaLibrary(brandId:string,id:string,facts:any):Promise<LibrarySnapshot>{
  const pool=await database()
  const idea=(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE id=$1 AND brand_id=$2 AND selected_at IS NOT NULL',[id,brandId])).rows[0]
  if(!idea||(facts.dislikedSourceIds||[]).includes(idea.source_id))throw nativeError('idea_not_found',404)
  const payload={contentMatchRequestId:idea.match_id,sources:[idea.source],gaps:[],libraryVersions:idea.library_versions,contextDigest:digest(facts)}
  return {...payload,libraryDigest:digest(payload),retrievedAt:new Date(idea.created_at).toISOString()}
}
// Compatibility exports intentionally perform no reads, matches or scheduling.
export function ideaRefreshDue(_row:any,_now=new Date()){return false}
export async function runIdeaPoolMaintenance(_pool:Pool,_db:any=prisma,_factsReader=readBrandFacts,_refresh=refreshBrandIdeas,_now=new Date(),_isStopped=()=>false){
 return {skipped:true,reason:'interactive_keyword_matching_only'}
}
export function startIdeaPoolWorker(){return {enabled:false,reason:'interactive_keyword_matching_only'}}
