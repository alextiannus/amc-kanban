import {readBrandFacts,validateSkuReferences} from './facts'
import { prisma } from '../prisma'
import { creativeDigest,validateCreativePatch } from '../brand-plan/creativeRevisionContract'
import { validateCreativeWorkspacePatch } from '../brand-plan/creativeWorkspaceContract'
import { readCreativeRevisions,saveCreativeRevision } from '../brand-plan/creativeRevisions'
import { calendarCreativeOption } from '../brand-plan/calendarSync'
import { digest,nativeError,type NativeIntent } from './contract'
import { discoveryFrom,type LibrarySnapshot } from './library'
import type { ArtifactReference } from '@immedi/iaic-core/developer/templates/agent/app.mjs'

export async function recommendationReceipts(userId:string,brandId:string,taskId:string){
  const rows=await prisma.brandMarketingSolution.findMany({where:{brandId,kind:'CREATIVE_ITEM',createdById:userId,version:1,input:{path:['ai','taskId'],equals:taskId}},orderBy:{createdAt:'asc'}})
  return rows.map((row:{id:string;version:number;input:unknown;output:unknown})=>{const input=row.input as any;return {revisionId:row.id,revision:row.version,sourceCreativeId:input.source?.creativeId,creativeId:input.creativeId,month:input.month,creative:calendarCreativeOption(row.output as any)}})
}
export async function saveRecommendation(userId:string,brandId:string,taskId:string,intent:NativeIntent,ref:ArtifactReference,content:string,library:LibrarySnapshot,body:any,automaticDaily=false,planningRequest?:{id:string;targetId:string;month:string}){
  if(intent.kind!=='creative_discovery')throw nativeError('discovery_task_required')
  const result=discoveryFrom(content,intent,library)
  const candidate=result.recommendations.find(c=>c.sourceCreativeId===body.sourceCreativeId)
  const source=library.sources.find(c=>c.inspirationCreativeId===body.sourceCreativeId)
  if(!candidate||!source)throw nativeError('recommendation_source_mismatch',409)
  const fields=['title','planning','aiCaption','materialRequirements','platformTargets']
  const oldFields=['title','planning','aiCaption','materialRequirements','date','platform']
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['sourceCreativeId','month','patch','artifactDigest','requestKey'].includes(k)))throw nativeError('reviewed_creative_required')
  const keys=body.patch&&typeof body.patch==='object'&&!Array.isArray(body.patch)?Object.keys(body.patch):[]
  const exact=(expected:string[])=>keys.length===expected.length&&expected.every(k=>Object.hasOwn(body.patch,k))
  const legacy=exact(oldFields)
  if(!exact(fields)&&!legacy||legacy&&(planningRequest||automaticDaily||body.month!==undefined))throw nativeError('reviewed_creative_required')
  const old=legacy?validateCreativePatch(body.patch,String(body.patch.date).slice(0,7)):null
  const patch=validateCreativeWorkspacePatch(legacy?{title:old!.title,planning:old!.planning,aiCaption:old!.aiCaption,materialRequirements:old!.materialRequirements,platformTargets:[old!.platformSlug]}:body.patch)
  if(!Array.isArray(patch.platformTargets)||patch.platformTargets.some(platform=>!['instagram','facebook','tiktok','xiaohongshu','google_business'].includes(platform))||(planningRequest&&patch.platformTargets.length!==1))throw nativeError('invalid_creative_platform')
  if(intent.requireMaterials&&!patch.materialRequirements?.some((item:string)=>item.trim()))throw nativeError('material_requirements_required')
  if(!patch.planning)throw nativeError('reviewed_creative_required')
  const creativeId=`ai_${digest([taskId,candidate.sourceCreativeId]).slice(0,40)}`
  if(automaticDaily&&!intent.automaticDaily)throw nativeError('daily_task_required')
  if(planningRequest&&(intent.planningRequest?.id!==planningRequest.id||intent.planningRequest.platform!==patch.platformTargets[0]))throw nativeError('planning_task_mismatch',409)
  const facts=await readBrandFacts(prisma,brandId)
  if(!facts)throw nativeError('brand_context_unavailable',404)
  const month=planningRequest?.month||(legacy?String(body.patch.date).slice(0,7):body.month)||new Intl.DateTimeFormat('en-CA',{timeZone:facts.timezone||'Asia/Singapore',year:'numeric',month:'2-digit'}).format(new Date())
  if(planningRequest&&!validateSkuReferences(candidate,facts))throw nativeError('recommendation_sku_mismatch',409)
  const skuIds=Array.isArray(candidate.skuIds)?candidate.skuIds.filter((id:string)=>typeof id==='string'):[]
  const selectedProducts=(facts.productCatalog||[]).filter((sku:any)=>skuIds.includes(sku.id)).map((sku:any)=>sku.name)
  const seed={...(planningRequest?{planningRequest,nativeReviewStatus:'pending_review'}:{}),...(automaticDaily?{nativeDaily:{poolIdeaId:intent.poolIdeaId,taskId},nativeReviewStatus:'pending_review',creativeDirection:source.creativeDirection}:{}),id:creativeId,platformTargets:patch.platformTargets,schedule:null,title:candidate.title,planning:candidate.planning,aiCaption:candidate.aiCaption,materialRequirements:candidate.materialRequirements,contentType:source.scriptContent?.kind==='video'?'视频':'图文',product:selectedProducts.join(' / ')||'品牌内容',skuIds,status:'idea_pending',inspirationCreativeId:candidate.sourceCreativeId,inspirationSourceTitle:source.sourceVideo?.title||source.sourcePost?.title||source.contentAngle,inspirationSourceSummary:source.sourcePost?.copySummary||source.contentAngle,selectedCreativeCandidateId:source.creativeCandidateId,sampleOriginalUrl:source.sourceVideo?.sourceUrl||source.sourcePost?.sourceUrl||'',sampleVideoUrl:source.sourceVideo?.videoUrl||'',sampleSourcePlatform:source.sourceVideo?.platform||source.sourcePost?.platform||'',nativeSourceSnapshot:{retrievedAt:library.retrievedAt,libraryDigest:library.libraryDigest,contentMatchRequestId:library.contentMatchRequestId,version:null,versionStatus:'snapshot_only',source},nativeCandidate:{taskId,artifact:ref,candidate}}
  const saved=await saveCreativeRevision({id:userId,type:'HUMAN'},brandId,month,creativeId,{expectedRevision:creativeDigest(seed),idempotencyKey:`discovery-${digest([taskId,candidate.sourceCreativeId])}`,patch},undefined,{taskId,agentId:'amc-mm-user-ai',requestedBy:userId,contextDigest:result.contextDigest,artifact:ref,...(planningRequest?{planningRequest,contextPortfolio:library.contextPortfolio}:{}),...(automaticDaily?{automaticDaily:true,poolIdeaId:intent.poolIdeaId}:{})},seed)
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
