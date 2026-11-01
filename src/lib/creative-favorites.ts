import {isDeepStrictEqual} from 'node:util'
import {prisma} from './prisma'
import {authorizeBrainstorm,favoriteCandidates} from './ai-native/brainstorm'
import {digest,nativeError} from './ai-native/contract'
import {resolveBrainstormVideos} from './ai-native/brainstorm-video'
import {fetchCreativeSourceEvidence} from './promotion-strategy/clients'
export const favoriteId=(user:string,brand:string,source:string)=>'favorite_'+digest([user,brand,source]).slice(0,48)
export async function writeFavorite(tx:any,userId:string,brandId:string,candidate:any,saved:boolean,expectedVersion?:number){
 const sourceId=candidate.idea.sourceId,id=favoriteId(userId,brandId,sourceId)
 const old=await tx.brandMarketingSolution.findUnique({where:{id}})
 if(old&&old.status===(saved?'SAVED':'REMOVED')&&(!saved||!candidate.idea.workspace||isDeepStrictEqual((old.output as any)?.idea?.workspace,candidate.idea.workspace)))return {id,sourceId,saved,version:old.version}
 if(expectedVersion!==undefined&&(old?.version||0)!==expectedVersion)throw nativeError('favorite_changed',409)
 const data={status:saved?'SAVED':'REMOVED',input:{sourceId},output:candidate,version:(old?.version||0)+1}
 await tx.brandMarketingSolution.upsert({where:{id},create:{id,brandId,kind:'CREATIVE_FAVORITE',period:sourceId,createdById:userId,generationMode:'HUMAN_CHOICE',...data},update:data})
 return {id,sourceId,saved,version:data.version}
}
export async function setCreativeFavorite(userId:string,brandId:string,body:any){
 if(!body||typeof body.saved!=='boolean'||(!body.sourceId&&!body.creativeId)||[body.sourceId,body.creativeId].some(v=>v!==undefined&&(typeof v!=='string'||v.length>200))||body.expectedVersion!==undefined&&(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0))throw nativeError('invalid_favorite',400)
 await authorizeBrainstorm(userId,brandId,true)
 let candidate:any
 if(!body.saved&&body.sourceId){const old=await prisma.brandMarketingSolution.findUnique({where:{id:favoriteId(userId,brandId,body.sourceId)}});candidate=old?.output||{idea:{sourceId:body.sourceId},current:{}}}
 else candidate=(await favoriteCandidates(userId,brandId,body))[0]
 if(!candidate)throw nativeError('brainstorm_source_not_found',404)
 return prisma.$transaction(async(tx:any)=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'favorites:'+brandId+':'+userId}))::text`;await authorizeBrainstorm(userId,brandId,true,tx);return writeFavorite(tx,userId,brandId,candidate,body.saved,body.expectedVersion)})
}
export async function listCreativeFavorites(userId:string,brandId:string,keysOnly=false){
 const {canDecide}=await authorizeBrainstorm(userId,brandId)
 const [rows,legacy]=await Promise.all([prisma.brandMarketingSolution.findMany({where:{brandId,createdById:userId,kind:'CREATIVE_FAVORITE'},orderBy:{updatedAt:'desc'}}),favoriteCandidates(userId,brandId)])
 const seen=new Set(rows.map((r:any)=>r.period)),candidates:any[]=rows.filter((r:any)=>r.status==='SAVED').map((r:any)=>({...r.output as any,favoriteVersion:r.version}));for(const c of legacy)if(!seen.has(c.idea.sourceId)){seen.add(c.idea.sourceId);candidates.push({...c,favoriteVersion:0})}
 if(keysOnly)return {brandId,canDecide,items:candidates.map(c=>({sourceId:c.idea.sourceId,favoriteVersion:c.favoriteVersion}))}
 const resolved=await resolveBrainstormVideos(candidates,brandId,id=>fetchCreativeSourceEvidence(id))
 const byId=new Map(resolved.items.map((i:any)=>[i.sourceId,i]))
 return {brandId,canDecide,items:candidates.map(c=>({...c.idea,...(byId.get(c.idea.sourceId)||{videoUrl:null,sourceUnavailable:true}),favoriteVersion:c.favoriteVersion,saved:true}))}
}
// Called after the production write boundary accepts a completed output and pinned lineage.
export async function completeFavoriteForVideo(tx:any,job:any){
 if(!['completed','complete'].includes(job.status)||!job.finalVideoUrl||!job.createdBy)return
 const editor=job.plan?._mmVideoJob?.editor,sourceId=editor?.sourceReference?.inspirationCreativeId||editor?.sourceReference?.creativeId
 if(!sourceId||!editor?.creativeRevisionId)return
 const id=favoriteId(job.createdBy,job.brandId,sourceId),old=await tx.brandMarketingSolution.findUnique({where:{id}})
 if(old?.status==='SAVED')await tx.brandMarketingSolution.updateMany({where:{id,status:'SAVED',version:old.version},data:{status:'COMPLETED',version:{increment:1},input:{...(old.input as any),completedJobId:job.id}}})
 // A legacy selection also needs a tombstone, or it would reappear on the next read.
 if(!old)await tx.brandMarketingSolution.upsert({where:{id},create:{id,brandId:job.brandId,createdById:job.createdBy,kind:'CREATIVE_FAVORITE',period:sourceId,status:'COMPLETED',generationMode:'VERIFIED_PRODUCTION',input:{completedJobId:job.id},output:{}},update:{}})
}
