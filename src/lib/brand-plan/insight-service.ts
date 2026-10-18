import type {Prisma} from '@prisma/client'
import {createHash,randomUUID} from 'node:crypto'
import {prisma} from '../prisma'
import {buildGrowthResearchReport,loadBrandPlanBrand,saveResearchReport} from './service'
import {insightReport,latestInsightReport,growthInsightReport} from './insight-report'

type RequestState={id:string;status:'submitting'|'processing'|'review_required'|'completed'|'failed';createdAt:string;jobId?:string;updatedAt?:string}
async function mutateRequest(brandId:string,change:(request:RequestState|null)=>RequestState|null){
 return prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${brandId} FOR UPDATE`
  const old=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=(old?.marketingSolution||{}) as any
  const request=change(workspace.insightRequest||null)
  if(request)await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,marketingSolution:{...workspace,insightRequest:request}},update:{marketingSolution:{...workspace,insightRequest:request}}})
  return request
 })
}
export async function readInsight(brandId:string){
 const [knowledge,snapshots,management]=await Promise.all([
  prisma.brandKnowledge.findUnique({where:{brandId}}),
  prisma.brandGrowthResearchSnapshot.findMany({where:{brandId},orderBy:{generatedAt:'desc'},take:50}),
  prisma.brandMarketingSolution.findMany({where:{brandId,kind:'MANAGEMENT_REPORT',status:{in:['COMPLETED','PUBLISHED','CONFIRMED']}},orderBy:{generatedAt:'desc'},take:50}),
 ])
 const w=(knowledge?.marketingSolution||{}) as any
 const report=latestInsightReport([
  insightReport('workspace-research','research',w.researchReport),insightReport('baseline-research','research',knowledge?.researchReport),
  ...snapshots.map((s:any)=>insightReport(s.id,(s.report as any)?.reportType==='management'?'management':'research',s.report)),
  ...management.map((s:any)=>insightReport(s.id,'management',{...(s.output as any),status:s.status,generatedAt:s.generatedAt.toISOString()})),
 ])
 return {report,request:(w.insightRequest||null) as RequestState|null}
}
/** Stable provider key survives lost responses. Never interpret transport failures as provider rejection. */
export async function requestInsight(brandId:string,userId:string,adapters={loadBrand:loadBrandPlanBrand,buildReport:buildGrowthResearchReport,saveReport:saveResearchReport}){
 const request=(await mutateRequest(brandId,old=>old&&old.status!=='failed'?old:{id:randomUUID(),status:'submitting',createdAt:new Date().toISOString()}))!
 if(request.status!=='submitting')return request
 const brand=await adapters.loadBrand(brandId)
 if(!brand)throw Object.assign(Error('brand_not_found'),{statusCode:404})
 try{
  const report=await adapters.buildReport(brand,{requestKey:`brand-insight:${brandId}:${request.id}`,maxWaitMs:0,onCreated:async jobId=>{await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,jobId,status:'processing',updatedAt:new Date().toISOString()}:old)}})
  await adapters.saveReport(brandId,report)
  return (await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'completed'}:old))!
 }catch(error){
  if((error as any).code==='growth_research_still_running')return (await readInsight(brandId)).request!
  // Keep the reservation and key so an unknown provider outcome is safely recoverable.
  throw Object.assign(Error('insight_submission_unavailable'),{statusCode:503})
 }finally{
  await prisma.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'INSIGHT_REPORT_REQUESTED',resourceType:'Brand',resourceId:brandId,metadata:{requestId:request.id}}})
 }
}
export async function reconcileInsight(brandId:string){
 const {request}=await readInsight(brandId)
 if(!request?.jobId||!['processing','review_required'].includes(request.status))return
 const {readGrowthResearchJob}=await import('../growthDataCenter')
 const job=await readGrowthResearchJob(request.jobId)
 if(['failed','cancelled'].includes(job.status||'')){await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'failed'}:old);return}
 if(['needs_review','evidence_review'].includes(job.status||'')){await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'review_required'}:old);return}
 if(!['completed','initial_ready'].includes(job.status||''))return
 const brand=await loadBrandPlanBrand(brandId)
 if(!brand)return
 const report=await buildGrowthResearchReport(brand,{jobId:request.jobId,maxWaitMs:0})
 await saveResearchReport(brandId,report)
 await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'completed',updatedAt:new Date().toISOString()}:old)
}

/** Shared by the report canvas and User AI so both use the same latest artifact. */
export async function readAvailableInsight(brandId:string){
 const saved=await readInsight(brandId)
 const [brand,snapshot]=await Promise.all([
  prisma.brand.findUnique({where:{id:brandId},select:{growthBrandKey:true}}),
  prisma.brandGrowthResearchSnapshot.findFirst({where:{brandId,source:'amc-growth'},orderBy:{generatedAt:'desc'},select:{report:true}}),
 ])
 const keys=[brand?.growthBrandKey,(snapshot?.report as any)?.growthBrandKey].filter((v):v is string=>typeof v==='string'&&!!v.trim())
 const fallback=(liveStatus:string)=>({...saved,report:withInsightPdfUrl(brandId,saved.report),status:saved.report?'cached':liveStatus,liveStatus})
 if(!keys.length)return fallback('not_linked')
 try{
  const {findLatestGrowthInsightVersion}=await import('../growthDataCenter')
  const value=await findLatestGrowthInsightVersion(keys)
  if(!value)return fallback('missing')
  const live=growthInsightReport(value)
  if(!live)throw Error('growth_report_content_missing')
  const snapshotId='insight-'+createHash('sha256').update(`${brandId}:${live.id}`).digest('hex').slice(0,40)
  const cached={growthBrandKey:keys[0],reportType:live.type,supplementQuestions:live.supplementQuestions||[],reportVersionId:live.id,title:live.title,reportMarkdown:live.content,pdfPath:live.pdfPath||null,generatedAt:live.completedAt,periodEnd:live.periodEnd}
  const dataHash=createHash('sha256').update(JSON.stringify(cached)).digest('hex')
  const previous=await prisma.brandGrowthResearchSnapshot.findUnique({where:{id:snapshotId},select:{dataHash:true}})
  if(previous?.dataHash!==dataHash)await prisma.brandGrowthResearchSnapshot.upsert({where:{id:snapshotId},create:{id:snapshotId,brandId,source:'amc-growth',sourceVersion:live.id,dataHash,report:cached,generatedAt:new Date(live.completedAt||0)},update:{report:cached,dataHash}})
  const report=latestInsightReport(saved.report?.id===live.id?[live]:[saved.report,live])
  return {...saved,report:withInsightPdfUrl(brandId,report),status:report?.id===live?.id?'available':'cached',liveStatus:'available'}
 }catch{return fallback('unavailable')}
}

function withInsightPdfUrl(brandId:string,report:Awaited<ReturnType<typeof readInsight>>['report']){
 return report?{...report,...(report.pdfPath?{pdfUrl:`/api/brands/${encodeURIComponent(brandId)}/insight/pdf?version=${encodeURIComponent(report.id)}`}:{})}:null
}
