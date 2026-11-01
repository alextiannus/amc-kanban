import type {Prisma} from "@prisma/client"
import {prisma} from '../prisma'
import {digest,nativeError} from './contract'
import type {InterviewAnswer} from './interview-contract'
const latestArgs=(brandId:string)=>({where:{brandId},orderBy:[{completedAt:'desc' as const},{id:'desc' as const}]})
export async function readConversationInterview(brandId:string){
 const row=await prisma.brandPlanInterview.findFirst(latestArgs(brandId))
 return {revision:digest(row?{id:row.id,rawNotes:row.rawNotes,answers:row.answers}:null),interview:row?{id:row.id,rawNotes:row.rawNotes,answers:row.answers,summary:row.summary,updatedAt:row.completedAt.toISOString()}:null,source:'merchant_statements',instructions:'Saved merchant statements, not independently verified research. Read existing positioning and profile separately. Missing interview does not mean those sources are empty.'}
}
export async function saveConversationInterview(args:{brandId:string;userId:string;taskId:string;sourceTaskId?:string;expectedRevision:string;answers:InterviewAnswer[]}){
 const {brandId,userId,taskId,sourceTaskId,expectedRevision,answers}=args
 const resourceId=`chat-interview:${brandId}:${sourceTaskId||taskId}`,inputDigest=digest({answers,sourceTaskId:sourceTaskId||null})
 const result=await prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3000ms'")
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${brandId} FOR UPDATE`
  const existing=await tx.auditLog.findFirst({where:{resourceId,action:'CHAT_INTERVIEW_SAVED',actorId:userId}})
  if(existing){if((existing.metadata as any)?.inputDigest!==inputDigest)throw nativeError('interview_request_reused',409);return existing.newValue as any}
  const current=await tx.brandPlanInterview.findFirst(latestArgs(brandId))
  if(digest(current?{id:current.id,rawNotes:current.rawNotes,answers:current.answers}:null)!==expectedRevision)throw nativeError('interview_revision_conflict',409)
  const previous=Array.isArray(current?.answers)?current!.answers as unknown as InterviewAnswer[]:[]
  const added=answers.filter(a=>!previous.some(p=>p?.question===a.question&&p?.answer===a.answer))
  const rawNotes=[current?.rawNotes,...added.map(a=>`${a.question}\n${a.answer}`)].filter(Boolean).join('\n\n')
  if(rawNotes.length>100000)throw nativeError('interview_notes_limit',409)
  const row=await tx.brandPlanInterview.create({data:{brandId,rawNotes,answers:[...previous,...added],summary:`已记录商家访谈陈述；本轮补充${added.length}项。`}})
  const claim={source:'principal_interview',interviewId:row.id,updatedAt:row.completedAt.toISOString(),summary:row.summary,rawNotes:row.rawNotes,answers:row.answers}
  await tx.brandKnowledge.upsert({where:{brandId},update:{brandClaim:claim},create:{brandId,brandClaim:claim}})
  const receipt={state:'saved',verified:true,interviewId:row.id,savedAt:row.completedAt.toISOString(),addedAnswers:added,answerCount:previous.length+added.length,source:sourceTaskId?'user_confirmed_draft':'user_message'}
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'CHAT_INTERVIEW_SAVED',resourceType:'BrandPlanInterview',resourceId,oldValue:{interviewId:current?.id||null},newValue:receipt,metadata:{brandId,taskId,sourceTaskId:sourceTaskId||null,inputDigest}}})
  return receipt
 },{maxWait:5000,timeout:15000})
 const saved=await prisma.brandPlanInterview.findFirst({where:{id:result.interviewId,brandId}})
 if(!saved)throw nativeError('interview_save_unverified',503)
 return result
}
