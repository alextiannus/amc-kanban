import {record, revisionSource} from './brand-plan/creativeRevisionContract'
const fail=(code:string,status=400)=>Object.assign(new Error(code),{status,code})
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const shotFields=['id','shotId','order','startSec','endSec','visualDescription','shotScale','cameraMovement','subjectAction','voiceover','onScreenText','sound','narrativePurpose','transition']
// Reuse stored evidence only. Never hydrate a historical video from today's source,
// and never expose old raw analysis/admin payloads through the editor envelope.
function evidenceSnapshot(value:any):any{
  const source=record(value),result:Record<string,any>={}
  for(const key of ['system','creativeId','inspirationCreativeId','sourceRevision','sourceDigest','libraryDigest','evidenceStatus','evidence','version','digest','capturedAt','title','platform'])if(typeof source[key]==='string'||source[key]===null)result[key]=source[key]
  const timeline=source.timeline||record(source.scriptContent).timeline||record(source.snapshot).timeline
  if(Array.isArray(timeline))result.timeline=timeline.map(shot=>Object.fromEntries(shotFields.filter(key=>typeof shot?.[key]==='string'||typeof shot?.[key]==='number'||shot?.[key]===null).map(key=>[key,shot[key]])))
  if(source.sourceEvidence)result.sourceEvidence={scope:record(source.sourceEvidence).scope||null,originalText:typeof record(source.sourceEvidence).originalText==='string'?source.sourceEvidence.originalText:null}
  if(source.scriptContent)result.scriptContent={kind:record(source.scriptContent).kind,originalText:record(source.scriptContent).originalText||null,timeline:result.timeline||[]}
  if(source.snapshot){const snapshot=record(source.snapshot);result.snapshot=snapshot.sourceRevision?evidenceSnapshot(snapshot):Object.fromEntries(['inspirationCreativeId','inspirationSourceTitle','inspirationSourceSummary','creativeMechanism','videoScript'].filter(key=>typeof snapshot[key]==='string').map(key=>[key,snapshot[key]]))}
  return result
}
const pinnedKeys=['creativeId','creativeRevisionId','sourceReference','skuDecision','shotMappings','lineageWarning','assets','submittedScript'] as const
export async function pinVideoEditor(db:any,brandId:string,input:any,existing?:any) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('invalid_video_editor')
  if(typeof input.script!=='string'||input.script.length>20000||!Array.isArray(input.assets)||input.assets.length>40||JSON.stringify(input).length>8*1024*1024)throw fail('video_editor_too_large',413)
  if(existing){
    if(existing.brandId!==brandId||(input.creativeId||null)!==(existing.creativeId||null)||(input.creativeRevisionId||null)!==(existing.creativeRevisionId||null))throw fail('video_lineage_immutable',409)
    return copy({...input,brandId,...Object.fromEntries(pinnedKeys.map(key=>[key,existing[key]??null]))})
  }
  if(!input.creativeId&&!input.creativeRevisionId)return copy({...input,brandId,creativeId:null,creativeRevisionId:null,sourceReference:null,skuDecision:null,shotMappings:[],lineageWarning:'legacy_evidence_unavailable'})
  if(typeof input.creativeId!=='string'||typeof input.creativeRevisionId!=='string'||input.creativeId.length>200||input.creativeRevisionId.length>200)throw fail('video_creative_revision_required',409)
  const row=await db.brandMarketingSolution.findFirst({where:{id:input.creativeRevisionId,brandId,kind:'CREATIVE_ITEM'}})
  if(!row||record(row.input).creativeId!==input.creativeId||record(row.output).id!==input.creativeId)throw fail('video_lineage_not_found',404)
  const content=record(row.output)
  if(content.adaptationStatus&&content.adaptationStatus!=='adapted')throw fail('video_adaptation_required',409)
  const source=evidenceSnapshot(Object.keys(record(content.source)).length?content.source:revisionSource(content,record(row.input).source,row.createdAt?.toISOString?.()||''))
  const decision=content.skuDecision?copy({...content.skuDecision,...(content.skuDecision.source?{source:evidenceSnapshot(content.skuDecision.source)}:{})}):null
  const timeline=source.timeline||source.snapshot?.timeline||decision?.source?.timeline||[]
  // The mapping records source roles, not an inferred index match to generated shots.
  const shotMappings=timeline.map((shot:any)=>({sourceShotId:shot.shotId||shot.id,originalRole:shot.narrativePurpose||null,originalShot:shot,selectedSkuIds:(decision?.recommendations||[]).filter((sku:any)=>decision.selectedSkuIds?.includes(sku.skuId)&&sku.sourceShotIds?.includes(shot.shotId||shot.id)).map((sku:any)=>sku.skuId)}))
  const editor={...input,brandId,submittedScript:input.script,creativeId:input.creativeId,creativeRevisionId:row.id,sourceReference:source,skuDecision:decision,shotMappings,lineageWarning:source.evidenceStatus==='full_source'&&source.sourceRevision&&source.libraryDigest?null:'legacy_evidence_unavailable'}
  if(JSON.stringify(editor).length>8*1024*1024)throw fail('video_editor_too_large',413)
  return copy(editor)
}

export function editorForLibrary(job:any,rows:any[]) {
  const metadata=job.plan?._mmVideoJob||{}
  const editor=metadata.editor||{brandId:job.brandId,script:metadata.script||job.voiceoverState?.script||job.idea,templateId:metadata.templateId||null,targetDurationSec:10,creativeId:job.creativeId,creativeRevisionId:null,sourceReference:null,skuDecision:null,shotMappings:[],lineageWarning:'legacy_evidence_unavailable',assets:rows}
  return copy({...editor,missingAssetIds:(job.assetIds||[]).filter((id:string)=>!rows.some(a=>a.id===id))})
}

export function videoDraftForLibrary(job:any,rows:any[]){
  const metadata=job.plan?._mmVideoJob||{}
  return {version:2,jobId:job.id,editor:editorForLibrary(job,rows),revisions:copy(metadata.revisions||[]),revisionsHasMore:Boolean(metadata.revisionsHasMore),savedAt:new Date().toISOString()}
}
