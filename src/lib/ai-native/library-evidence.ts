/** Select fewer COMPLETE evidence records when requested; never truncate a source's scenes. */
export function boundedLibrarySources(candidates:Record<string,any>[],base:Record<string,any>){
 const sources:Record<string,any>[]=[],gaps:Record<string,unknown>[]=[]
 for(const candidate of candidates){
  const source={...candidate,sourceSnapshotScope:candidate.sourceEvidence?.scope||'full_source'}
  if(Buffer.byteLength(JSON.stringify({...base,sources:[...sources,source]}))>174000){gaps.push({code:'source_evidence_too_large',sourceCreativeId:candidate.inspirationCreativeId});continue}
  sources.push(source)
 }
 return {sources,gaps}
}
