import {digest,nativeError} from './contract'
import {compactBrainstormSource} from './brainstorm-contract'

const SOURCE_KIND='BRAINSTORM_SOURCE'
/** Caller holds the brand lock. Immutable evidence is stored once per pinned version. */
export async function storeBrainstormSources(db:any,brandId:string,userId:string,sources:any[]){
 const fresh=sources.filter(s=>!s.sourceSnapshotKey)
 const keyed=fresh.map(source=>({source:compactBrainstormSource(source),key:digest([source.inspirationCreativeId,source.sourceRevision,source.sourceDigest])}))
 const existing=keyed.length?await db.brandMarketingSolution.findMany({where:{brandId,kind:SOURCE_KIND,period:{in:keyed.map(s=>s.key)}},select:{period:true}}):[]
 const stored=new Set(existing.map((r:any)=>r.period))
 for(const {source,key} of keyed){
  if(stored.has(key))continue
  await db.brandMarketingSolution.create({data:{brandId,kind:SOURCE_KIND,period:key,version:1,status:'READY',generationMode:'SOURCE_REFERENCE',createdById:userId,input:{},output:{source}}})
  stored.add(key)
 }
 return sources.map(source=>source.sourceSnapshotKey?source:brainstormSourceReference(source))
}
export function brainstormSourceReference(source:any){
 const {inspirationCreativeId,sourceRevision,sourceDigest,libraryDigest,matchScore,matchingPolicy,keywordTagIds,title,recommendationReason,contentMatchRequestId}=source
 const video=source.sourceVideo||{},post=source.sourcePost||{}
 return {sourceSnapshotKey:digest([inspirationCreativeId,sourceRevision,sourceDigest]),inspirationCreativeId,sourceRevision,sourceDigest,libraryDigest,matchScore,matchingPolicy,keywordTagIds,title,recommendationReason,contentMatchRequestId,
  sourceVideo:{title:video.title,platform:video.platform,videoUrl:video.videoUrl,thumbnailUrl:video.thumbnailUrl,sourceUrl:video.sourceUrl},
  sourcePost:{title:post.title,platform:post.platform,coverUrl:post.coverUrl,sourceUrl:post.sourceUrl},
  scriptContent:{kind:source.scriptContent?.kind,opening:source.scriptContent?.opening},
  sourceEvidence:{timeline:(source.sourceEvidence?.timeline||source.timeline||source.scriptContent?.timeline||[]).map((t:any)=>({narrativePurpose:t.narrativePurpose}))}}
}
/** Never rehydrate all history to like/copy one source. Legacy inline snapshots still work. */
export async function storedBrainstormSource(db:any,brandId:string,reference:any){
 if(!reference?.sourceSnapshotKey)return reference
 if(reference.sourceSnapshotKey!==digest([reference.inspirationCreativeId,reference.sourceRevision,reference.sourceDigest]))throw nativeError('creative_source_changed',409)
 const row=await db.brandMarketingSolution.findFirst({where:{brandId,kind:SOURCE_KIND,period:reference.sourceSnapshotKey},orderBy:{version:'desc'}})
 const source=row?.output?.source
 if(!source||source.inspirationCreativeId!==reference.inspirationCreativeId||source.sourceRevision!==reference.sourceRevision||source.sourceDigest!==reference.sourceDigest)throw nativeError('creative_source_changed',409)
 return source
}
