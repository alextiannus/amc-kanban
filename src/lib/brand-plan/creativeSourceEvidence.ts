import {CreativeRevisionError,record} from './creativeRevisionContract'
const text=(value:unknown)=>typeof value==='string'?value:null

// Internal helper: callers authorize brand access before resolving evidence.
export async function resolveCreativeSourceEvidence(current:Record<string,any>,stored:Record<string,any>,fetchEvidence:(id:string)=>Promise<any>){
 const canonical=record(current.source||(record(stored.snapshot).sourceRevision?stored.snapshot:null))
 const snapshot=record(record(current.nativeSourceSnapshot).source||record(record(stored.snapshot).nativeSourceSnapshot).source)
 const identity=canonical.inspirationCreativeId||current.inspirationCreativeId||stored.creativeId
 if(typeof identity!=='string'||!/^cre_[a-zA-Z0-9_-]+$/.test(identity))throw new CreativeRevisionError('creative_source_not_found',404)
 for(const id of [canonical.inspirationCreativeId,current.inspirationCreativeId,stored.creativeId,snapshot.inspirationCreativeId]){
  if(id&&id!==identity)throw new CreativeRevisionError('creative_source_not_found',404)
 }
 const expectedRevision=text(canonical.sourceRevision||snapshot.sourceRevision)
 // nativeSourceSnapshot.libraryDigest is a batch hash, never a source hash.
 const expectedDigest=text(canonical.sourceDigest||canonical.libraryDigest||snapshot.sourceDigest)
 let raw:any
 try{raw=await fetchEvidence(identity)}catch(error){
  if(error instanceof Error&&error.message==='original_evidence_not_found')throw new CreativeRevisionError('creative_source_not_found',404)
  if(error instanceof Error&&error.message==='library_evidence_too_large')throw new CreativeRevisionError('library_evidence_too_large',413)
  throw new CreativeRevisionError('creative_source_unavailable',503)
 }
 if(!raw||raw.creativeId!==identity)throw new CreativeRevisionError('creative_source_not_found',404)
 if(expectedRevision&&raw.sourceRevision!==expectedRevision||expectedDigest&&raw.sourceDigest!==expectedDigest)throw new CreativeRevisionError('creative_source_changed',409)
 if(typeof raw.sourceRevision!=='string'||!/^[a-f0-9]{64}$/.test(raw.sourceDigest||''))throw new CreativeRevisionError('creative_source_unavailable',503)
 return {raw,identity,expectedRevision,expectedDigest}
}
