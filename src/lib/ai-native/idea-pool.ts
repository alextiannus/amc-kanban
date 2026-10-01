import {creativeDirection,diverseCreatives,duplicateCreative} from './creative-diversity'
import {advanceDailyPlanning} from './daily-planning'
import {calendarCreativeOption} from '../brand-plan/calendarSync'
import {randomUUID} from 'node:crypto'
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
    CREATE TABLE IF NOT EXISTS amc_iaic.brand_ideas (
    id uuid PRIMARY KEY, brand_id text NOT NULL, source_id text NOT NULL,
    source jsonb NOT NULL, context_digest text NOT NULL, match_id text NOT NULL,
    library_versions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    selected_at timestamptz, replaced_at timestamptz);
    CREATE UNIQUE INDEX IF NOT EXISTS brand_ideas_active_source ON amc_iaic.brand_ideas(brand_id,source_id) WHERE replaced_at IS NULL;
    ALTER TABLE amc_iaic.brand_ideas ADD COLUMN IF NOT EXISTS owner_id text, ADD COLUMN IF NOT EXISTS task_id uuid, ADD COLUMN IF NOT EXISTS plan_id text, ADD COLUMN IF NOT EXISTS plan_month text, ADD COLUMN IF NOT EXISTS plan_date text, ADD COLUMN IF NOT EXISTS last_error text, ADD COLUMN IF NOT EXISTS recovery_of_task_id uuid, ADD COLUMN IF NOT EXISTS recovery_version text;
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
  const keep=diverseCreatives(rows.map(row=>({...row.source,poolId:row.id})),[],IDEA_POOL_MAX)
  const ids=new Set(keep.map(source=>source.poolId))
  for(const row of rows)if(!ids.has(row.id))await client.query('UPDATE amc_iaic.brand_ideas SET replaced_at=now() WHERE id=$1',[row.id])
  await client.query('COMMIT')
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function refreshBrandIdeas(pool:Pool,facts:any,match=matchPromotionStrategyCreativeCandidates,now=new Date()){
  await rebalanceIdeaPool(pool,facts.id)
  const day=brandDay(facts.timezone,now)
  const claimed=await pool.query(`INSERT INTO amc_iaic.brand_idea_days(brand_id,local_day) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING brand_id`,[facts.id,day])
  if(!claimed.rowCount)return {skipped:true}
  try{
    const previous=(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 ORDER BY (replaced_at IS NULL) DESC,created_at DESC,id LIMIT 72',[facts.id])).rows
    const active=previous.filter(row=>!row.replaced_at)
    const knowledge=await prisma.brandKnowledge.findUnique({where:{brandId:facts.id},select:{marketingSolution:true}})
    const plans:any[]=Object.values((knowledge?.marketingSolution as any)?.publishingCalendar?.months||{}).flat().filter((item:any)=>item&&!['archived','deleted','published','done','已发布','已完成','归档','已删除'].includes(item.status))
    const fixed=plans.filter(item=>!item.nativeDaily||item.nativeReviewStatus!=='pending_review')
    const counts:Record<string,number>={};for(const item of fixed){const direction=creativeDirection(item);counts[direction]=Math.min(2,(counts[direction]||0)+1)}
    for(const row of active){const direction=creativeDirection(row.source);counts[direction]=Math.max(counts[direction]||0,1)}
    const excluded=[...new Set([...plans.map(item=>item.nativeSourceSnapshot?.source?.inspirationCreativeId).filter(Boolean),...previous.map(row=>row.source_id)])].slice(0,72)
    const response=await match({merchantId:facts.id,merchantName:facts.name,merchantCategory:facts.industry||'',market:facts.knowledge?.market||facts.location||undefined,promotionPointId:`daily-${facts.id}-${day}`,promotionGoal:'根据品牌真实资料寻找适合品牌与产品的内容创意，提供脚本和所需素材。',sellingPoint:[facts.name,facts.description,...(facts.productCatalog||[]).slice(0,6).map((sku:any)=>sku.name)].filter(Boolean).join('；').slice(0,600),requestedCandidateCount:8,diversify:true,directionCounts:counts,excludeCreativeIds:excluded,requirePersistedCreative:true,platforms:['instagram','xiaohongshu','tiktok']})
    const seen=new Set(previous.map(row=>row.source_id))
    const sources=(response.creativeCandidates||[]).filter(source=>typeof source.inspirationCreativeId==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(source.inspirationCreativeId)&&!seen.has(source.inspirationCreativeId)&&!!seen.add(source.inspirationCreativeId)).slice(0,8).map(sourceExcerpt)
    if(!sources.length&&(response.contentLibraryGaps||[]).some(g=>Number(g.status)>=400))throw nativeError('content_library_unavailable',503)
    const connection=await pool.connect()
    let added=0
    try{
      await connection.query('BEGIN')
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`idea-pool:${facts.id}`])
      const current=(await connection.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY (selected_at IS NOT NULL),created_at,id FOR UPDATE',[facts.id])).rows
      let count=current.length
      const replaceable=[...current]
      const kept=[...current]
      for(const source of diverseCreatives(sources,[],sources.length)){
        if(kept.some(row=>duplicateCreative(row.source,source))||plans.some(item=>duplicateCreative(item,source))||fixed.filter(item=>creativeDirection(item)===creativeDirection(source)).length>=2)continue
        const same=kept.filter(row=>creativeDirection(row.source)===creativeDirection(source))
        if(same.length>=2){
          const old=same.find(row=>!String(row.id).startsWith('new-'))
          if(!old)continue
          await connection.query('UPDATE amc_iaic.brand_ideas SET replaced_at=now() WHERE id=$1',[old.id]);kept.splice(kept.indexOf(old),1);replaceable.splice(replaceable.indexOf(old),1);count--
        }
        if(count>=IDEA_POOL_MAX){const oldest=replaceable.shift();if(!oldest)break;await connection.query('UPDATE amc_iaic.brand_ideas SET replaced_at=now() WHERE id=$1',[oldest.id]);kept.splice(kept.findIndex(row=>row.id===oldest.id),1);count--}
        await connection.query('INSERT INTO amc_iaic.brand_ideas(id,brand_id,source_id,source,context_digest,match_id,library_versions) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),facts.id,source.inspirationCreativeId,JSON.stringify(source),digest(facts),response.contentMatchRequestId||'',JSON.stringify(response.libraryVersions||{})]);count++;added++;kept.push({id:'new-'+added,source,selected_at:null,plan_id:null})
        if(added>=Math.max(3,IDEA_POOL_MIN-active.length))break
      }
      await connection.query("UPDATE amc_iaic.brand_idea_days SET status='completed',completed_at=now(),added=$3 WHERE brand_id=$1 AND local_day=$2",[facts.id,day,added])
      await connection.query('COMMIT')
    }catch(e){await connection.query('ROLLBACK');throw e}finally{connection.release()}
    return {skipped:false,added}
  }catch(e){await pool.query("UPDATE amc_iaic.brand_idea_days SET status='failed',completed_at=now(),error='daily_search_unavailable' WHERE brand_id=$1 AND local_day=$2",[facts.id,day]);throw e}
}
export async function readIdeaPool(userId:string,brandId:string){
  await requireActor(actorFor(brandId,userId))
  const pool=await database()
  const items=(await pool.query('SELECT id,source_id,source,created_at,selected_at,plan_id,plan_month,last_error,task_id FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY created_at DESC,id',[brandId])).rows
  const knowledge=await prisma.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true}})
  const months=(knowledge?.marketingSolution as any)?.publishingCalendar?.months||{}
  for(const item of items)item.creative=item.plan_id?calendarCreativeOption((months[item.plan_month]||[]).find((creative:any)=>creative.id===item.plan_id)||{}):null
  const latest=(await pool.query('SELECT local_day,status,started_at,completed_at,added FROM amc_iaic.brand_idea_days WHERE brand_id=$1 ORDER BY local_day DESC LIMIT 1',[brandId])).rows[0]||null
  if(latest?.status==='running'&&Date.now()-new Date(latest.started_at).getTime()>600000)latest.status='interrupted'
  return {items,minimum:IDEA_POOL_MIN,maximum:IDEA_POOL_MAX,shortfall:Math.max(0,IDEA_POOL_MIN-items.length),latest}
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
  if(!idea)throw nativeError('idea_not_found',404)
  const payload={contentMatchRequestId:idea.match_id,sources:[idea.source],gaps:[],libraryVersions:idea.library_versions,contextDigest:digest(facts)}
  return {...payload,libraryDigest:digest(payload),retrievedAt:new Date(idea.created_at).toISOString()}
}
export function startIdeaPoolWorker(){
  if(state.amcIdeaPoolWorker)return
  state.amcIdeaPoolWorker=true
  let running=false,stopped=false
  const tick=async()=>{
    if(running||stopped)return;running=true
    try{
      const pool=await database()
      // At-most-once daily admission persists across replicas and process restarts.
      const brands=await prisma.brand.findMany({where:{status:'ACTIVE'},select:{id:true}})
      for(const brand of brands){if(stopped)break;try{const facts=await readBrandFacts(prisma,brand.id);if(facts)await refreshBrandIdeas(pool,facts)}catch{console.error('[idea-pool] daily brand search unavailable',brand.id)}try{await advanceDailyPlanning(pool,brand.id)}catch{console.error('[idea-pool] daily planning unavailable',brand.id)}}
    }catch{console.error('[idea-pool] worker unavailable')}finally{running=false}
  }
  void tick();const timer=setInterval(()=>void tick(),60000);timer.unref()
  process.once('SIGTERM',()=>{stopped=true;clearInterval(timer)})
}
