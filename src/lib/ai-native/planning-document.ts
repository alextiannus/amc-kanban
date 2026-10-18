import type {Prisma} from '@prisma/client'
import {prisma} from '../prisma'
import {planningRevision,planningInputVersions,planningInputsMatch} from './planning-workspace-contract'
const reject=(code:string,statusCode=400)=>{throw Object.assign(Error(code),{statusCode})}
/** Latest saved document is usable immediately. Legacy confirm requests remain compatible. */
export async function savePlanningDocument(brandId:string,userId:string,input:any){
 if(input?.stage==='execution_checklist'&&input.action==='toggle')return toggleExecutionTask(brandId,userId,input)
 if(!['interview','direction','marketing_plan','principal_strategy'].includes(input.stage)||!['save','confirm'].includes(input.action)||typeof input.content!=='string'||!input.content.trim()||input.content.length>24000||!/^[a-f0-9]{64}$/.test(input.expectedRevision||''))return reject('invalid_planning_document')
 return prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${brandId} FOR UPDATE`
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),current=(knowledge?.marketingSolution||{}) as any
  const key=input.stage,old=current.coCreation?.[key]
  if(planningRevision(current)!==input.expectedRevision){
   if(old?.content===input.content&&old?.lastRequestKey===input.requestKey&&typeof input.requestKey==='string')return {revision:planningRevision(current),document:old,replayed:true}
   return reject('planning_revision_conflict',409)
  }
  const now=new Date().toISOString()
  const attachmentIds=Array.isArray(input.attachmentIds)?input.attachmentIds:old?.attachmentIds||[]
  if(attachmentIds.length>20||attachmentIds.some((v:unknown)=>typeof v!=='string'))return reject('invalid_attachments')
  const assets=await tx.mediaAsset.findMany({where:{brandId,id:{in:attachmentIds}},select:{id:true}})
  if(new Set(attachmentIds).size!==assets.length)return reject('attachment_not_found',404)
  const sameContent=old?.content===input.content
  const document={...old,title:old?.title||(key==='interview'?'品牌定位':key==='principal_strategy'?'主理人策略输入':key==='direction'?'营销方向与卖点':'品牌营销策划'),content:input.content,attachmentIds,status:'active',updatedAt:now,updatedBy:userId,lastRequestKey:typeof input.requestKey==='string'?input.requestKey:null,...(key==='direction'?{inputVersions:{interview:planningRevision(current.coCreation?.interview||null)}}:{}),confirmedAt:input.action==='confirm'?now:null,confirmedBy:input.action==='confirm'?userId:null}
  const next={...current,coCreation:{...current.coCreation,[key]:document}}
  if(key==='marketing_plan')next.marketingPlan={...current.marketingPlan,inputVersions:planningInputVersions(current),planningStartMonth:current.marketingPlan?.planningStartMonth||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-'),content:input.content,status:document.status,structuredDataStale:current.marketingPlan?.structuredDataStale||!sameContent,confirmedAt:document.confirmedAt,confirmedBy:document.confirmedBy}
  if(key==='marketing_plan'){
   const period=next.marketingPlan.planningStartMonth
   const prior=await tx.brandMarketingSolution.findFirst({where:{brandId,kind:'MARKETING_PLAN',period},orderBy:{version:'desc'},select:{version:true}})
   await tx.brandMarketingSolution.create({data:{brandId,kind:'MARKETING_PLAN',period,status:'ACTIVE',version:(prior?.version||0)+1,input:{...next.marketingPlan.provenance,inputVersions:next.marketingPlan.inputVersions},output:next.marketingPlan,generationMode:'HUMAN_EDITED',createdById:userId}})
  }
  await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,marketingSolution:next},update:{marketingSolution:next}})
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:input.action==='confirm'?'PLANNING_DOCUMENT_CONFIRMED':'PLANNING_DOCUMENT_SAVED',resourceType:'BrandMarketingSolution',resourceId:brandId,oldValue:old||{},newValue:document,metadata:{stage:key,expectedRevision:input.expectedRevision}}})
  return {revision:planningRevision(next),document}
 })
}

async function toggleExecutionTask(brandId:string,userId:string,input:any){
 if(typeof input.itemId!=='string'||typeof input.completed!=='boolean'||!/^[a-f0-9]{64}$/.test(input.expectedRevision||''))return reject('invalid_execution_update')
 return prisma.$transaction(async(tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${brandId} FOR UPDATE`
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}}),current=(knowledge?.marketingSolution||{}) as any
  if(planningRevision(current)!==input.expectedRevision)return reject('planning_revision_conflict',409)
  const prior=current.executionChecklist,old=prior?.items?.find((v:any)=>v.id===input.itemId)
  if(!old)return reject('execution_task_not_found',404)
  if(old.completed===input.completed)return {revision:planningRevision(current)}
  const now=new Date().toISOString(),item={...old,completed:input.completed,completedAt:input.completed?now:null,completedBy:input.completed?userId:null}
  const next={...current,executionChecklist:{...prior,items:prior.items.map((v:any)=>v.id===item.id?item:v),updatedAt:now}}
  await tx.brandKnowledge.update({where:{brandId},data:{marketingSolution:next}})
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'PLANNING_EXECUTION_TASK_UPDATED',resourceType:'BrandMarketingSolution',resourceId:brandId,oldValue:old,newValue:item,metadata:{stage:'execution_checklist'}}})
  return {revision:planningRevision(next)}
 })
}
