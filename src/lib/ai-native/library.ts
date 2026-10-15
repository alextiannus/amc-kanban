import {poolIdeaLibrary} from './idea-pool'
import { matchPromotionStrategyCreativeCandidates } from '../promotion-strategy/clients'
import { digest, nativeError, type DiscoveryIntent } from './contract'
import { validateCreativePatch } from '../brand-plan/creativeRevisionContract'

export type LibrarySnapshot = {contextPortfolio?:any[];libraryDigest:string;contextDigest:string;retrievedAt:string;contentMatchRequestId:string;sources:Array<Record<string,any>>;gaps:Array<Record<string,unknown>>;libraryVersions:Record<string,unknown>}
// Preserve complete source evidence. Reject oversized reads instead of silently truncating scenes.
export function sourceExcerpt(source:Record<string,any>){
  const result:Record<string,any> = {...source, sourceSnapshotScope: source.sourceEvidence?.scope || 'full_source'}
  if(Buffer.byteLength(JSON.stringify(result))>180000)throw nativeError('library_evidence_too_large',502)
  return result
}
export async function brandLibrary(intent:DiscoveryIntent,facts:any):Promise<LibrarySnapshot>{
  if(!facts)throw nativeError('brand_context_unavailable',404)
  if(intent.poolIdeaId){
    return poolIdeaLibrary(intent.brandId,intent.poolIdeaId,facts)
  }
  const response=await matchPromotionStrategyCreativeCandidates({merchantId:intent.brandId,merchantName:facts.name,merchantCategory:facts.industry||'',market:facts.knowledge?.market||facts.location||undefined,promotionPointId:`amc-native-${intent.requestKey}`,promotionGoal:intent.goal,sellingPoint:JSON.stringify({description:facts.description,knowledge:facts.knowledge}).slice(0,6000),requestedCandidateCount:3,requirePersistedCreative:true,platforms:intent.planningRequest?[intent.planningRequest.platform]:['instagram','xiaohongshu','tiktok'],excludeCreativeIds:intent.planningRequest?.excludeCreativeIds||[],diversify:true})
  const seen=new Set<string>()
  const sources=(response.creativeCandidates||[]).filter(c=>typeof c.inspirationCreativeId==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(c.inspirationCreativeId)&&!seen.has(c.inspirationCreativeId)&&!!seen.add(c.inspirationCreativeId)).slice(0,3).map(sourceExcerpt)
  if(!sources.length&&(response.contentLibraryGaps||[]).some(g=>Number(g.status)>=400))throw nativeError('content_library_unavailable',503)
  const payload={...(intent.planningRequest?{contextPortfolio:facts.creativePortfolio||[]}:{}),contentMatchRequestId:response.contentMatchRequestId,sources,gaps:response.contentLibraryGaps||[],libraryVersions:response.libraryVersions||{},contextDigest:digest(facts)}
  // A read is bounded; oversized source text must never silently become different evidence.
  if(Buffer.byteLength(JSON.stringify(payload))>180000)throw nativeError('library_evidence_too_large',502)
  return {...payload,libraryDigest:digest(payload),retrievedAt:new Date().toISOString()}
}
export function discoveryContract(intent:DiscoveryIntent,contextDigest:string){
  if(intent.skuWorkflow)return {path:intent.artifactPath,mediaType:'application/json',instructions:'Select source candidates only. Do not select SKUs, adapt scripts or write finalScript/planning/materialRequirements. Return sourceCreativeId, title and rationale for each source. The next steps are sku_proposal, human SKU confirmation, then creative_adaptation. Source selection is not a completed brand adaptation.',example:{kind:'creative_discovery',brandId:intent.brandId,contextDigest,libraryDigest:'exact libraryDigest from amc.library',summary:'Source candidates awaiting SKU confirmation',recommendations:[{sourceCreativeId:'actual inspirationCreativeId from amc.library',title:'Source candidate title',rationale:'Why the source suits this brand'}]}}
  return {path:intent.artifactPath,mediaType:'application/json',instructions:'Read requiredSkill before writing. Use recommendations (not candidates). Copy libraryDigest and actual sourceCreativeId values from amc.library. Use productCatalog for real SKU facts and compare creativePortfolio before choosing products or premises. Prefer underrepresented SKUs/topics; do not turn distinct sources into the same adapted title, dish or core premise. Include 1–3 distinct skuIds for the chosen products. For a set/bundle select its single SKU instead of listing all components. Include their exact full catalog names, including bilingual text and punctuation, in a complete adapted planning script, retaining every original scene, timing and action. Include voiceover or CTA only if present in the original or requested; do not substitute a generic product showcase. When catalog is empty, return empty skuIds and a COMPLETE general brand script without waiting, product placeholders or required catalog completion. Use the current brand name; remove unsupported source promotions rather than asserting them with a disclaimer. Keep title under 100 characters and planning under 20000, caption under 800. Never infer freshness, hand-pulling, ingredients, stock, prices or opening hours from a reference.',example:{kind:'creative_discovery',brandId:intent.brandId,contextDigest,libraryDigest:'exact libraryDigest from amc.library',summary:'Short result for the brand owner',recommendations:[{sourceCreativeId:'actual inspirationCreativeId from amc.library.sources',title:'Brand-specific title',planning:'Complete brand-adapted script; use an underrepresented verified SKU when present, otherwise finished general brand copy',skuIds:['actual productCatalog id, or omit this item when catalog is empty'],aiCaption:'Draft using verified brand facts only',materialRequirements:['Brand-owned material needed'],rationale:'Concrete fit between source mechanism, verified brand facts and current portfolio diversity'}]}}
}
export type Recommendation={sourceCreativeId:string;title:string;planning:string;aiCaption:string;materialRequirements:string[];rationale:string;skuIds?:string[]}
export function discoveryFrom(content:string,intent:DiscoveryIntent,library?:LibrarySnapshot){
  if(Buffer.byteLength(content)>32000)throw nativeError('candidate_too_large')
  const value=JSON.parse(content)
  if(value?.kind!=='creative_discovery'||value.brandId!==intent.brandId||!/^([a-f0-9]{64})$/.test(value.contextDigest)||!/^([a-f0-9]{64})$/.test(value.libraryDigest)||!Array.isArray(value.recommendations)||value.recommendations.length>3||typeof value.summary!=='string')throw nativeError('recommendation_invalid')
  const ids=new Set<string>()
  if(intent.skuWorkflow){
    for(const c of value.recommendations){
      if(!c||Object.keys(c).some(k=>!['sourceCreativeId','title','rationale'].includes(k))||typeof c.sourceCreativeId!=='string'||ids.has(c.sourceCreativeId)||typeof c.title!=='string'||!c.title.trim()||c.title.length>100||typeof c.rationale!=='string'||!c.rationale.trim()||c.rationale.length>2000)throw nativeError('source_proposal_required')
      ids.add(c.sourceCreativeId)
    }
    if(library&&(value.libraryDigest!==library.libraryDigest||value.contextDigest!==library.contextDigest||value.recommendations.some((c:any)=>!library.sources.some(s=>s.inspirationCreativeId===c.sourceCreativeId))))throw nativeError('recommendation_source_mismatch',409)
    return {...value,recommendations:value.recommendations.map((c:any)=>({...c,planning:'来源候选：请先确认 SKU，再生成品牌脚本。',aiCaption:'',materialRequirements:[],skuIds:[]}))} as {kind:'creative_discovery';brandId:string;contextDigest:string;libraryDigest:string;recommendations:Recommendation[];summary:string}
  }
  for(const c of value.recommendations){
    if(typeof c?.sourceCreativeId!=='string'||ids.has(c.sourceCreativeId)||typeof c.rationale!=='string'||c.rationale.length>2000||typeof c.title!=='string'||!c.title.trim()||typeof c.planning!=='string'||!c.planning.trim()||typeof c.aiCaption!=='string'||!Array.isArray(c.materialRequirements)||(intent.requireMaterials&&!c.materialRequirements.some((item:unknown)=>typeof item==='string'&&item.trim())))throw nativeError('recommendation_invalid')
    validateCreativePatch({title:c.title,planning:c.planning,aiCaption:c.aiCaption,materialRequirements:c.materialRequirements},'2000-01')
    ids.add(c.sourceCreativeId)
  }
  if(library&&(value.libraryDigest!==library.libraryDigest||value.contextDigest!==library.contextDigest||value.recommendations.some((c:Recommendation)=>!library.sources.some(s=>s.inspirationCreativeId===c.sourceCreativeId))))throw nativeError('recommendation_source_mismatch',409)
  return value as {kind:'creative_discovery';brandId:string;contextDigest:string;libraryDigest:string;recommendations:Recommendation[];summary:string}
}
