import {createHash} from 'node:crypto'
import {matchPromotionStrategyCreativeCandidates} from '../promotion-strategy/clients'

export const CREATIVE_DAILY_NOTICE='创意内容每天持续更新；最新推荐可在品牌创意中查看。'
export type PlanningCreativeReference={sourceCreativeId:string;title:string;platform:string|null;sourceUrl:string|null;matchScore:number;matchedTags:string[];referenceAngle:string;sourceRevision:string|null;popularityStatus:'unverified'}
export type PlanningCreativeSearch={status:'available'|'empty'|'unavailable';retrievedAt:string;queryDigest:string;contentMatchRequestId:string|null;libraryVersions:Record<string,unknown>;candidates:PlanningCreativeReference[];dailyNotice:string;limitations:string[]}
const short=(v:unknown,n=1200)=>typeof v==='string'?v.trim().slice(0,n):''
export function planningCreativeBrief(facts:any,workspace:any){
 const w=workspace?.workspace||workspace||{},inputs=w.marketingInputs||{},solution=w.coCreation||{}
 return {brand:short(facts.name,200),category:short(facts.industry,200),description:short(facts.description),positioning:short(inputs.brandPositioning?.content||solution.interview?.content,3000),sellingPoints:(w.marketingPlan?.coreSellingPoints||[]).filter((v:unknown)=>typeof v==='string').slice(0,6).map((v:string)=>short(v,350)),principal:short(inputs.principalStrategy?.content||solution.principal_strategy?.content),products:(facts.productCatalog||[]).slice(0,12).map((v:any)=>short(v.name,120)),platforms:(inputs.platformPlanning?.knownBrandPlatforms||[]).filter((v:unknown)=>typeof v==='string').slice(0,8)}
}
export function planningCreativeReferences(rows:any[]):PlanningCreativeReference[]{
 const seen=new Set<string>()
 return (Array.isArray(rows)?rows:[]).filter(row=>{
  const id=row?.inspirationCreativeId
  return typeof id==='string'&&/^cre_[a-zA-Z0-9_-]+$/.test(id)&&Number.isFinite(row.matchScore)&&row.matchScore>=6&&!seen.has(id)&&!!seen.add(id)
 }).sort((a,b)=>b.matchScore-a.matchScore).slice(0,3).map(row=>{
  const source=row.sourceVideo||row.sourcePost||{},raw=short(source.sourceUrl,2000)
  let sourceUrl:string|null=null;try{const url=new URL(raw);if(['http:','https:'].includes(url.protocol))sourceUrl=url.href}catch{}
  return {sourceCreativeId:row.inspirationCreativeId,title:short(source.title||row.scriptContent?.title||row.contentAngle,200)||'创意参考',platform:short(source.platform,80)||null,sourceUrl,matchScore:row.matchScore,matchedTags:(Array.isArray(row.matchedTags)?row.matchedTags:[]).filter((v:unknown)=>typeof v==='string').slice(0,8).map((v:string)=>short(v,80)),referenceAngle:short(row.contentAngle,900),sourceRevision:short(row.sourceRevision,400)||null,popularityStatus:'unverified' as const}
 })
}
/** Retrieval is mandatory for strategy, but unavailable evidence never blocks the plan. */
export async function searchPlanningCreatives(facts:any,workspace:any,startMonth:string,match=matchPromotionStrategyCreativeCandidates):Promise<PlanningCreativeSearch>{
 const brief=planningCreativeBrief(facts,workspace),queryDigest=createHash('sha256').update(JSON.stringify(brief)).digest('hex'),retrievedAt=new Date().toISOString()
 const base={retrievedAt,queryDigest,contentMatchRequestId:null,libraryVersions:{},candidates:[],dailyNotice:CREATIVE_DAILY_NOTICE}
 try{
  const response=await match({merchantId:facts.id,merchantName:brief.brand,merchantCategory:brief.category,market:facts.knowledge?.market||facts.location||undefined,promotionPointId:`strategy-${startMonth}-${queryDigest.slice(0,20)}`,promotionGoal:'按品牌定位、产品卖点、客群和消费场景匹配创意库中的热门案例；优先相关性、真实来源和可借鉴的内容角度，不生成品牌脚本。',sellingPoint:JSON.stringify(brief).slice(0,6000),requestedCandidateCount:8,requirePersistedCreative:true,platforms:brief.platforms.length?brief.platforms:['instagram','xiaohongshu','tiktok'],diversify:true})
  const candidates=planningCreativeReferences(response.creativeCandidates)
  const failed=(response.contentLibraryGaps||[]).some((v:any)=>Number(v.status)>=400)
  return {...base,status:candidates.length?'available':failed?'unavailable':'empty',contentMatchRequestId:response.contentMatchRequestId||null,libraryVersions:response.libraryVersions||{},candidates,limitations:[...(!candidates.length?[failed?'创意检索暂不可用，保留现有策略；稍后重试。':'本次没有足够匹配的来源，暂不推荐。']:[]),'匹配分用于相关性排序，不代表播放量、热度或成功概率；未取得热度证据的来源不标为已验证热门。']}
 }catch{return {...base,status:'unavailable',limitations:['创意检索暂不可用，现有方案仍可使用；不能把未检索到写成创意库为空。']}}
}
