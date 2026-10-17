import type {Pool} from 'pg'
import {prisma} from '../prisma'
import {brandFor,digest,nativeError,type NativeActor} from './contract'

/** Only revision metadata crosses this boundary, never the large source documents. */
export async function conversationSourceRevision(actor:NativeActor){
  const brandId=brandFor(actor)
  const [brand,interview,growth,attachments]=await Promise.all([
    prisma.brand.findUnique({where:{id:brandId},select:{updatedAt:true,knowledge:{select:{updatedAt:true}}}}),
    prisma.brandPlanInterview.findFirst({where:{brandId},orderBy:{completedAt:'desc'},select:{id:true,updatedAt:true}}),
    prisma.brandGrowthResearchSnapshot.findFirst({where:{brandId,source:'amc-growth'},orderBy:{generatedAt:'desc'},select:{id:true,updatedAt:true}}),
    prisma.mediaAsset.findFirst({where:{brandId,technicalMetadata:{path:['planningAttachment'],equals:true}},orderBy:{updatedAt:'desc'},select:{id:true,updatedAt:true}}),
  ])
  if(!brand)throw nativeError('brand_context_unavailable',404)
  return digest([brand,interview,growth,attachments])
}

/** Actor authorization is performed by the caller on every access, including hits.
 * Text payload preserves property order for the existing facts digest contract.
 * A transaction lock coalesces first loads across workers, not just this process.
 */
export async function cachedConversationContext<T>(pool:Pool,key:string,revision:()=>Promise<string>,load:()=>Promise<T>,ttl:(value:T)=>number){
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '35000ms'")
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['amc-conversation-context:'+key])
    const before=await revision()
    const old=(await client.query('SELECT payload FROM amc_conversation_context WHERE cache_key=$1 AND source_revision=$2 AND expires_at>clock_timestamp()',[key,before])).rows[0]
    if(old){await client.query('COMMIT');return JSON.parse(old.payload) as T}
    const value=await load()
    // Never publish a mixed snapshot if a source was edited while Growth was loading.
    if(await revision()!==before)throw nativeError('conversation_context_changed',409)
    await client.query(`INSERT INTO amc_conversation_context(cache_key,source_revision,payload,expires_at)
      VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 millisecond')
      ON CONFLICT(cache_key) DO UPDATE SET source_revision=EXCLUDED.source_revision,payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at`,[key,before,JSON.stringify(value),ttl(value)])
    await client.query(`DELETE FROM amc_conversation_context WHERE cache_key IN (
      SELECT cache_key FROM amc_conversation_context WHERE expires_at<now()
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED)`)
    await client.query('COMMIT');return value
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
