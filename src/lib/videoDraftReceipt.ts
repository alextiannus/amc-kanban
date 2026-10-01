import type {Prisma} from '@prisma/client'

/** Called within the draft creation transaction. The job lock serializes all saves. */
export async function videoDraftReceipt(tx:Prisma.TransactionClient,brandId:string,jobId:string,mediaUrls:string[]) {
  const jobs=await tx.$queryRaw<Array<{id:string;status:string;finalVideoUrl:string|null}>>`SELECT id,status,"finalVideoUrl" FROM "VideoProductionJob" WHERE id=${jobId} AND "brandId"=${brandId} FOR UPDATE`
  const job=jobs[0]
  if(!job)return {error:'Video job not found',status:404} as const
  if(job.status!=='completed'||!job.finalVideoUrl||mediaUrls.length!==1||mediaUrls[0]!==job.finalVideoUrl)return {error:'Save only the completed video output',status:409} as const
  const existing=await tx.contentDraft.findFirst({where:{brandId,agentNote:{contains:`video-production-job:${jobId}`}},orderBy:{createdAt:'asc'},select:{id:true,mediaUrls:true}})
  if(existing&&!existing.mediaUrls.includes(job.finalVideoUrl))return {error:'This video has an existing draft. Review and update its media explicitly.',status:409} as const
  return {existingId:existing?.id||null,marker:`video-production-job:${jobId}`} as const
}
