import {poolIdeaLibrary} from './idea-pool'
import { matchPromotionStrategyCreativeCandidates } from '../promotion-strategy/clients'
import { digest, nativeError, type DiscoveryIntent } from './contract'
import { validateCreativePatch } from '../brand-plan/creativeRevisionContract'

export type LibrarySnapshot = {libraryDigest:string;contextDigest:string;retrievedAt:string;contentMatchRequestId:string;sources:Array<Record<string,any>>;gaps:Array<Record<string,unknown>>;libraryVersions:Record<string,unknown>}
// Keep authoritative IDs/links, but give the agent a bounded, explicitly partial source excerpt.
export function sourceExcerpt(source:Record<string,any>){
  const text=(v:unknown,n=500)=>typeof v==='string'?v.slice(0,n):''
  const list=(v:unknown,n=6)=>Array.isArray(v)?v.slice(0,n).map(x=>text(x,300)).filter(Boolean):[]
  const link=(v:unknown)=>typeof v==='string'&&/^https?:\/\//i.test(v)&&v.length<=2000?v:''
  const media=(v:any)=>v?{platform:text(v.platform,60),title:text(v.title),sourceUrl:link(v.sourceUrl),videoUrl:link(v.videoUrl),thumbnailUrl:link(v.thumbnailUrl),copySummary:text(v.copySummary,700),rightsNote:text(v.rightsNote)}:undefined
  const script=source.scriptContent||{}
  return {inspirationCreativeId:source.inspirationCreativeId,creativeCandidateId:source.creativeCandidateId,contentAngle:text(source.contentAngle),contentFormat:text(source.contentFormat,100),recommendationReason:text(source.recommendationReason,700),matchedTags:list(source.matchedTags),assetNeeds:list(source.assetNeeds),sourceVideo:media(source.sourceVideo),sourcePost:media(source.sourcePost),scriptContent:{kind:script.kind==='video'?'video':'post',title:text(script.title),opening:text(script.opening),body:text(script.body,800),cta:text(script.cta,300),shots:Array.isArray(script.shots)?script.shots.slice(0,3).map((shot:any)=>({label:text(shot.label,100),instruction:text(shot.instruction,300)})):[],voiceover:list(script.voiceover,2)},libraryGap:source.libraryGap?{reviewStatus:text(source.libraryGap.reviewStatus,80),reason:text(source.libraryGap.reason,300),crossPlatformSource:text(source.libraryGap.crossPlatformSource,80)}:undefined,sourceSnapshotScope:'bounded_excerpt'}
}
export async function brandLibrary(intent:DiscoveryIntent,facts:any):Promise<LibrarySnapshot>{
  if(!facts)throw nativeError('brand_context_unavailable',404)
  if(intent.poolIdeaId){
    return poolIdeaLibrary(intent.brandId,intent.poolIdeaId,facts)
  }
  const response=await matchPromotionStrategyCreativeCandidates({merchantId:intent.brandId,merchantName:facts.name,merchantCategory:facts.industry||'',market:facts.knowledge?.market||facts.location||undefined,promotionPointId:`amc-native-${intent.requestKey}`,promotionGoal:intent.goal,sellingPoint:JSON.stringify({description:facts.description,knowledge:facts.knowledge}).slice(0,6000),requestedCandidateCount:3,requirePersistedCreative:true,platforms:['instagram','xiaohongshu','tiktok']})
  const seen=new Set<string>()
  const sources=(response.creativeCandidates||[]).filter(c=>typeof c.inspirationCreativeId==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(c.inspirationCreativeId)&&!seen.has(c.inspirationCreativeId)&&!!seen.add(c.inspirationCreativeId)).slice(0,3).map(sourceExcerpt)
  if(!sources.length&&(response.contentLibraryGaps||[]).some(g=>Number(g.status)>=400))throw nativeError('content_library_unavailable',503)
  const payload={contentMatchRequestId:response.contentMatchRequestId,sources,gaps:response.contentLibraryGaps||[],libraryVersions:response.libraryVersions||{},contextDigest:digest(facts)}
  // A read is bounded; oversized source text must never silently become different evidence.
  if(Buffer.byteLength(JSON.stringify(payload))>60000)throw nativeError('library_evidence_too_large',502)
  return {...payload,libraryDigest:digest(payload),retrievedAt:new Date().toISOString()}
}
export function discoveryContract(intent:DiscoveryIntent,contextDigest:string){
  return {path:intent.artifactPath,mediaType:'application/json',instructions:'Read requiredSkill before writing. Use recommendations (not candidates). Copy libraryDigest and actual sourceCreativeId values from amc.library. Use productCatalog for real SKU facts. Include skuIds for the chosen products and their exact names in a complete adapted planning script (opening, scenes/body, voiceover, CTA), not just a summary. Empty skuIds only if catalog is empty. Keep title under 100 characters and planning under 2000, caption under 800. Never infer freshness, hand-pulling, ingredients, stock, prices or opening hours from a reference.',example:{kind:'creative_discovery',brandId:intent.brandId,contextDigest,libraryDigest:'exact libraryDigest from amc.library',summary:'Short result for the brand owner',recommendations:[{sourceCreativeId:'actual inspirationCreativeId from amc.library.sources',title:'Brand-specific title',planning:'Complete brand and SKU adapted script using verified facts',skuIds:['actual productCatalog id, or omit this item when catalog is empty'],aiCaption:'Draft using verified brand facts only',materialRequirements:['Brand-owned material needed'],rationale:'Concrete fit between source mechanism and verified brand facts'}]}}
}
export type Recommendation={sourceCreativeId:string;title:string;planning:string;aiCaption:string;materialRequirements:string[];rationale:string;skuIds?:string[]}
export function discoveryFrom(content:string,intent:DiscoveryIntent,library?:LibrarySnapshot){
  if(Buffer.byteLength(content)>32000)throw nativeError('candidate_too_large')
  const value=JSON.parse(content)
  if(value?.kind!=='creative_discovery'||value.brandId!==intent.brandId||!/^([a-f0-9]{64})$/.test(value.contextDigest)||!/^([a-f0-9]{64})$/.test(value.libraryDigest)||!Array.isArray(value.recommendations)||value.recommendations.length>3||typeof value.summary!=='string')throw nativeError('recommendation_invalid')
  const ids=new Set<string>()
  for(const c of value.recommendations){
    if(typeof c?.sourceCreativeId!=='string'||ids.has(c.sourceCreativeId)||typeof c.rationale!=='string'||c.rationale.length>2000||typeof c.title!=='string'||!c.title.trim()||typeof c.planning!=='string'||!c.planning.trim()||typeof c.aiCaption!=='string'||!Array.isArray(c.materialRequirements)||(intent.requireMaterials&&!c.materialRequirements.some((item:unknown)=>typeof item==='string'&&item.trim())))throw nativeError('recommendation_invalid')
    validateCreativePatch({title:c.title,planning:c.planning,aiCaption:c.aiCaption,materialRequirements:c.materialRequirements},'2000-01')
    ids.add(c.sourceCreativeId)
  }
  if(library&&(value.libraryDigest!==library.libraryDigest||value.contextDigest!==library.contextDigest||value.recommendations.some((c:Recommendation)=>!library.sources.some(s=>s.inspirationCreativeId===c.sourceCreativeId))))throw nativeError('recommendation_source_mismatch',409)
  return value as {kind:'creative_discovery';brandId:string;contextDigest:string;libraryDigest:string;recommendations:Recommendation[];summary:string}
}
