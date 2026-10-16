import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import type {Prisma} from '@prisma/client'
import {prisma} from '../prisma.ts'
import {canUserAccessBrand} from '../user-management/brandAccess.ts'
import {CREATIVE_REVISION_KIND,CreativeRevisionError,record,stableJson} from './creativeRevisionContract.ts'
import {readVideoFeedback,type VideoFeedback,VIDEO_EDIT_FEEDBACK_KIND,VIDEO_FEEDBACK_MAX_BYTES} from './revisionFeedback.ts'

export {VIDEO_EDIT_FEEDBACK_KIND} from './revisionFeedback.ts'
export const VIDEO_FEEDBACK_EVENT_SCHEMA='video_feedback_event@1'
export const VIDEO_FEEDBACK_EVENT_MAX_BYTES=VIDEO_FEEDBACK_MAX_BYTES+4096
export const VIDEO_FEEDBACK_EVENT_FRESHNESS_MS=5*60*1000

type VideoFeedbackEventCore={schema:typeof VIDEO_FEEDBACK_EVENT_SCHEMA;eventId:string;projectId:string;brandId:string;creativeId:string;creativeRevisionId:string;actorId:string;issuedAt:string;feedback:VideoFeedback}
export type SignedVideoFeedbackEvent=VideoFeedbackEventCore&{digest:string;signature:string}

const allowedKeys=['schema','eventId','projectId','brandId','creativeId','creativeRevisionId','actorId','issuedAt','feedback','digest','signature']
const id=(value:unknown):value is string=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=200&&!/[\u0000-\u001f]/.test(value)&&!['__proto__','constructor','prototype'].includes(value)
const hex=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const equalHex=(left:string,right:string)=>{const a=Buffer.from(left,'hex'),b=Buffer.from(right,'hex');return a.length===b.length&&timingSafeEqual(a,b)}

export function videoFeedbackEventCore(value:unknown,now=new Date()):VideoFeedbackEventCore{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CreativeRevisionError('invalid_video_feedback_event')
  const input=value as Record<string,unknown>
  if(Object.keys(input).length!==allowedKeys.length||Object.keys(input).some(key=>!allowedKeys.includes(key))||input.schema!==VIDEO_FEEDBACK_EVENT_SCHEMA)throw new CreativeRevisionError('invalid_video_feedback_event')
  for(const key of ['eventId','projectId','brandId','creativeId','creativeRevisionId','actorId'] as const)if(!id(input[key]))throw new CreativeRevisionError('invalid_video_feedback_event')
  if(typeof input.issuedAt!=='string')throw new CreativeRevisionError('invalid_video_feedback_event')
  const issuedAt=new Date(input.issuedAt)
  if(!Number.isFinite(issuedAt.getTime())||issuedAt.toISOString()!==input.issuedAt||Math.abs(now.getTime()-issuedAt.getTime())>VIDEO_FEEDBACK_EVENT_FRESHNESS_MS)throw new CreativeRevisionError('video_feedback_event_stale',409)
  const feedback=readVideoFeedback(input.feedback)
  if(!feedback)throw new CreativeRevisionError('invalid_video_feedback_event')
  return {schema:VIDEO_FEEDBACK_EVENT_SCHEMA,eventId:input.eventId as string,projectId:input.projectId as string,brandId:input.brandId as string,creativeId:input.creativeId as string,creativeRevisionId:input.creativeRevisionId as string,actorId:input.actorId as string,issuedAt:input.issuedAt,feedback}
}

export function videoFeedbackEventDigest(core:VideoFeedbackEventCore){return createHash('sha256').update(stableJson(core)).digest('hex')}
export function videoFeedbackEventSignature(core:VideoFeedbackEventCore,token:string,digest=videoFeedbackEventDigest(core)){return createHmac('sha256',token).update(`${core.schema}\n${core.eventId}\n${core.issuedAt}\n${digest}`).digest('hex')}
export function verifyVideoFeedbackEvent(value:unknown,token:string,now=new Date()):SignedVideoFeedbackEvent{
  if(!token)throw new CreativeRevisionError('video_feedback_service_unconfigured',503)
  const core=videoFeedbackEventCore(value,now),input=value as Record<string,unknown>
  if(!hex(input.digest)||!hex(input.signature))throw new CreativeRevisionError('invalid_video_feedback_signature',401)
  const digest=videoFeedbackEventDigest(core),signature=videoFeedbackEventSignature(core,token,digest)
  if(!equalHex(input.digest,digest)||!equalHex(input.signature,signature))throw new CreativeRevisionError('invalid_video_feedback_signature',401)
  return {...core,digest,signature}
}

export async function ingestTrustedVideoFeedback(value:unknown,token:string,now=new Date(),db:any=prisma){
  const event=verifyVideoFeedbackEvent(value,token,now)
  return db.$transaction(async(tx:Prisma.TransactionClient)=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'video-feedback:'+event.eventId}))::text`
    await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id"=${event.brandId} FOR UPDATE`
    const [actor,brand]=await Promise.all([tx.user.findUnique({where:{id:event.actorId},select:{id:true,type:true,status:true}}),tx.brand.findUnique({where:{id:event.brandId},select:{id:true,status:true}})])
    if(actor?.status!=='ACTIVE'||brand?.status!=='ACTIVE'||!await canUserAccessBrand(event.brandId,event.actorId,'WRITE',tx))throw new CreativeRevisionError('video_feedback_access_denied',404)
    const [revision,jobs]=await Promise.all([
      tx.brandMarketingSolution.findFirst({where:{id:event.creativeRevisionId,brandId:event.brandId,kind:CREATIVE_REVISION_KIND}}),
      tx.videoProductionJob.findMany({where:{brandId:event.brandId,creativeId:event.creativeId,createdBy:event.actorId,OR:[{id:event.projectId},{plan:{path:['basicVideoProjectId'],equals:event.projectId}},{plan:{path:['_mmVideoJob','basicVideoProjectId'],equals:event.projectId}}]},select:{id:true,plan:true},take:2}),
    ])
    const revisionInput=record(revision?.input),job=jobs.length===1?jobs[0]:null,metadata=record(record(job?.plan)._mmVideoJob),editor=record(metadata.editor)
    if(!revision||revisionInput.creativeId!==event.creativeId||!job||editor.creativeId!==event.creativeId||editor.creativeRevisionId!==event.creativeRevisionId)throw new CreativeRevisionError('video_feedback_binding_not_found',404)
    const existing=await tx.brandMarketingSolution.findFirst({where:{kind:VIDEO_EDIT_FEEDBACK_KIND,period:event.eventId}})
    if(existing){
      if(existing.brandId!==event.brandId||record(existing.input).digest!==event.digest)throw new CreativeRevisionError('video_feedback_event_conflict',409)
      return {ok:true,replayed:true,receipt:{eventId:event.eventId,digest:event.digest,recordId:existing.id,createdAt:existing.createdAt.toISOString()}}
    }
    const row=await tx.brandMarketingSolution.create({data:{brandId:event.brandId,kind:VIDEO_EDIT_FEEDBACK_KIND,period:event.eventId,version:1,status:'RECORDED',generationMode:'TRUSTED_VIDEO_FEEDBACK',createdById:event.actorId,input:{schema:event.schema,eventId:event.eventId,projectId:event.projectId,creativeId:event.creativeId,creativeRevisionId:event.creativeRevisionId,actor:{id:event.actorId,type:actor.type},issuedAt:event.issuedAt,digest:event.digest,videoFeedback:event.feedback as any},output:{}}})
    return {ok:true,replayed:false,receipt:{eventId:event.eventId,digest:event.digest,recordId:row.id,createdAt:row.createdAt.toISOString()}}
  })
}
