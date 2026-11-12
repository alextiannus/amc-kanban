import {prisma} from './prisma'
import {authorizeBrainstorm} from './ai-native/brainstorm'
import {nativeError} from './ai-native/contract'
import {readDislikedCreativeSources} from './brand-plan/creativeVisibility'
import {storeBrainstormSources} from './ai-native/brainstorm-storage'
import {LIBRARY_IMPORT,libraryImportId} from './ai-native/library-imports'
import {contentLibraryRequest} from './promotion-strategy/clients'
import {creativeSourceScript} from './brand-plan/creativeSourceScript'
import {streamSourceVideoMedia} from './brand-plan/creativeSourceMedia'
import {fetchCreativeSourceThumbnail} from './promotion-strategy/clients'
import {canUserAccessBrand} from './user-management/brandAccess'
import {creativeWorkspace} from './brand-plan/creativeRevisionContract'
import {sourceMediaLocation} from './brand-plan/creativeSourceMediaPolicy'

export async function authorizeLibrary(userId:string,brandId:string,write=false,db:any=prisma){
  const result=await authorizeBrainstorm(userId,brandId,write,db)
  if(!result.canSearchLibrary)throw nativeError('library_access_denied',403)
  return {...result,canAdd:write||result.canDecide&&await canUserAccessBrand(brandId,userId,'WRITE',db)}
}
const validId=(id:unknown)=>typeof id==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(id)
function pinned(body:any){
  if(!validId(body?.sourceId)||typeof body.sourceRevision!=='string'||!body.sourceRevision||body.sourceRevision.length>1000||!/^[a-f0-9]{64}$/.test(body.sourceDigest||''))throw nativeError('invalid_library_source',400)
}
async function currentSource(sourceId:string,load=contentLibraryRequest,projection?:'media'){return load('library-source',{creativeId:sourceId,...(projection?{projection}:{})})}
function checkPin(raw:any,body:any){if(raw.creativeId!==body.sourceId||raw.sourceRevision!==body.sourceRevision||raw.sourceDigest!==body.sourceDigest)throw nativeError('creative_source_changed',409)}
const usableSource=(raw:any)=>!!sourceMediaLocation(raw.originalVideoUrl)||!!creativeSourceScript(raw).trim()
async function libraryDislikes(db:any,brandId:string){
  const knowledge=await db.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true,brandPlan:true}})
  return readDislikedCreativeSources(db,brandId,creativeWorkspace(knowledge))
}
function mediaPath(brandId:string,raw:any,thumbnail=false){
  const query=new URLSearchParams({sourceRevision:raw.sourceRevision,sourceDigest:raw.sourceDigest,...(thumbnail?{kind:'thumbnail'}:{})})
  return `/api/brands/${encodeURIComponent(brandId)}/creative-library/${encodeURIComponent(raw.creativeId)}/media?${query}`
}
export async function searchCreativeLibrary(userId:string,brandId:string,q:string,page:number,db:any=prisma,load=contentLibraryRequest){
  const {canAdd}=await authorizeLibrary(userId,brandId,false,db)
  if(typeof q!=='string'||q.length>300||!Number.isSafeInteger(page)||page<1||page>10000)throw nativeError('invalid_library_search',400)
  const result=await load('search',{q:q.trim(),page})
  const ids=result.items.map((i:any)=>i.creativeId)
  const [rows,disliked]=await Promise.all([db.brandMarketingSolution.findMany({where:{brandId,kind:LIBRARY_IMPORT,period:{in:ids},status:'SAVED'},select:{period:true}}),libraryDislikes(db,brandId)])
  const imported=new Set(rows.map((r:any)=>r.period))
  return {brandId,canAdd,page:result.page,total:result.total,totalPages:result.totalPages,items:result.items.map((raw:any)=>({...raw,sourceId:raw.creativeId,thumbnailUrl:mediaPath(brandId,raw,true),imported:imported.has(raw.creativeId),blocked:disliked.has(raw.creativeId)}))}
}
export async function readCreativeLibrary(userId:string,brandId:string,sourceId:string,db:any=prisma,load=contentLibraryRequest){
  const {canAdd}=await authorizeLibrary(userId,brandId,false,db)
  if(!validId(sourceId))throw nativeError('invalid_library_source',400)
  const raw=await currentSource(sourceId,load)
  const [row,disliked]=await Promise.all([db.brandMarketingSolution.findUnique({where:{id:libraryImportId(brandId,sourceId)}}),libraryDislikes(db,brandId)])
  return {brandId,canAdd,sourceId,sourceRevision:raw.sourceRevision,sourceDigest:raw.sourceDigest,title:raw.title||'',platform:raw.platform||'',scriptKind:raw.scriptKind,
    originalScript:creativeSourceScript(raw),scriptTypes:(raw.tags||[]).filter((t:any)=>t.groupKey==='script_type').map((t:any)=>({id:t.id,label:t.label})),
    videoUrl:raw.originalVideoUrl?mediaPath(brandId,raw):null,thumbnailUrl:mediaPath(brandId,raw,true),imported:row?.status==='SAVED',blocked:disliked.has(sourceId)||!usableSource(raw)}
}
export async function addCreativeLibrary(userId:string,brandId:string,body:any,db:any=prisma,load=contentLibraryRequest){
  if(!body||Object.keys(body).some(k=>!['sourceId','sourceRevision','sourceDigest'].includes(k)))throw nativeError('invalid_library_source',400)
  pinned(body);await authorizeLibrary(userId,brandId,true,db)
  return db.$transaction(async(tx:any)=>{
    await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{},select:{id:true}})
    await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
    await authorizeLibrary(userId,brandId,true,tx)
    const disliked=await libraryDislikes(tx,brandId)
    if(disliked.has(body.sourceId))throw nativeError('library_source_disliked',409)
    const id=libraryImportId(brandId,body.sourceId),old=await tx.brandMarketingSolution.findUnique({where:{id}})
    if(old?.status==='SAVED'){
      if(old.input?.sourceRevision!==body.sourceRevision||old.input?.sourceDigest!==body.sourceDigest)throw nativeError('creative_source_changed',409)
      return {ok:true,brandId,sourceId:body.sourceId,imported:true,replayed:true}
    }
    // Re-read at the write boundary: withdrawn or revised sources cannot be imported from stale results.
    const fresh=await currentSource(body.sourceId,load);checkPin(fresh,body)
    if(!usableSource(fresh))throw nativeError('library_source_empty',409)
    const source={inspirationCreativeId:fresh.creativeId,sourceRevision:fresh.sourceRevision,sourceDigest:fresh.sourceDigest,libraryDigest:fresh.sourceDigest,
      sourceType:'manual-library',matchingPolicy:'manual-library-v1',matchScore:null,title:fresh.title,scriptContent:fresh.scriptContent,sourceEvidence:fresh.sourceEvidence,timeline:fresh.timeline,
      sourceVideo:{title:fresh.title,platform:fresh.platform,videoUrl:fresh.originalVideoUrl,thumbnailUrl:fresh.thumbnailUrl,sourceUrl:fresh.originalPostUrl},
      sourcePost:{title:fresh.title,platform:fresh.platform,coverUrl:fresh.thumbnailUrl,sourceUrl:fresh.originalPostUrl}}
    const [reference]=await storeBrainstormSources(tx,brandId,userId,[source])
    await tx.brandMarketingSolution.create({data:{id,brandId,kind:LIBRARY_IMPORT,period:body.sourceId,status:'SAVED',version:1,generationMode:'HUMAN_CHOICE',createdById:userId,input:{sourceId:body.sourceId,sourceRevision:body.sourceRevision,sourceDigest:body.sourceDigest},output:{source:reference}}})
    await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'CREATIVE_LIBRARY_IMPORTED',resourceType:'BrandCreative',resourceId:body.sourceId,metadata:{brandId,sourceRevision:body.sourceRevision,sourceDigest:body.sourceDigest}}})
    return {ok:true,brandId,sourceId:body.sourceId,imported:true,replayed:false}
  },{maxWait:10000,timeout:30000})
}
export async function creativeLibraryMedia(userId:string,brandId:string,sourceId:string,query:URLSearchParams,request:Request){
  await authorizeLibrary(userId,brandId)
  const body={sourceId,sourceRevision:query.get('sourceRevision'),sourceDigest:query.get('sourceDigest')};pinned(body)
  const raw=await currentSource(sourceId,contentLibraryRequest,'media');checkPin(raw,body)
  if(query.get('kind')==='thumbnail')return fetchCreativeSourceThumbnail({creativeId:sourceId,sourceRevision:raw.sourceRevision,sourceDigest:raw.sourceDigest},request.signal)
  if(!raw.originalVideoUrl)throw nativeError('creative_source_not_found',404)
  return streamSourceVideoMedia(raw,request.signal,request.headers.get('range'))
}
