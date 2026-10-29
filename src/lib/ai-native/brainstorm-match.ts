export const BRAINSTORM_KEYWORD_POLICY='fixed-keywords-v1'
const text=(v:unknown,max=5000)=>typeof v==='string'?v.trim().slice(0,max):''
/** Only confirmed application facts, never research excerpts or AI strategy proposals. */
export function brainstormTagContext(facts:any,keywords:string){
 return {brandId:facts?.id,name:text(facts?.name,200),industry:text(facts?.industry,200),description:text(facts?.description),features:text(facts?.knowledge?.productAssumptions,3000),services:text(facts?.knowledge?.promotionFocus,3000),keywords:text(keywords,300),products:(facts?.productCatalog||[]).slice(0,24).map((p:any)=>({name:text(p.name,160),description:text(p.description,400),tags:Array.isArray(p.tags)?p.tags.filter((t:unknown)=>typeof t==='string').slice(0,6).map((t:string)=>text(t,40)):[]}))}
}
/** Content owns decomposition and canonical IDs for interactive searches and scrolling. */
export function brainstormMatchRequest(facts:any,keywords:string,requestId:string,excluded:string[],directionCounts?:Record<string,number>){
 return {matchingMode:'fixed-keywords',merchantId:facts.id,merchantName:facts.name,merchantCategory:facts.industry||'',promotionPointId:requestId,
  brandTagContext:brainstormTagContext(facts,keywords),
  promotionGoal:'寻找适合品牌的原创意，保留原脚本供创意浏览，不改写脚本。'+(keywords?` 匹配主题关键词：${JSON.stringify(keywords)}。`:''),
  sellingPoint:[keywords,facts.name,facts.description,...(facts.productCatalog||[]).slice(0,8).map((s:any)=>s.name)].filter(Boolean).join('；').slice(0,4000),
  requestedCandidateCount:8,requirePersistedCreative:true,excludeCreativeIds:excluded,
  platforms:['instagram','tiktok','xiaohongshu'],diversify:true,diversityMode:'prefer',...(directionCounts?{directionCounts}:{})}
}
