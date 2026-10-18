import {interviewInput} from '../brand-plan/interview-information'
import type {InsightReport} from '../brand-plan/insight-report'
import {readAvailableInsight} from '../brand-plan/insight-service'
import {planningReviewState,planningRevision} from './planning-workspace-contract'
import { prisma } from '../prisma'
import {getBrandPlanningContext,getBrandMarketingInputs} from '../brand-plan/service'
import { brandFor, type NativeActor } from './contract'

function record(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{}}

/** Keep every report section represented; a long source list must not hide insights. */
export function projectPlanningReport(value:unknown,budget=28000,maxItems=10){
  let partial=false
  function compact(item:unknown,limit:number,depth=0):unknown{
    if(typeof item==='string'){
      if(item.length<=limit)return item
      partial=true;return item.slice(0,Math.max(0,limit-18))+' [excerpt]'
    }
    if(!item||typeof item!=='object')return item
    if(depth>=8||limit<80){partial=true;return '[omitted: length limit]'}
    if(Array.isArray(item)){
      const chosen=item.slice(0,maxItems);if(chosen.length<item.length)partial=true
      return chosen.map(child=>compact(child,Math.floor((limit-30)/Math.max(1,chosen.length)),depth+1))
    }
    const entries=Object.entries(item),perKey=Math.floor((limit-entries.reduce((n,[key])=>n+key.length+5,0))/Math.max(1,entries.length))
    return Object.fromEntries(entries.map(([key,child])=>[key,compact(child,perKey,depth+1)]))
  }
  return {report:compact(value,budget),partial}
}

/** Keep later recommendation sections visible when the source list is very long. */
export function projectInsightSections(report:InsightReport|null){
 if(!report)return {report:null,partial:false}
 const sections=report.content.split(/(?=^#{1,6}\s)/m).filter(Boolean)
 const projected=projectPlanningReport(sections,28000,Math.min(200,Math.max(10,sections.length)))
 return {report:{...report,content:(projected.report as string[]).join('\n\n')},partial:projected.partial}
}

/** Caller authorizes actor. Brand keys come only from this brand and its saved Growth evidence. */
export async function readPlanningInsight(actor:NativeActor){
  const brandId=brandFor(actor)
  const latest=await readAvailableInsight(brandId)
  return {source:latest.report?.source||'AMC Growth',brandId,retrievedAt:new Date().toISOString(),status:latest.status,liveStatus:latest.liveStatus,reportVersionId:latest.report?.id||null,generatedAt:latest.report?.completedAt||null,...projectInsightSections(latest.report)}
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
export async function readMarketingWorkspace(actor:NativeActor,scope?:{stage:string;startMonth:string}){
  const brandId=brandFor(actor)
  const workspace=await getBrandPlanningContext(brandId)
  if(!workspace)return {brandId,status:'missing' as const,revision:planningRevision({}),workspace:null}
  const sections={brandInformation:workspace.brandInformation,coCreation:record(workspace.marketingSolution).coCreation||null,merchantInterview:workspace.merchantInterview,brandClaim:workspace.brandClaim||null,annualPlan:workspace.marketingSolution.annualPlan||null,marketingPlan:(workspace.marketingSolution as any).marketingPlan||null}
  // Per-section budgets keep long interviews from hiding existing quarterly plans.
  const attachments=await prisma.mediaAsset.findMany({where:{brandId,id:{in:(record(record(workspace.marketingSolution).coCreation).interview?.attachmentIds||[]).slice(0,20)}},select:{id:true,filename:true,aiCaption:true,imageAnalysis:true,textDetection:true,technicalMetadata:true}})
  sections.coCreation=sections.coCreation?{...sections.coCreation,attachmentEvidence:attachments}:null
  if(scope?.stage==='marketing_plan'){
  const {direction,focus,selling_points,...activeCoCreation}=sections.coCreation||{}
  sections.coCreation=withoutStrategyQuotas(activeCoCreation)
  sections.annualPlan=withoutStrategyQuotas(sections.annualPlan)
  sections.marketingPlan=withoutStrategyQuotas(sections.marketingPlan)
  ;(sections as any).marketingInputs=await getBrandMarketingInputs(brandId,scope.startMonth)
 }
 if(scope?.stage==='interview'){
  const document=(workspace.marketingSolution as any).coCreation?.interview
  ;(sections as any).positioningInputs={brandInformation:workspace.brandInformation,latestInterview:workspace.merchantInterview,latestSupplement:interviewInput(document),currentPositioning:document?{content:document.content,status:document.status,source:'previous positioning; derived, not a new interview'}:null,brandClaim:workspace.brandClaim,attachments}
 }
 const projected=Object.fromEntries(Object.entries(sections).map(([key,value])=>[key,key==='annualPlan'?projectSavedAnnualPlan(value):key==='positioningInputs'?projectPositioningInputs(value):key==='marketingInputs'?projectMarketingInputs(value):key==='marketingPlan'?projectPlanningReport(value,18000,12):projectPlanningReport(value,key==='coCreation'?14000:5000)]))
  return {brandId,status:'available' as const,confirmationState:planningReviewState(workspace.marketingSolution),approval:'not_asserted',revision:workspace.marketingSolutionRevision,retrievedAt:new Date().toISOString(),partial:Object.values(projected).some(v=>v.partial),workspace:Object.fromEntries(Object.entries(projected).map(([key,value])=>[key,value.report]))}
}

/** Preserve full positioning and principal input, and exact calendar dates and platform roles. */
export function projectMarketingInputs(value:any){
 if(!value)return {report:null,partial:false}
 const events=Array.isArray(value.marketCalendar?.events)?value.marketCalendar.events:[]
 const compactEvents=events.slice(0,80).map((event:any)=>Object.fromEntries(['id','date','name','type','market','source','source_url','sourceUrl','status','verificationStatus','campaign_fit'].filter(key=>event[key]!==undefined).map(key=>[key,event[key]])))
 return {report:{...value,marketCalendar:{...value.marketCalendar,events:compactEvents}},partial:events.length>80}
}

export function withoutStrategyQuotas(value:any):any{
 if(Array.isArray(value))return value.map(withoutStrategyQuotas)
 if(!value||typeof value!=='object')return value
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['subscriptionStrategy','subscription','publishingFreq','monthlyContentQuota','suggestedMonthlyPosts','monthlyPostTarget'].includes(key)).map(([key,item])=>[key,withoutStrategyQuotas(item)]))
}

/** Keep the end of long owner notes visible, including the latest appended corrections. */
export function projectPositioningInputs(value:any){
 let partial=false
 function visit(item:any):any{
  if(typeof item==='string'&&item.length>24000){partial=true;return item.slice(0,16000)+'\n[节选：中间内容因长度省略 / excerpt]\n'+item.slice(-8000)}
  if(Array.isArray(item)){if(item.length>30)partial=true;return item.slice(0,30).map(visit)}
  if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,child])=>[key,visit(child)]))
  return item
 }
 return {report:visit(value),partial}
}
