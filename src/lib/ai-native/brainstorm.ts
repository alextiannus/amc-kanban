import {browseFeedSql,browsePoolSql} from './browse-source'
import {readBrowseKnowledge} from './browse-knowledge'
import {brainstormMatchRequest,brainstormTagContext,BRAINSTORM_KEYWORD_POLICY} from './brainstorm-match'
import {resolveCreativeSourceEvidence} from '../brand-plan/creativeSourceEvidence'
import {creativeSourceScript} from '../brand-plan/creativeSourceScript'
import {resolveBrainstormVideos} from './brainstorm-video'
import {CREATIVE_SELECTION_POLICY,creativeIsSelected,creativeSourceId,dislikedCreativeSources,readDislikedCreativeSources} from '../brand-plan/creativeVisibility'
import {prisma} from '../prisma'
import {canUserAccessBrand} from '../user-management/brandAccess'
import {readPolicies} from '../role-permissions/store'
import {effectiveGrants} from '../role-permissions/contract'
import {principalFromUser} from '../auth-v2/types'
import {matchPromotionStrategyCreativeCandidates,fetchBrandKeywords,fetchBrainstormBrowse,fetchCreativeSourceEvidence,fetchCreativeSourceThumbnail} from '../promotion-strategy/clients'
import {readBrandFacts,skuFacts} from './facts'
import {digest,nativeError} from './contract'
import {createNativeTask} from './service'
import {hasCreativeDraftMarker} from '../brand-plan/creativeDraftMarker'
import {CREATIVE_REVISION_KIND,revisionPeriod,revisionSource,creativeDigest,creativeWorkspace} from '../brand-plan/creativeRevisionContract'
import {readCreativeRevisions} from '../brand-plan/creativeRevisions'
import {canonicalCreativeSource} from '../brand-plan/creativeSourceReference'
import {streamSourceVideoMedia} from '../brand-plan/creativeSourceMedia'
import {BRAINSTORM_FEED,BRAINSTORM_DECISION,eligibleBrainstormSource,brainstormCreativeId,parseBrainstormDecision,projectBrainstormSource} from './brainstorm-contract'

export async function authorizeBrainstorm(userId:string,brandId:string,write=false,db:any=prisma){
 const [allowed,user,{policies}]=await Promise.all([
  canUserAccessBrand(brandId,userId,write?'WRITE':'READ',db),
  db.user.findUnique({where:{id:userId},include:{businessRoles:true,owner:{include:{businessRoles:true}}}}),
  readPolicies(db),
 ])
 if(!allowed)throw nativeError('brainstorm_access_denied',404)
 if(!user||user.type!=='HUMAN'||user.status!=='ACTIVE')throw nativeError('brainstorm_access_denied',404)
 const principal=principalFromUser(user,'session')
 const canDecide=principal.globalRoles.includes('ADMIN')||effectiveGrants((principal.permissionRoleIds||[]).filter(id=>Object.hasOwn(policies,id)),policies).includes('draft.update')
 if(write&&!canDecide)throw nativeError('creative_edit_forbidden',403)
 return {user,canDecide}
}
function matchKeywords(value:unknown):string{
 if(typeof value!=='string'||value.length>300)throw nativeError('invalid_match_keywords',400)
 return value.trim().replace(/\s+/g,' ')
}
async function feed(db:any,brandId:string,compact=false){if(compact&&db.$queryRawUnsafe)return (await db.$queryRawUnsafe(browseFeedSql,brandId))[0]||null;return db.brandMarketingSolution.findFirst({where:{brandId,kind:BRAINSTORM_FEED,period:'sources'},orderBy:{version:'desc'}})}
async function decisions(db:any,brandId:string,ids:string[]){
 if(!ids.length)return []
 return db.brandMarketingSolution.findMany({where:{brandId,kind:BRAINSTORM_DECISION,period:{in:ids}},orderBy:{version:'desc'},distinct:['period']})
}
// Inbox, library recommendations and returned calendar records share this feed.
async function poolSources(db:any,brandId:string,compact=false){
 if(!db.$queryRaw)return []
 const exists=await db.$queryRaw`SELECT to_regclass('amc_iaic.brand_ideas')::text AS name`
 if(!exists[0]?.name)return []
 if(compact&&db.$queryRawUnsafe)return db.$queryRawUnsafe(browsePoolSql,brandId)
 return db.$queryRaw`SELECT id,source_id,source,match_id FROM amc_iaic.brand_ideas AS ideas WHERE brand_id=${brandId} AND (replaced_at IS NULL OR selected_at IS NOT NULL OR EXISTS (SELECT 1 FROM "BrandMarketingSolution" AS choice WHERE choice."brandId"=${brandId} AND choice.kind='BRAINSTORM_DECISION' AND choice.period=ideas.source_id AND choice.input->>'decision'='defer')) ORDER BY created_at DESC,id`
}
async function browserState(db:any,brandId:string,compact=false){
 const [knowledge,recordedDislikes]=await Promise.all([compact?readBrowseKnowledge(db,brandId):db.brandKnowledge.findUnique({where:{brandId}}),readDislikedCreativeSources(db,brandId,{})]),workspace=creativeWorkspace(knowledge)
 const entries=Object.entries(workspace.publishingCalendar?.months||{}).flatMap(([month,items]:any)=>Array.isArray(items)?items.filter((i:any)=>i?.id).map((item:any)=>({month,item})):[])
 const disliked=new Set([...recordedDislikes,...dislikedCreativeSources(workspace)])
 const selected=new Set(entries.filter(({item})=>creativeIsSelected(item)).map(({item})=>creativeSourceId(item)).filter(Boolean))
 return {workspace,entries,disliked,selected}
}
export async function listBrainstorm(userId:string,brandId:string,db:any=prisma,firstScreen=false,after?:string,separateKeywords=false){
 const started=performance.now()
 const {canDecide}=await authorizeBrainstorm(userId,brandId,false,db)
 const authorizedAt=performance.now()
 const [saved,{entries,disliked,selected},pool,facts]=await Promise.all([feed(db,brandId,true),browserState(db,brandId,true),poolSources(db,brandId,true),separateKeywords?Promise.resolve(null):db.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,industry:true,knowledge:{select:{menuItems:true,productAssumptions:true,promotionFocus:true}}}})])
 const sources=(saved?.output?.sources||[]).filter(eligibleBrainstormSource),choices=await decisions(db,brandId,[...sources.map((s:any)=>s.inspirationCreativeId),...pool.map((p:any)=>p.source_id)])
 const byId=new Map(choices.map((d:any)=>[d.period,d])),seen=new Set<string>()
 const candidates:{idea:any;current:any}[]=[]
 for(const {month,item} of entries){
  const sourceId=creativeSourceId(item)
  if(!sourceId)continue
  if(creativeIsSelected(item)||item.brandDismissal?.decision==='dislike'||disliked.has(sourceId)||selected.has(sourceId)||['archived','deleted','归档','已删除'].includes(item.status))continue
  const source=item.nativeSourceSnapshot?.source||item.source||{},projected=projectBrainstormSource({...source,inspirationCreativeId:sourceId},brandId,null)
  candidates.push({current:item,idea:{...projected,title:projected.title||item.title||'内容创意',sourceDigest:/^[a-f0-9]{64}$/.test(source.sourceDigest||item.source?.sourceDigest||'')?(source.sourceDigest||item.source.sourceDigest):null,matchScore:typeof source.matchScore==='number'&&Number.isFinite(source.matchScore)?source.matchScore:null,savedCreativeId:item.id,poolIdeaId:pool.find((row:any)=>row.source_id===sourceId)?.id,expectedRevision:creativeDigest(item),month,decision:item.creativeBrowserDecision?.decision||null,decisionVersion:0,videoUrl:(source.sourceVideo?.videoUrl||item.source?.originalVideoUrl)?`/api/brands/${encodeURIComponent(brandId)}/content-creatives/${encodeURIComponent(item.id)}/source/media`:null}})
  seen.add(sourceId)
 }
 for(const candidate of [...sources.map((source:any)=>({source})),...pool.map((row:any)=>({source:row.source,poolIdeaId:row.id}))]){
  const {source}=candidate,id=source?.inspirationCreativeId,choice:any=byId.get(id)
  if(!eligibleBrainstormSource(source)||seen.has(id)||selected.has(id)||disliked.has(id)||['like','dislike'].includes(choice?.input?.decision))continue
  seen.add(id);candidates.push({current:{source},idea:{...projectBrainstormSource(source,brandId,choice),...('poolIdeaId' in candidate?{poolIdeaId:candidate.poolIdeaId}:{})}})
 }
 const ranks=new Map<string,number>(sources.map((s:any,i:number)=>[s.inspirationCreativeId,i]))
 candidates.sort((a,b)=>(ranks.get(a.idea.sourceId)??Infinity)-(ranks.get(b.idea.sourceId)??Infinity))
 const cursorKey=(c:{idea:any})=>c.idea.savedCreativeId?`saved:${c.idea.savedCreativeId}`:c.idea.sourceId
 const start=after?candidates.findIndex(c=>cursorKey(c)===after)+1:0
 if(after&&start===0)throw nativeError('brainstorm_cursor_changed',409)
 const hasMore=firstScreen&&candidates.length>start+8,requested=firstScreen?candidates.slice(start,start+8):candidates
 const nextCursor=hasMore?cursorKey(requested[requested.length-1]):undefined
 const dataAt=performance.now()
 const browse=await fetchBrainstormBrowse(requested.map(c=>c.idea.sourceId),separateKeywords?undefined:brainstormTagContext({...facts,productCatalog:skuFacts(facts?.knowledge?.menuItems)},saved?.input?.matchKeywords||''))
 const evidence=new Map(browse.items.map((entry:any)=>[entry.creativeId,entry]))
 const {items,videoResolutionIncomplete}=await resolveBrainstormVideos(requested,brandId,async id=>{const entry:any=evidence.get(id);if(!entry?.source)throw new Error(entry?.error||'original_evidence_unavailable');return entry.source})
 items.sort((a,b)=>(ranks.get(a.sourceId)??Infinity)-(ranks.get(b.sourceId)??Infinity))
 const tagResult=browse.brandTags
 console.info('[brainstorm-timing]',JSON.stringify({brandId,authorizationMs:Math.round(authorizedAt-started),dataMs:Math.round(dataAt-authorizedAt),contentMs:Math.round(performance.now()-dataAt),totalMs:Math.round(performance.now()-started),candidates:candidates.length,requested:requested.length,firstScreen,items:items.length}))
 return {ok:true,brandId,canDecide:canDecide&&!hasMore,hasMore,...(nextCursor?{nextCursor}:{}),matchKeywords:saved?.input?.matchKeywords||'',brandKeywordRevision:(tagResult as any)?.revision,keywordsChanged:!!(tagResult as any)?.revision&&saved?.input?.brandKeywordRevision!==(tagResult as any).revision,matchingTags:tagResult?.tags.map(t=>t.label)||[],matchingTagDefinitions:tagResult?.tags||[],matchingTagsUnavailable:!tagResult,needsRefresh:!saved||Date.now()-new Date(saved.createdAt).getTime()>=30*60000,refreshedAt:saved?.createdAt?.toISOString()||null,videoResolutionIncomplete,items}
}
export async function decideSavedBrainstorm(userId:string,brandId:string,body:any,db:any=prisma){
 if(!body||body.action!=='decideSaved'||Object.keys(body).some(k=>!['action','creativeId','expectedRevision','decision'].includes(k))||typeof body.creativeId!=='string'||!body.creativeId||body.creativeId.length>200||!/^[a-f0-9]{64}$/.test(body.expectedRevision||'')||!['like','dislike','defer'].includes(body.decision))throw nativeError('invalid_brainstorm_request',400)
 if(body.decision==='dislike')return dismissCalendarCreative(userId,brandId,{action:'dismiss',creativeId:body.creativeId,expectedRevision:body.expectedRevision},db)
 return db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,true,tx)
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{},select:{id:true}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
  const {workspace,entries,disliked}=await browserState(tx,brandId),found=entries.filter(({item})=>item.id===body.creativeId)
  if(found.length!==1)throw nativeError('creative_not_found_or_ambiguous',404)
  const {month,item}=found[0],sourceId=creativeSourceId(item)
  if(item.brandDismissal?.decision==='dislike'||disliked.has(sourceId))throw nativeError('brainstorm_source_not_found',404)
  const previous=item.creativeBrowserDecision
  if(previous?.expectedRevision===body.expectedRevision&&previous.decision===body.decision)return {ok:true,replayed:true,month,creativeId:item.id,decision:body.decision,expectedRevision:creativeDigest(item),version:0}
  if(creativeDigest(item)!==body.expectedRevision)throw nativeError('creative_revision_conflict',409)
  if(creativeIsSelected(item)||sourceId&&entries.some(({item:other})=>other.id!==item.id&&creativeIsSelected(other)&&(creativeSourceId(other))===sourceId))throw nativeError('brainstorm_decision_changed',409)
  const at=new Date().toISOString(),next={...item,creativeBrowserDecision:{decision:body.decision,expectedRevision:body.expectedRevision,at,by:userId},...(body.decision==='like'?{creativeBrowserSelection:{policy:CREATIVE_SELECTION_POLICY,reason:'like',at,by:userId}}:{})}
  await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...workspace.publishingCalendar.months,[month]:workspace.publishingCalendar.months[month].map((i:any)=>i.id===item.id?next:i)}}}}})
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'RETURNED_CREATIVE_DECISION_SAVED',resourceType:'BrandCreative',resourceId:item.id,metadata:{brandId,month,decision:body.decision,expectedRevision:body.expectedRevision}}})
  return {ok:true,replayed:false,month,creativeId:item.id,decision:body.decision,expectedRevision:creativeDigest(next),version:0}
 })
}
export async function refreshBrainstorm(userId:string,brandId:string,body:any,db:any=prisma,match=matchPromotionStrategyCreativeCandidates){
 if(!body||Object.keys(body).some(k=>!['action','force','keywords','expectedKeywords'].includes(k))||body.force!==undefined&&typeof body.force!=='boolean')throw nativeError('invalid_brainstorm_request',400)
 const editing=Object.hasOwn(body,'keywords')
 if(!editing&&Object.hasOwn(body,'expectedKeywords'))throw nativeError('invalid_match_keywords',400)
 const requested=editing?matchKeywords(body.keywords):undefined,expected=editing?matchKeywords(body.expectedKeywords):undefined
 await authorizeBrainstorm(userId,brandId,editing,db)
 const previous=await feed(db,brandId),previousKeywords=previous?.input?.matchKeywords||''
 if(editing&&expected!==previousKeywords)throw nativeError('brainstorm_keywords_changed',409)
 const keywords=requested??previousKeywords
 const facts=await readBrandFacts(db,brandId)
 if(!facts)throw nativeError('brand_context_unavailable',404)
 const currentKeywords=await fetchBrandKeywords({action:'read',brandId,context:brainstormTagContext(facts,'')})
 if(previous&&previous.input?.brandKeywordRevision===currentKeywords.revision&&previous.input?.keywordPolicy===BRAINSTORM_KEYWORD_POLICY&&keywords===previousKeywords&&!body.force&&Date.now()-new Date(previous.createdAt).getTime()<30*60000)return listBrainstorm(userId,brandId,db)

 const excluded=await db.brandMarketingSolution.findMany({where:{brandId,kind:BRAINSTORM_DECISION},orderBy:{createdAt:'desc'},distinct:['period'],take:72,select:{period:true}})
 const {selected,disliked}=await browserState(db,brandId)
 const excludedSourceIds=[...new Set([...excluded.map((d:any)=>d.period),...selected,...disliked])]
 const response=await match(brainstormMatchRequest({...facts,id:brandId},keywords,`brainstorm-${brandId}-${digest([facts.name,facts.description,keywords,Date.now()]).slice(0,16)}`,excludedSourceIds))
 if(!Array.isArray(response.creativeCandidates)||typeof response.contentMatchRequestId!=='string')throw nativeError('content_library_unavailable',503)
 if((response.contentLibraryGaps||[]).some((g:any)=>Number(g.status)>=400)&&!response.creativeCandidates?.length)throw nativeError('content_library_unavailable',503)
 const incoming=response.creativeCandidates.filter(eligibleBrainstormSource)
 await db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,editing,tx)
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{},select:{id:true}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
  const latest=await feed(tx,brandId)
  if(latest?.id!==previous?.id){if(editing)throw nativeError('brainstorm_keywords_changed',409);return}
  // Decisions and refreshes share the same brand lock. Re-read deferred choices
  // after acquiring it so a concurrent defer cannot be lost by this refresh.
  const previousSources=latest?.output?.sources||[],previousChoices=await decisions(tx,brandId,previousSources.map((s:any)=>s.inspirationCreativeId))
  const deferredIds=new Set(previousChoices.filter((d:any)=>d.input?.decision==='defer').map((d:any)=>d.period))
  const retained=previousSources.filter((s:any)=>deferredIds.has(s.inspirationCreativeId))
  const seen=new Set<string>(),sources=[...incoming,...retained].filter((s:any)=>eligibleBrainstormSource(s)&&!seen.has(s.inspirationCreativeId)&&!!seen.add(s.inspirationCreativeId))
  if(Buffer.byteLength(JSON.stringify(sources))>2*1024*1024)throw nativeError('library_evidence_too_large',413)
  await tx.brandMarketingSolution.create({data:{brandId,kind:BRAINSTORM_FEED,period:'sources',version:(latest?.version||0)+1,status:'READY',generationMode:'SOURCE_MATCH',createdById:userId,input:{brandKeywordRevision:(response.brandTags as any)?.revision??currentKeywords.revision,contentMatchRequestId:response.contentMatchRequestId,matchKeywords:keywords,matchingTags:response.brandTags?.tags?.map((t:any)=>t.label)||[],matchingTagDefinitions:response.brandTags?.tags||[],keywordPolicy:BRAINSTORM_KEYWORD_POLICY},output:{sources}}})
 })
 return listBrainstorm(userId,brandId,db)
}
export async function decideBrainstorm(userId:string,brandId:string,body:any,db:any=prisma){
 const input=parseBrainstormDecision(body)
 return db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,true,tx)
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{},select:{id:true}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
  const previous=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:BRAINSTORM_DECISION,period:input.sourceId},orderBy:{version:'desc'}})
  if(previous?.input?.decision===input.decision&&previous?.input?.sourceDigest===input.sourceDigest){
   if(input.decision==='like'){
    const {entries}=await browserState(tx,brandId)
    if(!entries.some(({item})=>item.id===previous.output?.creativeId&&creativeIsSelected(item)))throw nativeError('brainstorm_decision_changed',409)
   }
   return {ok:true,replayed:true,...previous.output,version:previous.version}
  }
  if(['like','dislike'].includes(previous?.input?.decision)||(previous?.version||0)!==input.expectedVersion)throw nativeError('brainstorm_decision_changed',409)
  const saved=await feed(tx,brandId),pool=input.poolIdeaId?(await poolSources(tx,brandId)).find((row:any)=>row.id===input.poolIdeaId&&row.source_id===input.sourceId):null,source=input.poolIdeaId?pool?.source:saved?.output?.sources?.find((s:any)=>s.inspirationCreativeId===input.sourceId)
  if(!source||!eligibleBrainstormSource(source))throw nativeError('brainstorm_source_not_found',404)
  if(source.sourceDigest!==input.sourceDigest)throw nativeError('creative_source_changed',409)
  let creativeId:string|null=null,month:string|null=null
  if(input.decision==='like'){
   creativeId=brainstormCreativeId(brandId,input.sourceId)
   const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=creativeWorkspace(knowledge)
   const months=workspace.publishingCalendar?.months||{}
   if(Object.values(months).flat().some((i:any)=>i.id!==creativeId&&(creativeSourceId(i))===input.sourceId))throw nativeError('brainstorm_decision_changed',409)
   const found=Object.entries(months).filter(([,items]:any)=>Array.isArray(items)&&items.some((i:any)=>i.id===creativeId))
   if(found.length>1)throw nativeError('creative_not_found_or_ambiguous',409)
   if(found.length){
    month=found[0][0]
    const item=(months[month!] as any[]).find(i=>i.id===creativeId)
    if(!creativeIsSelected(item))throw nativeError('brainstorm_decision_changed',409)
   }
   else{
    const brand=await tx.brand.findUnique({where:{id:brandId},select:{timezone:true}}),now=new Date()
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:brand?.timezone||'Asia/Singapore',year:'numeric',month:'2-digit'}).formatToParts(now)
    month=`${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`
    const capturedAt=now.toISOString(),canonical=canonicalCreativeSource({...source,timeline:source.sourceEvidence?.timeline??source.timeline},input.sourceId,capturedAt,{contentMatchRequestId:pool?(pool.match_id||null):(saved?.input?.contentMatchRequestId||null)})
    if(!canonical)throw nativeError('creative_source_not_found',404)
    const title=source.sourceVideo?.title||source.sourcePost?.title||source.title||input.sourceId
    const item={id:creativeId,brandId,title,planning:'',materialRequirements:[],aiCaption:'',aiTags:[],status:'idea_pending',date:null,schedule:null,platformTargets:[],contentType:source.scriptContent?.kind==='video'?'视频':'图文',inspirationCreativeId:input.sourceId,source:canonical,nativeSourceSnapshot:{source,retrievedAt:capturedAt,contentMatchRequestId:pool?(pool.match_id||null):(saved?.input?.contentMatchRequestId||null)},creativeBrowserSelection:{policy:CREATIVE_SELECTION_POLICY,reason:'like',at:capturedAt,by:userId},brainstorm:{sourceId:input.sourceId,matchScore:source.matchScore,likedBy:userId,likedAt:capturedAt},createdAt:capturedAt}
    await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...months,[month]:[...(months[month]||[]),item]}}}}})
   }
  }
  const output={decision:input.decision,sourceId:input.sourceId,creativeId,month}
  const decision=await tx.brandMarketingSolution.create({data:{brandId,kind:BRAINSTORM_DECISION,period:input.sourceId,version:(previous?.version||0)+1,status:'SAVED',generationMode:'HUMAN_CHOICE',createdById:userId,input:{decision:input.decision,sourceDigest:input.sourceDigest},output}})
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'BRAINSTORM_DECISION_SAVED',resourceType:'BrandCreative',resourceId:input.sourceId,metadata:{brandId,decision:input.decision,decisionId:decision.id,creativeId}}})
  return {ok:true,...output,version:decision.version}
 })
}
// Explicit replication creates a new editable version; browsing choices are independent.
export async function copyBrainstorm(userId:string,brandId:string,body:any,db:any=prisma){
 if(!body||body.action!=='copy'||Object.keys(body).some(k=>!['action','requestKey','creativeId','sourceId','poolIdeaId','scriptMode'].includes(k))||body.scriptMode!==undefined&&body.scriptMode!=='original'||typeof body.requestKey!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(body.requestKey)||!!body.creativeId===!!body.sourceId||body.creativeId&&(typeof body.creativeId!=='string'||body.creativeId.length>200)||body.sourceId&&(typeof body.sourceId!=='string'||!/^cre_[a-zA-Z0-9_-]+$/.test(body.sourceId))||body.poolIdeaId&&(typeof body.poolIdeaId!=='string'||body.poolIdeaId.length>200))throw nativeError('invalid_brainstorm_request',400)
 const creativeId=`copy_${digest([brandId,userId,body.requestKey]).slice(0,40)}`,requestDigest=digest(body)
 // Resolve remote evidence before taking the brand write lock. Recheck the
 // current record's identity/pins under that lock before committing the copy.
 await authorizeBrainstorm(userId,brandId,true,db)
 const existing=await db.brandMarketingSolution.findFirst({where:{brandId,kind:'BRAINSTORM_COPY',period:creativeId},orderBy:{version:'desc'}})
 if(existing){if(existing.input?.requestDigest!==requestDigest)throw nativeError('idempotency_conflict',409);return {ok:true,replayed:true,...existing.output}}
 let resolved:any=null
 if(body.creativeId){
  const state=creativeWorkspace(await db.brandKnowledge.findUnique({where:{brandId}}))
  const matches=Object.values(state.publishingCalendar?.months||{}).flat().filter((i:any)=>i?.id===body.creativeId)
  if(matches.length!==1)throw nativeError('creative_not_found_or_ambiguous',404)
  const current=matches[0] as any
  resolved=(await resolveCreativeSourceEvidence(current,revisionSource(current,null,new Date().toISOString()),fetchCreativeSourceEvidence)).raw
 }else{
  const saved=await feed(db,brandId)
  const source=saved?.output?.sources?.find((s:any)=>s.inspirationCreativeId===body.sourceId)||(await poolSources(db,brandId)).find((r:any)=>r.source_id===body.sourceId&&(!body.poolIdeaId||r.id===body.poolIdeaId))?.source
  if(!source||!eligibleBrainstormSource(source))throw nativeError('brainstorm_source_not_found',404)
  const current={inspirationCreativeId:body.sourceId,nativeSourceSnapshot:{source}}
  resolved=(await resolveCreativeSourceEvidence(current,revisionSource(current,null,new Date().toISOString()),fetchCreativeSourceEvidence)).raw
 }
 return db.$transaction(async(tx:any)=>{
  const {user}=await authorizeBrainstorm(userId,brandId,true,tx)
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{},select:{id:true}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
  const prior=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:'BRAINSTORM_COPY',period:creativeId},orderBy:{version:'desc'}})
  if(prior){if(prior.input?.requestDigest!==requestDigest)throw nativeError('idempotency_conflict',409);return {ok:true,replayed:true,...prior.output}}
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=creativeWorkspace(knowledge),months=workspace.publishingCalendar?.months||{}
  let original:any=null,source:any=null,sourceId:string,canonical:any
  const now=new Date(),at=now.toISOString()
  if(body.creativeId){
   const found=Object.values(months).flat().filter((i:any)=>i?.id===body.creativeId)
   if(found.length!==1)throw nativeError('creative_not_found_or_ambiguous',404)
   original=found[0];sourceId=creativeSourceId(original)
   source=original.nativeSourceSnapshot?.source||original.source
   canonical=original.source
   if(!sourceId)throw nativeError('creative_source_not_found',404)
   // Use exactly the same legacy identity and pinned-version rules as browsing.
   const {raw}=await resolveCreativeSourceEvidence(original,revisionSource(original,null,at),async id=>{if(resolved?.creativeId!==id)throw nativeError('creative_source_changed',409);return resolved})
   canonical=canonicalCreativeSource({...raw,inspirationCreativeId:sourceId},sourceId,at,canonical||{})
   source=source||canonical
  }else{
   const saved=await feed(tx,brandId)
   source=saved?.output?.sources?.find((s:any)=>s.inspirationCreativeId===body.sourceId)
   if(!source)source=(await poolSources(tx,brandId)).find((r:any)=>r.source_id===body.sourceId&&(!body.poolIdeaId||r.id===body.poolIdeaId))?.source
   if(!source||!eligibleBrainstormSource(source))throw nativeError('brainstorm_source_not_found',404)
   sourceId=body.sourceId
   const current={inspirationCreativeId:sourceId,nativeSourceSnapshot:{source}}
   const {raw}=await resolveCreativeSourceEvidence(current,revisionSource(current,null,at),async()=>resolved)
   canonical=canonicalCreativeSource({...source,...raw,inspirationCreativeId:sourceId,timeline:raw.timeline?.length?raw.timeline:source.sourceEvidence?.timeline??source.timeline},sourceId,at)
   if(!canonical)throw nativeError('creative_source_not_found',404)
  }
  const brand=await tx.brand.findUnique({where:{id:brandId},select:{timezone:true}})
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:brand?.timezone||'Asia/Singapore',year:'numeric',month:'2-digit'}).formatToParts(now)
  const month=`${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`
  const originalCaption=source?.sourceEvidence?.originalText
  const uneditedCaptionCopy=original?.replicationCopy&&original.planning===originalCaption&&!await tx.brandMarketingSolution.findFirst({where:{brandId,kind:CREATIVE_REVISION_KIND,input:{path:['creativeId'],equals:original.id}},orderBy:{version:'desc'}})
  const planning=body.scriptMode!=='original'&&original?.planning&&!uneditedCaptionCopy?original.planning:creativeSourceScript(canonical)
  const item:any={...(original||{}),id:creativeId,brandId,title:original?.title||source.sourceVideo?.title||source.sourcePost?.title||source.title||sourceId,planning,materialRequirements:original?.materialRequirements||[],aiCaption:original?.aiCaption||'',aiTags:original?.aiTags||[],contentType:original?.contentType||(source.scriptContent?.kind==='video'||source.sourceVideo?.videoUrl||canonical.originalVideoUrl?'视频':'图文'),inspirationCreativeId:sourceId,source:canonical,nativeSourceSnapshot:original?.nativeSourceSnapshot||{source,retrievedAt:at},status:'idea_pending',date:null,schedule:null,scriptOwner:{id:userId,name:user.nickname||userId},createdAt:at,updatedAt:at,creativeBrowserSelection:{policy:CREATIVE_SELECTION_POLICY,reason:'like',at,by:userId},replicationCopy:{requestKey:body.requestKey,sourceCreativeId:original?.id||null,sourceId,at}}
  for(const key of ['brandDismissal','creativeBrowserDecision','calendarSelection','brainstorm','revisionId','legacy','nativeDaily','planningRequest','nativeReviewStatus','draftId','publishedAt','platform','platformSlug'])delete item[key]
  if(original){item.derivedFromCreativeId=original.id;item.copiedFrom={creativeId:original.id,contentHash:creativeDigest(original)}}
  await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months:{...months,[month]:[...(months[month]||[]),item]}}}}})
  const revision=await tx.brandMarketingSolution.create({data:{brandId,kind:CREATIVE_REVISION_KIND,period:revisionPeriod(month,creativeId),version:1,status:'DRAFT',generationMode:'HUMAN_COPY',createdById:userId,input:{creativeId,month,brand:{id:brandId},actor:{id:userId,name:user.nickname||userId,type:'HUMAN'},principals:[],origin:'human',source:revisionSource(item,null,at)},output:item}})
  const output={creativeId,month,revisionId:revision.id,current:item}
  await tx.brandMarketingSolution.create({data:{brandId,kind:'BRAINSTORM_COPY',period:creativeId,version:1,status:'SAVED',generationMode:'HUMAN_COPY',createdById:userId,input:{requestDigest},output}})
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'CREATIVE_REPLICATION_COPIED',resourceType:'BrandCreative',resourceId:creativeId,metadata:{brandId,sourceId,sourceCreativeId:original?.id||null}}})
  return {ok:true,replayed:false,...output}
 },{maxWait:10000,timeout:30000})
}
export async function replicateBrainstorm(userId:string,brandId:string,body:any,db:any=prisma,createTask=createNativeTask){
 if(Object.keys(body).some(k=>!['action','creativeId'].includes(k))||typeof body.creativeId!=='string')throw nativeError('invalid_brainstorm_request',400)
 await authorizeBrainstorm(userId,brandId,true,db)
 const current=await readCreativeRevisions({id:userId,type:'HUMAN'},brandId,'',body.creativeId,undefined,db)
 if(!current.current||!creativeIsSelected(current.current)||current.current?.brandDismissal?.decision==='dislike'||!current.canOverwrite)throw nativeError('brainstorm_source_not_found',404)
 if(current.current.planning?.trim())return {ok:true,creativeId:body.creativeId,alreadyRewritten:true}
 const fixed=current.current.source
 if(!fixed?.inspirationCreativeId||!fixed.sourceRevision||!fixed.sourceDigest)throw nativeError('creative_source_not_found',404)
 const evidence=await fetchCreativeSourceEvidence(fixed.inspirationCreativeId)
 if(evidence.creativeId!==fixed.inspirationCreativeId||evidence.sourceRevision!==fixed.sourceRevision||evidence.sourceDigest!==fixed.sourceDigest)throw nativeError('creative_source_changed',409)
 const requestKey=`brainstorm-${digest([userId,brandId,body.creativeId,current.expectedRevision])}`
 const task=await createTask(userId,brandId,{kind:'creative',creativeId:body.creativeId,month:current.month,expectedRevision:current.expectedRevision,requestKey,goal:'用户已选择复刻此原创意。请读取完整原创意证据与当前品牌已确认事实，保留原脚本爆款机制、完整分镜顺序与节奏，改写为适合当前品牌的完整脚本及完整拍摄说明。仅使用真实品牌及商品事实，未知信息明确标注。产出候选供用户 Review，不自动采用、制作或发布。'})
 return {ok:true,id:task.id,creativeId:body.creativeId,month:current.month}
}
export async function brainstormVideo(userId:string,brandId:string,sourceId:string,signal?:AbortSignal,db:any=prisma,range?:string|null,thumbnail=false){
 await authorizeBrainstorm(userId,brandId,false,db)
 const [saved,choices]=await Promise.all([feed(db,brandId,true),decisions(db,brandId,[sourceId])])
 const source=saved?.output?.sources?.find((s:any)=>s.inspirationCreativeId===sourceId)||(await poolSources(db,brandId,true)).find((row:any)=>row.source_id===sourceId)?.source
 if(!source||!eligibleBrainstormSource(source)||choices[0]?.input?.decision==='dislike')throw nativeError('brainstorm_source_not_found',404)
 const raw=await fetchCreativeSourceEvidence(sourceId,'media')
 if(raw.creativeId!==sourceId||raw.sourceRevision!==source.sourceRevision||raw.sourceDigest!==source.sourceDigest)throw nativeError('creative_source_changed',409)
 return thumbnail?fetchCreativeSourceThumbnail(raw,signal):streamSourceVideoMedia(raw,signal,range)
}

// Calendar choices also apply to automatically adapted and legacy saved ideas.
export async function dismissCalendarCreative(userId:string,brandId:string,body:any,db:any=prisma){
 if(!body||Object.keys(body).some(k=>!['action','creativeId','expectedRevision'].includes(k))||body.action!=='dismiss'||typeof body.creativeId!=='string'||!body.creativeId||body.creativeId.length>200||!/^[a-f0-9]{64}$/.test(body.expectedRevision||''))throw nativeError('invalid_brainstorm_request',400)
 return db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,true,tx)
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{},select:{id:true}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${brandId} FOR UPDATE`
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=creativeWorkspace(knowledge),months=workspace.publishingCalendar?.months||{}
  const entries=Object.entries(months).flatMap(([month,items]:any)=>Array.isArray(items)?items.filter((i:any)=>i.id===body.creativeId).map((current:any)=>({month,current})):[])
  if(entries.length!==1)throw nativeError('creative_not_found_or_ambiguous',404)
  const {month,current}=entries[0],old=current.brandDismissal
  if(old?.decision==='dislike'&&old.expectedRevision===body.expectedRevision)return {ok:true,replayed:true,creativeId:body.creativeId,month,hiddenCreativeIds:old.hiddenCreativeIds||[body.creativeId],hiddenDraftIds:old.hiddenDraftIds||[]}
  if(old?.decision==='dislike'||creativeDigest(current)!==body.expectedRevision)throw nativeError('creative_revision_conflict',409)
  const candidateIds=[current.inspirationCreativeId,current.source?.inspirationCreativeId,current.nativeSourceSnapshot?.source?.inspirationCreativeId].filter(Boolean)
  if(new Set(candidateIds).size>1)throw nativeError('creative_source_changed',409)
  const sourceId=/^cre_[a-zA-Z0-9_-]+$/.test(candidateIds[0]||'')?candidateIds[0]:undefined
  const hiddenItems=Object.values(months).flat().filter((i:any)=>i.id===body.creativeId||sourceId&&[i.inspirationCreativeId,i.source?.inspirationCreativeId,i.nativeSourceSnapshot?.source?.inspirationCreativeId].includes(sourceId)) as any[]
  const hiddenCreativeIds=hiddenItems.map(i=>i.id),draftIds=hiddenItems.map(i=>i.calendarSelection?.draftId).filter(Boolean),hiddenDraftIds:string[]=[]
  // Only untouched selection placeholders are archived. Real drafts, media,
  // schedules and published content are never changed by this preference.
  if(draftIds.length){
   const drafts=await tx.contentDraft.findMany({where:{brandId,id:{in:draftIds},status:'planned_unimplemented',scheduledAt:null,publishedAt:null,mediaUrls:{isEmpty:true}},select:{id:true,caption:true,agentNote:true}})
   for(const draft of drafts){
    const owner=hiddenItems.find(i=>i.calendarSelection?.draftId===draft.id)
    if(!owner||draft.caption!==`内容创意：${owner.title}`||!hasCreativeDraftMarker(draft.agentNote,'unscheduled',owner.id))continue
    const result=await tx.contentDraft.updateMany({where:{id:draft.id,brandId,status:'planned_unimplemented',caption:draft.caption,agentNote:draft.agentNote,scheduledAt:null,publishedAt:null,mediaUrls:{isEmpty:true}},data:{status:'archived'}})
    if(result.count)hiddenDraftIds.push(draft.id)
   }
  }

  const next={...current,brandDismissal:{decision:'dislike',by:userId,at:new Date().toISOString(),expectedRevision:body.expectedRevision,sourceId:sourceId||null,hiddenCreativeIds,hiddenDraftIds}}
  await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months:Object.fromEntries(Object.entries(months).map(([bucket,items]:any)=>[bucket,Array.isArray(items)?items.map((i:any)=>i.id===body.creativeId?next:sourceId&&[i.inspirationCreativeId,i.source?.inspirationCreativeId,i.nativeSourceSnapshot?.source?.inspirationCreativeId].includes(sourceId)?{...i,brandDismissal:next.brandDismissal}:i):items]))}}}})
  if(sourceId){
   const prior=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:BRAINSTORM_DECISION,period:sourceId},orderBy:{version:'desc'}})
   await tx.brandMarketingSolution.create({data:{brandId,kind:BRAINSTORM_DECISION,period:sourceId,version:(prior?.version||0)+1,status:'SAVED',generationMode:'HUMAN_CHOICE',createdById:userId,input:{decision:'dislike',sourceDigest:current.source?.sourceDigest||current.nativeSourceSnapshot?.source?.sourceDigest||null},output:{decision:'dislike',sourceId,creativeId:body.creativeId,month}}})
  }
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'CALENDAR_CREATIVE_DISLIKED',resourceType:'BrandCreative',resourceId:body.creativeId,metadata:{brandId,month,sourceId:sourceId||null,expectedRevision:body.expectedRevision,hiddenDraftIds}}})
  return {ok:true,replayed:false,creativeId:body.creativeId,month,hiddenCreativeIds,hiddenDraftIds}
 })
}

/** One durable, idempotent step per request lets the browser append each real match. */
export async function loadMoreBrainstorm(userId:string,brandId:string,body:any,db:any=prisma,match=matchPromotionStrategyCreativeCandidates){
 if(!body||Object.keys(body).some(k=>!['action','requestKey'].includes(k))||! /^[a-zA-Z0-9_-]{16,100}$/.test(body.requestKey||''))throw nativeError('invalid_brainstorm_request',400)
 await authorizeBrainstorm(userId,brandId,true,db)
 const period=digest([userId,body.requestKey]),receiptWhere={brandId,kind:'BRAINSTORM_MORE',period}
 const replay=await db.brandMarketingSolution.findFirst({where:receiptWhere,orderBy:{version:'desc'}})
 if(replay)return replay.output
 const [previous,rawFacts,state,pool,choices]=await Promise.all([feed(db,brandId),db.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,industry:true,knowledge:{select:{menuItems:true,productAssumptions:true,promotionFocus:true}}}}),browserState(db,brandId,true),poolSources(db,brandId,true),db.brandMarketingSolution.findMany({where:{brandId,kind:BRAINSTORM_DECISION},distinct:['period'],select:{period:true}})])
 if(!rawFacts)throw nativeError('brand_context_unavailable',404)
 const facts={...rawFacts,productCatalog:skuFacts(rawFacts.knowledge?.menuItems)}
 const keywords=previous?.input?.matchKeywords||'',context=brainstormTagContext(facts,keywords)
 const currentKeywords=await fetchBrandKeywords({action:'read',brandId,context})
 const excluded=[...new Set<string>([...(previous?.output?.sources||[]).map((s:any)=>s.inspirationCreativeId),...pool.map((p:any)=>p.source_id),...state.entries.map(({item}:any)=>creativeSourceId(item)),...state.selected,...state.disliked,...choices.map((d:any)=>d.period)].filter(Boolean))]
 if(excluded.length>2000)throw nativeError('brainstorm_history_limit',409)
 const response=await match({...brainstormMatchRequest(facts,keywords,`more-${period}`,excluded),requestedCandidateCount:1})
 if(!Array.isArray(response.creativeCandidates)||(response.contentLibraryGaps||[]).some((g:any)=>Number(g.status)>=400))throw nativeError('content_library_unavailable',503)
 const source:any=response.creativeCandidates.find((s:any)=>eligibleBrainstormSource(s)&&!excluded.includes(s.inspirationCreativeId))
 // A malformed, repeated or unavailable source is not proof of exhaustion.
 if(!source&&response.creativeCandidates.length)throw nativeError('content_library_unavailable',503)
 let item:any=null
 if(source){
  const browse=await fetchBrainstormBrowse([source.inspirationCreativeId],context)
  const evidence:any=browse.items.find((e:any)=>e.creativeId===source.inspirationCreativeId)
  const resolved=await resolveBrainstormVideos([{current:{source},idea:projectBrainstormSource(source,brandId,null)}],brandId,async()=>{if(!evidence?.source)throw Error('original_evidence_unavailable');return evidence.source})
  if(resolved.videoResolutionIncomplete||!resolved.items.length)throw nativeError('original_evidence_unavailable',503)
  item=resolved.items[0]
 }
 // Detect a keyword edit during matching before publishing its result.
 const checked=await fetchBrandKeywords({action:'read',brandId,context})
 if(checked.revision!==currentKeywords.revision)throw nativeError('brainstorm_keywords_changed',409)
 return db.$transaction(async(tx:any)=>{
  await authorizeBrainstorm(userId,brandId,true,tx)
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{},select:{id:true}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
  const receipt=await tx.brandMarketingSolution.findFirst({where:receiptWhere,orderBy:{version:'desc'}})
  if(receipt)return receipt.output
  const latest=await feed(tx,brandId)
  if(latest?.id!==previous?.id)throw nativeError('brainstorm_round_changed',409)
  if(source){
   const sources=[...(latest?.output?.sources||[]),source]
   if(Buffer.byteLength(JSON.stringify(sources))>2*1024*1024)throw nativeError('library_evidence_too_large',413)
   const now=await browserState(tx,brandId,true),decision=await decisions(tx,brandId,[source.inspirationCreativeId])
   if(now.selected.has(source.inspirationCreativeId)||now.disliked.has(source.inspirationCreativeId)||decision.some((d:any)=>['like','dislike'].includes(d.input?.decision)))throw nativeError('brainstorm_round_changed',409)
   await tx.brandMarketingSolution.create({data:{brandId,kind:BRAINSTORM_FEED,period:'sources',version:(latest?.version||0)+1,status:'READY',generationMode:'SOURCE_MATCH',createdById:userId,input:{...latest?.input,matchKeywords:keywords,brandKeywordRevision:currentKeywords.revision,keywordPolicy:BRAINSTORM_KEYWORD_POLICY},output:{sources}}})
  }
  const output={ok:true,brandId,items:item?[item]:[],exhausted:!source}
  await tx.brandMarketingSolution.create({data:{...receiptWhere,version:1,status:'READY',generationMode:'SOURCE_MATCH',createdById:userId,input:{brandKeywordRevision:currentKeywords.revision,contentMatchRequestId:response.contentMatchRequestId},output}})
  return output
 })
}
