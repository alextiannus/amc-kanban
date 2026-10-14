import {planningRevision} from './planning-workspace-contract'
import { prisma } from '../prisma'
import {getBrandPlanningContext} from '../brand-plan/service'
import { findLatestGrowthV3ReportReference, readGrowthReportArtifact } from '../growthDataCenter'
import { brandFor, type NativeActor } from './contract'

function record(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{}}

/** Keep every report section represented; a long source list must not hide insights. */
export function projectPlanningReport(value:unknown,budget=28000){
  let partial=false
  function compact(item:unknown,limit:number,depth=0):unknown{
    if(typeof item==='string'){
      if(item.length<=limit)return item
      partial=true;return item.slice(0,Math.max(0,limit-18))+' [excerpt]'
    }
    if(!item||typeof item!=='object')return item
    if(depth>=8||limit<80){partial=true;return '[omitted: length limit]'}
    if(Array.isArray(item)){
      const chosen=item.slice(0,10);if(chosen.length<item.length)partial=true
      return chosen.map(child=>compact(child,Math.floor((limit-30)/Math.max(1,chosen.length)),depth+1))
    }
    const entries=Object.entries(item),perKey=Math.floor((limit-entries.reduce((n,[key])=>n+key.length+5,0))/Math.max(1,entries.length))
    return Object.fromEntries(entries.map(([key,child])=>[key,compact(child,perKey,depth+1)]))
  }
  return {report:compact(value,budget),partial}
}

/** Caller authorizes actor. Brand keys come only from this brand and its saved Growth evidence. */
export async function readPlanningInsight(actor:NativeActor){
  const brandId=brandFor(actor)
  const [brand,snapshot]=await Promise.all([
    prisma.brand.findUnique({where:{id:brandId},select:{growthBrandKey:true}}),
    prisma.brandGrowthResearchSnapshot.findFirst({where:{brandId,source:'amc-growth'},orderBy:{generatedAt:'desc'},select:{id:true,report:true,sourceVersion:true}}),
  ])
  const saved=record(snapshot?.report)
  const savedKey=typeof saved.growthBrandKey==='string'?saved.growthBrandKey:null
  const keys=[brand?.growthBrandKey,savedKey].filter((key):key is string=>!!key)
  const base={source:'AMC Growth',brandId,retrievedAt:new Date().toISOString()}
  let unavailable=false
  try{
    const ref=await findLatestGrowthV3ReportReference({growthBrandKeys:keys})
    if(ref?.reportVersionId){
      const artifact=await readGrowthReportArtifact(`/v1/admin/report-versions/${encodeURIComponent(ref.reportVersionId)}/download-json`)
      const parsed=JSON.parse(Buffer.from(artifact.body).toString('utf8'))
      if(!parsed||typeof parsed!=='object'||!Object.keys(parsed).length)throw Error('empty_report')
      return {...base,status:'available',reportVersionId:ref.reportVersionId,generatedAt:record(parsed).metadata?.generated_at||record(parsed).generated_at||null,...projectPlanningReport(parsed)}
    }
  }catch{unavailable=true}
  // Saved research uses a separate Growth key on some brands. Only use the
  // application-owned, brand-bound evidence snapshot, never a client-supplied URL.
  const structured=record(saved.structuredReport)
  if(snapshot&&Object.keys(structured).length){
    return {...base,status:'cached',liveStatus:unavailable?'unavailable':'missing',snapshotId:snapshot.id,reportVersionId:typeof saved.reportVersionId==='string'?saved.reportVersionId:null,generatedAt:saved.generatedAt||snapshot.sourceVersion||null,...projectPlanningReport(structured)}
  }
  return {...base,status:unavailable?'unavailable':keys.length?'missing':'not_linked',report:null}
}

/** Reserve space for every quarter: overview metadata must not crowd out 12 monthly focuses. */
export function projectSavedAnnualPlan(value:unknown){
  if(!value)return {report:null,partial:false}
  const {quarterlyPlans,...overview}=record(value)
  const base=projectPlanningReport(overview,4000)
  const quarters=Array.isArray(quarterlyPlans)?quarterlyPlans:[]
  const projected=quarters.slice(0,4).map(quarter=>projectPlanningReport(quarter,4000))
  return {report:{...record(base.report),quarterlyPlans:projected.map(item=>item.report)},partial:base.partial||quarters.length>4||projected.some(item=>item.partial)}
}

/** Shared persisted planning data; caller authorizes, brand identity is never model supplied. */
export async function readMarketingWorkspace(actor:NativeActor){
  const brandId=brandFor(actor)
  const workspace=await getBrandPlanningContext(brandId)
  if(!workspace)return {brandId,status:'missing' as const,revision:planningRevision({}),workspace:null}
  const sections={coCreation:record(workspace.marketingSolution).coCreation||null,merchantInterview:workspace.merchantInterview,brandClaim:workspace.brandClaim||null,annualPlan:workspace.marketingSolution.annualPlan||null}
  // Per-section budgets keep long interviews from hiding existing quarterly plans.
  const projected=Object.fromEntries(Object.entries(sections).map(([key,value])=>[key,key==='annualPlan'?projectSavedAnnualPlan(value):projectPlanningReport(value,5000)]))
  return {brandId,status:'available' as const,approval:'not_asserted',revision:workspace.marketingSolutionRevision,retrievedAt:new Date().toISOString(),partial:Object.values(projected).some(v=>v.partial),workspace:Object.fromEntries(Object.entries(projected).map(([key,value])=>[key,value.report]))}
}
