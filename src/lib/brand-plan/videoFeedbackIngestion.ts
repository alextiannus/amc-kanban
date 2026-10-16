import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
import type {Prisma} from '@prisma/client'
import {prisma} from '../prisma.ts'
import {canUserAccessBrand} from '../user-management/brandAccess.ts'
import {CREATIVE_REVISION_KIND,CreativeRevisionError,record,stableJson} from './creativeRevisionContract.ts'
import {readVideoFeedback,type VideoFeedback,VIDEO_EDIT_FEEDBACK_KIND,VIDEO_FEEDBACK_MAX_BYTES} from './revisionFeedback.ts'

export {VIDEO_EDIT_FEEDBACK_KIND} from './revisionFeedback.ts'
export const VIDEO_FEEDBACK_EVENT_SCHEMA='video_feedback_event@1'
export const VIDEO_FEEDBACK_EVENT_MAX_BYTES=VIDEO_FEEDBACK_MAX_BYTES+4096
export const VIDEO_FEEDBACK_DELIVERY_SCHEMA='video_feedback_delivery@1'
export const VIDEO_FEEDBACK_DELIVERY_PATH='/api/internal/content/video-feedback'
export const VIDEO_FEEDBACK_DELIVERY_FRESHNESS_MS=5*60*1000

export type VideoFeedbackEventIdentity={projectId:string;brandId:string;creativeId:string;creativeRevisionId:string;actorId:string}
export type VideoFeedbackEventCore={schema:typeof VIDEO_FEEDBACK_EVENT_SCHEMA;eventId:string;occurredAt:string;identity:VideoFeedbackEventIdentity;evidence:VideoFeedback}
export type VideoFeedbackEventEnvelope={core:VideoFeedbackEventCore;coreDigest:string}
export type VideoFeedbackDelivery={method:string;path:string;deliveredAt:string;nonce:string;signature:string}

const coreKeys=['schema','eventId','occurredAt','identity','evidence']
const identityKeys=['projectId','brandId','creativeId','creativeRevisionId','actorId']
const envelopeKeys=['core','coreDigest']
const id=(value:unknown):value is string=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=200&&!/[\u0000-\u001f]/.test(value)&&!['__proto__','constructor','prototype'].includes(value)
const nonce=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(value)
const hex=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const equalHex=(left:string,right:string)=>{const a=Buffer.from(left,'hex'),b=Buffer.from(right,'hex');return a.length===b.length&&timingSafeEqual(a,b)}

export function videoFeedbackEventCore(value:unknown):VideoFeedbackEventCore{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CreativeRevisionError('invalid_video_feedback_event')
  const input=value as Record<string,unknown>
  if(Object.keys(input).length!==coreKeys.length||Object.keys(input).some(key=>!coreKeys.includes(key))||input.schema!==VIDEO_FEEDBACK_EVENT_SCHEMA)throw new CreativeRevisionError('invalid_video_feedback_event')
  if(!id(input.eventId)||!input.identity||typeof input.identity!=='object'||Array.isArray(input.identity))throw new CreativeRevisionError('invalid_video_feedback_event')
  const identity=input.identity as Record<string,unknown>
  if(Object.keys(identity).length!==identityKeys.length||Object.keys(identity).some(key=>!identityKeys.includes(key)))throw new CreativeRevisionError('invalid_video_feedback_event')
  for(const key of identityKeys)if(!id(identity[key]))throw new CreativeRevisionError('invalid_video_feedback_event')
  if(typeof input.occurredAt!=='string')throw new CreativeRevisionError('invalid_video_feedback_event')
  const occurredAt=new Date(input.occurredAt)
  if(!Number.isFinite(occurredAt.getTime())||occurredAt.toISOString()!==input.occurredAt)throw new CreativeRevisionError('invalid_video_feedback_event')
  const evidence=readVideoFeedback(input.evidence)
  if(!evidence)throw new CreativeRevisionError('invalid_video_feedback_event')
  return {schema:VIDEO_FEEDBACK_EVENT_SCHEMA,eventId:input.eventId,occurredAt:input.occurredAt,identity:identity as VideoFeedbackEventIdentity,evidence}
}

export function videoFeedbackEventDigest(core:VideoFeedbackEventCore){return createHash('sha256').update(stableJson(core)).digest('hex')}
export function videoFeedbackEventEnvelope(value:unknown):VideoFeedbackEventEnvelope{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CreativeRevisionError('invalid_video_feedback_event')
  const input=value as Record<string,unknown>
  if(Object.keys(input).length!==envelopeKeys.length||Object.keys(input).some(key=>!envelopeKeys.includes(key))||!hex(input.coreDigest))throw new CreativeRevisionError('invalid_video_feedback_event')
  const core=videoFeedbackEventCore(input.core),coreDigest=videoFeedbackEventDigest(core)
  if(!equalHex(input.coreDigest,coreDigest))throw new CreativeRevisionError('invalid_video_feedback_digest')
  return {core,coreDigest}
}
export function videoFeedbackDeliverySignature(eventId:string,coreDigest:string,delivery:Omit<VideoFeedbackDelivery,'signature'>,token:string){
  return createHmac('sha256',token).update(`${VIDEO_FEEDBACK_DELIVERY_SCHEMA}\n${delivery.method}\n${delivery.path}\n${eventId}\n${coreDigest}\n${delivery.deliveredAt}\n${delivery.nonce}`).digest('hex')
}
export function verifyVideoFeedbackDelivery(envelope:VideoFeedbackEventEnvelope,delivery:VideoFeedbackDelivery,token:string,now=new Date()){
  if(!token)throw new CreativeRevisionError('video_feedback_service_unconfigured',503)
  if(delivery.method!=='POST'||delivery.path!==VIDEO_FEEDBACK_DELIVERY_PATH||typeof delivery.deliveredAt!=='string'||!nonce(delivery.nonce)||!hex(delivery.signature))throw new CreativeRevisionError('invalid_video_feedback_delivery',401)
  const deliveredAt=new Date(delivery.deliveredAt)
  if(!Number.isFinite(deliveredAt.getTime())||deliveredAt.toISOString()!==delivery.deliveredAt||Math.abs(now.getTime()-deliveredAt.getTime())>VIDEO_FEEDBACK_DELIVERY_FRESHNESS_MS)throw new CreativeRevisionError('video_feedback_delivery_stale',401)
  const signature=videoFeedbackDeliverySignature(envelope.core.eventId,envelope.coreDigest,{method:delivery.method,path:delivery.path,deliveredAt:delivery.deliveredAt,nonce:delivery.nonce},token)
  if(!equalHex(delivery.signature,signature))throw new CreativeRevisionError('invalid_video_feedback_delivery',401)
}

export async function ingestTrustedVideoFeedback(value:unknown,delivery:VideoFeedbackDelivery,token:string,now=new Date(),db:any=prisma){
  const envelope=videoFeedbackEventEnvelope(value)
  verifyVideoFeedbackDelivery(envelope,delivery,token,now)
  const event=envelope.core,{projectId,brandId,creativeId,creativeRevisionId,actorId}=event.identity,digest=envelope.coreDigest
  return db.$transaction(async(tx:Prisma.TransactionClient)=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'video-feedback:'+event.eventId}))::text`
    await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id"=${brandId} FOR UPDATE`
    const [actor,brand]=await Promise.all([tx.user.findUnique({where:{id:actorId},select:{id:true,type:true,status:true}}),tx.brand.findUnique({where:{id:brandId},select:{id:true,status:true}})])
    if(actor?.status!=='ACTIVE'||brand?.status!=='ACTIVE'||!await canUserAccessBrand(brandId,actorId,'WRITE',tx))throw new CreativeRevisionError('video_feedback_access_denied',404)
    const [revision,jobs]=await Promise.all([
      tx.brandMarketingSolution.findFirst({where:{id:creativeRevisionId,brandId,kind:CREATIVE_REVISION_KIND}}),
      tx.videoProductionJob.findMany({where:{brandId,creativeId,createdBy:actorId,OR:[{plan:{path:['basicVideoProjectId'],equals:projectId}},{plan:{path:['_mmVideoJob','basicVideoProjectId'],equals:projectId}},{plan:{path:['_mmVideoJob','videoReceipt','projectId'],equals:projectId}}]},select:{id:true,plan:true},take:2}),
    ])
    const revisionInput=record(revision?.input),job=jobs.length===1?jobs[0]:null,plan=record(job?.plan),metadata=record(plan._mmVideoJob),editor=record(metadata.editor),receipt=record(metadata.videoReceipt)
    const projectPins=[plan.basicVideoProjectId,metadata.basicVideoProjectId,receipt.projectId]
    if(!revision||revisionInput.creativeId!==creativeId||!job||projectPins.some(pin=>!id(pin)||pin!==projectId)||editor.creativeId!==creativeId||editor.creativeRevisionId!==creativeRevisionId)throw new CreativeRevisionError('video_feedback_binding_not_found',404)
    const existing=await tx.brandMarketingSolution.findFirst({where:{kind:VIDEO_EDIT_FEEDBACK_KIND,period:event.eventId}})
    if(existing){
      if(existing.brandId!==brandId||record(existing.input).digest!==digest)throw new CreativeRevisionError('video_feedback_event_conflict',409)
      return {ok:true,replayed:true,receipt:{eventId:event.eventId,digest,recordId:existing.id,createdAt:existing.createdAt.toISOString()}}
    }
    const row=await tx.brandMarketingSolution.create({data:{brandId,kind:VIDEO_EDIT_FEEDBACK_KIND,period:event.eventId,version:1,status:'RECORDED',generationMode:'TRUSTED_VIDEO_FEEDBACK',createdById:actorId,input:{schema:event.schema,eventId:event.eventId,occurredAt:event.occurredAt,projectId,creativeId,creativeRevisionId,actor:{id:actorId,type:actor.type},digest,videoFeedback:event.evidence as any},output:{}}})
    return {ok:true,replayed:false,receipt:{eventId:event.eventId,digest,recordId:row.id,createdAt:row.createdAt.toISOString()}}
  })
}
