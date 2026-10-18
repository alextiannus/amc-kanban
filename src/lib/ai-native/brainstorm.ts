import {prisma} from '../prisma'
import {canUserAccessBrand} from '../user-management/brandAccess'
import {readPolicies} from '../role-permissions/store'
import {effectiveGrants} from '../role-permissions/contract'
import {principalFromUser} from '../auth-v2/types'
import {matchPromotionStrategyCreativeCandidates,fetchCreativeSourceEvidence} from '../promotion-strategy/clients'
import {readBrandFacts} from './facts'
import {digest,nativeError} from './contract'
import {createNativeTask} from './service'
import {creativeDigest,creativeWorkspace} from '../brand-plan/creativeRevisionContract'
import {readCreativeRevisions} from '../brand-plan/creativeRevisions'
import {canonicalCreativeSource} from '../brand-plan/creativeSourceReference'
import {streamSourceVideoMedia} from '../brand-plan/creativeSourceMedia'
import {BRAINSTORM_FEED,BRAINSTORM_DECISION,eligibleBrainstormSource,brainstormCreativeId,parseBrainstormDecision,projectBrainstormSource} from './brainstorm-contract'

export async function authorizeBrainstorm(userId:string,brandId:string,write=false,db:any=prisma){
 if(!await canUserAccessBrand(brandId,userId,write?'WRITE':'READ',db))throw nativeError('brainstorm_access_denied',404)
 const user=await db.user.findUnique({where:{id:userId},include:{businessRoles:true,owner:{include:{businessRoles:true}}}})
 if(!user||user.type!=='HUMAN'||user.status!=='ACTIVE')throw nativeError('brainstorm_access_denied',404)
 const principal=principalFromUser(user,'session'),{policies}=await readPolicies(db)
 const canDecide=principal.globalRoles.includes('ADMIN')||effectiveGrants((principal.permissionRoleIds||[]).filter(id=>Object.hasOwn(policies,id)),policies).includes('draft.update')
 if(write&&!canDecide)throw nativeError('creative_edit_forbidden',403)
 return {user,canDecide}
}
async function feed(db:any,brandId:string){return db.brandMarketingSolution.findFirst({where:{brandId,kind:BRAINSTORM_FEED,period:'sources'},orderBy:{version:'desc'}})}
async function decisions(db:any,brandId:string,ids:string[]){
 if(!ids.length)return []
 return db.brandMarketingSolution.findMany({where:{brandId,kind:BRAINSTORM_DECISION,period:{in:ids}},orderBy:{version:'desc'},distinct:['period']})
}
export async function listBrainstorm(userId:string,brandId:string,db:any=prisma){
 const {canDecide}=await authorizeBrainstorm(userId,brandId,false,db),saved=await feed(db,brandId)
 const sources=(saved?.output?.sources||[]).filter(eligibleBrainstormSource),choices=await decisions(db,brandId,sources.map((s:any)=>s.inspirationCreativeId))
 const byId=new Map(choices.map((d:any)=>[d.period,d]))
 return {ok:true,brandId,canDecide,needsRefresh:!saved||Date.now()-new Date(saved.createdAt).getTime()>=30*60000,refreshedAt:saved?.createdAt?.toISOString()||null,items:sources.filter((s:any)=>!['like','dislike'].includes((byId.get(s.inspirationCreativeId) as any)?.input?.decision)).map((s:any)=>projectBrainstormSource(s,brandId,byId.get(s.inspirationCreativeId)))}
}
export async function refreshBrainstorm(userId:string,brandId:string,body:any,db:any=prisma,match=matchPromotionStrategyCreativeCandidates){
 if(Object.keys(body).some(k=>!['action','force'].includes(k))||body.force!==undefined&&typeof body.force!=='boolean')throw nativeError('invalid_brainstorm_request',400)
 await authorizeBrainstorm(userId,brandId,false,db)
 const previous=await feed(db,brandId)
 if(previous&&!body.force&&Date.now()-new Date(previous.createdAt).getTime()<30*60000)return listBrainstorm(userId,brandId,db)
 const facts=await readBrandFacts(db,brandId)
 if(!facts)throw nativeError('brand_context_unavailable',404)
 const excluded=await db.brandMarketingSolution.findMany({where:{brandId,kind:BRAINSTORM_DECISION},orderBy:{createdAt:'desc'},distinct:['period'],take:72,select:{period:true}})
 const response=await match({merchantId:brandId,merchantName:facts.name,merchantCategory:facts.industry||'',market:facts.knowledge?.market||facts.location||undefined,promotionPointId:`brainstorm-${brandId}-${digest([facts.name,facts.description,Date.now()]).slice(0,16)}`,promotionGoal:'寻找适合品牌的原创意，保留原脚本供创意浏览，不改写脚本。',sellingPoint:[facts.name,facts.description,...(facts.productCatalog||[]).slice(0,8).map((s:any)=>s.name)].filter(Boolean).join('；').slice(0,4000),requestedCandidateCount:8,minimumMatchScore:75,requirePersistedCreative:true,excludeCreativeIds:excluded.map((d:any)=>d.period),platforms:['instagram','tiktok','xiaohongshu'],diversify:true})
 if(!Array.isArray(response.creativeCandidates)||typeof response.contentMatchRequestId!=='string')throw nativeError('content_library_unavailable',503)
 if((response.contentLibraryGaps||[]).some((g:any)=>Number(g.status)>=400)&&!response.creativeCandidates?.length)throw nativeError('content_library_unavailable',503)
 const incoming=response.creativeCandidates.filter(eligibleBrainstormSource)
 await db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,false,tx)
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
  const latest=await feed(tx,brandId)
  if(latest?.id!==previous?.id)return
  // Decisions and refreshes share the same brand lock. Re-read deferred choices
  // after acquiring it so a concurrent defer cannot be lost by this refresh.
  const previousSources=latest?.output?.sources||[],previousChoices=await decisions(tx,brandId,previousSources.map((s:any)=>s.inspirationCreativeId))
  const deferredIds=new Set(previousChoices.filter((d:any)=>d.input?.decision==='defer').map((d:any)=>d.period))
  const retained=previousSources.filter((s:any)=>deferredIds.has(s.inspirationCreativeId))
  const seen=new Set<string>(),sources=[...retained,...incoming].filter((s:any)=>eligibleBrainstormSource(s)&&!seen.has(s.inspirationCreativeId)&&!!seen.add(s.inspirationCreativeId))
  if(Buffer.byteLength(JSON.stringify(sources))>2*1024*1024)throw nativeError('library_evidence_too_large',413)
  await tx.brandMarketingSolution.create({data:{brandId,kind:BRAINSTORM_FEED,period:'sources',version:(latest?.version||0)+1,status:'READY',generationMode:'SOURCE_MATCH',createdById:userId,input:{contentMatchRequestId:response.contentMatchRequestId},output:{sources}}})
 })
 return listBrainstorm(userId,brandId,db)
}
export async function decideBrainstorm(userId:string,brandId:string,body:any,db:any=prisma){
 const input=parseBrainstormDecision(body)
 return db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,true,tx)
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
  const previous=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:BRAINSTORM_DECISION,period:input.sourceId},orderBy:{version:'desc'}})
  if(previous?.input?.decision===input.decision&&previous?.input?.sourceDigest===input.sourceDigest)return {ok:true,replayed:true,...previous.output,version:previous.version}
  if(['like','dislike'].includes(previous?.input?.decision)||(previous?.version||0)!==input.expectedVersion)throw nativeError('brainstorm_decision_changed',409)
  const saved=await feed(tx,brandId),source=saved?.output?.sources?.find((s:any)=>s.inspirationCreativeId===input.sourceId)
  if(!source||!eligibleBrainstormSource(source))throw nativeError('brainstorm_source_not_found',404)
  if(source.sourceDigest!==input.sourceDigest)throw nativeError('creative_source_changed',409)
  let creativeId:string|null=null,month:string|null=null
  if(input.decision==='like'){
   creativeId=brainstormCreativeId(brandId,input.sourceId)
   const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=creativeWorkspace(knowledge)
   const months=workspace.publishingCalendar?.months||{},found=Object.entries(months).filter(([,items]:any)=>Array.isArray(items)&&items.some((i:any)=>i.id===creativeId))
   if(found.length>1)throw nativeError('creative_not_found_or_ambiguous',409)
   if(found.length)month=found[0][0]
   else{
    const brand=await tx.brand.findUnique({where:{id:brandId},select:{timezone:true}}),now=new Date()
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:brand?.timezone||'Asia/Singapore',year:'numeric',month:'2-digit'}).formatToParts(now)
    month=`${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`
    const capturedAt=now.toISOString(),canonical=canonicalCreativeSource({...source,timeline:source.sourceEvidence?.timeline??source.timeline},input.sourceId,capturedAt,{contentMatchRequestId:saved.input.contentMatchRequestId})
    if(!canonical)throw nativeError('creative_source_not_found',404)
    const title=source.sourceVideo?.title||source.sourcePost?.title||source.title||input.sourceId
    const item={id:creativeId,brandId,title,planning:'',materialRequirements:[],aiCaption:'',aiTags:[],status:'idea_pending',date:null,schedule:null,platformTargets:[],contentType:source.scriptContent?.kind==='video'?'视频':'图文',inspirationCreativeId:input.sourceId,source:canonical,nativeSourceSnapshot:{source,retrievedAt:capturedAt,contentMatchRequestId:saved.input.contentMatchRequestId},brainstorm:{sourceId:input.sourceId,matchScore:source.matchScore,likedBy:userId,likedAt:capturedAt},createdAt:capturedAt}
    await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...months,[month]:[...(months[month]||[]),item]}}}}})
   }
  }
  const output={decision:input.decision,sourceId:input.sourceId,creativeId,month}
  const decision=await tx.brandMarketingSolution.create({data:{brandId,kind:BRAINSTORM_DECISION,period:input.sourceId,version:(previous?.version||0)+1,status:'SAVED',generationMode:'HUMAN_CHOICE',createdById:userId,input:{decision:input.decision,sourceDigest:input.sourceDigest},output}})
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'BRAINSTORM_DECISION_SAVED',resourceType:'BrandCreative',resourceId:input.sourceId,metadata:{brandId,decision:input.decision,decisionId:decision.id,creativeId}}})
  return {ok:true,...output,version:decision.version}
 })
}
export async function replicateBrainstorm(userId:string,brandId:string,body:any,db:any=prisma,createTask=createNativeTask){
 if(Object.keys(body).some(k=>!['action','creativeId'].includes(k))||typeof body.creativeId!=='string')throw nativeError('invalid_brainstorm_request',400)
 await authorizeBrainstorm(userId,brandId,true,db)
 const current=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,'',body.creativeId,undefined,db)
 if(current.current?.brandDismissal?.decision==='dislike'||!current.current?.brainstorm||!current.canOverwrite)throw nativeError('brainstorm_source_not_found',404)
 if(current.current.planning?.trim())return {ok:true,creativeId:body.creativeId,alreadyRewritten:true}
 const fixed=current.current.source
 if(!fixed?.inspirationCreativeId||!fixed.sourceRevision||!fixed.sourceDigest)throw nativeError('creative_source_not_found',404)
 const evidence=await fetchCreativeSourceEvidence(fixed.inspirationCreativeId)
 if(evidence.creativeId!==fixed.inspirationCreativeId||evidence.sourceRevision!==fixed.sourceRevision||evidence.sourceDigest!==fixed.sourceDigest)throw nativeError('creative_source_changed',409)
 const requestKey=`brainstorm-${digest([userId,brandId,body.creativeId,current.expectedRevision])}`
 const task=await createTask(userId,brandId,{kind:'creative',creativeId:body.creativeId,month:current.month,expectedRevision:current.expectedRevision,requestKey,goal:'用户已选择复刻此原创意。请读取完整原创意证据与当前品牌已确认事实，保留原脚本爆款机制、完整分镜顺序与节奏，改写为适合当前品牌的完整脚本及完整拍摄说明。仅使用真实品牌及商品事实，未知信息明确标注。产出候选供用户 Review，不自动采用、制作或发布。'})
 return {ok:true,id:task.id,creativeId:body.creativeId,month:current.month}
}
export async function brainstormVideo(userId:string,brandId:string,sourceId:string,signal?:AbortSignal,db:any=prisma){
 await authorizeBrainstorm(userId,brandId,false,db)
 const saved=await feed(db,brandId),source=saved?.output?.sources?.find((s:any)=>s.inspirationCreativeId===sourceId)
 const choices=await decisions(db,brandId,[sourceId])
 if(!source||!eligibleBrainstormSource(source)||choices[0]?.input?.decision==='dislike')throw nativeError('brainstorm_source_not_found',404)
 const raw=await fetchCreativeSourceEvidence(sourceId)
 if(raw.creativeId!==sourceId||raw.sourceRevision!==source.sourceRevision||raw.sourceDigest!==source.sourceDigest)throw nativeError('creative_source_changed',409)
 return streamSourceVideoMedia(raw,signal)
}

// Calendar choices also apply to automatically adapted and legacy saved ideas.
export async function dismissCalendarCreative(userId:string,brandId:string,body:any,db:any=prisma){
 if(!body||Object.keys(body).some(k=>!['action','creativeId','expectedRevision'].includes(k))||body.action!=='dismiss'||typeof body.creativeId!=='string'||!body.creativeId||body.creativeId.length>200||!/^[a-f0-9]{64}$/.test(body.expectedRevision||''))throw nativeError('invalid_brainstorm_request',400)
 return db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,true,tx)
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=creativeWorkspace(knowledge),months=workspace.publishingCalendar?.months||{}
  const entries=Object.entries(months).flatMap(([month,items]:any)=>Array.isArray(items)?items.filter((i:any)=>i.id===body.creativeId).map((current:any)=>({month,current})):[])
  if(entries.length!==1)throw nativeError('creative_not_found_or_ambiguous',404)
  const {month,current}=entries[0],old=current.brandDismissal
  if(old?.decision==='dislike'&&old.expectedRevision===body.expectedRevision)return {ok:true,replayed:true,creativeId:body.creativeId,month,hiddenCreativeIds:old.hiddenCreativeIds||[body.creativeId]}
  if(old?.decision==='dislike'||creativeDigest(current)!==body.expectedRevision)throw nativeError('creative_revision_conflict',409)
  const candidateIds=[current.inspirationCreativeId,current.source?.inspirationCreativeId,current.nativeSourceSnapshot?.source?.inspirationCreativeId].filter(Boolean)
  if(new Set(candidateIds).size>1)throw nativeError('creative_source_changed',409)
  const sourceId=candidateIds[0]
  if(sourceId&&!/^cre_[a-zA-Z0-9_-]+$/.test(sourceId))throw nativeError('creative_source_changed',409)
  const hiddenCreativeIds=Object.values(months).flat().filter((i:any)=>i.id===body.creativeId||sourceId&&[i.inspirationCreativeId,i.source?.inspirationCreativeId,i.nativeSourceSnapshot?.source?.inspirationCreativeId].includes(sourceId)).map((i:any)=>i.id)
  const next={...current,brandDismissal:{decision:'dislike',by:userId,at:new Date().toISOString(),expectedRevision:body.expectedRevision,sourceId:sourceId||null,hiddenCreativeIds}}
  await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months:Object.fromEntries(Object.entries(months).map(([bucket,items]:any)=>[bucket,Array.isArray(items)?items.map((i:any)=>i.id===body.creativeId?next:sourceId&&[i.inspirationCreativeId,i.source?.inspirationCreativeId,i.nativeSourceSnapshot?.source?.inspirationCreativeId].includes(sourceId)?{...i,brandDismissal:next.brandDismissal}:i):items]))}}}})
  if(sourceId){
   const prior=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:BRAINSTORM_DECISION,period:sourceId},orderBy:{version:'desc'}})
   await tx.brandMarketingSolution.create({data:{brandId,kind:BRAINSTORM_DECISION,period:sourceId,version:(prior?.version||0)+1,status:'SAVED',generationMode:'HUMAN_CHOICE',createdById:userId,input:{decision:'dislike',sourceDigest:current.source?.sourceDigest||current.nativeSourceSnapshot?.source?.sourceDigest||null},output:{decision:'dislike',sourceId,creativeId:body.creativeId,month}}})
  }
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'CALENDAR_CREATIVE_DISLIKED',resourceType:'BrandCreative',resourceId:body.creativeId,metadata:{brandId,month,sourceId:sourceId||null,expectedRevision:body.expectedRevision}}})
  return {ok:true,replayed:false,creativeId:body.creativeId,month,hiddenCreativeIds}
 })
}
