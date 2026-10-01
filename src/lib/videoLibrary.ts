import type {Prisma} from '@prisma/client'
import {createHash} from 'node:crypto'
import {prisma} from './prisma'
import {canUserAccessBrand} from './user-management/brandAccess'
import {requireActorPermission} from './role-permissions/delegation'
const fail=(code:string,status:number)=>Object.assign(new Error(code),{code,status})
export async function saveVideoToLibrary(userId:string,brandId:string,input:{videoJobId?:unknown}){
 if(!await canUserAccessBrand(brandId,userId,'WRITE'))throw fail('not_found',404)
 await requireActorPermission(userId,'asset.create',brandId)
 const jobId=typeof input?.videoJobId==='string'?input.videoJobId.trim():''
 if(!jobId||jobId.length>200)throw fail('video_job_required',400)
 return prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT id FROM "VideoProductionJob" WHERE id=${jobId} AND "brandId"=${brandId} FOR UPDATE`
  const job=await tx.videoProductionJob.findFirst({where:{id:jobId,brandId}})
  if(!job)throw fail('not_found',404)
  if(job.status!=='completed'||!job.finalVideoUrl)throw fail('video_not_ready',409)
  const metadata=(job.plan as any)?._mmVideoJob||{}
  const rows=await tx.mediaAsset.findMany({where:{brandId,id:{in:job.assetIds}},select:{id:true,url:true,mimeType:true,aiCaption:true}})
  const assets=job.assetIds.map(id=>rows.find(a=>a.id===id)).filter(Boolean)
  const editor={brandId,script:metadata.editor?.script||metadata.script||(job.voiceoverState as any)?.script||job.idea,templateId:metadata.editor?.templateId||metadata.templateId||null,targetDurationSec:metadata.editor?.targetDurationSec||10,creativeId:job.creativeId,assets,missingAssetIds:job.assetIds.filter(id=>!rows.some(a=>a.id===id))}
  const id='video-library-'+createHash('sha256').update(JSON.stringify([brandId,jobId,job.finalVideoUrl])).digest('hex')
  const existing=await tx.mediaAsset.findUnique({where:{id}})
  const previous=(existing?.technicalMetadata as any)?.videoDraft
  // Repair only the known legacy fallback, for the exact same rendered file.
  // Do not replace an edited snapshot or an earlier rendered version.
  const legacyScript=metadata.script||(job.voiceoverState as any)?.script
  const repairLegacy=existing?.url===job.finalVideoUrl&&previous?.version===1&&previous?.jobId===job.id&&previous?.editor?.script===job.idea&&!metadata.editor&&typeof legacyScript==='string'&&legacyScript.trim()&&legacyScript!==job.idea
  const repairedMetadata=repairLegacy?{...(existing!.technicalMetadata as any),videoDraft:{...previous,version:2,editor:{...previous.editor,script:legacyScript},scriptSource:'legacy_submitted_script',repairedAt:new Date().toISOString()}}:undefined
  const asset=await tx.mediaAsset.upsert({where:{id},update:repairedMetadata?{technicalMetadata:repairedMetadata}:{},create:{id,brandId,url:job.finalVideoUrl,filename:job.title+'.mp4',mimeType:'video/mp4',sourceType:'generated_video',aiCategory:'视频草稿',aiCaption:job.title,aiReady:true,uploadedBy:userId,creativeId:job.creativeId,videoProjectId:metadata.basicVideoProjectId||null,technicalMetadata:{videoDraft:{version:2,jobId,editor,savedAt:new Date().toISOString()}} as any}})
  return {ok:true,asset}
 })
}
