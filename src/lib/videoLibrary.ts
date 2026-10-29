import type {Prisma} from '@prisma/client'
import {createHash} from 'node:crypto'
import {prisma} from './prisma'
import {canUserAccessBrand} from './user-management/brandAccess'
import {requireActorPermission} from './role-permissions/delegation'
import {videoDraftForLibrary} from './videoLineage'
const fail=(code:string,status:number)=>Object.assign(new Error(code),{code,status})
export async function resumeLibraryVideo(userId:string,brandId:string,input:{assetId?:unknown},db:any=prisma){
 if(!await canUserAccessBrand(brandId,userId,'WRITE'))throw fail('not_found',404)
 await requireActorPermission(userId,'content.video-making.create',brandId)
 const assetId=typeof input.assetId==='string'?input.assetId.trim():''
 if(!assetId||assetId.length>200)throw fail('asset_required',400)
 const asset=await db.mediaAsset.findFirst({where:{id:assetId,brandId},select:{technicalMetadata:true}})
 const draft=asset?.technicalMetadata?.videoDraft,editor=draft?.editor
 if(!editor||editor.brandId!==brandId||typeof editor.script!=='string'||!editor.script.trim()||editor.script.length>12000)throw fail('video_script_unavailable',409)
 const owned=draft.jobId?await db.videoProductionJob.findFirst({where:{id:draft.jobId,brandId,createdBy:userId},select:{id:true}}):null
 if(owned)return {mode:'owned',jobId:owned.id}
 // Shared library snapshots are brand resources, not permission to read another
 // member's private job. Copy only editable content; never their job/plan/receipt.
 const ids=[...new Set((Array.isArray(editor.assets)?editor.assets:[]).map((a:any)=>a?.id).filter((id:any)=>typeof id==='string'))].slice(0,40) as string[]
 const rows=await db.mediaAsset.findMany({where:{brandId,id:{in:ids}},select:{id:true,url:true,mimeType:true,aiCaption:true}})
 const byId=new Map(rows.map((a:any)=>[a.id,a])),assets=ids.flatMap(id=>byId.has(id)?[byId.get(id)]:[])
 return {mode:'copy',editor:{brandId,script:editor.script,templateId:null,creativeId:null,targetDurationSec:Number.isFinite(editor.targetDurationSec)&&editor.targetDurationSec>0&&editor.targetDurationSec<=600?editor.targetDurationSec:15,assets,missingAssetIds:[...new Set([...ids.filter(id=>!byId.has(id)),...(Array.isArray(editor.missingAssetIds)?editor.missingAssetIds.filter((id:any)=>typeof id==='string'):[])])],language:['zh','en','id','ms'].includes(editor.language)?editor.language:undefined,targetPlatforms:['tiktok'],lineageWarning:'shared_library_copy'}}
}
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
  const videoDraft=videoDraftForLibrary(job,rows)
  const id='video-library-'+createHash('sha256').update(JSON.stringify([brandId,jobId,job.finalVideoUrl])).digest('hex')
  const existing=await tx.mediaAsset.findUnique({where:{id}})
  const previous=(existing?.technicalMetadata as any)?.videoDraft
  // Repair only the known legacy fallback, for the exact same rendered file.
  // Do not replace an edited snapshot or an earlier rendered version.
  const legacyScript=metadata.script||(job.voiceoverState as any)?.script
  const repairLegacy=existing?.url===job.finalVideoUrl&&previous?.version===1&&previous?.jobId===job.id&&previous?.editor?.script===job.idea&&!metadata.editor&&typeof legacyScript==='string'&&legacyScript.trim()&&legacyScript!==job.idea
  const repairedMetadata=repairLegacy?{...(existing!.technicalMetadata as any),videoDraft:{...previous,version:2,editor:{...previous.editor,script:legacyScript},scriptSource:'legacy_submitted_script',repairedAt:new Date().toISOString()}}:undefined
const asset=await tx.mediaAsset.upsert({where:{id},update:repairedMetadata?{technicalMetadata:repairedMetadata}:{},create:{id,brandId,url:job.finalVideoUrl,filename:job.title+'.mp4',mimeType:'video/mp4',sourceType:'generated_video',aiCategory:'视频草稿',aiCaption:job.title,aiReady:true,uploadedBy:userId,creativeId:job.creativeId,videoProjectId:metadata.basicVideoProjectId||null,technicalMetadata:{videoDraft} as any}})
  return {ok:true,asset}
 })
}
