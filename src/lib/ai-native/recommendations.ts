import { prisma } from '../prisma'
import { creativeDigest, validateCreativePatch } from '../brand-plan/creativeRevisionContract'
import { readCreativeRevisions,saveCreativeRevision } from '../brand-plan/creativeRevisions'
import { calendarCreativeOption, CALENDAR_PLAN_UNIMPLEMENTED_STATUS } from '../brand-plan/calendarSync'
import { digest,nativeError,type NativeIntent } from './contract'
import { discoveryFrom,type LibrarySnapshot } from './library'
import type { ArtifactReference } from '@immedi/iaic-core/developer/templates/agent/app.mjs'

export async function recommendationReceipts(userId:string,brandId:string,taskId:string){
  const rows=await prisma.brandMarketingSolution.findMany({where:{brandId,kind:'CREATIVE_ITEM',createdById:userId,version:1,input:{path:['ai','taskId'],equals:taskId}},orderBy:{createdAt:'asc'}})
  return rows.map((row:{id:string;version:number;input:unknown;output:unknown})=>{const input=row.input as any;return {revisionId:row.id,revision:row.version,sourceCreativeId:input.source?.creativeId,creativeId:input.creativeId,month:input.month,creative:calendarCreativeOption(row.output as any)}})
}
export async function saveRecommendation(userId:string,brandId:string,taskId:string,intent:NativeIntent,ref:ArtifactReference,content:string,library:LibrarySnapshot,body:any){
  if(intent.kind!=='creative_discovery')throw nativeError('discovery_task_required')
  const result=discoveryFrom(content,intent,library)
  const candidate=result.recommendations.find(c=>c.sourceCreativeId===body.sourceCreativeId)
  const source=library.sources.find(c=>c.inspirationCreativeId===body.sourceCreativeId)
  if(!candidate||!source)throw nativeError('recommendation_source_mismatch',409)
  if(!body.patch||!['title','planning','aiCaption','materialRequirements','date','platform'].every(k=>Object.hasOwn(body.patch,k))||Object.keys(body.patch).some(k=>!['title','planning','aiCaption','materialRequirements','date','platform'].includes(k)))throw nativeError('reviewed_creative_required')
  const month=typeof body.patch.date==='string'?body.patch.date.slice(0,7):''
  const patch=validateCreativePatch(body.patch,month)
  if(intent.requireMaterials&&!patch.materialRequirements?.some((item:string)=>item.trim()))throw nativeError('material_requirements_required')
  if(!patch.planning)throw nativeError('reviewed_creative_required')
  const creativeId=`ai_${digest([taskId,candidate.sourceCreativeId]).slice(0,40)}`
  const seed={id:creativeId,date:patch.date,platform:patch.platform,platformSlug:patch.platformSlug,title:candidate.title,planning:candidate.planning,aiCaption:candidate.aiCaption,materialRequirements:candidate.materialRequirements,contentType:source.scriptContent?.kind==='video'?'视频':'图文',product:'品牌内容',status:CALENDAR_PLAN_UNIMPLEMENTED_STATUS,inspirationCreativeId:candidate.sourceCreativeId,inspirationSourceTitle:source.sourceVideo?.title||source.sourcePost?.title||source.contentAngle,inspirationSourceSummary:source.sourcePost?.copySummary||source.contentAngle,selectedCreativeCandidateId:source.creativeCandidateId,sampleOriginalUrl:source.sourceVideo?.sourceUrl||source.sourcePost?.sourceUrl||'',sampleVideoUrl:source.sourceVideo?.videoUrl||'',sampleSourcePlatform:source.sourceVideo?.platform||source.sourcePost?.platform||'',nativeSourceSnapshot:{retrievedAt:library.retrievedAt,libraryDigest:library.libraryDigest,contentMatchRequestId:library.contentMatchRequestId,version:null,versionStatus:'snapshot_only',source},nativeCandidate:{taskId,artifact:ref,candidate}}
  const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,month,creativeId,{expectedRevision:creativeDigest(seed),idempotencyKey:`discovery-${digest([taskId,candidate.sourceCreativeId])}`,patch:body.patch},undefined,{taskId,agentId:'amc-mm-user-ai',requestedBy:userId,contextDigest:result.contextDigest,artifact:ref},seed)
  const verified=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,month,creativeId,saved.receipt.id)
  if(verified.revisions[0]?.contentHash!==saved.receipt.contentHash)throw nativeError('creative_save_unverified',503)
  return {verified:true,receipt:saved.receipt,creativeId,month,creative:calendarCreativeOption(saved.receipt.content as any)}
}

export async function adaptedScriptReceipt(userId:string,brandId:string,taskId:string,month:string,creativeId:string){
  const row=await prisma.brandMarketingSolution.findFirst({where:{brandId,kind:'CREATIVE_ITEM',createdById:userId,input:{path:['ai','taskId'],equals:taskId}},orderBy:{version:'desc'}})
  if(!row)return null
  const history=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,month,creativeId,row.id)
  return {verified:true,month,creativeId,receipt:history.revisions[0]}
}
