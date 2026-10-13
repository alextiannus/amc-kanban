import {prisma} from '../prisma'
import {Prisma} from '@prisma/client'
import {planningRevision,mergePlanningDraft,type PlanningDraft} from './planning-workspace-contract'
/** Caller authenticates the original task owner and validates its persisted artifact. */
export async function savePlanningDraft(userId:string,brandId:string,taskId:string,draft:PlanningDraft){
 return prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${brandId} FOR UPDATE`
  const receiptId=`planning:${brandId}:${taskId}`
  const receipt=await tx.auditLog.findFirst({where:{resourceId:receiptId,action:'PLANNING_DRAFT_ADOPTED',actorId:userId},select:{id:true}})
  if(receipt)return {saved:true,receiptId:receipt.id,replayed:true}
  const knowledge=await tx.brandKnowledge.findUnique({where:{brandId}})
  const current=(knowledge?.marketingSolution||{}) as Record<string,any>
  if(planningRevision(current)!==draft.expectedRevision)throw Object.assign(new Error('planning_revision_conflict'),{code:'planning_revision_conflict',statusCode:409})
  const next=mergePlanningDraft(current,draft,taskId)
  if(knowledge){
   const changed=await tx.brandKnowledge.updateMany({where:{brandId,updatedAt:knowledge.updatedAt,marketingSolution:{equals:knowledge.marketingSolution??Prisma.DbNull}},data:{marketingSolution:next}})
   if(changed.count!==1)throw Object.assign(new Error('planning_revision_conflict'),{code:'planning_revision_conflict',statusCode:409})
  }else await tx.brandKnowledge.create({data:{brandId,marketingSolution:next}})
  if(['annual','quarter'].includes(draft.scope.stage)){
   const kind=draft.scope.stage==='annual'?'ANNUAL':'QUARTERLY',period=draft.scope.stage==='annual'?draft.scope.startMonth:`${draft.scope.startMonth}:Q${draft.scope.quarter!+1}`
   const prior=await tx.brandMarketingSolution.findFirst({where:{brandId,kind,period},orderBy:{version:'desc'},select:{version:true}})
   await tx.brandMarketingSolution.create({data:{brandId,kind,period,version:(prior?.version||0)+1,input:{taskId,scope:draft.scope,skill:'amc-marketing-expert'},output:next.annualPlan,generationMode:'LLM',createdById:userId}})
  }
  const audit=await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'PLANNING_DRAFT_ADOPTED',resourceId:receiptId,resourceType:'BrandMarketingSolution',oldValue:['annual','quarter'].includes(draft.scope.stage)?current.annualPlan||{}:current.coCreation?.[draft.scope.stage]||{},newValue:['annual','quarter'].includes(draft.scope.stage)?next.annualPlan:next.coCreation[draft.scope.stage],metadata:{brandId,taskId,scope:draft.scope}}})
  return {saved:true,receiptId:audit.id,replayed:false}
 })
}
