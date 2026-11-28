import {prisma} from '../prisma'
import {projectUnderstanding,reduceUnderstanding,understandingRevision,type UnderstandingPatch} from './brand-understanding'
const error=(code:string,statusCode=409)=>Object.assign(new Error(code),{code,statusCode})
/** Caller revalidates the real user/brand/task before access. No new memory database. */
export async function readBrandUnderstanding(brandId:string,db:any=prisma){
 const [knowledge,brand]=await Promise.all([db.brandKnowledge.findUnique({where:{brandId},select:{marketingSolution:true}}),db.brand.findUnique({where:{id:brandId},select:{timezone:true}})])
 return {brandId,...projectUnderstanding((knowledge?.marketingSolution as any)?.brandUnderstanding,undefined,brand?.timezone)}
}
export async function saveBrandUnderstanding(args:{brandId:string;userId:string;taskId:string;previousTaskId?:string;goal:string;expectedRevision:string;patch:UnderstandingPatch},db:any=prisma){
 const resourceId=`brand-understanding:${args.brandId}:${args.userId}:${args.taskId}:${understandingRevision({entries:[args.patch],plans:[]})}`
 const receipt=await db.$transaction(async(tx:any)=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3000ms'")
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${args.brandId} FOR UPDATE`
  const existing=await tx.auditLog.findFirst({where:{actorId:args.userId,resourceId,action:'BRAND_UNDERSTANDING_SAVED'}})
  if(existing)return existing.newValue
  const brand=await tx.brand.findUnique({where:{id:args.brandId},select:{id:true,timezone:true}})
  if(!brand)throw error('brand_not_found',404)
  const row=await tx.brandKnowledge.findUnique({where:{brandId:args.brandId}}),solution=row?.marketingSolution as any||{},before=solution.brandUnderstanding
  if(understandingRevision(before)!==args.expectedRevision)throw error('brand_understanding_changed_read_again')
  const now=new Date().toISOString(),next=reduceUnderstanding(before,args.patch,{goal:args.goal,userId:args.userId,taskId:args.taskId,previousTaskId:args.previousTaskId,timeZone:brand.timezone,now})
  const revision=understandingRevision(next),result={state:'saved',verified:true,brandId:args.brandId,revision,savedAt:now,entries:next.entries.filter(e=>e.taskId===args.taskId).map(e=>({key:e.key,status:e.status})),months:next.plans.filter(p=>p.taskId===args.taskId||p.proposal?.taskId===args.taskId).map(p=>({month:p.month,status:p.proposal?.taskId===args.taskId?'proposed':p.status}))}
  await tx.brandKnowledge.upsert({where:{brandId:args.brandId},create:{brandId:args.brandId,marketingSolution:{...solution,brandUnderstanding:next}},update:{marketingSolution:{...solution,brandUnderstanding:next}}})
  await tx.auditLog.create({data:{actorId:args.userId,actorType:'HUMAN',action:'BRAND_UNDERSTANDING_SAVED',resourceType:'BrandKnowledge',resourceId,oldValue:before||{},newValue:result,metadata:{brandId:args.brandId,taskId:args.taskId,before:before||{},after:next}}})
  return result
 },{maxWait:5000,timeout:15000})
 const audit=await db.auditLog.findFirst({where:{actorId:args.userId,resourceId,action:'BRAND_UNDERSTANDING_SAVED'}})
 if(!audit||audit.newValue?.revision!==receipt.revision)throw error('brand_understanding_save_unverified',503)
 const current=await readBrandUnderstanding(args.brandId,db)
 return {...receipt,current:current.revision===receipt.revision}
}
export function brandUnderstandingReceipt(calls:readonly any[]){return calls.findLast(c=>c.capability==='amc.brand_understanding.save'&&c.status==='succeeded'&&c.result?.state==='saved'&&c.result?.verified===true)?.result||null}
