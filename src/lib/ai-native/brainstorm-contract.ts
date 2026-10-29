import {digest,nativeError} from './contract'
import {publicSourceMediaUrl} from '../brand-plan/creativeSourceMediaPolicy'
export const BRAINSTORM_FEED='BRAINSTORM_FEED',BRAINSTORM_DECISION='BRAINSTORM_DECISION'
export type BrainstormDecision='like'|'dislike'|'defer'
export const eligibleBrainstormSource=(s:any)=>typeof s?.inspirationCreativeId==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(s.inspirationCreativeId)&&typeof s.matchScore==='number'&&Number.isFinite(s.matchScore)&&(['fixed-keywords-v1','fixed-keywords-v2'].includes(s.matchingPolicy)?s.matchScore>0:s.matchScore>75)&&typeof s.sourceRevision==='string'&&!!s.sourceRevision&&/^[a-f0-9]{64}$/.test(s.sourceDigest||'')
export function brainstormCreativeId(brandId:string,sourceId:string){return `brain_${digest([brandId,sourceId]).slice(0,40)}`}
export function parseBrainstormDecision(body:any){
 if(!body||Object.keys(body).some(k=>!['action','sourceId','sourceDigest','decision','expectedVersion','poolIdeaId'].includes(k))||body.poolIdeaId!==undefined&&!/^[a-f0-9-]{36}$/i.test(body.poolIdeaId)||body.action!=='decide'||!['like','dislike','defer'].includes(body.decision)||!/^cre_[a-zA-Z0-9_-]+$/.test(body.sourceId||'')||!/^[a-f0-9]{64}$/.test(body.sourceDigest||'')||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw nativeError('invalid_brainstorm_decision',400)
 return body as {action:'decide';sourceId:string;sourceDigest:string;decision:BrainstormDecision;expectedVersion:number;poolIdeaId?:string}
}
export function projectBrainstormSource(source:any,brandId:string,decision:any){
 const originalText=typeof source.sourceEvidence?.originalText==='string'?source.sourceEvidence.originalText:''
 const timeline=[source.sourceEvidence?.timeline,source.timeline,source.scriptContent?.timeline].find(Array.isArray)||[]
 const purposes=timeline.map((s:any)=>s?.narrativePurpose).filter((s:any)=>typeof s==='string'&&s.trim())
 const opening=typeof source.scriptContent?.opening==='string'?source.scriptContent.opening:''
 const elements=[...new Set([opening,...purposes].filter(Boolean))]
 return {matchingPolicy:source.matchingPolicy,keywordTagIds:source.keywordTagIds||[],sourceId:source.inspirationCreativeId,sourceDigest:source.sourceDigest,title:source.sourceVideo?.title||source.sourcePost?.title||source.title||'',platform:source.sourceVideo?.platform||source.sourcePost?.platform||'',matchScore:source.matchScore,
  videoUrl:source.sourceVideo?.videoUrl?`/api/brands/${encodeURIComponent(brandId)}/ai/brainstorm/${encodeURIComponent(source.inspirationCreativeId)}/media`:null,
  thumbnailUrl:publicSourceMediaUrl(source.sourceVideo?.thumbnailUrl||source.sourcePost?.coverUrl),originalScript:originalText,viralElements:elements,recommendationReason:typeof source.recommendationReason==='string'?source.recommendationReason:'',decision:decision?.input?.decision||null,decisionVersion:decision?.version||0}
}

/** Keep pinned evidence needed by browsing/selection without repeating raw analysis.
 * Full analysis remains in Content and immutable earlier feed versions; replication
 * already reloads evidence and validates its revision/digest before copying.
 */
export function compactBrainstormSource(source:any){
 if(!source?.sourceEvidence||typeof source.sourceEvidence!=='object'||Array.isArray(source.sourceEvidence))return source
 const {analysis,features,...evidence}=source.sourceEvidence
 return {...source,sourceEvidence:evidence}
}
export function brainstormSourceBatch(sources:any[]){
 const compact=sources.map(compactBrainstormSource)
 if(Buffer.byteLength(JSON.stringify(compact))>2*1024*1024)throw nativeError('library_evidence_too_large',413)
 return compact
}

/** Hide old generic-only recommendations from default browsing, without deleting evidence or decisions. */
export function relevantDefaultBrainstormSource(source:any,explicitKeywords=''){
 return !!explicitKeywords.trim()||source?.matchingPolicy!=='fixed-keywords-v1'||!Array.isArray(source.keywordTagIds)||source.keywordTagIds.length>0
}
