import { prisma } from '../prisma'
import { brandFor, digest, type NativeActor } from './contract'
import { principalFromUser } from '../auth-v2/types'
import { allows } from '../role-permissions/store'
export async function canReadOperations(actor:NativeActor){
  const user=await prisma.user.findUnique({where:{id:actor.subjectId},include:{businessRoles:true,owner:{include:{businessRoles:true}}}})
  return !!user&&user.status==='ACTIVE'&&await allows(principalFromUser(user,'session'),'draft.read')&&await allows(principalFromUser(user,'session'),'brand.read')
}
export async function brandOperations(actor:NativeActor){
  const brandId=brandFor(actor)
  const [accounts,drafts,counts,accountTotal]=await prisma.$transaction([
    prisma.socialAccount.findMany({where:{brandId,unboundAt:null},select:{id:true,platformId:true,displayName:true,handle:true,autoPilot:true},orderBy:{id:'asc'},take:100}),
    prisma.contentDraft.findMany({where:{brandId},select:{id:true,status:true,caption:true,scheduledAt:true,publishedAt:true,updatedAt:true},orderBy:[{updatedAt:'desc'},{id:'asc'}],take:30}),
    prisma.contentDraft.groupBy({by:['status'],where:{brandId},orderBy:{status:'asc'},_count:true}),
    prisma.socialAccount.count({where:{brandId,unboundAt:null}}),
  ],{isolationLevel:'RepeatableRead'})
  const data={brandId,accountTotal,draftTotal:counts.reduce((total:number,row:{_count:number})=>total+row._count,0),accounts,drafts:drafts.map((d:any)=>({...d,caption:d.caption?.slice(0,500)||''})),counts,scope:{drafts:'latest 30 updated records; captions truncated at 500 characters',accounts:'first 100 current accounts',counts:'all current database draft status counts; draftTotal and accountTotal are exact recorded totals, including known zero. No claim of verified external delivery or revenue'}}
  return {...JSON.parse(JSON.stringify(data)),operationsDigest:digest(data),retrievedAt:new Date().toISOString()}
}
