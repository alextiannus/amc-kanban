import {prisma} from '../prisma'
import {authorizeBrainstorm,favoriteCandidates} from '../ai-native/brainstorm'
import {nativeError} from '../ai-native/contract'
import {merchantWorkspace} from '../merchant-workspace'
import {writeFavorite} from '../creative-favorites'
import {skuFacts} from '../ai-native/facts'
import {monthAt,nextShootingMonth,shotHash,shootingNeeds,sortShootingNeeds} from './shooting-plan'
const MONTH='SHOOTING_MONTH',REQUEST='SHOOTING_REQUEST'
async function brandLock(tx:any,brandId:string){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'monthly-shooting:'+brandId}))::text`}
export async function listMonthlyShooting(userId:string,brandId:string){
 const {canDecide}=await authorizeBrainstorm(userId,brandId)
 const [brand,months,requests]=await Promise.all([prisma.brand.findUnique({where:{id:brandId},select:{name:true,timezone:true}}),prisma.brandMarketingSolution.findMany({where:{brandId,kind:MONTH},orderBy:{period:'asc'}}),prisma.brandMarketingSolution.findMany({where:{brandId,kind:REQUEST,status:'ACTIVE'},orderBy:{createdAt:'asc'}})])
 const next=nextShootingMonth(months,monthAt(new Date(),brand?.timezone||'Asia/Singapore'))
 return {brandId,brandName:brand?.name||'',canEdit:canDecide,nextMonth:next,months:[...months,...(months.some((m:any)=>m.period===next)?[]:[{id:null,period:next,status:'OPEN',version:0}])].sort((a,b)=>a.period.localeCompare(b.period)).map(m=>({id:m.id,month:m.period,status:m.status,version:m.version,items:sortShootingNeeds(requests.filter((r:any)=>r.period===m.period).flatMap((r:any)=>((r.output as any).items||[]).map((item:any)=>({...item,requestId:r.id,requestVersion:r.version}))))}))}
}
export async function prepareMonthlyShooting(userId:string,brandId:string,body:any){
 if(!body||typeof body.workspaceId!=='string'||!Number.isSafeInteger(body.revision)||body.revision<1)throw nativeError('invalid_shooting_request',400)
 await authorizeBrainstorm(userId,brandId,true)
 const doc=await merchantWorkspace(userId,brandId,{action:'read',id:body.workspaceId})
 if(doc.revision!==body.revision)throw nativeError('workspace_revision_changed',409)
 if(!doc.draft.creativeId)throw nativeError('creative_source_required',400)
 const sourceCandidate=(await favoriteCandidates(userId,brandId,{creativeId:doc.draft.creativeId}))[0]
 if(!sourceCandidate)throw nativeError('brainstorm_source_not_found',404)
 const candidate={...sourceCandidate,idea:{...sourceCandidate.idea,workspace:{id:body.workspaceId,creativeId:doc.draft.creativeId,revision:body.revision,...doc.draft.sourceLineage}}}
 const brand=await prisma.brand.findUnique({where:{id:brandId},select:{timezone:true,knowledge:{select:{menuItems:true}}}})
 const items=shootingNeeds(doc.draft,skuFacts(brand?.knowledge?.menuItems))
 return prisma.$transaction(async(tx:any)=>{
  await brandLock(tx,brandId);await authorizeBrainstorm(userId,brandId,true,tx)
  const receiptId='shoot_receipt_'+shotHash([userId,brandId,body.workspaceId,body.revision]),receipt=await tx.brandMarketingSolution.findUnique({where:{id:receiptId}})
  // A replay deduplicates shooting work, not the user's explicit save action.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'favorites:'+brandId+':'+userId}))::text`
  const favorite=await writeFavorite(tx,userId,brandId,candidate,true)
  if(receipt)return {...receipt.output,favorite,replayed:true}
  const months=await tx.brandMarketingSolution.findMany({where:{brandId,kind:MONTH}}),month=nextShootingMonth(months,monthAt(new Date(),brand?.timezone||'Asia/Singapore')),monthId='shoot_month_'+shotHash([brandId,month])
  const id='shoot_request_'+shotHash([userId,brandId,body.workspaceId,month]),previous=await tx.brandMarketingSolution.findUnique({where:{id}})
  const captured=(previous?.output?.items||[]).filter((i:any)=>i.done),done=new Set(captured.map((i:any)=>i.id)),currentIds=new Set(items.map(i=>i.id))
  // Replace outstanding needs, retaining photographed records as history.
  const merged=[...items.map(item=>({...item,done:done.has(item.id)})),...captured.filter((i:any)=>!currentIds.has(i.id))]
  if(items.length||previous){
   await tx.brandMarketingSolution.upsert({where:{id:monthId},create:{id:monthId,brandId,kind:MONTH,period:month,status:'OPEN',generationMode:'HUMAN_REQUEST',createdById:userId,input:{},output:{}},update:{version:{increment:1}}})
   const output={items:merged,workspaceId:body.workspaceId,revision:body.revision,creativeId:doc.draft.creativeId,sourceId:candidate.idea.sourceId,title:doc.draft.title}
   await tx.brandMarketingSolution.upsert({where:{id},create:{id,brandId,kind:REQUEST,period:month,status:'ACTIVE',generationMode:'HUMAN_REQUEST',createdById:userId,input:{},output},update:{output,version:{increment:1}}})
  }
  const result={month:items.length||previous?month:null,...(items.length||previous?{requestId:id}:{}),count:items.length,favorite}
  await tx.brandMarketingSolution.create({data:{id:receiptId,brandId,kind:'SHOOTING_RECEIPT',period:month,status:'SAVED',generationMode:'HUMAN_REQUEST',createdById:userId,input:{workspaceId:body.workspaceId,revision:body.revision},output:result}})
  return result
 })
}
export async function updateMonthlyShooting(userId:string,brandId:string,body:any){
 await authorizeBrainstorm(userId,brandId,true)
 if(typeof body?.id!=='string'||!body.id||body.id.length>200||!['check','complete'].includes(body?.action)||!Number.isSafeInteger(body.version)||body.version<1)throw nativeError('invalid_shooting_update',400)
 return prisma.$transaction(async(tx:any)=>{
  await brandLock(tx,brandId);await authorizeBrainstorm(userId,brandId,true,tx)
  const row=await tx.brandMarketingSolution.findFirst({where:{id:body.id,brandId,kind:body.action==='check'?REQUEST:MONTH}})
  if(!row)throw nativeError('shooting_not_found',404)
  if(row.version!==body.version)throw nativeError('shooting_changed',409)
  const month=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:MONTH,period:row.period}})
  if(month?.status==='COMPLETED')throw nativeError('shooting_month_completed',409)
  if(body.action==='check'){
   if(typeof body.done!=='boolean'||!row.output.items.some((i:any)=>i.id===body.itemId))throw nativeError('invalid_shooting_item',400)
   await tx.brandMarketingSolution.update({where:{id:row.id},data:{version:{increment:1},output:{...row.output,items:row.output.items.map((i:any)=>i.id===body.itemId?{...i,done:body.done}:i)}}})
  }else{
   const requests=await tx.brandMarketingSolution.findMany({where:{brandId,kind:REQUEST,period:row.period,status:'ACTIVE'}})
   if(!requests.length||requests.some((r:any)=>r.output.items.some((i:any)=>!i.done)))throw nativeError('shooting_items_incomplete',409)
   await tx.brandMarketingSolution.update({where:{id:row.id},data:{status:'COMPLETED',version:{increment:1},output:{completedAt:new Date().toISOString(),completedBy:userId}}})
  }
  return {ok:true,month:row.period}
 })
}
