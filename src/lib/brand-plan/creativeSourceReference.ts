import {record,CreativeRevisionError} from './creativeRevisionContract'

// Called only with server-owned library evidence or a freshly verified source.
// The library batch digest must never become a single source's identity.
export function canonicalCreativeSource(value:unknown,creativeId:unknown,capturedAt:string,metadata:Record<string,any>={}) {
 const source=record(value),id=source.inspirationCreativeId
 if(typeof id!=='string'||!/^cre_[a-zA-Z0-9_-]+$/.test(id)||typeof source.sourceRevision!=='string'||!source.sourceRevision||!/^([a-f0-9]{64})$/.test(source.sourceDigest||''))return null
 if(creativeId&&creativeId!==id)throw new CreativeRevisionError('creative_source_changed',409)
 const timeline=source.timeline||record(source.scriptContent).timeline||[]
 const scope=source.evidenceStatus||record(source.sourceEvidence).scope
 const evidenceStatus=scope==='full_source'&&Array.isArray(timeline)&&timeline.length?'full_source':scope==='source_unavailable'?'source_unavailable':'partial_source'
 return {inspirationCreativeId:id,creativeCandidateId:source.creativeCandidateId||metadata.creativeCandidateId||null,sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest,libraryDigest:source.sourceDigest,
  contentMatchRequestId:metadata.contentMatchRequestId||null,capturedAt,evidenceStatus,
  title:source.title||source.sourceVideo?.title||source.sourcePost?.title||source.contentAngle||'',platform:source.platform||source.sourceVideo?.platform||source.sourcePost?.platform||null,
  originalPostUrl:source.originalPostUrl||source.sourceVideo?.sourceUrl||source.sourcePost?.sourceUrl||null,originalVideoUrl:source.originalVideoUrl||source.sourceVideo?.videoUrl||null,internalDetailPath:source.internalDetailPath||'',
  sourceEvidence:source.sourceEvidence||{scope:evidenceStatus,originalText:''},scriptContent:source.scriptContent||null,timeline:structuredClone(timeline)}
}
