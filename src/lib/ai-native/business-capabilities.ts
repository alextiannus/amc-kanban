import type {Prisma} from '@prisma/client'
import {defineCapability} from '@immedi/iaic-core/capabilities/index.js'
import {prisma} from '../prisma'
import {brandFor,digest,nativeError,type NativeActor,type NativeIntent} from './contract'
import {businessTool,businessArguments,listBusinessTools,callBusinessTool,businessAllowed} from './business-tools'
export const BUSINESS_CAPABILITIES=['amc.business.catalog','amc.business.read','amc.business.write']
export async function durableBusinessWrite(actor:NativeActor,taskId:string,tool:string,args:Record<string,unknown>,execute=callBusinessTool){
 businessArguments(actor,args)
 const resourceId='chat-business:'+digest([brandFor(actor),actor.subjectId,taskId,tool,args])
 const reservation=await prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${resourceId},0))`
  const old=await tx.auditLog.findFirst({where:{resourceId,action:'CHAT_BUSINESS_ACTION',actorId:actor.subjectId}})
  if(old)return {old:old.newValue as any,id:old.id}
  const row=await tx.auditLog.create({data:{actorId:actor.subjectId,actorType:'HUMAN',action:'CHAT_BUSINESS_ACTION',resourceType:'Brand',resourceId,metadata:JSON.parse(JSON.stringify({brandId:brandFor(actor),taskId,tool,args})),newValue:{state:'unknown',verified:false,tool,instructions:'Original action outcome is not yet known. Read the affected resource; do not submit again.'}}})
  return {id:row.id}
 },{maxWait:5000,timeout:10000})
 if(reservation.old)return reservation.old
 try{
  const result=await execute(actor,tool,args),receipt={state:result.isError?'failed':result.outcomeUnknown?'unknown':'returned',verified:!result.isError&&!result.outcomeUnknown,tool,result,instructions:'This is the original tool result. Check its business status: accepted/running is not completed, and saved draft is not published.'}
  await prisma.auditLog.update({where:{id:reservation.id},data:{newValue:receipt}})
  return receipt
 }catch{return {state:'unknown',verified:false,tool,instructions:'Outcome uncertain; original action retained. Read the original resource before any new attempt. Do not claim success or automatically repeat.'}}
}
export function businessCapabilities(getIntent:(actor:NativeActor,id?:string)=>Promise<NativeIntent>,authorize:(actor:NativeActor)=>Promise<boolean>){
 const check=async(actor:NativeActor,id?:string)=>{const intent=await getIntent(actor,id);if(!id||intent.kind!=='conversation'||intent.brandId!==brandFor(actor)||!await authorize(actor))throw nativeError('conversation_task_required',403)}
 return [defineCapability({name:BUSINESS_CAPABILITIES[0],description:'Discover exact authorized system tools and schemas for research, content drafts, assets, publishing recommendations, reviews or video production. Read before using business tools. Data collection happens here in chat, not in forms.',effect:'read',authorize,input:{type:'object',properties:{group:{type:'string',enum:['research','content','assets','publishing','reviews','video']}},additionalProperties:false},output:{type:'object'},implementation:{kind:'function',execute:async(input:any,{actor,taskId})=>{await check(actor as NativeActor,taskId);return listBusinessTools(actor as NativeActor,input.group)}},revalidate:async(input:any,_previous,{actor,taskId})=>{await check(actor as NativeActor,taskId);return listBusinessTools(actor as NativeActor,input.group)}}),
 ...(['read','write'] as const).map(effect=>defineCapability({name:'amc.business.'+effect,description:effect==='read'?'Read a resource using an exact tool/schema from amc.business.catalog.':'Execute a requested business write from amc.business.catalog. Reuse facts, ask missing inputs in chat. Each exact operation is durable and cannot silently repeat. Video tools prepare drafts and return human confirmation links for paid generation/final approval; only the signed-in user confirms. Does not expose publication, deletion, credentials or unapproved video generation.',effect,retry:'idempotent',authorize:async(actor:NativeActor,input:any)=>await authorize(actor)&&await businessAllowed(actor,input.tool,input.arguments),input:{type:'object',properties:{tool:{type:'string'},arguments:{type:'object'}},required:['tool','arguments'],additionalProperties:false},output:{type:'object'},implementation:{kind:'function',execute:async(input:any,{actor,taskId})=>{await check(actor as NativeActor,taskId);if(businessTool(input.tool).effect!==effect)throw nativeError('business_effect_mismatch',422);return effect==='read'?callBusinessTool(actor as NativeActor,input.tool,input.arguments):durableBusinessWrite(actor as NativeActor,taskId!,input.tool,input.arguments)}},...(effect==='read'?{revalidate:async(input:any,_previous:any,{actor,taskId}:any)=>{await check(actor,taskId);if(businessTool(input.tool).effect!=='read')throw nativeError('business_effect_mismatch',422);if(!await businessAllowed(actor,input.tool,input.arguments))throw nativeError('business_action_denied',403);return input.tool.startsWith('video_')?callBusinessTool(actor,input.tool,input.arguments):_previous}}:{revalidate:async(input:any,previous:any,{actor,taskId}:any)=>{await check(actor,taskId);if(businessTool(input.tool).effect!=='write'||!await businessAllowed(actor,input.tool,input.arguments))throw nativeError('business_action_denied',403);return previous}})}))]
}
