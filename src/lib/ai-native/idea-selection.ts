import {allows} from '../role-permissions/store'
import {principalFromUser} from '../auth-v2/types'
import {prisma} from '../prisma'
import {requireActor} from './application'
import {actorFor,dailyActorFor,nativeError} from './contract'
import {creativeWorkspace} from '../brand-plan/creativeRevisionContract'
import {creativeDraftMarker,hasCreativeDraftMarker} from '../brand-plan/creativeDraftMarker'
import {canonicalCreativeSource} from '../brand-plan/creativeSourceReference'
import {rankedIdeas,requiredIdeaCount,sourceIdeaSeed,unfinishedDraft} from './idea-selection-policy'

async function authorizeSelection(actor:any){
 await requireActor(actor)
 const user=await prisma.user.findUniqueOrThrow({where:{id:actor.subjectId},include:{businessRoles:true,owner:{include:{businessRoles:true}}}})
 if(!await allows(principalFromUser(user,'session'),'draft.update'))throw nativeError('creative_edit_forbidden',403)
}

// All admissions take the SAME BrandKnowledge row lock used by editing/scheduling.
// No model, media provider or publish endpoint is called here.
export async function admitBrandIdeas(userId:string,brandId:string,ideaId?:string,db:any=prisma,authorize=authorizeSelection,now=new Date()){
 if(ideaId!==undefined&&!/^[a-f0-9-]{36}$/i.test(ideaId))throw nativeError('idea_not_found',404)
 const actor=ideaId?actorFor(brandId,userId):dailyActorFor(brandId,userId)
 await authorize(actor)
 return db.$transaction(async(tx:any)=>{
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,negPrompts:[]},update:{}})
  await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`
  await authorize(actor)
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=creativeWorkspace(knowledge)
  const brand=await tx.brand.findUniqueOrThrow({where:{id:brandId},select:{timezone:true}})
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:brand.timezone||'Asia/Singapore',year:'numeric',month:'2-digit'}).formatToParts(now)
  const month=`${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`
  const months={...(workspace.publishingCalendar?.months||{})}
  const all:any[]=Object.values(months).flat() as any[]
  const drafts=await tx.contentDraft.findMany({where:{brandId},select:{id:true,status:true,scheduledAt:true,publishedAt:true,agentNote:true}})
  if(!ideaId&&drafts.some((draft:any)=>unfinishedDraft(draft,now)))return {ok:true,selected:[],reason:'calendar_not_empty'}
  const request=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:'CREATIVE_MATCH_REQUEST',period:month},orderBy:{version:'desc'}})
  let count=ideaId?1:requiredIdeaCount(request?.input?.frequency||knowledge.publishingFreq||workspace.annualPlan?.publishingFreq,now,brand.timezone||'Asia/Singapore')
  if(!ideaId){const posted=drafts.filter((d:any)=>['published','done'].includes(String(d.status).toLowerCase())&&d.publishedAt&&new Intl.DateTimeFormat('en-CA',{timeZone:brand.timezone||'Asia/Singapore',year:'numeric',month:'2-digit'}).format(new Date(d.publishedAt))===month).length;count=Math.max(0,count-posted)}
  if(!count)return {ok:true,selected:[],reason:'publishing_quantity_not_configured'}
  const rows:any[]=ideaId?await tx.$queryRaw`SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=${brandId} AND id::text=${ideaId} AND (replaced_at IS NULL OR selected_at IS NOT NULL) FOR UPDATE`:await tx.$queryRaw`SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=${brandId} AND replaced_at IS NULL ORDER BY created_at,id FOR UPDATE`
  if(ideaId&&!rows.length)throw nativeError('idea_not_found',404)
  const selected:any[]=[]
  const candidates=ideaId?rows:rows.filter(row=>!all.some(i=>(i.nativeDaily?.poolIdeaId===row.id||i.inspirationCreativeId===row.source_id)&&(i.calendarSelection?.draftId||i.schedule?.draftId)))
  for(const row of rankedIdeas(candidates).slice(0,count)){
   let item=all.find(i=>i.id===`pool_${row.id}`||i.nativeDaily?.poolIdeaId===row.id||i.inspirationCreativeId===row.source_id)
   let bucket=item?Object.keys(months).find(m=>months[m].includes(item))!:month
   if(item?.calendarSelection?.draftId){selected.push({id:row.id,creativeId:item.id,month:bucket,draftId:item.calendarSelection.draftId,replayed:true});continue}
   if(item?.schedule?.draftId){selected.push({id:row.id,creativeId:item.id,month:bucket,draftId:item.schedule.draftId,replayed:true});continue}
   if(!item){item=sourceIdeaSeed(brandId,row,now);item.source=canonicalCreativeSource(row.source,row.source_id,now.toISOString(),{contentMatchRequestId:row.match_id});months[bucket]=[...(months[bucket]||[]),item];all.push(item)}
   // A source reference is deliberately NOT copied into publishable caption/script.
   const prior=drafts.filter((d:any)=>hasCreativeDraftMarker(d.agentNote,'unscheduled',item.id))
   if(prior.length>1)throw nativeError('creative_schedule_draft_ambiguous',409)
   const draft=prior[0]||await tx.contentDraft.create({data:{brandId,caption:`内容创意：${item.title}`,captionLang:'zh',mediaUrls:[],hashtags:[],scheduledAt:null,status:'planned_unimplemented',agentNote:creativeDraftMarker('unscheduled',item.id)}})
   const next={...item,calendarSelection:{draftId:draft.id,reason:ideaId?'like':'empty_calendar',selectedBy:userId,selectedAt:now.toISOString()},updatedAt:now.toISOString()}
   months[bucket]=months[bucket].map((i:any)=>i.id===item.id?next:i)
   await tx.$executeRaw`UPDATE amc_iaic.brand_ideas SET selected_at=COALESCE(selected_at,${now}),plan_id=${item.id},plan_month=${bucket} WHERE id::text=${row.id} AND brand_id=${brandId}`
   await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'BRAND_IDEA_SELECTED',resourceType:'BrandCreative',resourceId:item.id,metadata:{brandId,reason:ideaId?'like':'empty_calendar',ideaId:row.id,draftId:draft.id,scheduledAt:null}}})
   selected.push({id:row.id,creativeId:item.id,month:bucket,draftId:draft.id,replayed:false})
  }
  if(selected.some(i=>!i.replayed))await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months}}}})
  return {ok:true,selected,reason:ideaId?'like':'empty_calendar'}
 })
}
