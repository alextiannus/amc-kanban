import {nativeHttp} from '@/lib/ai-native/http'
import {actorFor} from '@/lib/ai-native/contract'
import {requireActor} from '@/lib/ai-native/application'
import {createNativeTask,readNativeTask} from '@/lib/ai-native/service'
import {readInterviewInformationSources,interviewInformationTaskBody} from '@/lib/brand-plan/interview-information'
import {prisma} from '@/lib/prisma'
export const dynamic='force-dynamic'
export const maxDuration=90
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,{params}:Context){const {id}=await params;return nativeHttp(request,async userId=>{await requireActor(actorFor(id,userId));const source=await readInterviewInformationSources(id,new URL(request.url).searchParams.get('language')==='en'?'en':'zh');return {sourceRevision:source.sourceRevision,sources:source.sources}})}
export async function POST(request:Request,{params}:Context){const {id}=await params;return nativeHttp(request,async(userId,body)=>{
 await requireActor(actorFor(id,userId))
 const source=await readInterviewInformationSources(id,body.language==='en'?'en':'zh')
 if(body.sourceRevision!==source.sourceRevision)throw Object.assign(Error('interview_sources_changed'),{statusCode:409})
 if(!body.retryOf){
  const existing=await prisma.auditLog.findFirst({where:{actorId:userId,action:'INTERVIEW_INFORMATION_SOURCES',resourceId:{startsWith:`interview-info:${id}:`},metadata:{path:['sourceRevision'],equals:source.sourceRevision}},orderBy:{timestamp:'desc'}})
  if(existing){const saved=existing.metadata as any;return {taskId:saved.taskId,sourceRevision:saved.sourceRevision,sources:saved.sources||source.sources}}
 }
 if(body.retryOf){const previous=await readNativeTask(userId,id,body.retryOf);if(!['failed','cancelled'].includes(previous.status))throw Object.assign(Error('original_task_still_active'),{statusCode:409})}
 const task=await createNativeTask(userId,id,interviewInformationTaskBody(source,body.retryOf))
 const resourceId=`interview-info:${id}:${task.id}`
 if(!await prisma.auditLog.findFirst({where:{resourceId,actorId:userId,action:'INTERVIEW_INFORMATION_SOURCES'}}))await prisma.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'INTERVIEW_INFORMATION_SOURCES',resourceType:'Brand',resourceId,metadata:{brandId:id,taskId:task.id,sourceRevision:source.sourceRevision,sourceHashes:source.sourceHashes,sources:source.sources,skillVersion:source.skillVersion,language:source.language,interviewInput:source.interviewInput}}})
 return {taskId:task.id,sourceRevision:source.sourceRevision,sources:source.sources}
 },2000)}
