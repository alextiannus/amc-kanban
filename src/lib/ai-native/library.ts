import { matchPromotionStrategyCreativeCandidates } from '../promotion-strategy/clients'
import { digest, nativeError, type DiscoveryIntent } from './contract'
import { validateCreativePatch } from '../brand-plan/creativeRevisionContract'

export type LibrarySnapshot = {libraryDigest:string;contextDigest:string;retrievedAt:string;contentMatchRequestId:string;sources:Array<Record<string,any>>;gaps:Array<Record<string,unknown>>;libraryVersions:Record<string,unknown>}
export async function brandLibrary(intent:DiscoveryIntent,facts:any):Promise<LibrarySnapshot>{
  if(!facts)throw nativeError('brand_context_unavailable',404)
  const response=await matchPromotionStrategyCreativeCandidates({merchantId:intent.brandId,merchantName:facts.name,merchantCategory:facts.industry||'',market:facts.knowledge?.market||facts.location||undefined,promotionPointId:`amc-native-${intent.requestKey}`,promotionGoal:intent.goal,sellingPoint:JSON.stringify({description:facts.description,knowledge:facts.knowledge}).slice(0,6000),requestedCandidateCount:3,requirePersistedCreative:true,platforms:['instagram','xiaohongshu','tiktok']})
  const seen=new Set<string>()
  const sources=(response.creativeCandidates||[]).filter(c=>typeof c.inspirationCreativeId==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(c.inspirationCreativeId)&&!seen.has(c.inspirationCreativeId)&&!!seen.add(c.inspirationCreativeId)).slice(0,3)
  if(!sources.length&&(response.contentLibraryGaps||[]).some(g=>Number(g.status)>=400))throw nativeError('content_library_unavailable',503)
  const payload={contentMatchRequestId:response.contentMatchRequestId,sources,gaps:response.contentLibraryGaps||[],libraryVersions:response.libraryVersions||{},contextDigest:digest(facts)}
  // A read is bounded; oversized source text must never silently become different evidence.
  if(Buffer.byteLength(JSON.stringify(payload))>60000)throw nativeError('library_evidence_too_large',502)
  return {...payload,libraryDigest:digest(payload),retrievedAt:new Date().toISOString()}
}
export type Recommendation={sourceCreativeId:string;title:string;planning:string;aiCaption:string;materialRequirements:string[];rationale:string}
export function discoveryFrom(content:string,intent:DiscoveryIntent,library?:LibrarySnapshot){
  if(Buffer.byteLength(content)>32000)throw nativeError('candidate_too_large')
  const value=JSON.parse(content)
  if(value?.kind!=='creative_discovery'||value.brandId!==intent.brandId||!/^([a-f0-9]{64})$/.test(value.contextDigest)||!/^([a-f0-9]{64})$/.test(value.libraryDigest)||!Array.isArray(value.recommendations)||value.recommendations.length>3||typeof value.summary!=='string')throw nativeError('recommendation_invalid')
  const ids=new Set<string>()
  for(const c of value.recommendations){
    if(typeof c?.sourceCreativeId!=='string'||ids.has(c.sourceCreativeId)||typeof c.rationale!=='string'||c.rationale.length>2000||typeof c.title!=='string'||!c.title.trim()||typeof c.planning!=='string'||!c.planning.trim()||typeof c.aiCaption!=='string'||!Array.isArray(c.materialRequirements))throw nativeError('recommendation_invalid')
    validateCreativePatch({title:c.title,planning:c.planning,aiCaption:c.aiCaption,materialRequirements:c.materialRequirements},'2000-01')
    ids.add(c.sourceCreativeId)
  }
  if(library&&(value.libraryDigest!==library.libraryDigest||value.contextDigest!==library.contextDigest||value.recommendations.some((c:Recommendation)=>!library.sources.some(s=>s.inspirationCreativeId===c.sourceCreativeId))))throw nativeError('recommendation_source_mismatch',409)
  return value as {kind:'creative_discovery';brandId:string;contextDigest:string;libraryDigest:string;recommendations:Recommendation[];summary:string}
}
