import {readInsightSources} from './insight-sources'
import type {Prisma} from '@prisma/client'
import {createHash,randomUUID} from 'node:crypto'
import {prisma} from '../prisma'
import {buildGrowthResearchReport,loadBrandPlanBrand,saveResearchReport} from './service'
import {insightReport,latestInsightReport,growthInsightReport} from './insight-report'
import {presentInsight} from './report-presentation'

type RequestState={id:string;userId?:string;status:'submitting'|'processing'|'review_required'|'completed'|'failed';createdAt:string;sourceRevision?:string;jobId?:string;updatedAt?:string}
async function mutateRequest(brandId:string,change:(request:RequestState|null)=>RequestState|null){
 return prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${brandId} FOR UPDATE`
  const old=await tx.brandKnowledge.findUnique({where:{brandId}}),workspace=(old?.marketingSolution||{}) as any
  const request=change(workspace.insightRequest||null)
  if(request)await tx.brandKnowledge.upsert({where:{brandId},create:{brandId,marketingSolution:{...workspace,insightRequest:request}},update:{marketingSolution:{...workspace,insightRequest:request}}})
  return request
 })
}
export async function readInsight(brandId:string,language='zh'){
 const [knowledge,snapshots,management]=await Promise.all([
  prisma.$queryRaw<Array<{researchReport:any;marketingSolution:any}>>`
   SELECT "researchReport", jsonb_build_object('researchReport',"marketingSolution"->'researchReport','insightRequest',"marketingSolution"->'insightRequest') AS "marketingSolution"
   FROM "BrandKnowledge" WHERE "brandId"=${brandId}`.then((rows:Array<{researchReport:any;marketingSolution:any}>)=>rows[0]||null),
  prisma.brandGrowthResearchSnapshot.findMany({where:{brandId},orderBy:{generatedAt:'desc'},take:50,select:{id:true,report:true}}),
  prisma.brandMarketingSolution.findMany({where:{brandId,kind:'MANAGEMENT_REPORT',status:{in:['COMPLETED','PUBLISHED','CONFIRMED']}},orderBy:{generatedAt:'desc'},take:50,select:{id:true,output:true,status:true,generatedAt:true}}),
 ])
 const w=(knowledge?.marketingSolution||{}) as any
 const report=latestInsightReport([
  insightReport('workspace-research','research',w.researchReport),insightReport('baseline-research','research',knowledge?.researchReport),
  ...snapshots.map((s:any)=>insightReport(s.id,(s.report as any)?.reportType==='management'?'management':'research',s.report)),
  ...management.map((s:any)=>insightReport(s.id,'management',{...(s.output as any),status:s.status,generatedAt:s.generatedAt.toISOString()})),
 ].filter(report=>report?.type==='research'),language)
 return {report,request:(w.insightRequest||null) as RequestState|null}
}
/** Stable provider key survives lost responses. Never interpret transport failures as provider rejection. */
export async function requestInsight(brandId:string,userId:string,adapters={loadBrand:loadBrandPlanBrand,buildReport:buildGrowthResearchReport,saveReport:saveResearchReport},options:{refresh?:boolean;previousRequestId?:string|null;sourceRevision?:string}={}){
 const sources=options.refresh?await readInsightSources(brandId):null
 if(options.refresh&&sources.revision!==options.sourceRevision)throw Object.assign(Error('source_revision_conflict'),{statusCode:409})
 const request=(await mutateRequest(brandId,old=>{
  if(old&&['submitting','processing','review_required'].includes(old.status))return old
  if(options.refresh&&options.previousRequestId!==(old?.id||null)){if(old)return old;throw Object.assign(Error('insight_request_changed'),{statusCode:409})}
  if(!options.refresh&&old&&old.status!=='failed')return old
  return {id:randomUUID(),userId,status:'submitting',createdAt:new Date().toISOString(),...(sources?{sourceRevision:sources.revision}:{})}
 }))!
 if(request.status!=='submitting')return request
 const brand=await adapters.loadBrand(brandId)
 if(!brand)throw Object.assign(Error('brand_not_found'),{statusCode:404})
 try{
  const report=await adapters.buildReport(brand,{requestKey:`brand-insight:${brandId}:${request.id}`,maxWaitMs:0,sourceRevision:request.sourceRevision,onCreated:async jobId=>{await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,jobId,status:'processing',updatedAt:new Date().toISOString()}:old)}})
  await adapters.saveReport(brandId,report)
  return (await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'completed'}:old))!
 }catch(error){
  if((error as any).code==='growth_research_still_running')return (await readInsight(brandId)).request!
  if((error as any).status===409&&(error as any).code==='source_revision_conflict'){await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'failed'}:old);throw Object.assign(Error('source_revision_conflict'),{statusCode:409})}
  // Keep the reservation and key so an unknown provider outcome is safely recoverable.
  throw Object.assign(Error('insight_submission_unavailable'),{statusCode:503})
 }finally{
  await prisma.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'INSIGHT_REPORT_REQUESTED',resourceType:'Brand',resourceId:brandId,metadata:{requestId:request.id}}})
 }
}
export async function reconcileInsight(brandId:string,adapters={readJob:async(id:string)=>{const {readGrowthResearchJob}=await import('../growthDataCenter');return readGrowthResearchJob(id)},loadBrand:loadBrandPlanBrand,buildReport:buildGrowthResearchReport,saveReport:saveResearchReport}){
 const {request}=await readInsight(brandId)
 if(!request?.jobId||!['processing','review_required'].includes(request.status))return
 const job=await adapters.readJob(request.jobId)
 if(['failed','cancelled'].includes(job.status||'')){await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'failed'}:old);return}
 const versions=(job.report_versions||{}) as any
 const hasReport=!!(job.latest_report_markdown||job.latest_report_content||versions.advanced?.report_content||versions.initial?.report_content)
 if(job.status==='evidence_review'||job.status==='needs_review'&&!hasReport){await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'review_required'}:old);return}
 if(!['completed','initial_ready','needs_review'].includes(job.status||''))return
 const brand=await adapters.loadBrand(brandId)
 if(!brand)return
 let report
 try{report=await adapters.buildReport(brand,{jobId:request.jobId,maxWaitMs:0})}catch(error){
  if(['growth_research_v3_missing','growth_research_report_missing','growth_research_failed'].includes(String((error as any).code||''))){
   await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'failed',updatedAt:new Date().toISOString()}:old)
   return
  }
  throw error
 }
 await adapters.saveReport(brandId,report)
 await mutateRequest(brandId,old=>old&&old.id===request.id?{...old,status:'completed',updatedAt:new Date().toISOString()}:old)
}

/** Shared by the report canvas and User AI so both use the same latest artifact. */
export async function readAvailableInsight(brandId:string,options:{savedOnly?:boolean;language?:string;version?:string}={}){
 const language=options.language==='en'?'en':'zh',saved=await readInsight(brandId,language)
 const [brand,snapshot]=await Promise.all([
  prisma.brand.findUnique({where:{id:brandId},select:{growthBrandKey:true}}),
  prisma.brandGrowthResearchSnapshot.findFirst({where:{brandId,source:'amc-growth'},orderBy:{generatedAt:'desc'},select:{report:true}}),
 ])
 const keys=[...new Set([brand?.growthBrandKey,(snapshot?.report as any)?.growthBrandKey].filter((key):key is string=>typeof key==='string'&&!!key.trim()).map(key=>key.trim()))]
 const cached=saved.report&&(!saved.report.growthBrandKey||keys.includes(saved.report.growthBrandKey))&&(!options.version||saved.report.id===options.version)?saved.report:null
 const fallback=(liveStatus:string)=>({...saved,report:cached?presentInsight(cached,brandId):null,status:cached?'cached':liveStatus,liveStatus})
 if(options.savedOnly)return fallback('not_checked')
 if(!keys.length&&!brand)return fallback('not_linked')
 try{
  const {findLatestGrowthInsightVersion}=await import('../growthDataCenter')
  const value=await findLatestGrowthInsightVersion(keys,{...options,brandId})
  if(!value)return {...saved,report:null,status:'missing',liveStatus:'available'}
  const live=growthInsightReport(value)
  if(!live||live.type!=='research')throw Error('growth_report_content_missing')
  if(!options.version){
   try{
   const snapshotId='insight-'+createHash('sha256').update(brandId+':'+live.id).digest('hex').slice(0,40)
   const record={...live,growthBrandKey:value.brand_key,reportType:'research',reportVersionId:live.id,reportMarkdown:live.content,pdfPath:live.pdfPath||null,generatedAt:live.completedAt}
   const dataHash=createHash('sha256').update(JSON.stringify(record)).digest('hex')
   const previous=await prisma.brandGrowthResearchSnapshot.findUnique({where:{id:snapshotId},select:{dataHash:true}})
   if(previous?.dataHash!==dataHash)await prisma.brandGrowthResearchSnapshot.upsert({where:{id:snapshotId},create:{id:snapshotId,brandId,source:'amc-growth',sourceVersion:live.id,dataHash,report:record,generatedAt:new Date(live.completedAt||0)},update:{report:record,dataHash}})
   }catch{console.warn('merchant_report_cache_failed',{brandId,reportVersionId:live.id})}
  }
  return {...saved,report:presentInsight(live,brandId),status:'available',liveStatus:'available'}
 }catch(error){
  if([403,404,410].includes(Number((error as any).status)))return {...saved,report:null,status:'missing',liveStatus:'available'}
  return fallback('unavailable')
 }
}
