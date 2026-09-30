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
    CREATE INDEX IF NOT EXISTS brand_ideas_brand ON amc_iaic.brand_ideas(brand_id,created_at);`)
}
async function database(){
  if(!state.amcIdeaPool)state.amcIdeaPool=(async()=>{const pool=nativePool();try{await initializeIdeaPool(pool);return pool}catch(e){await pool.end();throw e}})().catch(e=>{state.amcIdeaPool=undefined;throw e})
  return state.amcIdeaPool
}
export function brandDay(timezone:string|null|undefined,now=new Date()){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone||'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}catch{return now.toISOString().slice(0,10)}
}
// Sources remain immutable after selection. Replacing a suggestion never touches a plan or a Core task.
export async function refreshBrandIdeas(pool:Pool,facts:any,match=matchPromotionStrategyCreativeCandidates,now=new Date()){
  const day=brandDay(facts.timezone,now)
  const claimed=await pool.query(`INSERT INTO amc_iaic.brand_idea_days(brand_id,local_day) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING brand_id`,[facts.id,day])
  if(!claimed.rowCount)return {skipped:true}
  try{
    const previous=(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 ORDER BY (replaced_at IS NULL) DESC,created_at DESC,id LIMIT 72',[facts.id])).rows
    const active=previous.filter(row=>!row.replaced_at)
    const response=await match({merchantId:facts.id,merchantName:facts.name,merchantCategory:facts.industry||'',market:facts.knowledge?.market||facts.location||undefined,promotionPointId:`daily-${facts.id}-${day}`,promotionGoal:'根据品牌真实资料寻找适合品牌与产品的内容创意，提供脚本和所需素材。',sellingPoint:[facts.name,facts.description,...(facts.productCatalog||[]).slice(0,6).map((sku:any)=>sku.name)].filter(Boolean).join('；').slice(0,600),requestedCandidateCount:Math.max(3,IDEA_POOL_MIN-active.length),excludeCreativeIds:previous.map(row=>row.source_id),requirePersistedCreative:true,platforms:['instagram','xiaohongshu','tiktok']})
    const seen=new Set(previous.map(row=>row.source_id))
    const sources=(response.creativeCandidates||[]).filter(source=>typeof source.inspirationCreativeId==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(source.inspirationCreativeId)&&!seen.has(source.inspirationCreativeId)&&!!seen.add(source.inspirationCreativeId)).slice(0,Math.max(3,IDEA_POOL_MIN-active.length)).map(sourceExcerpt)
    if(!sources.length&&(response.contentLibraryGaps||[]).some(g=>Number(g.status)>=400))throw nativeError('content_library_unavailable',503)
    const connection=await pool.connect()
    let added=0
    try{
      await connection.query('BEGIN')
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`idea-pool:${facts.id}`])
      const current=(await connection.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY (selected_at IS NOT NULL),created_at,id FOR UPDATE',[facts.id])).rows
      let count=current.length
      const replaceable=[...current]
      for(const source of sources){
        if(count>=IDEA_POOL_MAX){const oldest=replaceable.shift();if(!oldest)break;await connection.query('UPDATE amc_iaic.brand_ideas SET replaced_at=now() WHERE id=$1',[oldest.id]);count--}
        await connection.query('INSERT INTO amc_iaic.brand_ideas(id,brand_id,source_id,source,context_digest,match_id,library_versions) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),facts.id,source.inspirationCreativeId,JSON.stringify(source),digest(facts),response.contentMatchRequestId||'',JSON.stringify(response.libraryVersions||{})]);count++;added++
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
  const items=(await pool.query('SELECT id,source_id,source,created_at,selected_at FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY created_at DESC,id',[brandId])).rows
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
      for(const brand of brands){if(stopped)break;try{const facts=await readBrandFacts(prisma,brand.id);if(facts)await refreshBrandIdeas(pool,facts)}catch{console.error('[idea-pool] daily brand search unavailable',brand.id)}}
    }catch{console.error('[idea-pool] worker unavailable')}finally{running=false}
  }
  void tick();const timer=setInterval(()=>void tick(),60000);timer.unref()
  process.once('SIGTERM',()=>{stopped=true;clearInterval(timer)})
}
