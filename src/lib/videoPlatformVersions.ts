import {requireActorPermission} from './role-permissions/delegation'
import {prisma} from './prisma'
import {creativeDigest} from './brand-plan/creativeRevisionContract'
import {nativeError} from './ai-native/contract'
const txt=(v:unknown)=>typeof v==='string'?v.trim():''
export function languageForMarket(market:unknown){const m=txt(market).toLowerCase();return /^(sg|singapore|新加坡)$/.test(m)?'en':/^(id|indonesia|印尼|印度尼西亚)$/.test(m)?'id':/^(my|malaysia|马来西亚)$/.test(m)?'ms':/^(cn|china|中国)$/.test(m)?'zh':null}
export async function videoPlatformVersion(userId:string,brandId:string,body:any){
 const job=await prisma.videoProductionJob.findUnique({where:{id:txt(body.jobId)}})
 if(!job||job.historyDeletedAt||job.brandId!==brandId||job.createdBy!==userId)throw nativeError('video_not_found',404)
 const metadata=(job.plan as any)?._mmVideoJob||{},rootId=metadata.editor?.variantRootJobId||job.id
 const root=await prisma.videoProductionJob.findUnique({where:{id:rootId}})
 if(!root||root.brandId!==brandId||root.createdBy!==userId)throw nativeError('video_not_found',404)
 const brand=await prisma.brand.findUnique({where:{id:brandId},select:{location:true,knowledge:{select:{market:true}}}}),market=brand?.knowledge?.market||brand?.location||null
 const records=await prisma.brandMarketingSolution.findMany({where:{brandId,kind:'VIDEO_PLATFORM_VERSION',period:rootId,createdById:userId},orderBy:{createdAt:'asc'}})
 if(body.action==='variants')return {brandId,market,rootId,rootVersion:{jobId:root.id,platform:root.platform,language:(root.plan as any)?._mmVideoJob?.language,status:root.status,progress:root.progress,finalVideoUrl:root.finalVideoUrl},versions:await Promise.all(records.map(async(r:any)=>{const child=await prisma.videoProductionJob.findFirst({where:{brandId,createdBy:userId,historyDeletedAt:null,plan:{path:['_mmVideoJob','editor','variantKey'],equals:r.id}}});return {...(r.output as any),...(child?{jobId:child.id,status:child.status,progress:child.progress}:{}),key:r.id,platform:(r.input as any).platform,language:(r.input as any).language}}))}
 if(body.action==='completeVariant'){
  const record=records.find((r:any)=>r.id===body.key),child=await prisma.videoProductionJob.findUnique({where:{id:txt(body.childJobId)}})
  if(!record||!child||child.historyDeletedAt||child.brandId!==brandId||child.createdBy!==userId||(child.plan as any)?._mmVideoJob?.editor?.variantKey!==record.id)throw nativeError('video_variant_mismatch',409)
  await prisma.brandMarketingSolution.update({where:{id:record.id},data:{status:'READY',output:{jobId:child.id,status:child.status}}});return {jobId:child.id}
 }
 await requireActorPermission(userId,'content.video-making.create',brandId)
 const platform=txt(body.platform)
 if(!['tiktok','xiaohongshu'].includes(platform))throw nativeError('invalid_video_platform',400)
 const language=txt(body.language)||(platform==='xiaohongshu'?'zh':languageForMarket(market))||''
 if(!['zh','en','id','ms'].includes(language))throw nativeError('video_market_required',422)
 const rootLanguage=(root.plan as any)?._mmVideoJob?.language
 if(root.platform===platform&&rootLanguage===language)return {key:'root',rootId,language,platform,jobId:root.id,execute:false}
 if(!job.finalVideoUrl)throw nativeError('video_variant_requires_finished_video',409)
 const input={userId,brandId,rootId,parentId:job.id,scriptVersion:metadata.scriptVersion||null,script:metadata.editor?.script||job.idea,platform,language}
 const id='video_variant_'+creativeDigest([userId,brandId,rootId,platform,language])
 const prior=records.find((r:any)=>r.id===id)
 if(body.action==='variantPlan')return {key:id,rootId,language,platform,parentId:(prior?.input as any)?.parentId||job.id,reserved:Boolean(prior)}
 return prisma.$transaction(async(tx:any)=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`
  const existing=await tx.brandMarketingSolution.findUnique({where:{id}})
  const child=existing?await tx.videoProductionJob.findFirst({where:{brandId,createdBy:userId,historyDeletedAt:null,plan:{path:['_mmVideoJob','editor','variantKey'],equals:id}}}):null
  if(child)return {key:id,rootId,language,platform,jobId:child.id,execute:false}
  if(existing)return {key:id,rootId,language,platform,parentId:(existing.input as any)?.parentId||job.id,...(existing.output as any),execute:false,pending:true}
  await tx.brandMarketingSolution.create({data:{id,brandId,kind:'VIDEO_PLATFORM_VERSION',period:rootId,input,output:{status:'pending'},status:'GENERATING',createdById:userId}})
  return {key:id,rootId,language,platform,parentId:job.id,execute:true}
 })
}
