import {readDislikedCreativeSources,CREATIVE_SELECTION_POLICY,creativeIsSelected,creativeSourceId} from '../brand-plan/creativeVisibility'
import {allows} from '../role-permissions/store'
import {principalFromUser} from '../auth-v2/types'
import {prisma} from '../prisma'
import {requireActor} from './application'
import {actorFor,nativeError} from './contract'
import {creativeWorkspace} from '../brand-plan/creativeRevisionContract'
import {canonicalCreativeSource} from '../brand-plan/creativeSourceReference'
import {matchScore,rankedIdeas,sourceIdeaSeed} from './idea-selection-policy'

async function authorizeSelection(actor:any){
 await requireActor(actor)
 const user=await prisma.user.findUniqueOrThrow({where:{id:actor.subjectId},include:{businessRoles:true,owner:{include:{businessRoles:true}}}})
 if(!await allows(principalFromUser(user,'session'),'draft.update'))throw nativeError('creative_edit_forbidden',403)
}

// All admissions take the SAME BrandKnowledge row lock used by editing/scheduling.
// No model, media provider or publish endpoint is called here.
export async function admitBrandIdeas(userId:string,brandId:string,ideaId?:string,db:any=prisma,authorize=authorizeSelection,now=new Date()){
 if(ideaId!==undefined&&!/^[a-f0-9-]{36}$/i.test(ideaId))throw nativeError('idea_not_found',404)
 // Matching scores never authorize calendar admission or model work.
 if(ideaId===undefined)return {ok:true,selected:[],reason:'human_choice_required'}
 const actor=actorFor(brandId,userId)
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
  const rows:any[]=await tx.$queryRaw`SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=${brandId} AND id::text=${ideaId} AND (replaced_at IS NULL OR selected_at IS NOT NULL) FOR UPDATE`
  if(!rows.length)throw nativeError('idea_not_found',404)
  const selected:any[]=[]
  const disliked=await readDislikedCreativeSources(tx,brandId,workspace),visibleRows=rows.filter(row=>!disliked.has(row.source_id));if(!visibleRows.length)throw nativeError('idea_not_found',404)
  const candidates=visibleRows.filter(row=>(matchScore(row)??-Infinity)>75)
  if(!candidates.length)throw nativeError('idea_not_found',404)
  for(const row of rankedIdeas(candidates)){
   let item=all.find(i=>i.id===`pool_${row.id}`||i.nativeDaily?.poolIdeaId===row.id||creativeSourceId(i)===row.source_id)
   let bucket=item?Object.keys(months).find(m=>months[m].includes(item))!:month
   if(creativeIsSelected(item)){selected.push({id:row.id,creativeId:item.id,month:bucket,draftId:item.schedule?.draftId||item.calendarSelection?.draftId||null,replayed:true});continue}
   if(!item){
    item=sourceIdeaSeed(brandId,row,now);item.source=canonicalCreativeSource(row.source,row.source_id,now.toISOString(),{contentMatchRequestId:row.match_id})
    delete item.adaptationStatus;delete item.skuDecision
    item.brainstorm={sourceId:row.source_id,matchScore:row.source.matchScore,likedBy:userId,likedAt:now.toISOString()}
    months[bucket]=[...(months[bucket]||[]),item];all.push(item)
   }
   // Like persists only the choice. Actual draft creation belongs to production/scheduling.
   const draftId=item.schedule?.draftId||item.calendarSelection?.draftId||null
   const next={...item,creativeBrowserSelection:{policy:CREATIVE_SELECTION_POLICY,reason:'like',by:userId,at:now.toISOString()},updatedAt:now.toISOString()}
   months[bucket]=months[bucket].map((i:any)=>i.id===item.id?next:i)
   await tx.$executeRaw`UPDATE amc_iaic.brand_ideas SET selected_at=COALESCE(selected_at,${now}),plan_id=${item.id},plan_month=${bucket} WHERE id::text=${row.id} AND brand_id=${brandId}`
   await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'BRAND_IDEA_SELECTED',resourceType:'BrandCreative',resourceId:item.id,metadata:{brandId,reason:'like',ideaId:row.id,draftId,scheduledAt:null}}})
   selected.push({id:row.id,creativeId:item.id,month:bucket,draftId,replayed:false})
  }
  if(selected.some(i=>!i.replayed))await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...workspace,publishingCalendar:{...workspace.publishingCalendar,months}}}})
  return {ok:true,selected,reason:'like'}
 })
}
