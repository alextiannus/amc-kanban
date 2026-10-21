type Row=Record<string,any>

const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{}
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null
const month=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}$/.test(value)?value:null

function revisionSourceReference(revision:unknown){
 const row=object(revision),content=object(row.content),canonical=object(content.source),source=object(row.source)
 // Match Kanban's pinVideoEditor: legacy identity belongs to the source
 // envelope. Its snapshot may omit the ID/version/digest or hold a different
 // retrieval digest; unwrapping it before identity comparison loses authority.
 return Object.keys(canonical).length?canonical:Object.keys(source).length?source:object(object(content.skuDecision).source)
}

function revisionSnapshot(revision:unknown){
 const canonical=object(object(object(revision).content).source),source=revisionSourceReference(revision),snapshot=object(source.snapshot)
 return Object.keys(canonical).length?canonical:Object.keys(snapshot).length?snapshot:source
}

function sourceIdentity(value:unknown){
 const row=object(value)
 return {
  inspirationCreativeId:text(row.inspirationCreativeId||row.creativeId),
  sourceRevision:text(row.sourceRevision||row.version),
  sourceDigest:text(row.sourceDigest||row.libraryDigest||row.digest),
 }
}

export function resolveAuthorizedCreativeRevision(value:unknown,expected:{brandId:string;creativeId:string;creativeRevisionId:string;claimedMonth:string;lineageSource?:unknown}){
 const page=object(value),authorizedMonth=month(page.month),revisions=Array.isArray(page.revisions)?page.revisions:[]
 const exact=revisions.filter(candidate=>object(candidate).id===expected.creativeRevisionId)
 if(object(page.brand).id!==expected.brandId||page.creativeId!==expected.creativeId||authorizedMonth!==expected.claimedMonth||exact.length!==1)return null
 const revision=object(exact[0]),content=object(revision.content)
 if(content.id!==expected.creativeId)return null
 const stored=sourceIdentity(revisionSourceReference(revision)),pinned=sourceIdentity(expected.lineageSource)
 if(pinned.sourceRevision&&stored.sourceRevision!==pinned.sourceRevision||pinned.sourceDigest&&stored.sourceDigest!==pinned.sourceDigest||pinned.inspirationCreativeId&&stored.inspirationCreativeId!==pinned.inspirationCreativeId)return null
 return {month:authorizedMonth,revision,source:revisionSnapshot(revision)}
}

export function exactComparisonEvidence(value:unknown,expected:{brandId:string;creativeId:string;creativeRevisionId:string;sourceMonth:string;pinnedSource:unknown;pinnedSkuDecision:unknown;freshSource:unknown;sourceShotId:string}){
 const resolved=resolveAuthorizedCreativeRevision(value,{...expected,claimedMonth:expected.sourceMonth,lineageSource:expected.pinnedSource})
 if(!resolved)return null
 const fresh=object(expected.freshSource),stored=object(resolved.source),pinned=object(expected.pinnedSource)
 const freshIdentity=sourceIdentity(fresh),storedIdentity=sourceIdentity(stored),pinnedIdentity=sourceIdentity(pinned)
 // Evidence status is immutable authority, not an upgradeable display hint.
 // A later full source response cannot promote a partial/unknown job pin or
 // historical revision into a verified comparison.
 if(fresh.brandId!==expected.brandId||fresh.creativeId!==expected.creativeId||fresh.evidenceStatus!=='full_source'||stored.evidenceStatus!=='full_source'||pinned.evidenceStatus!=='full_source')return null
 if(!freshIdentity.sourceRevision||freshIdentity.sourceRevision!==storedIdentity.sourceRevision||freshIdentity.sourceRevision!==pinnedIdentity.sourceRevision)return null
 if(!freshIdentity.sourceDigest||freshIdentity.sourceDigest!==storedIdentity.sourceDigest||freshIdentity.sourceDigest!==pinnedIdentity.sourceDigest)return null
 if(pinnedIdentity.inspirationCreativeId&&freshIdentity.inspirationCreativeId!==pinnedIdentity.inspirationCreativeId||storedIdentity.inspirationCreativeId&&freshIdentity.inspirationCreativeId!==storedIdentity.inspirationCreativeId)return null
 const freshEvidence=object(fresh.sourceEvidence),storedEvidence=object(stored.sourceEvidence)
 const freshTimeline=Array.isArray(fresh.timeline)?fresh.timeline:[],storedTimeline=Array.isArray(stored.timeline)?stored.timeline:Array.isArray(object(stored.scriptContent).timeline)?object(stored.scriptContent).timeline:[]
 if(!text(freshEvidence.originalText)||freshEvidence.originalText!==storedEvidence.originalText||!freshTimeline.length||JSON.stringify(freshTimeline)!==JSON.stringify(storedTimeline))return null
 if(!freshTimeline.some((shot:unknown)=>object(shot).id===expected.sourceShotId)||!storedTimeline.some((shot:unknown)=>object(shot).id===expected.sourceShotId))return null
 const revisionContent=object(resolved.revision.content),storedSku=object(revisionContent.skuDecision),pinnedSku=object(expected.pinnedSkuDecision)
 for(const key of ['digest','sourceRevision','sourceDigest','selectedSkuIds','recommendations'])if(JSON.stringify(storedSku[key]??null)!==JSON.stringify(pinnedSku[key]??null))return null
 return resolved.revision
}

export function pinnedSourceMediaUrl(input:{brandId:string;creativeId:string;sourceMonth:string;reportedUrl:unknown}){
 const reported=text(input.reportedUrl)
 if(!reported)return null
 const expectedPath=`/api/brands/${encodeURIComponent(input.brandId)}/content-creatives/${encodeURIComponent(input.creativeId)}/source/media`
 try{
  const parsed=new URL(reported,'https://amc-mm.invalid')
  if(parsed.origin==='https://amc-mm.invalid'&&(parsed.pathname!==expectedPath||parsed.searchParams.get('month')!==input.sourceMonth||[...parsed.searchParams.keys()].some(key=>key!=='month')))return null
 }catch{return null}
 return `${expectedPath}?${new URLSearchParams({month:input.sourceMonth})}`
}
